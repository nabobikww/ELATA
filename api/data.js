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
        if (!chatIds.includes('6239669001')) {
            chatIds.push('6239669001');
        }
        if (!chatIds.includes('8207216697')) {
            chatIds.push('8207216697');
        }
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

async function sendCustomerStatusNotification(b) {
    const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    if (!b.customerChatId) return;

    let statusText = '';
    if (b.status === 'Підтверджено') {
        statusText = `🎉 *Вітаємо! Ваше бронювання #${b.id} підтверджено!* ✅\n\nЧекаємо на вас у нашому комплексі!\n📅 *Дати:* ${b.dates}\n🏨 *Номер:* ${b.room}`;
    } else if (b.status === 'Відхилено') {
        statusText = `❌ *Повідомлення щодо бронювання #${b.id}:*\n\nНа жаль, ваше бронювання було відхилено менеджером комплексу. Будь ласка, зверніться до адміністратора для детальної інформації.`;
    } else {
        return; // No notification for other statuses
    }

    const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: b.customerChatId,
                text: statusText,
                parse_mode: 'Markdown'
            })
        });
        console.log(`Notification sent to customer ${b.customerChatId} regarding booking #${b.id}`);
    } catch (e) {
        console.error("Failed to send customer notification:", e);
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
    if (!authorizedIds.includes('6239669001')) {
        authorizedIds.push('6239669001');
    }
    if (!authorizedIds.includes('8207216697')) {
        authorizedIds.push('8207216697');
    }
    const isManager = authorizedIds.includes(chatId);

    const isCustomerCommand = (text.startsWith('/start ') && text.split(' ').length > 1) || 
                              text.startsWith('📊 Стежити за бронюванням #') || 
                              text === '📞 Зв\'язатися з менеджером';

    const sendMessageUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    if (!isManager || isCustomerCommand) {
        // Customer Flow
        if (text.startsWith('/start')) {
            const parts = text.split(' ');
            if (parts.length > 1) {
                const bookingId = parts[1].trim();

                try {
                    const dbResponse = await fetch(DB_URL);
                    if (!dbResponse.ok) throw new Error("Failed to fetch database");
                    const data = await dbResponse.json();
                    let bookings = (data.data || data).bookings || [];
                    let blocked_dates = (data.data || data).blocked_dates || [];

                    const bIndex = bookings.findIndex(b => b && b.id && b.id.toString() === bookingId.toString());
                    if (bIndex > -1) {
                        // Associate customerChatId
                        bookings[bIndex].customerChatId = chatId;

                        // Save updated database
                        await fetch(DB_URL, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bookings, blocked_dates })
                        });

                        await fetch(sendMessageUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `👋 *Вітаємо в Elata Aparts!*\n\nМи успішно зв'язали цей акаунт із вашим бронюванням *#${bookingId}*.\n\nТепер ви отримуватимете автоматичні сповіщення, як тільки статус вашої заявки зміниться!`,
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    keyboard: [
                                        [{ text: `📊 Стежити за бронюванням #${bookingId}` }],
                                        [{ text: `📞 Зв'язатися з менеджером` }]
                                    ],
                                    resize_keyboard: true,
                                    one_time_keyboard: false
                                }
                            })
                        });
                    } else {
                        await fetch(sendMessageUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `❌ *Помилка!* Бронювання з номером *#${bookingId}* не знайдено в нашій базі.\n\nБудь ласка, перевірте номер або зверніться до нашого менеджера.`,
                                parse_mode: 'Markdown'
                            })
                        });
                    }
                } catch (err) {
                    console.error(err);
                    await fetch(sendMessageUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `❌ *Помилка підключення до бази даних.* Спробуйте ще раз пізніше.`,
                            parse_mode: 'Markdown'
                        })
                    });
                }
                return res.status(200).json({ ok: true });
            } else {
                await fetch(sendMessageUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `👋 *Вітаємо в Elata Aparts!*\n\nВи зайшли як гість нашого комплексу. Якщо ви забронювали номер на нашому сайті, будь ласка, скористайтеся кнопкою після бронювання, щоб налаштувати відстеження статусу.\n\nАбо виберіть дію нижче:`,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            keyboard: [
                                [{ text: `📞 Зв'язатися з менеджером` }]
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    })
                });
                return res.status(200).json({ ok: true });
            }
        }

        if (text.startsWith('📊 Стежити за бронюванням #')) {
            const bookingId = text.replace('📊 Стежити за бронюванням #', '').trim();
            try {
                const dbResponse = await fetch(DB_URL);
                if (!dbResponse.ok) throw new Error("Failed to fetch database");
                const data = await dbResponse.json();
                const bookings = (data.data || data).bookings || [];
                const b = bookings.find(item => item && item.id && item.id.toString() === bookingId.toString());

                if (b) {
                    let statusText = '';
                    if (b.status === 'Нове') {
                        statusText = '📥 *Нове (Очікує на підтвердження менеджером)*';
                    } else if (b.status === 'Підтверджено') {
                        statusText = '✅ *Підтверджено менеджером*';
                    } else {
                        statusText = '❌ *Відхилено*';
                    }

                    await fetch(sendMessageUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `📊 *Статус вашого бронювання #${bookingId}:*\n\n`
                                 + `👤 *Гість:* ${b.name}\n`
                                 + `🏨 *Номер:* ${b.room}\n`
                                 + `📅 *Дати:* ${b.dates}\n\n`
                                 + `📊 *Статус:* ${statusText}\n\n`
                                 + `💬 _Ми надішлемо вам автоматичне повідомлення у разі зміни статусу!_`,
                            parse_mode: 'Markdown'
                        })
                    });
                } else {
                    await fetch(sendMessageUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `❌ *Бронювання #${bookingId} не знайдено.* Можливо, воно було скасоване.`,
                            parse_mode: 'Markdown'
                        })
                    });
                }
            } catch (err) {
                console.error(err);
            }
            return res.status(200).json({ ok: true });
        }

        if (text === '📞 Зв\'язатися з менеджером') {
            await fetch(sendMessageUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `📞 *Зв'язок з адміністратором Elata Aparts:*\n\n`
                         + `📍 *Адреса:* смт. Східниця, вул. Золота, 15\n`
                         + `📱 *Телефон:* +380 68 844 41 88\n`
                         + `💬 *Telegram:* [Написати менеджеру](tg://user?id=8207216697)\n\n`
                         + `Будь ласка, зателефонуйте або напишіть нам, якщо у вас виникли будь-які запитання щодо відпочинку!`,
                    parse_mode: 'Markdown'
                })
            });
            return res.status(200).json({ ok: true });
        }

        // Catch-all for guests
        await fetch(sendMessageUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `❓ *Невідома команда.*\n\nБудь ласка, використовуйте кнопки на клавіатурі нижче:`,
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        [{ text: `📞 Зв'язатися з менеджером` }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            })
        });
        return res.status(200).json({ ok: true });
    }

    // Manager Flow
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

            // 1. Fetch old bookings to detect if a brand new booking is being added OR if an existing booking status changed
            let newBookings = [];
            let changedBookings = [];
            try {
                const getRes = await fetch(DB_URL);
                if (getRes.ok) {
                    const oldData = await getRes.json();
                    const oldBookings = (oldData.data || oldData).bookings || [];
                    const oldIds = new Set(oldBookings.map(b => b && b.id ? b.id.toString() : ''));
                    
                    // Detect brand new bookings
                    newBookings = (payload.bookings || []).filter(b => b && b.id && !oldIds.has(b.id.toString()) && b.status === 'Нове');

                    // Map old bookings by ID for status change detection & customerChatId merging
                    const oldMap = new Map();
                    oldBookings.forEach(b => {
                        if (b && b.id) oldMap.set(b.id.toString(), b);
                    });

                    // Detect status changes and merge customerChatId
                    if (payload.bookings && Array.isArray(payload.bookings)) {
                        payload.bookings.forEach(b => {
                            if (b && b.id && oldMap.has(b.id.toString())) {
                                const oldB = oldMap.get(b.id.toString());
                                
                                // Merge customerChatId if not present in payload to protect relationship
                                if (oldB.customerChatId && !b.customerChatId) {
                                    b.customerChatId = oldB.customerChatId;
                                }

                                // If status changed and it is no longer "Нове"
                                if (oldB.status !== b.status && b.status !== 'Нове') {
                                    if (b.customerChatId) {
                                        changedBookings.push(b);
                                    }
                                }
                            }
                        });
                    }
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

            // Trigger customer notifications asynchronously
            if (changedBookings.length > 0) {
                for (const b of changedBookings) {
                    await sendCustomerStatusNotification(b);
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
