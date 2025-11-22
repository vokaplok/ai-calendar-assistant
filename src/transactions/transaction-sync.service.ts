import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Import transaction parsers (will be converted from JS modules)
import { GoogleSheetClient } from './google-sheet.client';
import { BrexParser } from './parsers/brex.parser';
import { StripeParser } from './parsers/stripe.parser';
import { PrivatBankParser } from './parsers/privatbank.parser';

export interface SyncResult {
  source: string;
  new: number;
  total: number;
  errors?: string[];
}

@Injectable()
export class TransactionSyncService {
  private sheetClient: GoogleSheetClient;
  private parsers: {
    brex: BrexParser;
    stripe: StripeParser;
    privatbank: PrivatBankParser;
  };

  constructor(private configService: ConfigService) {
    this.sheetClient = new GoogleSheetClient(configService);
    this.parsers = {
      brex: new BrexParser(configService),
      stripe: new StripeParser(configService),
      privatbank: new PrivatBankParser(configService)
    };
  }

  /**
   * Initialize the sync process
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Transaction Sync...');
    await this.sheetClient.initialize();
  }

  /**
   * Test API connections
   */
  async testConnections(): Promise<boolean> {
    console.log('🧪 Testing API connections...');
    
    const tests = [
      { name: 'Google Sheets', test: () => this.sheetClient.testConnection() },
      { name: 'Brex', test: () => this.parsers.brex.testConnection() },
      { name: 'Stripe', test: () => this.parsers.stripe.testConnection() },
      { name: 'PrivatBank', test: () => this.parsers.privatbank.testConnection() }
    ];

    let allPassed = true;
    for (const { name, test } of tests) {
      try {
        const success = await test();
        console.log(`${success ? '✅' : '❌'} ${name}: ${success ? 'Connected' : 'Failed'}`);
        if (!success) allPassed = false;
      } catch (error) {
        console.log(`❌ ${name}: Error - ${error.message}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  /**
   * Sync all sources or specific sources
   */
  async syncAll(sources: string[] = ['brex', 'stripe', 'privatbank']): Promise<SyncResult[]> {
    await this.initialize();
    
    const results: SyncResult[] = [];
    
    for (const source of sources) {
      try {
        let result: SyncResult;
        
        switch (source) {
          case 'brex':
            result = await this.syncSource('brex', this.parsers.brex, 'Brex');
            break;
          case 'stripe':
            result = await this.syncSource('stripe', this.parsers.stripe, 'Stripe');
            break;
          case 'privatbank':
            result = await this.syncSource('privatbank', this.parsers.privatbank, 'PrivatBank');
            break;
          default:
            console.log(`⚠️ Unknown source: ${source}`);
            continue;
        }
        
        results.push(result);
      } catch (error) {
        console.error(`❌ Error syncing ${source}:`, error.message);
        results.push({
          source,
          new: 0,
          total: 0,
          errors: [error.message]
        });
      }
    }
    
    return results;
  }

  /**
   * Sync transactions from a specific source
   */
  private async syncSource(sourceName: string, parser: any, sheetName: string): Promise<SyncResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Syncing ${sourceName.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);

    // Step 1: Fetch all transactions from API
    const allTransactions = await parser.fetchTransactions();

    if (!allTransactions || allTransactions.length === 0) {
      console.log(`ℹ️  No transactions found in ${sourceName}`);
      return { source: sourceName, new: 0, total: 0 };
    }

    console.log(`📥 Found ${allTransactions.length} transactions from ${sourceName} API`);

    // Step 2: Get existing transaction IDs from Google Sheet
    const existingIds = await this.sheetClient.getExistingIds(sheetName);
    console.log(`📋 Found ${existingIds.size} existing transactions in sheet`);

    // Step 3: Filter out transactions that already exist
    const newTransactions = allTransactions.filter(t => !existingIds.has(t.id));

    if (newTransactions.length === 0) {
      console.log(`✅ All ${allTransactions.length} transactions already exist in sheet - no updates needed`);
      return { source: sourceName, new: 0, total: allTransactions.length };
    }

    console.log(`➕ Found ${newTransactions.length} new transactions to add`);

    // Step 4: Add new transactions to Google Sheet
    const addedCount = await this.sheetClient.addTransactions(sheetName, newTransactions);
    
    console.log(`✅ Successfully added ${addedCount} new transactions to ${sheetName} sheet`);

    return {
      source: sourceName,
      new: addedCount,
      total: allTransactions.length
    };
  }

  /**
   * Print summary of sync results
   */
  printSummary(results: SyncResult[]): string {
    let summary = '\n' + '='.repeat(80) + '\n';
    summary += '📋 SYNC SUMMARY\n';
    summary += '='.repeat(80) + '\n\n';

    let totalNew = 0;
    let totalProcessed = 0;
    let hasErrors = false;

    for (const result of results) {
      const status = result.errors && result.errors.length > 0 ? '❌' : '✅';
      summary += `${status} ${result.source.toUpperCase().padEnd(12)} | `;
      summary += `New: ${result.new.toString().padStart(3)} | `;
      summary += `Total: ${result.total.toString().padStart(3)}`;
      
      if (result.errors && result.errors.length > 0) {
        summary += ` | Errors: ${result.errors.length}`;
        hasErrors = true;
      }
      
      summary += '\n';
      
      totalNew += result.new;
      totalProcessed += result.total;
    }

    summary += '\n' + '-'.repeat(80) + '\n';
    summary += `📊 TOTALS: ${totalNew} new transactions added from ${totalProcessed} total processed\n`;
    
    if (hasErrors) {
      summary += '⚠️  Some sources had errors - check logs above for details\n';
    }
    
    summary += '='.repeat(80) + '\n';

    console.log(summary);
    return summary;
  }
}