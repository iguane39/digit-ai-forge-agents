# Produit-12 — Carte de chaleur de conformité (cas VERT)

La même carte, dont chaque chiffre énonce son dénominateur et ce qu'il inclut.

| Acteur | Règles applicables | Tests | Sécurité | Observabilité |
|---|---|---|---|---|
| Produit-01 | 4 | 75 % | 50 % | 25 % |
| Produit-05 | 5 | 40 % | 60 % | 20 % |
| Produit-08 | 10 | 30 % | 20 % | 10 % |

Dénominateur : les règles APPLICABLES à chaque acteur, c'est-à-dire celles sur lesquelles il a
eu l'occasion de se prononcer. Formule : règles tenues / règles applicables. Une absence de
déclaration n'est pas un échec et ne se compte pas comme un zéro ; une règle écartée d'un canal
n'est pas retirée de la mesure. Les dénominateurs étant petits et hétérogènes (4, 5 et 10), le
compte est publié à côté de la part.
