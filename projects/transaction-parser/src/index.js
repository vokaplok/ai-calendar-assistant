#!/usr/bin/env node

import { TransactionSync } from './sync.js';
import { config, validateConfig } from './config.js';

/**
 * Main entry point for transaction sync
 */
async function main() {
  try {
    // Print header
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║       🏦  MULTI-API TRANSACTION PARSER & SYNC  🏦        ║');
    console.log('║                                                           ║');
    console.log('║          Brex • Stripe • PrivatBank → Google Sheets       ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    // Validate configuration
    console.log('🔧 Validating configuration...');
    validateConfig();
    console.log('✅ Configuration valid\n');

    // Create sync instance
    const sync = new TransactionSync();
    await sync.initialize();

    // Handle commands
    switch (command) {
      case 'test':
        // Test API connections
        console.log('🧪 Running connection tests...\n');
        const success = await sync.testConnections();
        process.exit(success ? 0 : 1);
        break;

      case 'brex':
        // Sync only Brex
        console.log('🔄 Syncing Brex only...\n');
        const brexResults = await sync.syncAll(['brex']);
        sync.printSummary(brexResults);
        break;

      case 'stripe':
        // Sync only Stripe
        console.log('🔄 Syncing Stripe only...\n');
        const stripeResults = await sync.syncAll(['stripe']);
        sync.printSummary(stripeResults);
        break;

      case 'privatbank':
      case 'pb':
        // Sync only PrivatBank
        console.log('🔄 Syncing PrivatBank only...\n');
        const pbResults = await sync.syncAll(['privatbank']);
        sync.printSummary(pbResults);
        break;

      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;

      default:
        // Sync all sources
        console.log('🔄 Syncing all sources...\n');
        const results = await sync.syncAll();
        sync.printSummary(results);
        break;
    }

    console.log('✅ Sync completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (config.debug) {
      console.error('\n📋 Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
📚 Usage: npm start [command]

Commands:
  (none)          Sync all sources (Brex, Stripe, PrivatBank)
  test            Test API connections without syncing
  brex            Sync only Brex transactions
  stripe          Sync only Stripe transactions
  privatbank      Sync only PrivatBank transactions
  help            Show this help message

Examples:
  npm start              # Sync all sources
  npm start test         # Test connections
  npm start brex         # Sync only Brex
  npm start stripe       # Sync only Stripe
  npm start privatbank   # Sync only PrivatBank

Environment Variables:
  See .env.example for required configuration

Configuration:
  - Google Sheet ID: ${config.googleSheets.spreadsheetId || '(not set)'}
  - Brex API: ${config.brex.apiKey ? '✅ configured' : '❌ not configured'}
  - Stripe API: ${config.stripe.secretKey ? '✅ configured' : '❌ not configured'}
  - PrivatBank API: ${config.privatbank.apiToken ? '✅ configured' : '❌ not configured'}

For more information, see README.md
  `);
}

// Run main function
main();
