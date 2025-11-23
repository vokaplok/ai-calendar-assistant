import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TransactionSyncService } from './transaction-sync.service';
import { BrexParser } from './parsers/brex.parser';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function debugBrexSync() {
  console.log('🔍 Starting Brex sync debug...\n');

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ],
    providers: [
      TransactionSyncService,
      ConfigService,
      BrexParser,
      GoogleSheetClient
    ],
  }).compile();

  const configService = module.get<ConfigService>(ConfigService);
  const brexParser = new BrexParser(configService);
  const googleSheetClient = new GoogleSheetClient(configService);

  try {
    // Test Brex API connection
    console.log('1️⃣ Testing Brex API connection...');
    const connectionOk = await brexParser.testConnection();
    
    if (!connectionOk) {
      console.log('❌ Brex connection failed. Cannot proceed.');
      return;
    }
    console.log('✅ Brex API connection successful\n');

    // Test Google Sheets connection
    console.log('2️⃣ Testing Google Sheets connection...');
    await googleSheetClient.initialize();
    const sheetsOk = await googleSheetClient.testConnection();
    
    if (!sheetsOk) {
      console.log('❌ Google Sheets connection failed. Cannot proceed.');
      return;
    }
    console.log('✅ Google Sheets connection successful\n');

    // Fetch transactions directly from Brex parser
    console.log('3️⃣ Fetching raw transactions from Brex API...');
    const rawTransactions = await brexParser.fetchTransactions();
    console.log(`📊 Raw transactions fetched: ${rawTransactions.length}`);
    
    if (rawTransactions.length > 0) {
      console.log('\n📋 Sample of first 3 transactions:');
      rawTransactions.slice(0, 3).forEach((tx, i) => {
        console.log(`   ${i + 1}. ${new Date(tx.date).toLocaleDateString()} - ${tx.description} - ${tx.type} ${tx.amount}`);
      });
    }

    // Check what's currently in the sheet
    console.log('\n4️⃣ Checking existing data in Auto_input.Brex sheet...');
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    
    console.log(`📅 Latest date in sheet: ${latestDate ? latestDate.toLocaleDateString() : 'none'}`);
    console.log(`📊 Transactions on latest date: ${existingFromLatestDate.length}`);

    // Manually filter to show what would be added
    console.log('\n5️⃣ Analyzing which transactions would be new...');
    let newTransactions = [];
    
    if (rawTransactions.length > 0) {
      // Use more permissive filtering - only filter out exact duplicates
      const formatAmountWithCommas = (amount: number): string => {
        return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      };

      newTransactions = rawTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        
        // If no latest date found in table, add all transactions
        if (!latestDate) {
          return true;
        }
        
        // Include all transactions from the last 30 days instead of just from latest date
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (transactionDate < thirtyDaysAgo) {
          console.log(`   ⏭️ Skipping old transaction from ${transactionDate.toLocaleDateString()}: ${t.id}`);
          return false;
        }
        
        // For transactions on the same date as latest date, check for duplicates
        if (latestDate && transactionDate.toDateString() === latestDate.toDateString()) {
          const day = String(transactionDate.getDate()).padStart(2, '0');
          const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
          const year = String(transactionDate.getFullYear()).slice(-2);
          const formattedDate = `${day}/${month}/${year}`;
          
          const amountSign = t.type === 'income' ? '' : '-';
          const amountValue = amountSign + formatAmountWithCommas(t.amount);
          
          let toFrom;
          if (t.account === 'Brex Card') {
            toFrom = t.brexData?.originalDescription || t.description || 'GENERECT, INC.';
          } else if (t.memo) {
            toFrom = t.memo;
          } else {
            toFrom = t.description || 'GENERECT, INC.';
          }
          
          const isDuplicate = existingFromLatestDate.some(existing => {
            return existing.date === formattedDate && 
                   existing.amount === amountValue && 
                   existing.description === toFrom;
          });
          
          if (isDuplicate) {
            console.log(`   ⚠️ Duplicate found on latest date: ${formattedDate} - ${toFrom} - ${amountValue}`);
            return false;
          }
        }
        
        return true;
      });
    }

    console.log(`✅ New transactions to add: ${newTransactions.length}`);
    
    if (newTransactions.length > 0) {
      console.log('\n📋 First 5 new transactions:');
      newTransactions.slice(0, 5).forEach((tx, i) => {
        console.log(`   ${i + 1}. ${new Date(tx.date).toLocaleDateString()} - ${tx.description} - ${tx.type} ${tx.amount}`);
      });
      
      // Ask for confirmation
      console.log(`\n❓ Do you want to add these ${newTransactions.length} transactions to the sheet? (This is a dry run - checking only)`);
      
      // For now, just log what we would add without actually adding
      console.log('📝 This is a debug run - no actual changes will be made to the sheet.');
      
    } else {
      console.log('ℹ️  No new transactions to add.');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

// Run the debug
debugBrexSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});