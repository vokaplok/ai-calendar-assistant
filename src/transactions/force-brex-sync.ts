import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TransactionSyncService } from './transaction-sync.service';

// Load environment variables
dotenv.config();

async function forceBrexSync() {
  console.log('🔄 Starting forced Brex sync...\n');

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
    // Test connections first
    console.log('📡 Testing API connections...');
    const connectionsOk = await syncService.testConnections();
    
    if (!connectionsOk) {
      console.log('⚠️ Some connections failed. Check your API keys and credentials.');
      console.log('Proceeding anyway - sync might still work...\n');
    }

    // Force sync Brex transactions with the improved logic
    console.log('📊 Force syncing Brex transactions...');
    const results = await syncService.syncAll(['brex']);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 SYNC RESULTS');
    console.log('='.repeat(60));
    
    if (results && results.length > 0) {
      const brexResult = results[0];
      console.log(`✅ Brex: ${brexResult.new} new transactions added (${brexResult.total} total processed)`);
      
      if (brexResult.errors && brexResult.errors.length > 0) {
        console.log(`⚠️  Errors encountered:`);
        brexResult.errors.forEach(error => console.log(`   - ${error}`));
      }
    }

    syncService.printSummary(results);
    console.log('\n✅ Forced sync completed!');
    
  } catch (error) {
    console.error('❌ Forced sync failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

// Run the forced sync
forceBrexSync().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});