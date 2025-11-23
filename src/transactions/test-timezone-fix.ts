import * as dotenv from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TransactionSyncService } from './transaction-sync.service';

// Load environment variables
dotenv.config();

async function testTimezoneFix() {
  console.log('🧪 Testing timezone fix in sync service...\n');

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
    console.log('📊 Running Brex sync with timezone fix...');
    const results = await syncService.syncAll(['brex']);

    console.log('\n' + '='.repeat(60));
    console.log('📋 SYNC RESULTS WITH TIMEZONE FIX');
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
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testTimezoneFix().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});