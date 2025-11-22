import axios from 'axios';
import { config } from '../config.js';
import { format, subDays } from 'date-fns';

export class PrivatBankParser {
  constructor() {
    this.baseUrl = config.privatbank.baseUrl;
    this.apiToken = config.privatbank.apiToken;
    this.merchantId = config.privatbank.merchantId;
    this.merchantPassword = config.privatbank.merchantPassword;
    this.cardNumber = config.privatbank.cardNumber;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Fetch transactions from PrivatBank
   * Uses the card statement API
   * @param {Date} startDate - Optional start date for filtering
   * @returns {Array} Array of normalized transactions
   */
  async fetchTransactions(startDate = null, endDate = null) {
    try {
      console.log('🔄 Fetching transactions from PrivatBank...');

      // If no start date provided, fetch last N days
      if (!startDate) {
        startDate = subDays(new Date(), config.initialFetchDays);
      }

      if (!endDate) {
        endDate = new Date();
      }

      // Format dates for PrivatBank API (DD-MM-YYYY)
      const startDateStr = format(startDate, 'dd-MM-yyyy');
      const endDateStr = format(endDate, 'dd-MM-yyyy');

      console.log(`   Fetching from ${startDateStr} to ${endDateStr}`);

      // PrivatBank API endpoint for card statements
      // Documentation: https://api.privatbank.ua/#p24/orders
      const url = `/p24api/rest_fiz`;

      const requestBody = {
        id: this.merchantId || 'p24api',
        password: this.merchantPassword || this.apiToken,
        card: this.cardNumber,
        start_date: startDateStr,
        end_date: endDateStr,
        wait: 0, // Don't wait for processing
        type: 'json'
      };

      const response = await this.client.post(url, requestBody);

      // Handle different response formats
      let transactions = [];

      if (response.data && response.data.transactions) {
        transactions = response.data.transactions;
      } else if (Array.isArray(response.data)) {
        transactions = response.data;
      } else {
        console.log('⚠️  Unexpected response format from PrivatBank');
        console.log('Response:', JSON.stringify(response.data, null, 2));
      }

      console.log(`✅ Fetched ${transactions.length} total transactions from PrivatBank`);

      // Normalize transactions to common format
      return transactions.map(t => this.normalizeTransaction(t));

    } catch (error) {
      console.error('❌ Error fetching PrivatBank transactions:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
      }

      // If auth failed, provide helpful message
      if (error.response?.status === 401) {
        console.error('   ⚠️  Authentication failed. Please check your credentials.');
        console.error('   Make sure PRIVATBANK_API_TOKEN or PRIVATBANK_MERCHANT_ID/PASSWORD are set correctly.');
      }

      throw error;
    }
  }

  /**
   * Alternative method: Fetch via merchant API
   * Use this if you have merchant access
   */
  async fetchViaMerchantAPI(startDate = null, endDate = null) {
    try {
      console.log('🔄 Fetching transactions via PrivatBank Merchant API...');

      if (!startDate) {
        startDate = subDays(new Date(), config.initialFetchDays);
      }

      if (!endDate) {
        endDate = new Date();
      }

      const startDateStr = format(startDate, 'dd-MM-yyyy');
      const endDateStr = format(endDate, 'dd-MM-yyyy');

      const url = '/p24api/rest_fiz';
      const response = await this.client.get(url, {
        params: {
          id: this.merchantId,
          token: this.apiToken,
          from: startDateStr,
          to: endDateStr,
          type: 'json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Error fetching via Merchant API:', error.message);
      throw error;
    }
  }

  /**
   * Normalize PrivatBank transaction to common format
   * @param {Object} transaction - Raw PrivatBank transaction
   * @returns {Object} Normalized transaction
   */
  normalizeTransaction(transaction) {
    // PrivatBank transaction structure varies, adjust as needed
    // Example structure based on typical PrivatBank API response:
    // {
    //   "trandate": "2025-11-17",
    //   "trantime": "12:34:56",
    //   "terminal": "Some Terminal",
    //   "description": "Purchase at STORE",
    //   "cardamount": "-150.00",
    //   "currency": "UAH",
    //   "cardnum": "1234",
    //   "ref": "123456789",
    //   "appcode": "123456"
    // }

    const amount = parseFloat(transaction.cardamount || transaction.amount || 0);
    const isExpense = amount < 0;

    // Generate unique ID from reference or combination of fields
    const id = transaction.ref ||
               transaction.refno ||
               `${transaction.trandate}_${transaction.trantime}_${Math.abs(amount)}`;

    return {
      id: id,
      date: this.parseDate(transaction.trandate, transaction.trantime),
      description: transaction.description || transaction.terminal || 'PrivatBank transaction',
      amount: Math.abs(amount),
      currency: transaction.currency || 'UAH',
      category: this.categorizeTransaction(transaction),
      status: transaction.status || 'completed',
      cardNumber: transaction.cardnum || this.cardNumber,
      mcc: transaction.mcc || '',
      terminal: transaction.terminal || '',
      raw: transaction // Keep raw data for reference
    };
  }

  /**
   * Parse PrivatBank date/time to ISO string
   * @param {string} date - Date in DD-MM-YYYY or YYYY-MM-DD format
   * @param {string} time - Time in HH:MM:SS format
   * @returns {string} ISO date string
   */
  parseDate(date, time = '00:00:00') {
    try {
      // Handle both DD-MM-YYYY and YYYY-MM-DD formats
      let parsedDate;

      if (date.includes('-')) {
        const parts = date.split('-');
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          parsedDate = new Date(`${date}T${time}`);
        } else {
          // DD-MM-YYYY
          parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${time}`);
        }
      }

      return parsedDate ? parsedDate.toISOString() : new Date().toISOString();
    } catch (error) {
      console.warn('Failed to parse date:', date, time);
      return new Date().toISOString();
    }
  }

  /**
   * Categorize transaction based on MCC or description
   * @param {Object} transaction
   * @returns {string}
   */
  categorizeTransaction(transaction) {
    const mcc = transaction.mcc;
    const description = (transaction.description || '').toLowerCase();

    // MCC-based categorization
    const mccCategories = {
      '5411': 'Groceries',
      '5812': 'Restaurants',
      '5814': 'Fast Food',
      '4111': 'Transportation',
      '5541': 'Gas Stations',
      '5732': 'Electronics',
      '5999': 'Shopping',
      // Add more MCC codes as needed
    };

    if (mcc && mccCategories[mcc]) {
      return mccCategories[mcc];
    }

    // Description-based categorization
    if (description.includes('market') || description.includes('супермаркет')) {
      return 'Groceries';
    }
    if (description.includes('restaurant') || description.includes('ресторан')) {
      return 'Restaurants';
    }
    if (description.includes('taxi') || description.includes('uber')) {
      return 'Transportation';
    }

    return 'Other';
  }

  /**
   * Test API connection
   * @returns {boolean} True if connection successful
   */
  async testConnection() {
    try {
      console.log('🔌 Testing PrivatBank API connection...');

      // Try to fetch balance or minimal transaction list
      const testEndDate = new Date();
      const testStartDate = subDays(testEndDate, 1);

      await this.fetchTransactions(testStartDate, testEndDate);

      console.log('✅ PrivatBank API connection successful');
      return true;
    } catch (error) {
      console.error('❌ PrivatBank API connection failed:', error.message);
      return false;
    }
  }
}
