<?php
define('BOT_API', 'http://127.0.0.1:3000/api'); // pokud běží bot jinde, uprav
define('BOT_KEY', 'super-tajne-heslo-pro-web'); // MUSÍ 1:1 sedět s API_KEY v .env

function bot_api($method, $path, $data = null) {
  $url = BOT_API . $path;
  $ch = curl_init($url);

  $headers = [
    'X-API-Key: ' . BOT_KEY,
    'Content-Type: application/json'
  ];

  $opts = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => false,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_CUSTOMREQUEST => strtoupper($method), // 💥 DŮLEŽITÉ — pošle skutečnou metodu
  ];

  // 🔹 Pokud máš data (např. POST nebo PUT), přidej JSON tělo
  if (!empty($data)) {
    $opts[CURLOPT_POSTFIELDS] = json_encode($data, JSON_UNESCAPED_UNICODE);
  }

  curl_setopt_array($ch, $opts);

  $body = curl_exec($ch);
  $err  = curl_error($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  return [
    'status' => $code ?: 0,
    'error'  => $err ?: null,
    'json'   => $body ? json_decode($body, true) : null,
    'raw'    => $body
  ];
}
