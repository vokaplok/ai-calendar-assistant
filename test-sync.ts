import { ConfigService } from '@nestjs/config';
import { TransactionSyncService } from './src/transactions/transaction-sync.service';

async function testTransactionSync() {
  console.log('🧪 Testing Transaction Sync Service locally...\n');

  // Create mock config service for testing
  const mockConfigService = {
    get: (key: string) => {
      switch (key) {
        case 'GOOGLE_SHEETS_SPREADSHEET_ID':
          return 'test-spreadsheet-id';
        case 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE':
          return './credentials/service-account.json';
        case 'STRIPE_SECRET_KEY':
          return null; // No Stripe key for test
        case 'BREX_API_KEY':
          return null; // No Brex key for test
        case 'PRIVATBANK_API_TOKEN':
          return null; // No PrivatBank key for test
        case 'PRIVATBANK_MERCHANT_ID':
          return null;
        default:
          return null;
      }
    }
  } as ConfigService;

  try {
    const syncService = new TransactionSyncService(mockConfigService);
    
    console.log('📡 Testing API connections...');
    const connectionResults = await syncService.testConnections();
    console.log(`Connection test result: ${connectionResults ? '✅' : '❌'}\n`);

    console.log('🔄 Testing sync with empty configuration...');
    const syncResults = await syncService.syncAll(['stripe']); // Try only Stripe as test
    
    console.log('📊 Sync results:');
    syncService.printSummary(syncResults);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 This is expected - we need proper API credentials configured.');
    console.log('To run real sync, add these to .env:');
    console.log('- GOOGLE_SHEETS_SPREADSHEET_ID');
    console.log('- GOOGLE_SERVICE_ACCOUNT_KEY_FILE'); 
    console.log('- STRIPE_SECRET_KEY');
    console.log('- BREX_API_KEY');
    console.log('- PRIVATBANK_API_TOKEN');
    console.log('- PRIVATBANK_MERCHANT_ID');
  }
}

// Run the test
testTransactionSync().then(() => {
  console.log('\n✅ Test completed');
}).catch(error => {
  console.error('❌ Test error:', error);
});