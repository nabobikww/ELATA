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
    
    if (!in_array($chat_id, $authorized_ids)) {
        $url = "https://api.telegram.org/bot" . $tg_bot_token . "/sendMessage";
        $payload = array(
            'chat_id' => $chat_id,
            'text' => "❌ *Доступ заборонено.* Ви не є зареєстрованим менеджером Elata Aparts.",
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
        return;
    }

    $send_url = "https://api.telegram.org/bot" . $tg_bot_token . "/sendMessage";

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
    
    // 1. Fetch old bookings to detect if a brand new booking is being added
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
    
    $old_ids = array();
    foreach ($old_bookings as $ob) {
        if (isset($ob['id'])) {
            $old_ids[] = strval($ob['id']);
        }
    }
    
    $new_bookings = array();
    if (isset($payload['bookings']) && is_array($payload['bookings'])) {
        foreach ($payload['bookings'] as $b) {
            if (isset($b['id']) && !in_array(strval($b['id']), $old_ids) && isset($b['status']) && $b['status'] === 'Нове') {
                $new_bookings[] = $b;
            }
        }
    }
    
    // 2. Save new payload to cloud database
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $db_url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
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
        
        http_response_code($http_code);
        echo $response;
    }
} else {
    http_response_code(405);
    echo json_encode(array("error" => "Method not allowed"));
}
