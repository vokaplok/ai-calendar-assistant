import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { TelegramService } from './telegram.service';

interface TimeSlot {
  time: string;
  available: boolean;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);
  private readonly monitorUrl: string;
  private readonly checkInterval: number;
  private lastAvailableSlots: string[] = [];

  constructor(
    private configService: ConfigService,
    private telegramService: TelegramService,
  ) {
    this.monitorUrl = this.configService.get<string>('MONITOR_URL');
    this.checkInterval = parseInt(this.configService.get<string>('CHECK_INTERVAL_MS') || '300000');

    if (!this.monitorUrl) {
      this.logger.error('MONITOR_URL is not configured');
    } else {
      this.logger.log(`Monitoring URL: ${this.monitorUrl}`);
      this.logger.log(`Check interval: ${this.checkInterval}ms`);
    }
  }

  @Cron('*/5 * * * *') // Every 5 minutes
  async checkSite() {
    if (!this.monitorUrl) {
      return;
    }

    try {
      this.logger.log('Checking site for available time slots...');
      const availableSlots = await this.fetchAvailableTimeSlots();

      if (availableSlots.length > 0) {
        const newSlots = availableSlots.filter(
          slot => !this.lastAvailableSlots.includes(slot)
        );

        if (newSlots.length > 0) {
          this.logger.log(`Found ${newSlots.length} new available slots`);
          await this.telegramService.sendAlert(this.monitorUrl, availableSlots);
        }

        this.lastAvailableSlots = availableSlots;
      } else {
        this.logger.log('No available time slots found');
        this.lastAvailableSlots = [];
      }
    } catch (error) {
      this.logger.error('Error checking site:', error.message);
    }
  }

  private async fetchAvailableTimeSlots(): Promise<string[]> {
    try {
      const response = await axios.get(this.monitorUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const availableSlots: string[] = [];

      // Generic selectors - you'll need to customize these based on the actual website
      const timeSlotSelectors = [
        '.time-slot.available',
        '.slot.available',
        '.appointment-slot:not(.disabled)',
        '[data-available="true"]',
        '.booking-slot:not(.booked)',
      ];

      for (const selector of timeSlotSelectors) {
        $(selector).each((_, element) => {
          const $el = $(element);
          const timeText = $el.text().trim() || 
                          $el.attr('data-time') || 
                          $el.find('.time').text().trim();
          
          if (timeText && !availableSlots.includes(timeText)) {
            availableSlots.push(timeText);
          }
        });

        if (availableSlots.length > 0) {
          break; // Stop if we found slots with current selector
        }
      }

      // Fallback: look for any elements containing time-like patterns
      if (availableSlots.length === 0) {
        $('*').each((_, element) => {
          const $el = $(element);
          const text = $el.text().trim();
          
          // Look for time patterns like "14:30", "2:30 PM", etc.
          const timePattern = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[AP]M)?\b/gi;
          const matches = text.match(timePattern);
          
          if (matches) {
            matches.forEach(match => {
              if (!availableSlots.includes(match)) {
                availableSlots.push(match);
              }
            });
          }
        });
      }

      this.logger.log(`Found ${availableSlots.length} potential time slots`);
      return availableSlots;

    } catch (error) {
      this.logger.error('Failed to fetch page:', error.message);
      throw error;
    }
  }

  // Manual trigger for testing
  async manualCheck(): Promise<string[]> {
    return this.fetchAvailableTimeSlots();
  }
}