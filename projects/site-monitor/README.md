# Site Monitor

Сервіс для моніторингу сайтів на предмет появи вільних time slots з повідомленнями в Telegram.

## Налаштування

### Змінні середовища

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here  
MONITOR_URL=https://example.com/booking-page
CHECK_INTERVAL_MS=300000  # 5 хвилин
PORT=3003
NODE_ENV=production
```

### Отримання Telegram Bot Token

1. Напишіть [@BotFather](https://t.me/BotFather) в Telegram
2. Виконайте `/newbot` і дайте назву боту
3. Скопіюйте отриманий token

### Отримання Chat ID

1. Напишіть вашому боту будь-яке повідомлення
2. Відкрийте: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Знайдіть `"chat":{"id":123456789}` - це ваш Chat ID

## Як працює

1. **Автоматична перевірка**: Кожні 5 хвилин перевіряє сайт
2. **Гнучкі селектори**: Використовує різні CSS селектори для знаходження time slots
3. **Розумне повідомлення**: Повідомляє тільки про нові слоти
4. **Fallback логіка**: Якщо стандартні селектори не працюють, шукає patterns часу

## Селектори, які підтримуються

Сервіс автоматично шукає time slots за цими селекторами:
- `.time-slot.available`
- `.slot.available` 
- `.appointment-slot:not(.disabled)`
- `[data-available="true"]`
- `.booking-slot:not(.booked)`

Також шукає patterns часу: `14:30`, `2:30 PM`, тощо.

## Тестування локально

```bash
cd projects/site-monitor
npm install
npm run start:dev
```

## Logs

Сервіс логує:
- Початок кожної перевірки
- Кількість знайдених слотів
- Відправлення повідомлень
- Помилки

## Health Check

Endpoint: `/health` - для Render.com моніторингу