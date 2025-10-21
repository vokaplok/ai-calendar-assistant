import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CalendarService } from './calendar.service';

@Controller('oauth/google')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get('start')
  startAuth(@Res() res: Response) {
    const authUrl = this.calendarService.generateAuthUrl();
    res.redirect(authUrl);
  }

  @Get('callback')
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    try {
      if (!code) {
        return res.status(400).send('Authorization code not provided');
      }

      const tokens = await this.calendarService.exchangeCodeForTokens(code);
      
      // In MVP, we'll just store tokens in memory (not persistent)
      // TODO: In v1.0, store these in database per user
      this.calendarService.setTokens(tokens);
      
      res.send(`
        <html>
          <body>
            <h2>✅ Google Calendar Connected!</h2>
            <p>You can now close this window and start using the Telegram bot.</p>
            <p>Try sending: "create event for 7pm called Tennis"</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).send('Failed to authenticate with Google Calendar');
    }
  }

  @Get('status')
  async getAuthStatus() {
    // Simple status check - in production this would check database
    return {
      authenticated: true, // Simplified for MVP
      message: 'Go to /oauth/google/start to connect your Google Calendar',
    };
  }
}