const TELEGRAM_API = 'https://api.telegram.org';


export default async function handler(req, res) {

  if (
    req.method !==
    'POST'
  ) {

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
   * WEBHOOK SECRET
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
    receivedSecret !==
      expectedSecret
  ) {

    return res.status(403).json({
      ok: false
    });

  }


  /*
   * =========================================================
   * UPDATE
   * =========================================================
   */

  const update =
    parseBody(
      req.body
    );


  if (!update) {

    return res.status(400).json({
      ok: false
    });

  }


  /*
   * Нас зараз цікавлять
   * тільки inline-кнопки.
   */

  const callback =
    update.callback_query;


  if (!callback) {

    return res.status(200).json({
      ok: true
    });

  }


  /*
   * =========================================================
   * CONFIG
   * =========================================================
   */

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
   * =========================================================
   * CHAT PROTECTION
   * =========================================================
   */

  if (
    callbackChatId !==
    chatId
  ) {

    await safeAnswerCallback(
      token,
      callback.id,
      'Ця кнопка не належить робочій групі.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  /*
   * =========================================================
   * MANAGER PROTECTION
   * =========================================================
   */

  if (
    !isAuthorizedManager(
      callback.from?.id
    )
  ) {

    await safeAnswerCallback(
      token,
      callback.id,
      'У вас немає доступу до зміни статусу.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  const message =
    callback.message;


  if (!message) {

    await safeAnswerCallback(
      token,
      callback.id,
      'Повідомлення не знайдено.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  const callbackData =
    String(
      callback.data ||
      ''
    );


  /*
   * =========================================================
   * DELETE NOOP
   * =========================================================
   */

  if (
    callbackData ===
    'lead_delete:noop'
  ) {

    await safeAnswerCallback(
      token,
      callback.id,
      'Оберіть: видалити або скасувати.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  /*
   * =========================================================
   * DELETE REQUEST
   * =========================================================
   *
   * Перший клік по кнопці
   * "Видалити".
   *
   * Сам лід ще НЕ видаляється.
   */

  if (
    callbackData ===
    'lead_delete:request'
  ) {

    const currentStatusKey =
      detectStatusKeyFromText(
        message.text ||
        ''
      );


    try {

      await telegram(
        token,
        'editMessageReplyMarkup',
        {

          chat_id:
            message.chat.id,

          message_id:
            message.message_id,

          reply_markup:
            buildDeleteConfirmKeyboard(
              currentStatusKey
            )

        }
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Підтвердьте видалення ліда.'
      );


      return res.status(200).json({
        ok: true
      });

    } catch (error) {

      console.error(
        'Delete request error:',
        error
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Не вдалося відкрити підтвердження.'
      );


      return res.status(200).json({
        ok: true
      });

    }

  }


  /*
   * =========================================================
   * DELETE CANCEL
   * =========================================================
   */

  if (
    callbackData.startsWith(
      'lead_delete:cancel:'
    )
  ) {

    const currentStatusKey =
      callbackData
        .split(':')[2] ||
      'new';


    try {

      await telegram(
        token,
        'editMessageReplyMarkup',
        {

          chat_id:
            message.chat.id,

          message_id:
            message.message_id,

          reply_markup:
            buildStatusKeyboard(
              currentStatusKey
            )

        }
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Видалення скасовано.'
      );


      return res.status(200).json({
        ok: true
      });

    } catch (error) {

      console.error(
        'Delete cancel error:',
        error
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Не вдалося скасувати дію.'
      );


      return res.status(200).json({
        ok: true
      });

    }

  }


  /*
   * =========================================================
   * DELETE CONFIRM
   * =========================================================
   *
   * Бази даних поки немає.
   *
   * Тому тут видаляється
   * саме Telegram-картка ліда.
   */

  if (
    callbackData ===
    'lead_delete:confirm'
  ) {

    const managerName =
      getManagerName(
        callback.from
      );


    let deleted =
      false;


    try {

      await telegram(
        token,
        'deleteMessage',
        {

          chat_id:
            message.chat.id,

          message_id:
            message.message_id

        }
      );


      deleted =
        true;

    } catch (deleteError) {

      console.error(
        'Telegram deleteMessage error:',
        deleteError
      );

    }


    /*
     * Якщо Telegram дозволив
     * фізично видалити повідомлення.
     */

    if (deleted) {

      await safeAnswerCallback(
        token,
        callback.id,
        'Лід видалено.'
      );


      return res.status(200).json({
        ok: true
      });

    }


    /*
     * =========================================================
     * DELETE FALLBACK
     * =========================================================
     *
     * Якщо старе повідомлення
     * вже неможливо фізично видалити,
     * прибираємо з нього персональні дані.
     */

    try {

      await telegram(
        token,
        'editMessageText',
        {

          chat_id:
            message.chat.id,

          message_id:
            message.message_id,

          text:
            [

              '🗑️ <b>Лід видалений</b>',

              '',

              `<b>Видалив:</b> ${html(
                managerName
              )}`,

              `<b>Час:</b> ${html(
                formatNow()
              )}`

            ].join('\n'),

          parse_mode:
            'HTML',

          reply_markup: {
            inline_keyboard: []
          }

        }
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Картку ліда очищено.'
      );


      return res.status(200).json({
        ok: true
      });

    } catch (fallbackError) {

      console.error(
        'Delete fallback error:',
        fallbackError
      );


      await safeAnswerCallback(
        token,
        callback.id,
        'Не вдалося видалити картку.'
      );


      return res.status(200).json({
        ok: true
      });

    }

  }


  /*
   * =========================================================
   * STATUS CALLBACK
   * =========================================================
   */

  if (
    !callbackData.startsWith(
      'lead_status:'
    )
  ) {

    await safeAnswerCallback(
      token,
      callback.id,
      'Невідома дія.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  const statusKey =
    callbackData.replace(
      'lead_status:',
      ''
    );


  const status =
    getStatus(
      statusKey
    );


  if (!status) {

    await safeAnswerCallback(
      token,
      callback.id,
      'Невідомий статус.'
    );


    return res.status(200).json({
      ok: true
    });

  }


  /*
   * =========================================================
   * MANAGER
   * =========================================================
   */

  const managerName =
    getManagerName(
      callback.from
    );


  /*
   * =========================================================
   * NEW LEAD TEXT
   * =========================================================
   */

  const newText =
    buildUpdatedLeadText(
      message.text ||
      '',
      status,
      managerName
    );


  const newKeyboard =
    buildStatusKeyboard(
      statusKey
    );


  /*
   * =========================================================
   * UPDATE LEAD CARD
   * =========================================================
   */

  try {

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


    await safeAnswerCallback(
      token,
      callback.id,
      `Статус: ${status.label}`
    );


    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    /*
     * Повторний клік по тому самому
     * статусу іноді може дати:
     *
     * message is not modified
     */

    if (
      String(
        error.message ||
        error
      ).toLowerCase()
        .includes(
          'message is not modified'
        )
    ) {

      await safeAnswerCallback(
        token,
        callback.id,
        `Статус уже встановлено: ${status.label}`
      );


      return res.status(200).json({
        ok: true
      });

    }


    console.error(
      'Telegram status update error:',
      error
    );


    await safeAnswerCallback(
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

    },


    done: {

      icon:
        '🏁',

      label:
        'ВИКОНАНО'

    }

  };


  return (
    statuses[key] ||
    null
  );

}


/*
 * =========================================================
 * MAIN STATUS KEYBOARD
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
      ],

      [
        button(
          'done',
          '🏁 Виконано'
        )
      ],

      [
        {
          text:
            '🗑️ Видалити',

          callback_data:
            'lead_delete:request'
        }
      ]

    ]

  };

}


/*
 * =========================================================
 * DELETE CONFIRM KEYBOARD
 * =========================================================
 */

function buildDeleteConfirmKeyboard(
  currentStatusKey
) {

  return {

    inline_keyboard: [

      [
        {
          text:
            '⚠️ Видалити цього ліда назавжди?',

          callback_data:
            'lead_delete:noop'
        }
      ],

      [
        {
          text:
            '🗑️ Так, видалити',

          callback_data:
            'lead_delete:confirm'
        }
      ],

      [
        {
          text:
            '↩️ Скасувати',

          callback_data:
            `lead_delete:cancel:${
              currentStatusKey ||
              'new'
            }`
        }
      ]

    ]

  };

}


/*
 * =========================================================
 * DETECT CURRENT STATUS
 * =========================================================
 */

function detectStatusKeyFromText(
  value
) {

  const text =
    String(
      value ||
      ''
    ).toUpperCase();


  if (
    text.includes(
      'СТАТУС: В РОБОТІ'
    )
  ) {

    return 'work';

  }


  if (
    text.includes(
      'СТАТУС: ЗВ’ЯЗАЛИСЬ'
    ) ||
    text.includes(
      "СТАТУС: ЗВ'ЯЗАЛИСЬ"
    )
  ) {

    return 'contacted';

  }


  if (
    text.includes(
      'СТАТУС: НЕАКТУАЛЬНИЙ'
    )
  ) {

    return 'irrelevant';

  }


  if (
    text.includes(
      'СТАТУС: ВИКОНАНО'
    )
  ) {

    return 'done';

  }


  return 'new';

}


/*
 * =========================================================
 * UPDATE LEAD TEXT
 * =========================================================
 */

function buildUpdatedLeadText(
  currentText,
  status,
  managerName
) {

  let base =
    String(
      currentText ||
      ''
    );


  /*
   * Якщо картка вже мала статус,
   * видаляємо попередній статусний блок.
   */

  base =
    base.replace(
      /\n\nСтатус:[\s\S]*$/u,
      ''
    );


  const lines =
    base.split('\n');


  /*
   * =========================================================
   * UPDATE TITLE ICON
   * =========================================================
   *
   * 🆕 → 🟡 → 🟢 → ⚫ → 🏁
   */

  if (
    lines.length
  ) {

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

    `<b>Статус:</b> ${html(
      status.label
    )}`,

    `<b>Менеджер:</b> ${html(
      managerName
    )}`,

    `<b>Оновлено:</b> ${html(
      formatNow()
    )}`

  ].join('\n');

}


/*
 * =========================================================
 * RESTORE TELEGRAM HTML
 * =========================================================
 *
 * callback.message.text приходить
 * із Telegram уже без HTML.
 *
 * Тому після зміни статусу
 * відновлюємо жирні назви полів.
 */

function formatLeadText(text) {

  const escaped =
    html(
      text
    );


  const lines =
    escaped.split('\n');


  return lines

    .map(
      (
        line,
        index
      ) => {

        /*
         * Заголовок картки.
         */

        if (
          index === 0
        ) {

          return (
            `<b>${line}</b>`
          );

        }


        /*
         * Заголовок блоку.
         */

        if (
          line ===
          'Атрибуція реклами'
        ) {

          return (
            '<b>Атрибуція реклами</b>'
          );

        }


        /*
         * Поля:
         *
         * Ім’я:
         * Телефон:
         * Email:
         * utm_source:
         * тощо.
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
   * Якщо TELEGRAM_MANAGER_IDS
   * не заданий,
   *
   * статусні кнопки доступні
   * всім учасникам групи.
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

      .filter(
        Boolean
      );


  return allowed.includes(
    String(
      userId
    )
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

      .filter(
        Boolean
      )

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
 * ANSWER CALLBACK
 * =========================================================
 */

async function safeAnswerCallback(
  token,
  callbackQueryId,
  text
) {

  try {

    await telegram(
      token,
      'answerCallbackQuery',
      {

        callback_query_id:
          callbackQueryId,

        text

      }
    );

  } catch (error) {

    console.error(
      'answerCallbackQuery error:',
      error
    );

  }

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

        method:
          'POST',

        headers: {

          'Content-Type':
            'application/json'

        },

        body:
          JSON.stringify(
            payload
          )

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

    return JSON.parse(
      body
    );

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

  return String(
    value
  )

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

  return (
    new Intl.DateTimeFormat(
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
    )
  );

}