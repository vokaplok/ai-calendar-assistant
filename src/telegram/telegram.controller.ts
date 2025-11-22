import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TransactionSyncService } from '../transactions/transaction-sync.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private configService: ConfigService,
    private transactionSyncService: TransactionSyncService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('webhook')
  async webhook(@Body() body: any, @Headers('x-telegram-bot-api-secret-token') secretToken?: string) {
    // Verify webhook secret if configured
    const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new Error('Unauthorized webhook request');
    }

    // Process the update through Telegraf
    const bot = this.telegramService.getBot();
    await bot.handleUpdate(body);
    
    return { ok: true };
  }

  @Get('test-transactions')
  async testTransactions() {
    try {
      console.log('🧪 Testing transaction sync via HTTP endpoint...');
      
      // Test connections first
      const connectionResults = await this.transactionSyncService.testConnections();
      
      // Try to run sync
      const syncResults = await this.transactionSyncService.syncAll();
      const summary = this.transactionSyncService.printSummary(syncResults);
      
      return {
        status: 'success',
        connectionTest: connectionResults,
        syncResults,
        summary,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Transaction test failed:', error);
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}