import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { LlmService } from '../llm/llm.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarOrchestratorService } from '../calendar/calendar-orchestrator.service';
import { MemoryService } from '../memory/memory.service';
import { ParsedEvent, UserIntent } from '../common/types';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;
  
  constructor(
    private configService: ConfigService,
    private llmService: LlmService,
    private calendarService: CalendarService,
    private orchestratorService: CalendarOrchestratorService,
    private memoryService: MemoryService,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    this.bot = new Telegraf(botToken);
    this.setupHandlers();
  }

  async onModuleInit() {
    // Launch bot asynchronously without blocking module initialization
    this.launchBotAsync();
  }
  
  private async launchBotAsync() {
    try {
      await this.bot.launch();
      console.log('Telegram bot launched successfully');
    } catch (error) {
      console.warn('Failed to launch Telegram bot:', error.message);
      console.log('HTTP endpoints are still available for testing');
    }
  }

  private setupHandlers() {
    this.bot.start((ctx) => {
      ctx.reply(
        '🤖 Welcome to AI Calendar Assistant!\n\n' +
        'Send me natural language commands to manage your calendar:\n' +
        '• "create event for 7pm called Tennis"\n' +
        '• "schedule meeting tomorrow at 3pm with John"\n' +
        '• "add lunch at 12:30pm"\n\n' +
        'Type /help for more information.'
      );
    });

    this.bot.help((ctx) => {
      ctx.reply(
        '📝 Available commands:\n\n' +
        '/start - Get started\n' +
        '/help - Show this help message\n\n' +
        '💬 Text commands:\n' +
        'Just type natural language like:\n' +
        '• "create event for 7pm called Tennis"\n' +
        '• "schedule meeting tomorrow at 3pm"\n' +
        '• "add dentist appointment Friday 2pm"\n\n' +
        'The bot will parse your message and create calendar events automatically!'
      );
    });

    this.bot.on('text', async (ctx) => {
      try {
        const userMessage = ctx.message.text;
        
        // Skip command messages
        if (userMessage.startsWith('/')) {
          return;
        }

        await ctx.reply('🔍 Processing your request...');
        
        const userId = ctx.from?.id?.toString() || 'default';
        
        // Extract and store memories from the user message
        const extractedMemories = await this.memoryService.extractAndStoreMemories(userMessage, userId);
        if (extractedMemories.length > 0) {
          console.log(`Extracted ${extractedMemories.length} memories from user message`);
        }

        // Build conversation context with relevant memories
        const conversationContext = await this.memoryService.buildConversationContext(userMessage, userId);
        
        // Use LLM function calling to plan and execute with memory context
        const plan = await this.llmService.planAndExecuteWithContext(userMessage, conversationContext);
        
        if (plan.functionCalls.length === 0) {
          await ctx.reply('❌ I couldn\'t understand your request. Try asking about your schedule, creating events, or finding free time.');
          return;
        }

        // Execute all function calls
        const functionResults = [];
        
        for (const functionCall of plan.functionCalls) {
          try {
            const result = await this.orchestratorService.executeFunction(functionCall);
            functionResults.push({
              function: functionCall.name,
              ...result
            });
          } catch (error) {
            console.error(`Error executing ${functionCall.name}:`, error);
            functionResults.push({
              function: functionCall.name,
              success: false,
              error: error.message
            });
          }
        }

        // Generate natural language response with memory context
        const response = await this.llmService.generateResponseWithContext(userMessage, functionResults, conversationContext);
        
        await ctx.reply(response);
        
      } catch (error) {
        console.error('Error processing message:', error);
        await ctx.reply(
          '❌ Sorry, something went wrong. Please try again or contact support.'
        );
      }
    });
  }

  getBot() {
    return this.bot;
  }
}