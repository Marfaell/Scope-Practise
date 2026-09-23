/* Wspólne dla testów przeglądarkowych. */
'use strict';

function launch() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.error('Brak playwright. Zainstaluj:  npm i -D playwright  (i npx playwright install chromium)');
    process.exit(2);
  }
  /* CHROMIUM_PATH pozwala wskazać gotową przeglądarkę, np. w CI. */
  const exe = process.env.CHROMIUM_PATH;
  return chromium.launch(exe ? { executablePath: exe } : {});
}

function reporter(label) {
  let pass = 0;
  const fails = [];
  return {
    ok(name, cond, detail) {
      if (cond) { pass++; console.log('  ✓ ' + name); }
      else { fails.push(name); console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')); }
    },
    done() {
      console.log('\n=== ' + label + ': ' + pass + ' przeszło, ' + fails.length + ' nie przeszło ===');
      if (fails.length) { console.log('Nieudane: ' + fails.join('; ')); process.exit(1); }
    },
  };
}

module.exports = { launch, reporter };
