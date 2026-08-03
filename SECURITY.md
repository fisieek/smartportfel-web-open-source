# Polityka bezpieczeństwa

## Zgłaszanie podatności

**Nie zakładaj publicznego zgłoszenia (issue) dla luki bezpieczeństwa.** Publiczny opis daje
przewagę atakującemu, zanim ktokolwiek zdąży to naprawić.

Zgłoś ją prywatnie przez **GitHub Security Advisories**:
[Report a vulnerability](https://github.com/fisieek/smartportfel-web-open-source/security/advisories/new)

W zgłoszeniu przydaje się:

- na czym polega problem i co pozwala osiągnąć,
- kroki odtworzenia (minimalny przykład wystarczy),
- wersja / commit, na którym to sprawdzałeś,
- czy wymaga zalogowanego konta.

Odpowiadam najszybciej jak umiem — to projekt prowadzony po godzinach, więc proszę o cierpliwość.
Po naprawie chętnie wymienię Cię w opisie poprawki, jeśli sobie tego życzysz.

## Zakres

To repozytorium zawiera kod aplikacji. Testy penetracyjne prowadź **na własnej instancji**
postawionej lokalnie — nigdy na cudzej, działającej i na cudzych danych.

## Czego ten kod NIE robi

Warto wiedzieć przy ocenie ryzyka. Świeży klon:

- nie zawiera analityki ani zgłaszania błędów na zewnątrz,
- nie ma logowania przez zewnętrznych dostawców tożsamości,
- nie odpytuje żadnego serwisu giełdowego,
- nie ma własnego klucza do modeli AI (klucz podaje użytkownik i jest szyfrowany
  AES-256-GCM, związany z jego `userId`, i nigdy nie wraca do przeglądarki).

Jedyne zewnętrzne wyjścia sieciowe z pudełka to **api.nbp.pl** (publiczne kursy walut i cena
złota, bez klucza) oraz **Resend**, jeśli skonfigurujesz `RESEND_API_KEY`.

## Konfiguracja, o którą warto zadbać u siebie

- `JWT_SECRET` — min. 32 znaki, losowe. Serwer odmawia startu przy krótszym.
- `AI_KEY_ENCRYPTION_KEY` — 64 znaki hex. **Zmiana unieważnia wszystkie zapisane klucze
  użytkowników**, więc ustaw raz i trzymaj w bezpiecznym miejscu.
- `CRON_SECRET` i `SYSTEM_CLEANUP_TOKEN` — bez nich odpowiednie endpointy zwracają 403,
  co jest bezpieczną wartością domyślną. Ustaw je, jeśli faktycznie używasz cronów.
- Nigdy nie commituj pliku `.env`. `.gitignore` blokuje `.env*`, a CI puszcza skan sekretów
  (gitleaks) przy każdym pushu i pull requeście.
