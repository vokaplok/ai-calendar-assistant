import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TransactionSyncService } from './transaction-sync.service';

// Load environment variables
dotenv.config();

async function testBrexSync() {
  console.log('🚀 Starting Brex sync test...\n');

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ],
    providers: [
      TransactionSyncService,
      ConfigService,
    ],
  }).compile();

  const syncService = module.get<TransactionSyncService>(TransactionSyncService);

  try {
    // Test connections
    console.log('📡 Testing API connections...');
    const connectionsOk = await syncService.testConnections();
    
    if (!connectionsOk) {
      console.log('⚠️ Some connections failed. Check your API keys and credentials.');
    }

    // Sync only Brex transactions
    console.log('\n📊 Syncing Brex transactions...');
    const results = await syncService.syncAll(['brex']);

    // Print summary
    syncService.printSummary(results);

    console.log('\n✅ Test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

// Run the test
testBrexSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});