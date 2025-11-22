#!/bin/bash

# 🧪 Тестовий скрипт для перевірки підключення до Google Sheets
# Запустіть цей файл на вашій локальній машині

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║     🧪 TESTING GOOGLE SHEETS CONNECTION 🧪               ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Перевірка що ми в правильній папці
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found"
  echo "Please run this script from the transaction-parser directory"
  echo "Example: cd transaction-parser && bash run-test.sh"
  exit 1
fi

# Перевірка service account файлу
if [ ! -f "credentials/service-account.json" ]; then
  echo "❌ Error: credentials/service-account.json not found"
  echo ""
  echo "Please copy your service account file:"
  echo "  cp analyti-426810-ca83ec70234f.json credentials/service-account.json"
  echo ""
  exit 1
fi

echo "✅ Service account file found"

# Перевірка .env файлу
if [ ! -f ".env" ]; then
  echo "❌ Error: .env file not found"
  echo ""
  echo "Please create .env file:"
  echo "  cp .env.example .env"
  echo ""
  exit 1
fi

echo "✅ .env file found"

# Перевірка node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

echo "✅ Dependencies installed"
echo ""

# Запуск тесту
echo "🚀 Running connection test..."
echo ""

node test-connection.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║                                                           ║"
  echo "║              ✅ TEST SUCCESSFUL! ✅                       ║"
  echo "║                                                           ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo "🔗 Check your Google Sheet:"
  echo "https://docs.google.com/spreadsheets/d/1UxU5KX8RKQAWTuU7hLbCrQxq1gWwjT9ZchoNpl0tIr8/"
  echo ""
  echo "You should see:"
  echo "  - A new 'Brex' tab"
  echo "  - Headers in the first row"
  echo "  - A test transaction: 🧪 TEST TRANSACTION - Coffee Shop"
  echo ""
else
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║                                                           ║"
  echo "║                ❌ TEST FAILED ❌                          ║"
  echo "║                                                           ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo "Common issues:"
  echo ""
  echo "1. Permission denied:"
  echo "   - Make sure Service Account has Editor access to the Sheet"
  echo "   - Share the sheet with the email from service-account.json"
  echo ""
  echo "2. Invalid credentials:"
  echo "   - Verify service-account.json is valid JSON"
  echo "   - Verify GOOGLE_SHEET_ID in .env is correct"
  echo ""
  exit 1
fi
