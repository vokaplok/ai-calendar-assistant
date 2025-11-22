import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { spawn } from 'child_process';
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

    // Start periodic health check (every 5 minutes)
    this.startHealthCheck();
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
        '/help - Show this help message\n' +
        '/auth - Authorize Google Calendar access\n' +
        '/status - Check calendar connection status\n' +
        '/transactions - Run manual transaction sync\n\n' +
        '💬 Text commands:\n' +
        'Just type natural language like:\n' +
        '• "create event for 7pm called Tennis"\n' +
        '• "schedule meeting tomorrow at 3pm"\n' +
        '• "add dentist appointment Friday 2pm"\n' +
        '• "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm"\n\n' +
        'The bot will parse your message and create calendar events automatically!'
      );
    });

    this.bot.command('auth', async (ctx) => {
      try {
        const authUrl = this.calendarService.generateAuthUrl();
        await ctx.reply(
          '🔐 **Google Calendar Authorization**\n\n' +
          '📋 Click the link below to authorize calendar access:\n' +
          `🔗 [Authorize Google Calendar](${authUrl})\n\n` +
          '⚠️ After authorization, you can start creating events!\n\n' +
          '💡 This is a one-time setup - your tokens will be saved securely.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error generating auth URL:', error);
        await ctx.reply('❌ Error generating authorization link. Please try again.');
      }
    });

    this.bot.command('status', async (ctx) => {
      try {
        const authResult = await this.calendarService.checkAuthentication();
        const lastError = this.calendarService.getLastError();

        let authMessage = '';

        if (authResult.isAuthenticated) {
          authMessage = '✅ **Google Calendar Connected**\n\n' +
            'Your calendar is working properly!\n\n' +
            '💡 Try:\n' +
            '• "create event for 7pm called Tennis"\n' +
            '• "book 2 meetings tomorrow: John at 2pm and Sarah at 3pm"';

          // Show warning if there was a recent error
          if (lastError && (new Date().getTime() - lastError.timestamp.getTime()) < 300000) { // Last 5 minutes
            authMessage += `\n\n⚠️ **Recent Issue Detected:**\n${lastError.message}\n_(${lastError.timestamp.toLocaleString()})_`;
          }
        } else {
          authMessage = '❌ **Calendar Connection Issue**\n\n';

          if (authResult.error) {
            authMessage += `**Problem:** ${authResult.error}\n\n`;
          } else {
            authMessage += '**Problem:** Not authenticated with Google Calendar\n\n';
          }

          authMessage += '**Solution:** Use /auth to connect your Google Calendar.';

          // Add error type for debugging
          if (authResult.errorType) {
            authMessage += `\n\n🔧 Error type: \`${authResult.errorType}\``;
          }
        }

        await ctx.reply(authMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error checking authentication:', error);
        await ctx.reply(
          '❌ **Error checking authentication status**\n\n' +
          `**Details:** ${error.message}\n\n` +
          '🔧 Please check the logs or try /auth to re-authenticate.',
          { parse_mode: 'Markdown' }
        );
      }
    });

    this.bot.command('transactions', async (ctx) => {
      try {
        await ctx.reply('🔄 **Manual Transaction Update**\n\nStarting manual transaction sync...');
        
        // Execute transaction sync
        const result = await this.runTransactionSync();
        
        if (result.success) {
          const summary = this.formatTransactionSummary(result.data);
          await ctx.reply(`✅ **Transaction sync completed!**\n\n${summary}`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`❌ **Transaction sync failed:**\n\n${result.error}`, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error('Error in /transactions command:', error);
        await ctx.reply('❌ Error during transaction sync. Please check logs.');
      }
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

        // Check calendar connection status proactively for calendar operations
        const lowerMessage = userMessage.toLowerCase();
        const isCalendarOperation = lowerMessage.includes('create') ||
                                    lowerMessage.includes('schedule') ||
                                    lowerMessage.includes('add') ||
                                    lowerMessage.includes('delete') ||
                                    lowerMessage.includes('free') ||
                                    lowerMessage.includes('available') ||
                                    lowerMessage.includes('book');

        if (isCalendarOperation) {
          const authResult = await this.calendarService.checkAuthentication();
          if (!authResult.isAuthenticated) {
            await ctx.reply(
              '⚠️ **Calendar Connection Issue**\n\n' +
              `${authResult.error || 'Not authenticated with Google Calendar'}\n\n` +
              '💡 Use /auth to connect your calendar, then try again.',
              { parse_mode: 'Markdown' }
            );
            return;
          }
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
        console.error('❌ Error processing message:', error);
        console.error('   Stack trace:', error.stack);

        // Check if this is a calendar-related error
        const lastCalendarError = this.calendarService.getLastError();
        const isRecentCalendarError = lastCalendarError &&
          (new Date().getTime() - lastCalendarError.timestamp.getTime()) < 10000; // Last 10 seconds

        // Show detailed error to user for debugging
        const errorMessage = error?.message || 'Unknown error';
        let userErrorMessage = `❌ **Something went wrong**\n\n`;

        // Add specific guidance based on error type
        if (isRecentCalendarError) {
          userErrorMessage += `**Calendar Issue:** ${lastCalendarError.message}\n\n`;

          if (lastCalendarError.type === 'token_expired' ||
              lastCalendarError.type === 'unauthorized' ||
              lastCalendarError.type === 'forbidden') {
            userErrorMessage += `💡 **Quick Fix:** Use /auth to reconnect your calendar\n\n`;
          } else if (lastCalendarError.type === 'network_error') {
            userErrorMessage += `💡 **Quick Fix:** Check your internet connection and try again\n\n`;
          }
        } else {
          userErrorMessage += `**Error:** ${errorMessage}\n\n`;
        }

        userErrorMessage += `🔧 **Debug Info:**\n` +
          `• Time: ${new Date().toLocaleString()}\n` +
          `• Your message: "${ctx.message?.text || 'Unknown'}"\n` +
          `• Error type: ${error?.constructor?.name || 'Unknown'}\n\n` +
          `Try using /status to check your connection or /help for available commands.`;

        await ctx.reply(userErrorMessage, { parse_mode: 'Markdown' });
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

  private async runTransactionSync(): Promise<{ success: boolean; data?: any; error?: string }> {
    return new Promise((resolve) => {
      const transactionParserPath = '/Users/andriikolpakov/Desktop/Generect/generect_code/base/tools/projects_render/projects/transaction-parser';
      
      // Run npm start in the transaction-parser directory
      const process = spawn('npm', ['start'], {
        cwd: transactionParserPath,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            data: this.parseTransactionOutput(output)
          });
        } else {
          resolve({
            success: false,
            error: errorOutput || output || `Process exited with code ${code}`
          });
        }
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }

  private parseTransactionOutput(output: string): any {
    const lines = output.split('\n');
    const summary = {
      sources: [],
      totalProcessed: 0,
      newTransactions: 0,
      errors: []
    };

    for (const line of lines) {
      if (line.includes('✅') && line.includes('transactions')) {
        const match = line.match(/(\d+)/);
        if (match) {
          summary.totalProcessed += parseInt(match[1]);
        }
      }
      if (line.includes('new transactions')) {
        const match = line.match(/(\d+)/);
        if (match) {
          summary.newTransactions += parseInt(match[1]);
        }
      }
      if (line.includes('❌') || line.includes('Error')) {
        summary.errors.push(line.trim());
      }
    }

    return summary;
  }

  private formatTransactionSummary(data: any): string {
    const { totalProcessed, newTransactions, errors } = data;
    
    let summary = `📊 **Sync Results:**\n`;
    summary += `• Total processed: ${totalProcessed}\n`;
    summary += `• New transactions: ${newTransactions}\n`;
    
    if (errors.length > 0) {
      summary += `\n⚠️ **Warnings/Errors:**\n`;
      errors.slice(0, 3).forEach((error: string) => {
        summary += `• ${error}\n`;
      });
      if (errors.length > 3) {
        summary += `• ... and ${errors.length - 3} more\n`;
      }
    }

    return summary;
  }

  private startHealthCheck(): void {
    // Check calendar connection health every 5 minutes
    setInterval(async () => {
      try {
        const authResult = await this.calendarService.checkAuthentication();

        if (!authResult.isAuthenticated) {
          console.error(`⚠️ [Health Check] Calendar connection issue: ${authResult.error || 'Not authenticated'}`);
          console.error(`   Error type: ${authResult.errorType || 'unknown'}`);
          console.error(`   Timestamp: ${new Date().toISOString()}`);
        } else {
          console.log('✅ [Health Check] Calendar connection healthy');
        }

        // Check for recent errors
        const lastError = this.calendarService.getLastError();
        if (lastError) {
          const errorAgeMinutes = Math.floor((new Date().getTime() - lastError.timestamp.getTime()) / 60000);
          if (errorAgeMinutes < 10) { // Show recent errors (less than 10 minutes old)
            console.warn(`⚠️ [Health Check] Recent error detected (${errorAgeMinutes} min ago):`);
            console.warn(`   Type: ${lastError.type}`);
            console.warn(`   Message: ${lastError.message}`);
          }
        }
      } catch (error) {
        console.error('❌ [Health Check] Failed to check calendar health:', error.message);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('🏥 Health check monitoring started (checking every 5 minutes)');
  }
}