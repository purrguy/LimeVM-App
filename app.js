// LimeVM site — real accounts via the API.
'use strict';

var API_BASE = 'https://purrguy.pythonanywhere.com';
var SESSION_KEY = 'limevm_session';

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
  // ---------- tab router (#/pricing, …) ----------
  var TABS = ['features', 'download', 'pricing', 'api', 'faq'];
  var API_DOCS = [
    ['api-doc1', 'TOKEN=$(curl -s -X POST https://purrguy.pythonanywhere.com/api/auth/login -H "Content-Type: application/json" -d \'{"username":"you","password":"secret"}\' | grep -o \'"token":"[^"]*"\' | cut -d\\" -f4)\n\ncurl -s -X POST https://purrguy.pythonanywhere.com/api/scripts -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d \'{"source":"print(1)","title":"demo"}\''],
    ['api-doc2', 'curl -s -X POST https://purrguy.pythonanywhere.com/api/web-obfuscate -H "Content-Type: application/json" -d \'{"source":"print(40 + 2)","account_token":"LOGIN_TOKEN"}\''],
    ['api-doc3', '-- run a hosted script in any executor:\nloadstring(game:HttpGet("https://lime.greedyhudzell.xyz/s/SLUG"))()']
  ];
  API_DOCS.forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (el) el.textContent = pair[1];
  });
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
    } else {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.id = 'acct-btn';
      b.textContent = 'Log in';
      b.addEventListener('click', function () { setMode('login'); modal.hidden = false; authUser.focus(); });
      acctArea.appendChild(b);
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

});
