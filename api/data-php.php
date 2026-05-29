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
        http_response_code($http_code);
        echo $response;
    }
} else {
    http_response_code(405);
    echo json_encode(array("error" => "Method not allowed"));
}
