import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleSheetClient } from './google-sheet.client';
import { BrexParser } from './parsers/brex.parser';

dotenv.config();

async function debugDuplicateDetection() {
  console.log('🔍 Debug: Duplicate Detection Logic\n');

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ],
    providers: [
      ConfigService,
      GoogleSheetClient,
      BrexParser
    ],
  }).compile();

  const configService = module.get<ConfigService>(ConfigService);
  const googleSheetClient = new GoogleSheetClient(configService);
  const brexParser = new BrexParser(configService);

  try {
    await googleSheetClient.initialize();

    // Get latest date info from Google Sheets
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    
    console.log('📊 Latest date info from Google Sheets:');
    console.log(`• Latest date: ${latestDate}`);
    console.log(`• Existing transactions on latest date: ${existingFromLatestDate.length}`);
    existingFromLatestDate.forEach((existing, i) => {
      console.log(`   ${i+1}. "${existing.date}" | "${existing.description}" | "${existing.amount}"`);
    });

    // Get Brex transactions for 21/11
    console.log('\n📡 Getting Brex transactions...');
    const allTransactions = await brexParser.fetchTransactions();
    
    // Filter only transactions from 21/11
    const nov21Transactions = allTransactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.toLocaleDateString('en-US') === latestDate?.toLocaleDateString('en-US');
    });
    
    console.log(`\n🔍 Found ${nov21Transactions.length} Brex transactions for ${latestDate?.toLocaleDateString()}:`);
    
    nov21Transactions.forEach((t, i) => {
      // Format the same way as sync service does
      const transactionDate = new Date(t.date);
      const day = String(transactionDate.getDate()).padStart(2, '0');
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
      const year = String(transactionDate.getFullYear()).slice(-2);
      const formattedDate = `${day}/${month}/${year}`;
      
      const formatAmountWithCommas = (amount: number): string => {
        return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      };
      
      const amountSign = t.type === 'income' ? '' : '-';
      const amountValue = amountSign + '$' + formatAmountWithCommas(t.amount);
      
      let toFrom;
      if (t.account === 'Brex Card') {
        toFrom = t.brexData?.originalDescription || t.description || 'GENERECT, INC.';
      } else if (t.memo) {
        toFrom = t.memo;
      } else {
        toFrom = t.description || 'GENERECT, INC.';
      }
      
      console.log(`\n   ${i+1}. Brex transaction:`);
      console.log(`      • Raw date: ${t.date}`);
      console.log(`      • Formatted date: "${formattedDate}"`);
      console.log(`      • Description: "${toFrom}"`);
      console.log(`      • Amount: "${amountValue}"`);
      console.log(`      • Account: "${t.account}"`);
      console.log(`      • Type: "${t.type}"`);
      
      // Check if this matches any existing transaction
      const isDuplicate = existingFromLatestDate.some(existing => {
        const dateMatch = existing.date === formattedDate;
        const amountMatch = existing.amount === amountValue;
        const descriptionMatch = existing.description === toFrom;
        
        console.log(`      • Comparing with existing: "${existing.date}" | "${existing.description}" | "${existing.amount}"`);
        console.log(`        - Date match: ${dateMatch} (${existing.date} === ${formattedDate})`);
        console.log(`        - Amount match: ${amountMatch} (${existing.amount} === ${amountValue})`);
        console.log(`        - Description match: ${descriptionMatch} (${existing.description} === ${toFrom})`);
        
        return dateMatch && amountMatch && descriptionMatch;
      });
      
      console.log(`      • Is duplicate: ${isDuplicate ? '✅ YES' : '❌ NO'}`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }

  process.exit(0);
}

debugDuplicateDetection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});