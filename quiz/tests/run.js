#!/usr/bin/env node
/* Uruchamia wszystkie zestawy testów.
   node quiz/tests/run.js            — wszystko
   node quiz/tests/run.js bank       — tylko baza pytań (bez przeglądarki)

   Zestawy przeglądarkowe wymagają playwright:
     npm i -D playwright && npx playwright install chromium
   Gotową przeglądarkę można wskazać zmienną CHROMIUM_PATH. */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  { name: 'bank', file: 'bank.test.js', browser: false },
  { name: 'ui', file: 'ui.test.js', browser: true },
  { name: 'storage', file: 'storage.test.js', browser: true },
];

const only = process.argv.slice(2);
const chosen = only.length ? SUITES.filter(s => only.includes(s.name)) : SUITES;
if (!chosen.length) {
  console.error('Nieznany zestaw. Dostępne: ' + SUITES.map(s => s.name).join(', '));
  process.exit(2);
}

let hasPlaywright = true;
try { require.resolve('playwright'); } catch (e) { hasPlaywright = false; }

const failed = [];
const skipped = [];
for (const s of chosen) {
  if (s.browser && !hasPlaywright) { skipped.push(s.name); continue; }
  console.log('\n─── ' + s.name + ' ───');
  const r = spawnSync(process.execPath, [path.join(__dirname, s.file)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(s.name);
}

console.log('\n' + '='.repeat(46));
if (skipped.length) {
  console.log('Pominięto (brak playwright): ' + skipped.join(', '));
  console.log('  npm i -D playwright && npx playwright install chromium');
}
if (failed.length) {
  console.log('NIE PRZESZŁY: ' + failed.join(', '));
  process.exit(1);
}
console.log('Wszystkie uruchomione zestawy przeszły.');
