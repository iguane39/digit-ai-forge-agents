# Provenance des polices embarquées

**Montserrat et Inter (23/09/2026).** Obtenues depuis le registre npm public (jamais un dépôt
tiers ni un CDN), par `npm pack`, dans le dossier temporaire du système — jamais dans un dépôt :

| Famille | Paquet | Version | Licence | Intégrité (`npm view <paquet>@<version> dist.integrity`) |
|---|---|---|---|---|
| Montserrat | `@fontsource/montserrat` | 5.3.0 | OFL-1.1 | `sha512-iQPDtZOnmM5ih4JBGaMSXisRap0ixb9bAUw2hDtY7EjVfaqiiNlKtVuJl9XclxUwtwMMHNcWXfQR6zI9x05+Tg==` |
| Inter | `@fontsource/inter` | 5.3.0 | OFL-1.1 | `sha512-RofMylZmjlJEfELXeNHFWBRcSs75rGU/6bV2S2jfnvv/3rPXPGe0LgUJTklcHZ9lM4OZmAVFhcJPnACfb91A3g==` |

Intégrité vérifiée en DOUBLE : le résumé que `npm pack` imprime lui-même, et un second calcul
indépendant (SHA-512 du tarball téléchargé, encodé en base64) comparé octet à octet à
`dist.integrity` du registre — les deux paquets concordent avec les deux méthodes.

Fichiers copiés tels quels depuis `package/files/` du tarball vers ce dossier, sans retouche,
au nommage déjà en usage ici (`<famille>-<subset>-<graisse>-normal.woff2`) : `latin` et
`latin-ext`, aux graisses que `FACES` (`../embarquer-polices.mjs`) déclarait déjà pour les
polices qu'elles remplacent en tête de pile — 400/500/700/800/900 pour Montserrat (graisses de
Roboto), 400/500/600/700 pour Inter (graisses de DM Sans).

Roboto, DM Sans et JetBrains Mono restent sur ce disque, inchangés : une suppression est un
geste humain (R-29 du pilot), ce script ne le fait pas.

Contexte : décision humaine D-5 (a) du 22/09/2026 (« la charte des présentations fait foi, les
pages s'y alignent »), exécutée par D-11 (a) le 23/09 sur `digit-ai-page-html` (1.25.0,
`references/charte-et-tokens.md` C1-C2) — ce skill l'hérite.
