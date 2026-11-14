#!/usr/bin/env node
/**
 * ledger.mjs — ledger de run append-only (JSON Lines), persisté dans le dossier du projet.
 * Usage :
 *   node ledger.mjs append <ledger.jsonl> '<json>'          # payload en argument shell
 *   node ledger.mjs append <ledger.jsonl> --fichier <p.json> # payload lu depuis un fichier
 *   node ledger.mjs verify <ledger.jsonl>                   # vérifie l'intégrité append-only
 *   node ledger.mjs consigner <ledger.jsonl> --rapport <rapport.json|-> [--forge f] [--cible c] [--etape e]
 *   node ledger.mjs consigner <ledger.jsonl> [--forge f] [--cible c] [--etape e] -- <commande> [args…]
 *                                                           # UNE entrée oracles_verdict PAR oracle
 * Aucune de ces formes n'accepte d'argument en surnombre : un argument non reconnu est REFUSÉ
 * (sortie 1), NOMMÉ, avec cet usage redonné (TF-1366 a, 21/09/2026).
 *
 * CONSIGNER — UN VERDICT PAR ORACLE (TF-1319, décision humaine D-5 (b) du 17/10/2026). Le juge
 * d'enclenchement du pilot (`oracle-enclenchement.mjs`) confronte les oracles que chaque forge
 * mobilisée découvre aux entrées `oracles_verdict` du run. Sur les deux seuls runs réels qui
 * déclaraient schéma et forges, il rendait FAIL parce que ces runs consignaient TOUS les verdicts
 * d'un lanceur en UNE entrée : un regroupement n'est pas un oubli, mais rien ne permettait d'écrire
 * autrement sans recopier le rapport à la main. `consigner` lit le rapport d'un lanceur (forme
 * `{ oracles: [{ oracle, verdict }] }`), d'un oracle (`{ oracle, verdict }`) ou une liste, et écrit
 * UNE entrée par oracle, sous UN verrou, en UNE écriture — tout le lot ou rien : un élément sans
 * nom ou au verdict inconnu fait refuser le lot entier, chaque élément fautif NOMMÉ. Les verdicts
 * écrits autrement par les lanceurs du parc (`NON_JUGE`, `INCONCLUSIF`, `SANS OBJET`) sont ramenés
 * à la forme canonique par une table ÉCRITE (VERDICTS_EQUIVALENTS), l'original gardé en
 * `verdict_brut`. Chaque entrée porte `consigne_par: "ledger.mjs consigner"` et `lot {id, rang,
 * total}` : c'est ce qui permet au pilot de MESURER, run par run, les refus du juge sur des runs
 * qui ont consigné par cet outil — la condition posée par D-5 (b) avant tout passage en bloquant
 * (`oracles/mesure-refus-enclenchement.mjs` du pilot). `-- <commande>` lance le lanceur SANS shell
 * et lit sa sortie en octets (sous PowerShell 5.1, `>` écrit de l'UTF-16 et un tube réencode ;
 * `--rapport` lit aussi l'UTF-16 à BOM). Sortie 0 dès que le lot est écrit, QUELS QUE SOIENT les
 * verdicts : consigner n'est pas juger ; le code du lanceur est rendu (`exit_commande`).
 * Vérifications d'INTÉGRITÉ : JSON valide par ligne, seq strictement croissant depuis 1,
 * horodatages non décroissants (comparés comme des INSTANTS, TF-1422), première entrée de type
 * run_open. Exit 0 = PASS, 1 = FAIL.
 * Les écarts d'horodatage sont TOUS relevés (jamais le premier seul) et chacun nomme les deux
 * horodatages et le seq.
 *
 * Vérification de FORME, un seul type (TF-0385, 19/08/2026) : `oracles_verdict` porte `oracle`
 * et `verdict`. Mesure qui l'a fait naître — 8 entrées `oracles_verdict` d'un même ledger réel,
 * SIX formes de champs différentes : deux avec `oracle`+`verdict` au singulier, six avec un
 * `oracles` imbriqué sans verdict de premier niveau, et des champs improvisés à chaque fois.
 * Conséquence : la liste des oracles qui ont tourné sur un run n'était pas CALCULABLE, et un
 * juge de l'enclenchement n'avait donc pas d'entrée. Ce vérificateur ne pouvait pas le voir —
 * il ne lisait aucun payload.
 *
 * ANTÉRIORITÉ DÉCLARÉE, sur le modèle exact de R-32 bis du pilot : la forme n'est exigée que si
 * `run_open` porte `schema_ledger`. Sans ce champ, le ledger PRÉCÈDE le schéma — ses entrées
 * sont déclarées non vérifiables, jamais mises en échec. Les trois ledgers du parc mesurés le
 * 19/08 échoueraient tous : un contrôle qui met en échec tout l'existant se fait désactiver —
 * c'est le motif que R-33 bis donne pour ne pas armer d'office le verdict websec (« armer un
 * gate que personne n'a exercé le ferait désarmer au premier faux positif », REGLES-PROJET.md,
 * TF-1332) : on ne juge que ce qui s'est déclaré jugeable.
 *
 * HORODATAGES — TROIS DÉFAUTS CORRIGÉS ENSEMBLE (TF-0410, 20/08/2026). Le fait mesuré : le
 * ledger de Produit-11 (138 entrées) portait DEUX reculs d'horodatage, et le second
 * (seq 134) est resté INVISIBLE trois jours pendant que le premier (seq 129) était connu —
 * ce vérificateur sortait au premier écart. Un contrôle qui cesse de compter ne dit pas
 * « un défaut », il dit « au moins un défaut » : le reste du fichier n'est pas jugé.
 *   1. `verify` ACCUMULE les écarts (précédent : oracle-todo.mjs du pilot, qui accumule et
 *      nomme les deux horodatages) et n'exite qu'à la fin.
 *   2. La monotonie se juge contre le MAXIMUM COURANT (high-water mark), pas contre l'entrée
 *      précédente. Comparer au précédent abaisse la barre juste après un recul : l'entrée
 *      fautive devient la référence, et tout ce qui suit est jugé contre un repère faux —
 *      c'est le mécanisme même qui masquait. Mesure avant bascule : sur les 11 ledgers du
 *      parc, cette règle plus stricte ne change RIEN pour 10 d'entre eux ; sur le seul
 *      concerné elle révèle 4 entrées sous le maximum (seq 129/130/134/135) là où la
 *      comparaison au précédent n'en voyait que 2. Ce n'est donc pas un contrôle qui met en
 *      échec tout l'existant (celui que le motif de R-33 bis dit voué à être désarmé, voir
 *      plus haut) : c'est un contrôle qui voit enfin ce qui existait.
 *   3. `append` REFUSE un `ts` de payload antérieur au maximum du fichier. Cause racine des
 *      quatre écarts : l'entrée était horodatée à l'heure de l'ACTION (run de déploiement)
 *      alors qu'elle est consignée après coup, et le spread `{seq, ts, ...obj}` laissait
 *      silencieusement le payload écraser l'horodatage machine. `append` pouvait donc CRÉER
 *      le défaut que `verify` reproche. L'heure de l'action est une DONNÉE du payload
 *      (`ts_action`) ; `ts` est l'heure de CONSIGNATION, et elle ne remonte jamais.
 *
 * RECTIFICATION DÉCLARÉE, sur le modèle exact de l'antériorité déclarée ci-dessus. L'histoire
 * ne se réécrit pas : les entrées fautives restent, à leur place, avec leur ts faux. Mais un
 * ledger dont l'intégrité est DÉFINITIVEMENT rouge est un ledger que plus personne ne vérifie.
 * Une entrée ULTÉRIEURE de type `rectification_horodatage` porte donc
 * `entrees: [{seq, ts_consigne, ts_reel_estime, cause}]` et déclare des seq PRÉCIS. Bornes,
 * qui sont ce qui empêche ce mécanisme de devenir un effaceur :
 *   · elle ne couvre QUE des seq qui lui sont ANTÉRIEURS, et des entrées écrites AVANT elle dans
 *     le fichier — on ne se dédouane pas d'avance ;
 *   · `ts_consigne` doit correspondre EXACTEMENT au ts de l'entrée visée : une déclaration
 *     qui ne colle pas à l'histoire ne couvre rien (et le dit) ;
 *   · les quatre champs sont dus — une déclaration incomplète est un écart, pas une couverture ;
 *   · elle agit sur l'horodatage et, depuis TF-1425, sur un seq en double ou en recul, et, depuis
 *     TF-2494 (voir plus bas), sur un seq SAUTÉ (saut en avant) : JSON invalide, run_open absent,
 *     forme du payload restent des FAIL — rien ne les déclare rectifiables ;
 *   · un écart rectifié s'IMPRIME `[RECTIFIÉ]`, toujours, à chaque verify. Il ne disparaît
 *     pas : il cesse seulement de bloquer. Un écart NON déclaré reste FAIL.
 *
 * LA RECTIFICATION COUVRE AUSSI UNE COLLISION DE SEQ (TF-1425, 28/09/2026). Le contrat 3 du pilot
 * (TF-0794, 03/09) tient deux sessions le même jour pour le cas NORMAL d'un produit actif, et R-42
 * de son oracle de conformité consomme depuis la rectification d'une collision : le seq en double
 * ou en recul nommé dans `entrees[]` devient [RECTIFIÉ], et la suite attendue reprend au plus haut
 * seq vu. Ce vérificateur, lui, la refusait : mesuré chez un produit le 25/09 sur un ledger de six
 * entrées (seq 1, 2, 3, puis 2 et 3 d'une branche parallèle, puis la rectification qui nomme 2 et
 * 3 avec les quatre champs), R-42 rendait PASS et `verify` exit 1, la rectification [SANS OBJET].
 * Le même fichier était intègre pour un juge et rompu pour l'autre. Désormais `verify` tient la
 * même règle, avec deux bornes de plus, toutes deux déjà les siennes : la déclaration couvre
 * l'entrée dont le ts est `ts_consigne` (c'est lui qui dit LAQUELLE des entrées au même seq est
 * visée), et seulement si elle est écrite après elle. Le doublon de seq (TF-1367) dont chaque
 * occurrence après la première est ainsi couverte s'imprime [RECTIFIÉ], en tête.
 *
 * LE SAUT DE SEQ EN AVANT A SES DEUX VOIES (TF-2494, 14/11/2026). Le message de R-42 d'
 * `oracle-conformite-projet` du pilot prescrit `type: anteriorite_ledger` et couvre, depuis l'héritage
 * 1.63.0 (a86f397d), un saut en avant — des seq jamais écrits — par deux voies ; ce script refusait
 * le type (vocabulaire) et fait encore FAIL un saut que R-42 couvre : le même fichier était intègre
 * pour un juge et rompu pour l'autre (le défaut de TF-1425). Mesuré le 13/11/2026 chez un produit :
 * 15 sauts sans entrée qui les couvre. Désormais `verify` couvre un saut en avant par :
 *   (1) une `rectification_horodatage` ULTÉRIEURE dont `entrees[]` nomme le seq qui SUIT la lacune,
 *       avec son `ts_consigne` EXACT (mêmes bornes que la collision : quatre champs dus, seq antérieur
 *       à la rectification, écrite après l'entrée visée) ;
 *   (2) une `anteriorite_ledger` portant `avant` (date ISO lisible) et `cause` (≥ 20 caractères),
 *       qui couvre tout saut dont l'entrée qui suit la lacune est horodatée STRICTEMENT avant `avant`
 *       (la plus récente des déclarations valides fait foi, comme R-42).
 * Le saut s'IMPRIME toujours (`[RECTIFIÉ]` ou `[ANTÉRIORITÉ]`, « saut en avant ») : il cesse de bloquer,
 * il ne disparaît pas. Un saut que ni l'une ni l'autre ne couvre reste FAIL. TF-2540 (14/11/2026) : l'antériorité
 * couvre AUSSI une collision de seq et un recul d'horodatage dont l'entrée est horodatée STRICTEMENT avant `avant`
 * (`[ANTÉRIORITÉ]`, comptée au verdict), l'étendue que R-42 lui donnait déjà : après une rectification qui nomme
 * l'entrée avec son `ts_consigne` exact, avant une rectification dont le `ts_consigne` diverge (qui ne couvre rien),
 * et jamais pour un `ts` illisible, sans instant à comparer. Le même fichier rend le même verdict aux deux juges.
 * À l'écriture, `anteriorite_ledger` est au vocabulaire et refusée sans `avant` lisible ou sans `cause`
 * de 20 caractères : une déclaration que R-42 ignorerait resterait pour toujours dans un journal en
 * ajout seul (même garde que TF-1722).
 *
 * LE DOUBLON (TF-2424, 14/11/2026). Un script de clôture rejoué a écrit 6 entrées en double chez un produit
 * (seq 835 à 840 pour 830 à 834) : ni `append` ni `verify` ne bronchaient, et aucun type ne désignait un doublon.
 * Désormais (a) `append` et `consigner` REFUSENT une entrée identique, hors `seq`, `ts` et marque hors run, à une
 * autre du MÊME run (le run du dernier `run_open`) : le message nomme le seq de la première, et dit comment écrire
 * un second événement réellement distinct (un champ de contenu : `ts_action`, `detail`…) ; (b) le type
 * `rectification_doublon` (`entrees: [{seq, doublon_de, cause}]`) DÉSIGNE un doublon déjà écrit, par ajout : refusé
 * à l'écriture si la copie et sa source ne sont pas identiques (une entrée distincte ne se désigne pas comme
 * doublon) ; (c) `verify` imprime `[RECTIFIÉ] doublon` pour un doublon désigné (déclaration vérifiée : une
 * déclaration fausse est un écart bloquant) et `[DOUBLON]`, non bloquant, pour un doublon non désigné (on ne met
 * jamais en échec un ledger existant, comme pour le vocabulaire).
 *
 * S90 RAPPELÉE À L'ÉCRITURE (TF-2425, 14/11/2026). Un compte consigné d'après un affichage borné (12 demandes,
 * 7 autorisées, 12 jobs ; 11, 6 et 6 au recompte par requête) échappait à S90 d'`oracle-synthese` du pilot, qui ne
 * juge que la restitution. `append` rejoue la détection de S90 sur le texte de l'entrée et RAPPELLE (`[RAPPEL S90]`,
 * chaque chiffre nommé avec son champ) sans refuser ni changer le code de sortie : S90 est avertissante. Ne sont
 * pas accusés un texte qui dit le chiffre non mesuré, estimé ou projeté, ni un texte qui nomme sa provenance
 * (recompté, mesuré, relevé, requête, wc, git, rapporté). `consigner` ne rappelle rien : ses verdicts viennent
 * des sorties d'oracles, pas d'un compte écrit par l'agent. NON JUGÉ : que le chiffre soit le bon, un champ
 * numérique (`demandes: 12`), un chiffre écrit en lettres.
 *
 * DES INSTANTS, JAMAIS DES CHAÎNES (TF-1422, 28/09/2026). Le fait mesuré chez un produit le
 * 25/09 : `append` horodate en UTC (`toISOString`, suffixe `Z`), et ce produit écrit l'heure de
 * Paris avec son décalage (`+02:00`) ; la monotonie se jugeait en comparant des CHAÎNES. Sur deux
 * ledgers de deux entrées, une entrée écrite 15 minutes APRÈS la précédente, mais en UTC, était
 * accusée de recul (exit 1) ; une entrée écrite 15 minutes AVANT, avec décalage, passait (exit 0).
 * `verify` et la garde d'`append` comparent donc des INSTANTS (`Date.parse`) ; le texte écrit reste
 * celui qu'on imprime. Un `ts` dont on ne tire aucun instant (absent, ou illisible) est NOMMÉ comme
 * écart, lui qui échappait à tout jugement d'ordre, et `append` refuse d'en écrire un. Un `ts`
 * illisible se rectifie comme un recul (`ts_consigne` le cite tel qu'il est écrit) ; un `ts` absent
 * ne se cite pas, il reste FAIL. Limite dite : un `ts` sans fuseau est lu à l'heure locale du poste
 * qui vérifie ; aucun des 1 581 horodatages des 12 ledgers du parc relevés le 28/09 n'a cette forme
 * (1 439 en UTC, 142 avec décalage).
 *
 * SURNOMBRE ET ENTRÉE SANS CONTENU (TF-1366, 21/09/2026). Fait mesuré chez un produit (21/09) :
 * un script de journal réécrit par le produit ignorait tout argument sans « -- », onze entrées
 * écrites réduites à `{seq, ts, type}`, citées ensuite comme preuves dans 7 restitutions. Ce
 * script-ci n'a pas ce défaut d'analyse (corps JSON), mais il en gardait trois voisins :
 *   (a) tout argument NON RECONNU après <ledger.jsonl> est REFUSÉ (sortie 1, l'argument est
 *       NOMMÉ, l'usage est redonné) — jamais silencieusement ignoré (voir Usage ci-dessus) ;
 *   (b) `append` REFUSE à l'écriture une entrée sans `type`, ou réduite à son seul `type` (et un
 *       `ts` éventuel) : une entrée sans contenu reste pour toujours dans un journal en ajout
 *       seul, et se lit ensuite comme une preuve ;
 *   (c) `append` REFUSE aussi une entrée d'un type contraint (table des champs dus, PAR VERSION
 *       de schéma — voir CHAMPS_DUS_PAR_VERSION) à laquelle manque un champ dû, dès que le
 *       journal a déclaré un schéma à son `run_open` — jusqu'ici seul `verify` le voyait, après
 *       coup ;
 *   (d) l'écho `[OK] entrée N ajoutée` NOMME désormais le type et les champs écrits, pour se
 *       relire depuis la seule sortie de la commande ;
 *   (e) `verify` signale, lui, les entrées SANS CONTENU déjà écrites par un AUTRE outil ou avant
 *       ce correctif : ligne `[SANS CONTENU]` non bloquante, avec le compte, sous un schéma
 *       absent ou `1.0` — FAIL sous `1.1` (ci-dessous) — on ne met jamais en échec un journal
 *       existant (antériorité déclarée, ci-dessus).
 *
 * DEUX ÉCRIVAINS, UN MÊME SEQ (TF-1367, 21/09/2026). `append` verrouille déjà l'écriture
 * (`<ledger>.lock`) : deux appels concurrents de CE script reçoivent deux seq distincts (prouvé
 * par le self-test). Le fait qui reste, mesuré chez un produit dont le script de journal n'avait
 * pas ce verrou commun : deux sessions simultanées ont écrit le même numéro de seq à quatre
 * reprises, noyé dans 57 ruptures anciennes par le seul message générique d'append-only rompu.
 * `verify` NOMME désormais un seq porté par plusieurs entrées (« seq N porté par K entrées,
 * lignes a, b — deux écrivains sans verrou commun »), EN TÊTE des écarts, distinct de toute
 * autre rupture.
 *
 * R-61 bis À L'ÉCRITURE D'UN run_close « PRÊT » (TF-2152, 05/11/2026). `append` d'un `run_close` de statut
 * `pret_*` ou `en_production` rejoue `oracle-conformite-projet --declarer-pret` du pilot avant d'écrire et
 * REFUSE sur FAIL (avertissement jusqu'au 18/11/2026 inclus, FAIL dès le 19/11/2026, lu à l'horloge ;
 * `LEDGER_AUJOURDHUI=AAAA-MM-JJ` fixe le jour pour la recette ; `FORGE_ORACLE_CONFORMITE_PROJET` désigne
 * l'oracle). Oracle introuvable ou ledger hors d'un dossier `forge/` : écrit, et `[NON VÉRIFIÉ]` le dit.
 *
 * VOCABULAIRE DES TYPES, REMPLACEMENT, JOURNAL HORS RUN (TF-2245, 06/11/2026). `append` et `consigner` reprennent
 * ce que `gabarits/ledger.py` du pilot tenait seul : (a) un type hors du vocabulaire du CONTRAT-INTERFACE.md §3 est
 * REFUSÉ à l'écriture (le message nomme le vocabulaire) et seulement DÉCLARÉ par `verify` (`[DÉCLARÉ]`, non bloquant :
 * 1 444 entrées sur 7 243 des ledgers du parc sont hors vocabulaire, et on ne réécrit pas un ledger) ; (b) `remplace` vide,
 * `artefacts_remplaces` sans `remplace` ou de forme fausse sont REFUSÉS, `remplace` sans `artefacts_remplaces` est écrit
 * puis signalé `[À PORTER]` et déclaré par `verify` (`secret_range`, dont `remplace` est un booléen, est hors contrôle) ;
 * (c) le journal hors run `forge/hors-run.jsonl` (TF-2223) ne s'ouvre pas par `run_open`, ne porte que `retour`,
 * `question_humain`, `reponse_humain` et `demande_humain`, marque chaque entrée `hors_run: true`, et `verify` ne lui
 * reproche pas l'absence de `run_open`.
 *
 * RECTIFICATION DES FORGES MOBILISÉES (TF-1722, 15/10/2026). Une entrée `rectification_forges_mobilisees`
 * (TF-1715 du pilot) sans `forges_mobilisees` non vide ou sans `cause` est refusée à l'écriture, quel
 * que soit le schéma : le juge de l'enclenchement l'ignorerait (constante CHAMPS_RECTIFICATION_FORGES).
 *
 * PARTIES MOBILISÉES (TF-1841 du pilot, 17/10/2026). `parties_mobilisees: { forge: [skills] }`,
 * facultatif sur `run_open` et `rectification_forges_mobilisees`, borne la promesse d'une forge-outil
 * au juge de l'enclenchement ; présent et mal formé, il est refusé à l'écriture, quel que soit le
 * schéma (constante CHAMP_PARTIES).
 *
 * SCHÉMA 1.1 — FORGES MOBILISÉES (décision humaine D-18 (a), 26/09/2026). Sous 1.1, `run_open`
 * doit porter `forges_mobilisees` (table CHAMPS_DUS_PAR_VERSION ci-dessous) — la forme que lit
 * `oracle-enclenchement.mjs` du pilot. Les champs dus sont désormais PAR VERSION : un journal qui
 * déclare `1.0` reste jugé selon SES règles, pour toujours — une version ne durcit jamais un
 * journal qui en a déclaré une antérieure, elle ne s'applique qu'à qui la déclare.
 *
 * VERSION SERVIE — DÉCISION HUMAINE D-1 (a) DU PILOT, 25/09/2026. Le schéma d'invocation portait
 * `modele: haiku | sonnet | opus | fable`, la FAMILLE du routage, jamais la version : une escalade
 * mesurée sur Opus 5 et une autre sur Opus 5.5 se confondaient, et Fable 5.1 comme Opus 5.5 sont
 * entrées en service sans que le ledger le montre. `append` relève donc `modele_version` quand
 * l'entrée (ou son objet `invocation`) porte une famille sans version : la dernière réponse de
 * cette famille dans les transcripts de LA session courante (`CLAUDE_CODE_SESSION_ID`, fil
 * principal et sous-agents), lue par la fin. Faute de transcript lisible, l'entrée est écrite
 * sans, et c'est dit `[NON VÉRIFIÉ]` : un journal ne refuse pas un fait parce qu'il lui manque une
 * précision. `FORGE_TRANSCRIPTS_RACINE` remplace les racines de Claude Code, pour le banc.
 *
 * --fichier : le passage du payload JSON en argument shell est pénible sous PowerShell 5.1
 * (échappement des guillemets, longueur de ligne). --fichier lit le même JSON depuis un
 * fichier — mêmes validations, même verrou, même format de sortie (RA-1, 05/08/2026).
 *
 * Verrou d'écriture (append) : fichier `<ledger>.lock` adjacent, créé en exclusif (flag "wx")
 * pour toute la section lecture-du-dernier-seq → écriture. Zéro dépendance : retry borné avec
 * délai (Atomics.wait, sommeil synchrone) puis erreur explicite si le verrou reste pris.
 */
import { readFileSync, appendFileSync, existsSync, openSync, closeSync, unlinkSync, readdirSync, statSync, readSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const rest = process.argv.slice(2);
const [cmd, file] = rest;
//: Tout ce qui suit <ledger> — la forme reconnue dépend de la commande (append : un payload
//: JSON, ou --fichier <chemin> ; verify : rien). TF-1366 (a), 21/09/2026 : le fait mesuré chez
//: un produit — un script de journal réécrit ignorait tout argument sans « -- », onze entrées
//: écrites amputées de ce qu'il ignorait, citées ensuite comme preuves dans 7 restitutions. Ici,
//: un argument NON RECONNU est REFUSÉ (sortie 1, nommé), jamais silencieusement ignoré.
//: TF-2549 (14/11/2026) : `--essai` est un DRAPEAU de `append` et de `consigner`, retiré d'ici avant la lecture des autres arguments
//: (pour `consigner`, seulement avant `--` : ce qui suit est la commande du lanceur, transmise telle quelle). Un second `--essai`
//: reste un argument non reconnu.
const argsBruts = rest.slice(2);
const finOptions = cmd === "consigner" && argsBruts.includes("--") ? argsBruts.indexOf("--") : argsBruts.length;
const iEssai = cmd === "append" || cmd === "consigner" ? argsBruts.slice(0, finOptions).indexOf("--essai") : -1;
const essai = iEssai >= 0;
const argsRestants = essai ? [...argsBruts.slice(0, iEssai), ...argsBruts.slice(iEssai + 1)] : argsBruts;
const USAGE_APPEND = "usage : append <ledger.jsonl> ('<json>' | --fichier <payload.json>) [--essai]";
const USAGE_VERIFY = "usage : verify <ledger.jsonl>";
// ---- VERSION SERVIE (D-1 (a) du pilot, 25/09/2026) -------------------------------------------
const FAMILLES_MODELE = ["haiku", "sonnet", "opus", "fable"];
const FIN_LUE_TRANSCRIPT = 512 * 1024;
function normaliserModele(id) {
  if (typeof id !== "string") return null;
  const s = id.trim().toLowerCase().replace(/\[[^\]]*\]$/, "").replace(/^anthropic\./, "").replace(/[-@]20\d{6}$/, "");
  return /^claude-[a-z0-9][a-z0-9.-]*$/.test(s) ? s : null;
}
function racinesDesTranscripts() {
  if (process.env.FORGE_TRANSCRIPTS_RACINE) return [process.env.FORGE_TRANSCRIPTS_RACINE];
  const racines = new Set();
  if (process.env.CLAUDE_CONFIG_DIR) racines.add(process.env.CLAUDE_CONFIG_DIR);
  try {
    for (const e of readdirSync(homedir(), { withFileTypes: true }))
      if (e.isDirectory() && /^\.claude/.test(e.name)) racines.add(join(homedir(), e.name));
  } catch { /* pas de dossier personnel lisible : aucune racine */ }
  return [...racines];
}
/** Les transcripts de LA session : son fil principal et ceux de ses sous-agents. */
function transcriptsDeLaSession(sid) {
  const fichiers = [];
  for (const racine of racinesDesTranscripts()) {
    const projets = join(racine, "projects");
    let dossiers;
    try { dossiers = readdirSync(projets, { withFileTypes: true }); } catch { continue; }
    for (const d of dossiers) {
      if (!d.isDirectory()) continue;
      const principal = join(projets, d.name, `${sid}.jsonl`);
      if (existsSync(principal)) fichiers.push(principal);
      const sous = join(projets, d.name, sid, "subagents");
      try { for (const f of readdirSync(sous)) if (f.endsWith(".jsonl")) fichiers.push(join(sous, f)); } catch { /* aucun sous-agent */ }
    }
  }
  return fichiers;
}
/** Dernière version servie à la session pour une famille, lue par la fin des transcripts ; null sinon. */
function versionServie(famille, sid = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!sid || !FAMILLES_MODELE.includes(famille)) return null;
  let meilleure = null;
  for (const f of transcriptsDeLaSession(sid)) {
    let st;
    try { st = statSync(f); } catch { continue; }
    const n = Math.min(FIN_LUE_TRANSCRIPT, st.size);
    if (!n) continue;
    const tampon = Buffer.alloc(n);
    let fd;
    try { fd = openSync(f, "r"); readSync(fd, tampon, 0, n, st.size - n); } catch { continue; } finally { if (fd !== undefined) closeSync(fd); }
    const lignes = tampon.toString("utf8").split("\n");
    for (let i = lignes.length - 1; i >= 0; i--) {
      if (!lignes[i].includes('"type":"assistant"')) continue;
      const m = /"model":"([^"]+)"/.exec(lignes[i]);
      const id = m ? normaliserModele(m[1]) : null;
      if (!id || !id.startsWith(`claude-${famille}-`)) continue;
      if (!meilleure || st.mtimeMs > meilleure.mtime || (st.mtimeMs === meilleure.mtime && i > meilleure.i)) meilleure = { id, mtime: st.mtimeMs, i };
      break;
    }
  }
  return meilleure ? meilleure.id : null;
}
/** Complète `modele_version` d'une entrée (ou de son objet `invocation`) qui porte une famille sans version. */
function completerVersion(obj, annonces) {
  const cibles = [obj, obj && typeof obj.invocation === "object" && !Array.isArray(obj.invocation) ? obj.invocation : null].filter(Boolean);
  for (const c of cibles) {
    if (!FAMILLES_MODELE.includes(c.modele) || c.modele_version) continue;
    const v = versionServie(c.modele);
    if (v) {
      c.modele_version = v;
      annonces.push(`[VERSION] modele_version relevée dans le transcript de la session : ${v} (famille ${c.modele})`);
    } else {
      annonces.push(`[NON VÉRIFIÉ] modele_version non relevée pour la famille ${c.modele} : aucun transcript de cette session ` +
        `n'en porte de réponse (CLAUDE_CODE_SESSION_ID ${process.env.CLAUDE_CODE_SESSION_ID ? "présent" : "absent"}) ; l'entrée est écrite sans`);
    }
  }
}

//: Version du schéma de payload. Déclarée par `run_open` (`schema_ledger`), elle dit sous
//: quelle forme le ledger a été écrit — comme l'empreinte de règles d'un journal d'oracles.
//: TF-1366/D-18 (a), 26/09/2026 — la version COURANTE ; une version antérieure DÉCLARÉE
//: (`1.0`) reste jugée selon SES propres règles, pour toujours (table PAR VERSION ci-dessous).
const SCHEMA_LEDGER = "1.1";

//: Les champs dus des DEUX types nés de TF-0385 (19/08) et TF-1204 (22/09) — inchangés par le
//: passage à 1.1, portés tels quels dans chaque version de CHAMPS_DUS_PAR_VERSION ci-dessous.
const CHAMPS_DUS_1_0 = {
  oracles_verdict: [
    ["oracle", "le NOM de l oracle qui a rendu le verdict — sans lui, aucun juge ne peut savoir ce qui a tourne"],
    ["verdict", "le VERDICT rendu (PASS | FAIL | SKIP | NA | PARTIEL) — un releve sans verdict n est pas un verdict"],
  ],
  //: TF-1204, decision humaine D-25 (a) du 22/09/2026 — la table s etend, et c est bien une
  //: decision, pas un reflexe. LE FAIT : le 13/09 a 08:55 UTC, chez un produit, un appel lance
  //: pour LIRE l usage du journal a ecrit une entree de cloture d etape SANS etape ni resume.
  //: Le contrat d interface §3 nomme ces deux champs ; rien ne les exigeait a l ecriture, et le
  //: journal etant en ajout seul, l entree vide y reste pour toujours. Une regle ecrite que
  //: personne ne joue n est pas une regle.
  etape_close: [
    ["etape", "l ETAPE qui se ferme — une cloture qui ne dit pas ce qu elle ferme ne se relit pas"],
    ["resume", "ce qui a ete fait a cette etape — sans lui, la cloture est un evenement sans contenu"],
  ],
};

//: TF-1401 (constat du 24/09/2026, corrigé le 12/10/2026) — UNE RÈGLE NE JUGE PAS CE QUI LUI
//: EST ANTÉRIEUR. Les champs dus de `etape_close` sont nés le 22/09/2026 (6af56b8) DANS la table
//: `1.0` : sans borne, ils jugeaient les clôtures écrites avant eux, et un journal `1.0` ouvert
//: plus tôt ne pouvait plus tenir « ledger vérifié » sans réécrire son histoire. Mesuré le 12/10
//: sur les 7 ledgers du parc : 2 rendaient FAIL pour cette seule raison (10 et 2 clôtures, du
//: 05/09 au 11/09). Une entrée d'un type listé ici, horodatée AVANT la naissance de sa règle,
//: n'est pas jugée sur sa forme : elle se COMPTE à voix haute (`[ANTÉRIEUR]`), jamais en silence.
const NAISSANCE_CHAMPS_DUS = { etape_close: "2026-09-22T00:00:00Z" };

//: TF-1366/D-18 (a), decision humaine du 26/09/2026 — sous 1.1, `run_open` doit porter
//: `forges_mobilisees`. C'est la forme que lit `oracle-enclenchement.mjs` du pilot
//: (`forgesMobilisees`/`forgeCanonique`) : nom complet (`digit-ai-forge-design`) ou court
//: (`design`), une annotation apres le nom est admise. Ce validateur ne juge que la FORME
//: (tableau non vide, elements non vides) — jamais que les noms designent des forges qui
//: existent reellement : ce jugement-la appartient au juge de l enclenchement, pas a l ecriture.
function validerForgesMobilisees(valeur) {
  if (!Array.isArray(valeur)) return `doit etre un TABLEAU de chaines (recu ${typeof valeur})`;
  const invalides = valeur.filter((v) => typeof v !== "string" || !v.trim());
  if (invalides.length) return `contient ${invalides.length} element(s) non-chaine ou vide(s) sur ${valeur.length}`;
  return null;
}

//: Les champs dus, PAR VERSION DE SCHÉMA (TF-1366/D-18, 26/09/2026). Un journal qui déclare
//: `1.0` reste jugé selon les règles `1.0` SANS RIEN DE NEUF : une version ne durcit jamais un
//: journal qui a déclaré une version antérieure, elle ne s'applique qu'à qui la déclare — sur
//: le même modèle que l'antériorité déclarée (ci-dessus), un cran plus fin (par version, pas
//: seulement par présence/absence de schéma). Chaque règle est `[champ, motif]` pour une simple
//: présence, ou `[champ, motif, validateur]` quand la présence ne suffit pas à juger la forme
//: (ex. tableau non vide plutôt que simple chaîne non vide).
const CHAMPS_DUS_PAR_VERSION = {
  "1.0": CHAMPS_DUS_1_0,
  "1.1": {
    ...CHAMPS_DUS_1_0,
    run_open: [
      ["forges_mobilisees", "la LISTE DES FORGES mobilisees par ce run — sans elle, le juge de l enclenchement ne sait pas ce qui devait tourner", validerForgesMobilisees],
    ],
  },
};

//: Type d'entrée qui déclare des écarts d'horodatage antérieurs, et les champs dus de chaque
//: déclaration. Une déclaration incomplète ne couvre rien : ces quatre champs sont ce qui
//: rend la rectification vérifiable (le seq visé, le ts fautif tel qu'il est écrit, l'heure
//: réelle estimée, la cause). Sans eux, « rectification » serait un mot qui éteint un contrôle.
const TYPE_RECTIFICATION = "rectification_horodatage";
const CHAMPS_RECTIFICATION = ["seq", "ts_consigne", "ts_reel_estime", "cause"];

//: TF-1722 (15/10/2026) — la rectification PAR AJOUT d'une déclaration fausse de `forges_mobilisees`
//: (TF-1715, CONTRAT-INTERFACE.md §3 du pilot) porte la liste corrigée ENTIÈRE et sa `cause`. Le juge
//: du pilot (`oracle-enclenchement.mjs`, `rectificationsForges`) IGNORE en le disant une rectification
//: sans liste ou sans cause ; `append` l'acceptait comme un type libre, et l'entrée inopérante restait
//: pour toujours dans le journal. Refusée À L'ÉCRITURE, QUEL QUE SOIT LE SCHÉMA déclaré, comme les
//: quatre champs dus d'une `rectification_horodatage` : un type né le 15/10/2026 n'a aucun existant à
//: ménager, et seule une entrée NEUVE est jugée ici. La forme exigée est celle de `run_open` sous 1.1
//: (tableau de chaînes non vides) : plus stricte que le juge, qui accepte aussi une chaîne à virgules.
const TYPE_RECTIFICATION_FORGES = "rectification_forges_mobilisees";
const CHAMPS_RECTIFICATION_FORGES = [
  ["forges_mobilisees", "la liste corrigée ENTIÈRE des forges mobilisées — sans elle, le juge de l enclenchement ignore la rectification", validerForgesMobilisees],
  ["cause", "pourquoi la déclaration précédente était fausse — sans elle, le juge de l enclenchement ignore la rectification",
    (v) => (typeof v === "string" ? null : `doit etre une CHAINE (recu ${typeof v})`)],
];

//: TF-1841 du pilot (17/10/2026) — les PARTIES (skills) qu'un run mobilise d'une forge-outil :
//: `parties_mobilisees: { "agents": ["forge-agents"] }`, champ FACULTATIF de `run_open` et de
//: `rectification_forges_mobilisees`. Le juge de l'enclenchement du pilot borne la promesse de la
//: forge aux oracles de ces skills ; une forme qu'il ne sait pas lire, il l'ignore en le disant et
//: garde la promesse entière. Refusée À L'ÉCRITURE quand elle est présente et mal formée, quel que
//: soit le schéma (champ né le 17/10/2026, aucun existant à ménager) : une déclaration inopérante
//: resterait pour toujours dans un journal en ajout seul. Absente : rien n'est exigé.
const CHAMP_PARTIES = "parties_mobilisees";
const TYPES_PORTEURS_PARTIES = ["run_open", "rectification_forges_mobilisees"];
function validerPartiesMobilisees(valeur) {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) {
    return `doit etre un OBJET { forge: [parties] } (recu ${Array.isArray(valeur) ? "un tableau" : valeur === null ? "null" : typeof valeur})`;
  }
  const cles = Object.keys(valeur);
  if (!cles.length) return "est un objet VIDE — sans partie, omettre le champ (la forge garde sa promesse entiere)";
  const fautes = [];
  for (const cle of cles) {
    const v = valeur[cle];
    if (!cle.trim()) fautes.push("une cle vide");
    else if (!Array.isArray(v) || !v.length) fautes.push(`« ${cle} » : doit etre un tableau NON VIDE de noms de skills`);
    else if (v.some((x) => typeof x !== "string" || !x.trim())) fautes.push(`« ${cle} » : element non-chaine ou vide`);
  }
  return fautes.length ? fautes.join(" ; ") : null;
}

//: TF-1319, D-5 (b) du 17/10/2026 — la QUALIFICATION d'un refus du juge d'enclenchement, consignée
//: par le run à sa clôture : `fonde` (un contrôle dû n'a pas tourné ou n'a pas été consigné) ou
//: `a_tort` (le run était complet, bloquer sa clôture aurait été une erreur), avec sa `cause`. C'est
//: l'entrée que compte `oracles/mesure-refus-enclenchement.mjs` du pilot pour mesurer les refus à
//: tort avant tout passage en bloquant. Sans valeur reconnue ou sans cause, la mesure l'ignorerait :
//: refusée À L'ÉCRITURE, quel que soit le schéma, comme une rectification de forges (TF-1722).
const TYPE_QUALIFICATION_ENCLENCHEMENT = "qualification_enclenchement";
const CHAMPS_QUALIFICATION_ENCLENCHEMENT = [
  ["qualification", "`fonde` ou `a_tort` — sans elle, la mesure des refus à tort ne sait pas compter ce refus",
    (v) => (v === "fonde" || v === "a_tort" ? null : `doit valoir \`fonde\` ou \`a_tort\` (reçu ${JSON.stringify(v)})`)],
  ["cause", "pourquoi le refus est fondé ou à tort — une qualification sans cause ne se relit pas",
    (v) => (typeof v === "string" ? null : `doit etre une CHAINE (recu ${typeof v})`)],
];

//: TF-2494 (14/11/2026) — l'ANTÉRIORITÉ BORNÉE que le message de R-42 du pilot prescrit (TF-1203) : `avant` (date ISO) et
//: `cause` (≥ 20 caractères, comme R-42 la lit). Une déclaration sans l'un ou l'autre est ignorée par R-42 : refusée À L'ÉCRITURE,
//: quel que soit le schéma, comme la rectification de forges (TF-1722) — elle resterait pour toujours dans un journal en ajout seul.
const TYPE_ANTERIORITE = "anteriorite_ledger";
const CAUSE_ANTERIORITE_MIN = 20;
const CHAMPS_ANTERIORITE = [
  ["avant", "la DATE ISO avant laquelle les écarts sont déclarés antérieurs — sans elle, R-42 du pilot ignore la déclaration",
    (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? null : `doit etre une date ISO lisible (recu ${JSON.stringify(v)})`)],
  ["cause", `pourquoi ces écarts sont antérieurs (au moins ${CAUSE_ANTERIORITE_MIN} caracteres) — sans elle, R-42 du pilot ignore la déclaration`,
    (v) => (typeof v === "string" && v.trim().length >= CAUSE_ANTERIORITE_MIN ? null : `doit etre une CHAINE d'au moins ${CAUSE_ANTERIORITE_MIN} caracteres (recu ${JSON.stringify(v)})`)],
];

//: TF-2425 (14/11/2026) — LE RAPPEL DE S90 À L'ÉCRITURE. S90 d'`oracle-synthese` (pilot, D-100 (a)) veut qu'un chiffre — durée, coût, score,
//: volume, compte d'objets — se relève dans le tour ou se dise non mesuré ; elle ne juge que la restitution. Le fait : une session a consigné
//: « 12 demandes, 7 autorisées et 12 jobs » lus sur une liste tronquée et une liste de jobs bornée qui mêlait des jobs antérieurs ; le recompte
//: par requête donnait 11, 6 et 6, et l'entrée fausse est restée au ledger jusqu'à sa rectification. `append` rejoue donc la détection de S90
//: sur le TEXTE de l'entrée qu'il écrit et RAPPELLE, sans refuser (S90 est avertissante) : l'entrée est écrite, le rappel nomme chaque chiffre.
//: Les cinq natures et la liste des objets comptés sont celles de `lib-chiffres-releves.mjs` du pilot (recopiées : ce script n'importe rien
//: du pilot). Ce qui n'est pas accusé : un texte qui dit le chiffre non mesuré, estimé, projeté ou visé (DECLARE_NON_MESURE de S90) ou qui
//: nomme sa PROVENANCE (recompté, mesuré, relevé, requête, wc, git, à la source) — un compte qui dit d'où il vient se relit. NON JUGÉ : que le
//: chiffre soit le bon ; un chiffre en lettres ; un champ numérique (`demandes: 12`) ; ce que ce script ne connaît pas : « relevé dans le tour »
//: est un fait de la session (S90 le lit aux sorties d'outils du tour), le rappel ne peut que demander à l'agent de le vérifier.
const NOMBRE_S90 = String.raw`\d(?:[\d   ]*\d)?(?:[.,]\d+)?`;
const FIGURES_S90 = [
  ["durée", new RegExp(String.raw`(?<![\d.,:/-])(${NOMBRE_S90})\s*(?:minutes?|min\b|secondes?|heures?|jours?|semaines?)`, "giu")],
  ["coût", new RegExp(String.raw`(?<![\d.,:/-])(${NOMBRE_S90})\s*(?:\$|€|euros?\b|dollars?\b)`, "giu")],
  ["score", new RegExp(String.raw`(?<![\d.,:/-])(${NOMBRE_S90})\s*(?:sur\s*100\b|/\s*100\b|%)`, "giu")],
  ["volume", new RegExp(String.raw`(?<![\d.,:/-])(${NOMBRE_S90})\s*(?:jetons?\b|tokens?\b|Ko\b|Mo\b|Go\b)`, "gu")],
  ["compte", new RegExp(String.raw`(?<![\d.,:/-])(${NOMBRE_S90})\s+(?:fichiers?|lignes?|tests?|cas\b|commits?|sessions?|demandes?|refus\b|erreurs?|d[ée]fauts?|produits?|scripts?|contr[ôo]les?|entr[ée]es\b|items?\b|occurrences?)`, "giu")],
];
const DECLARE_NON_MESURE_S90 = /non mesur|non recompt|non v[ée]rifi|projet[ée]|estim|environ|hypoth|à mesurer|\bcible\b|objectif|attendue?s?\b|(?<![A-Za-zÀ-ÿ])vis[ée]e?s?(?![A-Za-zÀ-ÿ])|d'ici|plafond|seuil|au plus|au moins/i;
const PROVENANCE_DITE = /recompt|mesur[ée]|relev[ée]|requ[êe]te|count\(|\bwc\b|\bgit (?:diff|log|ls-files|rev-list)|à la source|rapport[ée]/i;
//: Les champs techniques dont le texte n'est pas une affirmation : la commande lancée, un chemin, un nom d'oracle, un horodatage.
const CHAMPS_HORS_S90 = new Set(["type", "ts", "commande", "cible", "chemin", "fichier", "journal", "oracle", "lanceur", "forge", "etape", "consigne_par", "ts_action", "ts_consigne", "ts_reel_estime", "avant"]);
/** Les chiffres qu'un texte d'entrée affirme sans dire qu'ils sont non mesurés ni d'où ils viennent : [{ nature, chiffre, champ }]. */
function chiffresAffirmes(valeur, champ = "", sortie = []) {
  if (typeof valeur === "string") {
    for (const ligne of valeur.split(/\r?\n/)) {
      if (DECLARE_NON_MESURE_S90.test(ligne) || PROVENANCE_DITE.test(ligne)) continue;
      // Le code en ligne (chemins, commandes) n'est pas un chiffre affirmé, comme pour S90.
      const lue = ligne.replace(/`[^`]*`/g, " ");
      for (const [nature, re] of FIGURES_S90) for (const m of lue.matchAll(re)) sortie.push({ nature, chiffre: m[0].trim(), champ });
    }
  } else if (Array.isArray(valeur)) valeur.forEach((v) => chiffresAffirmes(v, champ, sortie));
  else if (valeur && typeof valeur === "object") {
    for (const [k, v] of Object.entries(valeur)) if (!CHAMPS_HORS_S90.has(k)) chiffresAffirmes(v, k, sortie);
  }
  return sortie;
}

//: TF-2424 (14/11/2026) — LE DOUBLON : une entrée IDENTIQUE à une autre du même run, hors `seq`, `ts` et marque hors run. Le fait :
//: un script de clôture rejoué a écrit 6 entrées en double (seq 835 à 840 pour 830 à 834) chez un produit, et le ledger, en ajout
//: seul, les garde pour toujours. Refusé À L'ÉCRITURE (même cœur partagé par `append` et `consigner`) ; un doublon DÉJÀ écrit se
//: DÉSIGNE par une `rectification_doublon` ultérieure, jamais se supprime. Le run est celui du dernier `run_open` (un `run_open` ouvre
//: un run neuf) ; le journal hors run n'en a qu'un. `ts_action` ou tout champ de contenu distingue deux événements réellement distincts.
const TYPE_RECTIFICATION_DOUBLON = "rectification_doublon";
/** Sérialisation à clés triées, à tous les niveaux : deux entrées de même contenu ont la même chaîne, quel que soit l'ordre des champs. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
/** L'identité d'une entrée à ses numéro, horodatage et marque hors run près. */
function empreinteDEntree(e) {
  const { seq: _seq, ts: _ts, hors_run: _horsRun, ...corps } = e;
  return stable(corps);
}
/**
 * Le défaut d'une `rectification_doublon` à l'écriture, ou null. `entrees: [{seq, doublon_de, cause}]` : `seq` est le doublon,
 * `doublon_de` l'entrée dont il est la copie (donc antérieure), et les deux DOIVENT exister au ledger avec la même identité — une
 * déclaration qui désignerait comme doublon une entrée distincte effacerait une preuve au lieu de la désigner.
 * `empreintes` : seq -> [identités des entrées de ce seq] ; `seqPropre` : le seq que la rectification va recevoir.
 */
function problemeRectificationDoublon(obj, empreintes, seqPropre) {
  if (!Array.isArray(obj.entrees) || obj.entrees.length === 0) {
    return "`entrees` absent ou vide — une rectification qui ne désigne aucun doublon ne rectifie rien (les seq visés se DISENT : `entrees: [{seq, doublon_de, cause}]`)";
  }
  const fautes = [];
  obj.entrees.forEach((d, i) => {
    const ou = `entrees[${i}]`;
    if (!d || typeof d !== "object") { fautes.push(`${ou} : n'est pas un objet`); return; }
    const manquants = ["seq", "doublon_de", "cause"].filter((c) => d[c] === undefined || d[c] === null || String(d[c]).trim() === "");
    if (manquants.length) { fautes.push(`${ou} : champ(s) ${manquants.map((c) => `\`${c}\``).join(", ")} manquant(s)`); return; }
    if (!Number.isInteger(d.seq) || d.seq < 1 || !Number.isInteger(d.doublon_de) || d.doublon_de < 1) { fautes.push(`${ou} : \`seq\` et \`doublon_de\` doivent être des entiers ≥ 1`); return; }
    if (!(d.doublon_de < d.seq && d.seq < seqPropre)) { fautes.push(`${ou} : il faut doublon_de (${d.doublon_de}) < seq (${d.seq}) < la rectification elle-même (${seqPropre}) — le doublon suit sa source, et on ne se dédouane pas d'avance`); return; }
    const copie = empreintes.get(d.seq), source = empreintes.get(d.doublon_de);
    if (!copie || !source) { fautes.push(`${ou} : ${!copie ? `le seq ${d.seq}` : `le seq ${d.doublon_de}`} n'existe pas au ledger`); return; }
    if (!copie.some((e) => source.includes(e))) fautes.push(`${ou} : le seq ${d.seq} n'est PAS identique au seq ${d.doublon_de} (hors seq et ts) — une entrée distincte ne se désigne pas comme doublon`);
  });
  return fautes.length ? fautes.join(" ; ") : null;
}

//: TF-2245 (06/11/2026) — LE VOCABULAIRE DES TYPES, LE REMPLACEMENT ET LE JOURNAL HORS RUN : trois choses que
//: `gabarits/ledger.py` du pilot tenait déjà et que ce script ignorait, de sorte que les deux écrivains d'un même ledger
//: divergeaient (ledger.py refusait ce que ledger.mjs écrivait). Le vocabulaire est celui du CONTRAT-INTERFACE.md §3 du
//: pilot, tel que ledger.py le porte ; la recette le croise avec ce fichier quand le pilot est sur le poste.
//: À L'ÉCRITURE un type hors vocabulaire est refusé, le message nomme le vocabulaire ; À LA VÉRIFICATION il n'est que
//: DÉCLARÉ (`[DÉCLARÉ]`, non bloquant) : il désigne une entrée déjà écrite, et on ne réécrit jamais un ledger existant
//: (mesuré le 06/11/2026 sur les 35 ledgers du parc, 1 444 entrées sur 7 243 sont hors vocabulaire).
const TYPES_VOCABULAIRE = ["run_open", "etape_open", "invocation", "oracles_verdict", "escalade_modele",
  "question_humain", "reponse_humain", "etape_close", "retour", "relais_arme", "run_close",
  "rectification_versions_forges", "rectification_run_open", "rectification_horodatage",
  "rectification_forges_mobilisees", "go_publication", "conflit_regles", "demande_emise", "demande_recue",
  "deplacement_effectue", "deplacement_en_attente", "demande_humain", "qualification_enclenchement",
  "anteriorite_ledger", "rectification_doublon", "decision_retiree", "secret_range"];
//: TF-2223 du pilot — sans ledger de run, ces types s'écrivent au journal `forge/hors-run.jsonl` (même discipline de
//: `seq` et de `ts`, champ `hors_run: true`), pas au ledger du run, dont R-42 exige qu'il s'ouvre par `run_open`.
//: Le journal hors run se reconnaît à son NOM : c'est le chemin de doctrine, et il ne s'ouvre pas par `run_open`.
const TYPES_HORS_RUN = ["retour", "question_humain", "reponse_humain", "demande_humain"];
const NOM_JOURNAL_HORS_RUN = "hors-run.jsonl";
const estJournalHorsRun = (f) => basename(f) === NOM_JOURNAL_HORS_RUN;
//: TF-2206 du pilot — `remplace` nomme la ou les décisions remplacées, `artefacts_remplaces` ce qu'elles avaient créé et
//: ce que cela devient. `secret_range` est hors de ce contrôle : son champ `remplace` est un booléen (« la ligne existait déjà »).
const SORTS_REMPLACES = ["retire", "conserve", "a_decider"];
const REMEDE_REMPLACEMENT = `--remplace <D-N> --artefacts_remplaces [{"artefact": "…", "sort": "${SORTS_REMPLACES.join("|")}"}]`;
function problemeRemplacement(obj) {
  if (obj.type === "secret_range") return null;
  if ("remplace" in obj) {
    const r = Array.isArray(obj.remplace) ? obj.remplace : [obj.remplace];
    if (!r.length || !r.every((x) => typeof x === "string" && x.trim())) {
      return "`remplace` doit nommer la ou les décisions remplacées (« D-46 »), pas une valeur vide";
    }
  }
  if ("artefacts_remplaces" in obj) {
    if (!("remplace" in obj)) return "`artefacts_remplaces` sans `remplace` : de quelle décision ces artefacts sont-ils ?";
    const a = obj.artefacts_remplaces;
    if (!Array.isArray(a) || !a.length || !a.every((x) => x && typeof x === "object" && typeof x.artefact === "string" && x.artefact.trim() && SORTS_REMPLACES.includes(x.sort))) {
      return `\`artefacts_remplaces\` : liste non vide de {artefact, sort}, sort parmi ${SORTS_REMPLACES.join(", ")}`;
    }
  }
  return null;
}
//: L'oubli que l'écriture n'a pas refusé : `remplace` sans `artefacts_remplaces` (onze ressources, deux exigences et leurs
//: contrôles restés après le remplacement de D-46 par D-49, chez un produit).
const remplaceSansArtefacts = (e) => e.type !== "secret_range" && Boolean(e.remplace) && !e.artefacts_remplaces;

//: TF-2527 (14/11/2026) — `decision_retiree` : une décision posée qui est retirée, sans réponse ni décision de remplacement.
//: `oracles/lib-decisions.mjs` du pilot (`decisionsRetirees`, TF-2415) la lit comme une sortie de la décision, et ni `ledger.py` ni
//: ce script ne l'acceptaient : une retraite s'écrivait en `reponse_humain --decision D-M --remplace D-N`. Elle nomme la ou les
//: décisions retirées, au format « D-12 », dans `decision`, `decisions` ou `decisions_retirees` (chaîne ou liste), et sa `cause`
//: (20 caractères au moins) : une décision qui disparaît sans motif ne se relit pas. Même forme que `controler_retrait` de
//: `gabarits/ledger.py` du pilot ; refusée AVANT d'écrire, quel que soit le schéma.
const TYPE_DECISION_RETIREE = "decision_retiree";
const CHAMPS_DECISION_RETIREE = ["decision", "decisions", "decisions_retirees"];
const CAUSE_RETRAIT_MIN = 20;
function problemeDecisionRetiree(obj) {
  if (obj.type !== TYPE_DECISION_RETIREE) return null;
  const nommees = CHAMPS_DECISION_RETIREE.flatMap((c) => (obj[c] === undefined || obj[c] === null ? [] : [].concat(obj[c])));
  if (!nommees.length || !nommees.every((x) => typeof x === "string" && /^D-?\s*\d{1,4}$/i.test(x.trim()))) {
    return `\`${TYPE_DECISION_RETIREE}\` doit nommer la ou les décisions retirées au format « D-12 » (champ \`decision\`, \`decisions\` ou \`decisions_retirees\`, chaîne ou liste) : sans elle, \`lib-decisions\` du pilot ne sort rien`;
  }
  if (typeof obj.cause !== "string" || obj.cause.trim().length < CAUSE_RETRAIT_MIN) {
    return `\`${TYPE_DECISION_RETIREE}\` doit dire pourquoi : \`cause\` d'au moins ${CAUSE_RETRAIT_MIN} caractères (reçu ${JSON.stringify(obj.cause)}) — une décision retirée sans motif ne se relit pas`;
  }
  return null;
}

//: TF-1422 (28/09/2026) : l'INSTANT que désigne un `ts`, en millisecondes, ou NaN s'il n'en
//: désigne aucun (absent, vide, illisible). Deux écritures d'une même heure (`…T09:30:00+02:00`
//: et `…T07:30:00.000Z`) désignent le même instant ; comparées comme chaînes, elles s'ordonnaient
//: au hasard du fuseau, dans les deux sens.
function instant(ts) { return typeof ts === "string" && ts.trim() ? Date.parse(ts) : NaN; }

function fail(msg) { console.error(`[LEDGER FAIL] ${msg}`); process.exit(1); }
function fail_usage() { fail(USAGE_APPEND); }

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const LOCK_RETRIES = 100;
const LOCK_DELAY_MS = 50;

function acquireLock(lockFile) {
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      closeSync(openSync(lockFile, "wx"));
      return;
    } catch (e) {
      // Windows : une création/suppression concurrente du même fichier peut renvoyer EPERM,
      // EACCES ou EBUSY de façon transitoire (suppression en attente, scan antivirus) — même
      // sens qu'EEXIST : le verrou est disputé, on réessaie. Constaté au self-test (flaky).
      if (!["EEXIST", "EPERM", "EACCES", "EBUSY"].includes(e.code))
        fail(`verrou : erreur inattendue (${e.code || e.message})`);
      sleepSync(LOCK_DELAY_MS);
    }
  }
  fail(`verrou non obtenu après ${LOCK_RETRIES * LOCK_DELAY_MS}ms — un autre processus détient ${lockFile}`);
}

function releaseLock(lockFile) {
  try { unlinkSync(lockFile); } catch { /* déjà absent : rien à faire */ }
}

/**
 * Le cœur d'écriture, PARTAGÉ par `append` (une entrée) et `consigner` (un lot) — TF-1319,
 * 17/10/2026 : une seconde copie des gardes (seq, horodatage, champs dus) aurait divergé au premier
 * amendement, et `consigner` aurait pu écrire ce que `append` refuse. Sous UN verrou : lecture du
 * dernier seq, du maximum d'horodatage et du schéma actif, contrôle de CHAQUE entrée, puis UNE seule
 * écriture pour tout le lot — une entrée refusée n'en laisse écrire aucune (tout le lot ou rien).
 * Rend les seq attribués. Toute sortie en erreur libère le verrou puis appelle fail().
 *
 * `essai` (TF-2549, 14/11/2026) : MODE D'ESSAI. Tous les contrôles sont joués, rien n'est écrit — ni le journal, ni le verrou (un
 * essai ne prend pas le verrou et, surtout, ne libère jamais celui d'un autre processus). Les entrées qui seraient écrites se lisent
 * sur la propriété `lignes` du résultat ; leur `seq` est celui que prendrait l'écriture à cet instant, à titre indicatif.
 */
function ecrireSousVerrou(file, objs, essai = false) {
  const lockFile = `${file}.lock`;
  const horsRun = estJournalHorsRun(file);
  if (!essai) acquireLock(lockFile);
  // Note : process.exit() (dans fail()) ne déroule pas les blocs finally — toute sortie en
  // erreur pendant la section verrouillée doit donc libérer le verrou explicitement avant
  // d'appeler fail(), plutôt que de compter sur un try/finally autour de process.exit().
  let seq = 1;
  let schemaActif = null;
  const seqs = [];
  try {
    let tsMax = "", tsMaxMs = -Infinity;
    // TF-2424 : l'identité des entrées DU RUN COURANT (identité -> seq de la première), et celle de toutes (seq -> identités).
    let identitesDuRun = new Map();
    const identitesParSeq = new Map();
    const noterIdentite = (e, seqE) => {
      const id = empreinteDEntree(e);
      if (!identitesDuRun.has(id)) identitesDuRun.set(id, seqE);
      identitesParSeq.set(seqE, [...(identitesParSeq.get(seqE) || []), id]);
    };
    const fichierExiste = existsSync(file);
    if (fichierExiste) {
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0) {
        seq = JSON.parse(lines[lines.length - 1]).seq + 1;
        // Maximum courant, pas dernier ts : sur un fichier qui porte déjà un recul, se
        // comparer au dernier autoriserait à consigner sous une heure déjà atteinte.
        // TF-1422 : le maximum est un INSTANT ; le texte gardé est celui qu'on imprime.
        for (const l of lines) {
          const parsed = JSON.parse(l);
          const t = parsed.ts;
          const ms = instant(t);
          if (ms > tsMaxMs) { tsMaxMs = ms; tsMax = t; }
          if (parsed.type === "run_open") identitesDuRun = new Map(); // TF-2424 : un run_open ouvre un run neuf
          if (Number.isInteger(parsed.seq)) noterIdentite(parsed, parsed.seq);
          // Schéma ACTIF pour juger CETTE entrée (TF-1366 c) : celui du DERNIER run_open qui en
          // déclare un dans le fichier — même lecture que verify (schemaDeclare), au sens d'un
          // seul journal (un run de version ne change pas ce choix, pour rester simple).
          if (parsed.type === "run_open" && typeof parsed.schema_ledger === "string" && parsed.schema_ledger.trim()) {
            schemaActif = parsed.schema_ledger.trim();
          }
        }
      }
    } else if (!(horsRun && TYPES_HORS_RUN.includes(objs[0].type)) && objs[0].type !== "run_open") {
      // TF-2245 : un `retour` ou une décision sans run ouvert n'a pas à ouvrir un run pour s'écrire ; l'indication du journal
      // hors run évite de faire écrire un `run_open` factice (R-42 exige que le ledger du run s'ouvre par un vrai).
      throw new Error("première entrée d'un ledger : type run_open exigé" +
        (TYPES_HORS_RUN.includes(objs[0].type)
          ? ` — sans run ouvert, un \`${objs[0].type}\` s'écrit au journal hors run \`forge/${NOM_JOURNAL_HORS_RUN}\` (TF-2223, TF-2245), que le prochain lot de retours compile`
          : ""));
    }
    const maintenant = new Date().toISOString();
    const lignes = [];
    for (const obj of objs) {
      // TF-2245 : le vocabulaire des types du pilot (CONTRAT-INTERFACE.md §3) et le contrôle du remplacement, refusés AVANT
      // d'écrire : une entrée écrite ne se réécrit pas. Ce cœur est partagé par `append` et `consigner`.
      if (horsRun) {
        if (!TYPES_HORS_RUN.includes(obj.type)) {
          throw new Error(`type \`${obj.type}\` refusé dans le journal hors run (TF-2223) : il ne porte que ${TYPES_HORS_RUN.join(", ")} ; le reste s'écrit au ledger du run`);
        }
      } else if (!TYPES_VOCABULAIRE.includes(obj.type)) {
        throw new Error(`type inconnu : ${obj.type} — attendus ${[...TYPES_VOCABULAIRE].sort().join(", ")} (CONTRAT-INTERFACE.md §3 du pilot ; \`reponse_humain\` pour un arbitrage humain)`);
      }
      const defautRemplacement = problemeRemplacement(obj);
      if (defautRemplacement) throw new Error(`${defautRemplacement} (TF-2206, TF-2245) — rien n'est écrit`);
      const defautRetrait = problemeDecisionRetiree(obj);
      if (defautRetrait) throw new Error(`entrée refusée (type \`${obj.type}\`, quel que soit le schéma, TF-2527) — ${defautRetrait} — rien n'est écrit`);
      // L'entrée elle-même, si c'est un run_open qui déclare (ou redéclare) un schéma, DEVIENT le
      // schéma actif — pour SE juger elle-même (cas du tout premier run_open d'un ledger neuf).
      if (obj.type === "run_open" && typeof obj.schema_ledger === "string" && obj.schema_ledger.trim()) {
        schemaActif = obj.schema_ledger.trim();
      }
      // Un `ts` fourni par le payload écrasait l'horodatage machine SANS AUCUNE GARDE (spread
      // après ts) : append pouvait créer le recul que verify reproche. Il reste accepté quand il
      // ne remonte pas — un run peut avoir une raison de fixer l'heure de consignation — mais il
      // est alors ANNONCÉ, et refusé dès qu'il passe sous le maximum du fichier.
      const tsFourni = typeof obj.ts === "string" && obj.ts.trim() ? obj.ts.trim() : null;
      // TF-1422 : `append` n'écrit jamais le défaut que `verify` nomme — un `ts` dont on ne tire
      // aucun instant ne s'ordonne pas, et resterait pour toujours dans un journal en ajout seul.
      if (tsFourni && Number.isNaN(instant(tsFourni))) {
        throw new Error(
          `\`ts\` fourni par le payload (${tsFourni}) ILLISIBLE : aucun instant ne s'en tire ` +
          `(forme attendue : ISO 8601 avec fuseau, ex. 2026-09-25T09:30:00+02:00 ou ` +
          `2026-09-25T07:30:00.000Z) — refusé, aucune écriture. Sans \`ts\` dans le payload, ` +
          `l'outil pose l'horodatage machine (TF-1422).`);
      }
      if (tsFourni && tsMax && instant(tsFourni) < tsMaxMs) {
        throw new Error(
          `\`ts\` fourni par le payload (${tsFourni}) ANTÉRIEUR au maximum du ledger (${tsMax}) — ` +
          `refusé, aucune écriture. Le champ \`ts\` est l'heure de CONSIGNATION de l'entrée : ` +
          `elle ne remonte jamais, sinon l'append-only ne prouve plus aucun ordre. L'heure de ` +
          `l'ACTION rapportée (run de déploiement, mesure, décision passée) est une DONNÉE du ` +
          `payload : la consigner dans un champ dédié — ex. \`ts_action\` — et laisser \`ts\` à ` +
          `l'horodatage machine. Si l'entrée doit constater un recul DÉJÀ écrit, c'est une ` +
          `entrée \`${TYPE_RECTIFICATION}\`, jamais une réécriture.`);
      }
      // TF-1366 (c) : un type CONTRAINT (table des champs dus) auquel manque un champ dû est
      // refusé À L'ÉCRITURE, sous le schéma ACTIF — jusqu'ici seul `verify` le voyait, après coup.
      const champsDus = schemaActif && CHAMPS_DUS_PAR_VERSION[schemaActif];
      if (champsDus && champsDus[obj.type]) {
        const manquants = [];
        for (const [champ, pourquoi, valider] of champsDus[obj.type]) {
          const valeur = obj[champ];
          const estVide = valeur === undefined || valeur === null || String(valeur).trim() === "";
          if (estVide) { manquants.push(`\`${champ}\` ${champ in obj ? "vide" : "absent"} — ${pourquoi}`); continue; }
          if (valider) { const probleme = valider(valeur); if (probleme) manquants.push(`\`${champ}\` ${probleme} — ${pourquoi}`); }
        }
        if (manquants.length) {
          throw new Error(`entrée refusée (schéma ${schemaActif}, type \`${obj.type}\`) — champ(s) dû(s) :\n           ${manquants.join("\n           ")}`);
        }
      }
      // TF-2424 : une rectification de doublon désigne des doublons RÉELS, et une entrée identique à une autre du même run est refusée.
      if (obj.type === TYPE_RECTIFICATION_DOUBLON) {
        const defaut = problemeRectificationDoublon(obj, identitesParSeq, seq);
        if (defaut) throw new Error(`entrée refusée (type \`${obj.type}\`, quel que soit le schéma, TF-2424) — ${defaut}`);
      }
      const { ts: _tsPayload, ...corps } = obj;
      if (obj.type === "run_open") identitesDuRun = new Map(); // un run_open ouvre un run neuf : aucune entrée à répéter
      const identite = empreinteDEntree(corps);
      if (identitesDuRun.has(identite)) {
        throw new Error(`entrée refusée : IDENTIQUE (hors seq et ts) à l'entrée seq ${identitesDuRun.get(identite)} du même run — un script rejoué écrit deux fois la même ` +
          `entrée, et le ledger en ajout seul la garderait pour toujours (TF-2424 : 6 doublons, seq 835 à 840 pour 830 à 834). Si c'est bien un second événement, ` +
          `le distinguer par un champ de contenu (\`ts_action\`, \`detail\`…) ; un doublon DÉJÀ écrit se désigne par une entrée \`${TYPE_RECTIFICATION_DOUBLON}\` ` +
          `(\`entrees: [{seq, doublon_de, cause}]\`), jamais en réécrivant le ledger — rien n'est écrit`);
      }
      const tsEntree = tsFourni || maintenant;
      lignes.push(JSON.stringify(horsRun
        ? { seq, ts: tsEntree, type: corps.type, ...corps, hors_run: true }   // TF-2245 : la marque du journal hors run (ledger.py)
        : { seq, ts: tsEntree, ...corps }));
      noterIdentite(corps, seq);
      seqs.push(seq);
      seq++;
      const ms = instant(tsEntree);
      if (ms > tsMaxMs) { tsMaxMs = ms; tsMax = tsEntree; }
    }
    if (!essai) appendFileSync(file, lignes.join("\n") + "\n");
    seqs.lignes = lignes;
  } catch (e) {
    if (!essai) releaseLock(lockFile);
    fail(e.message);
  }
  if (!essai) releaseLock(lockFile);
  return seqs;
}

// ---- CONSIGNER UN VERDICT PAR ORACLE (TF-1319, décision humaine D-5 (b) du 17/10/2026) ---------
//: Les verdicts que la forme canonique admet (CONTRAT-INTERFACE.md §3 du pilot).
const VERDICTS_CANONIQUES = ["PASS", "FAIL", "SKIP", "NA", "PARTIEL"];
//: Les verdicts que les lanceurs du parc écrivent AUTREMENT, et leur forme canonique. Mesuré le
//: 17/10/2026 : le lanceur de conception écrit `NON_JUGE` (exit 2, « n'a pas pu juger »), le lanceur
//: général de quality-oracles `INCONCLUSIF`, le lanceur de design déclare des `SANS OBJET`. La
//: correspondance est ÉCRITE ici et le verdict d'origine est GARDÉ (`verdict_brut`) : jamais une
//: traduction muette. Un verdict absent des deux tables est REFUSÉ, avec le lot entier.
const VERDICTS_EQUIVALENTS = {
  NON_JUGE: "SKIP", "NON JUGE": "SKIP", "NON JUGÉ": "SKIP", NON_JUGÉ: "SKIP", INCONCLUSIF: "SKIP",
  INDETERMINE: "SKIP", "INDÉTERMINÉ": "SKIP", SANS_OBJET: "NA", "SANS OBJET": "NA", "N/A": "NA",
};
const USAGE_CONSIGNER = "usage : consigner <ledger.jsonl> (--rapport <rapport.json|-> | -- <commande> [args…]) " +
  "[--forge <nom>] [--cible <chemin>] [--etape <nom>] [--essai]";

/** Le texte d'un rapport lu en octets : UTF-8 (BOM retiré) ou UTF-16 à BOM (`>` de PowerShell 5.1). */
function texteDuRapport(octets) {
  if (octets.length >= 2 && octets[0] === 0xff && octets[1] === 0xfe) return octets.subarray(2).toString("utf16le");
  if (octets.length >= 2 && octets[0] === 0xfe && octets[1] === 0xff) {
    const inverse = Buffer.from(octets.subarray(2));
    inverse.swap16();
    return inverse.toString("utf16le");
  }
  return octets.toString("utf8").replace(/^﻿/, "");
}

const nonVideTexte = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Les verdicts d'un rapport, un par oracle. Trois formes reconnues, celles du parc au 17/10/2026 :
 *   · un LANCEUR : `{ oracles: [{ oracle, verdict, … }], runner|orchestrateur|lanceur?, cible|artefact? }`
 *     (run-oracles-design, run-oracles-conception) ;
 *   · un ORACLE : `{ oracle, verdict, … }` (contrat d'un oracle direct, `--contrat-runner` du design,
 *     le juge d'enclenchement du pilot) ;
 *   · une LISTE : `[{ oracle, verdict, … }]` ;
 *   · le rapport --json de FORGE-TESTS : `{ adaptateurs: [{ nom, pan, verdict }], … }`, un verdict PAR PAN,
 *     consigné sous l'oracle `forge-tests:<pan>` (TF-2153, 05/11/2026 — la graphie que R-61 bis du pilot lit).
 * Rend `{ lanceur, cible, elements, refus[] }` — `refus` nomme CHAQUE élément inconsignable.
 */
function verdictsDuRapport(rapport) {
  let elements = null, lanceur = null, cible = null;
  if (Array.isArray(rapport)) elements = rapport;
  else if (rapport && typeof rapport === "object") {
    lanceur = [rapport.runner, rapport.orchestrateur, rapport.lanceur].find(nonVideTexte) || null;
    cible = [rapport.cible, rapport.artefact].find(nonVideTexte) || null;
    if (Array.isArray(rapport.oracles)) elements = rapport.oracles;
    else if (nonVideTexte(rapport.oracle)) elements = [rapport];
    else if (Array.isArray(rapport.adaptateurs)) {
      // TF-2153 (05/11/2026) : le rapport --json de forge-tests (`forge_tests/noyau.py`) porte
      // `adaptateurs: [{ nom, pan, verdict }]`, un verdict PAR PAN. Il se consigne sous l'oracle
      // `forge-tests:<pan>` — la graphie que R-61 bis du pilot reconnaît (`nomServi`) ; le nom de
      // l'adaptateur est gardé (`adaptateur`). Le rapport n'étant pas un lanceur d'oracles, le
      // lanceur est `forge-tests`. Un élément sans `pan` reste inconsignable et se nomme comme tel.
      lanceur = lanceur || "forge-tests";
      elements = rapport.adaptateurs.map((a) => (!a || typeof a !== "object" ? a : {
        ...a,
        oracle: nonVideTexte(a.pan) ? `forge-tests:${a.pan.trim()}` : undefined,
        _champNom: "pan",
        ...(nonVideTexte(a.nom) ? { adaptateur: a.nom.trim() } : {}),
      }));
    }
  }
  if (!elements) {
    return { refus: ["forme de rapport non reconnue — attendu `{ oracles: [{ oracle, verdict }] }` (un lanceur), " +
      "`{ oracle, verdict }` (un oracle), `[{ oracle, verdict }]` (une liste) ou `{ adaptateurs: [{ nom, pan, verdict }] }` " +
      "(le rapport --json de forge-tests, un verdict par pan)"] };
  }
  if (!elements.length) {
    return { refus: ["le rapport ne porte AUCUN verdict (`oracles` vide) — rien n'a tourné, et un lot vide ne se consigne pas comme une preuve"] };
  }
  const refus = [];
  const sortie = elements.map((el, i) => {
    const ou = `élément ${i + 1}/${elements.length}`;
    if (!el || typeof el !== "object") { refus.push(`${ou} : n'est pas un objet`); return null; }
    if (!nonVideTexte(el.oracle)) {
      const champ = el._champNom || "oracle";
      refus.push(`${ou} : \`${champ}\` absent ou vide — sans le NOM de l'${champ === "pan" ? "adaptateur, le pan" : "oracle"}, aucun juge ne sait ce qui a tourné`);
      return null;
    }
    const brut = typeof el.verdict === "string" ? el.verdict.trim() : "";
    const haut = brut.toUpperCase();
    const verdict = VERDICTS_CANONIQUES.includes(haut) ? haut : VERDICTS_EQUIVALENTS[haut] || null;
    if (!verdict) {
      refus.push(`${ou} (${el.oracle}) : verdict ${brut ? `« ${brut} » inconnu` : "absent"} — attendu ${VERDICTS_CANONIQUES.join(" | ")}` +
        ` ou un équivalent écrit (${Object.keys(VERDICTS_EQUIVALENTS).join(", ")})`);
      return null;
    }
    const motif = [el.raison, el.motif, el.resume, el.message].find(nonVideTexte);
    return {
      oracle: el.oracle.trim(),
      verdict,
      ...(brut !== verdict ? { verdict_brut: brut } : {}),
      ...([el.cible, el.artefact].find(nonVideTexte) ? { cible: [el.cible, el.artefact].find(nonVideTexte) } : {}),
      ...(motif ? { motif: motif.length > 400 ? `${motif.slice(0, 400)}…` : motif } : {}),
      ...(Number.isInteger(el.exit) ? { exit_oracle: el.exit } : {}),
      ...(Array.isArray(el.findings) ? { constats: el.findings.length } : {}),
      ...(nonVideTexte(el.adaptateur) ? { adaptateur: el.adaptateur } : {}),
    };
  });
  return { lanceur, cible, elements: sortie, refus };
}

// ---- R-61 bis À L'ÉCRITURE D'UN run_close « PRÊT » (TF-2152, 05/11/2026) ----------------------------
//: TF-2124 du pilot a livré R-61 bis (`oracle-conformite-projet.mjs`) : un run qui se déclare prêt porte
//: au ledger de ce run un PASS de `parcours-personas` (forge-tests) ET d'`oracle-exploitabilite`
//: (forge-design). La règle se jouait quand ETAPES-RUN.md la fait rejouer, ou après coup ; ce script
//: écrivait le run_close sans la jouer. `append` d'un run_close de statut `pret_*` ou `en_production`
//: (le motif de l'oracle) rejoue donc l'oracle avec `--declarer-pret` AVANT d'écrire, et REFUSE sur FAIL.
//: La sévérité est celle de l'oracle, lue à l'horloge : AVERTISSEMENT (écrit, dit) jusqu'au 18/11/2026,
//: FAIL dès le 19/11/2026. `LEDGER_AUJOURDHUI=AAAA-MM-JJ` fixe le jour pour la recette (--aujourd-hui).
//: Ce qui ne peut pas se juger se DIT `[NON VÉRIFIÉ]` et n'empêche pas l'écriture : oracle du pilot
//: introuvable sur ce poste, ou ledger hors d'un dossier `forge/` (la racine du projet ne se déduit pas).
//: Le pilot rejoue la règle après coup sur le ledger ; un refus d'ici n'est donc jamais la seule porte.
const STATUT_PRET = /^(?:pret|en_production)/i;
const ICI = dirname(fileURLToPath(import.meta.url));
function oracleConformiteProjet(racineProjet) {
  if (process.env.FORGE_ORACLE_CONFORMITE_PROJET) return process.env.FORGE_ORACLE_CONFORMITE_PROJET; // désignation explicite : seule piste
  const relatif = join("digit-ai-factory", "oracles", "oracle-conformite-projet.mjs");
  const pistes = [
    process.env.FORGE_ROOT ? join(process.env.FORGE_ROOT, relatif) : null,
    join(dirname(racineProjet), relatif),                     // le produit et le pilot sont frères sous la racine
    join(ICI, "..", "..", "..", "..", "..", relatif),          // ce dépôt versionné, frère du pilot
  ].filter(Boolean);
  return pistes.find((p) => existsSync(p)) || pistes[0];
}
/** Rend les lignes à imprimer ; refuse (fail) sur FAIL de R-61 bis. */
function jouerR61bis(ledgerFile, obj) {
  const abs = resolve(ledgerFile);
  if (basename(dirname(abs)).toLowerCase() !== "forge") {
    return [`[NON VÉRIFIÉ] R-61 bis (TF-2152) : le ledger n'est pas dans un dossier \`forge/\` (${abs}) — la racine du projet ne se déduit pas, la règle n'a pas été jouée à l'écriture de ce run_close « ${obj.statut} »`];
  }
  const racine = dirname(dirname(abs));
  const oracle = oracleConformiteProjet(racine);
  if (!existsSync(oracle)) {
    return [`[NON VÉRIFIÉ] R-61 bis (TF-2152) : oracle-conformite-projet du pilot introuvable (${oracle}) — poser FORGE_ROOT ; la règle n'a pas été jouée à l'écriture de ce run_close « ${obj.statut} »`];
  }
  const args = [oracle, racine, "--regles", "R-61 bis", "--declarer-pret", ...(process.env.LEDGER_AUJOURDHUI ? ["--aujourd-hui", process.env.LEDGER_AUJOURDHUI] : [])];
  const r = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let sortie = null;
  try { sortie = JSON.parse(r.stdout); } catch { /* traité ci-dessous */ }
  const f = sortie && Array.isArray(sortie.findings) ? sortie.findings.find((x) => x.regle === "R-61 bis") : null;
  if (!f) {
    return [`[NON VÉRIFIÉ] R-61 bis (TF-2152) : l'oracle n'a rendu aucun constat R-61 bis (exit ${r.status}${sortie && sortie.message ? ` — ${sortie.message}` : ""}) — la règle n'a pas été jouée à l'écriture de ce run_close « ${obj.statut} »`];
  }
  if (f.statut === "FAIL") {
    fail(`entrée refusée (run_close « ${obj.statut} », R-61 bis, TF-2152) — ${f.message}. Aucune écriture : jouer les deux contrôles, les consigner par \`ledger.mjs consigner\`, puis réécrire le run_close.`);
  }
  if (f.statut === "SANS_OBJET") return [`[INFO] R-61 bis (TF-2152) sans objet : ${f.message}`];
  return /^AVERTISSEMENT/.test(f.message)
    ? [`[ATTENTION] R-61 bis (TF-2152) — ${f.message}`]
    : [`[OK] R-61 bis (TF-2152) : ${f.message}`];
}

if (cmd === "append") {
  if (!file) fail_usage();
  // Forme reconnue : UN payload JSON positionnel, OU --fichier <chemin> — jamais les deux,
  // jamais rien d'autre en surnombre (TF-1366 a) : l'argument en trop est NOMMÉ, pas absorbé.
  const reconnu = argsRestants[0] === "--fichier" ? argsRestants.slice(0, 2) : argsRestants.slice(0, 1);
  const enTrop = argsRestants.slice(reconnu.length);
  if (enTrop.length) fail(`argument(s) non reconnu(s) : ${enTrop.map((a) => `\`${a}\``).join(", ")} — ${USAGE_APPEND}`);
  let payload;
  if (reconnu[0] === "--fichier") {
    const payloadPath = reconnu[1];
    if (!payloadPath) fail_usage();
    try { payload = readFileSync(payloadPath, "utf8").replace(/^﻿/, ""); }
    catch (e) { console.error(`[LEDGER FAIL] --fichier illisible (${payloadPath}) : ${e.message}`); process.exit(1); }
    // BOM UTF-8 : Out-File/Set-Content PowerShell 5.1 l'écrivent par défaut — sans ce retrait,
    // JSON.parse échoue sur « Unexpected token » (RA-1, cas réel visé par --fichier).
  } else {
    payload = reconnu[0];
  }
  if (!payload) fail_usage();
  let obj;
  try { obj = JSON.parse(payload); } catch { fail("payload JSON invalide"); }
  // TF-1366 (b) : une entrée sans `type`, ou réduite à son seul `type` (et un `ts` éventuel),
  // reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve —
  // refusée ici, avant même le verrou (aucune écriture, aucun état partagé touché).
  if (typeof obj.type !== "string" || !obj.type.trim()) {
    fail("entrée refusée : champ `type` absent — une entrée sans type ne se relit jamais comme preuve (TF-1366)");
  }
  // TF-1367 (27/09/2026) — LE NUMÉRO D'UNE ENTRÉE N'APPARTIENT QU'À L'OUTIL. Le spread
  // `{ seq, ts, ...corps }` laissait un `seq` fourni par le payload écraser celui que l'outil
  // calcule sous verrou : deux entrées pouvaient porter le même numéro sans aucune concurrence,
  // le défaut même que le verrou existe pour empêcher. Relevé par l'agent de campagne de TF-1366 ;
  // refusé ici, avant le verrou, sans rien écrire.
  if (Object.prototype.hasOwnProperty.call(obj, "seq")) {
    fail(`entrée refusée : le payload porte \`seq\` (${JSON.stringify(obj.seq)}) — le numéro d'une entrée est attribué par l'outil sous verrou, jamais fourni ; un seq recopié ferait porter le même numéro à deux entrées (TF-1367)`);
  }
  // D-1 (a) du pilot (25/09/2026) : une famille sans version se complète par la version servie,
  // lue dans les transcripts de la session — sur une entrée que les refus ci-dessus ont admise.
  const annoncesVersion = [];
  completerVersion(obj, annoncesVersion);
  const clesUtiles = Object.keys(obj).filter((k) => k !== "type" && k !== "ts");
  if (clesUtiles.length === 0) {
    fail(`entrée refusée : aucun contenu au-delà de \`type\` (${JSON.stringify(obj.type)}) — une entrée sans contenu reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve (TF-1366)`);
  }
  // TF-1722 : une rectification de `forges_mobilisees` sans liste non vide ou sans `cause` est
  // refusée avant le verrou, quel que soit le schéma — le juge du pilot l'ignorerait.
  // TF-1319 (D-5 b) : même garde pour la qualification d'un refus du juge d'enclenchement.
  // TF-2494 : même garde pour l'antériorité bornée que le message de R-42 prescrit.
  const champsTypeLibre = obj.type === TYPE_RECTIFICATION_FORGES ? CHAMPS_RECTIFICATION_FORGES
    : obj.type === TYPE_QUALIFICATION_ENCLENCHEMENT ? CHAMPS_QUALIFICATION_ENCLENCHEMENT
      : obj.type === TYPE_ANTERIORITE ? CHAMPS_ANTERIORITE : null;
  if (champsTypeLibre) {
    const manquants = [];
    for (const [champ, pourquoi, valider] of champsTypeLibre) {
      const valeur = obj[champ];
      if (valeur === undefined || valeur === null || String(valeur).trim() === "") { manquants.push(`\`${champ}\` ${champ in obj ? "vide" : "absent"} — ${pourquoi}`); continue; }
      const probleme = valider(valeur);
      if (probleme) manquants.push(`\`${champ}\` ${probleme} — ${pourquoi}`);
    }
    if (manquants.length) {
      fail(`entrée refusée (type \`${obj.type}\`, quel que soit le schéma, ${obj.type === TYPE_RECTIFICATION_FORGES ? "TF-1722" : obj.type === TYPE_ANTERIORITE ? "TF-2494" : "TF-1319"}) — champ(s) dû(s) :\n           ${manquants.join("\n           ")}`);
    }
  }
  // TF-1841 du pilot : `parties_mobilisees`, facultatif, est refusé s'il est présent et mal formé.
  if (TYPES_PORTEURS_PARTIES.includes(obj.type) && Object.prototype.hasOwnProperty.call(obj, CHAMP_PARTIES)) {
    const probleme = validerPartiesMobilisees(obj[CHAMP_PARTIES]);
    if (probleme) fail(`entrée refusée (type \`${obj.type}\`, quel que soit le schéma, TF-1841) — \`${CHAMP_PARTIES}\` ${probleme} : le juge de l enclenchement l ignorerait et garderait la promesse entiere`);
  }
  // TF-2152 : un run_close « prêt » joue R-61 bis AVANT d'être écrit (refus sur FAIL, avant le verrou).
  const annoncesPret = obj.type === "run_close" && STATUT_PRET.test(String(obj.statut ?? "")) ? jouerR61bis(file, obj) : [];
  const seqsEcrits = ecrireSousVerrou(file, [obj], essai);
  const [seq] = seqsEcrits;
  if (essai) {
    // TF-2549 : tous les contrôles ont été joués (un refus est sorti plus haut, exit 1) ; rien n'a été écrit.
    console.log(`[ESSAI] rien n'est écrit : cette entrée serait écrite à ${basename(file)} (seq ${seq}, indicatif : une autre session peut le prendre)`);
    console.log(seqsEcrits.lignes[0]);
    process.exit(0);
  }
  for (const a of annoncesPret) console.log(a);
  const tsFourni = typeof obj.ts === "string" && obj.ts.trim() ? obj.ts.trim() : null;
  if (tsFourni) console.log(`[ATTENTION] \`ts\` imposé par le payload (${tsFourni}) au lieu de l'horodatage machine`);
  for (const a of annoncesVersion) console.log(a);
  // TF-1366 (d) : l'écho NOMME le type et les champs écrits — un « [OK] » muet sur le contenu ne
  // permet pas de relire, depuis la seule sortie de la commande, ce qui vient d'être ajouté.
  console.log(`[OK] entrée ${seq} ajoutée (type ${obj.type} ; champs : ${clesUtiles.join(", ")})`);
  // TF-2425 : S90 rappelée À L'ÉCRITURE — un chiffre affirmé sans provenance ni mention « non mesuré » se relève à la source avant de rester
  // pour toujours dans un journal en ajout seul. Rappel seul : l'entrée est écrite (S90 est avertissante), la sortie reste exit 0.
  const sansReleve = chiffresAffirmes(obj);
  if (sansReleve.length) {
    const cites = sansReleve.slice(0, 5).map((x) => `« ${x.chiffre} » (${x.nature}, champ \`${x.champ || "?"}\`)`).join(", ");
    console.log(`[RAPPEL S90] ${sansReleve.length} chiffre(s) affirmé(s) sans provenance : ${cites}${sansReleve.length > 5 ? `, … ${sansReleve.length - 5} autre(s)` : ""} — ` +
      "un compte écrit au ledger se RELÈVE à la source (requête, `wc -l`, `git`, compte du script), jamais d'un affichage borné ni d'un souvenir ; " +
      "à défaut, le dire « non recompté », « estimé » ou « rapporté ». Le 10/11/2026, 12 demandes, 7 autorisées et 12 jobs consignés d'après une liste tronquée " +
      "valaient 11, 6 et 6 au recompte par requête : l'entrée fausse est restée au ledger (TF-2425, S90 d'oracle-synthese du pilot). L'entrée est écrite telle quelle.");
  }
  // TF-2206, TF-2245 : une décision qui en remplace une autre dit ce que la première avait créé, et son sort.
  if (remplaceSansArtefacts(obj)) {
    console.log("[À PORTER] remplace sans artefacts_remplaces : lister ce que la décision remplacée avait créé (ressources, exigences, " +
      `contrôles) avec son sort, par une entrée de plus : ${REMEDE_REMPLACEMENT}`);
  }
  if (estJournalHorsRun(file)) {
    console.log(`[HORS RUN] aucun run ouvert : entrée écrite au journal ${NOM_JOURNAL_HORS_RUN} (seq ${seq}), pas au ledger du run ; le prochain lot de retours la compile`);
  }
} else if (cmd === "consigner") {
  if (!file) fail(USAGE_CONSIGNER);
  // Ce qui précède `--` sont les options de consigner ; ce qui suit est la commande du lanceur,
  // transmise telle quelle — jamais lue comme une option d'ici.
  const iSep = argsRestants.indexOf("--");
  const options = iSep >= 0 ? argsRestants.slice(0, iSep) : argsRestants;
  const commande = iSep >= 0 ? argsRestants.slice(iSep + 1) : [];
  const AVEC_VALEUR = ["--rapport", "--forge", "--cible", "--etape"];
  const opts = {};
  const enTrop = [];
  for (let i = 0; i < options.length; i++) {
    const a = options[i];
    if (!AVEC_VALEUR.includes(a)) { enTrop.push(a); continue; }
    const val = options[i + 1];
    if (val === undefined || (val.startsWith("--") && val !== "-")) fail(`\`${a}\` sans valeur — ${USAGE_CONSIGNER}`);
    if (a in opts) fail(`\`${a}\` donné deux fois — ${USAGE_CONSIGNER}`);
    opts[a] = val;
    i++;
  }
  if (enTrop.length) fail(`argument(s) non reconnu(s) : ${enTrop.map((a) => `\`${a}\``).join(", ")} — ${USAGE_CONSIGNER}`);
  if (iSep >= 0 && !commande.length) fail(`\`--\` sans commande — ${USAGE_CONSIGNER}`);
  if (Boolean(opts["--rapport"]) === commande.length > 0) {
    fail(`une source de verdicts, et une seule : \`--rapport <fichier|->\` OU \`-- <commande>\` — ${USAGE_CONSIGNER}`);
  }
  // Un verdict se consigne dans un run OUVERT : vérifié AVANT de lancer quoi que ce soit, pour ne
  // pas faire tourner un lanceur dont le relevé ne pourrait aller nulle part.
  let dejaEcrit = "";
  try { dejaEcrit = existsSync(file) ? readFileSync(file, "utf8") : ""; } catch (e) { fail(`ledger illisible (${file}) : ${e.message}`); }
  if (!dejaEcrit.trim()) fail(`ledger introuvable ou vide (${file}) — un verdict se consigne dans un run OUVERT : \`run_open\` d'abord, par \`append\``);

  let octets;
  let execution = null;
  if (opts["--rapport"]) {
    try { octets = readFileSync(opts["--rapport"] === "-" ? 0 : opts["--rapport"]); }
    catch (e) { fail(`--rapport illisible (${opts["--rapport"]}) : ${e.message}`); }
  } else {
    // La commande est lancée SANS shell, sa sortie lue en octets : aucune page de code de console
    // ne s'interpose (sous PowerShell 5.1, `> rapport.json` écrit de l'UTF-16 et un tube réencode).
    const [prog, ...pargs] = commande;
    const exe = /^node(\.exe)?$/i.test(prog) ? process.execPath : prog;
    const r = spawnSync(exe, pargs, { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    if (r.error) fail(`commande non lancée (${commande.join(" ")}) : ${r.error.message}`);
    if (r.stderr && r.stderr.length) process.stderr.write(r.stderr);
    octets = r.stdout;
    execution = { commande: commande.join(" "), exit: r.status };
  }
  let rapport;
  try { rapport = JSON.parse(texteDuRapport(octets)); }
  catch {
    fail(`rapport non JSON${execution ? ` (la commande a rendu exit ${execution.exit})` : ""} — un verdict qu'on ne sait pas lire ` +
      `ne se consigne pas, AUCUNE entrée écrite`);
  }
  const { lanceur, cible, elements, refus } = verdictsDuRapport(rapport);
  if (refus.length) {
    fail(`lot refusé, AUCUNE entrée écrite (tout le lot ou rien) — ${refus.length} élément(s) inconsignable(s) :` +
      refus.map((x) => `\n           ${x}`).join(""));
  }
  const lot = `${new Date().toISOString()}#${process.pid}`;
  const entrees = elements.map((el, i) => {
    const { oracle, verdict, cible: cibleElement, ...detail } = el;
    const cibleEntree = opts["--cible"] || cibleElement || cible;
    return {
      type: "oracles_verdict",
      oracle,
      verdict,
      ...(cibleEntree ? { cible: cibleEntree } : {}),
      ...(opts["--forge"] ? { forge: opts["--forge"] } : {}),
      ...(opts["--etape"] ? { etape: opts["--etape"] } : {}),
      ...detail,
      ...(lanceur ? { lanceur } : {}),
      ...(execution ? { commande: execution.commande, exit_commande: execution.exit } : {}),
      consigne_par: "ledger.mjs consigner",
      lot: { id: lot, rang: i + 1, total: elements.length },
    };
  });
  const seqs = ecrireSousVerrou(file, entrees, essai);
  if (essai) {
    // TF-2549 : le lot a passé tous les contrôles ; rien n'est écrit. La commande du lanceur, elle, a été jouée (c'est elle qu'on essaie).
    console.log(`[ESSAI] rien n'est écrit : ${entrees.length} entrée(s) oracles_verdict seraient écrites à ${basename(file)}, seq ${seqs[0]}${seqs.length > 1 ? ` à ${seqs[seqs.length - 1]}` : ""} (lot ${lot}, indicatif : une autre session peut prendre ces seq)`);
    seqs.lignes.forEach((l) => console.log(l));
    process.exit(0);
  }
  const compte = VERDICTS_CANONIQUES.map((v) => [v, entrees.filter((e) => e.verdict === v).length]).filter(([, n]) => n)
    .map(([v, n]) => `${v} ${n}`).join(" · ");
  console.log(`[OK] ${entrees.length} entrée(s) oracles_verdict ajoutée(s), une par oracle, seq ${seqs[0]}` +
    `${seqs.length > 1 ? ` à ${seqs[seqs.length - 1]}` : ""} (lot ${lot}) — ${compte}`);
  entrees.forEach((e, i) => console.log(`  seq ${seqs[i]} : ${e.oracle} → ${e.verdict}${e.verdict_brut ? ` (écrit « ${e.verdict_brut} » par le lanceur)` : ""}`));
  // Consigner n'est pas juger : la sortie dit 0 dès que le lot est écrit, quels que soient les
  // verdicts. Le code du lanceur est rendu ici et dans chaque entrée (`exit_commande`).
  if (execution) console.log(`[INFO] la commande a rendu exit ${execution.exit} — consigner n'est pas juger : les verdicts sont au ledger, la sortie de consigner dit seulement qu'ils y sont`);
} else if (cmd === "verify") {
  if (argsRestants.length) fail(`argument(s) non reconnu(s) : ${argsRestants.map((a) => `\`${a}\``).join(", ")} — ${USAGE_VERIFY}`);
  if (!file || !existsSync(file)) fail("ledger introuvable");
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (lines.length === 0) fail("ledger vide");
  // JSON invalide reste un arrêt immédiat : une ligne qu'on ne peut pas lire n'est pas une
  // entrée dont on pourrait accumuler les écarts — le fichier n'est plus un ledger.
  const entrees = lines.map((l, i) => {
    try { return JSON.parse(l); } catch { return fail(`ligne ${i + 1} : JSON invalide`); }
  });

  // --- PASSE 1 : recenser les RECTIFICATIONS DÉCLARÉES avant de juger les horodatages.
  // Deux passes sont nécessaires : une rectification est forcément POSTÉRIEURE à ce qu'elle
  // déclare (append-only), donc inconnue au moment où l'écart est rencontré.
  // seq visé -> [{ seq, ts_consigne, ts_reel_estime, cause, parSeq, parLigne, applique }, ...] :
  // TOUTES les déclarations d'un seq (TF-1425) — deux entrées au même seq se déclarent chacune,
  // et c'est `ts_consigne` qui dit laquelle est visée.
  const rectifs = new Map();
  const ecartsRectif = [];   // une déclaration fautive n'est pas une couverture : c'est un écart
  entrees.forEach((e, i) => {
    if (e.type !== TYPE_RECTIFICATION) return;
    const ou = `ligne ${i + 1} (${TYPE_RECTIFICATION}, seq ${e.seq})`;
    if (!Array.isArray(e.entrees) || e.entrees.length === 0) {
      ecartsRectif.push(`${ou} : \`entrees\` absent ou vide — une rectification qui ne déclare ` +
        `aucun seq ne rectifie rien (les seq visés se DISENT, ils ne se devinent pas)`);
      return;
    }
    for (const d of e.entrees) {
      const manquants = CHAMPS_RECTIFICATION.filter((c) =>
        d === null || typeof d !== "object" || d[c] === undefined || d[c] === null || String(d[c]).trim() === "");
      if (manquants.length) {
        ecartsRectif.push(`${ou} : déclaration incomplète — champ(s) ${
          manquants.map((c) => `\`${c}\``).join(", ")} manquant(s) dans ${JSON.stringify(d)}`);
        continue;
      }
      if (!Number.isInteger(d.seq) || d.seq < 1) {
        ecartsRectif.push(`${ou} : \`seq\` déclaré invalide (${JSON.stringify(d.seq)}) — entier ≥ 1 attendu`);
        continue;
      }
      if (d.seq >= e.seq) {
        ecartsRectif.push(`${ou} : déclare le seq ${d.seq}, qui ne lui est pas ANTÉRIEUR — une ` +
          `rectification ne couvre jamais un seq postérieur ni elle-même : on ne se dédouane pas d'avance`);
        continue;
      }
      // Ce que l'outil ajoute s'écrit APRÈS la déclaration : un champ `parLigne` écrit dans
      // `entrees[]` ne doit pas pouvoir déplacer la rectification et couvrir d'avance.
      if (!rectifs.has(d.seq)) rectifs.set(d.seq, []);
      rectifs.get(d.seq).push({ ...d, parSeq: e.seq, parLigne: i + 1, applique: false });
    }
  });

  // TF-1425 : la déclaration qui couvre UNE entrée — même seq, écrite APRÈS elle dans le fichier
  // (avec deux entrées au même seq, le numéro seul ne situe plus rien), et `ts_consigne` égal au
  // ts de l'entrée tel qu'il est écrit. `divergente` : une déclaration de ce seq existe en aval,
  // mais ne correspond pas à l'histoire — elle ne couvre rien, et le message le dit.
  const couverture = (e, ligne) => {
    const enAval = (rectifs.get(e.seq) || []).filter((d) => d.parLigne > ligne);
    return { r: enAval.find((d) => d.ts_consigne === e.ts) || null, divergente: enAval[0] || null };
  };

  // TF-2494 : l'ANTÉRIORITÉ BORNÉE déclarée — la plus récente des `anteriorite_ledger` valides (`avant` lisible,
  // `cause` ≥ 20 caractères) fait foi, comme R-42 du pilot (TF-1203). Elle ne couvre ici que le saut de seq en avant.
  let anterioriteBorneMs = NaN, anterioriteBorneAvant = "", anterioriteBorneCause = "";
  for (const e of entrees) {
    if (e.type !== TYPE_ANTERIORITE) continue;
    const ms = instant(e.avant);
    const cause = typeof e.cause === "string" ? e.cause.trim() : "";
    if (!Number.isNaN(ms) && cause.length >= CAUSE_ANTERIORITE_MIN && (Number.isNaN(anterioriteBorneMs) || ms > anterioriteBorneMs)) {
      anterioriteBorneMs = ms; anterioriteBorneAvant = e.avant; anterioriteBorneCause = cause;
    }
  }
  const avantBorne = (ms) => !Number.isNaN(ms) && !Number.isNaN(anterioriteBorneMs) && ms < anterioriteBorneMs;

  // --- PASSE 1 bis : NUMÉROS PORTÉS PAR PLUSIEURS ENTRÉES (TF-1367, 21/09/2026). Fait mesuré :
  // deux sessions simultanées ont écrit dans le même journal d'un produit ; les seq 262, 263,
  // 265 et 266 y désignaient chacun deux entrées, noyées dans 57 ruptures anciennes par le seul
  // message générique d'append-only rompu. Ce défaut est DISTINCT d'une rupture ordinaire (un
  // gap, un désordre) : il signe DEUX ÉCRIVAINS SANS VERROU COMMUN, et se nomme EN TÊTE des
  // écarts, avant toute autre rupture — `ledger.mjs` verrouille déjà l'écriture (`<ledger>.lock`),
  // ce constat vise les entrées écrites AILLEURS (un autre outil, un autre poste) sans lui.
  // TF-1425 : le constat se forme APRÈS la passe 2, qui dit quelles collisions sont rectifiées.
  const lignesParSeq = new Map(); // seq -> [n° de ligne, ...]
  entrees.forEach((e, i) => {
    if (!Number.isInteger(e.seq)) return;
    lignesParSeq.set(e.seq, [...(lignesParSeq.get(e.seq) || []), i + 1]);
  });

  // --- PASSE 2 : intégrité. Les écarts s'ACCUMULENT — un vérificateur qui sort au premier
  // ne dit pas « un défaut », il dit « au moins un défaut », et le reste n'est pas jugé.
  // TF-1425 : la continuité se juge, elle aussi, contre le PLUS HAUT seq vu (le principe que
  // TF-0410 a posé pour les horodatages) — comparer au précédent abaissait la barre juste après
  // une collision, et la suite reprend au plus haut seq vu, comme R-42 du pilot.
  let seqAttendu = 1, tsMax = "", tsMaxMs = -Infinity, seqTsMax = 0;
  let schemaDeclare = null;
  const sansContenu = []; // TF-1366 (e) : entrées réduites à {seq, ts, type} — jamais un contenu
  const ecartsIntegrite = [];
  const rectifiesAppliques = new Set();
  const collisionsAppliquees = new Set(); // seq dont une collision est rectifiée
  const collisionsRectifiees = new Set(); // n° de ligne des entrées en collision rectifiées
  const sautsCouverts = new Set();        // TF-2494 : seq qui suivent une lacune couverte (rectification ou antériorité)
  const collisionsAnterieures = new Set(); // TF-2540 : n° de ligne des collisions de seq couvertes par une antériorité déclarée
  const reculsAnterieurs = new Set();      // TF-2540 : seq dont le recul d'horodatage est couvert par une antériorité déclarée
  entrees.forEach((e, i) => {
    if (e.seq !== seqAttendu) {
      const quoi = `ligne ${i + 1} : seq ${e.seq} attendu ${seqAttendu}`;
      // Un seq en double ou en recul (sous le plus haut seq vu) nommé par une rectification en
      // aval est [RECTIFIÉ] (TF-0794 du pilot) ; un seq non nommé reste FAIL. TF-2494 : un saut en
      // avant (des seq jamais écrits) a ses deux voies — la rectification qui nomme le seq qui suit
      // la lacune, ou l'antériorité bornée (`anteriorite_ledger`) — comme R-42 du pilot.
      const enCollision = Number.isInteger(e.seq) && e.seq < seqAttendu;
      const enSaut = Number.isInteger(e.seq) && e.seq > seqAttendu;
      const { r, divergente } = enCollision || enSaut ? couverture(e, i + 1) : { r: null, divergente: null };
      if (enSaut) {
        const lacune = `seq ${seqAttendu}${e.seq - 1 > seqAttendu ? ` à ${e.seq - 1}` : ""} jamais écrit${e.seq - 1 > seqAttendu ? "s" : ""}`;
        const nature = `saut en avant, ${lacune}`;
        if (r) {
          r.applique = true;
          sautsCouverts.add(e.seq);
          console.log(`[RECTIFIÉ] ${quoi} (${nature}) — déclaré par la rectification du seq ${r.parSeq}, ` +
            `heure réelle estimée ${r.ts_reel_estime} : ${r.cause}`);
        } else if (avantBorne(instant(e.ts))) {
          sautsCouverts.add(e.seq);
          console.log(`[ANTÉRIORITÉ] ${quoi} (${nature}) — antérieur au ${new Date(anterioriteBorneMs).toISOString()} ` +
            `déclaré (${TYPE_ANTERIORITE}, avant ${anterioriteBorneAvant}) : ${anterioriteBorneCause.slice(0, 90)}`);
        } else if (divergente) {
          ecartsIntegrite.push(`${quoi} (${nature}, append-only rompu) — la rectification du seq ${divergente.parSeq} ` +
            `déclare \`ts_consigne\` ${divergente.ts_consigne}, l'entrée porte ${e.ts} : une déclaration ` +
            `qui ne correspond pas à l'histoire ne couvre rien`);
        } else {
          ecartsIntegrite.push(`${quoi} (${nature}, append-only rompu) — remède : une \`${TYPE_RECTIFICATION}\` ultérieure ` +
            `dont \`entrees[]\` nomme le seq ${e.seq} avec son \`ts_consigne\`, ou une \`${TYPE_ANTERIORITE}\` (\`avant\`, \`cause\` ≥ ${CAUSE_ANTERIORITE_MIN} caractères) (TF-2494)`);
        }
      } else if (r) {
        r.applique = true;
        collisionsAppliquees.add(e.seq);
        collisionsRectifiees.add(i + 1);
        console.log(`[RECTIFIÉ] ${quoi} (seq en collision) — déclaré par la rectification du seq ${r.parSeq}, ` +
          `heure réelle estimée ${r.ts_reel_estime} : ${r.cause}`);
      } else if (avantBorne(instant(e.ts))) {
        // TF-2540 : l'antériorité couvre aussi une collision de seq, comme R-42 du pilot (TF-1203).
        collisionsAnterieures.add(i + 1);
        console.log(`[ANTÉRIORITÉ] ${quoi} (seq en collision) — antérieur au ${new Date(anterioriteBorneMs).toISOString()} ` +
          `déclaré (${TYPE_ANTERIORITE}, avant ${anterioriteBorneAvant}) : ${anterioriteBorneCause.slice(0, 90)}`);
      } else if (divergente) {
        ecartsIntegrite.push(`${quoi} (append-only rompu) — la rectification du seq ${divergente.parSeq} ` +
          `déclare \`ts_consigne\` ${divergente.ts_consigne}, l'entrée porte ${e.ts} : une déclaration ` +
          `qui ne correspond pas à l'histoire ne couvre rien`);
      } else {
        ecartsIntegrite.push(`${quoi} (append-only rompu)`);
      }
    }
    // TF-2245 : le journal hors run (`hors-run.jsonl`, TF-2223 du pilot) ne s'ouvre pas par `run_open` ; tout autre fichier, si.
    if (i === 0 && e.type !== "run_open" && !estJournalHorsRun(file)) ecartsIntegrite.push("ligne 1 : première entrée — type run_open exigé");
    // Monotonie jugée contre le MAXIMUM COURANT : après un recul, l'entrée fautive ne devient
    // pas la référence. Sinon un seul recul suffit à rendre invisible tout ce qui le suit.
    // TF-1422 : jugée sur des INSTANTS, et un `ts` dont on ne tire aucun instant est un écart.
    const tsMs = instant(e.ts);
    const illisible = Number.isNaN(tsMs);
    if (illisible || tsMs < tsMaxMs) {
      const quoi = illisible
        ? `seq ${e.seq} : horodatage ${e.ts === undefined ? "absent" : `illisible (${JSON.stringify(e.ts)})`}, aucun instant à ordonner`
        : `seq ${e.seq} : horodatage décroissant (${e.ts} après ${tsMax})`;
      const { r, divergente } = couverture(e, i + 1);
      if (!r && avantBorne(tsMs)) {
        // TF-2540 : l'antériorité couvre aussi un recul d'horodatage, comme R-42 du pilot (TF-1203). Un `ts` illisible n'a pas d'instant
        // à comparer à `avant` : il reste un écart.
        reculsAnterieurs.add(e.seq);
        console.log(`[ANTÉRIORITÉ] ${quoi} — antérieur au ${new Date(anterioriteBorneMs).toISOString()} ` +
          `déclaré (${TYPE_ANTERIORITE}, avant ${anterioriteBorneAvant}) : ${anterioriteBorneCause.slice(0, 90)}`);
      } else if (divergente && !r) {
        ecartsIntegrite.push(`${quoi} — la rectification du seq ${divergente.parSeq} déclare \`ts_consigne\` ` +
          `${divergente.ts_consigne}, l'entrée porte ${e.ts} : une déclaration qui ne correspond pas à ` +
          `l'histoire ne couvre rien`);
      } else if (!r) {
        ecartsIntegrite.push(illisible ? quoi : `${quoi} — maximum atteint au seq ${seqTsMax}`);
      } else {
        // Rectifié n'est pas effacé : la ligne s'imprime à CHAQUE verify. L'écart cesse de
        // bloquer, il ne cesse pas d'exister.
        r.applique = true;
        rectifiesAppliques.add(e.seq);
        console.log(`[RECTIFIÉ] ${quoi} — déclaré par la rectification du seq ${r.parSeq}, ` +
          `heure réelle estimée ${r.ts_reel_estime} : ${r.cause}`);
      }
    }
    if (e.type === "run_open" && e.schema_ledger) schemaDeclare = String(e.schema_ledger);
    // TF-1366 (e) : « sans contenu » = rien au-delà de seq/ts/type — le seul énoncé qu'`append`
    // refuse désormais à l'écriture (b) ; un journal antérieur à ce refus, ou alimenté par un
    // autre outil, peut encore en porter.
    if (Object.keys(e).every((k) => k === "seq" || k === "ts" || k === "type")) {
      sansContenu.push({ ligne: i + 1, seq: e.seq });
    }
    if (Number.isInteger(e.seq)) seqAttendu = Math.max(seqAttendu, e.seq + 1);
    if (tsMs > tsMaxMs) { tsMaxMs = tsMs; tsMax = e.ts; seqTsMax = e.seq; }
  });

  // TF-1367, TF-1425 : un seq porté par plusieurs entrées se nomme EN TÊTE des écarts, sauf si
  // chaque occurrence après la première est une collision rectifiée — il s'imprime alors
  // [RECTIFIÉ] : il cesse de bloquer, il ne disparaît pas.
  const ecartsDoublons = [];
  for (const [seqPorte, lignesDup] of lignesParSeq) {
    if (lignesDup.length < 2) continue;
    const doublon = `seq ${seqPorte} porté par ${lignesDup.length} entrées, lignes ${
      lignesDup.join(", ")} — deux écrivains sans verrou commun`;
    if (lignesDup.slice(1).every((n) => collisionsRectifiees.has(n))) console.log(`[RECTIFIÉ] ${doublon}, collision déclarée`);
    else if (lignesDup.slice(1).every((n) => collisionsRectifiees.has(n) || collisionsAnterieures.has(n))) console.log(`[ANTÉRIORITÉ] ${doublon}, collision antérieure déclarée`);
    else ecartsDoublons.push(doublon);
  }
  // TF-2424 : les DOUBLONS — une entrée identique (hors seq, ts et marque hors run) à une autre du MÊME run. `append` les refuse
  // désormais ; ceux DÉJÀ écrits se désignent par une `rectification_doublon` ultérieure ([RECTIFIÉ], vérifiée : la copie et sa source
  // doivent être identiques), sinon ils se DÉCLARENT ([DOUBLON], non bloquant : on ne met jamais en échec un ledger existant).
  const identites = entrees.map((e) => empreinteDEntree(e));
  const ligneDuSeq = (s) => entrees.findIndex((e) => e.seq === s);
  const doublonsDeclares = new Set(); // n° de ligne des copies désignées
  entrees.forEach((e, i) => {
    if (e.type !== TYPE_RECTIFICATION_DOUBLON) return;
    const ou = `ligne ${i + 1} (${TYPE_RECTIFICATION_DOUBLON}, seq ${e.seq})`;
    if (!Array.isArray(e.entrees) || e.entrees.length === 0) {
      ecartsRectif.push(`${ou} : \`entrees\` absent ou vide — une rectification qui ne désigne aucun doublon ne rectifie rien`);
      return;
    }
    for (const d of e.entrees) {
      const incomplet = d === null || typeof d !== "object" || ["seq", "doublon_de", "cause"].some((c) => d[c] === undefined || d[c] === null || String(d[c]).trim() === "");
      if (incomplet) { ecartsRectif.push(`${ou} : déclaration incomplète — \`seq\`, \`doublon_de\` et \`cause\` sont dus dans ${JSON.stringify(d)}`); continue; }
      const copie = ligneDuSeq(d.seq), source = ligneDuSeq(d.doublon_de);
      if (!(d.doublon_de < d.seq && copie > -1 && source > -1 && copie < i && source < copie)) {
        ecartsRectif.push(`${ou} : déclare le seq ${d.seq} doublon du seq ${d.doublon_de}, mais l'un n'existe pas ou n'est pas ANTÉRIEUR à la rectification (la source précède la copie, la copie précède la rectification)`);
        continue;
      }
      if (identites[copie] !== identites[source]) {
        ecartsRectif.push(`${ou} : déclare le seq ${d.seq} doublon du seq ${d.doublon_de}, mais les deux entrées DIFFÈRENT (hors seq et ts) — une entrée distincte ne se désigne pas comme doublon`);
        continue;
      }
      doublonsDeclares.add(copie + 1);
      console.log(`[RECTIFIÉ] doublon — le seq ${d.seq} est identique au seq ${d.doublon_de} (hors seq et ts), déclaré par la rectification du seq ${e.seq} : ${d.cause}`);
    }
  });
  const doublonsNonDeclares = [];
  {
    let vus = new Map(); // identité -> seq de la première entrée du run
    entrees.forEach((e, i) => {
      if (e.type === "run_open") vus = new Map();
      if (vus.has(identites[i])) { if (!doublonsDeclares.has(i + 1)) doublonsNonDeclares.push({ seq: e.seq, de: vus.get(identites[i]) }); }
      else vus.set(identites[i], e.seq);
    });
  }
  if (doublonsNonDeclares.length) {
    const lesPremiers = doublonsNonDeclares.slice(0, 5).map((x) => `${x.seq} = ${x.de}`).join(", ");
    console.log(`[DOUBLON] ${doublonsNonDeclares.length} entrée(s) identique(s) (hors seq et ts) à une autre du même run, non désignée(s) : seq ${lesPremiers}` +
      `${doublonsNonDeclares.length > 5 ? `, … ${doublonsNonDeclares.length - 5} autre(s)` : ""} — déjà écrite(s), non réécrite(s) : les désigner par une entrée \`${TYPE_RECTIFICATION_DOUBLON}\` ` +
      "(`entrees: [{seq, doublon_de, cause}]`) (TF-2424)");
  }
  const ecarts = [...ecartsDoublons, ...ecartsRectif, ...ecartsIntegrite];

  // TF-2245 : ce que `append` refuse désormais, `verify` le DÉCLARE sur l'existant sans le mettre en échec — le contrat du
  // pilot interdit de réécrire un ledger, et exiger une correction interdite ferait désactiver le contrôle (gabarits/ledger.py).
  // Le compte se dit par type, avec ses premiers seq : aucune borne silencieuse.
  const horsVocabulaire = new Map();
  entrees.forEach((e) => {
    if (typeof e.type === "string" && !TYPES_VOCABULAIRE.includes(e.type)) horsVocabulaire.set(e.type, [...(horsVocabulaire.get(e.type) || []), e.seq]);
  });
  for (const [t, seqs] of horsVocabulaire) {
    console.log(`[DÉCLARÉ] vocabulaire — ${seqs.length} entrée(s) de type « ${t} » hors du vocabulaire du pilot (seq ${seqs.slice(0, 5).join(", ")}${seqs.length > 5 ? `, … ${seqs.length - 5} autre(s)` : ""}) — ` +
      "déjà écrite(s), non réécrite(s) ; employer `reponse_humain` pour un arbitrage humain");
  }
  const remplacesSansArtefacts = entrees.filter(remplaceSansArtefacts);
  for (const e of remplacesSansArtefacts) {
    console.log(`[DÉCLARÉ] remplacement — seq ${e.seq} : remplace ${JSON.stringify(e.remplace)} sans \`artefacts_remplaces\` — entrée déjà écrite, non réécrite ; consigner par ajout ${REMEDE_REMPLACEMENT}`);
  }
  const nbHorsVocabulaire = [...horsVocabulaire.values()].reduce((n, l) => n + l.length, 0);
  const declaresDit = nbHorsVocabulaire || remplacesSansArtefacts.length
    ? ` · ${nbHorsVocabulaire + remplacesSansArtefacts.length} écart(s) DÉCLARÉ(S) non bloquant(s)${nbHorsVocabulaire ? ` (${nbHorsVocabulaire} hors vocabulaire)` : ""}${remplacesSansArtefacts.length ? ` (${remplacesSansArtefacts.length} remplace sans artefacts_remplaces)` : ""}`
    : "";

  // Déclaration sans objet : dite à voix haute, jamais bloquante. Elle ne peut rien couvrir
  // d'avance (les entrées visées sont antérieures, donc figées) — mais taire une déclaration
  // inopérante laisserait croire qu'une couverture existe.
  for (const declarations of rectifs.values()) {
    for (const r of declarations) {
      if (!r.applique)
        console.log(`[SANS OBJET] la rectification du seq ${r.parSeq} déclare le seq ${r.seq}, ` +
          `qui ne porte en amont d'elle aucun écart d'horodatage ni de seq à ce ts — déclaration conservée, sans effet`);
    }
  }
  if (ecarts.length) {
    fail(`intégrité — ${ecarts.length} écart(s) non rectifié(s) :` +
      ecarts.map((x) => `\n         ${x}`).join(""));
  }

  // FORME DU PAYLOAD, PAR VERSION DE SCHÉMA (TF-1366/D-18 (a), 26/09/2026) — exigée seulement si
  // le ledger s'est déclaré jugeable, et selon LA VERSION qu'il a déclarée : un journal qui
  // déclare `1.0` reste jugé selon les règles `1.0`, POUR TOUJOURS — jamais celles d'une version
  // plus récente (une version ne durcit jamais un journal qui en a déclaré une antérieure).
  // L'antériorité se DIT (elle n'est ni devinée ni ignorée) : sans elle, ce contrôle mettrait en
  // échec tout l'existant — c'est le motif que R-33 bis donne pour ne pas armer d'office le
  // verdict websec (REGLES-PROJET.md).
  const champsDusVersion = schemaDeclare ? CHAMPS_DUS_PAR_VERSION[schemaDeclare] : null;
  const contraints = champsDusVersion
    ? entrees.map((e, i) => ({ ligne: i + 1, e })).filter(({ e }) => champsDusVersion[e.type])
    : [];
  // Combien d'entrées ONT un type contraint sous la version COURANTE — pour dire, quand la forme
  // n'est PAS jugée (aucun schéma déclaré, ou une version inconnue), qu'il existe une population
  // qui le DEVIENDRAIT sous un schéma déclaré. Purement informatif : ne juge jamais CE ledger.
  const contraintsSousCourant = champsDusVersion ? contraints
    : entrees.map((e, i) => ({ ligne: i + 1, e })).filter(({ e }) => CHAMPS_DUS_PAR_VERSION[SCHEMA_LEDGER][e.type]);
  // Item (e) : bloquant SOUS 1.1 SEULEMENT — sa table de champs dus est la première à rendre ce
  // défaut jugeable. Pour un journal antérieur au schéma OU en 1.0, il reste NON BLOQUANT (on ne
  // met jamais en échec un journal existant — section antériorité déclarée en tête de fichier) ;
  // même traitement, par prudence, pour une version déclarée mais inconnue de ce vérificateur.
  const sansContenuBloquant = schemaDeclare === "1.1" && sansContenu.length > 0;
  const rapportSansContenu = () => `${sansContenu.length} entrée(s) sans contenu (rien d'autre ` +
    `que seq/ts/type) — ${sansContenu.map((x) => `ligne ${x.ligne} (seq ${x.seq})`).join(", ")}`;

  const anterieurs = [];
  if (!champsDusVersion) {
    if (contraintsSousCourant.length) {
      console.log(
        schemaDeclare
          ? `[NON VÉRIFIÉ] forme du payload — \`schema_ledger: ${schemaDeclare}\` déclaré, ` +
            `version inconnue de ce vérificateur (connues : ${Object.keys(CHAMPS_DUS_PAR_VERSION).join(", ")}) ` +
            `: ses ${contraintsSousCourant.length} entrée(s) de type contraint (sous ${SCHEMA_LEDGER}) ne sont pas jugées sur leur forme`
          : `[NON VÉRIFIÉ] forme du payload — \`run_open\` ne déclare pas \`schema_ledger\` : ce ` +
            `ledger PRÉCÈDE le schéma (courant ${SCHEMA_LEDGER}), ses ${contraintsSousCourant.length} entrée(s) ` +
            `de type contraint ne sont pas jugées sur leur forme. Pour les rendre jugeables : ` +
            `porter \`schema_ledger: "${SCHEMA_LEDGER}"\` au \`run_open\` du PROCHAIN run — jamais ` +
            `réécrire un ledger existant, l'histoire ne se réécrit pas`);
    }
    if (sansContenu.length) console.log(`[SANS CONTENU] ${rapportSansContenu()}`);
  } else {
    const ecartsForme = [];
    for (const { ligne, e } of contraints) {
      const naissance = NAISSANCE_CHAMPS_DUS[e.type];
      if (naissance && instant(e.ts) < instant(naissance)) { anterieurs.push({ ligne, e }); continue; }
      for (const [champ, pourquoi, valider] of champsDusVersion[e.type]) {
        const valeur = e[champ];
        const estVide = valeur === undefined || valeur === null || String(valeur).trim() === "";
        if (estVide) {
          ecartsForme.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${
            champ in e ? "vide" : "absent"} — ${pourquoi}`);
          continue;
        }
        if (valider) {
          const probleme = valider(valeur);
          if (probleme) ecartsForme.push(`ligne ${ligne} (${e.type}, seq ${e.seq}) : champ \`${champ}\` ${probleme} — ${pourquoi}`);
        }
      }
    }
    if (sansContenuBloquant) ecartsForme.push(`${rapportSansContenu()} — schéma 1.1 : une entrée ` +
      `sans contenu reste pour toujours dans un journal en ajout seul, et se lit ensuite comme une preuve (TF-1366)`);
    else if (sansContenu.length) console.log(`[SANS CONTENU] ${rapportSansContenu()}`);
    if (anterieurs.length) {
      console.log(`[ANTÉRIEUR] forme du payload — ${anterieurs.length} entrée(s) écrite(s) avant ` +
        `la naissance de leur règle, non jugée(s) sur leur forme (TF-1401) : ${anterieurs.map(({ ligne, e }) =>
          `ligne ${ligne} (${e.type}, seq ${e.seq}, règle du ${NAISSANCE_CHAMPS_DUS[e.type].slice(0, 10)})`).join(", ")}`);
    }
    if (ecartsForme.length) {
      fail(`forme du payload (schéma ${schemaDeclare}) — ${ecartsForme.length} écart(s) :` +
        ecartsForme.map((x) => `\n         ${x}`).join(""));
    }
  }

  const forme = champsDusVersion
    ? `forme vérifiée sur ${contraints.length - anterieurs.length} entrée(s) contrainte(s) (schéma ${schemaDeclare})${anterieurs.length ? `, ${anterieurs.length} antérieure(s) à leur règle` : ""}`
    : schemaDeclare
      ? `forme NON vérifiée (schéma ${schemaDeclare} inconnu de ce vérificateur)`
      : "forme NON vérifiée (ledger antérieur au schéma)";
  // « Intègre » ne veut pas dire « sans faute » : les écarts rectifiés sont comptés au verdict,
  // pas seulement imprimés au-dessus — un PASS muet sur eux serait un PASS qui ment.
  const rectifie = rectifiesAppliques.size
    ? ` · ${rectifiesAppliques.size} écart(s) d'horodatage DÉCLARÉ(S) et rectifié(s) (seq ${
      [...rectifiesAppliques].join(", ")})`
    : "";
  const collisions = collisionsRectifiees.size
    ? ` · ${collisionsRectifiees.size} collision(s) de seq DÉCLARÉE(S) et rectifiée(s) (seq ${
      [...collisionsAppliquees].join(", ")})`
    : "";
  const sauts = sautsCouverts.size
    ? ` · ${sautsCouverts.size} saut(s) de seq en avant DÉCLARÉ(S) et couvert(s) (seq ${[...sautsCouverts].join(", ")})`
    : "";
  const couvertsParAnteriorite = collisionsAnterieures.size + reculsAnterieurs.size
    ? ` · ${collisionsAnterieures.size + reculsAnterieurs.size} écart(s) de seq en collision ou d'horodatage ANTÉRIEUR(S) à une antériorité déclarée`
    : "";
  const doublons = (doublonsDeclares.size ? ` · ${doublonsDeclares.size} doublon(s) DÉCLARÉ(S) par rectification_doublon` : "") +
    (doublonsNonDeclares.length ? ` · ${doublonsNonDeclares.length} doublon(s) non déclaré(s) (non bloquant)` : "");
  const sansContenuDit = !sansContenuBloquant && sansContenu.length
    ? ` · ${sansContenu.length} entrée(s) SANS CONTENU (non bloquant, schéma ${schemaDeclare || "absent"})`
    : "";
  console.log(`[PASS] ledger intègre — ${lines.length} entrée(s) · ${forme}${rectifie}${collisions}${sauts}${couvertsParAnteriorite}${doublons}${sansContenuDit}${declaresDit}`);
} else {
  fail("commande inconnue (append | consigner | verify)");
}
