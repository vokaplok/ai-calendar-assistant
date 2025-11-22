# Промпт для локального Claude Code

Скопіюйте і вставте це в локальний Claude Code:

---

**Завдання:** Запусти тест підключення до Google Sheets для transaction parser

**Кроки:**

1. Перейди в папку `transaction-parser`:
```bash
cd transaction-parser
```

2. Переконайся що файл service account на місці:
```bash
# Якщо файл analyti-426810-ca83ec70234f.json в корені репозиторію
cp ../analyti-426810-ca83ec70234f.json credentials/service-account.json

# Перевір що файл існує
ls -lh credentials/service-account.json
```

3. Встанови залежності (якщо ще не встановлені):
```bash
npm install
```

4. Запусти тестовий скрипт:
```bash
node test-connection.js
```

**Очікуваний результат:**
- Скрипт має підключитись до Google Sheets
- Створити вкладку "Brex" якщо її немає
- Додати тестову транзакцію: "🧪 TEST TRANSACTION - Coffee Shop"
- Показати успішне повідомлення

**Після успіху:**
Відкрий Google Sheet і перевір:
https://docs.google.com/spreadsheets/d/1UxU5KX8RKQAWTuU7hLbCrQxq1gWwjT9ZchoNpl0tIr8/

Маєш побачити:
- Вкладку "Brex"
- Заголовки: Transaction ID, Date, Description, Amount, Currency, Category, Status, Synced At, Merchant, Card Last 4, User
- Тестову транзакцію з сумою $4.50

**Якщо є помилки:**
- "Permission denied" → Service Account email потрібно додати в Share вашого Google Sheet з роллю Editor
- "File not found" → Перевір шляхи до credentials/service-account.json та .env файлу

---

**Альтернативно - запусти bash скрипт:**
```bash
bash run-test.sh
```

Він автоматично перевірить всі залежності і запустить тест.
