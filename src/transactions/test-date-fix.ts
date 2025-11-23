import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function testDateFix() {
  console.log('🧪 Testing date parsing fix...\n');

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
    await googleSheetClient.initialize();

    // Test manual date parsing
    console.log('🔍 Testing manual date parsing:');
    const testDateString = "21/11/25";
    console.log(`Original string: "${testDateString}"`);
    
    const [day, month, year] = testDateString.split('/').map(num => parseInt(num, 10));
    console.log(`Parsed parts: day=${day}, month=${month}, year=${year}`);
    
    let fullYear = year < 50 ? 2000 + year : 1900 + year;
    console.log(`Full year: ${fullYear}`);
    
    const parsedDate = new Date(fullYear, month - 1, day);
    console.log(`JavaScript Date: ${parsedDate}`);
    console.log(`Local date string: ${parsedDate.toLocaleDateString()}`);
    console.log(`ISO string: ${parsedDate.toISOString()}`);
    console.log(`ISO date only: ${parsedDate.toISOString().split('T')[0]}`);

    // Test the actual method
    console.log('\n🔍 Testing actual getLatestTransactionInfo method:');
    const { latestDate, existingFromLatestDate } = await googleSheetClient.getLatestTransactionInfo('Auto_input.Brex');
    console.log(`Method returned date: ${latestDate}`);
    console.log(`Method returned date ISO: ${latestDate?.toISOString()}`);
    console.log(`Method returned date ISO date: ${latestDate?.toISOString().split('T')[0]}`);

    // Test comparison with a known Brex transaction date
    console.log('\n🔍 Testing date comparison:');
    const brexTransactionDate = new Date('2025-11-21T00:00:00.000Z'); // What Brex would return
    console.log(`Brex transaction date: ${brexTransactionDate}`);
    console.log(`Brex transaction ISO: ${brexTransactionDate.toISOString()}`);
    
    if (latestDate) {
      console.log(`latestDate < brexTransactionDate: ${latestDate < brexTransactionDate}`);
      console.log(`latestDate.toDateString() === brexTransactionDate.toDateString(): ${latestDate.toDateString() === brexTransactionDate.toDateString()}`);
      
      // The problem might be in timezone handling
      console.log(`latestDate getTime: ${latestDate.getTime()}`);
      console.log(`brexTransactionDate getTime: ${brexTransactionDate.getTime()}`);
      console.log(`Difference in milliseconds: ${brexTransactionDate.getTime() - latestDate.getTime()}`);
      console.log(`Difference in hours: ${(brexTransactionDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60)}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testDateFix().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});