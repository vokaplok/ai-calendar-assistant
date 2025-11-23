import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Import transaction parsers
import { GoogleSheetClient } from './google-sheet.client';
import { BrexParser } from './parsers/brex.parser';
import { StripeParser } from './parsers/stripe.parser';
import { Transaction } from './parsers/base.parser';

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
  };

  constructor(private configService: ConfigService) {
    this.sheetClient = new GoogleSheetClient(configService);
    this.parsers = {
      brex: new BrexParser(configService),
      stripe: new StripeParser(configService)
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
      { name: 'Stripe', test: () => this.parsers.stripe.testConnection() }
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
  async syncAll(sources: string[] = ['brex', 'stripe']): Promise<SyncResult[]> {
    await this.initialize();
    
    const results: SyncResult[] = [];
    
    for (const source of sources) {
      try {
        let result: SyncResult;
        
        switch (source) {
          case 'brex':
            result = await this.syncSource('brex', this.parsers.brex, 'Auto_input.Brex');
            break;
          case 'stripe':
            result = await this.syncSource('stripe', this.parsers.stripe, 'Auto_input.Stripe');
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
    
    // Log transaction breakdown
    if (sourceName === 'brex') {
      const cardTxns = allTransactions.filter(t => t.brexData?.type === 'card').length;
      const transferTxns = allTransactions.filter(t => t.brexData?.type === 'transfer' || t.brexData?.type === 'cash').length;
      console.log(`   📊 Breakdown: ${cardTxns} card, ${transferTxns} transfer/cash`);
    }

    // Step 2: Check that the target sheet exists
    console.log(`🔍 Using existing ${sheetName} sheet...`);

    // Helper function for amount formatting
    const formatAmountWithCommas = (amount: number): string => {
      return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    // Step 3: Get latest transaction info from Google Sheet
    let newTransactions: Transaction[];
    if (sheetName === 'Auto_input.Brex') {
      // For Brex, find latest date in table and add transactions from that date onwards
      const { latestDate, existingFromLatestDate } = await this.sheetClient.getLatestTransactionInfo(sheetName);

      newTransactions = allTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        
        // If no latest date found in table, add all transactions
        if (!latestDate) {
          return true;
        }
        
        // Only consider transactions from latest date onwards
        if (transactionDate < latestDate) {
          return false;
        }
        
        // For transactions on the same date as latest date, check for duplicates
        if (transactionDate.toDateString() === latestDate.toDateString()) {
          // Format transaction data for comparison
          const day = String(transactionDate.getDate()).padStart(2, '0');
          const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
          const year = String(transactionDate.getFullYear()).slice(-2);
          const formattedDate = `${day}/${month}/${year}`;
          
          const amountSign = t.type === 'income' ? '' : '-';
          const amountValue = amountSign + formatAmountWithCommas(t.amount);
          
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
          
          // Check if this exact transaction already exists on the same date
          const isDuplicate = existingFromLatestDate.some(existing => {
            return existing.date === formattedDate && 
                   existing.amount === amountValue && 
                   existing.description === toFrom;
          });
          
          if (isDuplicate) {
            console.log(`⚠️ Duplicate transaction found on latest date: ${formattedDate} - ${toFrom} - ${amountValue}`);
            return false;
          }
        }
        
        return true;
      });
    } else {
      // For Stripe, use transaction ID (legacy method)
      const existingIds = await this.sheetClient.getExistingIds(sheetName);
      console.log(`📋 Found ${existingIds.size} existing transactions in sheet`);
      newTransactions = allTransactions.filter(t => !existingIds.has(t.id));
    }

    if (newTransactions.length === 0) {
      console.log(`✅ All ${allTransactions.length} transactions already exist in sheet - no updates needed`);
      return { source: sourceName, new: 0, total: allTransactions.length };
    }

    console.log(`➕ Found ${newTransactions.length} new transactions to add`);

    // Sort new transactions by date (oldest first)
    newTransactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    console.log(`📅 Sorted transactions by date (oldest to newest)`);

    // Step 5: Add new transactions to Google Sheet
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
  async debugBrexTransactions(): Promise<any> {
    const brexTransactions = await this.parsers.brex.fetchTransactions();
    // Return first 2 transactions for debugging
    return brexTransactions.slice(0, 2);
  }

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