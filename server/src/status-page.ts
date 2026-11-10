/**
 * Página principal del servidor (/): muestra en vivo el estado de /api/health y lleva al panel de administración.
 * Es HTML autocontenido (sin compilación): estilos y script van en línea.
 */

const RELEASES_URL = 'https://github.com/NotAlex456/EcoEstudiante/releases/latest'

export function statusPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Servidor de EcoEstudiante</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap" rel="stylesheet" />
<style>
  :root { --forest-950:#102f27; --forest-800:#176b4b; --forest-700:#21835f; --forest-100:#dcefe6; --forest-50:#eef8f2;
    --ink:#16352d; --muted:#63766f; --line:#d9e3dd; --surface:#f5f7f3; --rose:#b4473a; --rose-soft:#f6e8e5; --amber-soft:#fbf2d6; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px;
    background:linear-gradient(160deg, var(--forest-950), var(--forest-800)); color:var(--ink); font:15px/1.5 'DM Sans', system-ui, sans-serif; }
  main { width:min(520px, 100%); background:#fff; border-radius:24px; padding:28px; box-shadow:0 22px 60px rgba(0,0,0,.25); display:grid; gap:20px; }
  h1, h2 { font-family:'Manrope', system-ui, sans-serif; margin:0; color:var(--forest-950); }
  h1 { font-size:22px; }
  .brand { display:flex; align-items:center; gap:12px; }
  .brand span { display:grid; place-items:center; width:44px; height:44px; border-radius:12px; background:var(--forest-800); font-size:22px; }
  .brand small { display:block; color:var(--muted); font-size:13px; }
  .status { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:16px; background:var(--forest-50); }
  .status strong { font-size:18px; }
  .status small { display:block; color:var(--muted); }
  .dot { width:14px; height:14px; border-radius:50%; background:var(--forest-700); flex:none; box-shadow:0 0 0 0 rgba(33,131,95,.5); animation:pulse 2s infinite; }
  .status.is-down { background:var(--rose-soft); }
  .status.is-down .dot { background:var(--rose); animation:none; }
  .status.is-checking .dot { background:#c9a227; animation:none; }
  @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(33,131,95,.5); } 70% { box-shadow:0 0 0 12px rgba(33,131,95,0); } 100% { box-shadow:0 0 0 0 rgba(33,131,95,0); } }
  @media (prefers-reduced-motion: reduce) { .dot { animation:none; } }
  dl { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin:0; }
  dl div { padding:12px 14px; border:1px solid var(--line); border-radius:14px; }
  dt { color:var(--muted); font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  dd { margin:2px 0 0; font-weight:700; font-size:16px; }
  .ok { color:var(--forest-800); } .bad { color:var(--rose); }
  .actions { display:grid; gap:10px; }
  .btn { display:flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:12px 16px; border-radius:14px;
    font-weight:700; text-decoration:none; border:1px solid transparent; cursor:pointer; font-size:15px; }
  .btn--primary { background:var(--forest-800); color:#fff; } .btn--primary:hover { background:var(--forest-700); }
  .btn--ghost { background:#fff; color:var(--forest-800); border-color:var(--line); } .btn--ghost:hover { background:var(--forest-50); }
  .foot { display:flex; justify-content:space-between; align-items:center; gap:10px; color:var(--muted); font-size:13px; }
  .foot button { border:0; background:none; color:var(--forest-800); font-weight:700; cursor:pointer; padding:6px; border-radius:8px; }
  .foot button:hover { background:var(--forest-50); }
  :focus-visible { outline:3px solid var(--forest-700); outline-offset:2px; }
  @media (max-width: 420px) { main { padding:22px 18px; } dl { grid-template-columns:1fr 1fr; } }
</style>
</head>
<body>
<main>
  <div class="brand"><span aria-hidden="true">🌿</span><div><h1>Servidor de EcoEstudiante</h1><small>UPSJB · Chincha</small></div></div>

  <div class="status is-checking" id="status" role="status" aria-live="polite">
    <span class="dot" aria-hidden="true"></span>
    <div><strong id="status-title">Comprobando…</strong><small id="status-detail">Consultando /api/health</small></div>
  </div>

  <dl>
    <div><dt>Base de datos</dt><dd id="db">—</dd></div>
    <div><dt>Respuesta</dt><dd id="latency">—</dd></div>
    <div><dt>Activo desde</dt><dd id="uptime">—</dd></div>
    <div><dt>Versión</dt><dd id="version">—</dd></div>
  </dl>

  <div class="actions">
    <a class="btn btn--primary" href="/admin/">Ir al panel de administración</a>
    <a class="btn btn--ghost" href="${RELEASES_URL}" target="_blank" rel="noopener">Descargar la app (APK)</a>
  </div>

  <div class="foot"><span id="checked">Se actualiza cada 10 segundos</span><button type="button" id="refresh">Actualizar</button></div>
</main>
<script>
  const $ = (id) => document.getElementById(id)
  const ago = (seconds) => {
    const m = Math.floor(seconds / 60), h = Math.floor(m / 60), d = Math.floor(h / 24)
    if (d) return 'hace ' + d + ' d ' + (h % 24) + ' h'
    if (h) return 'hace ' + h + ' h ' + (m % 60) + ' min'
    if (m) return 'hace ' + m + ' min'
    return 'hace ' + Math.max(0, Math.floor(seconds)) + ' s'
  }
  async function check() {
    const started = performance.now()
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const data = await res.json()
      const ms = Math.round(performance.now() - started)
      const dbOk = data.database === 'ok'
      $('status').className = 'status' + (dbOk ? '' : ' is-down')
      $('status-title').textContent = dbOk ? 'En línea' : 'En línea, sin base de datos'
      $('status-detail').textContent = dbOk ? 'El servidor y la base de datos responden.' : 'El servidor responde, pero la base de datos no.'
      $('db').textContent = dbOk ? '✓ Conectada' : '✗ Sin respuesta'
      $('db').className = dbOk ? 'ok' : 'bad'
      $('latency').textContent = ms + ' ms'
      $('uptime').textContent = typeof data.uptime === 'number' ? ago(data.uptime) : '—'
      $('version').textContent = data.version || '—'
    } catch {
      $('status').className = 'status is-down'
      $('status-title').textContent = 'Sin conexión'
      $('status-detail').textContent = 'No pudimos contactar al servidor. Reintentando…'
      $('db').textContent = '—'
      $('db').className = ''
      $('latency').textContent = '—'
      $('uptime').textContent = '—'
    }
    $('checked').textContent = 'Última comprobación: ' + new Date().toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  }
  $('refresh').addEventListener('click', check)
  check()
  setInterval(check, 10000)
</script>
</body>
</html>`
}
