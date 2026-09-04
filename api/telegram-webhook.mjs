const TELEGRAM_API = 'https://api.telegram.org';


export default async function handler(req, res) {

  if (req.method !== 'POST') {

    res.setHeader(
      'Allow',
      'POST'
    );

    return res.status(405).json({
      ok: false
    });

  }


  /*
   * =========================================================
   * WEBHOOK SECURITY
   * =========================================================
   */

  const expectedSecret =
    process.env
      .TELEGRAM_WEBHOOK_SECRET;


  const receivedSecret =
    req.headers[
      'x-telegram-bot-api-secret-token'
    ];


  if (
    expectedSecret &&
    receivedSecret !== expectedSecret
  ) {

    return res.status(403).json({
      ok: false
    });

  }


  const update =
    parseBody(req.body);


  if (!update) {

    return res.status(400).json({
      ok: false
    });

  }


  /*
   * Нас зараз цікавлять тільки
   * натискання inline-кнопок.
   */

  const callback =
    update.callback_query;


  if (!callback) {

    return res.status(200).json({
      ok: true
    });

  }


  const token =
    process.env
      .TELEGRAM_BOT_TOKEN;


  const chatId =
    String(
      process.env
        .TELEGRAM_CHAT_ID ||
      ''
    );


  const callbackChatId =
    String(
      callback.message
        ?.chat
        ?.id ||
      ''
    );


  if (
    !token ||
    !chatId
  ) {

    return res.status(500).json({
      ok: false
    });

  }


  /*
   * Не дозволяємо обробляти кнопки
   * з іншої Telegram-групи.
   */

  if (
    callbackChatId !== chatId
  ) {

    await answerCallback(
      token,
      callback.id,
      'Ця кнопка не належить робочій групі.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  /*
   * Перевірка менеджера.
   */

  if (
    !isAuthorizedManager(
      callback.from?.id
    )
  ) {

    await answerCallback(
      token,
      callback.id,
      'У вас немає доступу до зміни статусу.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  /*
   * Отримуємо статус
   * з callback_data.
   */

  const statusKey =
    String(
      callback.data || ''
    ).replace(
      'lead_status:',
      ''
    );


  const status =
    getStatus(
      statusKey
    );


  if (!status) {

    await answerCallback(
      token,
      callback.id,
      'Невідома дія.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  const managerName =
    getManagerName(
      callback.from
    );


  const message =
    callback.message;


  const newText =
    buildUpdatedLeadText(
      message.text || '',
      status,
      managerName
    );


  const newKeyboard =
    buildStatusKeyboard(
      statusKey
    );


  try {

    /*
     * Редагуємо ТІЛЬКИ
     * конкретне повідомлення ліда.
     */

    await telegram(
      token,
      'editMessageText',
      {
        chat_id:
          message.chat.id,

        message_id:
          message.message_id,

        text:
          newText,

        parse_mode:
          'HTML',

        disable_web_page_preview:
          true,

        reply_markup:
          newKeyboard
      }
    );


    /*
     * Закриваємо loading
     * на Telegram inline-кнопці.
     */

    await answerCallback(
      token,
      callback.id,
      `Статус: ${status.label}`
    );


    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error(
      'Telegram callback error:',
      error
    );


    await answerCallback(
      token,
      callback.id,
      'Не вдалося змінити статус.'
    );


    return res.status(200).json({
      ok: true
    });

  }

}


/*
 * =========================================================
 * STATUS CONFIG
 * =========================================================
 */

function getStatus(key) {

  const statuses = {

    work: {
      icon:
        '🟡',

      label:
        'В РОБОТІ'
    },


    contacted: {
      icon:
        '🟢',

      label:
        'ЗВ’ЯЗАЛИСЬ'
    },


    irrelevant: {
      icon:
        '⚫',

      label:
        'НЕАКТУАЛЬНИЙ'
    }

  };


  return statuses[key] || null;

}


/*
 * =========================================================
 * INLINE KEYBOARD
 * =========================================================
 */

function buildStatusKeyboard(
  activeKey
) {

  const button =
    (
      key,
      text
    ) => ({

      text:
        key === activeKey
          ? `• ${text}`
          : text,

      callback_data:
        `lead_status:${key}`

    });


  return {

    inline_keyboard: [

      [
        button(
          'work',
          '✅ Взяти в роботу'
        )
      ],

      [
        button(
          'contacted',
          '📞 Зв’язались'
        ),

        button(
          'irrelevant',
          '❌ Неактуальний'
        )
      ]

    ]

  };

}


/*
 * =========================================================
 * UPDATE LEAD CARD
 * =========================================================
 */

function buildUpdatedLeadText(
  currentText,
  status,
  managerName
) {

  let base =
    String(
      currentText || ''
    );


  /*
   * Якщо статус уже був,
   * видаляємо старий статусний блок.
   */

  base =
    base.replace(
      /\n\nСтатус:[\s\S]*$/u,
      ''
    );


  const lines =
    base.split('\n');


  /*
   * Міняємо іконку першого рядка.
   */

  if (lines.length) {

    const currentTitle =
      lines[0]
        .replace(
          /^[^\s]+\s+/u,
          ''
        );


    lines[0] =
      `${status.icon} ${currentTitle}`;

  }


  const baseHtml =
    formatLeadText(
      lines.join('\n')
    );


  return [

    baseHtml,

    '',

    `<b>Статус:</b> ${
      html(status.label)
    }`,

    `<b>Менеджер:</b> ${
      html(managerName)
    }`,

    `<b>Оновлено:</b> ${
      html(formatNow())
    }`

  ].join('\n');

}


/*
 * =========================================================
 * RESTORE HTML FORMATTING
 * =========================================================
 */

function formatLeadText(text) {

  const escaped =
    html(text);


  const lines =
    escaped.split('\n');


  return lines

    .map(
      (
        line,
        index
      ) => {

        /*
         * Перший рядок
         */

        if (index === 0) {

          return `<b>${line}</b>`;

        }


        /*
         * Поля типу:
         *
         * Ім’я:
         * Телефон:
         * Email:
         */

        const match =
          line.match(
            /^([^:]{1,50}):(.*)$/u
          );


        if (match) {

          return (
            `<b>${match[1]}:</b>` +
            `${match[2]}`
          );

        }


        /*
         * Заголовок атрибуції
         */

        if (
          line ===
          'Атрибуція реклами'
        ) {

          return (
            '<b>Атрибуція реклами</b>'
          );

        }


        return line;

      }
    )

    .join('\n');

}


/*
 * =========================================================
 * MANAGER ACCESS
 * =========================================================
 */

function isAuthorizedManager(
  userId
) {

  const configured =
    String(
      process.env
        .TELEGRAM_MANAGER_IDS ||
      ''
    ).trim();


  /*
   * Якщо список менеджерів
   * поки не заданий,
   * кнопки доступні учасникам групи.
   */

  if (!configured) {

    return true;

  }


  const allowed =
    configured

      .split(',')

      .map(
        item =>
          item.trim()
      )

      .filter(Boolean);


  return allowed.includes(
    String(userId)
  );

}


/*
 * =========================================================
 * MANAGER NAME
 * =========================================================
 */

function getManagerName(user) {

  if (!user) {

    return 'Менеджер';

  }


  const fullName =
    [
      user.first_name,
      user.last_name
    ]

      .filter(Boolean)

      .join(' ')

      .trim();


  return (
    fullName ||
    user.username ||
    'Менеджер'
  );

}


/*
 * =========================================================
 * CALLBACK ANSWER
 * =========================================================
 */

async function answerCallback(
  token,
  callbackQueryId,
  text
) {

  return telegram(
    token,
    'answerCallbackQuery',
    {
      callback_query_id:
        callbackQueryId,

      text
    }
  );

}


/*
 * =========================================================
 * TELEGRAM API
 * =========================================================
 */

async function telegram(
  token,
  method,
  payload
) {

  const response =
    await fetch(
      `${TELEGRAM_API}/bot${token}/${method}`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(payload)
      }
    );


  const result =
    await response.json();


  if (
    !response.ok ||
    !result.ok
  ) {

    throw new Error(
      `Telegram ${method}: ${
        result.description ||
        response.status
      }`
    );

  }


  return result.result;

}


/*
 * =========================================================
 * BODY PARSER
 * =========================================================
 */

function parseBody(body) {

  if (!body) {

    return null;

  }


  if (
    typeof body ===
    'object'
  ) {

    return body;

  }


  try {

    return JSON.parse(body);

  } catch {

    return null;

  }

}


/*
 * =========================================================
 * HTML ESCAPE
 * =========================================================
 */

function html(value) {

  return String(value)

    .replaceAll(
      '&',
      '&amp;'
    )

    .replaceAll(
      '<',
      '&lt;'
    )

    .replaceAll(
      '>',
      '&gt;'
    );

}


/*
 * =========================================================
 * KYIV TIME
 * =========================================================
 */

function formatNow() {

  return new Intl.DateTimeFormat(
    'uk-UA',
    {
      timeZone:
        'Europe/Kyiv',

      dateStyle:
        'medium',

      timeStyle:
        'short'
    }
  ).format(
    new Date()
  );

}