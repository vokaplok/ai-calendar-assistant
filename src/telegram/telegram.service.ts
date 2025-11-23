import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { LlmService } from '../llm/llm.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarOrchestratorService } from '../calendar/calendar-orchestrator.service';
import { MemoryService } from '../memory/memory.service';
import { TransactionSyncService } from '../transactions/transaction-sync.service';
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
    private transactionSyncService: TransactionSyncService,
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
        '/transactions - Run manual transaction sync\n' +
        '/debug_dates - Debug date parsing in Google Sheets\n\n' +
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
          '🔐 **Підключення Google Calendar**\n\n' +
          '📋 Натисніть на посилання нижче щоб надати доступ до календаря:\n\n' +
          `${authUrl}\n\n` +
          '✅ **Що далі:**\n' +
          '1. Натисніть на посилання вище\n' +
          '2. Виберіть ваш Google акаунт\n' +
          '3. Надайте дозвіл на доступ до календаря\n' +
          '4. Поверніться сюди і спробуйте створити подію!\n\n' +
          '💡 Це одноразова настройка - ваші токени будуть збережені.\n\n' +
          '🔒 Ваші дані в безпеці та використовуються тільки для роботи з календарем.',
          { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
        );
        console.log(`📧 Auth URL sent to user ${ctx.from?.id}`);
      } catch (error) {
        console.error('❌ Error generating auth URL:', error);
        await ctx.reply('❌ Помилка при генерації посилання авторизації. Спробуйте ще раз.');
      }
    });

    this.bot.command('status', async (ctx) => {
      try {
        console.log(`📊 Status check requested by user ${ctx.from?.id}`);
        const authResult = await this.calendarService.checkAuthentication();
        const lastError = this.calendarService.getLastError();

        let authMessage = '';

        if (authResult.isAuthenticated) {
          authMessage = '✅ **Google Calendar підключено**\n\n' +
            'Ваш календар працює нормально!\n\n' +
            '💡 Спробуйте:\n' +
            '• "створи подію на 19:00 теніс"\n' +
            '• "забукай 2 зустрічі на завтра: Іван о 14:00 та Марія о 15:00"';

          // Show warning if there was a recent error
          if (lastError && (new Date().getTime() - lastError.timestamp.getTime()) < 300000) { // Last 5 minutes
            authMessage += `\n\n⚠️ **Виявлена недавня проблема:**\n${lastError.message}\n_(${lastError.timestamp.toLocaleString()})_`;
          }

          console.log('   ✅ Calendar connected');
        } else {
          authMessage = '❌ **Проблема з підключенням календаря**\n\n';

          if (authResult.error) {
            authMessage += `**Проблема:** ${authResult.error}\n\n`;
          } else {
            authMessage += '**Проблема:** Не підключено до Google Calendar\n\n';
          }

          authMessage += '**Рішення:** Використайте /auth щоб підключити календар.';

          // Add error type for debugging
          if (authResult.errorType) {
            authMessage += `\n\n🔧 Тип помилки: \`${authResult.errorType}\``;
          }

          console.warn(`   ⚠️ Calendar not connected: ${authResult.errorType || 'unknown'}`);
        }

        await ctx.reply(authMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('❌ Error checking authentication:', error);
        await ctx.reply(
          '❌ **Помилка перевірки статусу**\n\n' +
          `**Деталі:** ${error.message}\n\n` +
          '🔧 Перевірте логи або спробуйте /auth для повторного підключення.',
          { parse_mode: 'Markdown' }
        );
      }
    });

    this.bot.command('debug_dates', async (ctx) => {
      try {
        await ctx.reply('🔍 **Debug: Checking date parsing**\n\nAnalyzing latest dates in Google Sheets...');
        
        // Get latest date info from Google Sheets for both sources
        await this.transactionSyncService.initialize();
        
        // First, check basic Google Sheets connection
        const sheetClient = this.transactionSyncService['sheetClient'];
        
        let debugInfo = '🔗 **Google Sheets Connection:**\n';
        debugInfo += `• Spreadsheet ID: ${sheetClient['spreadsheetId'] ? 'configured' : 'missing'}\n`;
        debugInfo += `• Sheets client: ${sheetClient['sheets'] ? 'initialized' : 'not initialized'}\n\n`;
        
        // Check what sheets exist
        try {
          const sheetsInfo = await sheetClient['sheets'].spreadsheets.get({
            spreadsheetId: sheetClient['spreadsheetId']
          });
          
          debugInfo += '📋 **Available sheets:**\n';
          sheetsInfo.data.sheets?.forEach(sheet => {
            debugInfo += `• ${sheet.properties?.title}\n`;
          });
          debugInfo += '\n';
        } catch (error) {
          debugInfo += `❌ Failed to get sheets list: ${error.message}\n\n`;
        }
        
        // Check raw data from sheets
        for (const sheetName of ['Auto_input.Brex', 'Auto_input.Stripe']) {
          debugInfo += `🔍 **Checking ${sheetName}:**\n`;
          try {
            const response = await sheetClient['sheets'].spreadsheets.values.get({
              spreadsheetId: sheetClient['spreadsheetId'],
              range: `${sheetName}!A1:C5`, // Just first 5 rows
            });
            const values = response.data.values || [];
            debugInfo += `• Total rows retrieved: ${values.length}\n`;
            if (values.length > 0) {
              debugInfo += `• Header: [${values[0]?.join(', ') || 'empty'}]\n`;
              if (values.length > 1) {
                debugInfo += `• First data row: [${values[1]?.join(', ') || 'empty'}]\n`;
              }
            }
          } catch (error) {
            debugInfo += `• ❌ Error: ${error.message}\n`;
          }
          debugInfo += '\n';
        }
        
        // Check Brex latest date
        const brexLatestInfo = await sheetClient.getLatestTransactionInfo('Auto_input.Brex');
        const stripeLatestInfo = await sheetClient.getLatestTransactionInfo('Auto_input.Stripe');
        
        debugInfo += `🟦 **Brex parsing result:**\n`;
        debugInfo += `• Latest date: ${brexLatestInfo.latestDate ? brexLatestInfo.latestDate.toLocaleDateString() : 'none'}\n`;
        debugInfo += `• Transactions on latest date: ${brexLatestInfo.existingFromLatestDate.length}\n\n`;
        
        debugInfo += `🟩 **Stripe parsing result:**\n`;
        debugInfo += `• Latest date: ${stripeLatestInfo.latestDate ? stripeLatestInfo.latestDate.toLocaleDateString() : 'none'}\n`;
        debugInfo += `• Transactions on latest date: ${stripeLatestInfo.existingFromLatestDate.length}\n\n`;
        
        debugInfo += `🕐 **Current time:** ${new Date().toISOString()}`;
        
        await ctx.reply(debugInfo, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error in /debug_dates command:', error);
        await ctx.reply(`❌ Debug failed: ${error.message}`);
      }
    });

    this.bot.command('transactions', async (ctx) => {
      try {
        await ctx.reply('🔄 **Manual Transaction Update**\n\nStarting manual transaction sync...');
        
        // Execute transaction sync
        const result = await this.runTransactionSync();
        
        if (result.success) {
          let summary = `📊 **Sync Results:**\n• Total processed: ${result.data.totalProcessed}\n• New transactions: ${result.data.newTransactions}`;
          
          // Add detailed breakdown by source
          if (result.data.details && result.data.details.length > 0) {
            summary += '\n\n📋 **Details by source:**';
            result.data.details.forEach(detail => {
              summary += `\n• ${detail.source}: ${detail.new} new, ${detail.total} total`;
              if (detail.latestDate) {
                summary += ` (latest: ${detail.latestDate})`;
              }
            });
          }
          
          if (result.data.errors.length > 0) {
            summary += `\n\n⚠️ **Errors:** ${result.data.errors.length}`;
            result.data.errors.slice(0, 3).forEach(error => {
              summary += `\n• ${error}`;
            });
            if (result.data.errors.length > 3) {
              summary += `\n• ... and ${result.data.errors.length - 3} more`;
            }
          }
          
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
            console.warn(`   ⚠️ Calendar operation blocked - not authenticated`);
            await ctx.reply(
              '⚠️ **Календар не підключено**\n\n' +
              `${authResult.error || 'Не підключено до Google Calendar'}\n\n` +
              '💡 Використайте /auth щоб підключити календар, потім спробуйте знову.',
              { parse_mode: 'Markdown' }
            );
            return;
          }
        }

        // Show initial status message based on message content
        const statusMessage = this.getStatusMessage(userMessage);
        const statusMsg = await ctx.reply(statusMessage);

        console.log(`\n📨 [Telegram] New message from user ${userId}`);
        console.log(`   Message: "${userMessage}"`);

        // Extract and store memories from the user message
        console.log('🧠 Extracting memories...');
        const extractedMemories = await this.memoryService.extractAndStoreMemories(userMessage, userId);
        if (extractedMemories.length > 0) {
          console.log(`   ✅ Extracted ${extractedMemories.length} memories`);
        } else {
          console.log('   No new memories extracted');
        }

        // Build conversation context with relevant memories
        console.log('🔍 Building conversation context...');
        const conversationContext = await this.memoryService.buildConversationContext(userMessage, userId);
        console.log(`   Found ${conversationContext.relevantMemories.length} relevant memories`);

        // Use LLM function calling to plan and execute with memory context
        console.log('🎯 Planning actions with LLM...');
        const plan = await this.llmService.planAndExecuteWithContext(userMessage, conversationContext);

        // Debug logging
        console.log(`📋 Plan generated: ${plan.functionCalls.length} function call(s)`);
        plan.functionCalls.forEach((call, i) => {
          console.log(`   ${i + 1}. ${call.name}(${Object.keys(call.arguments).join(', ')})`);
        });
        
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
        console.log(`⚙️ Executing ${plan.functionCalls.length} function(s)...`);
        const functionResults = [];

        for (let i = 0; i < plan.functionCalls.length; i++) {
          const functionCall = plan.functionCalls[i];

          console.log(`   ${i + 1}/${plan.functionCalls.length} Executing: ${functionCall.name}...`);

          // Update status for each function execution
          await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined,
            `${this.getFunctionStatusEmoji(functionCall.name)} ${this.getFunctionStatusText(functionCall.name)} (${i + 1}/${plan.functionCalls.length})...`);

          try {
            const result = await this.orchestratorService.executeFunction(functionCall);
            functionResults.push({
              function: functionCall.name,
              ...result
            });
            console.log(`   ✅ ${functionCall.name} completed:`, result.success ? 'success' : 'failed');
          } catch (error) {
            console.error(`   ❌ Error executing ${functionCall.name}:`, error.message);
            functionResults.push({
              function: functionCall.name,
              success: false,
              error: error.message
            });
          }
        }

        // Generate natural language response with memory context
        console.log('💬 Generating final response...');
        const response = await this.llmService.generateResponseWithContext(userMessage, functionResults, conversationContext);
        console.log(`   Response ready (${response.length} chars)`);

        // Replace the processing message with the final response
        await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, response);
        console.log('✅ [Telegram] Message processing completed\n');
        
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
    try {
      console.log('🚀 Starting transaction sync using integrated service...');
      
      // Run the sync using the integrated service
      const results = await this.transactionSyncService.syncAll();
      
      // Format results for the summary
      const summary = this.transactionSyncService.printSummary(results);
      
      // Add detailed information for debugging
      const details = results.map(r => ({
        source: r.source,
        new: r.new,
        total: r.total,
        latestDate: r.latestDate || null,
        errors: r.errors || []
      }));
      
      console.log('📊 Detailed sync results:', details);
      
      return {
        success: true,
        data: {
          sources: results.map(r => r.source),
          totalProcessed: results.reduce((sum, r) => sum + r.total, 0),
          newTransactions: results.reduce((sum, r) => sum + r.new, 0),
          errors: results.filter(r => r.errors && r.errors.length > 0).flatMap(r => r.errors),
          details: details,
          summary
        }
      };
    } catch (error) {
      console.error('❌ Transaction sync failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
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