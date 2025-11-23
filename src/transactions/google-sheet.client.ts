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
   * Format date and time for Google Sheets without T and Z
   * Example: "2023-07-27 09:29:13"
   */
  private formatDateTimeForSheets(date: Date | string): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString().replace('T', ' ').slice(0, 19);
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
   * Get latest transaction date and existing transactions from that date onwards for deduplication
   */
  async getLatestTransactionInfo(sheetName: string): Promise<{latestDate: Date | null, existingFromLatestDate: Array<{date: string, amount: string, description: string}>}> {
    try {
      if (sheetName === 'Auto_input.Brex') {
        // Get columns A (date), B (description), C (amount)
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A:C`,
        });

        const values = response.data.values || [];
        let latestDate: Date | null = null;
        const allExistingData: Array<{date: string, amount: string, description: string, actualDate: Date}> = [];
        
        // Skip header row and collect all transaction data with parsed dates
        for (let i = 1; i < values.length; i++) {
          if (values[i] && values[i][0] && values[i][1] && values[i][2]) {
            const dateStr = values[i][0]?.trim() || '';
            
            // Parse dd/mm/yy format to Date object
            const [day, month, year] = dateStr.split('/').map(num => parseInt(num, 10));
            if (day && month && year) {
              const fullYear = year < 50 ? 2000 + year : 1900 + year; // Handle 2-digit year
              const actualDate = new Date(fullYear, month - 1, day); // month is 0-based
              
              if (!isNaN(actualDate.getTime())) {
                allExistingData.push({
                  date: dateStr,
                  description: values[i][1]?.trim() || '',
                  amount: values[i][2]?.trim() || '',
                  actualDate: actualDate
                });
                
                // Track the latest date
                if (!latestDate || actualDate > latestDate) {
                  latestDate = actualDate;
                }
              }
            }
          }
        }
        
        // Filter transactions from the latest date onwards
        const existingFromLatestDate = allExistingData
          .filter(item => latestDate && item.actualDate.toDateString() === latestDate.toDateString())
          .map(item => ({
            date: item.date,
            description: item.description,
            amount: item.amount
          }));
        
        console.log(`📋 Found latest date: ${latestDate?.toLocaleDateString('en-GB') || 'none'}`);
        console.log(`📋 Found ${existingFromLatestDate.length} existing transactions from latest date`);
        
        return {
          latestDate,
          existingFromLatestDate
        };
      }
      
      return { latestDate: null, existingFromLatestDate: [] };
    } catch (error) {
      console.log(`⚠️  Could not read transaction data from ${sheetName}: ${error.message}`);
      return { latestDate: null, existingFromLatestDate: [] };
    }
  }

  /**
   * Get existing transaction IDs from a sheet (legacy method for Stripe)
   */
  async getExistingIds(sheetName: string): Promise<Set<string>> {
    try {
      if (sheetName === 'Auto_input.Stripe') {
        // Stripe uses column A for ID
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A:A`,
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
      } else if (sheetName === 'Auto_input.Brex') {
        // For Brex, use External Memo (column E) as primary identifier
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!E:E`, // Get only External Memo column
        });

        const values = response.data.values || [];
        const ids = new Set<string>();
        
        // Skip header row and collect all external memos (Brex IDs)
        for (let i = 1; i < values.length; i++) {
          if (values[i] && values[i][0]) {
            const externalMemo = values[i][0].trim();
            if (externalMemo) {
              ids.add(externalMemo);
            }
          }
        }
        console.log(`📋 Found ${ids.size} existing Brex transaction IDs in sheet`);
        return ids;
      }
      
      return new Set();
    } catch (error) {
      console.log(`⚠️  Could not read existing IDs from ${sheetName}: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Get the last row with data in column A
   */
  async getLastRowWithData(sheetName: string): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const values = response.data.values || [];
      // Find last non-empty row in column A
      let lastRow = 0;
      for (let i = 0; i < values.length; i++) {
        if (values[i] && values[i][0]) {
          lastRow = i + 1; // Sheets are 1-indexed
        }
      }
      
      console.log(`📍 Last row with data in ${sheetName}: ${lastRow}`);
      return lastRow;
    } catch (error) {
      console.log(`⚠️  Could not find last row in ${sheetName}: ${error.message}`);
      return 1; // Default to row 1 if error
    }
  }

  /**
   * Format amount with thousand separators
   */
  private formatAmountWithCommas(amount: number): string {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
          this.formatDateTimeForSheets(t.date),    // B: Created date (UTC) with time - formatted as "YYYY-MM-DD HH:mm:ss"
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
        // Map to Brex format: Only columns A-J, not K+ (those have formulas)
        rows = transactions.map(t => {
          // Format date as dd/mm/yy
          const dateObj = new Date(t.date);
          
          // Debug date formatting
          if (isNaN(dateObj.getTime())) {
            console.log(`❌ Invalid date in transaction:`, t.date, 'for transaction:', t.id);
            return null; // Skip invalid transactions
          }
          
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = String(dateObj.getFullYear()).slice(-2);
          const formattedDate = `${day}/${month}/${year}`;
          
          // Format amount with proper sign and thousand separators
          const amountSign = t.type === 'income' ? '' : '-';
          const amountValue = amountSign + this.formatAmountWithCommas(t.amount);
          
          // For Card transactions: use originalDescription as To/From if available, otherwise use description
          // For other transactions: use memo as To/From if available, otherwise use description
          let toFrom;
          if (t.account === 'Brex Card') {
            toFrom = t.brexData?.originalDescription || t.description || 'GENERECT, INC.';
          } else if (t.memo) {
            toFrom = t.memo; // For non-card transactions, use memo if available
          } else {
            toFrom = t.description || 'GENERECT, INC.';
          }
          
          // For Card transactions: show originalDescription in memo if available
          // For other transactions: show memo if exists
          const memoField = t.account === 'Brex Card' ? 
                           (t.brexData?.originalDescription || '') : 
                           (t.memo || '');
          
          // Determine if transaction is finalized
          const isFinalized = !t.status || t.status === 'Finalized' || 
                             t.status === 'SETTLED' || t.status === 'COMPLETED' || 
                             t.status === 'PROCESSED';
          
          // External Memo is empty for card transactions now (moved to Memo column)
          const externalMemo = '';

          return [
            formattedDate,                                              // A: Date (dd/mm/yy)
            toFrom,                                                     // B: To/From (memo if exists, else description)
            amountValue,                                                // C: Amount with sign
            memoField,                                                  // D: Memo (always show if exists)
            externalMemo,                                               // E: External Memo (original description for card transactions)
            '',                                                         // F: Originator Identification (empty)
            t.initiatedBy || 'Client',                                 // G: Initiated By (Client/Brex)
            t.paymentMethod || 'ACH/Wire',                            // H: Method (Card/ACH/Wire/Bill Pay)
            t.status || 'Finalized',                                   // I: Status
            isFinalized ? 'TRUE' : 'FALSE'                            // J: If Finalized Transaction
            // Columns K+ have formulas - don't overwrite
          ];
        }).filter(row => row !== null); // Remove null rows from invalid dates
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

      // Use append method which automatically handles sheet expansion
      let range: string;
      if (sheetName === 'Auto_input.Stripe') {
        range = `${sheetName}!A:W`; // Stripe uses columns A-W
      } else if (sheetName === 'Auto_input.Brex') {
        range = `${sheetName}!A:J`; // Brex uses columns A-J
      } else {
        range = `${sheetName}!A:I`; // Default range
      }
      
      // Use append method to automatically add to the end and handle expansion
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rows,
        },
      });

      // Skip color formatting - not needed

      console.log(`✅ Added ${transactions.length} transactions to ${sheetName}`);
      return transactions.length;
    } catch (error) {
      console.error(`❌ Failed to add transactions to ${sheetName}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Apply conditional formatting to amount column
   */
  async applyAmountFormatting(sheetName: string, startRow: number, rowCount: number): Promise<void> {
    const sheetId = await this.getSheetId(sheetName);
    if (sheetId === null) return;
    
    const requests = [
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{
              sheetId: sheetId,
              startRowIndex: startRow - 1,
              endRowIndex: startRow - 1 + rowCount,
              startColumnIndex: 2, // Column C (Amount)
              endColumnIndex: 3
            }],
            booleanRule: {
              condition: {
                type: 'TEXT_CONTAINS',
                values: [{ userEnteredValue: '-' }]
              },
              format: {
                textFormat: {
                  foregroundColor: { red: 0.8, green: 0, blue: 0 }
                }
              }
            }
          }
        }
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{
              sheetId: sheetId,
              startRowIndex: startRow - 1,
              endRowIndex: startRow - 1 + rowCount,
              startColumnIndex: 2, // Column C (Amount)
              endColumnIndex: 3
            }],
            booleanRule: {
              condition: {
                type: 'TEXT_CONTAINS',
                values: [{ userEnteredValue: '+' }]
              },
              format: {
                textFormat: {
                  foregroundColor: { red: 0, green: 0.6, blue: 0 }
                }
              }
            }
          }
        }
      }
    ];

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests }
    });
  }

  /**
   * Get sheet ID by name
   */
  async getSheetId(sheetName: string): Promise<number | null> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      
      const sheet = response.data.sheets?.find(s => s.properties?.title === sheetName);
      return sheet?.properties?.sheetId || null;
    } catch (error) {
      console.log(`⚠️ Could not get sheet ID: ${error.message}`);
      return null;
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