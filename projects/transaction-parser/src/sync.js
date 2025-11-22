import { GoogleSheetClient } from './sheet/google-sheet.js';
import { BrexParser } from './parsers/brex.js';
import { StripeParser } from './parsers/stripe.js';
import { PrivatBankParser } from './parsers/privatbank.js';
import { config } from './config.js';

export class TransactionSync {
  constructor() {
    this.sheetClient = new GoogleSheetClient();
    this.parsers = {
      brex: new BrexParser(),
      stripe: new StripeParser(),
      privatbank: new PrivatBankParser()
    };
  }

  /**
   * Initialize the sync process
   */
  async initialize() {
    console.log('🚀 Initializing Transaction Sync...\n');
    await this.sheetClient.initialize();
  }

  /**
   * Sync transactions from a specific source
   * @param {string} sourceName - Source name (brex, stripe, privatbank)
   * @param {Object} parser - Parser instance
   * @param {string} sheetName - Google Sheet name
   */
  async syncSource(sourceName, parser, sheetName) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📊 Syncing ${sourceName.toUpperCase()}`);
      console.log(`${'='.repeat(60)}\n`);

      // Step 1: Fetch all transactions from API
      const allTransactions = await parser.fetchTransactions();

      if (!allTransactions || allTransactions.length === 0) {
        console.log(`ℹ️  No transactions found in ${sourceName}`);
        return { source: sourceName, new: 0, total: 0 };
      }

      // Step 2: Get existing transaction IDs from Google Sheet
      const existingIds = await this.sheetClient.getExistingIds(sheetName);

      // Step 3: Filter out transactions that already exist
      const newTransactions = allTransactions.filter(t => !existingIds.has(t.id));

      console.log(`\n📈 Summary for ${sourceName}:`);
      console.log(`   Total transactions fetched: ${allTransactions.length}`);
      console.log(`   Already in sheet: ${existingIds.size}`);
      console.log(`   New transactions: ${newTransactions.length}`);

      // Step 4: Append new transactions to Google Sheet
      if (newTransactions.length > 0) {
        await this.sheetClient.appendTransactions(sheetName, newTransactions);
        console.log(`\n✅ Successfully synced ${newTransactions.length} new transactions from ${sourceName}!`);
      } else {
        console.log(`\n✅ ${sourceName} is already up to date!`);
      }

      return {
        source: sourceName,
        new: newTransactions.length,
        total: allTransactions.length,
        existing: existingIds.size
      };

    } catch (error) {
      console.error(`\n❌ Error syncing ${sourceName}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync all sources
   * @param {Array<string>} sources - Array of source names to sync (default: all)
   */
  async syncAll(sources = ['brex', 'stripe', 'privatbank']) {
    console.log(`\n🔄 Starting sync for: ${sources.join(', ')}\n`);

    const results = [];

    for (const source of sources) {
      try {
        const parser = this.parsers[source];
        const sheetName = config.googleSheets.sheetNames[source];

        if (!parser) {
          console.warn(`⚠️  No parser found for source: ${source}`);
          continue;
        }

        const result = await this.syncSource(source, parser, sheetName);
        results.push(result);

      } catch (error) {
        console.error(`❌ Failed to sync ${source}:`, error.message);
        results.push({
          source: source,
          error: error.message,
          new: 0,
          total: 0
        });
      }
    }

    return results;
  }

  /**
   * Print final summary
   * @param {Array} results - Array of sync results
   */
  printSummary(results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SYNC SUMMARY`);
    console.log(`${'='.repeat(60)}\n`);

    let totalNew = 0;
    let totalTransactions = 0;

    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.source.toUpperCase()}: Failed - ${result.error}`);
      } else {
        console.log(`✅ ${result.source.toUpperCase()}:`);
        console.log(`   New transactions added: ${result.new}`);
        console.log(`   Total transactions found: ${result.total}`);
        console.log(`   Already in sheet: ${result.existing || 0}`);
        totalNew += result.new;
        totalTransactions += result.total;
      }
      console.log('');
    });

    console.log(`${'='.repeat(60)}`);
    console.log(`📈 TOTAL: ${totalNew} new transactions added`);
    console.log(`📊 TOTAL: ${totalTransactions} transactions processed`);
    console.log(`${'='.repeat(60)}\n`);
  }

  /**
   * Test all API connections
   */
  async testConnections() {
    console.log('🔌 Testing API connections...\n');

    const tests = [];

    // Test Brex
    try {
      const brexOk = await this.parsers.brex.testConnection();
      tests.push({ name: 'Brex', success: brexOk });
    } catch (error) {
      tests.push({ name: 'Brex', success: false, error: error.message });
    }

    // Test Stripe
    try {
      const stripeOk = await this.parsers.stripe.testConnection();
      tests.push({ name: 'Stripe', success: stripeOk });
    } catch (error) {
      tests.push({ name: 'Stripe', success: false, error: error.message });
    }

    // Test PrivatBank
    try {
      const pbOk = await this.parsers.privatbank.testConnection();
      tests.push({ name: 'PrivatBank', success: pbOk });
    } catch (error) {
      tests.push({ name: 'PrivatBank', success: false, error: error.message });
    }

    // Print results
    console.log('\n📊 Connection Test Results:');
    console.log('─'.repeat(40));
    tests.forEach(test => {
      const status = test.success ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${test.success ? 'OK' : test.error}`);
    });
    console.log('─'.repeat(40));

    const allSuccess = tests.every(t => t.success);
    return allSuccess;
  }
}
