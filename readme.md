# ProFin Landing -> Telegram, етап 1

## Схема

Facebook / Instagram / Google / інше джерело
-> ProFin Landing
-> форма
-> POST /api/lead
-> Vercel Function
-> Telegram Bot API
-> група "Ліди ProFin"

## 1. index.html

Знайдіть поточну форму, яка має inline `onsubmit` з alert про прототип.
Повністю замініть її вмістом `form-replacement.html`.

У поточному HTML також є кнопки з `href="#contact"`, але немає елемента з `id="contact"`.
Рекомендовано додати `id="contact"` контейнеру `.cta` біля форми:

    <div class="cta" id="contact">

## 2. script.js

Повністю замініть поточний `script.js` готовим файлом із цього пакета.
Він зберігає плавний скрол та додає обробку форми.

## 3. style.css

Додайте в САМИЙ КІНЕЦЬ `style.css` вміст `style-patch.css`.

## 4. API на Vercel

Створіть у корені репозиторію папку `api` і покладіть у неї:

    api/lead.mjs

Файл `.mjs` обраний спеціально для вашого простого статичного проєкту без package.json.

## 5. Environment Variables на Vercel

Project -> Settings -> Environment Variables:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- необов'язково TELEGRAM_MESSAGE_THREAD_ID
- ALLOWED_ORIGINS=https://pro-fin-landing.vercel.app

Після цього зробіть Redeploy.

Токен Telegram НЕ вставляйте в `script.js`, `index.html` або GitHub.

## 6. Що прийде у Telegram

- джерело;
- ім'я;
- компанія;
- телефон;
- email;
- поточна система;
- utm_source;
- utm_medium;
- utm_campaign;
- utm_content;
- utm_term;
- fbclid;
- gclid;
- URL сторінки;
- referrer;
- час заявки.

## 7. Тест Facebook-джерела

Відкрийте:

    https://pro-fin-landing.vercel.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=test_campaign

Після заповнення форми повідомлення має містити:

    Джерело: Facebook / Instagram
    utm_source: facebook
    utm_medium: paid_social
    utm_campaign: test_campaign

## Важливо: сайт з реклами vs Meta Lead Form

Цей етап уже працює для сценарію:

    реклама Facebook -> перехід на сайт -> заповнення форми сайту

Якщо ви використовуєте нативну Meta Lead Form, яку людина заповнює прямо
в Facebook/Instagram без переходу на сайт, потрібен окремий Meta Lead Ads Webhook.
Це буде інший вхід у ту саму систему лідів.

## Етап 2: бот зі статистикою

Для команд `/stats`, `/today`, `/week`, `/sources`, `/leads` треба додати
постійну БД. Telegram Bot API віддає боту incoming updates; використовувати
історію вихідних повідомлень бота як базу лідів для статистики ненадійно.

Тому на етапі 2 схема стане:

    усі джерела -> єдина база leads -> повідомлення у групу
                                  -> команди статистики Telegram-бота

Це дозволить рахувати загальну кількість лідів, ліди за день/тиждень,
джерела, кампанії та конверсії без втрати історії.
