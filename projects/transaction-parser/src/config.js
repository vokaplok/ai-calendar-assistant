import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  // Google Sheets
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || join(__dirname, '../credentials/service-account.json'),
    sheetNames: {
      brex: 'Brex',
      stripe: 'Stripe',
      privatbank: 'PrivatBank'
    }
  },

  // Brex
  brex: {
    apiKey: process.env.BREX_API_KEY,
    companyId: process.env.BREX_COMPANY_ID,
    baseUrl: 'https://platform.brexapis.com'
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: '2023-10-16'
  },

  // PrivatBank
  privatbank: {
    merchantId: process.env.PRIVATBANK_MERCHANT_ID,
    merchantPassword: process.env.PRIVATBANK_MERCHANT_PASSWORD,
    apiToken: process.env.PRIVATBANK_API_TOKEN,
    cardNumber: process.env.PRIVATBANK_CARD_NUMBER,
    baseUrl: 'https://api.privatbank.ua'
  },

  // General
  initialFetchDays: parseInt(process.env.INITIAL_FETCH_DAYS || '30', 10),
  debug: process.env.DEBUG === 'true'
};

// Validate required config
export function validateConfig() {
  const errors = [];

  if (!config.googleSheets.spreadsheetId) {
    errors.push('GOOGLE_SHEET_ID is required');
  }

  if (!config.brex.apiKey) {
    errors.push('BREX_API_KEY is required');
  }

  if (!config.stripe.secretKey) {
    errors.push('STRIPE_SECRET_KEY is required');
  }

  if (!config.privatbank.apiToken && !config.privatbank.merchantId) {
    errors.push('PRIVATBANK_API_TOKEN or PRIVATBANK_MERCHANT_ID is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
