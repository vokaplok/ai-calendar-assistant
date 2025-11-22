#!/usr/bin/env node

/**
 * Test script to verify Google Sheets connection
 * Adds a test transaction to verify everything works
 */

import { GoogleSheetClient } from './src/sheet/google-sheet.js';
import { config } from './src/config.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    console.log('\n🧪 Testing Google Sheets Connection...\n');
    console.log('Sheet ID:', config.googleSheets.spreadsheetId);
    console.log('Credentials:', config.googleSheets.serviceAccountKeyPath);
    console.log('');

    // Initialize Google Sheets client
    const sheetClient = new GoogleSheetClient();
    await sheetClient.initialize();

    console.log('\n✅ Successfully connected to Google Sheets!\n');

    // Create a test transaction (similar to Brex format)
    const testTransaction = {
      id: `test_${Date.now()}`,
      date: new Date().toISOString(),
      description: '🧪 TEST TRANSACTION - Coffee Shop',
      amount: 4.50,
      currency: 'USD',
      category: 'Meals & Entertainment',
      status: 'posted',
      merchant: 'Test Coffee Shop',
      cardLast4: '1234',
      user: 'Test User'
    };

    console.log('📝 Test transaction to add:');
    console.log(JSON.stringify(testTransaction, null, 2));
    console.log('');

    // Add test transaction to Brex sheet
    console.log('📤 Adding test transaction to Brex sheet...\n');
    await sheetClient.appendTransactions('Brex', [testTransaction]);

    console.log('\n✅ SUCCESS! Test transaction added to Google Sheet');
    console.log('\n🔗 Check your sheet:');
    console.log(`https://docs.google.com/spreadsheets/d/${config.googleSheets.spreadsheetId}/`);
    console.log('\n💡 Look for the "Brex" tab with your test transaction\n');

    // Get existing IDs to verify
    const existingIds = await sheetClient.getExistingIds('Brex');
    console.log(`📊 Total transactions in Brex sheet: ${existingIds.size}`);

    if (existingIds.has(testTransaction.id)) {
      console.log('✅ Test transaction ID found in sheet!\n');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);

    if (error.message.includes('credentials')) {
      console.error('\n💡 Make sure:');
      console.error('   1. credentials/service-account.json exists');
      console.error('   2. GOOGLE_SHEET_ID is set in .env\n');
    } else if (error.message.includes('permission')) {
      console.error('\n💡 Make sure:');
      console.error('   1. Service Account email has Editor access to your Google Sheet');
      console.error('   2. Check the "client_email" in your service-account.json');
      console.error('   3. Share the sheet with that email\n');
    }

    process.exit(1);
  }
}

testConnection();
