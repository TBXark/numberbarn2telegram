import { load } from 'cheerio'

/**
 * Converts a ReadableStream to an ArrayBuffer.
 *
 * @param {ReadableStream} stream - The ReadableStream to convert.
 * @param {number} streamSize - The size of the stream.
 * @return {Promise<Uint8Array>} The converted ArrayBuffer.
 */
async function streamToArrayBuffer(stream, streamSize) {
    let result = new Uint8Array(streamSize);
    let bytesRead = 0;
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
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
    const PostalMime = require("postal-mime");
    const parser = new PostalMime.default();
    const parsedEmail = await parser.parse(raw);
    const html = parsedEmail.html
    const $ = load(html)
    const table = $('table')
    const fixStyle = (str) => str.replace('=\n', '')
    const from = fixStyle(table.find('tr').eq(0).find('td').eq(1).text())
    const to = fixStyle(table.find('tr').eq(1).find('td').eq(1).text())
    const date = fixStyle(table.find('tr').eq(2).find('td').eq(1).text())
    const message = fixStyle(table.find('tr').eq(3).find('td').eq(1).text())
    return { from, to, date, message }
}


/**
 * Sends a message to a Telegram chat using the Telegram API.
 *
 * @param {string} id - The ID of the chat to send the message to.
 * @param {string} token - The token for accessing the Telegram API.
 * @param {string} message - The message to send.
 * @return {Promise<Object>} A promise that resolves to the response from the Telegram API.
 */
async function sendMessageToTelegram(id, token, message) {
    const req = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: id,
            text: message
        })
    })
    const res = await req.json()
    return res
}

export default {
    async fetch(req, env, ctx) {
        return new Response('It works!');
    },
    async email(message, env, ctx) {
        const { TELEGRAM_ID: id, TELEGRAM_TOKEN: token, EMAIL_WHITELIST: whitelist } = env
        const whitelistArray = whitelist?.split(',') || []
        if (whitelistArray.length === 0) {
            whitelistArray.push('voicemail@numberbarn.com')
        }
        if (!whitelistArray.includes(message.from)) {
            return
        }
        const raw = await streamToArrayBuffer(message.raw, message.rawSize)
        const res = await readEmail(raw)
        const text = `
From    : ${res.from}
To      : ${res.to}
Date    : ${res.date}

-----------

${res.message}

        `
        await sendMessageToTelegram(id, token, text)
    }
}

