/* Paralotniowy trener wiedzy — logika aplikacji. */
(function () {
  'use strict';

  var KEY = 'paralotnia.trener.v1';        /* stary, wspólny rekord — tylko do migracji */
  var K_STATS = 'paralotnia.trener.stats'; /* wyniki: dane trwałe */
  var K_BAK = 'paralotnia.trener.bak';     /* poprzednia dobra kopia wyników */
  var K_SESS = 'paralotnia.trener.session';/* przerwana runda: dane ulotne */
  var BANK = window.BANK;
  var ROUND_MIX = 20;
  var ROUND_FIX = 20;
  var ROUND_EXAM = 40;
  var TIME_LIMIT = 90;

  /* ---------- dane ---------- */
  var ALL = [];
  BANK.topics.forEach(function (t) {
    t.q.forEach(function (q, i) {
      ALL.push({
        id: t.id + '-' + (i + 1),
        tid: t.id,
        tname: t.short,
        q: q.q,
        o: q.o,
        c: q.c,
        w: q.w,
        fig: q.fig || null,
        tf: q.tf !== false,
      });
    });
  });
  var BY_ID = {};
  ALL.forEach(function (q) { BY_ID[q.id] = q; });

  var MODES = [
    { id: 'abc', name: 'Test ABCD', sub: 'Wybierz jedną z czterech odpowiedzi', icon: 'abc' },
    { id: 'fiszki', name: 'Fiszki', sub: 'Odsłoń odpowiedź i oceń się sam', icon: 'cards' },
    { id: 'wpisz', name: 'Pytanie i odpowiedź', sub: 'Wpisz odpowiedź, potem sprawdź poprawną', icon: 'keyboard' },
    { id: 'pf', name: 'Prawda czy fałsz', sub: 'Oceń, czy pojedyncze zdanie jest prawdziwe', icon: 'tf' },
    { id: 'czas', name: 'Na czas', sub: '90 sekund — ile zdążysz, tyle punktów', icon: 'timer' },
    { id: 'egzamin', name: 'Egzamin', sub: 'Cała lista pytań, sprawdzenie na końcu', icon: 'list' },
  ];
  var MODE_BY_ID = {};
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

  /* ---------- pamięć przeglądarki ---------- */
  /* localStorage bywa zablokowany: tryb prywatny, wyłączone dane witryn,
     przeglądarki wbudowane w komunikatory. Sprawdzamy realnym zapisem. */
  var storeOk = (function () {
    try {
      var probe = KEY + '.probe';
      localStorage.setItem(probe, '1');
      var back = localStorage.getItem(probe) === '1';
      localStorage.removeItem(probe);
      return back;
    } catch (e) {
      return false;
    }
  })();

  /* ---------- stan ---------- */
  var S = { stats: {}, session: null };
  var V = { view: 'home', scope: null, summary: null };
  var tick = null;

  function readJSON(k) {
    /* Uszkodzony rekord zwraca null i ZOSTAJE na dysku — nigdy go nie kasujemy. */
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isStats(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  /* Sesja jest częścią ulotną. Cokolwiek w niej nie zagra — wraca null,
     a wyniki zostają nietknięte. */
  function sanitizeSession(z) {
    try {
      if (!z || typeof z !== 'object') return null;
      if (!Array.isArray(z.order)) return null;
      z.order = z.order.filter(function (id) { return BY_ID[id]; });
      if (!z.order.length) return null;
      if (!MODE_BY_ID[z.mode]) return null;
      if (!z.answers || typeof z.answers !== 'object') z.answers = {};
      if (!Array.isArray(z.miss)) z.miss = [];
      z.miss = z.miss
        .map(function (m) { return typeof m === 'string' ? { id: m, pick: null } : m; })
        .filter(function (m) { return m && BY_ID[m.id]; });
      if (typeof z.i !== 'number' || z.i < 0) z.i = 0;
      if (z.mode !== 'egzamin' && z.i >= z.order.length) return null;
      if (z.mode === 'pf' && !z.claim) return null;
      return z;
    } catch (e) {
      return null;
    }
  }

  function load() {
    if (!storeOk) return;
    var stats = readJSON(K_STATS);
    if (!isStats(stats)) stats = readJSON(K_BAK);           /* kopia zapasowa */
    if (!isStats(stats)) {                                   /* migracja ze starego formatu */
      var old = readJSON(KEY);
      if (old && isStats(old.stats)) stats = old.stats;
    }
    S.stats = isStats(stats) ? stats : {};

    var sess = readJSON(K_SESS);
    if (!sess) {
      var o = readJSON(KEY);
      sess = o && o.session ? o.session : null;
    }
    S.session = sanitizeSession(sess);
  }

  function storeFailed() {
    storeOk = false;
    var box = document.getElementById('storewarn');
    if (box) box.hidden = false;
  }

  /* Świadome wyczyszczenie: zabiera komplet kluczy, łącznie z kopią zapasową. */
  function wipeAll() {
    if (!storeOk) return;
    try {
      localStorage.removeItem(K_BAK);
      localStorage.removeItem(K_SESS);
      localStorage.removeItem(KEY);
      localStorage.removeItem(K_STATS);
    } catch (e) {
      storeFailed();
    }
  }

  function save() {
    if (!storeOk) return;
    try {
      var json = JSON.stringify(S.stats);
      var prev = localStorage.getItem(K_STATS);
      /* Pusty zapis nigdy nie nadpisuje niepustych wyników. Czyszczenie idzie
         przez wipeAll(), nie tędy. */
      if (json === '{}' && prev && prev !== '{}') {
        localStorage.setItem(K_SESS, JSON.stringify(S.session));
        return;
      }
      /* Poprzednia dobra wersja ląduje w kopii, zanim ruszymy oryginał. */
      if (prev && prev !== json) localStorage.setItem(K_BAK, prev);
      localStorage.setItem(K_STATS, json);
      localStorage.setItem(K_SESS, JSON.stringify(S.session));
      /* Stary rekord znika dopiero, gdy nowy format naprawdę coś zawiera —
         inaczej skasowalibyśmy źródło migracji. */
      if (json !== '{}') localStorage.removeItem(KEY);
    } catch (e) {
      storeFailed();
    }
  }

  function warnBox() {
    return '<div class="warn" id="storewarn"' + (storeOk ? ' hidden' : '') + '>' +
      '<b>Ta przeglądarka nie zapisuje postępu.</b> Wyniki znikną po zamknięciu karty. ' +
      'Najczęstsza przyczyna to tryb prywatny albo przeglądarka wbudowana w Messengera, ' +
      'Instagrama czy Facebooka. Otwórz link w Safari lub Chrome — w komunikatorze menu ' +
      '<b>•••</b> → <b>Otwórz w przeglądarce</b>.</div>';
  }

  function st(id) {
    if (!S.stats[id]) S.stats[id] = { ok: 0, no: 0, streak: 0, bad: false };
    return S.stats[id];
  }
  function mastered(id) { var s = S.stats[id]; return !!s && s.streak >= 2; }
  /* „Umiem” — ostatnia odpowiedź na to pytanie była poprawna. Rusza się od razu. */
  function known(id) { var s = S.stats[id]; return !!s && !s.bad && s.ok > 0; }
  function isBad(id) { var s = S.stats[id]; return !!s && s.bad; }

  function score(id, good) {
    var s = st(id);
    if (good) { s.ok++; s.streak++; s.bad = false; }
    else { s.no++; s.streak = 0; s.bad = true; }
    save();
  }

  function topicStats(t) {
    var done = 0, kn = 0, bad = 0;
    t.q.forEach(function (_, i) {
      var id = t.id + '-' + (i + 1);
      if (mastered(id)) done++;
      if (known(id)) kn++;
      if (isBad(id)) bad++;
    });
    var n = t.q.length;
    return {
      done: done, known: kn, total: n, bad: bad,
      pct: Math.round((kn / n) * 100),
      pctDone: Math.round((done / n) * 100),
    };
  }

  function globalStats() {
    var done = 0, kn = 0, bad = 0, ok = 0, no = 0;
    ALL.forEach(function (q) {
      if (mastered(q.id)) done++;
      if (known(q.id)) kn++;
      if (isBad(q.id)) bad++;
      var s = S.stats[q.id];
      if (s) { ok += s.ok; no += s.no; }
    });
    return {
      done: done, known: kn, total: ALL.length, bad: bad,
      pct: Math.round((kn / ALL.length) * 100),
      pctDone: Math.round((done / ALL.length) * 100),
      acc: ok + no ? Math.round((ok / (ok + no)) * 100) : 0,
      answered: ok + no,
    };
  }

  function badList() { return ALL.filter(function (q) { return isBad(q.id); }).map(function (q) { return q.id; }); }

  /* ---------- narzędzia ---------- */
  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function scopeName(scope) {
    if (scope === 'all') return 'Miks wszystkich tematów';
    if (scope === 'bledy') return 'Powtórka błędów';
    var t = BANK.topics.filter(function (x) { return x.id === scope; })[0];
    return t ? t.name : 'Trening';
  }

  function scopeIds(scope) {
    if (scope === 'all') return ALL.map(function (q) { return q.id; });
    if (scope === 'bledy') return badList();
    return ALL.filter(function (q) { return q.tid === scope; }).map(function (q) { return q.id; });
  }

  /* Warianty typu „wszystkie odpowiedzi są…” nie są samodzielnymi zdaniami. */
  function isMeta(t) {
    return /wszystkie odpowiedzi są|wszystkie wyżej wymienione|żadna (z odpowiedzi|odpowiedź)/i.test(t);
  }

  function metaKind(t) {
    if (!isMeta(t)) return null;
    return /nieprawidłowe|fałszywe|żadna/i.test(t) ? 'all-false' : 'all-true';
  }

  /* Czy wariant i jest prawdziwy — z uwzględnieniem klucza zbiorczego. */
  function claimTruth(q, i) {
    var k = metaKind(q.o[q.c]);
    if (k === 'all-true') return true;
    if (k === 'all-false') return false;
    return i === q.c;
  }

  /* Sklejenie trzonu pytania z wariantem w jedno zdanie oznajmujące. */
  function statementOf(q, i) {
    var stem = q.q.replace(/\s*:\s*$/, '');
    var opt = q.o[i];
    if (/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]/.test(opt)) opt = opt.charAt(0).toLowerCase() + opt.slice(1);
    var out = stem + ' ' + opt;
    return /[.!?]$/.test(out) ? out : out + '.';
  }

  function poolFor(scope, mode) {
    var ids = scopeIds(scope);
    if (mode === 'pf') ids = ids.filter(function (id) { return BY_ID[id].tf; });
    return ids;
  }

  var ICON = {
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    chev: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    abc: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h4M7 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    cards: '<rect x="3" y="7" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4h11a2 2 0 012 2v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tf: '<path d="M3 9l3 3 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14l6 6M20 14l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    timer: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2.5M9 2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    play: '<path d="M7 4l12 8-12 8z" fill="currentColor"/>',
    list: '<path d="M4 6h1M4 12h1M4 18h1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M9 6h11M9 12h11M9 18h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    repair: '<path d="M12 3v6M12 15v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
    mix: '<path d="M4 7h4l8 10h4M4 17h4l2-2.5M16 7h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ok: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    no: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  };
  function svg(name, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  /* tape(a) — jednolity pasek; tape(a, b) — jasny do a, pełny do b. */
  function tape(a, b) {
    var lim = function (v) { return Math.max(0, Math.min(100, v)); };
    if (b === undefined) b = a;
    return '<div class="tape"><i style="width:' + lim(a) + '%"></i>' +
      '<u style="width:' + lim(b) + '%"></u></div>';
  }

  /* wykres biegunowej — rysunek do pytań o punkty A–D */
  function polarFig() {
    var ln = 'stroke:var(--line)';
    var hint = 'stroke:var(--sky)';
    return (
      '<div class="fig"><svg viewBox="0 0 360 232" role="img" aria-label="Biegunowa paralotni: oś pozioma to prędkość, oś pionowa w dół to opadanie. Punkt A leży przy prędkości minimalnej, B w szczycie krzywej przy najmniejszym opadaniu, C w punkcie styczności prostej poprowadzonej z początku układu, D na prawym końcu krzywej przy prędkości maksymalnej. Pod wykresem strzałki zasięgu lotu dla punktów A, B i C.">' +

      /* proste z początku układu — porównanie zasięgu */
      '<g style="' + ln + '" stroke-width="0.8" fill="none">' +
      '<path d="M56 38 L119 160"/><path d="M56 38 L204 160"/><path d="M56 38 L291 160"/>' +
      '</g>' +

      /* osie */
      '<path d="M56 38 H286" style="' + ln + '" stroke-width="1.4" fill="none"/>' +
      '<path d="M282 34.5 L288 38 L282 41.5 Z" style="fill:var(--line)"/>' +
      '<path d="M56 30 V190" style="' + ln + '" stroke-width="1.4" fill="none"/>' +

      /* linie odniesienia do punktów */
      '<g style="' + hint + ';stroke-dasharray:3 3" stroke-width="0.9" fill="none">' +
      '<path d="M88 38 V100"/><path d="M112 38 V84"/><path d="M160 38 V92"/><path d="M248 38 V158"/>' +
      '<path d="M56 84 H112"/>' +
      '</g>' +

      /* biegunowa */
      '<path d="M88 100 C95 90 104 84 112 84 C126 85 146 88 160 92 C190 102 228 136 248 158" ' +
      'fill="none" style="stroke:var(--accent)" stroke-width="2.6" stroke-linecap="round"/>' +

      /* punkty */
      '<g style="fill:var(--ink)">' +
      '<circle cx="88" cy="100" r="3.6"/><circle cx="112" cy="84" r="3.6"/>' +
      '<circle cx="160" cy="92" r="3.6"/><circle cx="248" cy="158" r="3.6"/>' +
      '</g>' +
      '<g style="fill:var(--ink)" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600">' +
      '<text x="76" y="112">A</text><text x="100" y="78">B</text>' +
      '<text x="164" y="86">C</text><text x="254" y="156">D</text>' +
      '</g>' +

      /* opisy osi */
      '<g style="fill:var(--muted)" font-family="IBM Plex Mono, monospace" font-size="9">' +
      '<text x="88" y="29" text-anchor="middle">V<tspan font-size="6.5" dy="2">min</tspan></text>' +
      '<text x="114" y="29" text-anchor="middle">V<tspan font-size="6.5" dy="2">ek</tspan></text>' +
      '<text x="160" y="29" text-anchor="middle">V<tspan font-size="6.5" dy="2">opt</tspan></text>' +
      '<text x="248" y="29" text-anchor="middle">V<tspan font-size="6.5" dy="2">max</tspan></text>' +
      '<text x="292" y="41">Prędkość [V]</text>' +
      '<text x="26" y="87">W<tspan font-size="6.5" dy="2">min</tspan></text>' +
      '<text transform="translate(18 158) rotate(-90)" text-anchor="middle">Opadanie [W]</text>' +
      '</g>' +

      /* zasięg lotu */
      '<g stroke-width="1.6" fill="none">' +
      '<path d="M56 172 H286" style="' + hint + '"/><path d="M282 168.5 L288 172 L282 175.5 Z" style="fill:var(--sky);stroke:none"/>' +
      '<path d="M56 182 H201" style="stroke:var(--accent)"/><path d="M197 178.5 L203 182 L197 185.5 Z" style="fill:var(--accent);stroke:none"/>' +
      '<path d="M56 192 H118" style="stroke:var(--muted)"/><path d="M114 188.5 L120 192 L114 195.5 Z" style="fill:var(--muted);stroke:none"/>' +
      '</g>' +
      '<g font-family="IBM Plex Mono, monospace" font-size="9" font-weight="600">' +
      '<text x="292" y="175" style="fill:var(--sky)">C</text>' +
      '<text x="207" y="185" style="fill:var(--accent)">B</text>' +
      '<text x="124" y="195" style="fill:var(--muted)">A</text>' +
      '<text x="171" y="212" style="fill:var(--muted)" font-weight="500" text-anchor="middle">Zasięg lotu</text>' +
      '</g>' +
      '</svg></div>'
    );
  }

  /* ---------- sesja ---------- */
  function startSession(scope, mode) {
    var ids = shuffle(poolFor(scope, mode));
    if (!ids.length) return;
    if (mode === 'egzamin') ids = ids.slice(0, ROUND_EXAM);
    else if (mode !== 'czas') ids = ids.slice(0, scope === 'all' ? ROUND_MIX : ROUND_FIX);
    S.session = {
      scope: scope,
      mode: mode,
      order: ids,
      i: 0,
      ok: 0,
      no: 0,
      miss: [],
      phase: 'ask',
      pick: null,
      typed: '',
      claim: null,
      answers: {},
      left: mode === 'czas' ? TIME_LIMIT : null,
    };
    if (mode === 'pf') prepClaim();
    V.view = 'play';
    save();
    render();
  }

  function prepClaim() {
    var s = S.session;
    var q = BY_ID[s.order[s.i]];
    var cands = [0, 1, 2, 3].filter(function (i) { return !isMeta(q.o[i]); });
    var want = Math.random() < 0.5;
    var match = cands.filter(function (i) { return claimTruth(q, i) === want; });
    var pool = match.length ? match : cands;
    var idx = pool[Math.floor(Math.random() * pool.length)];
    s.claim = { idx: idx, truth: claimTruth(q, idx) };
  }

  function current() { return BY_ID[S.session.order[S.session.i]]; }

  function answer(good) {
    var s = S.session;
    var q = current();
    score(q.id, good);
    if (good) s.ok++;
    else {
      s.no++;
      var already = s.miss.some(function (m) { return m.id === q.id; });
      if (!already) s.miss.push({ id: q.id, pick: s.mode === 'abc' || s.mode === 'czas' ? s.pick : null });
    }
    s.phase = 'shown';
    save();
    render();
  }

  function next() {
    var s = S.session;
    s.i++;
    s.phase = 'ask';
    s.pick = null;
    s.typed = '';
    if (s.i >= s.order.length) {
      if (s.mode === 'czas') { s.order = s.order.concat(shuffle(scopeIds(s.scope))); }
      else return finish();
    }
    if (s.mode === 'pf') prepClaim();
    save();
    render();
  }

  function submitExam() {
    var s = S.session;
    var ok = 0, no = 0, miss = [];
    s.order.forEach(function (id) {
      var q = BY_ID[id];
      var pick = typeof s.answers[id] === 'number' ? s.answers[id] : null;
      var good = pick === q.c;
      score(id, good);
      if (good) ok++; else { no++; miss.push({ id: id, pick: pick }); }
    });
    V.summary = { scope: s.scope, mode: s.mode, ok: ok, no: no, miss: miss, total: s.order.length };
    S.session = null;
    V.view = 'summary';
    stopTick();
    save();
    render();
  }

  function finish() {
    var s = S.session;
    V.summary = { scope: s.scope, mode: s.mode, ok: s.ok, no: s.no, miss: s.miss.slice(), total: s.ok + s.no };
    S.session = null;
    V.view = 'summary';
    stopTick();
    save();
    render();
  }

  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  function startTick() {
    stopTick();
    tick = setInterval(function () {
      if (!S.session || S.session.mode !== 'czas' || V.view !== 'play') { stopTick(); return; }
      S.session.left--;
      if (S.session.left <= 0) { save(); finish(); return; }
      var t = document.getElementById('timer');
      if (t) {
        t.textContent = S.session.left + ' s';
        t.className = 'timer' + (S.session.left <= 15 ? ' low' : '');
      }
      if (S.session.left % 5 === 0) save();
    }, 1000);
  }

  /* ---------- widoki ---------- */
  function topbar(title, opts) {
    opts = opts || {};
    var left = opts.back
      ? '<button class="iconbtn" data-act="' + opts.back + '" aria-label="Wróć">' + svg('back') + '</button>'
      : '<button class="iconbtn" data-act="noop" aria-label="Menu" tabindex="-1">' + svg('home') + '</button>';
    var right = opts.right || '';
    return '<header class="topbar">' + left + '<div class="crumb">' + esc(title) + '</div>' + right + '</header>';
  }

  function viewHome() {
    var g = globalStats();
    var h = '';
    h += topbar('Trener paralotniowy', { right: '<span class="badge-pct mono">' + g.pct + '%</span>' });
    /* g.pct liczy „umiem”; g.pctDone (opanowane) jest ciemniejszą częścią paska */
    h += '<main class="page">';

    h += '<div><p class="eyebrow">Świadectwo kwalifikacji pilota paralotni</p>' +
      '<h1 class="h-hero">Wybierz grę<br>i sprawdź wiedzę</h1>' +
      '<p class="sub">' + ALL.length + ' pytań w ' + BANK.topics.length + ' tematach.' +
      (storeOk ? ' Postęp zapisuje się sam.' : '') + '</p></div>';

    h += warnBox();

    h += '<div class="stats">' +
      '<div class="v-good"><b class="mono">' + g.known + '</b><span>zaliczone</span></div>' +
      '<div><b class="mono">' + g.acc + '%</b><span>skuteczność</span></div>' +
      '<div class="v-bad"><b class="mono">' + g.bad + '</b><span>do poprawki</span></div>' +
      '</div>';
    h += tape(g.pct, g.pctDone);

    if (S.session) {
      var s = S.session;
      h += '<button class="tile-wide hot" data-act="resume">' +
        '<span class="glyph">' + svg('play') + '</span>' +
        '<span class="tw-body"><span class="tw-title">Wróć do gry</span>' +
        '<span class="tw-sub">' + esc(MODE_BY_ID[s.mode].name) + ' · ' + esc(scopeName(s.scope)) +
        (s.mode === 'czas' ? '' : s.mode === 'egzamin'
          ? ' · ' + examDone(s) + '/' + s.order.length + ' odpowiedzi'
          : ' · pytanie ' + (s.i + 1) + '/' + s.order.length) + '</span></span>' +
        '<span class="chev">' + svg('chev') + '</span></button>';
    }

    h += '<div class="section"><h2 class="h-sec">Tematy</h2><div class="grid-2">';
    BANK.topics.forEach(function (t) {
      var ts = topicStats(t);
      h += '<button class="tile' + (ts.done === ts.total ? ' done' : '') + '" data-act="topic" data-id="' + t.id + '">' +
        '<span class="t-name">' + esc(t.short) + '</span>' +
        '<span class="t-meta"><span class="mono">' + ts.known + '/' + ts.total + '</span>' +
        (ts.bad ? '<span>' + ts.bad + ' do poprawki</span>' : '<span>' + ts.pct + '%</span>') + '</span>' +
        tape(ts.pct, ts.pctDone) + '</button>';
    });
    h += '</div></div>';

    h += '<div class="section"><h2 class="h-sec">Tryby specjalne</h2>';
    h += '<button class="tile-wide" data-act="topic" data-id="all">' +
      '<span class="glyph">' + svg('mix') + '</span>' +
      '<span class="tw-body"><span class="tw-title">Miks wszystkich tematów</span>' +
      '<span class="tw-sub">Losowe ' + ROUND_MIX + ' pytań z całej bazy</span></span>' +
      '<span class="chev">' + svg('chev') + '</span></button>';
    h += '<button class="tile-wide' + (g.bad ? '' : ' mute') + '" data-act="' + (g.bad ? 'topic' : 'noop') + '" data-id="bledy"' + (g.bad ? '' : ' disabled') + '>' +
      '<span class="glyph">' + svg('repair') + '</span>' +
      '<span class="tw-body"><span class="tw-title">Powtórka błędów</span>' +
      '<span class="tw-sub">' + (g.bad ? g.bad + ' pytań czeka na poprawę' : 'Na razie pusto — świetnie!') + '</span></span>' +
      '<span class="chev">' + svg('chev') + '</span></button>';
    h += '</div>';

    h += '<div class="foot"><span class="sub">Odpowiedzi: ' + g.answered + '</span>' +
      '<button class="linkbtn danger" data-act="ask-reset">Wyzeruj postęp</button></div>';

    h += '</main>';
    return h;
  }

  function viewModes() {
    var scope = V.scope;
    var pool = scopeIds(scope).length;
    var h = topbar(scopeName(scope), { back: 'home' });
    h += '<main class="page">';
    h += '<div><p class="eyebrow">' + pool + ' pytań w puli</p><h1 class="h-hero">Jak chcesz ćwiczyć?</h1></div>';
    h += '<div class="section">';
    MODES.forEach(function (m) {
      var n = poolFor(scope, m.id).length;
      var off = n === 0;
      h += '<button class="tile-wide' + (off ? ' mute' : '') + '" data-act="' + (off ? 'noop' : 'mode') + '" data-id="' + m.id + '"' + (off ? ' disabled' : '') + '>' +
        '<span class="glyph">' + svg(m.icon) + '</span>' +
        '<span class="tw-body"><span class="tw-title">' + esc(m.name) + '</span>' +
        '<span class="tw-sub">' + (off ? 'Brak pytań nadających się do tego trybu' : esc(m.sub) + (m.id === 'pf' ? ' · ' + n + ' pytań' : '')) + '</span></span>' +
        '<span class="chev">' + svg('chev') + '</span></button>';
    });
    h += '</div>';
    if (scope !== 'all' && scope !== 'bledy') {
      var t = BANK.topics.filter(function (x) { return x.id === scope; })[0];
      var ts = topicStats(t);
      h += '<div class="note">Zaliczone: <b class="mono">' + ts.known + '/' + ts.total + '</b> — ' +
        'tyle pytań ostatnio poszło dobrze. Opanowane: <b class="mono">' + ts.done + '/' + ts.total +
        '</b> — trafione dwa razy z rzędu. Błąd cofa pytanie do poprawki.</div>';
      h += '<div class="foot"><span class="sub">Kolejność pytań losowana za każdym razem</span>' +
        '<button class="linkbtn danger" data-act="ask-reset-topic">Wyzeruj temat</button></div>';
    }
    h += '</main>';
    return h;
  }

  function viewPlay() {
    var s = S.session;
    var q = current();
    var m = MODE_BY_ID[s.mode];
    var right;
    if (s.mode === 'czas') right = '<span class="timer mono" id="timer">' + s.left + ' s</span>';
    else if (s.mode === 'egzamin') right = '<span class="badge-pct mono" id="examcount">' + examDone(s) + '/' + s.order.length + '</span>';
    else right = '<span class="badge-pct mono">' + s.ok + '/' + (s.ok + s.no) + '</span>';
    var h = topbar(m.name + ' · ' + scopeName(s.scope), { back: 'home', right: right });
    h += '<main class="page">';

    if (!storeOk) h += warnBox();

    if (s.mode === 'egzamin') {
      h += '';
    } else if (s.mode === 'czas') {
      h += '<div class="playbar"><span class="mono">' + s.ok + ' pkt</span>' + tape((s.left / TIME_LIMIT) * 100) + '</div>';
    } else {
      h += '<div class="playbar"><span class="mono">' + (s.i + 1) + '/' + s.order.length + '</span>' +
        tape((s.i / s.order.length) * 100) + '</div>';
    }

    if (s.mode === 'egzamin') h += playExam(s);
    else if (s.mode === 'fiszki') h += playFlash(q, s);
    else if (s.mode === 'wpisz') h += playTyped(q, s);
    else if (s.mode === 'pf') h += playTF(q, s);
    else h += playChoice(q, s);

    h += '</main>';
    return h;
  }

  function qhead(q) {
    return '<div class="qtopic">' + esc(q.tname) + '</div><div class="qtext">' + esc(q.q) + '</div>' +
      (q.fig === 'polar' ? polarFig() : '');
  }

  function optList(q) {
    var h = '<div class="ansopts">';
    q.o.forEach(function (o, i) {
      h += '<div class="ansopt' + (i === q.c ? ' key' : '') + '">' +
        '<b>' + 'ABCD'[i] + '</b><span>' + esc(o) + '</span></div>';
    });
    return h + '</div>';
  }

  function answerBlock(q, lab) {
    return '<div class="reveal"><span class="lab">' + esc(lab || 'Pytanie i klucz') + '</span>' +
      '<span class="val">' + esc(q.q) + '</span>' + optList(q) +
      '<span class="why">' + esc(q.w) + '</span></div>';
  }

  function playChoice(q, s) {
    var locked = s.phase === 'shown';
    var h = '<div class="qcard pop">' + qhead(q) + '</div>';
    h += '<div class="opts">';
    q.o.forEach(function (o, i) {
      var cls = 'opt';
      if (locked) {
        cls += ' locked';
        if (i === q.c) cls += ' is-right';
        else if (i === s.pick) cls += ' is-wrong';
        else cls += ' dim';
      }
      h += '<button class="' + cls + '" data-act="pick" data-i="' + i + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="key">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';
    if (locked) {
      h += '<div class="verdict ' + (s.pick === q.c ? 'ok' : 'no') + '">' +
        svg(s.pick === q.c ? 'ok' : 'no') + (s.pick === q.c ? 'Dobrze!' : 'Niestety, nie') + '</div>';
      h += '<div class="reveal"><span class="lab">Dlaczego</span><span class="why">' + esc(q.w) + '</span></div>';
      h += '<button class="btn btn-primary btn-full" data-act="next">Dalej</button>';
    }
    return h;
  }

  function playFlash(q, s) {
    var open = s.phase === 'shown' || s.phase === 'flip';
    var h = '<div class="flip' + (open ? ' on' : '') + '" data-act="flip"><div class="flip-in">' +
      '<div class="flip-face"><div class="qtopic">' + esc(q.tname) + '</div>' +
      '<div class="qtext">' + esc(q.q) + '</div>' +
      (q.fig === 'polar' ? polarFig() : '') +
      '<div class="ansopts plain">' + q.o.map(function (o, i) {
        return '<div class="ansopt"><b>' + 'ABCD'[i] + '</b><span>' + esc(o) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="flip-hint">Dotknij, aby odsłonić</div></div>' +
      '<div class="flip-face back"><div class="flip-q">' + esc(q.q) + '</div>' +
      '<div class="flip-hint">Poprawna odpowiedź</div>' +
      '<div class="flip-ans">' + 'ABCD'[q.c] + ') ' + esc(q.o[q.c]) + '</div>' +
      '<div class="why" style="font-size:14px;line-height:1.45;color:var(--muted)">' + esc(q.w) + '</div></div>' +
      '</div></div>';
    if (open) {
      h += '<div class="btn-row"><button class="btn btn-bad" data-act="grade" data-g="0">Nie umiem</button>' +
        '<button class="btn btn-good" data-act="grade" data-g="1">Umiem</button></div>';
    } else {
      h += '<button class="btn btn-full" data-act="flip">Pokaż odpowiedź</button>';
    }
    return h;
  }

  function playTyped(q, s) {
    var h = '<div class="qcard pop">' + qhead(q) + '</div>';
    if (s.phase === 'ask') {
      h += '<textarea class="field" id="typed" rows="3" placeholder="Wpisz odpowiedź swoimi słowami…">' + esc(s.typed || '') + '</textarea>';
      h += '<button class="btn btn-primary btn-full" data-act="check">Sprawdź odpowiedź</button>';
      h += '<div class="note">Odpowiadasz z głowy — po zatwierdzeniu zobaczysz poprawną odpowiedź i sam ocenisz swój strzał.</div>';
    } else {
      h += '<div class="reveal"><span class="lab">Twoja odpowiedź</span>' +
        '<span class="val" style="font-weight:400">' + (s.typed ? esc(s.typed) : '<i>brak odpowiedzi</i>') + '</span></div>';
      h += answerBlock(q, 'Poprawna odpowiedź');
      h += '<div class="btn-row"><button class="btn btn-bad" data-act="grade" data-g="0">Pomyłka</button>' +
        '<button class="btn btn-good" data-act="grade" data-g="1">Miałem rację</button></div>';
    }
    return h;
  }

  function playTF(q, s) {
    var locked = s.phase === 'shown';
    var h = '<div class="qcard pop"><div class="qtopic">' + esc(q.tname) + '</div>' +
      '<div class="tf-stmt">' + esc(statementOf(q, s.claim.idx)) + '</div>' +
      (q.fig === 'polar' ? polarFig() : '') + '</div>';
    if (!locked) {
      h += '<div class="btn-row"><button class="btn btn-bad" data-act="tf" data-g="0">Fałsz</button>' +
        '<button class="btn btn-good" data-act="tf" data-g="1">Prawda</button></div>';
      h += '<div class="note">Oceń, czy powyższe zdanie jest prawdziwe.</div>';
    } else {
      var good = s.pick === s.claim.truth;
      h += '<div class="verdict ' + (good ? 'ok' : 'no') + '">' + svg(good ? 'ok' : 'no') +
        (good ? 'Dobrze — ' : 'Niestety — ') + (s.claim.truth ? 'to prawda' : 'to fałsz') + '</div>';
      h += answerBlock(q, 'Pytanie źródłowe');
      h += '<button class="btn btn-primary btn-full" data-act="next">Dalej</button>';
    }
    return h;
  }

  function examDone(s) {
    var n = 0;
    s.order.forEach(function (id) { if (typeof s.answers[id] === 'number') n++; });
    return n;
  }

  function examLabel(s) {
    var left = s.order.length - examDone(s);
    return left ? 'Sprawdź test · zostało ' + left : 'Sprawdź test';
  }

  function playExam(s) {
    var h = '<div class="note">Odpowiedz na wszystkie pytania, a potem sprawdź cały test jednym przyciskiem. ' +
      'Pytania bez odpowiedzi liczą się jako błędne. Możesz wyjść do menu — zaznaczenia zostaną zapisane.</div>';
    h += '<ol class="exam">';
    s.order.forEach(function (id, n) {
      var q = BY_ID[id];
      var pick = s.answers[id];
      h += '<li class="exam-item' + (typeof pick === 'number' ? ' answered' : '') + '">' +
        '<div class="qcard">' +
        '<div class="qtopic">' + (n + 1) + ' / ' + s.order.length + ' · ' + esc(q.tname) + '</div>' +
        '<div class="qtext">' + esc(q.q) + '</div>' +
        (q.fig === 'polar' ? polarFig() : '') +
        '<div class="opts" style="margin-top:14px">';
      q.o.forEach(function (o, i) {
        h += '<button class="opt' + (pick === i ? ' is-pick' : '') + '" data-act="exam-pick" data-q="' + id + '" data-i="' + i + '">' +
          '<span class="key">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></button>';
      });
      h += '</div></div></li>';
    });
    h += '</ol>';
    h += '<div class="exam-bar"><button class="btn btn-primary btn-full" id="examsubmit" data-act="exam-submit">' +
      esc(examLabel(s)) + '</button></div>';
    return h;
  }

  function ring(pct) {
    var r = 44, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 104 104">' +
      '<circle cx="52" cy="52" r="' + r + '" fill="none" style="stroke:var(--line-soft)" stroke-width="9"/>' +
      '<circle cx="52" cy="52" r="' + r + '" fill="none" style="stroke:var(--accent)" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + (c - (c * pct) / 100) + '" transform="rotate(-90 52 52)"/>' +
      '<text x="52" y="58" text-anchor="middle" font-size="22">' + pct + '%</text></svg>';
  }

  function viewSummary() {
    var r = V.summary;
    var pct = r.total ? Math.round((r.ok / r.total) * 100) : 0;
    var h = topbar('Wynik rundy', { back: 'home' });
    h += '<main class="page">';
    h += '<div class="score-wrap">' + ring(pct) +
      '<div><p class="eyebrow">' + esc(MODE_BY_ID[r.mode].name) + '</p>' +
      '<h1 class="h-hero" style="font-size:24px">' + esc(scopeName(r.scope)) + '</h1>' +
      '<p class="sub"><b class="mono">' + r.ok + '</b> dobrze · <b class="mono">' + r.no + '</b> źle</p></div></div>';

    if (r.miss.length) {
      h += '<div class="section"><h2 class="h-sec">Do powtórki (' + r.miss.length + ')</h2>';
      r.miss.forEach(function (m) {
        var q = BY_ID[m.id];
        var mine = '';
        if (typeof m.pick === 'number') mine = '<div class="m-mine">Twoja: ' + 'ABCD'[m.pick] + ') ' + esc(q.o[m.pick]) + '</div>';
        else if (m.pick === null && r.mode === 'egzamin') mine = '<div class="m-mine">Bez odpowiedzi</div>';
        h += '<div class="miss"><div class="m-q">' + esc(q.q) + '</div>' + mine +
          '<div class="m-a">' + 'ABCD'[q.c] + ') ' + esc(q.o[q.c]) + '</div>' +
          '<div class="m-w">' + esc(q.w) + '</div></div>';
      });
      h += '</div>';
      h += '<button class="btn btn-primary btn-full" data-act="redo-miss">Powtórz te ' + r.miss.length + ' pytań</button>';
    } else {
      h += '<div class="note">Komplet poprawnych odpowiedzi. Nic nie trafiło do powtórki.</div>';
    }

    h += '<div class="btn-row"><button class="btn" data-act="again">Jeszcze raz</button>' +
      '<button class="btn" data-act="home">Menu główne</button></div>';
    h += '</main>';
    return h;
  }

  function dialogReset(kind) {
    var isTopic = kind === 'topic';
    return '<div class="dialog-back" data-act="close-dialog"><div class="dialog" role="dialog" aria-modal="true">' +
      '<h2 class="h-sec">' + (isTopic ? 'Wyzerować ten temat?' : 'Wyzerować cały postęp?') + '</h2>' +
      '<p class="sub" style="margin:0">' + (isTopic
        ? 'Skasujemy wyniki pytań z tego tematu. Reszta postępu zostaje.'
        : 'Skasujemy wyniki wszystkich ' + ALL.length + ' pytań, listę błędów i zapisaną grę. Tego nie da się cofnąć.') + '</p>' +
      '<button class="btn btn-primary btn-full" data-act="' + (isTopic ? 'do-reset-topic' : 'do-reset') + '">Tak, zaczynam od nowa</button>' +
      '<button class="btn btn-ghost btn-full" data-act="close-dialog">Anuluj</button>' +
      '</div></div>';
  }

  /* ---------- render ---------- */
  var app = document.getElementById('app');
  var dialog = null;

  function render() {
    var h = '';
    if (V.view === 'home') h = viewHome();
    else if (V.view === 'modes') h = viewModes();
    else if (V.view === 'play' && S.session) h = viewPlay();
    else if (V.view === 'summary' && V.summary) h = viewSummary();
    else { V.view = 'home'; h = viewHome(); }
    app.innerHTML = '<div class="shell">' + h + '</div>' + (dialog ? dialogReset(dialog) : '');
    if (V.view === 'play' && S.session && S.session.mode === 'czas') { if (!tick) startTick(); } else stopTick();
    if (V.view === 'play' && S.session && S.session.mode === 'wpisz' && S.session.phase === 'ask') {
      var f = document.getElementById('typed');
      if (f && !('ontouchstart' in window)) f.focus();
    }
    window.scrollTo(0, 0);
  }

  function go(view) { V.view = view; render(); }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var s = S.session;

    if (act === 'noop') return;
    if (act === 'home') { stashTyped(); stopTick(); go('home'); return; }
    if (act === 'resume') { go('play'); return; }
    if (act === 'topic') { V.scope = el.getAttribute('data-id'); go('modes'); return; }
    if (act === 'mode') { startSession(V.scope, el.getAttribute('data-id')); return; }

    if (act === 'pick') {
      if (!s || s.phase !== 'ask') return;
      s.pick = parseInt(el.getAttribute('data-i'), 10);
      var q = current();
      answer(s.pick === q.c);
      if (s.mode === 'czas') setTimeout(function () { if (S.session && V.view === 'play') next(); }, 850);
      return;
    }
    if (act === 'exam-pick') {
      if (!s) return;
      var eqid = el.getAttribute('data-q');
      var eidx = parseInt(el.getAttribute('data-i'), 10);
      s.answers[eqid] = eidx;
      var box = el.parentElement;
      Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (b) { b.classList.remove('is-pick'); });
      el.classList.add('is-pick');
      var item = el.closest('.exam-item');
      if (item) item.classList.add('answered');
      var btn = document.getElementById('examsubmit');
      if (btn) btn.textContent = examLabel(s);
      var cnt = document.getElementById('examcount');
      if (cnt) cnt.textContent = examDone(s) + '/' + s.order.length;
      save();
      return;
    }
    if (act === 'exam-submit') { if (s) submitExam(); return; }
    if (act === 'flip') {
      if (!s) return;
      if (s.phase === 'ask') { s.phase = 'flip'; render(); }
      return;
    }
    if (act === 'check') {
      if (!s) return;
      stashTyped();
      s.phase = 'shown';
      render();
      return;
    }
    if (act === 'grade') {
      if (!s) return;
      answer(el.getAttribute('data-g') === '1');
      next();
      return;
    }
    if (act === 'tf') {
      if (!s || s.phase !== 'ask') return;
      s.pick = el.getAttribute('data-g') === '1';
      answer(s.pick === s.claim.truth);
      return;
    }
    if (act === 'next') { if (s) next(); return; }

    if (act === 'again') { startSession(V.summary.scope, V.summary.mode); return; }
    if (act === 'redo-miss') {
      var ids = V.summary.miss.map(function (m) { return m.id; });
      S.session = {
        scope: V.summary.scope, mode: V.summary.mode, order: shuffle(ids), i: 0, ok: 0, no: 0,
        miss: [], phase: 'ask', pick: null, typed: '', claim: null, answers: {},
        left: V.summary.mode === 'czas' ? TIME_LIMIT : null,
      };
      if (S.session.mode === 'pf') prepClaim();
      go('play');
      save();
      return;
    }

    if (act === 'ask-reset') { dialog = 'all'; render(); return; }
    if (act === 'ask-reset-topic') { dialog = 'topic'; render(); return; }
    if (act === 'close-dialog') {
      if (el.classList.contains('dialog-back') && e.target.closest('.dialog')) return;
      dialog = null; render(); return;
    }
    if (act === 'do-reset') {
      S.stats = {}; S.session = null; dialog = null; V.summary = null;
      wipeAll();
      go('home'); return;
    }
    if (act === 'do-reset-topic') {
      scopeIds(V.scope).forEach(function (id) { delete S.stats[id]; });
      if (S.session && S.session.scope === V.scope) S.session = null;
      dialog = null;
      try { localStorage.removeItem(K_BAK); } catch (e) {}
      save();
      render(); return;
    }
  });

  function stashTyped() {
    var f = document.getElementById('typed');
    if (f && S.session) S.session.typed = f.value;
  }

  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      var b = app.querySelector('[data-act="check"]');
      if (b) { b.click(); e.preventDefault(); }
    }
  });

  window.addEventListener('beforeunload', function () { stashTyped(); save(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stashTyped(); save(); } });

  load();
  render();
})();
