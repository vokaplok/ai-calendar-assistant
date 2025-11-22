import axios from 'axios';
import { config } from '../config.js';
import { subDays, formatISO } from 'date-fns';

export class BrexParser {
  constructor() {
    this.apiKey = config.brex.apiKey;
    this.companyId = config.brex.companyId;
    this.baseUrl = config.brex.baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Fetch all transactions from Brex
   * @param {Date} startDate - Optional start date for filtering
   * @returns {Array} Array of normalized transactions
   */
  async fetchTransactions(startDate = null) {
    try {
      console.log('🔄 Fetching transactions from Brex...');

      // If no start date provided, fetch last N days
      if (!startDate) {
        startDate = subDays(new Date(), config.initialFetchDays);
      }

      const params = {
        posted_at_start: formatISO(startDate, { representation: 'date' }),
        limit: 100 // Brex API pagination limit
      };

      let allTransactions = [];
      let cursor = null;

      // Paginate through all transactions
      do {
        if (cursor) {
          params.cursor = cursor;
        }

        const response = await this.client.get('/v2/transactions/card/primary', { params });
        const data = response.data;

        if (data.items && data.items.length > 0) {
          allTransactions = allTransactions.concat(data.items);
        }

        cursor = data.next_cursor;
        console.log(`   Fetched ${allTransactions.length} transactions so far...`);

      } while (cursor);

      console.log(`✅ Fetched ${allTransactions.length} total transactions from Brex`);

      // Normalize transactions to common format
      return allTransactions.map(t => this.normalizeTransaction(t));

    } catch (error) {
      console.error('❌ Error fetching Brex transactions:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Normalize Brex transaction to common format
   * @param {Object} transaction - Raw Brex transaction
   * @returns {Object} Normalized transaction
   */
  normalizeTransaction(transaction) {
    return {
      id: transaction.id,
      date: transaction.posted_at_date || transaction.purchased_at,
      description: transaction.merchant?.raw_descriptor || transaction.description || 'N/A',
      amount: Math.abs(transaction.amount?.amount || 0) / 100, // Convert cents to dollars
      currency: transaction.amount?.currency || 'USD',
      category: this.getCategoryName(transaction.category_id),
      status: transaction.status,
      merchant: transaction.merchant?.raw_descriptor || '',
      cardLast4: transaction.card?.last_four || '',
      user: transaction.user?.full_name || '',
      raw: transaction // Keep raw data for reference
    };
  }

  /**
   * Get category name from category ID
   * You can expand this with actual Brex category mappings
   * @param {string} categoryId
   * @returns {string}
   */
  getCategoryName(categoryId) {
    const categories = {
      'ADVERTISING': 'Advertising',
      'SOFTWARE': 'Software',
      'TRAVEL': 'Travel',
      'MEALS': 'Meals & Entertainment',
      'OFFICE_SUPPLIES': 'Office Supplies',
      'PROFESSIONAL_SERVICES': 'Professional Services',
      // Add more categories as needed
    };

    return categories[categoryId] || categoryId || 'Uncategorized';
  }

  /**
   * Test API connection
   * @returns {boolean} True if connection successful
   */
  async testConnection() {
    try {
      console.log('🔌 Testing Brex API connection...');

      // Try to fetch just 1 transaction to test
      const response = await this.client.get('/v2/transactions/card/primary', {
        params: { limit: 1 }
      });

      console.log('✅ Brex API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Brex API connection failed:', error.message);
      return false;
    }
  }
}
