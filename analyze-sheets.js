const { google } = require('googleapis');
require('dotenv').config();

async function analyzeSheets() {
  console.log('🔍 Analyzing Google Sheets structure...');
  
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: './credentials/service-account.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    // Get spreadsheet info
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log(`📋 Spreadsheet: "${spreadsheet.data.properties?.title}"`);
    
    // List all sheets
    const allSheets = spreadsheet.data.sheets?.map(sheet => sheet.properties?.title) || [];
    console.log(`📊 All sheets:`, allSheets);
    
    // Find Auto_input sheets
    const autoInputSheets = allSheets.filter(name => name?.startsWith('Auto_input'));
    console.log(`🎯 Auto_input sheets:`, autoInputSheets);
    
    // Analyze each Auto_input sheet
    for (const sheetName of autoInputSheets) {
      console.log(`\n🔍 Analyzing ${sheetName}...`);
      
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!1:3`, // First 3 rows
        });

        if (response.data.values) {
          console.log(`   Headers (row 1):`, response.data.values[0]);
          if (response.data.values[1]) {
            console.log(`   Sample data (row 2):`, response.data.values[1]);
          }
          if (response.data.values[2]) {
            console.log(`   Sample data (row 3):`, response.data.values[2]);
          }
        } else {
          console.log(`   No data found`);
        }
      } catch (err) {
        console.log(`   ❌ Error reading ${sheetName}:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

analyzeSheets();