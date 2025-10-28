<?php
// 🌐 Adresa a klíč k API bota
define('BOT_API', 'https://discord-vote-system.onrender.com/api');
define('BOT_KEY', 'super-tajne-heslo-pro-web'); // musí být 1:1 stejné jako v Render .env

/**
 * Volá REST API bota
 * @param string $method GET|POST|DELETE|PUT
 * @param string $path např. "/polls" nebo "/guilds"
 * @param array|null $data JSON tělo (volitelné)
 */
function bot_api($method, $path, $data = null) {
  // 🔧 Ujisti se, že URL začíná lomítkem
  if ($path[0] !== '/') $path = '/' . $path;
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
    CURLOPT_TIMEOUT => 15,
    CURLOPT_CUSTOMREQUEST => strtoupper($method),
  ];

  // 💾 Data (pouze u POST/PUT)
  if (in_array(strtoupper($method), ['POST','PUT','PATCH']) && !empty($data)) {
    $opts[CURLOPT_POSTFIELDS] = json_encode($data, JSON_UNESCAPED_UNICODE);
  }

  curl_setopt_array($ch, $opts);

  $body = curl_exec($ch);
  $err  = curl_error($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  // 🧩 Pokročilý debug mód při chybě
  if ($code !== 200 && $code !== 201 && $code !== 204) {
    error_log("❌ BOT API ERROR: {$method} {$url} returned {$code}");
    if ($err) error_log("🔧 CURL error: {$err}");
    if ($body) error_log("📦 Body: {$body}");
  }

  return [
    'status' => $code ?: 0,
    'error'  => $err ?: null,
    'json'   => $body ? json_decode($body, true) : null,
    'raw'    => $body
  ];
}
