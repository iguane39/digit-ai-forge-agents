# Règles canoniques des oracles (R1–R11)

> **Source de vérité** du référentiel d'audit des skills d'oracles (v1.0, intégré à quality-oracles 1.3.0).
> Tout prompt ou skill qui audite un oracle charge CE fichier ; les copies embarquées ailleurs sont
> des secours et renvoient ici. Validé par `scripts/self-test.mjs` (présence + parse).
> Renvois croisés : chaque règle pointe la section du SKILL qui l'incarne déjà — un seul canon, pas deux.

| R | Règle | Ancrage SKILL.md |
|---|---|---|
| R1 | Extériorité du verdict | Principe + §5 (« un ✓ sans oracle exécuté n'est pas un ✓ ») |
| R2 | Hiérarchie de fiabilité | §3.1 (partiel — vocabulaire ci-dessous) |
| R3 | Standards avant maison | — (porté ici uniquement) |
| R4 | Périmètre explicite | §3.4 (`non_juge`) + registre « NE jugent PAS » |
| R5 | Oracle en lecture seule | — (porté ici uniquement) |
| R6 | Escalade, jamais substitution | contrat SKIP (exit 2) + §5 (« non vérifié (raison) ») |
| R7 | Feedback actionnable | §3.5 (sortie localisante) |
| R8 | Boucle bornée | — (porté ici uniquement) |
| R9 | Proportionnalité | §6 |
| R10 | Typage du qualitatif | conception d'`oracle-llm.mjs` (véracité jamais simulée en PASS) |
| R11 | Déclencheur sur le contenu | §3 point 9 (TF-2635) |

R1. **Extériorité du verdict.** Aucun ✓ ne peut provenir du jugement du générateur. Tout verdict
trace vers un mécanisme exécuté (script, test, rendu mesuré, juge indépendant). Un ✓ sans
exécution est un défaut bloquant.

R2. **Hiérarchie de fiabilité.** À propriété automatisable égale : déterministe > perceptuel
outillé > LLM-as-judge. L'humain n'est pas le bas de la hiérarchie mais l'oracle de dernier
ressort (coûteux, non automatisable — cf. R6) : pour les propriétés de fond non outillables,
humain > LLM-as-judge. Justifier tout choix d'un oracle faible quand un plus fort existe pour la
même propriété. *Vocabulaire (aligné §3.1)* : « oracle » = contrôle déterministe exécutable ;
revue humaine = **contrôle manuel** ; LLM-as-judge = **promesse** (cf. R10).

R3. **Standards avant maison.** Avant tout oracle custom, vérifier qu'un outil de référence couvre
la propriété (tests : pytest/Jest ; a11y : axe-core/pa11y ; qualité web : Lighthouse ; régression
visuelle : diff Playwright/BackstopJS ; données : JSON Schema, Great Expectations ; statique :
linters, Semgrep). L'oracle maison ne se justifie que pour un trou réel de l'écosystème — le
documenter.

R4. **Périmètre explicite.** Chaque oracle déclare ce qu'il couvre et ce qu'il ne couvre pas, et
le niveau de chaque contrôle (bloquant vs avertissement). Un verdict global ne peut pas laisser
croire à une couverture totale si elle est partielle.

R5. **Oracle en lecture seule.** Le générateur ne peut ni modifier l'oracle, ni ses seuils, ni ses
données de référence, ni poser une exemption (type data-overlap-ok) sans que l'exemption soit
tracée et listée dans la restitution. Toute modification de l'oracle pendant la boucle est un red
flag de gaming (Goodhart).

R6. **Escalade, jamais substitution.** Si l'oracle prévu est indisponible (outil qui plante,
dépendance absente), le skill escalade vers l'humain en le disant explicitement. Interdit :
basculer silencieusement sur le jugement du modèle en conservant le format du verdict.

R7. **Feedback actionnable.** Le verdict d'échec localise (quel élément, quelle mesure, quel
seuil) pour permettre une correction chirurgicale — jamais un simple « non conforme » qui force
une régénération aveugle.

R8. **Boucle bornée.** L'itération générateur↔oracle est plafonnée (3 itérations par défaut). Au
plafond sans convergence : handoff humain avec l'historique des verdicts, pas d'itération infinie
ni d'abaissement des seuils.

R9. **Proportionnalité.** L'investissement dans un oracle se justifie par la fréquence de
régénération ou le coût d'un défaut détecté tard. Ne pas prescrire d'oracle lourd pour un livrable
one-shot trivial, ni s'en dispenser pour un livrable récurrent ou critique.

R10. **Typage du qualitatif.** Pour les propriétés sans oracle fort possible (fond, pertinence
métier), assumer le LLM-as-judge : grille figée avant génération, juge en contexte séparé du
générateur, statut annoncé comme « promesse » et non « garantie ».

R11. **Un contrôle se déclenche sur ce que le contenu fait, jamais sur la catégorie que son auteur déclare.**
Une règle conditionnée à un pilier, un type, une étiquette ou un dossier que l'auteur choisit laisse passer le contenu qui
porte le défaut mais qu'il a rangé ailleurs : le contrôle ne se désactive pas, il n'a jamais été armé. Le déclencheur se
lit dans le contenu (un mot, une forme, une image, une donnée), pas dans son étiquette ; quand une catégorie est
légitimement un paramètre (un profil, un référentiel), elle est celle de la CIBLE jugée, jamais celle que l'auteur peut
changer pour sortir du champ. *Le fait* : chez un produit, un contrôle de publications refusait une présentation
d'hébergement sans photo de la piscine pour 2 piliers éditoriaux seulement ; 8 campagnes rangées dans 2 autres piliers ont
passé 66 contrôles à 0 échec avec 0 photo du domaine sur 40 images (lot du 12/11/2026). Le jeu d'essais rouge porte donc un
cas « même contenu, autre catégorie », qui doit rendre le verdict de la rouge : `write-an-oracle` le crée d'office
(`<nom>-autre-categorie`, clé `autre_categorie` du manifest), la recette de `quality-oracles` le rejoue, et le self-test de
`write-an-oracle` refuse un oracle scaffoldé sans lui.
