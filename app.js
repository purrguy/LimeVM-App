// LimeVM site — typing animation, real accounts + live demo via the API.
'use strict';

var API_BASE = 'https://purrguy.pythonanywhere.com';
var SESSION_KEY = 'limevm_session';

var SRC_LINES = [
  ['c', '-- my cool script'],
  ['k', 'local '], ['', 'total = '], ['n', '0'],
  ['k', 'for '], ['', 'i = '], ['n', '1'], ['', ', '], ['n', '10 '], ['k', 'do'],
  ['', '  total = total + i'],
  ['k', 'end'],
  ['k', 'print'], ['', '(total)'],
];
var OUT_CHARS = '-- LimeVM Protected | discord.gg/ZHuzYBnwSY local a=table.unpack or unpack local Gg=(getgenv and getgenv())or _G local H={[41]=function(_i)Rn[(_i[2]-33)]=Rn[(_i[3]-87)]..Rn[(_i[4]-12)]end,}...';

function typeCode(el, lines, speed, done) {
  el.innerHTML = '';
  var li = 0, ci = 0, html = '', open = null;
  function openSpan(cls) { html += '<span class="' + cls + '">'; open = cls; }
  (function step() {
    if (li >= lines.length) { if (done) done(); return; }
    var cls = lines[li][0], text = lines[li][1];
    if (ci === 0 && cls) openSpan(cls);
    var ch = text[ci];
    html += ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
    if (open) html += '</span>';
    el.innerHTML = html + '▌';
    ci++;
    if (ci >= text.length) { li++; ci = 0; open = null; html += '\n'; }
    setTimeout(step, speed + Math.random() * speed);
  })();
}

function typeText(el, text, speed, done) {
  el.textContent = '';
  var i = 0;
  (function step() {
    el.textContent = text.slice(0, ++i) + (i < text.length ? '▌' : '');
    if (i < text.length) setTimeout(step, speed);
    else if (done) done();
  })();
}

// ---------- tiny API client ----------
function api(method, path, body, token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(API_BASE + path, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(function (r) {
    return r.text().then(function (t) {
      var data = {};
      try { data = t ? JSON.parse(t) : {}; } catch (e) { data = { _raw: t }; }
      if (r.status < 200 || r.status >= 300) {
        var err = new Error(data.error || ('http-' + r.status));
        err.code = data.error || ('http-' + r.status);
        err.detail = data.detail || '';
        throw err;
      }
      return data;
    });
  }, function () { var e = new Error('offline'); e.code = 'offline'; throw e; });
}

function loadSession() {
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (s && s.token && s.username) return s;
  } catch (e) {}
  return null;
}
function saveSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

var FRIENDLY = {
  taken: 'That username is taken.',
  'bad-credentials': 'Wrong username or password.',
  'bad-username': 'Usernames: 3-20 chars, letters/numbers/_/-.',
  'bad-password': 'Password must be 6+ characters.',
  'rate-limited': 'Slow down — try again in a minute.',
  offline: 'Server unreachable. Check your connection.',
  'daily-used': 'Out of free squeezes — back tomorrow, or go paid.',
  'too-big': 'Over 3000 chars — trim it or go paid for unlimited.',
  unauthorized: 'Session expired — log in again.',
};

window.addEventListener('load', function () {
  // ---------- tab router (#/demo, #/pricing, …) ----------
  var TABS = ['features', 'demo', 'download', 'pricing', 'faq'];
  var tabLinks = Array.prototype.slice.call(document.querySelectorAll('#tabs a'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel[data-panel]'));
  function currentTab() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    return TABS.indexOf(h) >= 0 ? h : 'features';
  }
  function showTab(name) {
    tabLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-tab') === name); });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  window.addEventListener('hashchange', function () { showTab(currentTab()); });
  showTab(currentTab());

  typeCode(document.getElementById('code-in'), SRC_LINES, 26, function () {
    var el = document.getElementById('code-in');
    el.innerHTML = el.innerHTML.replace(/▌$/, '');
    typeText(document.getElementById('code-out'), OUT_CHARS, 4);
  });

  var session = loadSession();
  var acctArea = document.getElementById('acct-area');
  var acctBtn = document.getElementById('acct-btn');
  var modal = document.getElementById('auth-modal');
  var authTitle = document.getElementById('auth-title');
  var authUser = document.getElementById('auth-user');
  var authPass = document.getElementById('auth-pass');
  var authErr = document.getElementById('auth-err');
  var authGo = document.getElementById('auth-go');
  var authSwap = document.getElementById('auth-swap');
  var mode = 'login';

  var demoBtn = document.getElementById('demo-btn');
  var demoIn = document.getElementById('demo-in');
  var demoOut = document.getElementById('demo-out');
  var demoLeft = document.getElementById('demo-left');
  var demoSub = document.getElementById('demo-sub');

  function setMode(m) {
    mode = m;
    authTitle.textContent = m === 'login' ? 'Log in' : 'Register';
    authGo.textContent = m === 'login' ? 'Log in' : 'Create account';
    authSwap.textContent = m === 'login' ? 'Need an account? Register' : 'Have an account? Log in';
    authErr.textContent = '';
  }

  function renderAcct() {
    acctArea.innerHTML = '';
    if (session) {
      var who = document.createElement('span');
      who.className = 'who';
      who.textContent = '@' + session.username + (session.tier && session.tier !== 'free' ? ' · ' + session.tier : '');
      var out = document.createElement('button');
      out.type = 'button';
      out.className = 'btn small ghost';
      out.textContent = 'Log out';
      out.addEventListener('click', function () {
        if (session) api('POST', '/api/auth/logout', {}, session.token).catch(function () {});
        session = null;
        clearSession();
        renderAcct();
      });
      acctArea.appendChild(who);
      acctArea.appendChild(out);
      demoLeft.textContent = 'logged in — squeeze away';
    } else {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.id = 'acct-btn';
      b.textContent = 'Log in';
      b.addEventListener('click', function () { setMode('login'); modal.hidden = false; authUser.focus(); });
      acctArea.appendChild(b);
      demoLeft.textContent = 'log in to squeeze';
    }
  }

  function closeModal() { modal.hidden = true; authPass.value = ''; authErr.textContent = ''; }
  acctBtn.addEventListener('click', function () { setMode('login'); modal.hidden = false; authUser.focus(); });
  document.getElementById('auth-x').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  authSwap.addEventListener('click', function () { setMode(mode === 'login' ? 'register' : 'login'); });
  authPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') authGo.click(); });

  authGo.addEventListener('click', function () {
    var u = authUser.value.trim(), p = authPass.value;
    if (!u || !p) { authErr.textContent = 'Enter a username and password.'; return; }
    authErr.textContent = 'working…';
    authGo.disabled = true;
    var path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    api('POST', path, { username: u, password: p }).then(function (r) {
      session = { token: r.token, username: r.username, tier: r.tier || 'free', discord_id: r.discord_id || null };
      saveSession(session);
      closeModal();
      renderAcct();
    }, function (e) {
      authErr.textContent = FRIENDLY[e.code] || ('Failed: ' + e.code);
    }).then(function () { authGo.disabled = false; });
  });

  // validate cached session quietly
  if (session) {
    api('GET', '/api/auth/me', undefined, session.token).then(function (me) {
      session.username = me.username;
      session.tier = me.tier;
      saveSession(session);
      renderAcct();
    }, function (e) {
      if (e.code === 'unauthorized') { session = null; clearSession(); }
      renderAcct();
    });
  } else {
    renderAcct();
  }

  // ---------- live demo (real engine via /api/obfuscate) ----------
  var busy = false;
  demoBtn.addEventListener('click', function () {
    if (busy) return;
    if (!session) {
      setMode('login');
      modal.hidden = false;
      demoOut.textContent = '-- log in first — even free squeezes need an account.';
      return;
    }
    var src = demoIn.value;
    if (!src.trim()) { demoOut.textContent = '-- paste some Lua first.'; return; }
    if (src.length > 150) { demoOut.textContent = '-- web demo caps at 150 chars — trim it, use /obfuscate on Discord (3000), or grab the app for unlimited.'; return; }
    busy = true;
    demoBtn.disabled = true;
    demoOut.textContent = 'squeezing…';
    api('POST', '/api/obfuscate', { source: src, account_token: session.token }).then(function (r) {
      var shown = r.output.length > 6000 ? r.output.slice(0, 6000) + '\n-- … [' + r.output.length + ' chars total, seed ' + r.seed + ']' : r.output;
      demoOut.textContent = shown;
      demoLeft.textContent = r.left_today > 0
        ? r.left_today + ' free squeeze' + (r.left_today === 1 ? '' : 's') + ' left today'
        : 'all out of juice — come back tomorrow (or go paid)';
      if (demoSub) demoSub.textContent = 'Seed ' + r.seed + ' · ' + r.in_chars + ' → ' + r.out_chars + ' chars · tier: ' + (r.tier || 'free');
    }, function (e) {
      demoOut.textContent = '-- ' + (FRIENDLY[e.code] || ('failed: ' + e.code)) + (e.detail ? ' ' + e.detail : '');
      if (e.code === 'unauthorized') { session = null; clearSession(); renderAcct(); }
    }).then(function () { busy = false; demoBtn.disabled = false; });
  });
});
