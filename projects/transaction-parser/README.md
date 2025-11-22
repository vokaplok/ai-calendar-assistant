# 🏦 Multi-API Transaction Parser & Sync

Автоматична синхронізація транзакцій з **Brex**, **Stripe** та **ПриватБанк** в **Google Sheets**.

## ✨ Особливості

- **ID-based архітектура** - гарантує відсутність дублікатів
- **Підтримка 3 джерел** - Brex, Stripe, ПриватБанк
- **Автоматична синхронізація** - додає тільки нові транзакції
- **Google Sheets інтеграція** - зручний перегляд та аналіз
- **Нормалізація даних** - єдиний формат для всіх джерел
- **Легке налаштування** - мінімальна конфігурація

## 🏗️ Архітектура (ID-based)

```
┌─────────────┐
│  Brex API   │────┐
└─────────────┘    │
                   │
┌─────────────┐    │      ┌──────────────┐      ┌───────────────┐
│ Stripe API  │────┼─────▶│ Sync Engine  │─────▶│ Google Sheets │
└─────────────┘    │      └──────────────┘      └───────────────┘
                   │             │
┌─────────────┐    │             ▼
│PrivatBank   │────┘      1. Fetch all transactions
└─────────────┘           2. Get existing IDs from Sheet
                          3. Filter new transactions
                          4. Append only new ones
```

**Чому ID-based?**
- ✅ 100% гарантія відсутності дублікатів
- ✅ Працює навіть якщо транзакції оновлюються
- ✅ Не потрібне додаткове сховище стану
- ✅ Просто і надійно

## 📋 Вимоги

- Node.js >= 18.x
- Google Cloud Service Account (для Google Sheets)
- API ключі від Brex, Stripe, ПриватБанк

## 🚀 Швидкий старт

### 1. Встановлення

```bash
cd transaction-parser
npm install
```

### 2. Налаштування Google Sheets

#### a) Створіть Google Cloud проєкт

1. Перейдіть на https://console.cloud.google.com
2. Створіть новий проєкт
3. Увімкніть Google Sheets API
4. Створіть Service Account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Назва: `transaction-sync`
   - Надайте роль: `Editor`
5. Створіть JSON ключ:
   - Actions → Manage Keys → Add Key → Create New Key → JSON
6. Збережіть файл як `credentials/service-account.json`

#### b) Налаштуйте Google Sheet

1. Створіть новий Google Sheet
2. Скопіюйте ID з URL (між `/d/` та `/edit`):
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
   ```
3. Надайте доступ Service Account:
   - Share → вставте email з service account JSON
   - Надайте роль Editor

### 3. Налаштування змінних оточення

```bash
cp .env.example .env
nano .env  # або будь-який текстовий редактор
```

Заповніть всі необхідні ключі:

```env
# Google Sheets
GOOGLE_SHEET_ID=your_sheet_id_here

# Brex
BREX_API_KEY=your_brex_api_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...

# PrivatBank
PRIVATBANK_API_TOKEN=your_token
PRIVATBANK_CARD_NUMBER=your_card_number
```

### 4. Створіть папку для credentials

```bash
mkdir credentials
# Покладіть service-account.json в цю папку
```

### 5. Тестування підключень

```bash
npm start test
```

Ви повинні побачити:
```
✅ Brex: OK
✅ Stripe: OK
✅ PrivatBank: OK
```

### 6. Запустіть синхронізацію

```bash
npm start
```

## 📖 Використання

### Синхронізація всіх джерел

```bash
npm start
```

### Синхронізація конкретного джерела

```bash
npm start brex        # Тільки Brex
npm start stripe      # Тільки Stripe
npm start privatbank  # Тільки ПриватБанк
```

### Тестування з'єднань

```bash
npm start test
```

### Допомога

```bash
npm start help
```

## 🔑 Отримання API ключів

### Brex API Key

1. Перейдіть на https://dashboard.brex.com
2. Settings → Developer → API
3. Create API Token
4. Скопіюйте ключ в `.env`

Документація: https://developer.brex.com/docs/

### Stripe Secret Key

1. Перейдіть на https://dashboard.stripe.com
2. Developers → API keys
3. Скопіюйте "Secret key" (починається з `sk_`)
4. Використовуйте test key (`sk_test_...`) для тестування

Документація: https://stripe.com/docs/api

### PrivatBank API

ПриватБанк має кілька способів доступу:

#### Варіант 1: API Token (рекомендовано)

1. Увійдіть в ПриватБанк24
2. Settings → API
3. Створіть токен
4. Додайте в `.env`

#### Варіант 2: Merchant ID/Password

```env
PRIVATBANK_MERCHANT_ID=your_merchant_id
PRIVATBANK_MERCHANT_PASSWORD=your_password
PRIVATBANK_CARD_NUMBER=your_card_number
```

Документація: https://api.privatbank.ua

## 📊 Структура Google Sheet

Кожне джерело має окремий лист (tab) з такими колонками:

### Загальні колонки (всі джерела)

| Колонка | Опис |
|---------|------|
| Transaction ID | Унікальний ID транзакції |
| Date | Дата транзакції |
| Description | Опис транзакції |
| Amount | Сума |
| Currency | Валюта |
| Category | Категорія |
| Status | Статус |
| Synced At | Коли додано в таблицю |

### Brex специфічні

- Merchant
- Card Last 4
- User

### Stripe специфічні

- Customer
- Payment Method
- Fee
- Net

### PrivatBank специфічні

- Card Number
- MCC
- Terminal

## 🔄 Автоматизація

### Cron (Linux/Mac)

Додайте в crontab для щоденної синхронізації:

```bash
crontab -e
```

Додайте:
```
0 9 * * * cd /path/to/transaction-parser && npm start >> logs/sync.log 2>&1
```

### Windows Task Scheduler

1. Відкрийте Task Scheduler
2. Create Basic Task
3. Trigger: Daily
4. Action: Start a program
   - Program: `node`
   - Arguments: `/path/to/transaction-parser/src/index.js`

### GitHub Actions (рекомендовано)

Створіть `.github/workflows/sync.yml`:

```yaml
name: Sync Transactions

on:
  schedule:
    - cron: '0 9 * * *'  # Щодня о 9:00
  workflow_dispatch:  # Ручний запуск

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd transaction-parser
          npm install

      - name: Create credentials
        run: |
          mkdir -p transaction-parser/credentials
          echo '${{ secrets.GOOGLE_SERVICE_ACCOUNT }}' > transaction-parser/credentials/service-account.json

      - name: Sync transactions
        env:
          GOOGLE_SHEET_ID: ${{ secrets.GOOGLE_SHEET_ID }}
          BREX_API_KEY: ${{ secrets.BREX_API_KEY }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          PRIVATBANK_API_TOKEN: ${{ secrets.PRIVATBANK_API_TOKEN }}
          PRIVATBANK_CARD_NUMBER: ${{ secrets.PRIVATBANK_CARD_NUMBER }}
        run: |
          cd transaction-parser
          npm start
```

Додайте secrets в GitHub:
- Settings → Secrets and variables → Actions → New repository secret

## 🐛 Troubleshooting

### "Configuration errors: GOOGLE_SHEET_ID is required"

Переконайтесь що `.env` файл існує і містить всі необхідні змінні.

### "Failed to initialize Google Sheets client"

1. Перевірте що `credentials/service-account.json` існує
2. Перевірте що Service Account має доступ до Sheet
3. Переконайтесь що Google Sheets API увімкнено

### "Brex/Stripe/PrivatBank API connection failed"

1. Перевірте API ключі в `.env`
2. Перевірте інтернет з'єднання
3. Для PrivatBank - переконайтесь що номер картки правильний

### "Unable to parse range" або "Sheet not found"

Листи будуть створені автоматично при першому запуску. Якщо помилка залишається:
1. Переконайтесь що GOOGLE_SHEET_ID правильний
2. Перевірте доступ Service Account

## 📁 Структура проєкту

```
transaction-parser/
├── src/
│   ├── parsers/
│   │   ├── brex.js           # Brex API клієнт
│   │   ├── stripe.js         # Stripe API клієнт
│   │   └── privatbank.js     # PrivatBank API клієнт
│   ├── sheet/
│   │   └── google-sheet.js   # Google Sheets клієнт
│   ├── config.js             # Конфігурація
│   ├── sync.js               # Логіка синхронізації
│   └── index.js              # Точка входу
├── credentials/
│   └── service-account.json  # Google credentials (gitignored)
├── .env                      # Змінні оточення (gitignored)
├── .env.example              # Приклад конфігурації
├── package.json
└── README.md
```

## 🔐 Безпека

- ❌ **НІКОЛИ** не комітьте `.env` або `credentials/` в git
- ✅ Використовуйте GitHub Secrets для автоматизації
- ✅ Обмежте доступ Service Account тільки до потрібного Sheet
- ✅ Регулярно оновлюйте API ключі
- ✅ Використовуйте test ключі для розробки

## 📝 TODO / Покращення

- [ ] Додати підтримку інших банків (Monobank, Wise)
- [ ] Додати web dashboard для перегляду статистики
- [ ] Додати email notifications при помилках
- [ ] Додати кеш для швидшої роботи
- [ ] Додати unit tests
- [ ] Додати Docker support

## 🤝 Внесок

Contributions are welcome! Відкривайте Issues або Pull Requests.

## 📄 Ліцензія

MIT

## 📞 Підтримка

Якщо виникли питання:
1. Перевірте README
2. Запустіть `npm start test` для діагностики
3. Перевірте логи помилок
4. Створіть Issue з описом проблеми

---

Made with ❤️ for better financial tracking
