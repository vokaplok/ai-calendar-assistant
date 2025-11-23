import { ConfigService } from '@nestjs/config';
import { GoogleSheetClient } from './google-sheet.client';

async function cleanBrexData() {
  const config = new ConfigService();
  const sheetClient = new GoogleSheetClient(config);
  
  await sheetClient.initialize();
  
  // Get structure of Auto_input.Brex to see what was added
  console.log('📋 Checking Auto_input.Brex sheet structure...');
  const structure = await sheetClient.getSheetStructure('Auto_input.Brex');
  
  if (structure) {
    console.log('\n🔍 Recent entries analysis:');
    
    // Look for entries with "Brex transaction" which indicates bad data
    for (let i = 0; i < Math.min(structure.length, 10); i++) {
      const row = structure[i];
      if (row && row.length > 1) {
        console.log(`Row ${i + 1}:`, row.slice(0, 5)); // Show first 5 columns
        
        // Check if this looks like bad data
        if (row[1] === 'Brex transaction' || row[4] === 'Brex transaction') {
          console.log(`   ⚠️  Row ${i + 1} contains invalid "Brex transaction" data`);
        }
      }
    }
  }
}

cleanBrexData().catch(console.error);