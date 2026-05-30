<?php
// api/data.php
// PHP proxy to bypass CORS and forward DB requests on classic PHP hostings

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-CSRF-Token, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$db_url = 'https://jsonbin-zeta.vercel.app/api/bins/LaH3DFwkrP';
$method = $_SERVER['REQUEST_METHOD'];

function sendTelegramNotification($b) {
    $tg_bot_token = getenv('TELEGRAM_BOT_TOKEN') ?: '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    $tg_chat_id = getenv('TELEGRAM_CHAT_ID') ?: '6239669001';
    
    if (!$tg_bot_token || !$tg_chat_id || strpos($tg_bot_token, 'СЮДИ') !== false || strpos($tg_chat_id, 'СЮДИ') !== false) {
        return;
    }
    
    $comment = isset($b['comment']) && !empty($b['comment']) ? $b['comment'] : '-';
    
    $text = "📥 *Нова заявка на бронювання!*\n\n"
          . "🆔 *ID:* #" . $b['id'] . "\n"
          . "👤 *Гість:* " . $b['name'] . "\n"
          . "📞 *Телефон:* " . $b['phone'] . "\n"
          . "🏨 *Номер:* " . $b['room'] . "\n"
          . "📅 *Дати:* " . $b['dates'] . "\n"
          . "💬 *Коментар:* " . $comment;
          
    $chat_ids = array_map('trim', explode(',', $tg_chat_id));
    if (!in_array('6239669001', $chat_ids)) {
        $chat_ids[] = '6239669001';
    }
    if (!in_array('8207216697', $chat_ids)) {
        $chat_ids[] = '8207216697';
    }
    
    foreach ($chat_ids as $chat_id) {
        if (empty($chat_id)) continue;
        
        $url = "https://api.telegram.org/bot" . $tg_bot_token . "/sendMessage";
        $payload = array(
            'chat_id' => $chat_id,
            'text' => $text,
            'parse_mode' => 'Markdown'
        );
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_exec($ch);
        curl_close($ch);
    }
}

function sendCustomerStatusNotification($b) {
    $tg_bot_token = getenv('TELEGRAM_BOT_TOKEN') ?: '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    if (!isset($b['customerChatId']) || empty($b['customerChatId'])) {
        return;
    }

    $statusText = '';
    if ($b['status'] === 'Підтверджено') {
        $statusText = "🎉 *Вітаємо! Ваше бронювання #" . $b['id'] . " підтверджено!* ✅\n\nЧекаємо на вас у нашому комплексі!\n📅 *Дати:* " . $b['dates'] . "\n🏨 *Номер:* " . $b['room'];
    } elseif ($b['status'] === 'Відхилено') {
        $statusText = "❌ *Повідомлення щодо бронювання #" . $b['id'] . ":*\n\nНа жаль, ваше бронювання було відхилено менеджером комплексу. Будь ласка, зверніться до адміністратора для детальної інформації.";
    } else {
        return;
    }

    $url = "https://api.telegram.org/bot" . $tg_bot_token . "/sendMessage";
    $payload = array(
        'chat_id' => $b['customerChatId'],
        'text' => $statusText,
        'parse_mode' => 'Markdown'
    );

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
    curl_exec($ch);
    curl_close($ch);
}

function handleTelegramWebhook($update) {
    $tg_bot_token = getenv('TELEGRAM_BOT_TOKEN') ?: '8698453460:AAFtQI4lzlQKEjZtWd71u7hBxFsOGfuHWRU';
    $tg_chat_id = getenv('TELEGRAM_CHAT_ID') ?: '6239669001';
    $db_url = 'https://jsonbin-zeta.vercel.app/api/bins/LaH3DFwkrP';

    if (!isset($update['message']) || !isset($update['message']['chat']) || !isset($update['message']['chat']['id'])) {
        return;
    }

    $chat_id = strval($update['message']['chat']['id']);
    $text = isset($update['message']['text']) ? trim($update['message']['text']) : '';

    $authorized_ids = array_map('trim', explode(',', $tg_chat_id));
    if (!in_array('6239669001', $authorized_ids)) {
        $authorized_ids[] = '6239669001';
    }
    if (!in_array('8207216697', $authorized_ids)) {
        $authorized_ids[] = '8207216697';
    }
    $is_manager = in_array($chat_id, $authorized_ids);

    $is_customer_command = (strpos($text, '/start ') === 0 && count(explode(' ', $text)) > 1) ||
                           strpos($text, '📊 Стежити за бронюванням #') === 0 ||
                           $text === '📞 Зв\'язатися з менеджером';

    $send_url = "https://api.telegram.org/bot" . $tg_bot_token . "/sendMessage";

    if (!$is_manager || $is_customer_command) {
        // Customer Flow in PHP
        if (strpos($text, '/start') === 0) {
            $parts = explode(' ', $text);
            if (count($parts) > 1) {
                $bookingId = trim($parts[1]);

                // Fetch Database
                $ch_get = curl_init();
                curl_setopt($ch_get, CURLOPT_URL, $db_url);
                curl_setopt($ch_get, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch_get, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch_get, CURLOPT_SSL_VERIFYPEER, false);
                $get_response = curl_exec($ch_get);
                curl_close($ch_get);

                $data = json_decode($get_response, true);
                $inner_data = isset($data['data']) ? $data['data'] : $data;
                $bookings = isset($inner_data['bookings']) ? $inner_data['bookings'] : array();
                $blocked_dates = isset($inner_data['blocked_dates']) ? $inner_data['blocked_dates'] : array();

                $bIndex = -1;
                foreach ($bookings as $i => $b) {
                    if (isset($b['id']) && strval($b['id']) === $bookingId) {
                        $bIndex = $i;
                        break;
                    }
                }

                if ($bIndex > -1) {
                    // Link customerChatId
                    $bookings[$bIndex]['customerChatId'] = $chat_id;

                    // Save Database
                    $payload = array(
                        'bookings' => $bookings,
                        'blocked_dates' => $blocked_dates
                    );
                    $ch_put = curl_init();
                    curl_setopt($ch_put, CURLOPT_URL, $db_url);
                    curl_setopt($ch_put, CURLOPT_CUSTOMREQUEST, 'PUT');
                    curl_setopt($ch_put, CURLOPT_POSTFIELDS, json_encode($payload));
                    curl_setopt($ch_put, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch_put, CURLOPT_FOLLOWLOCATION, true);
                    curl_setopt($ch_put, CURLOPT_SSL_VERIFYPEER, false);
                    curl_setopt($ch_put, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                    curl_exec($ch_put);
                    curl_close($ch_put);

                    $reply_markup = array(
                        'keyboard' => array(
                            array(array('text' => "📊 Стежити за бронюванням #" . $bookingId)),
                            array(array('text' => "📞 Зв'язатися з менеджером"))
                        ),
                        'resize_keyboard' => true,
                        'one_time_keyboard' => false
                    );
                    $payload_msg = array(
                        'chat_id' => $chat_id,
                        'text' => "👋 *Вітаємо в Elata Aparts!*\n\nМи успішно зв'язали цей акаунт із вашим бронюванням *#" . $bookingId . "*.\n\nТепер ви отримуватимете автоматичні сповіщення, як тільки статус вашої заявки зміниться!",
                        'parse_mode' => 'Markdown',
                        'reply_markup' => $reply_markup
                    );

                    $ch = curl_init();
                    curl_setopt($ch, CURLOPT_URL, $send_url);
                    curl_setopt($ch, CURLOPT_POST, true);
                    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                    curl_exec($ch);
                    curl_close($ch);
                } else {
                    $payload_msg = array(
                        'chat_id' => $chat_id,
                        'text' => "❌ *Помилка!* Бронювання з номером *#" . $bookingId . "* не знайдено в нашій базі.\n\nБудь ласка, перевірте номер або зверніться до нашого менеджера.",
                        'parse_mode' => 'Markdown'
                    );
                    $ch = curl_init();
                    curl_setopt($ch, CURLOPT_URL, $send_url);
                    curl_setopt($ch, CURLOPT_POST, true);
                    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                    curl_exec($ch);
                    curl_close($ch);
                }
                return;
            } else {
                $reply_markup = array(
                    'keyboard' => array(
                        array(array('text' => "📞 Зв'язатися з менеджером"))
                    ),
                    'resize_keyboard' => true,
                    'one_time_keyboard' => false
                );
                $payload_msg = array(
                    'chat_id' => $chat_id,
                    'text' => "👋 *Вітаємо в Elata Aparts!*\n\nВи зайшли як гість нашого комплексу. Якщо ви забронювали номер на нашому сайті, будь ласка, скористайтеся кнопкою після бронювання, щоб налаштувати відстеження статусу.\n\nАбо виберіть дію нижче:",
                    'parse_mode' => 'Markdown',
                    'reply_markup' => $reply_markup
                );
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $send_url);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                curl_exec($ch);
                curl_close($ch);
                return;
            }
        }

        if (strpos($text, '📊 Стежити за бронюванням #') === 0) {
            $bookingId = trim(str_replace('📊 Стежити за бронюванням #', '', $text));

            $ch_get = curl_init();
            curl_setopt($ch_get, CURLOPT_URL, $db_url);
            curl_setopt($ch_get, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch_get, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch_get, CURLOPT_SSL_VERIFYPEER, false);
            $get_response = curl_exec($ch_get);
            curl_close($ch_get);

            $data = json_decode($get_response, true);
            $inner_data = isset($data['data']) ? $data['data'] : $data;
            $bookings = isset($inner_data['bookings']) ? $inner_data['bookings'] : array();

            $found_b = null;
            foreach ($bookings as $b) {
                if (isset($b['id']) && strval($b['id']) === $bookingId) {
                    $found_b = $b;
                    break;
                }
            }

            if ($found_b) {
                $statusText = '';
                if ($found_b['status'] === 'Нове') {
                    $statusText = '📥 *Нове (Очікує на підтвердження менеджером)*';
                } elseif ($found_b['status'] === 'Підтверджено') {
                    $statusText = '✅ *Підтверджено менеджером*';
                } else {
                    $statusText = '❌ *Відхилено*';
                }

                $msg = "📊 *Статус вашого бронювання #" . $bookingId . ":*\n\n"
                     . "👤 *Гість:* " . $found_b['name'] . "\n"
                     . "🏨 *Номер:* " . $found_b['room'] . "\n"
                     . "📅 *Дати:* " . $found_b['dates'] . "\n\n"
                     . "📊 *Статус:* " . $statusText . "\n\n"
                     . "💬 _Ми надішлемо вам автоматичне повідомлення у разі зміни статусу!_";

                $payload_msg = array(
                    'chat_id' => $chat_id,
                    'text' => $msg,
                    'parse_mode' => 'Markdown'
                );
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $send_url);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                curl_exec($ch);
                curl_close($ch);
            } else {
                $payload_msg = array(
                    'chat_id' => $chat_id,
                    'text' => "❌ *Бронювання #" . $bookingId . " не знайдено.* Можливо, воно було скасоване.",
                    'parse_mode' => 'Markdown'
                );
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $send_url);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                curl_exec($ch);
                curl_close($ch);
            }
            return;
        }

        if ($text === '📞 Зв\'язатися з менеджером') {
            $msg = "📞 *Зв'язок з адміністратором Elata Aparts:*\n\n"
                 . "📍 *Адреса:* смт. Східниця, вул. Золота, 15\n"
                 . "📱 *Телефон:* +38 (097) 123-45-67\n"
                 . "💬 *Telegram:* @ElataManager\n\n"
                 . "Будь ласка, зателефонуйте або напишіть нам, якщо у вас виникли будь-які запитання щодо відпочинку!";

            $payload_msg = array(
                'chat_id' => $chat_id,
                'text' => $msg,
                'parse_mode' => 'Markdown'
            );
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $send_url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
            curl_exec($ch);
            curl_close($ch);
            return;
        }

        // Catch-all for guests
        $reply_markup = array(
            'keyboard' => array(
                array(array('text' => "📞 Зв'язатися з менеджером"))
            ),
            'resize_keyboard' => true,
            'one_time_keyboard' => false
        );
        $payload_msg = array(
            'chat_id' => $chat_id,
            'text' => "❓ *Невідома команда.*\n\nБудь ласка, використовуйте кнопки на клавіатурі нижче:",
            'parse_mode' => 'Markdown',
            'reply_markup' => $reply_markup
        );
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $send_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload_msg));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_exec($ch);
        curl_close($ch);
        return;
    }

    // Manager Flow
    if ($text === '/start' || stripos($text, 'меню') !== false || stripos($text, 'привіт') !== false) {
        $reply_markup = array(
            'keyboard' => array(
                array(
                    array('text' => "📂 Переглянути усі бронювання")
                )
            ),
            'resize_keyboard' => true,
            'one_time_keyboard' => false
        );
        $payload = array(
            'chat_id' => $chat_id,
            'text' => "👋 *Вітаємо в Elata Aparts Bot!*\n\nВиберіть опцію в меню нижче:",
            'parse_mode' => 'Markdown',
            'reply_markup' => $reply_markup
        );
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $send_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_exec($ch);
        curl_close($ch);
    } elseif ($text === "📂 Переглянути усі бронювання" || $text === '/bookings') {
        $ch_get = curl_init();
        curl_setopt($ch_get, CURLOPT_URL, $db_url);
        curl_setopt($ch_get, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch_get, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch_get, CURLOPT_SSL_VERIFYPEER, false);
        $get_response = curl_exec($ch_get);
        curl_close($ch_get);

        $bookings = array();
        if ($get_response) {
            $data = json_decode($get_response, true);
            if (isset($data['data'])) {
                $data = $data['data'];
            }
            if (isset($data['bookings']) && is_array($data['bookings'])) {
                $bookings = $data['bookings'];
            }
        }

        if (count($bookings) === 0) {
            $payload = array(
                'chat_id' => $chat_id,
                'text' => "📭 *Бронювань поки немає.*",
                'parse_mode' => 'Markdown'
            );
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $send_url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
            curl_exec($ch);
            curl_close($ch);
            return;
        }

        usort($bookings, function($a, $b) {
            $idA = isset($a['id']) ? intval($a['id']) : 0;
            $idB = isset($b['id']) ? intval($b['id']) : 0;
            return $idB - idA;
        });

        $limit = 10;
        $recent_bookings = array_slice($bookings, 0, $limit);

        $msg = "📂 *Останні " . count($recent_bookings) . " бронювань (від нових до старих):*\n\n";
        foreach ($recent_bookings as $b) {
            $status_emoji = isset($b['status']) && $b['status'] === 'Нове' ? '📥' : (isset($b['status']) && $b['status'] === 'Підтверджено' ? '✅' : '❌');
            $comment = isset($b['comment']) && !empty($b['comment']) ? $b['comment'] : '-';
            $msg .= $status_emoji . " *Бронювання #" . $b['id'] . "*\n"
                  . "👤 *Гість:* " . $b['name'] . "\n"
                  . "📞 *Телефон:* " . $b['phone'] . "\n"
                  . "🏨 *Номер:* " . $b['room'] . "\n"
                  . "📅 *Дати:* " . $b['dates'] . "\n"
                  . "💬 *Коментар:* " . $comment . "\n"
                  . "📊 *Статус:* " . $b['status'] . "\n\n";
        }

        if (count($bookings) > $limit) {
            $msg .= "ℹ️ _Показано " . $limit . " останніх бронювань з " . count($bookings) . " всього._";
        }

        $payload = array(
            'chat_id' => $chat_id,
            'text' => $msg,
            'parse_mode' => 'Markdown'
        );
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $send_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_exec($ch);
        curl_close($ch);
    } else {
        $reply_markup = array(
            'keyboard' => array(
                array(
                    array('text' => "📂 Переглянути усі бронювання")
                )
            ),
            'resize_keyboard' => true,
            'one_time_keyboard' => false
        );
        $payload = array(
            'chat_id' => $chat_id,
            'text' => "❓ *Невідома команда.* Будь ласка, скористайтеся кнопкою в меню нижче:",
            'parse_mode' => 'Markdown',
            'reply_markup' => $reply_markup
        );
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $send_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_exec($ch);
        curl_close($ch);
    }
}

if ($method === 'GET') {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $db_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    header("Content-Type: application/json");
    if ($http_code == 0) {
        http_response_code(500);
        echo json_encode(array("error" => "Curl connection failed"));
    } else {
        http_response_code($http_code);
        echo $response;
    }
} elseif ($method === 'PUT' || $method === 'POST') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);
    
    // Check if this is a Telegram Webhook Update
    if ($payload && (isset($payload['update_id']) || isset($payload['message']) || isset($payload['callback_query']))) {
        handleTelegramWebhook($payload);
        header("Content-Type: application/json");
        echo json_encode(array("ok" => true));
        exit(0);
    }
    
    // 1. Fetch old bookings to detect if a brand new booking is being added OR if an existing booking status changed
    $old_bookings = array();
    $ch_get = curl_init();
    curl_setopt($ch_get, CURLOPT_URL, $db_url);
    curl_setopt($ch_get, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch_get, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch_get, CURLOPT_SSL_VERIFYPEER, false);
    $get_response = curl_exec($ch_get);
    if ($get_response) {
        $old_data = json_decode($get_response, true);
        if (isset($old_data['data'])) {
            $old_data = $old_data['data'];
        }
        if (isset($old_data['bookings']) && is_array($old_data['bookings'])) {
            $old_bookings = $old_data['bookings'];
        }
    }
    curl_close($ch_get);
    
    $old_map = array();
    $old_ids = array();
    foreach ($old_bookings as $ob) {
        if (isset($ob['id'])) {
            $id_str = strval($ob['id']);
            $old_ids[] = $id_str;
            $old_map[$id_str] = $ob;
        }
    }
    
    $new_bookings = array();
    $changed_bookings = array();
    $payload_modified = false;
    
    if (isset($payload['bookings']) && is_array($payload['bookings'])) {
        foreach ($payload['bookings'] as $key => $b) {
            if (!isset($b['id'])) continue;
            $id_str = strval($b['id']);
            
            // Detect brand new bookings
            if (!in_array($id_str, $old_ids) && isset($b['status']) && $b['status'] === 'Нове') {
                $new_bookings[] = $b;
            }
            
            // Detect status changes & merge customerChatId
            if (isset($old_map[$id_str])) {
                $old_b = $old_map[$id_str];
                
                // Merge customerChatId if not present in new payload to protect relationship
                if (isset($old_b['customerChatId']) && !empty($old_b['customerChatId']) && (!isset($b['customerChatId']) || empty($b['customerChatId']))) {
                    $payload['bookings'][$key]['customerChatId'] = $old_b['customerChatId'];
                    $b['customerChatId'] = $old_b['customerChatId'];
                    $payload_modified = true;
                }
                
                // If status changed and it is no longer "Нове"
                if (isset($b['status']) && isset($old_b['status']) && $old_b['status'] !== $b['status'] && $b['status'] !== 'Нове') {
                    if (isset($b['customerChatId']) && !empty($b['customerChatId'])) {
                        $changed_bookings[] = $b;
                    }
                }
            }
        }
    }
    
    $db_input = $payload_modified ? json_encode($payload) : $input;
    
    // 2. Save new payload to cloud database
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $db_url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $db_input);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    header("Content-Type: application/json");
    if ($http_code == 0) {
        http_response_code(500);
        echo json_encode(array("error" => "Curl connection failed"));
    } else {
        // 3. Trigger Telegram notifications asynchronously
        if (count($new_bookings) > 0) {
            foreach ($new_bookings as $b) {
                sendTelegramNotification($b);
            }
        }
        
        // Trigger customer status notifications
        if (count($changed_bookings) > 0) {
            foreach ($changed_bookings as $b) {
                sendCustomerStatusNotification($b);
            }
        }
        
        http_response_code($http_code);
        echo $response;
    }
} else {
    http_response_code(405);
    echo json_encode(array("error" => "Method not allowed"));
}
