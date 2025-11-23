import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BrexParser } from './parsers/brex.parser';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function checkBrexGap() {
  console.log('🔍 Checking Brex transaction gap...\n');

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
    console.log('📋 Checking current sheet data...');
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    
    console.log(`📅 Latest date in sheet: ${latestDate ? latestDate.toLocaleDateString() : 'none'}`);
    console.log(`📊 Transactions on latest date: ${existingFromLatestDate.length}`);

    // Fetch raw transactions from Brex
    console.log('\n📡 Fetching Brex transactions...');
    const allTransactions = await brexParser.fetchTransactions();
    console.log(`📥 Total transactions from Brex: ${allTransactions.length}`);

    // Group transactions by date
    const transactionsByDate = new Map<string, number>();
    allTransactions.forEach(t => {
      const dateStr = new Date(t.date).toLocaleDateString();
      transactionsByDate.set(dateStr, (transactionsByDate.get(dateStr) || 0) + 1);
    });

    // Show transactions by date from October 10 to November 25
    console.log('\n📅 Transactions by date (Oct 10 - Nov 25):');
    const startDate = new Date('2025-10-10');
    const endDate = new Date('2025-11-25');
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toLocaleDateString();
      const count = transactionsByDate.get(dateStr) || 0;
      const indicator = count > 0 ? '✅' : '❌';
      console.log(`   ${indicator} ${dateStr}: ${count} transactions`);
    }

    // Check specific gap period
    console.log('\n🔍 Checking for missing transactions between Oct 11 and Oct 24...');
    const gapTransactions = allTransactions.filter(t => {
      const date = new Date(t.date);
      return date >= new Date('2025-10-12') && date <= new Date('2025-10-24');
    });

    console.log(`📊 Found ${gapTransactions.length} transactions in potential gap period:`);
    gapTransactions.forEach(t => {
      console.log(`   • ${new Date(t.date).toLocaleDateString()} - ${t.description} - ${t.type} ${t.amount}`);
    });

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }

  process.exit(0);
}

checkBrexGap().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});