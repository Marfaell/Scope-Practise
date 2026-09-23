# Testy

```
node quiz/tests/run.js          # wszystko
node quiz/tests/run.js bank     # tylko baza pytań, bez przeglądarki
```

| zestaw | czego pilnuje | przeglądarka |
| --- | --- | --- |
| `bank.test.js` | struktura bazy pytań i pułapki w zestawie | nie |
| `ui.test.js` | sześć trybów gry, postęp, losowanie, układ, motyw ciemny | tak |
| `storage.test.js` | zapis postępu: brak pamięci, uszkodzone rekordy, migracja, reset | tak |

Zestawy przeglądarkowe potrzebują playwright:

```
npm i -D playwright && npx playwright install chromium
```

Gotową przeglądarkę można wskazać zmienną `CHROMIUM_PATH`. Bez playwright
`run.js` przepuszcza tylko `bank` i mówi, czego brakuje.

## Po co to jest

`bank.test.js` uruchamiaj **po każdej zmianie w `questions.js`**. Sprawdza nie
tylko strukturę, ale i logikę pułapek: że wariant zbiorczy („wszystkie
odpowiedzi są prawidłowe/fałszywe") nigdy nie trafia do trybu prawda/fałsz jako
teza, że przy kluczu zbiorczym wszystkie tezy mają właściwą wartość logiczną i
że żaden wabik nie jest logicznie równoważny kluczowi — bo wtedy pytanie
miałoby dwie poprawne odpowiedzi.

`storage.test.js` odtwarza awarię, przez którą przepadł czyjś postęp: rekord
ucięty w połowie zapisu, gdy telefon ubija kartę. Te asercje mają zostać.

## Zasada

Testy czekają na elementy (`waitForSelector`), nie na zegar. Uszkodzenia
pamięci zasiewa się na `fixtures/blank.html` — pustej stronie z tego samego
pochodzenia — bo gdyby robić to na stronie aplikacji, ta przy opuszczaniu
zapisałaby poprawne dane na zasiew i awaria nigdy by nie zaszła.
