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
        const userId = ctx.from?.id?.toString() || 'default';
        
        // Skip command messages
        if (userMessage.startsWith('/')) {
          return;
        }

        // Handle confirmation responses (yes/no)
        const confirmationResult = await this.handleConfirmationResponse(userMessage, userId, ctx);
        if (confirmationResult) {
          return;
        }

        // Show initial status message based on message content
        const statusMessage = this.getStatusMessage(userMessage);
        const statusMsg = await ctx.reply(statusMessage);
        
        // Extract and store memories from the user message
        const extractedMemories = await this.memoryService.extractAndStoreMemories(userMessage, userId);
        if (extractedMemories.length > 0) {
          console.log(`Extracted ${extractedMemories.length} memories from user message`);
        }

        // Build conversation context with relevant memories
        const conversationContext = await this.memoryService.buildConversationContext(userMessage, userId);
        
        // Use LLM function calling to plan and execute with memory context
        const plan = await this.llmService.planAndExecuteWithContext(userMessage, conversationContext);
        
        // Debug logging
        console.log('Generated function calls:', JSON.stringify(plan.functionCalls, null, 2));
        console.log('Number of function calls:', plan.functionCalls.length);
        
        if (plan.functionCalls.length === 0) {
          await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, 
            '❌ I couldn\'t understand your request. Try asking about your schedule, creating events, or finding free time.');
          return;
        }

        // Check if any functions require confirmation
        const needsConfirmation = this.checkIfNeedsConfirmation(plan.functionCalls);
        
        if (needsConfirmation) {
          const confirmationResponse = await this.handleConfirmationFlow(userMessage, plan, conversationContext, ctx, statusMsg.message_id);
          return;
        }

        // Execute all function calls without confirmation
        const functionResults = [];
        
        for (let i = 0; i < plan.functionCalls.length; i++) {
          const functionCall = plan.functionCalls[i];
          
          // Update status for each function execution
          await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, 
            `${this.getFunctionStatusEmoji(functionCall.name)} ${this.getFunctionStatusText(functionCall.name)} (${i + 1}/${plan.functionCalls.length})...`);
          
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
        
        // Replace the processing message with the final response
        await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, response);
        
      } catch (error) {
        console.error('Error processing message:', error);
        
        // Show detailed error to user for debugging
        const errorMessage = error?.message || 'Unknown error';
        const userErrorMessage = `❌ Error: ${errorMessage}\n\n` +
          `🔧 Debug info:\n` +
          `• Time: ${new Date().toISOString()}\n` +
          `• Your message: "${ctx.message?.text || 'Unknown'}"\n` +
          `• Error type: ${error?.constructor?.name || 'Unknown'}\n\n` +
          `Please check the logs or try again.`;
        
        await ctx.reply(userErrorMessage);
      }
    });
  }

  getBot() {
    return this.bot;
  }

  private getStatusMessage(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('create') || lowerMessage.includes('schedule') || lowerMessage.includes('add')) {
      return '📅 Creating calendar event...';
    } else if (lowerMessage.includes('free') || lowerMessage.includes('available')) {
      return '🔍 Searching for available time slots...';
    } else if (lowerMessage.includes('delete') || lowerMessage.includes('remove')) {
      return '🗑️ Searching for events to delete...';
    } else if (lowerMessage.includes('plan') || lowerMessage.includes('schedule')) {
      return '📊 Analyzing your schedule...';
    } else if (/^\d+$/.test(userMessage.trim()) || lowerMessage.includes('book') && /\d+/.test(userMessage)) {
      return '📋 Processing your selection...';
    } else if (lowerMessage.includes('when') || lowerMessage.includes('what')) {
      return '🔎 Checking your calendar...';
    } else {
      return '🤖 Understanding your request...';
    }
  }

  private getFunctionStatusEmoji(functionName: string): string {
    const emojiMap: { [key: string]: string } = {
      'create_event': '📅',
      'find_free_slots': '🔍',
      'delete_events': '🗑️',
      'list_events': '📋',
      'check_availability': '⏰',
      'analyze_schedule': '📊',
      'store_memory': '🧠',
      'search_memory': '💭',
      'select_from_list': '📌',
      'check_conflicts': '⚠️'
    };
    return emojiMap[functionName] || '⚙️';
  }

  private getFunctionStatusText(functionName: string): string {
    const textMap: { [key: string]: string } = {
      'create_event': 'Creating calendar event',
      'find_free_slots': 'Finding available time slots',
      'delete_events': 'Deleting matching events',
      'list_events': 'Retrieving your schedule',
      'check_availability': 'Checking calendar availability',
      'analyze_schedule': 'Analyzing schedule patterns',
      'store_memory': 'Storing information',
      'search_memory': 'Searching memories',
      'select_from_list': 'Processing selection',
      'check_conflicts': 'Checking for conflicts'
    };
    return textMap[functionName] || 'Processing function';
  }

  private checkIfNeedsConfirmation(functionCalls: any[]): boolean {
    // Functions that always need confirmation
    const confirmationRequired = ['create_event', 'delete_events', 'select_from_list', 'reschedule_events'];
    
    return functionCalls.some(call => confirmationRequired.includes(call.name));
  }

  private async handleConfirmationFlow(
    userMessage: string, 
    plan: any, 
    conversationContext: any, 
    ctx: any, 
    messageId: number
  ): Promise<void> {
    const userId = ctx.from?.id?.toString() || 'default';
    
    // Generate preview of what will be done
    const preview = await this.generateActionPreview(plan.functionCalls);
    
    await ctx.telegram.editMessageText(ctx.chat!.id, messageId, undefined, 
      `${preview}\n\n🤔 Shall I proceed with this action?\n\nReply "yes" to confirm or "no" to cancel.`);
    
    // Store pending action in memory for confirmation handling
    await this.memoryService.storeMemory({
      content: `Pending confirmation: ${JSON.stringify(plan.functionCalls)}`,
      type: 'conversation_context' as any,
      importance: 9,
      tags: ['pending_confirmation', 'awaiting_response'],
      context: {
        originalMessage: userMessage,
        functionCalls: plan.functionCalls,
        conversationContext,
        messageId,
        chatId: ctx.chat!.id
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minute timeout
    }, userId);
  }

  private async generateActionPreview(functionCalls: any[]): Promise<string> {
    let preview = '📋 **Action Preview:**\n\n';
    
    functionCalls.forEach((call, index) => {
      switch (call.name) {
        case 'create_event':
          const start = new Date(call.arguments.start_time).toLocaleString('en-US', {timeZone: 'Asia/Jerusalem'});
          const end = new Date(call.arguments.end_time).toLocaleString('en-US', {timeZone: 'Asia/Jerusalem'});
          preview += `${index + 1}. 📅 Create "${call.arguments.title}"\n   ⏰ ${start} - ${end}\n`;
          if (call.arguments.location) preview += `   📍 ${call.arguments.location}\n`;
          preview += '\n';
          break;
          
        case 'delete_events':
          preview += `${index + 1}. 🗑️ Delete events containing: "${call.arguments.search_query}"\n\n`;
          break;
          
        case 'select_from_list':
          preview += `${index + 1}. 📌 Book option #${call.arguments.selection_number} from recent list\n\n`;
          break;
          
        default:
          preview += `${index + 1}. ${this.getFunctionStatusEmoji(call.name)} ${this.getFunctionStatusText(call.name)}\n\n`;
      }
    });
    
    return preview;
  }

  private async handleConfirmationResponse(userMessage: string, userId: string, ctx: any): Promise<boolean> {
    const lowerMessage = userMessage.toLowerCase().trim();
    
    // Check if this is a yes/no response
    if (!['yes', 'y', 'no', 'n', 'confirm', 'cancel'].includes(lowerMessage)) {
      return false;
    }

    // Search for pending confirmation in memory
    const pendingSearchResult = await this.memoryService.searchMemories({
      query: 'pending_confirmation',
      type: 'conversation_context' as any,
      maxResults: 1
    }, userId);

    if (pendingSearchResult.entries.length === 0) {
      await ctx.reply('❌ No pending action found to confirm.');
      return true;
    }

    const pendingAction = pendingSearchResult.entries[0];
    const functionCalls = pendingAction.context.functionCalls;

    if (lowerMessage === 'yes' || lowerMessage === 'y' || lowerMessage === 'confirm') {
      // Execute the pending actions
      await ctx.reply('✅ Confirmed! Executing actions...');
      
      const functionResults = [];
      
      for (let i = 0; i < functionCalls.length; i++) {
        const functionCall = functionCalls[i];
        
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

      // Generate response based on execution results
      const response = await this.llmService.generateResponseWithContext(
        pendingAction.context.originalMessage, 
        functionResults, 
        pendingAction.context.conversationContext
      );
      
      await ctx.reply(response);
      
      // Remove the pending action from memory
      await this.memoryService.removeMemory(pendingAction.id);
      
    } else {
      // User canceled
      await ctx.reply('❌ Action canceled. How else can I help you?');
      
      // Remove the pending action from memory
      await this.memoryService.removeMemory(pendingAction.id);
    }

    return true;
  }
}