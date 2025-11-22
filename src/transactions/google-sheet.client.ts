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
   * Get existing sheet structure and headers
   */
  async getSheetStructure(sheetName: string): Promise<any> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!1:5`, // Get first 5 rows to see structure
      });

      console.log(`📋 Sheet ${sheetName} structure:`);
      if (response.data.values) {
        response.data.values.forEach((row, index) => {
          console.log(`   Row ${index + 1}:`, row);
        });
      } else {
        console.log(`   No data found in ${sheetName}`);
      }
      return response.data.values;
    } catch (error) {
      console.log(`⚠️  Could not read ${sheetName} structure: ${error.message}`);
      return null;
    }
  }

  /**
   * List all available sheets in spreadsheet
   */
  async listAllSheets(): Promise<string[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetNames = response.data.sheets?.map(sheet => sheet.properties?.title || 'Unnamed') || [];
      console.log(`📋 Available sheets:`, sheetNames);
      return sheetNames;
    } catch (error) {
      console.log(`⚠️  Could not list sheets: ${error.message}`);
      return [];
    }
  }

  /**
   * Get existing transaction IDs from a sheet
   */
  async getExistingIds(sheetName: string): Promise<Set<string>> {
    try {
      // Use column A for ID in both Auto_input.Stripe and Auto_input.Brex
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`, // ID is in column A for both sheets
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
   * Add transactions to a sheet with proper format mapping
   */
  async addTransactions(sheetName: string, transactions: Transaction[]): Promise<number> {
    if (transactions.length === 0) return 0;

    try {
      let rows: any[];
      
      if (sheetName === 'Auto_input.Stripe') {
        // Map to Stripe format exactly like existing records
        // Only fill columns A-W, leave X+ for formulas
        rows = transactions.map(t => [
          t.id,                                    // A: id
          t.date,                                  // B: Created date (UTC) with time
          t.amount.toFixed(2),                     // C: Amount (with .00)
          '0.00',                                  // D: Amount Refunded
          t.currency.toLowerCase(),                // E: Currency
          t.stripeData?.captured || 'TRUE',        // F: Captured
          t.amount.toFixed(2),                     // G: Converted Amount
          '0.00',                                  // H: Converted Amount Refunded
          t.currency.toLowerCase(),                // I: Converted Currency
          '',                                      // J: Decline Reason
          t.description,                           // K: Description
          t.stripeData?.fee || '0.33',            // L: Fee (from Stripe data)
          '',                                      // M: Refunded date
          'GENERECT, INC.',                        // N: Statement Descriptor
          t.stripeData?.status || 'Paid',          // O: Status (from Stripe data)
          'Payment complete.',                     // P: Seller Message
          '0',                                     // Q: Taxes On Fee
          t.stripeData?.cardId || '',              // R: Card ID (from Stripe data)
          t.stripeData?.customerId || '',          // S: Customer ID (from Stripe data)
          '',                                      // T: Customer Description
          t.stripeData?.customerEmail || 'api_parser@generect.com', // U: Customer Email
          t.stripeData?.invoiceId || '',           // V: Invoice ID (from Stripe data)
          ''                                       // W: Transfer
          // X+ columns (domain, category, accounts, etc.) have formulas - don't overwrite
        ]);
      } else if (sheetName === 'Auto_input.Brex') {
        // Map to Brex format: [Date, To/From, Amount, Memo, ...]
        rows = transactions.map(t => [
          new Date(t.date).toLocaleDateString('en-GB'), // A: Date (dd/mm/yy)
          t.description || 'GENERECT, INC.',             // B: To/From
          t.type === 'expense' ? `-$${t.amount}` : `+$${t.amount}`, // C: Amount with sign
          '',                                             // D: Memo
          t.description,                                  // E: External Memo
          '',                                             // F: Originator Identification
          'Brex',                                         // G: Initiated By
          'Card',                                         // H: Method
          'Finalized',                                    // I: Status
          'TRUE',                                         // J: If Finalized Transaction
          '',                                             // K: empty
          '',                                             // L: empty
          t.category || 'Business Expense',               // M: Accounts
          t.type === 'expense' ? 'Expenses' : 'Income',   // N: Type of Account
          '',                                             // O: empty
          'Bank Account Brex',                            // P: From Account
          t.category || 'Business Expense',               // Q: To Account
          '',                                             // R: empty
          new Date().toLocaleDateString('en-GB').replace(/\//g, ''), // S: Дата Cash Method
          new Date().toLocaleDateString('en-GB').replace(/\//g, '')  // T: Дата Accrual Method
        ]);
      } else {
        // Default format
        rows = transactions.map(t => [
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
      }

      // Find the last row to append after
      const existingData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const lastRow = (existingData.data.values?.length || 0) + 1;
      
      // Determine range based on sheet type
      let range: string;
      if (sheetName === 'Auto_input.Stripe') {
        // Stripe only write A to W (23 columns), X+ have formulas
        range = `${sheetName}!A${lastRow}:W${lastRow + transactions.length - 1}`;
      } else if (sheetName === 'Auto_input.Brex') {
        // Brex has 20 columns (A to T)
        range = `${sheetName}!A${lastRow}:T${lastRow + transactions.length - 1}`;
      } else {
        // Default 9 columns
        range = `${sheetName}!A${lastRow}:I${lastRow + transactions.length - 1}`;
      }

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