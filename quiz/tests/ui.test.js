/* Przebieg aplikacji w przeglądarce: tryby gry, postęp, losowanie, układ.
   Wymaga playwright:  node quiz/tests/ui.test.js */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, reporter } = require('./helpers');

const URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

(async () => {
  const { ok, done } = reporter('ui');
  const browser = await launch();
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let p = await ctx.newPage();
  const jsErr = [];
  p.on('pageerror', e => jsErr.push(String(e.message)));
  p.on('console', m => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.googleapis/.test(m.text())) jsErr.push(m.text());
  });

  const home = async () => { const h = await p.$('[data-act="home"]'); if (h) await h.click(); await p.waitForTimeout(200); };
  const meteo = () => p.textContent('[data-act="topic"][data-id="meteo"]');
  const meteoCount = async () => parseInt((await meteo()).match(/(\d+)\/10/)[1], 10);
  /* Czekamy na elementy, nie na zegar — inaczej test bywa migotliwy. */
  async function answerCorrectly() {
    await p.waitForSelector('.opt:not([disabled])');
    const idx = await p.evaluate(() => {
      const t = document.querySelector('.qtext').textContent.trim();
      for (const topic of window.BANK.topics) for (const q of topic.q) if (q.q.trim() === t) return q.c;
      return -1;
    });
    if (idx < 0) throw new Error('nie znaleziono pytania w bazie');
    await (await p.$$('.opt'))[idx].click();
    await p.waitForSelector('.verdict');
  }

  await p.goto(URL); await p.waitForTimeout(400);

  console.log('\n--- menu ---');
  ok('strona się renderuje', !!(await p.$('.shell')));
  ok('10 kafelków tematów',
    (await p.$$('[data-act="topic"]:not([data-id="all"]):not([data-id="bledy"])')).length === 10);
  ok('jest miks wszystkich tematów', !!(await p.$('[data-act="topic"][data-id="all"]')));

  console.log('\n--- tryby ---');
  await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(200);
  const modes = await p.$$eval('[data-act="mode"]', els => els.map(e => e.getAttribute('data-id')));
  ok('6 trybów gry', modes.length === 6, modes.join(','));
  ok('jest egzamin', modes.includes('egzamin'));

  console.log('\n--- test ABCD ---');
  await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(250);
  ok('runda tematu ma 10 pytań', (await p.textContent('.playbar .mono')) === '1/10');
  await p.click('.opt'); await p.waitForTimeout(200);
  ok('jest werdykt', !!(await p.$('.verdict')));
  ok('poprawna odpowiedź podświetlona', !!(await p.$('.opt.is-right')));
  await p.click('[data-act="next"]'); await p.waitForTimeout(200);
  ok('przejście do kolejnego pytania', (await p.textContent('.playbar .mono')) === '2/10');

  console.log('\n--- egzamin ---');
  await home();
  await p.click('[data-act="topic"][data-id="prawo"]'); await p.waitForTimeout(150);
  await p.click('[data-act="mode"][data-id="egzamin"]'); await p.waitForTimeout(350);
  const items = await p.$$('.exam-item');
  ok('wszystkie pytania na jednej liście', items.length === 10, items.length);
  ok('licznik startuje od zera', (await p.textContent('#examcount')) === '0/10');
  for (let i = 0; i < 6; i++) { await (await items[i].$$('.opt'))[i % 4].click(); await p.waitForTimeout(40); }
  ok('licznik po 6 zaznaczeniach', (await p.textContent('#examcount')) === '6/10');
  await home();
  ok('wyjście do menu zostawia „Wróć do gry”', !!(await p.$('[data-act="resume"]')));
  await p.click('[data-act="resume"]'); await p.waitForTimeout(300);
  ok('zaznaczenia przetrwały powrót', (await p.$$('.opt.is-pick')).length === 6);
  await p.goto(URL); await p.waitForTimeout(400);
  await p.click('[data-act="resume"]'); await p.waitForTimeout(300);
  ok('zaznaczenia przetrwały przeładowanie', (await p.$$('.opt.is-pick')).length === 6);
  await p.click('[data-act="exam-submit"]'); await p.waitForTimeout(350);
  const sum = await p.textContent('.score-wrap');
  const good = parseInt(sum.match(/(\d+)\s*dobrze/)[1], 10);
  const bad = parseInt(sum.match(/(\d+)\s*źle/)[1], 10);
  ok('wynik obejmuje wszystkie pytania', good + bad === 10, good + '+' + bad);
  ok('niezaznaczone liczone jako błędne', bad >= 4, bad);
  ok('lista błędów zgadza się z wynikiem', (await p.$$('.miss')).length === bad);
  ok('widać „Bez odpowiedzi”', (await p.textContent('.page')).includes('Bez odpowiedzi'));

  console.log('\n--- pozostałe tryby ---');
  await home();
  for (const m of ['fiszki', 'wpisz', 'pf', 'czas']) {
    await p.click('[data-act="topic"][data-id="zasady"]'); await p.waitForTimeout(150);
    await p.click(`[data-act="mode"][data-id="${m}"]`); await p.waitForTimeout(250);
    ok('tryb ' + m + ' startuje', (await p.$$('.qcard, .flip')).length > 0);
    if (m === 'fiszki') {
      ok('awers fiszki pokazuje 4 warianty', (await p.$$('.flip-face:not(.back) .ansopt')).length === 4);
      await p.click('[data-act="flip"]'); await p.waitForTimeout(600);
      ok('rewers ma pytanie i odpowiedź', !!(await p.$('.flip-q')) && !!(await p.$('.flip-ans')));
    }
    if (m === 'wpisz') {
      await p.fill('#typed', 'moja odpowiedź');
      await p.click('[data-act="check"]'); await p.waitForTimeout(200);
      ok('po sprawdzeniu widać cały klucz', (await p.$$('.reveal .ansopt')).length === 4);
      ok('klucz jest wyróżniony', (await p.$$('.reveal .ansopt.key')).length === 1);
      ok('widać własną odpowiedź', (await p.textContent('.page')).includes('moja odpowiedź'));
    }
    if (m === 'pf') {
      const stmt = (await p.textContent('.tf-stmt')).trim();
      ok('teza jest zdaniem', /[.!?]$/.test(stmt) && !stmt.includes(':'), stmt.slice(0, 60));
      ok('teza nie jest wariantem zbiorczym',
        !/wszystkie odpowiedzi|wyżej wymienione|żadna/i.test(stmt));
      await p.click('[data-act="tf"][data-g="1"]'); await p.waitForTimeout(200);
      ok('po odpowiedzi wraca pytanie źródłowe', (await p.textContent('.page')).includes('Pytanie źródłowe'));
      ok('z kompletem wariantów', (await p.$$('.reveal .ansopt')).length === 4);
    }
    if (m === 'czas') {
      ok('jest zegar', !!(await p.$('#timer')));
      const t0 = await p.textContent('#timer');
      await p.waitForTimeout(2200);
      ok('zegar odlicza', (await p.textContent('#timer')) !== t0);
    }
    await home();
  }

  console.log('\n--- postęp ---');
  /* Świeży kontekst: statystyki globalne muszą być liczone od zera,
     inaczej dolicza się to, co rozegrano wyżej w innych tematach. */
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  p = await ctx.newPage();
  p.on('pageerror', e => jsErr.push(String(e.message)));
  await p.goto(URL); await p.waitForTimeout(400);
  ok('start od 0/10', (await meteoCount()) === 0);
  await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(150);
  await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(250);
  await answerCorrectly();
  await p.click('[data-act="next"]'); await p.waitForTimeout(150);
  await answerCorrectly();
  await home();
  ok('dwie poprawne odpowiedzi widać od razu', (await meteoCount()) === 2, await meteoCount());
  ok('pierwsza statystyka też pokazuje 2',
    (await p.$eval('.stats div:first-child b', e => e.textContent.trim())) === '2');
  ok('jasna część paska = 20%',
    (await p.$eval('[data-act="topic"][data-id="meteo"] .tape > i', e => e.style.width)) === '20%');
  ok('ciemna część paska = 0% (brak dwóch trafień z rzędu)',
    (await p.$eval('[data-act="topic"][data-id="meteo"] .tape > u', e => e.style.width)) === '0%');

  await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(150);
  await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(250);
  for (let i = 0; i < 10; i++) {
    await answerCorrectly();
    const n = await p.$('[data-act="next"]'); if (!n) break;
    await n.click(); await p.waitForTimeout(120);
  }
  await home();
  ok('po pełnej rundzie 10/10', (await meteoCount()) === 10, await meteoCount());
  ok('ciemna część paska urosła',
    parseFloat(await p.$eval('[data-act="topic"][data-id="meteo"] .tape > u', e => e.style.width)) >= 20);

  await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(150);
  await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(250);
  const wrong = await p.evaluate(() => {
    const t = document.querySelector('.qtext').textContent.trim();
    for (const topic of window.BANK.topics) for (const q of topic.q) if (q.q.trim() === t) return (q.c + 1) % 4;
    return 0;
  });
  await (await p.$$('.opt'))[wrong].click(); await p.waitForTimeout(200);
  await home();
  ok('błąd zdejmuje pytanie z licznika', (await meteoCount()) === 9, await meteoCount());
  ok('i wrzuca je do poprawki', (await meteo()).includes('1 do poprawki'));

  console.log('\n--- losowanie ---');
  const firsts = [];
  for (let i = 0; i < 8; i++) {
    await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(120);
    await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(200);
    firsts.push(await p.textContent('.qtext'));
    await home();
  }
  ok('kolejność pytań się losuje', new Set(firsts).size > 1, 'różnych pierwszych pytań: ' + new Set(firsts).size);

  console.log('\n--- reset ---');
  await p.click('[data-act="ask-reset"]'); await p.waitForTimeout(200);
  ok('jest potwierdzenie', !!(await p.$('.dialog')));
  await p.click('[data-act="do-reset"]'); await p.waitForTimeout(300);
  ok('reset zeruje licznik', (await meteoCount()) === 0);
  await p.goto(URL); await p.waitForTimeout(400);
  ok('reset trwały po przeładowaniu', (await p.textContent('.badge-pct')) === '0%');

  console.log('\n--- układ i dostępność ---');
  for (const w of [320, 390, 768]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.waitForTimeout(200);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('brak poziomego przewijania @' + w + 'px', over <= 1, 'nadmiar ' + over + 'px');
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('[data-act="topic"][data-id="osiagi"]'); await p.waitForTimeout(150);
  await p.click('[data-act="mode"][data-id="egzamin"]'); await p.waitForTimeout(400);
  ok('egzamin bez poziomego przewijania',
    (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  ok('4 rysunki biegunowej w egzaminie', (await p.$$('.fig')).length === 4);
  ok('każdy przycisk ma nazwę',
    (await p.$$eval('button', els => els.filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label')).length)) === 0);
  ok('pola dotykowe co najmniej 40px',
    (await p.$$eval('.opt, .btn, .tile, .tile-wide', els => els.filter(e => e.getBoundingClientRect().height < 40).length)) === 0);
  ok('rysunek ma opis dla czytnika ekranu', !!(await p.$('svg[role="img"][aria-label]')));

  console.log('\n--- motyw ciemny ---');
  await ctx.close();
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const dp = await dark.newPage();
  dp.on('pageerror', e => jsErr.push('dark: ' + e.message));
  await dp.goto(URL); await dp.waitForTimeout(400);
  const col = await dp.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  const lum = c => { const m = c.match(/\d+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  ok('ciemne tło', lum(col.bg) < 0.25, col.bg);
  ok('jasny tekst', lum(col.fg) > 0.6, col.fg);
  ok('kontrast tekst/tło', Math.abs(lum(col.fg) - lum(col.bg)) > 0.5);

  ok('brak błędów JS w całym przebiegu', jsErr.length === 0, jsErr.join(' | '));

  await browser.close();
  done();
})();
