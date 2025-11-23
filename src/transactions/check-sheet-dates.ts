import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function checkSheetDates() {
  console.log('🔍 Checking actual dates in Google Sheet...\n');

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
    console.log('📊 Connecting to Google Sheets...');
    await googleSheetClient.initialize();

    // Get last 20 rows of data
    console.log('📋 Reading last 20 rows from Auto_input.Brex sheet...');
    
    const range = `Auto_input.Brex!A:D`; // Date, Description, Amount, Account columns
    const response = await googleSheetClient['sheets'].spreadsheets.values.get({
      spreadsheetId: googleSheetClient['spreadsheetId'],
      range: range,
    });

    const values = response.data.values || [];
    console.log(`📊 Total rows in sheet: ${values.length}`);
    
    if (values.length === 0) {
      console.log('❌ No data found in sheet');
      return;
    }

    // Show header
    console.log('📋 Header:', values[0]);
    
    // Show last 15 rows
    const lastRows = values.slice(-15);
    console.log('\n📅 Last 15 transactions in sheet:');
    console.log('Row | Date | Description | Amount | Account');
    console.log('-'.repeat(80));
    
    lastRows.forEach((row, index) => {
      const actualIndex = values.length - lastRows.length + index;
      const date = row[0] || 'N/A';
      const description = (row[1] || 'N/A').substring(0, 30);
      const amount = row[2] || 'N/A';
      const account = row[3] || 'N/A';
      
      console.log(`${actualIndex.toString().padStart(3)} | ${date.padEnd(10)} | ${description.padEnd(30)} | ${amount.padEnd(10)} | ${account}`);
    });

    // Test date parsing logic
    console.log('\n🔍 Testing date parsing for last few rows:');
    const testRows = values.slice(-5);
    
    testRows.forEach((row, index) => {
      if (row[0]) {
        const dateStr = row[0].trim();
        console.log(`\nOriginal: "${dateStr}"`);
        
        // Try DD/MM/YY format (current code logic)
        const [day, month, year] = dateStr.split('/').map(num => parseInt(num, 10));
        if (day && month && year) {
          const fullYear = year < 50 ? 2000 + year : 1900 + year;
          const parsedDate = new Date(fullYear, month - 1, day);
          console.log(`  DD/MM/YY: ${parsedDate.toLocaleDateString()} (${parsedDate.toISOString().split('T')[0]})`);
        }
        
        // Try MM/DD/YY format
        if (day && month && year) {
          const fullYear = year < 50 ? 2000 + year : 1900 + year;
          const parsedDateUS = new Date(fullYear, day - 1, month); // Swap day and month
          console.log(`  MM/DD/YY: ${parsedDateUS.toLocaleDateString()} (${parsedDateUS.toISOString().split('T')[0]})`);
        }
        
        // Try direct parsing
        const directParse = new Date(dateStr);
        console.log(`  Direct:   ${directParse.toLocaleDateString()} (${directParse.toISOString().split('T')[0]})`);
      }
    });

  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

checkSheetDates().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});