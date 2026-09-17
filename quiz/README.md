# Trener paralotniowy

Aplikacja do nauki na świadectwo kwalifikacji pilota paralotni.
100 pytań w 10 tematach, sześć trybów ćwiczeń, zapis postępu w przeglądarce.

Tryby: Test ABCD · Fiszki · Pytanie i odpowiedź · Prawda/Fałsz · Na czas (90 s) ·
Egzamin (cała lista pytań, sprawdzenie jednym przyciskiem na końcu).

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

* Pytanie jest **opanowane** po dwóch poprawnych odpowiedziach z rzędu.
* Błędna odpowiedź wrzuca pytanie do listy **do poprawki** aż do następnej
  poprawnej odpowiedzi.
* W trybie egzaminu pytanie bez zaznaczonej odpowiedzi liczy się jako błędne.
* Postęp i przerwana runda siedzą w `localStorage` pod kluczem
  `paralotnia.trener.v1`; przycisk „Wyzeruj postęp” czyści wszystko.
