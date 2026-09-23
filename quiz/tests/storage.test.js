/* Zapis postępu: brak pamięci, uszkodzone rekordy, migracja, reset.
   Wymaga playwright:  node quiz/tests/storage.test.js */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, reporter } = require('./helpers');

const URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const BLANK = pathToFileURL(path.join(__dirname, 'fixtures', 'blank.html')).href;
const K_STATS = 'paralotnia.trener.stats';
const K_BAK = 'paralotnia.trener.bak';
const K_SESS = 'paralotnia.trener.session';
const K_OLD = 'paralotnia.trener.v1';

/* Pamięć niedostępna: tryb prywatny, wyłączone dane witryn, webview komunikatora. */
const BLOCK = `Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }
});`;

/* Zasiew i uszkodzenia robimy na pustej stronie z tego samego pochodzenia.
   Gdyby robić je na stronie aplikacji, ta przy opuszczaniu zapisałaby poprawne
   dane na nasze uszkodzenie i awaria nigdy by nie zaszła. */
async function seed(p, fn, arg) {
  await p.goto(BLANK);
  await p.evaluate(fn, arg);
  await p.goto(URL);
  await p.waitForSelector('.shell');
}

(async () => {
  const { ok, done } = reporter('storage');
  const browser = await launch();
  const fresh = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e.message)));
    return { c, p, errs };
  };
  const meteo = p => p.textContent('[data-act="topic"][data-id="meteo"]');
  const count = async p => parseInt((await meteo(p)).match(/(\d+)\/10/)[1], 10);

  /* Czekamy na elementy, nie na zegar — inaczej test bywa migotliwy. */
  async function play(p, n) {
    await p.waitForSelector('[data-act="topic"][data-id="meteo"]');
    await p.click('[data-act="topic"][data-id="meteo"]');
    await p.waitForSelector('[data-act="mode"][data-id="abc"]');
    await p.click('[data-act="mode"][data-id="abc"]');
    for (let i = 0; i < n; i++) {
      await p.waitForSelector('.opt:not([disabled])');
      const idx = await p.evaluate(() => {
        const t = document.querySelector('.qtext').textContent.trim();
        for (const tp of window.BANK.topics) for (const q of tp.q) if (q.q.trim() === t) return q.c;
        return 0;
      });
      await (await p.$$('.opt'))[idx].click();
      await p.waitForSelector('.verdict');
      const nx = await p.$('[data-act="next"]'); if (!nx) break;
      await nx.click();
    }
    const h = await p.$('[data-act="home"]'); if (h) await h.click();
    await p.waitForSelector('[data-act="topic"][data-id="meteo"]');
  }

  console.log('\n--- pamięć zablokowana ---');
  {
    const { c, p, errs } = await fresh();
    await p.addInitScript(BLOCK);
    await p.goto(URL); await p.waitForTimeout(500);
    ok('aplikacja startuje mimo braku pamięci', !!(await p.$('.shell')));
    ok('bez błędów JS', errs.length === 0, errs.join(' | '));
    const warn = await p.$('#storewarn');
    ok('ostrzeżenie jest widoczne', warn && (await warn.isVisible()));
    ok('ostrzeżenie nazywa przyczynę', /tryb prywatny/.test(await p.textContent('#storewarn')));
    ok('i podpowiada wyjście', /Safari|Chrome/.test(await p.textContent('#storewarn')));
    await p.click('[data-act="topic"][data-id="meteo"]'); await p.waitForTimeout(150);
    await p.click('[data-act="mode"][data-id="abc"]'); await p.waitForTimeout(250);
    await p.click('.opt'); await p.waitForTimeout(200);
    ok('gra działa dalej, tylko bez zapisu', !!(await p.$('.verdict')) && errs.length === 0);
    ok('ostrzeżenie widać też w grze', !!(await p.$('#storewarn')));
    await c.close();
  }

  console.log('\n--- pamięć działa ---');
  {
    const { c, p } = await fresh();
    await p.goto(URL); await p.waitForTimeout(400);
    const w = await p.$('#storewarn');
    ok('brak ostrzeżenia, gdy zapis działa', w && !(await w.isVisible()));
    await play(p, 3);
    await p.goto(URL); await p.waitForTimeout(400);
    ok('postęp przeżywa przeładowanie', (await count(p)) === 3, await count(p));
    ok('wyniki leżą w osobnym kluczu',
      (await p.evaluate(k => !!localStorage.getItem(k), K_STATS)));
    ok('sesja leży w osobnym kluczu',
      (await p.evaluate(k => localStorage.getItem(k) !== null, K_SESS)));
    await c.close();
  }

  console.log('\n--- ucięty rekord wyników (telefon ubił kartę w trakcie zapisu) ---');
  {
    const { c, p, errs } = await fresh();
    await p.goto(URL); await p.waitForTimeout(400);
    await play(p, 5);
    await seed(p, k => {
      const v = localStorage.getItem(k);
      if (v && v.length > 40) localStorage.setItem(k, v.slice(0, Math.floor(v.length * 0.6)));
    }, K_STATS);
    const after = await count(p);
    ok('wyniki odzyskane z kopii zapasowej', after >= 4, after + '/10 (kopia jest o jeden zapis w tyle)');
    await play(p, 1);
    await p.goto(URL); await p.waitForTimeout(400);
    ok('kolejny zapis niczego nie dobija', (await count(p)) >= 4, await count(p));
    ok('bez błędów JS', errs.length === 0, errs.join(' | '));
    await c.close();
  }

  console.log('\n--- zepsuta sesja nie rusza wyników ---');
  {
    const { c, p } = await fresh();
    await p.goto(URL); await p.waitForTimeout(400);
    await play(p, 4);
    await seed(p, k => localStorage.setItem(k, '{"order":"nie-tablica","mode":"xyz"'), K_SESS);
    ok('wyniki nietknięte', (await count(p)) === 4, await count(p));
    ok('zepsuta sesja nie tworzy „Wróć do gry”', !(await p.$('[data-act="resume"]')));
    await c.close();
  }

  console.log('\n--- oba rekordy wyników zepsute ---');
  {
    const { c, p, errs } = await fresh();
    await p.goto(URL); await p.waitForTimeout(400);
    await play(p, 3);
    await seed(p, ks => {
      localStorage.setItem(ks[0], 'to-nie-json');
      localStorage.setItem(ks[1], 'to-tez-nie');
    }, [K_STATS, K_BAK]);
    ok('start od zera zamiast wyjątku', (await count(p)) === 0, await count(p));
    ok('bez błędów JS', errs.length === 0, errs.join(' | '));
    await play(p, 1);
    const raw = await p.evaluate(k => localStorage.getItem(k), K_STATS);
    let good = false; try { JSON.parse(raw); good = true; } catch (e) {}
    ok('zapis wraca do poprawnego JSON-a', good);
    await c.close();
  }

  console.log('\n--- migracja starego, wspólnego rekordu ---');
  {
    const { c, p } = await fresh();
    await seed(p, k => {
      localStorage.clear();
      localStorage.setItem(k, JSON.stringify({ v: 1, session: null, stats: {
        'meteo-1': { ok: 2, no: 0, streak: 2, bad: false },
        'meteo-2': { ok: 1, no: 0, streak: 1, bad: false } } }));
    }, K_OLD);
    ok('stary postęp przeniesiony', (await count(p)) === 2, await count(p));
    await play(p, 1);
    await p.goto(URL); await p.waitForTimeout(400);
    ok('po migracji dalej się zapisuje', (await count(p)) >= 2, await count(p));
    const oldLeft = await p.evaluate(k => localStorage.getItem(k), K_OLD);
    ok('stary rekord sprzątnięty dopiero po udanym zapisie', oldLeft === null,
      'zostało: ' + String(oldLeft).slice(0, 60));
    await c.close();
  }

  console.log('\n--- reset ---');
  {
    const { c, p } = await fresh();
    await p.goto(URL); await p.waitForTimeout(400);
    await play(p, 4); await play(p, 4);
    await p.click('[data-act="ask-reset"]'); await p.waitForTimeout(200);
    await p.click('[data-act="do-reset"]'); await p.waitForTimeout(300);
    const left = await p.evaluate(ks => ks.filter(k => {
      const v = localStorage.getItem(k); return v && v !== '{}';
    }), [K_STATS, K_BAK, K_OLD]);
    ok('żadna kopia nie przeżywa resetu', left.length === 0, left.join(', '));
    await p.goto(URL); await p.waitForTimeout(400);
    ok('reset trwały po przeładowaniu', (await count(p)) === 0);
    await c.close();
  }

  await browser.close();
  done();
})();
