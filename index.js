import {Router} from 'itty-router';
import {load} from 'cheerio';


/**
 * Converts a ReadableStream to an ArrayBuffer.
 *
 * @param {ReadableStream} stream - The ReadableStream to convert.
 * @param {number} streamSize - The size of the stream.
 * @return {Promise<Uint8Array>} The converted ArrayBuffer.
 */
async function streamToArrayBuffer(stream, streamSize) {
  const result = new Uint8Array(streamSize);
  let bytesRead = 0;
  const reader = stream.getReader();
  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }
    result.set(value, bytesRead);
    bytesRead += value.length;
  }
  return result;
}

/**
 * Reads an email and extracts relevant information.
 *
 * @param {Uint8Array} raw - The raw email content.
 * @return {Object|null} - An object containing the extracted information:
 *   - from: The sender of the email.
 *   - to: The recipient of the email.
 *   - date: The date of the email.
 *   - message: The message content of the email.
 *   Returns null if the email does not contain the required information.
 */
async function readEmail(raw) {
  const PostalMime = require('postal-mime');
  // eslint-disable-next-line
  const parser = new PostalMime.default();
  const parsedEmail = await parser.parse(raw);
  const html = parsedEmail.html;
  const $ = load(html);
  const table = $('table');
  const from = table.find('tr').eq(0).find('td').eq(1).text();
  const to = table.find('tr').eq(1).find('td').eq(1).text();
  const date = table.find('tr').eq(2).find('td').eq(1).text();
  const message = table.find('tr').eq(3).find('td').eq(1).text();
  return {from, to, date, message};
}

/**
 * Sends a message to a Telegram chat using the Telegram API.
 *
 * @param {string | number} id - The ID of the chat to send the message to.
 * @param {string} token - The token for accessing the Telegram API.
 * @param {string} message - The message to send.
 * @return {Promise<Object>} A promise that resolves to the response from the Telegram API.
 */
async function sendMessageToTelegram(id, token, message) {
  return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: id,
      text: message,
      disable_web_page_preview: true,
    }),
  });
}

/**
 * Loads blocks from the database.
 *
 * @param {object} env - The environment object.
 * @return {Promise<Array>} The loaded blocks.
 */
async function loadBlocks(env) {
  const {DATABASE} = env;
  const list = await DATABASE.get('blocks').then((r) => JSON.parse(r)).catch((e) => []);
  if (!list) {
    return [];
  }
  if (!Array.isArray(list)) {
    return [];
  }
  return list;
}

/**
 * Asynchronous function that handles incoming Telegram messages and performs various operations based on the message content.
 *
 * @param {Object} req - The HTTP request object that contains the incoming message payload.
 * @param {Object} env - The environment variables object that contains the Telegram token and database information.
 * @param {Object} ctx - The execution context object.
 * @return {Response} The response object that indicates the success or failure of the operation.
 */
async function telegramHandler(req, env, ctx) {
  const body = await req.json();
  const {TELEGRAM_TOKEN: token, TELEGRAM_ID: id, DATABASE} = env;
  const text = body?.message?.text;
  const target = body?.message?.chat?.id;

  if (!text || !target || `${target}` !== id) {
    return new Response('OK', {status: 200});
  }

  if (!DATABASE) {
    return sendMessageToTelegram(body.chat.id, token, `Database not found.`);
  }

  const list = await loadBlocks(env);

  // /blocks
  if (text.startsWith('/blocks')) {
    let message = '';
    if (list.length === 0) {
      message = 'No blocked numbers';
    } else {
      message = list.join('\n');
    }
    return sendMessageToTelegram(target, token, message);
  }

  // /block <id>
  if (text.startsWith('/block')) {
    let message = '';
    try {
      const cmp = text.split(' ');
      if (cmp.length !== 2) {
        throw new Error('Invalid operation, use /block <id>');
      }
      const id = parseInt(cmp[1]);
      list.push(id);
      await DATABASE.put('blocks', JSON.stringify(list));
      message = `Blocked ${id} successfully`;
    } catch (e) {
      message = e.message;
    }
    return sendMessageToTelegram(target, token, message);
  }

  // /unblock <id>
  if (text.startsWith('/unblock ')) {
    let message = '';
    try {
      const cmp = text.split(' ');
      if (cmp.length !== 2) {
        throw new Error('Invalid operation, use /unblock <id>');
      }
      const id = parseInt(cmp[1]);
      list.splice(list.indexOf(id), 1);
      await DATABASE.put('blocks', JSON.stringify(list));
      message = `Unblocked ${id} successfully`;
    } catch (e) {
      message = 'Invalid ID';
    }
    return sendMessageToTelegram(target, token, message);
  }

  return new Response('OK', {status: 200});
}

/**
 * Handles the fetch request from the client and returns a response.
 *
 * @param {Request} req - the fetch request object
 * @param {Object} env - the environment variables
 * @param {Object} ctx - the context object
 * @return {Promise<Response>} - the response object wrapped in a promise
 */
async function fetchHandler(req, env, ctx) {
  const {TELEGRAM_TOKEN: token} = env;

  // eslint-disable-next-line
  const router = Router();
  router.get('/init', async () => {
    const {hostname} = new URL(req.url);
    const url = `https://${hostname}/telegram/${token}/webhook`;
    const webhook = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
      }),
    }).then((r) => r.json());

    const command = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commands: [
          {
            command: '/blocks',
            description: 'List blocked numbers',
          },
          {
            command: '/block',
            description: 'Block a number, e.g. /block 1234567890',
          },
          {
            command: '/unblock',
            description: 'Unblock a number, e.g. /unblock 1234567890',
          },
        ],
      }),
    }).then((r) => r.json());
    const result = {
      webhook,
      command,
    };
    return new Response(JSON.stringify(result, null, 2));
  });
  router.post('/telegram/:t/webhook', async ({params}) => {
    if (params.t !== token) {
      return new Response('Invalid token');
    }
    return telegramHandler(req, env, ctx);
  });
  router.all('*', async () => {
    return new Response('It works!');
  });
  return router.handle(req).catch((e) => {
    return new Response(e.message, {status: 500});
  });
}

/**
 * Handles email messages.
 *
 * @param {object} message - The email message.
 * @param {object} env - The environment variables.
 * @param {object} ctx - The context object.
 * @return {Promise<void>} Returns a Promise that resolves to nothing.
 */
async function emailHandler(message, env, ctx) {
  const {
    TELEGRAM_ID: id,
    TELEGRAM_TOKEN: token,
    EMAIL_WHITELIST: whitelist,
    BACKUP_EMAIL: forward,
    BLOCK_NOTIFY: blockNotify,
  } = env;

  const whitelistArray = whitelist?.split(',') || [];
  if (whitelistArray.length === 0) {
    whitelistArray.push('voicemail@numberbarn.com');
  }
  if (!whitelistArray.includes(message.from)) {
    return;
  }

  const raw = await streamToArrayBuffer(message.raw, message.rawSize);
  const res = await readEmail(raw);
  const text = `
${res.message}

-----------
From\t\t:\t${res.from}
To\t\t\t:\t${res.to}
`;

  const blocks = await loadBlocks(env);
  const isBlocked = blocks.includes(parseInt(res.from));

  // 屏蔽号码的范围, 默认值为空只屏蔽Telegram, 可选项: `all`,`telegram`,`mail`
  const blockRange = (blockNotify || 'telegram').toLowerCase().trim();
  const isBlockTelegram = isBlocked && ['all', 'telegram'].includes(blockRange);
  const isBlockMail = isBlocked && ['all', 'mail'].includes(blockRange);

  if (!isBlockTelegram) {
    await sendMessageToTelegram(id, token, text);
  }
  if (forward && !isBlockMail) {
    await message.forward(forward);
  }
}


export default {
  fetch: fetchHandler,
  email: emailHandler,
};
