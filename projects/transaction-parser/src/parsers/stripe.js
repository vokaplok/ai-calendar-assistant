import Stripe from 'stripe';
import { config } from '../config.js';
import { subDays } from 'date-fns';

export class StripeParser {
  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: config.stripe.apiVersion
    });
  }

  /**
   * Fetch all transactions (charges or payment intents) from Stripe
   * @param {Date} startDate - Optional start date for filtering
   * @returns {Array} Array of normalized transactions
   */
  async fetchTransactions(startDate = null) {
    try {
      console.log('🔄 Fetching transactions from Stripe...');

      // If no start date provided, fetch last N days
      if (!startDate) {
        startDate = subDays(new Date(), config.initialFetchDays);
      }

      const createdTimestamp = Math.floor(startDate.getTime() / 1000);

      // Fetch charges (you can also fetch payment_intents or balance_transactions)
      const charges = await this.fetchAllCharges(createdTimestamp);

      console.log(`✅ Fetched ${charges.length} total transactions from Stripe`);

      // Normalize transactions to common format
      return charges.map(t => this.normalizeTransaction(t));

    } catch (error) {
      console.error('❌ Error fetching Stripe transactions:', error.message);
      throw error;
    }
  }

  /**
   * Fetch all charges with pagination
   * @param {number} createdTimestamp - Unix timestamp
   * @returns {Array} Array of Stripe charges
   */
  async fetchAllCharges(createdTimestamp) {
    let allCharges = [];
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        created: { gte: createdTimestamp }
      };

      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const charges = await this.stripe.charges.list(params);

      allCharges = allCharges.concat(charges.data);
      hasMore = charges.has_more;

      if (hasMore && charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id;
      }

      console.log(`   Fetched ${allCharges.length} charges so far...`);
    }

    return allCharges;
  }

  /**
   * Alternatively, fetch balance transactions (more comprehensive)
   * Uncomment and use this if you prefer balance transactions over charges
   */
  async fetchBalanceTransactions(startDate = null) {
    try {
      if (!startDate) {
        startDate = subDays(new Date(), config.initialFetchDays);
      }

      const createdTimestamp = Math.floor(startDate.getTime() / 1000);

      let allTransactions = [];
      let hasMore = true;
      let startingAfter = null;

      while (hasMore) {
        const params = {
          limit: 100,
          created: { gte: createdTimestamp }
        };

        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const transactions = await this.stripe.balanceTransactions.list(params);

        allTransactions = allTransactions.concat(transactions.data);
        hasMore = transactions.has_more;

        if (hasMore && transactions.data.length > 0) {
          startingAfter = transactions.data[transactions.data.length - 1].id;
        }

        console.log(`   Fetched ${allTransactions.length} balance transactions so far...`);
      }

      return allTransactions.map(t => this.normalizeBalanceTransaction(t));
    } catch (error) {
      console.error('❌ Error fetching Stripe balance transactions:', error.message);
      throw error;
    }
  }

  /**
   * Normalize Stripe charge to common format
   * @param {Object} charge - Raw Stripe charge
   * @returns {Object} Normalized transaction
   */
  normalizeTransaction(charge) {
    return {
      id: charge.id,
      date: new Date(charge.created * 1000).toISOString(),
      description: charge.description || charge.statement_descriptor || 'Stripe charge',
      amount: charge.amount / 100, // Convert cents to dollars
      currency: charge.currency.toUpperCase(),
      category: this.getCategory(charge),
      status: charge.status,
      customer: charge.customer || '',
      paymentMethod: charge.payment_method_details?.type || '',
      fee: charge.application_fee_amount ? charge.application_fee_amount / 100 : 0,
      net: charge.amount - (charge.application_fee_amount || 0),
      raw: charge // Keep raw data for reference
    };
  }

  /**
   * Normalize Stripe balance transaction to common format
   * @param {Object} txn - Raw Stripe balance transaction
   * @returns {Object} Normalized transaction
   */
  normalizeBalanceTransaction(txn) {
    return {
      id: txn.id,
      date: new Date(txn.created * 1000).toISOString(),
      description: txn.description || `${txn.type} - ${txn.reporting_category}`,
      amount: txn.amount / 100,
      currency: txn.currency.toUpperCase(),
      category: txn.reporting_category || txn.type,
      status: txn.status,
      customer: '',
      paymentMethod: txn.type,
      fee: txn.fee / 100,
      net: txn.net / 100,
      raw: txn
    };
  }

  /**
   * Get category from charge metadata or type
   * @param {Object} charge
   * @returns {string}
   */
  getCategory(charge) {
    // Try to get category from metadata
    if (charge.metadata?.category) {
      return charge.metadata.category;
    }

    // Categorize based on payment method or description
    if (charge.refunded) {
      return 'Refund';
    }

    return 'Payment';
  }

  /**
   * Test API connection
   * @returns {boolean} True if connection successful
   */
  async testConnection() {
    try {
      console.log('🔌 Testing Stripe API connection...');

      // Try to fetch account info to test
      await this.stripe.balance.retrieve();

      console.log('✅ Stripe API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Stripe API connection failed:', error.message);
      return false;
    }
  }
}
