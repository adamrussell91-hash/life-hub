/**
 * class.adam-russell.com's home page: "Join a game". A student types the code on the board; the
 * page asks the API which lesson and class it's for and opens that lesson with the code ready
 * (Join live game takes it from there). Plain HTML, CSS and JS served by the Worker, no hub code,
 * nothing about the teacher. `/?join=123456` (a QR or a typed link) looks up straight away.
 */

export const API_ORIGIN = 'https://api.adam-russell.com';

export const JOIN_PATHS = new Set(['/', '/join.js', '/join.css']);

export const JOIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  `connect-src ${API_ORIGIN}`,
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export const JOIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Join a game</title>
<link rel="stylesheet" href="/join.css">
</head>
<body>
<main class="join">
<h1 class="join__title">Join a game</h1>
<p class="join__lead">Type the 6 numbers on the board.</p>
<form id="join" class="join__form" novalidate>
<label for="code" class="join__label">Game code</label>
<input id="code" class="join__code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" aria-describedby="msg">
<button class="join__go" type="submit">Join</button>
</form>
<p id="msg" class="join__msg" role="status" aria-live="polite"></p>
</main>
<script src="/join.js" defer></script>
</body>
</html>
`;

export const JOIN_CSS = `:root{--bg:#f6f1e7;--card:#fffdf8;--ink:#14213d;--muted:#5b6475;--line:#d9d2c3;--accent:#1f3a68;--accent-ink:#fff;--bad:#9b2c2c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1626;--card:#172238;--ink:#eef1f7;--muted:#a9b3c6;--line:#2c3a55;--accent:#e9c46a;--accent-ink:#14213d;--bad:#f2a7a7}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.join{max-width:26rem;margin:0 auto;padding:18vh 16px 32px}
.join__title{font-size:2rem;line-height:1.15;margin:0 0 .25rem}
.join__lead{color:var(--muted);margin:0 0 1.5rem}
.join__form{display:grid;gap:.75rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.25rem}
.join__label{font-weight:600}
.join__code{font:600 2rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-align:center;padding:.6rem .5rem;border:2px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);width:100%}
.join__code:focus{outline:3px solid var(--accent);outline-offset:2px;border-color:var(--accent)}
.join__go{font-family:inherit;font-weight:600;font-size:1.1rem;line-height:1;padding:.9rem;border:0;border-radius:10px;background:var(--accent);color:var(--accent-ink);cursor:pointer;min-height:48px}
.join__go:disabled{opacity:.6;cursor:progress}
.join__go:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.join__msg{min-height:1.5em;margin:1rem 0 0;color:var(--muted)}
.join__msg[data-bad]{color:var(--bad);font-weight:600}
`;

export const JOIN_JS = `(function () {
  var API = '${API_ORIGIN}/api/published/game-code/';
  var form = document.getElementById('join');
  var input = document.getElementById('code');
  var msg = document.getElementById('msg');
  var btn = form.querySelector('button');
  function digits(v) { return String(v || '').replace(/\\D/g, '').slice(0, 6); }
  function show(d) { return d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d; }
  function say(text, bad) { msg.textContent = text; if (bad) msg.setAttribute('data-bad', ''); else msg.removeAttribute('data-bad'); }
  function done() { btn.disabled = false; }
  function go(code) {
    if (code.length !== 6) { say('Type the 6 numbers on the board.', true); input.focus(); return; }
    btn.disabled = true;
    say('Finding your game…');
    fetch(API + code, { credentials: 'omit' }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 429) { say('Too many tries. Wait a minute, then try again.', true); return done(); }
        if (!r.ok || !j || !j.ok || !j.data) { say((j && j.error && j.error.message) || 'That code isn’t open. Check the board.', true); return done(); }
        var d = j.data;
        location.assign('/s/classes/' + encodeURIComponent(d.class_id) + '/lessons/' + encodeURIComponent(d.lesson_id) + '?join=' + encodeURIComponent(d.code));
      });
    }).catch(function () { say('Couldn’t reach the game. Check your connection and try again.', true); done(); });
  }
  input.addEventListener('input', function () { input.value = show(digits(input.value)); say(''); });
  form.addEventListener('submit', function (e) { e.preventDefault(); go(digits(input.value)); });
  var q = '';
  try { q = digits(new URLSearchParams(location.search).get('join')); } catch (e) { q = ''; }
  if (q.length === 6) { input.value = show(q); go(q); } else { input.focus(); }
})();
`;

const BASE_HEADERS = {
  'x-robots-tag': 'noindex',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff'
};

/** The join page's files, or null for any other path. */
export function joinPageResponse(path, method = 'GET') {
  const files = {
    '/': [JOIN_HTML, 'text/html; charset=utf-8', 'no-store'],
    '/join.css': [JOIN_CSS, 'text/css; charset=utf-8', 'public, max-age=300'],
    '/join.js': [JOIN_JS, 'text/javascript; charset=utf-8', 'public, max-age=300']
  };
  const file = files[path];
  if (!file) return null;
  const [body, type, cache] = file;
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers: { ...BASE_HEADERS, 'content-type': type, 'cache-control': cache, 'content-security-policy': JOIN_CSP }
  });
}
