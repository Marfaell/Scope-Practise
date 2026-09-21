# Trener paralotniowy

Aplikacja do nauki na świadectwo kwalifikacji pilota paralotni.
100 pytań w 10 tematach, sześć trybów ćwiczeń, zapis postępu w przeglądarce.

Tryby: Test ABCD · Fiszki · Pytanie i odpowiedź · Prawda/Fałsz · Na czas (90 s) ·
Egzamin (cała lista pytań, sprawdzenie jednym przyciskiem na końcu).

## Materiał jednokrotnego wyboru a tryby rozkładające pytanie

W 34 pytaniach kluczem jest wariant zbiorczy („wszystkie odpowiedzi są
prawidłowe/fałszywe"). Wyrwany z kontekstu pojedynczy wariant takiego pytania
jest bez sensu, dlatego:

* **Prawda/Fałsz** nie pyta „czy to poprawna odpowiedź", tylko skleja trzon
  pytania z wariantem w jedno zdanie oznajmujące i pyta, czy jest prawdziwe.
  Wartość logiczną wyznacza klucz: przy kluczu „wszystkie prawidłowe" każdy
  wariant jest prawdą, przy „wszystkie fałszywe" — fałszem, inaczej prawdziwy
  jest tylko wariant kluczowy. Warianty zbiorcze nigdy nie są tezą.
* Pytania, których trzonu nie da się skleić w zdanie (pytajniki typu „Jaki
  kierunek…", opisy sytuacji), mają w `questions.js` pole **`tf: false`** i są
  pomijane w tym trybie. Obecnie jest ich 11, więc w puli zostaje 89 pytań.
* Po każdej odpowiedzi pokazywane jest **pytanie źródłowe z wszystkimi czterema
  wariantami** i zaznaczonym kluczem — kontekst wraca.
* **Fiszki** pokazują warianty już na awersie (fiszka do jednokrotnego wyboru),
  a **tryb pisany** odsłania po sprawdzeniu pełne pytanie z wariantami.

## Pliki

| plik | rola |
| --- | --- |
| `questions.js` | baza pytań — treść, warianty A–D, indeks poprawnej odpowiedzi (`c`), uzasadnienie (`w`) |
| `app.js` | logika: tryby gry, losowanie, punktacja, zapis stanu |
| `styles.css` | wygląd (motyw jasny i ciemny) |
| `index.html` | strona uruchamiająca całość — wersja samodzielna / GitHub Pages |
| `artifact.html` | ten sam kod jako fragment publikowany jako Artifact (link do telefonu) |

## Uruchomienie lokalne

Otwórz `index.html` w przeglądarce albo wystaw katalog przez dowolny serwer statyczny:

```
python3 -m http.server -d quiz 8000
```

## Wykres biegunowej

Cztery pytania o punkty A–D odwołują się do wykresu, który aplikacja rysuje
sama (`polarFig()` w `app.js`). Rysunek odwzorowuje grafikę z kursu: oś
prędkości u góry z V_min, V_ek, V_opt i V_max, oś opadania w dół z W_min,
proste z początku układu i strzałki zasięgu lotu dla punktów A, B i C.
Długości strzałek wynikają z doskonałości w tych punktach, więc C jest
najdłuższa, a A najkrótsza.

## Wierność wobec materiału źródłowego

Treści pytań i wariantów odpowiedzi są przepisane dosłownie z materiału
kursowego. Jedyne wprowadzone zmiany to poprawki literówek (np. `poźniej`,
`skrzdło`, `prez`, `odpowidzi`, `miejsach`, `na skutej`) oraz interpunkcja.
Sformułowania, które w oryginale są poprawnymi słowami — nawet użyte
nietypowo, jak „loty z wizualizacją przestrzeni", „nim końcówka jest szersza"
czy „max bezpieczną prędkość" — zostają bez zmian.

## Poprawianie klucza odpowiedzi

Klucz nie był dołączony do pytań — został ustalony na podstawie wiedzy
paralotniowej. Aby zmienić odpowiedź, w `questions.js` popraw pole `c`
(0 = A, 1 = B, 2 = C, 3 = D) i w razie potrzeby tekst `w`.

## Dodanie pytania

Dopisz obiekt do tablicy `q` wybranego tematu:

```js
{
  q: 'Treść pytania:',
  o: ['wariant A', 'wariant B', 'wariant C', 'wariant D'],
  c: 2,
  w: 'Krótkie uzasadnienie pokazywane po odpowiedzi.',
}
```

Kolejność wariantów nie jest losowana — pytania typu „wszystkie odpowiedzi są
prawidłowe” muszą zostawać na swoich miejscach. Losowana jest kolejność pytań.

## Jak liczony jest postęp

* Pytanie jest **zaliczone** po jednej poprawnej odpowiedzi — to liczba na
  kafelku (`x/10`) i jasna część paska. Rusza się od razu.
* Pytanie jest **opanowane** po dwóch poprawnych odpowiedziach z rzędu — to
  ciemna część paska. Wymaga trafienia w dwóch różnych rundach, bo w jednej
  rundzie każde pytanie pada raz.
* Błędna odpowiedź wrzuca pytanie do listy **do poprawki** aż do następnej
  poprawnej odpowiedzi.
* W trybie egzaminu pytanie bez zaznaczonej odpowiedzi liczy się jako błędne.

## Jak trzymany jest postęp

Trzy osobne klucze w `localStorage`, celowo rozdzielone:

| klucz | zawartość |
| --- | --- |
| `paralotnia.trener.stats` | wyniki — dane trwałe |
| `paralotnia.trener.bak` | poprzednia dobra kopia wyników |
| `paralotnia.trener.session` | przerwana runda — dane ulotne |

Zasady, które muszą zostać przy każdej zmianie tego kodu:

* **Uszkodzony rekord nigdy nie kasuje wyników.** `readJSON` zwraca `null`
  i zostawia rekord w spokoju; odczyt leci po kolei: `stats` → `bak` →
  stary `paralotnia.trener.v1` (migracja).
* **Sesja nie może uszkodzić wyników.** Cała walidacja rundy siedzi
  w `sanitizeSession`, a jej porażka zeruje najwyżej sesję.
* **Pusty zapis nie nadpisuje niepustych wyników.** Kasowanie idzie wyłącznie
  przez `wipeAll()`, wołane z przycisku resetu.
* **Kopia powstaje przed nadpisaniem**, więc urwany zapis kosztuje najwyżej
  jedną ostatnią odpowiedź.
* Stary wspólny rekord znika dopiero, gdy nowy format naprawdę coś zawiera.

Przycisk „Wyzeruj postęp” czyści komplet kluczy razem z kopią zapasową.
