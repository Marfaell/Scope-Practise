/* Baza pytań — struktura i pułapki. Nie wymaga przeglądarki:
   node quiz/tests/bank.test.js */
'use strict';
const fs = require('fs');
const path = require('path');

const QUIZ = path.join(__dirname, '..');
global.window = {};
eval(fs.readFileSync(path.join(QUIZ, 'questions.js'), 'utf8'));
const BANK = global.window.BANK;

/* Te same funkcje, których używa aplikacja — wyciągane z app.js,
   żeby test nie sprawdzał własnej kopii logiki. */
const src = fs.readFileSync(path.join(QUIZ, 'app.js'), 'utf8');
function grab(name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('nie znaleziono funkcji ' + name + ' w app.js');
  return src.slice(i, src.indexOf('\n  }', i) + 4);
}
const isMeta = eval('(' + grab('isMeta') + ')');
const metaKind = eval('(' + grab('metaKind') + ')');
const claimTruth = eval('(' + grab('claimTruth') + ')');
const statementOf = eval('(' + grab('statementOf') + ')');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name); console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}

const all = [];
BANK.topics.forEach(t => t.q.forEach((q, i) => all.push({ ref: t.id + '-' + (i + 1), top: t.short, q })));

console.log('\n--- struktura ---');
ok('10 tematów', BANK.topics.length === 10, BANK.topics.length);
ok('100 pytań', all.length === 100, all.length);
ok('każdy temat ma id, nazwę i skrót',
  BANK.topics.every(t => t.id && t.name && t.short));
ok('identyfikatory tematów są unikalne',
  new Set(BANK.topics.map(t => t.id)).size === BANK.topics.length);

const badShape = all.filter(({ q }) =>
  !Array.isArray(q.o) || q.o.length !== 4 ||
  typeof q.c !== 'number' || q.c < 0 || q.c > 3 ||
  !q.q || !q.w);
ok('każde pytanie ma 4 warianty, klucz i uzasadnienie', badShape.length === 0,
  badShape.map(e => e.ref).join(', '));

const dupOpts = all.filter(({ q }) =>
  new Set(q.o.map(o => o.trim().toLowerCase())).size !== 4);
ok('żadne pytanie nie powtarza wariantu', dupOpts.length === 0,
  dupOpts.map(e => e.ref).join(', '));

const emptyOpts = all.filter(({ q }) => q.o.some(o => !o || !o.trim()));
ok('żaden wariant nie jest pusty', emptyOpts.length === 0,
  emptyOpts.map(e => e.ref).join(', '));

const seen = new Map();
const dupQ = [];
all.forEach(({ ref, q }) => {
  const k = q.q.trim().toLowerCase();
  if (seen.has(k)) dupQ.push(ref + ' = ' + seen.get(k));
  seen.set(k, ref);
});
ok('treści pytań są unikalne', dupQ.length === 0, dupQ.join(', '));

const badFig = all.filter(({ q }) => q.fig && q.fig !== 'polar');
ok('pola fig wskazują istniejący rysunek', badFig.length === 0,
  badFig.map(e => e.ref).join(', '));
ok('4 pytania odwołują się do biegunowej',
  all.filter(({ q }) => q.fig === 'polar').length === 4);

console.log('\n--- pułapki w zestawie ---');
const keyFalse = all.filter(e => metaKind(e.q.o[e.q.c]) === 'all-false');
const keyTrue = all.filter(e => metaKind(e.q.o[e.q.c]) === 'all-true');
const decoy = all.filter(e => !isMeta(e.q.o[e.q.c]) && e.q.o.some((o, i) => i !== e.q.c && isMeta(o)));
console.log('    klucz „wszystko fałszywe”: ' + keyFalse.length + ' (' + keyFalse.map(e => e.ref).join(', ') + ')');
console.log('    klucz „wszystko prawidłowe”: ' + keyTrue.length);
console.log('    wabik zbiorczy przy konkretnym kluczu: ' + decoy.length + ' (' + decoy.map(e => e.ref).join(', ') + ')');

ok('żadne pytanie nie ma dwóch wariantów zbiorczych',
  all.every(({ q }) => q.o.filter(isMeta).length <= 1),
  all.filter(({ q }) => q.o.filter(isMeta).length > 1).map(e => e.ref).join(', '));

/* Wabik zbiorczy nie może być logicznie równoważny kluczowi —
   inaczej pytanie miałoby dwie poprawne odpowiedzi. */
const ambiguous = [];
all.forEach(({ ref, q }) => {
  q.o.forEach((o, i) => {
    if (i === q.c || !isMeta(o)) return;
    const others = [0, 1, 2, 3].filter(j => j !== i && !isMeta(q.o[j]));
    const k = metaKind(o);
    if (k === 'all-true' && others.every(j => claimTruth(q, j) === true)) ambiguous.push(ref);
    if (k === 'all-false' && others.every(j => claimTruth(q, j) === false)) ambiguous.push(ref);
  });
});
ok('wabik zbiorczy nigdy nie jest równoważny kluczowi', ambiguous.length === 0, ambiguous.join(', '));

console.log('\n--- tryb prawda/fałsz ---');
const tfPool = all.filter(e => e.q.tf !== false);
const excluded = all.length - tfPool.length;
console.log('    pytań w puli: ' + tfPool.length + ', wyłączonych polem tf:false: ' + excluded);
ok('pula prawda/fałsz nie jest pusta', tfPool.length > 50, tfPool.length);

let claims = 0;
const leaked = [], badSentence = [];
tfPool.forEach(({ ref, q }) => {
  [0, 1, 2, 3].forEach(i => {
    if (isMeta(q.o[i])) return;
    claims++;
    const s = statementOf(q, i);
    if (/wszystkie odpowiedzi|wyżej wymienione|żadna z odpowiedzi|żadna odpowiedź/i.test(s)) leaked.push(ref + '/' + 'ABCD'[i]);
    if (!/[.!?]$/.test(s.trim()) || s.includes(':')) badSentence.push(ref + '/' + 'ABCD'[i]);
  });
});
console.log('    tez łącznie: ' + claims);
ok('żaden wariant zbiorczy nie trafia do tez', leaked.length === 0, leaked.join(', '));
ok('każda teza jest zdaniem, nie urwanym trzonem', badSentence.length === 0, badSentence.slice(0, 5).join(', '));

const badKF = [];
keyFalse.forEach(({ ref, q }) => {
  if (q.tf === false) return;
  [0, 1, 2, 3].forEach(i => {
    if (!isMeta(q.o[i]) && claimTruth(q, i) !== false) badKF.push(ref + '/' + 'ABCD'[i]);
  });
});
ok('przy kluczu „wszystko fałszywe” każda teza jest fałszem', badKF.length === 0, badKF.join(', '));

const badTrue = [];
keyTrue.forEach(({ ref, q }) => {
  if (q.tf === false) return;
  [0, 1, 2, 3].forEach(i => {
    if (!isMeta(q.o[i]) && claimTruth(q, i) !== true) badTrue.push(ref + '/' + 'ABCD'[i]);
  });
});
ok('przy kluczu „wszystko prawidłowe” każda teza jest prawdą', badTrue.length === 0, badTrue.join(', '));

const badSingle = [];
all.filter(e => !isMeta(e.q.o[e.q.c]) && e.q.tf !== false).forEach(({ ref, q }) => {
  const trues = [0, 1, 2, 3].filter(i => !isMeta(q.o[i]) && claimTruth(q, i) === true);
  if (trues.length !== 1 || trues[0] !== q.c) badSingle.push(ref);
});
ok('przy konkretnym kluczu prawdziwa jest dokładnie jedna teza — klucz',
  badSingle.length === 0, badSingle.join(', '));

console.log('\n=== bank: ' + pass + ' przeszło, ' + fails.length + ' nie przeszło ===');
if (fails.length) process.exit(1);
