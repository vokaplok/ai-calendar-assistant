import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { Transaction } from './parsers/base.parser';

@Injectable()
export class GoogleSheetClient {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(private config: ConfigService) {
    this.spreadsheetId = this.config.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID') || '';
  }

  /**
   * Initialize Google Sheets client
   */
  async initialize(): Promise<void> {
    console.log('🔗 Connecting to Google Sheets...');
    
    // Use service account or OAuth credentials
    const auth = new google.auth.GoogleAuth({
      keyFile: this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_KEY_FILE'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    
    console.log('✅ Google Sheets connected');
  }

  /**
   * Test connection to Google Sheets
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.spreadsheetId) {
        console.log('❌ Google Sheets: No spreadsheet ID configured');
        return false;
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      console.log(`✅ Google Sheets: Connected to "${response.data.properties?.title}"`);
      return true;
    } catch (error) {
      console.log(`❌ Google Sheets: ${error.message}`);
      return false;
    }
  }

  /**
   * Get existing transaction IDs from a sheet
   */
  async getExistingIds(sheetName: string): Promise<Set<string>> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`, // Assuming ID is in column A
      });

      const values = response.data.values || [];
      const ids = new Set<string>();
      
      // Skip header row
      for (let i = 1; i < values.length; i++) {
        if (values[i] && values[i][0]) {
          ids.add(values[i][0]);
        }
      }

      return ids;
    } catch (error) {
      console.log(`⚠️  Could not read existing IDs from ${sheetName}: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Add transactions to a sheet
   */
  async addTransactions(sheetName: string, transactions: Transaction[]): Promise<number> {
    if (transactions.length === 0) return 0;

    try {
      // Prepare rows for insertion
      const rows = transactions.map(t => [
        t.id,
        t.date,
        t.amount,
        t.currency,
        t.description,
        t.type,
        t.category || '',
        t.account || '',
        t.reference || ''
      ]);

      // Find the last row to append after
      const existingData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const lastRow = (existingData.data.values?.length || 0) + 1;
      const range = `${sheetName}!A${lastRow}:I${lastRow + transactions.length - 1}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: rows,
        },
      });

      console.log(`✅ Added ${transactions.length} transactions to ${sheetName}`);
      return transactions.length;
    } catch (error) {
      console.error(`❌ Failed to add transactions to ${sheetName}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Ensure sheet exists with proper headers
   */
  async ensureSheetExists(sheetName: string): Promise<void> {
    try {
      // Check if sheet exists
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets?.some(
        sheet => sheet.properties?.title === sheetName
      );

      if (!sheetExists) {
        // Create the sheet
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            }],
          },
        });

        // Add headers
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:I1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              'ID',
              'Date',
              'Amount',
              'Currency',
              'Description',
              'Type',
              'Category',
              'Account',
              'Reference'
            ]],
          },
        });

        console.log(`✅ Created sheet "${sheetName}" with headers`);
      }
    } catch (error) {
      console.error(`❌ Failed to ensure sheet "${sheetName}" exists: ${error.message}`);
    }
  }
}