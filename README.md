# PARTICON-EU — dashboard rejestracji

Dashboard przedstawia zbiorcze statystyki rejestracji na seminaria projektu PARTICON-EU. Dostęp do statystyk jest przeznaczony dla zespołu projektu.

## Dashboard ankiety

Dashboard ankiety LimeSurvey 846945 jest publikowany pod ścieżką `/ankieta/` w ramach tego samego wdrożenia GitHub Pages. Wykorzystuje ten sam klucz dostępu i harmonogram synchronizacji. Konto LimeSurvey używane przez GitHub Actions musi mieć dostęp do eksportu odpowiedzi z tej ankiety.

Odpowiedzi oznaczone przez `SCREENOUT`, `AGEOUT` lub `COUNTRYOUT` są liczone jako niezakwalifikowane. Pozostałe formularze są ukończone, jeśli mają datę przesłania, albo nieukończone, jeśli tej daty brakuje. Metryczka obejmuje tylko ukończone formularze.

Mapowanie w `scripts/survey.mjs` odpowiada polom ankiety `RESCOUNTRY`, `SETTLEMENT`, `NUTS2`, `AGEGROUP`, `GENDER` i `EMPLOYMENT`. Wielkość miejscowości jest grupowana w cztery przedziały. Regiony NUTS 2 dzielą się na region obejmujący stolicę danego kraju oraz pozostałe regiony. Puste odpowiedzi i nierozpoznane kody są pokazywane jako odrębne sumy. Synchronizacja pobiera tylko kolumny potrzebne do liczników i metryczki. Publikowane dane zawierają wyłącznie zaszyfrowane agregaty.

Porównanie krajów korzysta z liczby ukończonych ankiet w danym kraju jako podstawy procentowania. Obejmuje wiek, płeć, wielkość miejscowości, subiektywną sytuację materialną, poziom wykształcenia ISCED oraz związek z prawem. W metryczce całej próby widać również kraj urodzenia respondenta w relacji do kraju zamieszkania oraz liczbę rodziców urodzonych poza tym krajem. Wstępne kody ISCED są grupowane w poziomy 0–2, 3–4 i 5–8, a odpowiedzi do weryfikacji mają odrębną kategorię. Mediana znaczenia konstytucji uwzględnia wyłącznie prawidłowe wartości od 0 do 100 w grupach wyznaczonych przez odpowiedź o związku z prawem.
