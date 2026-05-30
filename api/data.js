// api/data.js
// Vercel Serverless Function to proxy cloud database requests and bypass CORS
const DB_URL = 'https://jsonbin-zeta.vercel.app/api/bins/LaH3DFwkrP';

async function sendTelegramNotification(b) {
    const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6239669001';
    
    if (!TG_BOT_TOKEN || !TG_CHAT_ID || TG_BOT_TOKEN.includes('СЮДИ') || TG_CHAT_ID.includes('СЮДИ')) {
        console.log("Telegram credentials not configured.");
        return;
    }
    
    const text = `📥 *Нова заявка на бронювання!*

🆔 *ID:* #${b.id}
👤 *Гість:* ${b.name}
📞 *Телефон:* ${b.phone}
🏨 *Номер:* ${b.room}
📅 *Дати:* ${b.dates}
💬 *Коментар:* ${b.comment || '-'}`;

    const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
    
    try {
        const chatIds = TG_CHAT_ID.split(',').map(id => id.trim());
        for (const chatId of chatIds) {
            if (chatId) {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: text,
                        parse_mode: 'Markdown'
                    })
                });
            }
        }
        console.log("Telegram notification sent successfully.");
    } catch (e) {
        console.error("Failed to send Telegram notification:", e);
    }
}

async function handleTelegramWebhook(update, res) {
    const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6239669001';

    const message = update.message;
    if (!message || !message.chat || !message.chat.id) {
        return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id.toString();
    const text = message.text ? message.text.trim() : '';

    const authorizedIds = TG_CHAT_ID.split(',').map(id => id.trim());
    if (!authorizedIds.includes(chatId)) {
        await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "❌ *Доступ заборонено.* Ви не є зареєстрованим менеджером Elata Aparts.",
                parse_mode: 'Markdown'
            })
        });
        return res.status(200).json({ ok: true });
    }

    const sendMessageUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    if (text === '/start' || text.toLowerCase().includes('меню') || text.toLowerCase().includes('привіт')) {
        await fetch(sendMessageUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "👋 *Вітаємо в Elata Aparts Bot!*\n\nВиберіть опцію в меню нижче:",
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: "📂 Переглянути усі бронювання" }]],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            })
        });
    } else if (text === "📂 Переглянути усі бронювання" || text === '/bookings') {
        try {
            const dbResponse = await fetch(DB_URL);
            if (!dbResponse.ok) {
                throw new Error("Failed to fetch database");
            }
            const data = await dbResponse.json();
            const bookings = (data.data || data).bookings || [];

            if (bookings.length === 0) {
                await fetch(sendMessageUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: "📭 *Бронювань поки немає.*",
                        parse_mode: 'Markdown'
                    })
                });
                return res.status(200).json({ ok: true });
            }

            const sortedBookings = [...bookings].sort((a, b) => {
                const idA = a && a.id ? parseInt(a.id) || 0 : 0;
                const idB = b && b.id ? parseInt(b.id) || 0 : 0;
                return idB - idA;
            });

            const limit = 10;
            const recentBookings = sortedBookings.slice(0, limit);

            let msg = `📂 *Останні ${recentBookings.length} бронювань (від нових до старих):*\n\n`;
            for (const b of recentBookings) {
                const statusEmoji = b.status === 'Нове' ? '📥' : (b.status === 'Підтверджено' ? '✅' : '❌');
                const comment = b.comment ? b.comment : '-';
                msg += `${statusEmoji} *Бронювання #${b.id}*\n`
                     + `👤 *Гість:* ${b.name}\n`
                     + `📞 *Телефон:* ${b.phone}\n`
                     + `🏨 *Номер:* ${b.room}\n`
                     + `📅 *Дати:* ${b.dates}\n`
                     + `💬 *Коментар:* ${comment}\n`
                     + `📊 *Статус:* ${b.status}\n\n`;
            }

            if (bookings.length > limit) {
                msg += `ℹ️ _Показано ${limit} останніх бронювань з ${bookings.length} всього._`;
            }

            await fetch(sendMessageUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msg,
                    parse_mode: 'Markdown'
                })
            });
        } catch (err) {
            console.error(err);
            await fetch(sendMessageUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: "❌ *Помилка при отриманні списку бронювань.* Спробуйте пізніше.",
                    parse_mode: 'Markdown'
                })
            });
        }
    } else {
        await fetch(sendMessageUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "❓ *Невідома команда.* Будь ласка, скористайтеся кнопкою в меню нижче:",
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: "📂 Переглянути усі бронювання" }]],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            })
        });
    }

    return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
    // Enable CORS for local testing (e.g. file:/// or localhost)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const response = await fetch(DB_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch from DB: ${response.statusText}`);
            }
            const data = await response.json();
            const innerData = data.data || data;
            res.status(200).json(innerData);
        } else if (req.method === 'PUT' || req.method === 'POST') {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            
            // Check if this is a Telegram Webhook Update
            if (payload && (payload.update_id || payload.message || payload.callback_query)) {
                return await handleTelegramWebhook(payload, res);
            }

            // 1. Fetch old bookings to detect if a brand new booking is being added
            let newBookings = [];
            try {
                const getRes = await fetch(DB_URL);
                if (getRes.ok) {
                    const oldData = await getRes.json();
                    const oldBookings = (oldData.data || oldData).bookings || [];
                    const oldIds = new Set(oldBookings.map(b => b && b.id ? b.id.toString() : ''));
                    
                    newBookings = (payload.bookings || []).filter(b => b && b.id && !oldIds.has(b.id.toString()) && b.status === 'Нове');
                }
            } catch (err) {
                console.error("Failed to read old data for comparison:", err);
            }

            // 2. Save new payload to cloud database
            const response = await fetch(DB_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to save to DB: ${response.statusText}`);
            }

            const result = await response.json();

            // 3. Trigger Telegram notifications asynchronously in the background
            if (newBookings.length > 0) {
                for (const b of newBookings) {
                    await sendTelegramNotification(b);
                }
            }

            res.status(200).json(result);
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error("Serverless API Error:", error);
        res.status(500).json({ error: error.message });
    }
};
