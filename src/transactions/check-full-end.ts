import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GoogleSheetClient } from './google-sheet.client';

// Load environment variables
dotenv.config();

async function checkFullEnd() {
  console.log('🔍 Checking FULL end of Google Sheet...\n');

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

    // Read ALL data from sheet
    const range = `Auto_input.Brex!A:D`;
    const response = await googleSheetClient['sheets'].spreadsheets.values.get({
      spreadsheetId: googleSheetClient['spreadsheetId'],
      range: range,
    });

    const values = response.data.values || [];
    console.log(`📊 Total rows in sheet: ${values.length}`);
    
    // Show LAST 30 rows
    const lastRows = values.slice(-30);
    console.log('\n📅 LAST 30 transactions in sheet:');
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

    // Parse all dates to find the actual latest one
    console.log('\n🔍 Finding actual latest date...');
    let actualLatestDate: Date | null = null;
    let actualLatestDateStr = '';
    
    for (let i = 1; i < values.length; i++) {
      if (values[i] && values[i][0]) {
        const dateStr = values[i][0].trim();
        const [month, day, year] = dateStr.split('/').map(num => parseInt(num, 10));
        
        if (day && month && year && month <= 12 && day <= 31) {
          let fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
          if (fullYear >= 2020 && fullYear <= 2030) {
            const parsedDate = new Date(fullYear, month - 1, day);
            
            if (!isNaN(parsedDate.getTime())) {
              if (!actualLatestDate || parsedDate > actualLatestDate) {
                actualLatestDate = parsedDate;
                actualLatestDateStr = dateStr;
              }
            }
          }
        }
      }
    }

    console.log(`📅 Actual latest date found: ${actualLatestDateStr} = ${actualLatestDate ? actualLatestDate.toLocaleDateString() : 'none'}`);
    console.log(`📅 ISO format: ${actualLatestDate ? actualLatestDate.toISOString().split('T')[0] : 'none'}`);

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }

  process.exit(0);
}

checkFullEnd().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});