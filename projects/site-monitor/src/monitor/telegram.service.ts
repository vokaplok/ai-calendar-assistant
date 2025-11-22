import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;
  private chatId: string;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');

    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not provided');
      return;
    }

    if (!this.chatId) {
      this.logger.error('TELEGRAM_CHAT_ID is not provided');
      return;
    }

    this.bot = new Telegraf(token);
    this.logger.log('Telegram service initialized');
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.bot || !this.chatId) {
      this.logger.error('Telegram bot is not configured properly');
      return;
    }

    try {
      await this.bot.telegram.sendMessage(this.chatId, message, {
        parse_mode: 'HTML'
      });
      this.logger.log('Telegram message sent successfully');
    } catch (error) {
      this.logger.error('Failed to send Telegram message', error);
    }
  }

  async sendAlert(url: string, availableSlots: string[]): Promise<void> {
    const message = `
🎯 <b>Time Slots Available!</b>

📍 URL: ${url}
⏰ Available slots:
${availableSlots.map(slot => `• ${slot}`).join('\n')}

🔔 Detected at: ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' })}
`;

    await this.sendMessage(message);
  }
}