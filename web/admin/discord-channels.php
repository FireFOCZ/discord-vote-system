<?php
require_once __DIR__ . '/../includes/discord_api.php';
header('Content-Type: application/json; charset=utf-8');

$guildId = $_GET['guild_id'] ?? '';
if (!$guildId) { http_response_code(400); echo json_encode(['error'=>'guild_id missing']); exit; }

$r = bot_api('GET', '/channels?guild_id=' . urlencode($guildId));
http_response_code($r['status'] ?: 500);
echo $r['raw'] ?: json_encode(['error'=>'no response']);
