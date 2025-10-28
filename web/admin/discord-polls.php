<?php
require_once __DIR__ . '/../includes/discord_api.php';

$guildsRes = bot_api('GET', '/guilds');
$guilds = $guildsRes['json'] ?? [];

$flash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $guild_id  = $_POST['guild_id'] ?? '';
  $channel_id= $_POST['channel_id'] ?? '';
  $question  = trim($_POST['question'] ?? '');
  $everyone  = !empty($_POST['allow_everyone']);
  $duration  = (int)($_POST['duration_minutes'] ?? 0);
  $opts = array_values(array_filter(array_map('trim', $_POST['options'] ?? [])));
  $options = array_map(fn($l)=>['label'=>$l], $opts);

  if (!$guild_id || !$channel_id || !$question || count($options) < 2) {
    $flash = ['type'=>'danger', 'msg'=>'Vyplň prosím server, kanál, otázku a alespoň 2 možnosti.'];
  } else {
    $payload = [
      'guild_id' => $guild_id,
      'channel_id' => $channel_id,
      'question' => $question,
      'options' => $options,
      'allow_everyone' => $everyone,
      'duration_minutes' => $duration ?: null
    ];
    $res = bot_api('POST', '/polls', $payload);
    if (($res['status'] ?? 0) === 200 && !empty($res['json']['success'])) {
      $flash = ['type'=>'success', 'msg'=>'✅ Hlasování úspěšně vytvořeno (ID: '.$res['json']['poll_id'].')'];
    } else {
      $flash = ['type'=>'danger', 'msg'=>'⚠️ Nepodařilo se vytvořit hlasování. Status '.$res['status'].' — '.htmlspecialchars($res['raw'] ?? 'bez odpovědi')];
    }
  }
}
?>
<!doctype html>
<html lang="cs" data-bs-theme="dark">
<head>
  <meta charset="utf-8">
  <title>🗳️ Arasaka Vote Creator</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background: radial-gradient(circle at top, #0b0b0d, #050506); color: #eee; }
    h1 { color: #ff6a00; text-shadow: 0 0 8px #ff4500; }
    .card { background: #141418; border-color: #1d1f24; border-radius: 10px; }
    .btn-arsk { background: linear-gradient(135deg,#ff8a00,#ff3c00); border: 0; }
    .btn-arsk:hover { filter: brightness(1.1); }
    label { font-weight: 500; }
  </style>
</head>
<body>
<div class="container py-4">
  <h1 class="mb-4">🗳️ Vytvořit nové hlasování</h1>

  <?php if($flash): ?>
    <div class="alert alert-<?= $flash['type'] ?>"><?= $flash['msg'] ?></div>
  <?php endif; ?>

  <div class="card p-4 shadow">
    <form method="post" id="pollForm">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Server (Guild)</label>
          <select class="form-select" name="guild_id" id="guildSelect" required>
            <option value="">— vyber server —</option>
            <?php foreach($guilds as $g): ?>
              <option value="<?= htmlspecialchars($g['id']) ?>"><?= htmlspecialchars($g['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Kanál</label>
          <select class="form-select" name="channel_id" id="channelSelect" required disabled>
            <option value="">— vyber kanál —</option>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label">Otázka</label>
          <input type="text" class="form-control" name="question" placeholder="Např. Co dáme za event v sobotu?" required>
        </div>

        <div class="col-12">
          <label class="form-label">Možnosti (min. 2)</label>
          <div id="optionsWrap" class="vstack gap-2">
            <input class="form-control" name="options[]" placeholder="Možnost 1" required>
            <input class="form-control" name="options[]" placeholder="Možnost 2" required>
          </div>
          <button type="button" class="btn btn-sm btn-secondary mt-2" id="addOptionBtn">+ Přidat možnost</button>
        </div>

        <div class="col-md-4">
          <label class="form-label">Trvání (minuty, volitelné)</label>
          <input type="number" class="form-control" name="duration_minutes" placeholder="např. 60">
        </div>
        <div class="col-md-4 d-flex align-items-end">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="1" name="allow_everyone" id="everyoneCheck">
            <label class="form-check-label" for="everyoneCheck">@everyone ping</label>
          </div>
        </div>

        <div class="col-12 mt-3">
          <button class="btn btn-arsk px-4">📤 Odeslat hlasování</button>
          <a href="discord-polls-list.php" class="btn btn-outline-light ms-2">📋 Seznam hlasování</a>
        </div>
      </div>
    </form>
  </div>
</div>

<script>
const guildSel = document.getElementById('guildSelect');
const chanSel  = document.getElementById('channelSelect');
guildSel.addEventListener('change', async () => {
  chanSel.innerHTML = '<option value="">Načítám…</option>';
  chanSel.disabled = true;
  const gid = guildSel.value;
  if (!gid) { chanSel.innerHTML = '<option value="">— vyber kanál —</option>'; return; }

  try {
    const r = await fetch('discord-channels.php?guild_id=' + encodeURIComponent(gid));
    if (!r.ok) throw new Error('HTTP '+r.status);
    const channels = await r.json();
    chanSel.innerHTML = '<option value="">— vyber kanál —</option>';
    channels.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      chanSel.appendChild(opt);
    });
    chanSel.disabled = false;
  } catch (e) {
    chanSel.innerHTML = '<option value="">Nepodařilo se načíst kanály</option>';
  }
});

document.getElementById('addOptionBtn').addEventListener('click', () => {
  const wrap = document.getElementById('optionsWrap');
  const input = document.createElement('input');
  input.className = 'form-control';
  input.name = 'options[]';
  input.placeholder = 'Další možnost';
  input.required = true;
  wrap.appendChild(input);
});
</script>
</body>
</html>
