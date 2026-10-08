// LimeVM dashboard — login, server-side obfuscation, history, pricing.
'use strict';

var API_BASE = 'https://purrguy.pythonanywhere.com';
var SESSION_KEY = 'limevm_session';
var MAX_CHARS = 300000;

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
  'daily-used': '2/2 used — dashboard quota resets tomorrow.',
  'too-big': 'Over 300,000 chars — trim it or split the script.',
  unauthorized: 'Session expired — log in again.',
  'obf-error': 'The engine rejected that script.',
  crash: 'The engine crashed on that input — try simplifying it.',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtTime(ts) {
  var d = new Date(ts * 1000);
  return d.toLocaleString();
}

window.addEventListener('load', function () {
  var session = loadSession();
  var loginView = document.getElementById('dash-login');
  var appView = document.getElementById('dash-app');
  var mode = 'login';

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
  }
  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    renderAcct();
    loadHistory();
    showDTab('info');
  }

  // ---------- login ----------
  var loginTitle = document.getElementById('login-title');
  var loginUser = document.getElementById('login-user');
  var loginPass = document.getElementById('login-pass');
  var loginErr = document.getElementById('login-err');
  var loginGo = document.getElementById('login-go');
  var loginSwap = document.getElementById('login-swap');
  function setMode(m) {
    mode = m;
    loginTitle.textContent = m === 'login' ? 'Log in' : 'Register';
    loginGo.textContent = m === 'login' ? 'Log in' : 'Create account';
    loginSwap.textContent = m === 'login' ? 'Need an account? Register' : 'Have an account? Log in';
    loginErr.textContent = '';
  }
  loginSwap.addEventListener('click', function () { setMode(mode === 'login' ? 'register' : 'login'); });
  loginPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') loginGo.click(); });
  loginGo.addEventListener('click', function () {
    var u = loginUser.value.trim(), p = loginPass.value;
    if (!u || !p) { loginErr.textContent = 'Enter a username and password.'; return; }
    loginErr.textContent = 'working…';
    loginGo.disabled = true;
    var path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    api('POST', path, { username: u, password: p }).then(function (r) {
      session = { token: r.token, username: r.username, tier: r.tier || 'free' };
      saveSession(session);
      loginPass.value = '';
      showApp();
    }, function (e) {
      loginErr.textContent = FRIENDLY[e.code] || ('Failed: ' + e.code);
    }).then(function () { loginGo.disabled = false; });
  });

  // ---------- header account ----------
  var acctArea = document.getElementById('dash-acct');
  function renderAcct() {
    acctArea.innerHTML = '';
    var who = document.createElement('span');
    who.className = 'who';
    who.id = 'info-who-name';
    who.textContent = '@' + session.username + (session.tier && session.tier !== 'free' ? ' · ' + session.tier : '');
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'btn small ghost';
    out.textContent = 'Log out';
    out.addEventListener('click', function () {
      api('POST', '/api/auth/logout', {}, session.token).catch(function () {});
      session = null;
      clearSession();
      showLogin();
      setMode('login');
    });
    acctArea.appendChild(who);
    acctArea.appendChild(out);
  }
  document.getElementById('dash-logout').addEventListener('click', function () {
    api('POST', '/api/auth/logout', {}, session.token).catch(function () {});
    session = null;
    clearSession();
    showLogin();
    setMode('login');
  });

  // ---------- left tabs ----------
  var tabBtns = Array.prototype.slice.call(document.querySelectorAll('#dash-tabs [data-dtab]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.dpanel[data-dpanel]'));
  function showDTab(name) {
    tabBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-dtab') === name); });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-dpanel') !== name; });
  }
  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () { showDTab(b.getAttribute('data-dtab')); });
  });

  // ---------- history (info recent + history tab) ----------
  function histRow(h) {
    return '<div class="hrow"><span>' + esc(fmtTime(h.created)) + '</span>' +
      '<span>' + h.in_chars + ' → ' + h.out_chars + ' chars</span>' +
      '<span>seed ' + h.seed + '</span>' +
      '<span>' + esc(h.tier || 'free') + '</span></div>';
  }
  function loadHistory() {
    var recent = document.getElementById('info-recent');
    var full = document.getElementById('hist-list');
    api('GET', '/api/web-history', undefined, session.token).then(function (r) {
      var rows = r.history || [];
      if (!rows.length) {
        recent.textContent = 'nothing yet — squeeze something first.';
        full.textContent = 'nothing yet — squeeze something first.';
        return;
      }
      recent.innerHTML = rows.slice(0, 5).map(histRow).join('');
      full.innerHTML = rows.map(histRow).join('');
    }, function (e) {
      if (e.code === 'unauthorized') {
        session = null; clearSession(); showLogin(); setMode('login'); return;
      }
      recent.textContent = 'could not load history.';
      full.textContent = 'could not load history.';
    });
  }

  // ---------- obfuscate ----------
  var obIn = document.getElementById('ob-in');
  var obFile = document.getElementById('ob-file');
  var obCount = document.getElementById('ob-count');
  var obBtn = document.getElementById('ob-btn');
  var obOut = document.getElementById('ob-out');
  var obDl = document.getElementById('ob-dl');
  var obUp = document.getElementById('ob-up');
  var obLeft = document.getElementById('ob-left');
  var obLink = document.getElementById('ob-link');
  var obUrl = document.getElementById('ob-url');
  var obLs = document.getElementById('ob-ls');
  var lastOutput = '', lastSeed = 0, lastInChars = 0, busy = false, upBusy = false;

  obIn.addEventListener('input', function () {
    var n = obIn.value.length;
    obCount.textContent = n + ' / ' + MAX_CHARS;
    obCount.style.color = n > MAX_CHARS ? '#ff7ad9' : '';
  });
  obFile.addEventListener('change', function () {
    var f = obFile.files && obFile.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      obIn.value = String(rd.result || '');
      obIn.dispatchEvent(new Event('input'));
    };
    rd.readAsText(f);
    obFile.value = '';
  });
  obDl.addEventListener('click', function () {
    if (!lastOutput) return;
    var blob = new Blob([lastOutput], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'limevm-' + lastSeed + '.lua';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  obBtn.addEventListener('click', function () {
    if (busy) return;
    var src = obIn.value;
    if (!src.trim()) { obOut.textContent = '-- paste some Lua first (or load a file).'; return; }
    if (src.length > MAX_CHARS) { obOut.textContent = '-- over 300,000 chars — trim it or split the script.'; return; }
    busy = true;
    obBtn.disabled = true;
    obDl.disabled = true;
    obUp.disabled = true;
    obOut.textContent = 'squeezing… (big scripts take a few seconds)';
    api('POST', '/api/web-obfuscate', { source: src, account_token: session.token }).then(function (r) {
      lastOutput = r.output;
      lastSeed = r.seed;
      lastInChars = src.length;
      obUp.disabled = false;
      obLink.hidden = true;
      var shown = r.output.length > 8000
        ? r.output.slice(0, 8000) + '\n-- … [' + r.out_chars + ' chars total, seed ' + r.seed + ' — hit Download]'
        : r.output;
      obOut.textContent = shown;
      obDl.disabled = false;
      obLeft.textContent = (r.left_today > 0
        ? r.left_today + ' squeeze' + (r.left_today === 1 ? '' : 's') + ' left today'
        : 'all used — back tomorrow')
        + (r.bonus ? ' (+1 Work.ink bonus 🎁)' : '');
      loadHistory();
    }, function (e) {
      obOut.textContent = '-- ' + (FRIENDLY[e.code] || ('failed: ' + e.code)) + (e.detail ? ' ' + e.detail : '');
      if (e.code === 'unauthorized') { session = null; clearSession(); showLogin(); setMode('login'); }
    }).then(function () { busy = false; obBtn.disabled = false; });
  });

  function copyText(t, btn, label) {
    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }
  document.getElementById('ob-copy-url').addEventListener('click', function () {
    copyText(obUrl.textContent, this, 0);
  });
  document.getElementById('ob-copy-ls').addEventListener('click', function () {
    copyText(obLs.textContent, this, 0);
  });
  obUp.addEventListener('click', function () {
    if (upBusy || !lastOutput) return;
    upBusy = true;
    obUp.disabled = true;
    obUp.textContent = 'Uploading…';
    api('POST', '/api/scripts', { source: lastOutput, title: 'dashboard seed ' + lastSeed, in_chars: lastInChars }, session.token).then(function (r) {
      obUrl.textContent = r.url;
      obLs.textContent = r.loadstring;
      obLink.hidden = false;
      var life = r.expires ? 'link expires in 5 days' : 'link never expires';
      obLeft.textContent = 'link ready — ' + life;
    }, function (e) {
      var msg = e.code === 'daily-used' ? 'upload quota used up — back tomorrow'
        : e.code === 'too-big' ? 'file over the 1M cap'
        : e.code === 'source-too-big' ? 'original script over the 200K cap'
        : (FRIENDLY[e.code] || ('failed: ' + e.code)) + (e.detail ? ' ' + e.detail : '');
      obLeft.textContent = msg;
      if (e.code === 'unauthorized') { session = null; clearSession(); showLogin(); setMode('login'); }
    }).then(function () { upBusy = false; obUp.disabled = false; obUp.textContent = 'Upload as link'; });
  });

  // ---------- boot ----------
  if (session) {
    api('GET', '/api/auth/me', undefined, session.token).then(function (me) {
      session.username = me.username;
      session.tier = me.tier;
      saveSession(session);
      showApp();
    }, function () {
      session = null;
      clearSession();
      showLogin();
    });
  } else {
    showLogin();
  }
});
