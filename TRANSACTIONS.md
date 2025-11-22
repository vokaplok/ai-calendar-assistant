# Transaction Sync Configuration

This document describes how to configure the transaction synchronization feature.

## Overview

The transaction sync service integrates with:
- ✅ **Google Sheets** - Data storage and reporting
- ✅ **Brex** - Corporate card transactions  
- ✅ **Stripe** - Payment processing transactions
- ❌ **PrivatBank** - Removed (Ukrainian bank, not needed)

## Setup

### 1. Google Sheets Configuration

1. **Spreadsheet**: https://docs.google.com/spreadsheets/d/1FFajYkLr2P-ubokaotd7ccKUSDpcO9cSvOaCa-plm2c/
2. **Service Account**: Place `service-account.json` in `./credentials/`
3. **Environment Variable**: `GOOGLE_SHEETS_SPREADSHEET_ID=1FFajYkLr2P-ubokaotd7ccKUSDpcO9cSvOaCa-plm2c`

### 2. Payment API Configuration

Add to `.env`:
```env
# Stripe (optional)
STRIPE_SECRET_KEY=sk_live_...

# Brex (optional)  
BREX_API_KEY=your-brex-api-key
```

## Usage

### Telegram Bot Command
```
/transactions
```

### HTTP Endpoint (Development)
```bash
curl http://localhost:3002/telegram/test-transactions
```

### Manual Testing
```bash
# Test connections only
npm run test-connections

# Run full sync
npm run sync-transactions
```

## How It Works

1. **Initialize**: Connect to Google Sheets using service account
2. **Fetch**: Get transactions from each configured API
3. **Filter**: Remove duplicates by checking existing transaction IDs  
4. **Sync**: Add only new transactions to Google Sheets
5. **Report**: Generate summary with counts and errors

## Data Structure

Each transaction includes:
- `id` - Unique identifier
- `date` - Transaction date (ISO format)
- `amount` - Amount (normalized to base currency)
- `currency` - Currency code (USD, EUR, etc.)
- `description` - Transaction description
- `type` - 'income' or 'expense'
- `category` - Auto-categorized transaction type
- `account` - Source account/service name
- `reference` - Additional reference data

## Error Handling

- Missing API keys → Skip that service gracefully
- Network errors → Retry with exponential backoff
- Google Sheets errors → Log and continue
- Duplicate transactions → Automatically filtered out

## Security

- Service account key is **never committed** to git
- All credentials stored in ignored `./credentials/` directory
- Production uses environment variables or platform secrets
- API keys are optional - missing keys just skip that service

## Production Deployment

The transaction sync works in production without external dependencies:
- No `npm spawn` processes 
- Pure TypeScript service integration
- Docker-compatible credential management
- Proper error handling for missing configurations