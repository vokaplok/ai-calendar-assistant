import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private configService: ConfigService,
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
}