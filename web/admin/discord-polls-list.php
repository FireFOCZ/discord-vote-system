<?php
require_once __DIR__ . '/../includes/discord_api.php';

$pollsRes = bot_api('GET', '/polls');
$polls = $pollsRes['json'] ?? [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {
  $id = trim($_POST['delete_id']);
  $res = bot_api('DELETE', '/polls/'.$id);
  $debug = [
    'sent_id' => $id,
    'status' => $res['status'] ?? '??',
    'json' => $res['json'] ?? null,
    'raw' => $res['raw'] ?? null,
  ];

  if (!empty($res['json']['success'])) {
    header('Location: discord-polls-list.php?deleted=1');
    exit;
  } else {
    $msg = !empty($res['json']['error'])
      ? $res['json']['error']
      : 'Neznámá chyba z API';
    $error = "❌ Nepodařilo se smazat hlasování ({$res['status']}) — {$msg}";
  }
}
?>
<!doctype html>
<html lang="cs" data-bs-theme="dark">
<head>
  <meta charset="utf-8">
  <title>🗳️ Arasaka Discord Hlasování</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background: radial-gradient(circle at top, #0b0b0d, #050506); color: #eee; }
    h1 { color: #ff6a00; text-shadow: 0 0 8px #ff4500; }
    .table { color: #ddd; background: #141418; border-radius: 10px; overflow: hidden; }
    .badge-open { background: linear-gradient(135deg,#ff8a00,#ff3c00); }
    .badge-closed { background: #555; }
    .btn-arsk { background: linear-gradient(135deg,#ff8a00,#ff3c00); border: 0; }
    .btn-arsk:hover { filter: brightness(1.1); }
    pre.debug { background: #111; padding: 8px; border-radius: 6px; color: #aaa; font-size: 0.9em; }
  </style>
</head>
<body class="py-4 container">

  <h1 class="mb-4"><i class="bi bi-clipboard2-check"></i> Arasaka – Seznam hlasování</h1>

  <?php if(!empty($_GET['deleted'])): ?>
    <div class="alert alert-success">✅ Hlasování bylo odstraněno.</div>
  <?php endif; ?>

  <?php if(!empty($error)): ?>
    <div class="alert alert-danger"><?= htmlspecialchars($error) ?></div>
    <?php if(!empty($debug)): ?>
      <details class="mt-2">
        <summary>📜 Zobrazit detaily odpovědi API</summary>
        <pre class="debug"><?= htmlspecialchars(print_r($debug, true)) ?></pre>
      </details>
    <?php endif; ?>
  <?php endif; ?>

  <table class="table table-dark table-striped align-middle text-center">
    <thead class="table-dark">
      <tr>
        <th>#</th>
        <th>Otázka</th>
        <th>Server</th>
        <th>Kanál</th>
        <th>Vytvořil</th>
        <th>Stav</th>
        <th>Konec</th>
        <th>Akce</th>
      </tr>
    </thead>
    <tbody>
      <?php if(!$polls): ?>
        <tr><td colspan="8" class="text-secondary py-3">Žádné hlasování zatím neexistuje.</td></tr>
      <?php else: foreach($polls as $p): ?>
        <tr>
          <td><?= $p['id'] ?></td>
          <td class="text-start"><?= htmlspecialchars($p['question']) ?></td>
          <td><?= htmlspecialchars($p['guild_name'] ?? $p['guild_id']) ?></td>
          <td><?= htmlspecialchars($p['channel_name'] ?? ('#'.$p['channel_id'])) ?></td>
          <td><?= htmlspecialchars($p['created_by'] ?? '—') ?></td>
          <td>
            <?php if($p['status'] === 'open'): ?>
              <span class="badge badge-open">🟢 Otevřeno</span>
            <?php else: ?>
              <span class="badge badge-closed">🔒 Uzavřeno</span>
            <?php endif; ?>
          </td>
          <td><?= $p['end_at'] ?: '—' ?></td>
          <td>
            <form method="post" onsubmit="return confirm('Opravdu smazat hlasování?')">
              <input type="hidden" name="delete_id" value="<?= $p['id'] ?>">
              <button class="btn btn-sm btn-danger">🗑️</button>
            </form>
          </td>
        </tr>
      <?php endforeach; endif; ?>
    </tbody>
  </table>

  <a href="discord-polls.php" class="btn btn-arsk mt-3 px-4">+ Nové hlasování</a>
</body>
</html>
