import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { config } from '../config.js';

export class GoogleSheetClient {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = config.googleSheets.spreadsheetId;
  }

  /**
   * Initialize Google Sheets API client
   */
  async initialize() {
    try {
      const credentials = JSON.parse(
        readFileSync(config.googleSheets.serviceAccountKeyPath, 'utf8')
      );

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets client:', error.message);
      throw error;
    }
  }

  /**
   * Get existing transaction IDs from a specific sheet
   * @param {string} sheetName - Name of the sheet (Brex, Stripe, PrivatBank)
   * @returns {Set<string>} Set of existing transaction IDs
   */
  async getExistingIds(sheetName) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:A`, // Column A, starting from row 2 (skip header)
      });

      const rows = response.data.values || [];
      const ids = new Set(rows.map(row => row[0]).filter(Boolean));

      console.log(`📊 Found ${ids.size} existing transactions in ${sheetName}`);
      return ids;
    } catch (error) {
      if (error.code === 404 || error.message?.includes('Unable to parse range')) {
        console.log(`⚠️  Sheet "${sheetName}" not found or empty. Creating new sheet...`);
        return new Set();
      }
      throw error;
    }
  }

  /**
   * Append new transactions to a sheet
   * @param {string} sheetName - Name of the sheet
   * @param {Array} transactions - Array of transaction objects
   */
  async appendTransactions(sheetName, transactions) {
    if (!transactions || transactions.length === 0) {
      console.log(`ℹ️  No new transactions to append to ${sheetName}`);
      return;
    }

    try {
      // Ensure sheet exists and has headers
      await this.ensureSheetExists(sheetName);

      // Convert transactions to rows
      const rows = transactions.map(t => this.transactionToRow(t, sheetName));

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rows
        }
      });

      console.log(`✅ Added ${transactions.length} new transactions to ${sheetName}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to append transactions to ${sheetName}:`, error.message);
      throw error;
    }
  }

  /**
   * Ensure sheet exists with proper headers
   * @param {string} sheetName
   */
  async ensureSheetExists(sheetName) {
    try {
      // Try to get the sheet
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const sheet = response.data.sheets.find(s => s.properties.title === sheetName);

      if (!sheet) {
        // Create the sheet if it doesn't exist
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName
                  }
                }
              }
            ]
          }
        });
        console.log(`✅ Created new sheet: ${sheetName}`);

        // Add headers
        await this.addHeaders(sheetName);
      } else {
        // Check if headers exist
        const headerCheck = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:Z1`
        });

        if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
          await this.addHeaders(sheetName);
        }
      }
    } catch (error) {
      console.error(`❌ Error ensuring sheet exists:`, error.message);
      throw error;
    }
  }

  /**
   * Add headers to a sheet based on source type
   * @param {string} sheetName
   */
  async addHeaders(sheetName) {
    const headers = this.getHeadersForSource(sheetName);

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1:Z1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers]
      }
    });

    console.log(`✅ Added headers to ${sheetName}`);
  }

  /**
   * Get headers based on source type
   * @param {string} source
   * @returns {Array<string>}
   */
  getHeadersForSource(source) {
    const commonHeaders = ['Transaction ID', 'Date', 'Description', 'Amount', 'Currency', 'Category', 'Status', 'Synced At'];

    switch (source.toLowerCase()) {
      case 'brex':
        return [...commonHeaders, 'Merchant', 'Card Last 4', 'User'];
      case 'stripe':
        return [...commonHeaders, 'Customer', 'Payment Method', 'Fee', 'Net'];
      case 'privatbank':
        return [...commonHeaders, 'Card Number', 'MCC', 'Terminal'];
      default:
        return commonHeaders;
    }
  }

  /**
   * Convert transaction object to row array
   * @param {Object} transaction
   * @param {string} source
   * @returns {Array}
   */
  transactionToRow(transaction, source) {
    const baseRow = [
      transaction.id,
      transaction.date,
      transaction.description,
      transaction.amount,
      transaction.currency,
      transaction.category || '',
      transaction.status || '',
      new Date().toISOString()
    ];

    switch (source.toLowerCase()) {
      case 'brex':
        return [
          ...baseRow,
          transaction.merchant || '',
          transaction.cardLast4 || '',
          transaction.user || ''
        ];
      case 'stripe':
        return [
          ...baseRow,
          transaction.customer || '',
          transaction.paymentMethod || '',
          transaction.fee || '',
          transaction.net || ''
        ];
      case 'privatbank':
        return [
          ...baseRow,
          transaction.cardNumber || '',
          transaction.mcc || '',
          transaction.terminal || ''
        ];
      default:
        return baseRow;
    }
  }

  /**
   * Get all transactions from a sheet (for debugging)
   * @param {string} sheetName
   * @returns {Array}
   */
  async getAllTransactions(sheetName) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:Z`
      });

      return response.data.values || [];
    } catch (error) {
      console.error(`❌ Failed to get transactions from ${sheetName}:`, error.message);
      return [];
    }
  }
}
