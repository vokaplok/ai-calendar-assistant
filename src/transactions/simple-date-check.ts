import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function simpleDateCheck() {
  console.log('🔍 Simple date check...\n');

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ],
    providers: [
      ConfigService,
      GoogleSheetClient
    ],
  }).compile();

  const configService = module.get<ConfigService>(ConfigService);
  const googleSheetClient = new GoogleSheetClient(configService);

  try {
    // Initialize Google Sheets
    await googleSheetClient.initialize();

    // Get latest transaction info using the method from the sync service
    console.log('📋 Using getLatestTransactionInfo method...');
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    
    console.log(`📅 Method says latest date: ${latestDate ? latestDate.toLocaleDateString() : 'none'}`);
    console.log(`📅 Method says latest date (ISO): ${latestDate ? latestDate.toISOString().split('T')[0] : 'none'}`);
    console.log(`📊 Transactions on latest date: ${existingFromLatestDate.length}`);
    
    if (existingFromLatestDate.length > 0) {
      console.log('📋 Sample transactions from latest date:');
      existingFromLatestDate.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.date} - ${t.description} - ${t.amount}`);
      });
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

simpleDateCheck().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});