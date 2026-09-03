const TELEGRAM_API_BASE = 'https://api.telegram.org';

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return jsonResponse(
        {
          ok: false,
          error: 'Method not allowed'
        },
        405,
        {
          Allow: 'POST'
        }
      );
    }

    if (!isAllowedOrigin(request)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Origin not allowed'
        },
        403
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Некоректний JSON.'
        },
        400
      );
    }

    // Honeypot: бот отримує успіх, але заявка не йде в Telegram.
    if (clean(body.website)) {
      return jsonResponse({ ok: true });
    }

    const lead = normalizeLead(body);
    const validationError = validateLead(lead);

    if (validationError) {
      return jsonResponse(
        {
          ok: false,
          error: validationError
        },
        400
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID;

    if (!botToken || !chatId) {
      console.error(
        'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variable.'
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Telegram integration is not configured.'
        },
        500
      );
    }

    const telegramPayload = {
      chat_id: chatId,
      text: buildTelegramMessage(lead),
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: true
      }
    };

    if (threadId) {
      telegramPayload.message_thread_id = Number(threadId);
    }

    try {
      const telegramResponse = await fetch(
        `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(telegramPayload)
        }
      );

      const telegramResult = await telegramResponse.json();

      if (!telegramResponse.ok || !telegramResult.ok) {
        console.error('Telegram API error:', telegramResult);

        return jsonResponse(
          {
            ok: false,
            error: 'Telegram rejected the lead message.'
          },
          502
        );
      }

      return jsonResponse({
        ok: true,
        lead: {
          source: lead.source,
          submittedAt: lead.submittedAt
        }
      });
    } catch (error) {
      console.error('Lead delivery error:', error);

      return jsonResponse(
        {
          ok: false,
          error: 'Не вдалося передати заявку.'
        },
        500
      );
    }
  }
};

function normalizeLead(body) {
  return {
    name: clean(body.name).slice(0, 100),
    company: clean(body.company).slice(0, 120),
    phone: clean(body.phone).slice(0, 40),
    email: clean(body.email).slice(0, 160),
    currentSystem: clean(body.currentSystem).slice(0, 120),

    source: clean(body.source).slice(0, 120) || 'Прямий / невідомий',
    utmSource: clean(body.utmSource).slice(0, 160),
    utmMedium: clean(body.utmMedium).slice(0, 160),
    utmCampaign: clean(body.utmCampaign).slice(0, 200),
    utmContent: clean(body.utmContent).slice(0, 200),
    utmTerm: clean(body.utmTerm).slice(0, 200),
    fbclid: clean(body.fbclid).slice(0, 500),
    gclid: clean(body.gclid).slice(0, 500),

    pageUrl: clean(body.pageUrl).slice(0, 1000),
    referrer: clean(body.referrer).slice(0, 1000),
    submittedAt: normalizeDate(body.submittedAt)
  };
}

function validateLead(lead) {
  if (!lead.name) {
    return 'Вкажіть ім\'я.';
  }

  if (!lead.phone) {
    return 'Вкажіть телефон.';
  }

  if (lead.email && !isEmail(lead.email)) {
    return 'Перевірте Email.';
  }

  return '';
}

function buildTelegramMessage(lead) {
  const lines = [
    '<b>🆕 Новий лід ProFin OS</b>',
    '',
    `<b>Джерело:</b> ${html(lead.source)}`,
    `<b>Ім’я:</b> ${html(valueOrDash(lead.name))}`,
    `<b>Компанія:</b> ${html(valueOrDash(lead.company))}`,
    `<b>Телефон:</b> ${html(valueOrDash(lead.phone))}`,
    `<b>Email:</b> ${html(valueOrDash(lead.email))}`,
    `<b>Зараз використовує:</b> ${html(valueOrDash(lead.currentSystem))}`,
    '',
    '<b>Атрибуція реклами</b>',
    `<b>utm_source:</b> ${html(valueOrDash(lead.utmSource))}`,
    `<b>utm_medium:</b> ${html(valueOrDash(lead.utmMedium))}`,
    `<b>utm_campaign:</b> ${html(valueOrDash(lead.utmCampaign))}`,
    `<b>utm_content:</b> ${html(valueOrDash(lead.utmContent))}`,
    `<b>utm_term:</b> ${html(valueOrDash(lead.utmTerm))}`,
    `<b>fbclid:</b> ${html(shortId(lead.fbclid))}`,
    `<b>gclid:</b> ${html(shortId(lead.gclid))}`,
    '',
    `<b>Сторінка:</b> ${html(valueOrDash(lead.pageUrl))}`,
    `<b>Referrer:</b> ${html(valueOrDash(lead.referrer))}`,
    `<b>Час:</b> ${html(formatDate(lead.submittedAt))}`
  ];

  return lines.join('\n');
}

function isAllowedOrigin(request) {
  const configuredOrigins = clean(process.env.ALLOWED_ORIGINS);

  if (!configuredOrigins) {
    return true;
  }

  const origin = clean(request.headers.get('origin'));

  if (!origin) {
    return true;
  }

  const allowed = configuredOrigins
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  return allowed.includes(origin);
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function clean(value) {
  return String(value || '').trim();
}

function valueOrDash(value) {
  return value || '—';
}

function shortId(value) {
  if (!value) return '—';

  if (value.length <= 80) return value;

  return `${value.slice(0, 77)}…`;
}

function html(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}
