import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BrexParser } from './parsers/brex.parser';
import { GoogleSheetClient } from './google-sheet.client';
import { Transaction } from './parsers/base.parser';

// Load environment variables
dotenv.config();

async function fillBrexGap() {
  console.log('🔄 Filling Brex transaction gap between Oct 11-24...\n');

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

    // Fetch all Brex transactions
    console.log('📡 Fetching Brex transactions...');
    const allTransactions = await brexParser.fetchTransactions();
    console.log(`📥 Total transactions from Brex: ${allTransactions.length}`);

    // Filter for gap period: Oct 12 to Oct 24 (inclusive)
    const gapStart = new Date('2025-10-12');
    const gapEnd = new Date('2025-10-24T23:59:59');
    
    const gapTransactions = allTransactions.filter(t => {
      const date = new Date(t.date);
      return date >= gapStart && date <= gapEnd;
    });

    console.log(`\n🔍 Found ${gapTransactions.length} transactions in gap period (Oct 12-24):`);
    
    if (gapTransactions.length === 0) {
      console.log('✅ No missing transactions found in gap period');
      process.exit(0);
    }

    // Sort by date (oldest first)
    gapTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Show transactions to be added
    gapTransactions.forEach((t, i) => {
      console.log(`   ${i + 1}. ${new Date(t.date).toLocaleDateString()} - ${t.description} - ${t.type} ${t.amount}`);
    });

    console.log(`\n🚀 Adding ${gapTransactions.length} missing transactions to Auto_input.Brex sheet...`);

    // Add transactions to sheet
    const addedCount = await googleSheetClient.addTransactions('Auto_input.Brex', gapTransactions);
    
    console.log(`\n✅ Successfully added ${addedCount} gap transactions to Auto_input.Brex!`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 GAP FILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Gap period: Oct 12-24, 2025`);
    console.log(`✅ Transactions added: ${addedCount}`);
    console.log(`✅ Gap filled successfully!`);
    
  } catch (error) {
    console.error('❌ Gap fill failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

fillBrexGap().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});