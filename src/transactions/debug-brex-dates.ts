import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BrexParser } from './parsers/brex.parser';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function debugBrexDates() {
  console.log('🔍 Debugging Brex dates and filtering...\n');

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ],
    providers: [
      ConfigService,
      BrexParser,
      GoogleSheetClient
    ],
  }).compile();

  const configService = module.get<ConfigService>(ConfigService);
  const brexParser = new BrexParser(configService);
  const googleSheetClient = new GoogleSheetClient(configService);

  try {
    // Initialize Google Sheets
    console.log('📊 Connecting to Google Sheets...');
    await googleSheetClient.initialize();

    // Get latest transaction info from sheet
    console.log('📋 Getting latest transaction info from sheet...');
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    
    console.log(`📅 Latest date in sheet: ${latestDate ? latestDate.toLocaleDateString() : 'none'}`);
    console.log(`📅 Latest date ISO: ${latestDate ? latestDate.toISOString().split('T')[0] : 'none'}`);
    console.log(`📊 Existing transactions on latest date: ${existingFromLatestDate.length}`);
    
    if (existingFromLatestDate.length > 0) {
      console.log('📋 Existing transactions on latest date:');
      existingFromLatestDate.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.date} - ${t.description.substring(0, 40)} - ${t.amount}`);
      });
    }

    // Fetch raw transactions from Brex
    console.log('\n📡 Fetching raw transactions from Brex...');
    const allTransactions = await brexParser.fetchTransactions();
    console.log(`📥 Total transactions from Brex: ${allTransactions.length}`);

    // Show first 10 transactions with their raw dates
    console.log('\n📅 First 10 Brex transactions with raw dates:');
    console.log('Index | Raw Date | Parsed Date | Description | Amount | Type');
    console.log('-'.repeat(100));
    
    allTransactions.slice(0, 10).forEach((t, i) => {
      const rawDate = String(t.date);
      const parsedDate = new Date(t.date);
      console.log(`${i.toString().padStart(5)} | ${rawDate.padEnd(25)} | ${parsedDate.toLocaleDateString().padEnd(12)} | ${t.description.substring(0, 25).padEnd(25)} | ${t.amount.toString().padEnd(10)} | ${t.type}`);
    });

    // Show transactions around Oct 25 and Nov 10
    console.log('\n🔍 Transactions around critical dates (Oct 25 and Nov 10):');
    const criticalTransactions = allTransactions.filter(t => {
      const date = new Date(t.date);
      const oct20 = new Date('2025-10-20');
      const nov15 = new Date('2025-11-15');
      return date >= oct20 && date <= nov15;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log('Raw Date | Parsed Date | Compare to Latest | Description | Amount');
    console.log('-'.repeat(90));
    
    criticalTransactions.forEach(t => {
      const date = new Date(t.date);
      const comparison = latestDate ? 
        (date > latestDate ? 'NEWER ✅' : 
         date.toDateString() === latestDate.toDateString() ? 'SAME 📅' : 'OLDER ❌') : 'N/A';
      
      console.log(`${String(t.date).padEnd(25)} | ${date.toLocaleDateString().padEnd(12)} | ${comparison.padEnd(10)} | ${t.description.substring(0, 20).padEnd(20)} | ${t.amount}`);
    });

    // Test the exact filtering logic from the sync service
    console.log('\n🧪 Testing filtering logic...');
    let filteredCount = 0;
    let newCount = 0;
    let duplicateCheckCount = 0;
    
    allTransactions.forEach(t => {
      const transactionDate = new Date(t.date);
      
      // Apply the same filtering logic as in sync service
      if (!latestDate) {
        newCount++;
        return;
      }
      
      // Only add transactions that are newer than the latest date in the table
      if (transactionDate < latestDate) {
        filteredCount++;
        if (filteredCount <= 5) {
          console.log(`   ⏭️ Would skip old transaction: ${transactionDate.toLocaleDateString()} - ${t.description.substring(0, 30)}`);
        }
        return;
      }
      
      // For transactions on the same date as latest date, check for duplicates
      if (transactionDate.toDateString() === latestDate.toDateString()) {
        duplicateCheckCount++;
        console.log(`   🔍 Would check for duplicate on latest date: ${transactionDate.toLocaleDateString()} - ${t.description.substring(0, 30)}`);
        return;
      }
      
      newCount++;
      if (newCount <= 10) {
        console.log(`   ➕ Would add new transaction: ${transactionDate.toLocaleDateString()} - ${t.description.substring(0, 30)}`);
      }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Filtered out (old): ${filteredCount}`);
    console.log(`   Duplicate checks needed: ${duplicateCheckCount}`);
    console.log(`   New transactions: ${newCount}`);

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

debugBrexDates().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});