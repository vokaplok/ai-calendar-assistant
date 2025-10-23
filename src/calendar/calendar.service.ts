import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { ParsedEvent } from '../common/types';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class CalendarService {
  private calendar;
  private oauth2Client;
  private tokensFilePath = path.join(process.cwd(), 'data', 'google-tokens.json');

  constructor(private configService: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URL'),
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    // Load saved tokens on startup
    this.loadSavedTokens();
  }

  generateAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  async exchangeCodeForTokens(code: string) {
    try {
      console.log('Exchanging code for tokens...');
      const result = await this.oauth2Client.getToken(code);
      console.log('OAuth result structure:', result);
      
      const tokens = result.tokens;
      if (!tokens) {
        throw new Error('No tokens received from Google');
      }
      
      console.log('Tokens received successfully');
      this.oauth2Client.setCredentials(tokens);
      
      // Save tokens to persistent storage
      await this.saveTokens(tokens);
      
      return tokens;
    } catch (error) {
      console.error('Token exchange error:', error);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  setTokens(tokens: any) {
    this.oauth2Client.setCredentials(tokens);
  }

  private async loadSavedTokens() {
    try {
      const tokensData = await fs.readFile(this.tokensFilePath, 'utf-8');
      const tokens = JSON.parse(tokensData);
      
      // Check if tokens are still valid (not expired)
      if (tokens.expiry_date && tokens.expiry_date > Date.now()) {
        console.log('Loading saved tokens from storage');
        this.oauth2Client.setCredentials(tokens);
        
        // Set up automatic token refresh
        this.oauth2Client.on('tokens', (newTokens) => {
          if (newTokens.refresh_token) {
            tokens.refresh_token = newTokens.refresh_token;
          }
          if (newTokens.access_token) {
            tokens.access_token = newTokens.access_token;
          }
          if (newTokens.expiry_date) {
            tokens.expiry_date = newTokens.expiry_date;
          }
          
          // Save updated tokens
          this.saveTokens(tokens).catch(error => {
            console.error('Error saving refreshed tokens:', error);
          });
        });
        
        console.log('Google Calendar tokens loaded and auto-refresh enabled');
      } else {
        console.log('Saved tokens are expired, will need re-authentication');
      }
    } catch (error) {
      console.log('No saved tokens found, will need authentication');
    }
  }

  private async saveTokens(tokens: any) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.tokensFilePath);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Save tokens
      await fs.writeFile(this.tokensFilePath, JSON.stringify(tokens, null, 2));
      console.log('Tokens saved to persistent storage');
    } catch (error) {
      console.error('Error saving tokens:', error);
    }
  }

  async createEvent(parsedEvent: ParsedEvent): Promise<any> {
    const timezone = this.configService.get<string>('DEFAULT_TIMEZONE') || 'Asia/Jerusalem';
    const calendarId = this.configService.get<string>('GOOGLE_CALENDAR_DEFAULT_ID') || 'primary';

    // Convert local datetime to proper timezone format
    const startDateTime = this.ensureTimezone(parsedEvent.start, timezone);
    const endDateTime = this.ensureTimezone(parsedEvent.end, timezone);

    const event = {
      summary: parsedEvent.title,
      start: {
        dateTime: startDateTime,
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone,
      },
      location: parsedEvent.location,
      description: parsedEvent.notes,
      extendedProperties: {
        private: {
          source: 'aical-telegram',
          confidence: parsedEvent.confidence.toString(),
        },
      },
    };

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return response.data;
  }

  async listEvents(maxResults = 10, timeMin?: Date, timeMax?: Date) {
    const calendarId = this.configService.get<string>('GOOGLE_CALENDAR_DEFAULT_ID') || 'primary';
    const timezone = this.configService.get<string>('DEFAULT_TIMEZONE') || 'Asia/Jerusalem';

    const params: any = {
      calendarId,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: timezone,
    };

    if (timeMin) {
      params.timeMin = timeMin.toISOString();
    } else {
      params.timeMin = new Date().toISOString();
    }

    if (timeMax) {
      params.timeMax = timeMax.toISOString();
    }

    const response = await this.calendar.events.list(params);
    return response.data.items || [];
  }

  async getEventsForTimeRange(startTime: Date, endTime: Date) {
    const events = await this.listEvents(50, startTime, endTime);
    return events.filter(event => {
      if (!event.start?.dateTime || !event.end?.dateTime) return false;
      
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      
      // Check if there's any overlap
      return eventStart < endTime && eventEnd > startTime;
    });
  }

  async checkAvailability(startTime: Date, endTime: Date): Promise<boolean> {
    const events = await this.getEventsForTimeRange(startTime, endTime);
    return events.length === 0;
  }

  async findFreeSlots(date: Date, durationMinutes: number = 60, workingHoursStart = 9, workingHoursEnd = 18): Promise<{ start: Date, end: Date }[]> {
    const dayStart = new Date(date);
    dayStart.setHours(workingHoursStart, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(workingHoursEnd, 0, 0, 0);

    console.log(`Finding free slots for ${date.toDateString()} from ${workingHoursStart}:00 to ${workingHoursEnd}:00`);
    
    const events = await this.getEventsForTimeRange(dayStart, dayEnd);
    console.log(`Found ${events.length} existing events for the day`);
    
    // Log existing events for debugging
    events.forEach(event => {
      const start = new Date(event.start!.dateTime!);
      const end = new Date(event.end!.dateTime!);
      console.log(`  - ${event.summary}: ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}`);
    });
    
    // Sort events by start time
    events.sort((a, b) => new Date(a.start!.dateTime!).getTime() - new Date(b.start!.dateTime!).getTime());

    const freeSlots: { start: Date, end: Date }[] = [];
    const slotDurationMs = durationMinutes * 60 * 1000;
    const intervalMs = 30 * 60 * 1000; // 30-minute intervals

    // Generate all possible time slots and check each one
    for (let currentTime = new Date(dayStart); 
         currentTime.getTime() + slotDurationMs <= dayEnd.getTime(); 
         currentTime = new Date(currentTime.getTime() + intervalMs)) {
      
      const slotEnd = new Date(currentTime.getTime() + slotDurationMs);
      
      // Check if this slot conflicts with any existing event
      let hasConflict = false;
      
      for (const event of events) {
        const eventStart = new Date(event.start!.dateTime!);
        const eventEnd = new Date(event.end!.dateTime!);
        
        // Check for overlap: slot overlaps with event if slot_start < event_end AND slot_end > event_start
        if (currentTime < eventEnd && slotEnd > eventStart) {
          hasConflict = true;
          console.log(`  ❌ Slot ${currentTime.toLocaleTimeString()}-${slotEnd.toLocaleTimeString()} conflicts with ${event.summary}`);
          break;
        }
      }
      
      if (!hasConflict) {
        freeSlots.push({
          start: new Date(currentTime),
          end: slotEnd
        });
        console.log(`  ✅ Free slot: ${currentTime.toLocaleTimeString()}-${slotEnd.toLocaleTimeString()}`);
      }
    }

    console.log(`Found ${freeSlots.length} free slots of ${durationMinutes} minutes`);
    return freeSlots;
  }

  async deleteEvent(eventId: string) {
    const calendarId = this.configService.get<string>('GOOGLE_CALENDAR_DEFAULT_ID') || 'primary';
    
    await this.calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  private ensureTimezone(dateTime: string, timezone: string): string {
    // If datetime already has timezone info, return as is
    if (dateTime.includes('T') && (dateTime.includes('+') || dateTime.includes('Z'))) {
      return dateTime;
    }

    // If it's just date-time without timezone, treat as local time in specified timezone
    if (dateTime.includes('T')) {
      return dateTime; // Google Calendar API will use the timeZone field
    }

    // If it's just a date, add time
    return `${dateTime}T00:00:00`;
  }
}