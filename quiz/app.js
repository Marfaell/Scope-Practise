/* Paralotniowy trener wiedzy — logika aplikacji. */
(function () {
  'use strict';

  var KEY = 'paralotnia.trener.v1';
  var BANK = window.BANK;
  var ROUND_MIX = 20;
  var ROUND_FIX = 20;
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
      });
    });
  });
  var BY_ID = {};
  ALL.forEach(function (q) { BY_ID[q.id] = q; });

  var MODES = [
    { id: 'abc', name: 'Test ABCD', sub: 'Wybierz jedną z czterech odpowiedzi', icon: 'abc' },
    { id: 'fiszki', name: 'Fiszki', sub: 'Odsłoń odpowiedź i oceń się sam', icon: 'cards' },
    { id: 'wpisz', name: 'Pytanie i odpowiedź', sub: 'Wpisz odpowiedź, potem sprawdź poprawną', icon: 'keyboard' },
    { id: 'pf', name: 'Prawda czy fałsz', sub: 'Oceń, czy podana odpowiedź jest właściwa', icon: 'tf' },
    { id: 'czas', name: 'Na czas', sub: '90 sekund — ile zdążysz, tyle punktów', icon: 'timer' },
  ];
  var MODE_BY_ID = {};
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

  /* ---------- stan ---------- */
  var S = { stats: {}, session: null };
  var V = { view: 'home', scope: null, summary: null };
  var tick = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        S.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
        S.session = d.session || null;
      }
      if (S.session && (!S.session.order || !S.session.order.length)) S.session = null;
      if (S.session) S.session.order = S.session.order.filter(function (id) { return BY_ID[id]; });
      if (S.session && S.session.i >= S.session.order.length) S.session = null;
    } catch (e) {
      S = { stats: {}, session: null };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, stats: S.stats, session: S.session }));
    } catch (e) { /* tryb prywatny — gramy bez zapisu */ }
  }

  function st(id) {
    if (!S.stats[id]) S.stats[id] = { ok: 0, no: 0, streak: 0, bad: false };
    return S.stats[id];
  }
  function mastered(id) { var s = S.stats[id]; return !!s && s.streak >= 2; }
  function isBad(id) { var s = S.stats[id]; return !!s && s.bad; }

  function score(id, good) {
    var s = st(id);
    if (good) { s.ok++; s.streak++; s.bad = false; }
    else { s.no++; s.streak = 0; s.bad = true; }
    save();
  }

  function topicStats(t) {
    var done = 0, bad = 0;
    t.q.forEach(function (_, i) {
      var id = t.id + '-' + (i + 1);
      if (mastered(id)) done++;
      if (isBad(id)) bad++;
    });
    return { done: done, total: t.q.length, bad: bad, pct: Math.round((done / t.q.length) * 100) };
  }

  function globalStats() {
    var done = 0, bad = 0, ok = 0, no = 0;
    ALL.forEach(function (q) {
      if (mastered(q.id)) done++;
      if (isBad(q.id)) bad++;
      var s = S.stats[q.id];
      if (s) { ok += s.ok; no += s.no; }
    });
    return {
      done: done, total: ALL.length, bad: bad,
      pct: Math.round((done / ALL.length) * 100),
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
    repair: '<path d="M12 3v6M12 15v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
    mix: '<path d="M4 7h4l8 10h4M4 17h4l2-2.5M16 7h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ok: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    no: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  };
  function svg(name, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  function tape(pct) {
    return '<div class="tape"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }

  /* wykres biegunowej — rysunek do pytań o punkty A–D */
  function polarFig() {
    return (
      '<div class="fig"><svg viewBox="0 0 320 180" role="img" aria-label="Biegunowa prędkości paralotni z zaznaczonymi punktami A, B, C i D">' +
      '<line x1="40" y1="26" x2="310" y2="26" style="stroke:var(--line)" stroke-width="1"/>' +
      '<line x1="40" y1="26" x2="40" y2="162" style="stroke:var(--line)" stroke-width="1"/>' +
      '<line x1="40" y1="26" x2="300" y2="142" style="stroke:var(--sky);stroke-dasharray:4 4" stroke-width="1.2"/>' +
      '<path d="M53 91 C75 79 88 77 105 78 C130 79 148 82 163 85 C200 95 250 120 280 144" fill="none" style="stroke:var(--accent)" stroke-width="2.4" stroke-linecap="round"/>' +
      '<g style="fill:var(--ink)">' +
      '<circle cx="53" cy="91" r="4.5"/><circle cx="105" cy="78" r="4.5"/><circle cx="163" cy="85" r="4.5"/><circle cx="280" cy="144" r="4.5"/>' +
      '</g>' +
      '<g style="fill:var(--ink)" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600">' +
      '<text x="45" y="106">A</text><text x="99" y="70">B</text><text x="157" y="77">C</text><text x="272" y="162">D</text>' +
      '</g>' +
      '<g style="fill:var(--muted)" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="1">' +
      '<text x="238" y="20">PRĘDKOŚĆ →</text><text x="4" y="100">OPAD.</text><text x="4" y="112">↓</text>' +
      '</g>' +
      '</svg></div>'
    );
  }

  /* ---------- sesja ---------- */
  function startSession(scope, mode) {
    var ids = shuffle(scopeIds(scope));
    if (!ids.length) return;
    if (mode !== 'czas') {
      var cap = scope === 'all' ? ROUND_MIX : ROUND_FIX;
      ids = ids.slice(0, cap);
    }
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
    var truth = Math.random() < 0.5;
    var idx = q.c;
    if (!truth) {
      var others = [0, 1, 2, 3].filter(function (n) { return n !== q.c; });
      idx = others[Math.floor(Math.random() * others.length)];
    }
    s.claim = { idx: idx, truth: idx === q.c };
  }

  function current() { return BY_ID[S.session.order[S.session.i]]; }

  function answer(good) {
    var s = S.session;
    var q = current();
    score(q.id, good);
    if (good) s.ok++; else { s.no++; if (s.miss.indexOf(q.id) < 0) s.miss.push(q.id); }
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
    h += '<main class="page">';

    h += '<div><p class="eyebrow">Świadectwo kwalifikacji pilota paralotni</p>' +
      '<h1 class="h-hero">Wybierz grę<br>i sprawdź wiedzę</h1>' +
      '<p class="sub">' + ALL.length + ' pytań w ' + BANK.topics.length + ' tematach. Postęp zapisuje się sam.</p></div>';

    h += '<div class="stats">' +
      '<div class="v-good"><b class="mono">' + g.done + '</b><span>opanowane</span></div>' +
      '<div><b class="mono">' + g.acc + '%</b><span>skuteczność</span></div>' +
      '<div class="v-bad"><b class="mono">' + g.bad + '</b><span>do poprawki</span></div>' +
      '</div>';
    h += tape(g.pct);

    if (S.session) {
      var s = S.session;
      h += '<button class="tile-wide hot" data-act="resume">' +
        '<span class="glyph">' + svg('play') + '</span>' +
        '<span class="tw-body"><span class="tw-title">Wróć do gry</span>' +
        '<span class="tw-sub">' + esc(MODE_BY_ID[s.mode].name) + ' · ' + esc(scopeName(s.scope)) +
        (s.mode === 'czas' ? '' : ' · pytanie ' + (s.i + 1) + '/' + s.order.length) + '</span></span>' +
        '<span class="chev">' + svg('chev') + '</span></button>';
    }

    h += '<div class="section"><h2 class="h-sec">Tematy</h2><div class="grid-2">';
    BANK.topics.forEach(function (t) {
      var ts = topicStats(t);
      h += '<button class="tile' + (ts.done === ts.total ? ' done' : '') + '" data-act="topic" data-id="' + t.id + '">' +
        '<span class="t-name">' + esc(t.short) + '</span>' +
        '<span class="t-meta"><span class="mono">' + ts.done + '/' + ts.total + '</span>' +
        (ts.bad ? '<span>' + ts.bad + ' do poprawki</span>' : '<span>' + ts.pct + '%</span>') + '</span>' +
        tape(ts.pct) + '</button>';
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
      h += '<button class="tile-wide" data-act="mode" data-id="' + m.id + '">' +
        '<span class="glyph">' + svg(m.icon) + '</span>' +
        '<span class="tw-body"><span class="tw-title">' + esc(m.name) + '</span>' +
        '<span class="tw-sub">' + esc(m.sub) + '</span></span>' +
        '<span class="chev">' + svg('chev') + '</span></button>';
    });
    h += '</div>';
    if (scope !== 'all' && scope !== 'bledy') {
      var t = BANK.topics.filter(function (x) { return x.id === scope; })[0];
      var ts = topicStats(t);
      h += '<div class="note">Opanowane: <b class="mono">' + ts.done + '/' + ts.total + '</b>. ' +
        'Pytanie liczy się jako opanowane po dwóch poprawnych odpowiedziach z rzędu.</div>';
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
    var right = s.mode === 'czas'
      ? '<span class="timer mono" id="timer">' + s.left + ' s</span>'
      : '<span class="badge-pct mono">' + s.ok + '/' + (s.ok + s.no) + '</span>';
    var h = topbar(m.name + ' · ' + scopeName(s.scope), { back: 'home', right: right });
    h += '<main class="page">';

    if (s.mode === 'czas') {
      h += '<div class="playbar"><span class="mono">' + s.ok + ' pkt</span>' + tape((s.left / TIME_LIMIT) * 100) + '</div>';
    } else {
      h += '<div class="playbar"><span class="mono">' + (s.i + 1) + '/' + s.order.length + '</span>' +
        tape((s.i / s.order.length) * 100) + '</div>';
    }

    if (s.mode === 'fiszki') h += playFlash(q, s);
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

  function why(q) {
    return '<div class="reveal"><span class="lab">Poprawna odpowiedź</span>' +
      '<span class="val">' + 'ABCD'[q.c] + ') ' + esc(q.o[q.c]) + '</span>' +
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
      h += why(q);
      h += '<div class="btn-row"><button class="btn btn-bad" data-act="grade" data-g="0">Pomyłka</button>' +
        '<button class="btn btn-good" data-act="grade" data-g="1">Miałem rację</button></div>';
    }
    return h;
  }

  function playTF(q, s) {
    var locked = s.phase === 'shown';
    var h = '<div class="qcard pop">' + qhead(q) +
      '<div class="tf-claim">' + esc(q.o[s.claim.idx]) + '</div></div>';
    if (!locked) {
      h += '<div class="btn-row"><button class="btn btn-bad" data-act="tf" data-g="0">Fałsz</button>' +
        '<button class="btn btn-good" data-act="tf" data-g="1">Prawda</button></div>';
      h += '<div class="note">Czy zaproponowana wyżej odpowiedź jest poprawną odpowiedzią na to pytanie?</div>';
    } else {
      var good = s.pick === s.claim.truth;
      h += '<div class="verdict ' + (good ? 'ok' : 'no') + '">' + svg(good ? 'ok' : 'no') +
        (good ? 'Dobrze!' : 'Niestety, nie') + '</div>';
      h += why(q);
      h += '<button class="btn btn-primary btn-full" data-act="next">Dalej</button>';
    }
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
      r.miss.forEach(function (id) {
        var q = BY_ID[id];
        h += '<div class="miss"><div class="m-q">' + esc(q.q) + '</div>' +
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
      var ids = V.summary.miss.slice();
      S.session = {
        scope: V.summary.scope, mode: V.summary.mode, order: shuffle(ids), i: 0, ok: 0, no: 0,
        miss: [], phase: 'ask', pick: null, typed: '', claim: null,
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
      save(); go('home'); return;
    }
    if (act === 'do-reset-topic') {
      scopeIds(V.scope).forEach(function (id) { delete S.stats[id]; });
      if (S.session && S.session.scope === V.scope) S.session = null;
      dialog = null; save(); render(); return;
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
