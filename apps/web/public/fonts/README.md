# Fonty

Oba kroje są na licencji **SIL Open Font License 1.1**, która przy redystrybucji wymaga
dołączenia tekstu licencji — dlatego leży on tutaj, obok plików `.woff2`.

| Plik | Font | Licencja | Źródło |
|---|---|---|---|
| `outfit-latin-*.woff2` | Outfit | [`OFL-Outfit.txt`](OFL-Outfit.txt) | [Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts) |
| `space-grotesk-latin-*.woff2` | Space Grotesk | [`OFL-SpaceGrotesk.txt`](OFL-SpaceGrotesk.txt) | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) |

Warianty `-latin` i `-latin-ext` to podzbiory znaków (`unicode-range` w `@font-face`) — przeglądarka
pobiera `latin-ext` dopiero, gdy na stronie pojawią się polskie znaki diakrytyczne.

Teksty licencji pochodzą z repozytorium [google/fonts](https://github.com/google/fonts)
(`ofl/outfit/OFL.txt` i `ofl/spacegrotesk/OFL.txt`). Jeśli podmieniasz pliki fontów na nowszą
wersję, podmień też licencje — w nagłówku jest rok i lista autorów.

**Licencja OFL dotyczy wyłącznie fontów.** Kod aplikacji jest na MIT — patrz
[`LICENSE`](../../../../LICENSE) w korzeniu repozytorium.
