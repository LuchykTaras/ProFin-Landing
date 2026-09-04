const TELEGRAM_API = 'https://api.telegram.org';


export default async function handler(req, res) {

  if (req.method !== 'POST') {

    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });

  }


  if (!isAllowedOrigin(req)) {

    return res.status(403).json({
      ok: false,
      error: 'Origin not allowed'
    });

  }


  const body = parseBody(req.body);


  if (!body) {

    return res.status(400).json({
      ok: false,
      error: 'Некоректний JSON.'
    });

  }


  /*
   * Honeypot.
   * Якщо приховане поле заповнене ботом,
   * просто повертаємо успіх і нічого не надсилаємо.
   */

  if (clean(body.website)) {

    return res.status(200).json({
      ok: true
    });

  }


  const lead = normalizeLead(body);

  const validationError = validateLead(lead);


  if (validationError) {

    return res.status(400).json({
      ok: false,
      error: validationError
    });

  }


  const botToken =
    process.env.TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env.TELEGRAM_CHAT_ID;

  const topicId =
    resolveTopicId(lead);


  if (!botToken || !chatId) {

    console.error(
      'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'
    );

    return res.status(500).json({
      ok: false,
      error: 'Telegram integration is not configured.'
    });

  }


  if (!topicId) {

    console.error(
      'Missing Telegram topic ID for source:',
      lead.source
    );

    return res.status(500).json({
      ok: false,
      error: 'Telegram topic routing is not configured.'
    });

  }


  try {

    /*
     * Надсилаємо лід у відповідну Telegram-гілку.
     *
     * disable_notification:true
     * означає, що картка не створює зайвий звуковий push,
     * але залишається непрочитаною у відповідній гілці.
     */

    const sent = await telegram(
      botToken,
      'sendMessage',
      {
        chat_id: chatId,

        message_thread_id:
          Number(topicId),

        text:
          buildLeadMessage(
            lead,
            null
          ),

        parse_mode:
          'HTML',

        disable_web_page_preview:
          true,

        disable_notification:
          true,

        reply_markup:
          buildLeadKeyboard()
      }
    );


    /*
     * Поки немає окремої БД,
     * використовуємо Telegram message_id
     * як простий номер ліда.
     */

    const leadNumber =
      String(sent.message_id)
        .padStart(4, '0');


    /*
     * Оновлюємо картку,
     * додаючи номер ліда.
     */

    await telegram(
      botToken,
      'editMessageText',
      {
        chat_id:
          chatId,

        message_id:
          sent.message_id,

        text:
          buildLeadMessage(
            lead,
            leadNumber
          ),

        parse_mode:
          'HTML',

        disable_web_page_preview:
          true,

        reply_markup:
          buildLeadKeyboard()
      }
    );


    return res.status(200).json({

      ok: true,

      leadNumber,

      source:
        lead.source,

      topicId:
        Number(topicId)

    });

  } catch (error) {

    console.error(
      'Lead delivery error:',
      error
    );


    return res.status(502).json({

      ok: false,

      error:
        'Не вдалося передати заявку в Telegram.'

    });

  }

}


/*
 * =========================================================
 * ROUTING ПО TELEGRAM TOPICS
 * =========================================================
 */

function resolveTopicId(lead) {

  const source =
    `${lead.source} ${lead.utmSource}`
      .toLowerCase();


  if (
    source.includes('facebook') ||
    source.includes('instagram') ||
    source.includes('meta') ||
    source.includes('fb')
  ) {

    return process.env
      .TELEGRAM_TOPIC_FACEBOOK_ID;

  }


  if (
    source.includes('google')
  ) {

    return process.env
      .TELEGRAM_TOPIC_GOOGLE_ID;

  }


  return process.env
    .TELEGRAM_TOPIC_OTHER_ID;

}


/*
 * =========================================================
 * INLINE BUTTONS
 * =========================================================
 */

function buildLeadKeyboard() {

  return {

    inline_keyboard: [

      [
        {
          text:
            '✅ Взяти в роботу',

          callback_data:
            'lead_status:work'
        }
      ],

      [
        {
          text:
            '📞 Зв’язались',

          callback_data:
            'lead_status:contacted'
        },

        {
          text:
            '❌ Неактуальний',

          callback_data:
            'lead_status:irrelevant'
        }
      ]

    ]

  };

}


/*
 * =========================================================
 * TELEGRAM MESSAGE
 * =========================================================
 */

function buildLeadMessage(
  lead,
  leadNumber
) {

  const title =
    leadNumber
      ? `🆕 <b>Лід #${html(leadNumber)}</b>`
      : '🆕 <b>Новий лід ProFin OS</b>';


  return [

    title,

    '',

    `<b>Джерело:</b> ${html(
      valueOrDash(lead.source)
    )}`,

    `<b>Ім’я:</b> ${html(
      valueOrDash(lead.name)
    )}`,

    `<b>Компанія:</b> ${html(
      valueOrDash(lead.company)
    )}`,

    `<b>Телефон:</b> ${html(
      valueOrDash(lead.phone)
    )}`,

    `<b>Email:</b> ${html(
      valueOrDash(lead.email)
    )}`,

    `<b>Зараз використовує:</b> ${html(
      valueOrDash(lead.currentSystem)
    )}`,

    '',

    '<b>Атрибуція реклами</b>',

    `<b>utm_source:</b> ${html(
      valueOrDash(lead.utmSource)
    )}`,

    `<b>utm_medium:</b> ${html(
      valueOrDash(lead.utmMedium)
    )}`,

    `<b>utm_campaign:</b> ${html(
      valueOrDash(lead.utmCampaign)
    )}`,

    `<b>utm_content:</b> ${html(
      valueOrDash(lead.utmContent)
    )}`,

    `<b>utm_term:</b> ${html(
      valueOrDash(lead.utmTerm)
    )}`,

    '',

    `<b>Сторінка:</b> ${html(
      valueOrDash(lead.pageUrl)
    )}`,

    `<b>Referrer:</b> ${html(
      valueOrDash(lead.referrer)
    )}`,

    `<b>Час:</b> ${html(
      formatDate(lead.submittedAt)
    )}`

  ].join('\n');

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
 * REQUEST BODY
 * =========================================================
 */

function parseBody(body) {

  if (!body) {
    return null;
  }


  if (
    typeof body === 'object'
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
 * LEAD NORMALIZATION
 * =========================================================
 */

function normalizeLead(body) {

  return {

    name:
      clean(body.name)
        .slice(0, 100),

    company:
      clean(body.company)
        .slice(0, 120),

    phone:
      clean(body.phone)
        .slice(0, 40),

    email:
      clean(body.email)
        .slice(0, 160),

    currentSystem:
      clean(body.currentSystem)
        .slice(0, 120),


    source:
      clean(body.source)
        .slice(0, 120) ||
      'Прямий / невідомий',


    utmSource:
      clean(body.utmSource)
        .slice(0, 160),

    utmMedium:
      clean(body.utmMedium)
        .slice(0, 160),

    utmCampaign:
      clean(body.utmCampaign)
        .slice(0, 200),

    utmContent:
      clean(body.utmContent)
        .slice(0, 200),

    utmTerm:
      clean(body.utmTerm)
        .slice(0, 200),


    pageUrl:
      clean(body.pageUrl)
        .slice(0, 1000),

    referrer:
      clean(body.referrer)
        .slice(0, 1000),

    submittedAt:
      normalizeDate(
        body.submittedAt
      )

  };

}


/*
 * =========================================================
 * VALIDATION
 * =========================================================
 */

function validateLead(lead) {

  if (!lead.name) {

    return 'Вкажіть ім’я.';

  }


  if (!lead.phone) {

    return 'Вкажіть телефон.';

  }


  if (
    lead.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(lead.email)
  ) {

    return 'Перевірте Email.';

  }


  return '';

}


/*
 * =========================================================
 * ORIGIN PROTECTION
 * =========================================================
 */

function isAllowedOrigin(req) {

  const configured =
    clean(
      process.env.ALLOWED_ORIGINS
    );


  if (!configured) {

    return true;

  }


  const origin =
    clean(
      req.headers.origin
    );


  if (!origin) {

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
    origin
  );

}


/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function clean(value) {

  return String(
    value || ''
  ).trim();

}


function valueOrDash(value) {

  return value || '—';

}


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


function normalizeDate(value) {

  const date =
    value
      ? new Date(value)
      : new Date();


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return new Date()
      .toISOString();

  }


  return date.toISOString();

}


function formatDate(value) {

  try {

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
      new Date(value)
    );

  } catch {

    return value;

  }

}