#!/usr/bin/env node
// installer-hamecon-publication — pose (ou retire) les DEUX hameçons du parc : le `pre-push` qui
// REFUSE une publication portant un nom de client, et le `pre-commit` qui RETIRE le nom avant que
// le commit n'existe.
//
// DEUX HAMEÇONS ET PAS UN, PARCE QU'UN SEUL ARRIVE TOUJOURS TROP TARD (TF-0980, 08/09/2026).
// Mesuré sur le dépôt du pilot : il ne portait QUE le `pre-push`. Conséquence mécanique — quand
// la porte parle, le nom est DÉJÀ dans un objet git, et le corriger demande de modifier un commit
// existant. Que ce soit un `--amend` local ou une réécriture complète, c'est la même opération :
// seule l'ampleur diffère. Le dépôt du pilot compte une vingtaine de mentions de réécriture
// d'historique, et TROIS réécritures en douze jours. Une porte de sortie ne peut pas empêcher ce
// qu'elle constate : elle arrive après.
//
// LES DEUX NE FONT PAS LE MÊME GESTE, ET C'EST VOULU. Le `pre-push` REFUSE : il juge tout
// l'historique (15 à 27 minutes mesurées au pilot le 28/09/2026 ; 23 s sur le même dépôt, avec des
// tables jetables de même taille, depuis que le contenu de l'histoire se juge par blobs uniques,
// TF-1448), et se rencontre quelques fois par jour. Le `pre-commit` CORRIGE : il ne juge que l'INDEX, coûte quelques
// millisecondes, et se rencontre dix fois par jour. Un contrôle bloquant qu'on rencontre dix fois
// par jour finit contourné — l'option existe et elle est documentée dans le hameçon lui-même. Un
// contrôle qui CORRIGE ne se contourne pas, parce qu'il n'y a rien à contourner.
//
// POURQUOI UN HAMEÇON ET PAS UNE CONSIGNE. Le 27/08/2026, l'oracle a été écrit, joué à la main,
// et il a trouvé deux dépôts qu'un balayage manuel venait de déclarer propres. Un contrôle exact
// qui n'existe QUE quand on pense à le jouer reproduit exactement l'oubli qu'il devait supprimer :
// c'est la loi transverse n° 1 — toute affordance est câblée ou n'existe pas.
//
// CE QUE LE HAMEÇON FAIT, et ce qu'il ne fait pas :
//   · il joue l'oracle sur le dépôt AVANT que git n'envoie quoi que ce soit ;
//   · FAIL → exit 1, la publication est REFUSÉE, les constats sont imprimés localisants ;
//   · SKIP → exit 1 AUSSI, et c'est délibéré : un oracle qui ne peut pas mesurer (référentiel
//     absent) ne doit pas laisser passer. Laisser filer sur SKIP, c'est fabriquer un vert.
//     MAIS UN REFUS SANS MOTIF EST UN REFUS QU'ON CONTOURNE (TF-0887, 08/09/2026) : le 07/09,
//     les deux tables ont déménagé dans le canal confidentiel, la porte appelée sans argument
//     s'est mise à rendre SKIP, et tout dépôt porteur du hameçon a refusé CHAQUE push — en
//     n'imprimant du motif que trois lignes tronquées, au milieu des constats. Sur SKIP, le
//     motif EST toute la sortie : il se répète EN CLAIR, en entier, préfixé « porte SKIP : »,
//     avant le refus. Un garde-fou qui refuse sans dire pourquoi se fait lever à l'aveugle ;
//   · PASS → exit 0, la publication suit son cours ;
//   · il ne juge PAS ce qui est déjà publié — il empêche d'en ajouter. Le rattrapage de
//     l'existant est un run, pas un hameçon.
//
// CONTOURNEMENT ASSUMÉ : `git push --no-verify` passe outre. C'est voulu — un garde-fou qu'on ne
// peut pas lever en connaissance de cause se fait arracher au lieu d'être discuté. Le contournement
// est un geste EXPLICITE, pas un défaut.
//
// Usage : node installer-hamecon-publication.mjs <depot…> [--retirer] [--verifier] [--essai]
//         (--essai : le même parcours sans rien écrire, chaque geste préfixé « (essai) ») ;
//         [--seul=pre-push|pre-commit|commit-msg] pour n'agir que sur l'un d'eux (le
//         commit-msg de TF-1071 juge le seul message, à l'écriture) ;
//         [--seul=pre-commit-skills] pose le pre-commit des dépôts qui portent des skills
//         (TF-1337) — JAMAIS posé sans ce drapeau ;
//         [--seul=pre-push-canal] pose le pre-push du CANAL CONFIDENTIEL, qui joue son propre
//         contrôle avant l'envoi (D-30 (a), 27/09/2026) — JAMAIS posé sans ce drapeau ;
//         [--migrer] reprend un hameçon qui porte la marque SANS la signature (TF-0994) — et le
//         refuse s'il porte du code absent du gabarit (TF-1402, ci-dessous).
//
// UN HAMEÇON QUI PROLONGE LE GABARIT N'EST JAMAIS ÉCRASÉ (TF-1402, constat du 24/09/2026, corrigé
// le 12/10/2026). Le pre-push du pilot commence par ce gabarit et y ajoute sa borne R-38 §4-5 ;
// sans signature, il était classé « ancien », et `--migrer` l'aurait remplacé par le gabarit : la
// borne disparaissait sans bruit. Deux règles désormais :
//   · une section propre à un dépôt s'écrit entre les lignes `# >>> prolongement local >>>` et
//     `# <<< prolongement local <<<` du pre-push ; l'installeur la RECOPIE à chaque repose ou
//     migration, et dit CONFLIT plutôt que de la perdre là où le gabarit n'a pas ces lignes ;
//   · `--migrer` refuse un hameçon non signé qui porte, hors de cette section, une ligne de code
//     que le gabarit n'a pas : il dit PROLONGÉ, le nombre de lignes et la première, et ne touche à
//     rien. Un ancien gabarit du parc, qui n'a que des lignes du gabarit, migre comme avant.
//
// UNE SIGNATURE SE RECONNAÎT À SON IDENTIFIANT, QUELLE QUE SOIT SA VERSION, ET `--verifier` DIT
// PÉRIMÉ (TF-1360, 12/10/2026). Une variante non publiée a posé `v2` sur les forges d'un poste :
// l'installeur, qui ne connaissait que `v1`, les disait A-MIGRER. Et un hameçon signé mais posé
// avant une correction du gabarit (sans `trap '' PIPE`, par exemple) se disait POSÉ. La propriété
// tient à l'identifiant ; la fraîcheur se juge au CONTENU : signé mais différent du gabarit courant
// (section propre exceptée) → PÉRIMÉ, compté manquant, et un lancement ordinaire le repose.
//
// LA BORNE R-38 §4-5 EST DANS LE GABARIT (TF-1275, 12/10/2026). Le pilot la portait dans une section
// écrite à la main, qu'aucun outil ne posait : un clone neuf ne l'avait pas, et une repose pouvait
// l'effacer. Le gabarit du pre-push la porte désormais, gardée par la présence de
// `scripts/verifier-avance-publication.mjs` : elle joue au pilot et ne fait rien ailleurs.
//
// LE PRE-PUSH NE JUGE QUE CE QUE L'ENVOI AJOUTE (TF-1555, 12/10/2026). Il lit sur son entrée les
// références envoyées et passe à la porte `--revs=<empreintes locales>,^<empreintes distantes>,--not,
// --remotes=<distant>` : l'histoire déjà publiée n'est plus rejugée à chaque envoi, l'arbre courant
// l'est toujours en entier.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const depots = args.filter((a) => !a.startsWith('--'));
const retirer = args.includes('--retirer');
const verifier = args.includes('--verifier');
// --essai : le même parcours, sans rien écrire ni retirer ; chaque geste se dit préfixé « (essai) ».
const essai = args.includes('--essai');
const E = essai ? '(essai) ' : '';
const seul = (args.find((a) => a.startsWith('--seul=')) || '').split('=')[1] || null;

const MARQUE = 'oracle-nom-client-publie';
// La marque du SECOND hameçon est le nom de son lanceur, pour la raison exacte qui a fait choisir
// celle du premier : elle sert à reconnaître NOTRE hameçon d'un `pre-commit` étranger, et un texte
// qui n'apparaît nulle part ailleurs est le seul repère qui ne mente pas.
const MARQUE_COMMIT = 'pre-commit-anonymiser';

// TF-0994 (08/09/2026) — LA PROPRIÉTÉ SE RECONNAÎT À UNE SIGNATURE, JAMAIS À UNE SOUS-CHAÎNE.
// L'installeur reconnaissait « son » hameçon en cherchant sa marque DANS le fichier. Or la marque
// est un nom de fichier : le pre-commit du pilot appelle `todo/pre-commit-anonymise.mjs`, et une
// seule lettre le séparait d'un hameçon étranger que l'installeur aurait ÉCRASÉ en affichant
// « REPOSE ». La propriété tient désormais à une LIGNE ENTIÈRE, écrite par l'installeur seul et
// comparée telle quelle. Un hameçon posé avant cette version ne la porte pas : il est classé
// CONFLIT, et `--migrer` le reprend — geste explicite, décidé, jamais implicite.
const SIGNATURE = 'pre-push-nom-client';
const SIGNATURE_COMMIT = 'pre-commit-anonymiser';
const ligneSignature = (id) => `# hamecon-parc: ${id} v1`;
// TF-1360 — l'identifiant fait la propriété, quelle que soit la version écrite après lui.
const estSignature = (ligne, id) => new RegExp(`^# hamecon-parc: ${id} v\\d+$`).test(ligne.trimEnd());
// TF-1402 — les deux lignes qui bornent la section propre d'un dépôt dans le pre-push.
const DEBUT_PROLONGEMENT = '# >>> prolongement local >>>';
const FIN_PROLONGEMENT = '# <<< prolongement local <<<';

const HAMECON = `#!/bin/sh
${ligneSignature(SIGNATURE)}
# pre-push — refuse une publication portant un nom de client (${MARQUE}).
# Posé par installer-hamecon-publication.mjs. Contournement explicite : git push --no-verify.
#
# SIGPIPE IGNORÉ, EN PREMIÈRE COMMANDE (TF-1360, 24/09/2026). Quand la sortie de git push part
# dans un filtre qui a déjà fini (un grep en échec), le premier écho de ce hameçon sur la sortie
# d'erreur le tue par SIGPIPE ; sous Windows, git lit alors un code 0 et PUBLIE malgré le refus
# (mesuré : 13 envois partis ainsi). Le signal ignoré, l'écho échoue sans rien tuer et le hameçon
# va jusqu'à son exit 1. Aucune commande ne doit passer avant cette ligne.
trap '' PIPE
#
# L'oracle est cherché d'abord dans la copie INSTALLÉE des skills, parce que c'est elle qui
# s'exécute (même doctrine que le contrôle d'alignement des skills), puis dans la source.
#
# LES CHEMINS DES DEUX TABLES NE SONT PAS GRAVÉS ICI, ET C'EST UN CHOIX (TF-0887, 08/09/2026).
# Un chemin résolu à l'INSTALLATION est vrai le jour de la pose et périme en silence : les tables
# ont déménagé le 07/09, et un hameçon posé la veille aurait pointé un fichier disparu sans que
# rien ne le dise. Pire, un hameçon est posé sur les dépôts d'un poste et le même geste se rejoue
# sur l'autre, où la racine n'est pas au même endroit. La porte, elle, résout ses tables À CHAQUE
# APPEL — variables d'environnement, puis <racine>/_confidentiel/tables/, puis les anciens
# fichiers libres — et NOMME au non_juge la piste qu'elle a retenue. Le hameçon lui laisse donc
# ce travail et se contente de RÉPÉTER ce qu'elle dit. Une seule échelle de résolution dans le
# parc, tenue à un seul endroit.
RACINE="\${FORGE_ROOT:-$(cd "$(git rev-parse --show-toplevel)/.." && pwd)}"
ORACLE=""
for CANDIDAT in \\
  "$HOME/.claude/skills/quality-oracles/scripts/${MARQUE}.mjs" \\
  "$RACINE/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/${MARQUE}.mjs"
do
  [ -f "$CANDIDAT" ] && ORACLE="$CANDIDAT" && break
done

if [ -z "$ORACLE" ]; then
  echo "PUBLICATION REFUSEE — l'oracle de nom de client est introuvable." >&2
  echo "  cherche dans : ~/.claude/skills/... puis \\$RACINE/digit-ai-forge-agents/..." >&2
  echo "  Un garde-fou absent ne se remplace pas par un passage en force silencieux." >&2
  echo "  Contournement explicite si vous savez ce que vous faites : git push --no-verify" >&2
  exit 1
fi

# Une section propre a CE depot (ex. la borne R-38 du pilot) s'ecrit entre les deux lignes
# suivantes : l'installeur la recopie a chaque repose (TF-1402). Hors d'elles, tout est reecrit.
${DEBUT_PROLONGEMENT}
${FIN_PROLONGEMENT}

# --- R-38 par. 4-5 : la BORNE du GO, portee par le gabarit (TF-1275, 12/10/2026) ----------------
# Le pre-push du pilot portait cette section ecrite a la main, et une repose par l'installeur
# l'effacait sans bruit. Elle ne joue que dans un depot qui porte scripts/verifier-avance-publication.mjs
# (le pilot) ; ailleurs, elle ne fait rien. Avant la porte des noms de client, elle classe ce qui est
# en avance sur l'origine : restitution et candidatures en \`candidat\` passent d'office ; tout
# enregistrement portant une decision, une cloture, une regle ou un contenu de produit exige le GO
# humain explicite, declare par FORGE_PUSH_GO="<motif>".
DEPOT="$(git rev-parse --show-toplevel)"
if [ -f "$DEPOT/scripts/verifier-avance-publication.mjs" ]; then
  if [ -n "$FORGE_PUSH_GO" ]; then
    node "$DEPOT/scripts/verifier-avance-publication.mjs" --go "$FORGE_PUSH_GO" >/dev/null 2>&1 || { echo "PUBLICATION REFUSEE - verifier-avance-publication : motif de GO invalide." >&2; exit 1; }
  else
    SORTIE_AVANCE="$(node "$DEPOT/scripts/verifier-avance-publication.mjs" 2>&1)" || {
      echo "PUBLICATION REFUSEE - un enregistrement en avance exige le GO humain explicite (R-38 par. 4-5) :" >&2
      printf '%s\\n' "$SORTIE_AVANCE" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{try{const o=JSON.parse(t);for(const e of (o.enregistrements||[]).filter(x=>x.classe==="explicite"))console.error("  - "+e.sha+" "+(e.sujet||"").slice(0,80)+" : "+(e.fichiers_hors_classe||[]).join(", "))}catch{console.error(t.slice(0,800))}})' >&2
      echo "  Avec le GO humain en main : FORGE_PUSH_GO=\\"D-N (x) du JJ/MM\\" git push ..." >&2
      exit 1
    }
  fi
fi

# --- L'histoire jugee : les seules revisions que l'envoi ajoute (TF-1555, 12/10/2026) -----------
# git donne sur l'entree une ligne par reference envoyee : <ref locale> <empreinte locale>
# <ref distante> <empreinte distante>. La porte rejugeait toute l'histoire a chaque envoi (9 min 11 s
# au pilot le 27/09/2026) ; elle ne juge plus que les revisions absentes du distant, et l'arbre
# courant entier. Sans aucune ligne lue, elle juge toute l'histoire, comme avant.
REVS=""
while read -r REF_LOCALE SHA_LOCAL REF_DISTANTE SHA_DISTANT; do
  case "$SHA_LOCAL" in *[!0]*) REVS="$REVS,$SHA_LOCAL" ;; esac
  case "$SHA_DISTANT" in *[!0]*) git cat-file -e "$SHA_DISTANT^{commit}" 2>/dev/null && REVS="$REVS,^$SHA_DISTANT" ;; esac
done
ARG_REVS=""
if [ -n "$REVS" ]; then
  ARG_REVS="--revs=\${REVS#,}"
  git remote get-url "$1" >/dev/null 2>&1 && ARG_REVS="$ARG_REVS,--not,--remotes=$1"
fi

SORTIE="$(node "$ORACLE" "$DEPOT" \${ARG_REVS:+"$ARG_REVS"} 2>&1)"
VERDICT="$(printf '%s' "$SORTIE" | sed -n 's/.*"verdict":"\\([A-Z]*\\)".*/\\1/p')"

if [ "$VERDICT" = "PASS" ]; then
  exit 0
fi

echo "" >&2
echo "PUBLICATION REFUSEE — verdict \${VERDICT:-ILLISIBLE} de ${MARQUE}." >&2
if [ "$VERDICT" = "SKIP" ]; then
  echo "  SKIP bloque AUSSI : un oracle qui ne peut pas mesurer ne doit pas laisser passer." >&2
  echo "  Le motif de la porte est repete EN CLAIR ci-dessous — un refus sans motif se contourne a l aveugle." >&2
fi
printf '%s' "$SORTIE" | QO_VERDICT="$VERDICT" node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try {
      const o = JSON.parse(t);
      // Sur SKIP, le non_juge N EST PAS un appendice : il EST le motif du refus, et le borner a
      // trois lignes revient a refuser sans dire pourquoi. Sur FAIL, les constats portent le
      // motif et le non_juge reste un appendice — il garde donc sa borne.
      const skip = process.env.QO_VERDICT === "SKIP";
      // TF-1554 (27/09/2026) : les antériorités ne refusent rien. Mêlées aux bloquants dans les
      // 40 premières lignes, elles noyaient le motif (4 bloquants et 36 antériorités, mesuré au
      // pilot). Les COMPTES d abord, puis les seuls bloquants, puis le nombre d antériorités tues.
      const tous = o.findings || [];
      const bloq = tous.filter((f) => f.sev !== "anteriorite");
      const c = o.comptes || {};
      const nBloq = c.bloquants && Number.isFinite(c.bloquants.total) ? c.bloquants.total : bloq.length;
      const nAnter = c.anteriorites && Number.isFinite(c.anteriorites.total) ? c.anteriorites.total : tous.length - bloq.length;
      if (!skip) console.error("  " + nBloq + " constat(s) BLOQUANT(S), ce qui refuse l envoi ; " + nAnter + " anteriorite(s), non bloquante(s)");
      for (const f of bloq.slice(0, 40)) console.error("  " + (f.regle || "") + "  " + (f.where || "") + "  " + f.msg);
      if (nBloq > Math.min(bloq.length, 40)) console.error("  ... " + (nBloq - Math.min(bloq.length, 40)) + " autre(s) constat(s) bloquant(s) non imprime(s) ici");
      if (!skip && nAnter) console.error("  " + nAnter + " anteriorite(s) tue(s) ici : elles ne refusent rien (passif de l historique, compte au non_juge de la porte)");
      for (const n of (o.non_juge || []).slice(0, skip ? 12 : 3)) console.error(skip ? "  porte SKIP : " + n : "  · " + n);
    } catch { console.error(t.slice(0, 2000)); }
  });
' >&2
echo "" >&2
echo "  Corrigez, ou contournez EXPLICITEMENT : git push --no-verify" >&2
exit 1
`;

// LE HAMEÇON DE COMMIT — il CORRIGE, il ne refuse pas (TF-0980).
//
// Le lanceur est CHERCHÉ, jamais gravé, pour la raison exacte du `pre-push` : un chemin résolu à
// l'installation est vrai le jour de la pose et périme en silence, et le même geste se rejoue sur
// un poste où la racine n'est pas au même endroit. La copie INSTALLÉE passe d'abord, parce que
// c'est elle qui s'exécute ; la source de la forge des outils sert de repli.
const HAMECON_COMMIT = `#!/bin/sh
${ligneSignature(SIGNATURE_COMMIT)}
# pre-commit — le nom est retire AVANT que le commit n'existe (${MARQUE_COMMIT}).
# Pose par installer-hamecon-publication.mjs. Contournement explicite : git commit --no-verify.
#
# SIGPIPE ignore, en premiere commande (TF-1360) : si la sortie du commit part dans un filtre deja
# termine, un echo de refus tuerait ce hamecon par SIGPIPE, et git lirait (sous Windows) un code 0.
trap '' PIPE
#
# Il CORRIGE le contenu indexe et le RE-INDEXE : dans le cas normal, aucun refus, aucune
# interruption. Il ne refuse que dans deux cas -- tables illisibles, ou NOM de fichier porteur --
# et le dit alors avec la commande exacte. Il ne juge que l'INDEX, jamais l'histoire : son cout est
# de quelques millisecondes, la ou la porte de publication juge toute l'histoire (23 s mesurees le
# 28/09/2026 sur le depot du pilot avec des tables jetables, TF-1448 ; 15 a 27 minutes avant).
RACINE="\${FORGE_ROOT:-$(cd "$(git rev-parse --show-toplevel)/.." && pwd)}"
LANCEUR=""
for CANDIDAT in \\
  "$HOME/.claude/skills/quality-oracles/scripts/${MARQUE_COMMIT}.mjs" \\
  "$RACINE/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/${MARQUE_COMMIT}.mjs"
do
  [ -f "$CANDIDAT" ] && LANCEUR="$CANDIDAT" && break
done

if [ -z "$LANCEUR" ]; then
  echo "COMMIT REFUSE — le lanceur d'anonymisation est introuvable." >&2
  echo "  cherche dans : ~/.claude/skills/... puis \\$RACINE/digit-ai-forge-agents/..." >&2
  echo "  Un anonymiseur qui ne peut pas anonymiser ne doit pas laisser passer." >&2
  echo "  Contournement explicite si vous savez ce que vous faites : git commit --no-verify" >&2
  exit 1
fi

exec node "$LANCEUR"
`;

// LE HAMEÇON DE MESSAGE — TF-1071 (13/09/2026). Le pre-commit juge l'INDEX, jamais le message ; le
// pre-push juge tout, messages compris, mais après le commit. Un nom de produit entré dans un message
// y a vécu deux jours et n'a pu sortir qu'en réécrivant 23 enregistrements. Ce hameçon joue la même
// porte sur le SEUL message, à l'écriture : un refus d'une seconde au lieu d'une réécriture d'histoire.
const SIGNATURE_MSG = 'commit-msg-nom-client';
const HAMECON_MSG = `#!/bin/sh
${ligneSignature(SIGNATURE_MSG)}
# commit-msg — refuse un MESSAGE de commit portant un nom de client ou de produit (${MARQUE}).
# Pose par installer-hamecon-publication.mjs. Contournement explicite : git commit --no-verify.
# Le pre-push reste le filet : il juge toute l'histoire, messages compris.
#
# SIGPIPE ignore, en premiere commande (TF-1360) : si la sortie du commit part dans un filtre deja
# termine, l'echo du refus tuerait ce hamecon par SIGPIPE, et git lirait (sous Windows) un code 0 :
# le message porteur serait enregistre.
trap '' PIPE
RACINE="\${FORGE_ROOT:-$(cd "$(git rev-parse --show-toplevel)/.." && pwd)}"
ORACLE=""
for CANDIDAT in \\
  "$HOME/.claude/skills/quality-oracles/scripts/${MARQUE}.mjs" \\
  "$RACINE/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/${MARQUE}.mjs"
do
  [ -f "$CANDIDAT" ] && ORACLE="$CANDIDAT" && break
done

if [ -z "$ORACLE" ]; then
  echo "MESSAGE REFUSE — l'oracle de nom de client est introuvable." >&2
  echo "  Contournement explicite si vous savez ce que vous faites : git commit --no-verify" >&2
  exit 1
fi

DEPOT="$(git rev-parse --show-toplevel)"
SORTIE="$(node "$ORACLE" "$DEPOT" --message="$1" 2>&1)"
VERDICT="$(printf '%s' "$SORTIE" | sed -n 's/.*"verdict":"\\([A-Z]*\\)".*/\\1/p')"
if [ "$VERDICT" = "PASS" ]; then
  exit 0
fi
echo "" >&2
echo "MESSAGE REFUSE — verdict \${VERDICT:-ILLISIBLE} de ${MARQUE} sur le message de commit." >&2
printf '%s' "$SORTIE" | node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try {
      const o = JSON.parse(t);
      for (const f of (o.findings || [])) console.error("  " + (f.regle || "") + "  " + (f.where || "") + "  " + f.msg);
      for (const n of (o.non_juge || []).slice(0, 12)) console.error("  · " + n);
    } catch { console.error(t.slice(0, 2000)); }
  });
' >&2
echo "  Corrigez le message, ou contournez EXPLICITEMENT : git commit --no-verify" >&2
exit 1
`;

// LE HAMEÇON DES DÉPÔTS QUI PORTENT DES SKILLS — TF-1337 (26/09/2026). Le skill `accueil-factory`
// est entré au dépôt le 22/09 avec une description de plus de 1 024 caractères : la recette de
// quality-oracles l'aurait refusé, mais rien ne la jouait avant l'enregistrement, et elle coûte
// plus de six minutes. Ce hameçon joue le contrôle RAPIDE du frontmatter des seuls skills de
// l'index (frontmatter-skills-index.mjs, même barème que la recette). Il N'EST PAS dans le jeu
// par défaut : il se pose sur demande (`--seul=pre-commit-skills`), sur un dépôt qui porte des
// skills. Un dépôt n'a qu'UN pre-commit : là où celui d'anonymisation est posé, l'installeur dit
// CONFLIT et ne touche à rien — les chaîner est une décision du pilot.
const MARQUE_SKILLS = 'frontmatter-skills-index';
const SIGNATURE_SKILLS = 'pre-commit-skills';
const HAMECON_SKILLS = `#!/bin/sh
${ligneSignature(SIGNATURE_SKILLS)}
# pre-commit — le frontmatter des skills TOUCHES est juge avant que le commit n'existe (${MARQUE_SKILLS}).
# Pose par installer-hamecon-publication.mjs --seul=pre-commit-skills. Contournement explicite : git commit --no-verify.
#
# SIGPIPE ignore, en premiere commande (TF-1360) : si la sortie du commit part dans un filtre deja
# termine, l'echo du refus tuerait ce hamecon par SIGPIPE, et git lirait (sous Windows) un code 0.
trap '' PIPE
#
# Meme bareme que la recette de quality-oracles, lu dans l'INDEX : description de 1024 caracteres
# au plus, name et description presents. Seuls les skills dont un fichier est indexe sont lus.
RACINE="\${FORGE_ROOT:-$(cd "$(git rev-parse --show-toplevel)/.." && pwd)}"
CONTROLE=""
for CANDIDAT in \\
  "$HOME/.claude/skills/quality-oracles/scripts/${MARQUE_SKILLS}.mjs" \\
  "$RACINE/digit-ai-forge-agents/.claude/skills/quality-oracles/scripts/${MARQUE_SKILLS}.mjs"
do
  [ -f "$CANDIDAT" ] && CONTROLE="$CANDIDAT" && break
done

if [ -z "$CONTROLE" ]; then
  echo "COMMIT REFUSE — le controle du frontmatter des skills est introuvable." >&2
  echo "  cherche dans : ~/.claude/skills/... puis \\$RACINE/digit-ai-forge-agents/..." >&2
  echo "  Contournement explicite si vous savez ce que vous faites : git commit --no-verify" >&2
  exit 1
fi

if node "$CONTROLE" "$(git rev-parse --show-toplevel)"; then
  exit 0
fi
echo "  Corrigez le frontmatter, ou contournez EXPLICITEMENT : git commit --no-verify" >&2
exit 1
`;

// LE HAMEÇON D'ENVOI DU CANAL CONFIDENTIEL — décision D-30 (a) du 27/09/2026. La porte des noms ne
// peut pas juger le canal : ses tables SONT les noms, et elle y rend 144 bloquants par construction
// (mesuré le 27/09). Le pre-push du parc y refuserait donc chaque envoi, et le pre-commit
// d'anonymisation réécrirait les tables elles-mêmes. Le risque propre au canal est ailleurs : qu'il
// devienne PUBLIC et reçoive les noms, ou qu'un secret y entre. Son contrôle (`oracle-confidentiel.mjs`)
// juge les deux — K1 dépôt privé chez l'hébergeur, K3 aucun secret, et ses autres règles —, mais il
// n'était joué qu'à l'ouverture d'une session, jamais avant un envoi : un envoi vers un canal devenu
// public serait parti, et l'ouverture suivante l'aurait vu trop tard.
//
// LE CONTRÔLE EST CELUI DU DÉPÔT, jamais une copie : il vit à la racine du canal et voyage avec lui.
// Le hameçon ne le cherche ni dans les skills installés ni dans la forge. Un dépôt sans ce contrôle
// n'est pas le canal : l'envoi est refusé, et le refus le dit.
//
// ACCEPTER SUR LE SEUL CODE DE SORTIE, C'EST FABRIQUER UN VERT (TF-1373, 27/09/2026) : un contrôle qui
// sort en 0 sans rien juger a déjà rendu six PASS vides au pilot. Le hameçon exige donc les DEUX, le
// code 0 ET le verdict PASS lu dans la sortie ; tout le reste refuse, sortie illisible comprise.
//
// Sur demande seulement (`--seul=pre-push-canal`), jamais dans le jeu par défaut : il n'a de sens que
// sur le canal. Là où le pre-push du parc est déjà posé, l'installeur dit CONFLIT et ne touche à rien.
const MARQUE_CANAL = 'oracle-confidentiel';
const SIGNATURE_CANAL = 'pre-push-canal';
const HAMECON_CANAL = `#!/bin/sh
${ligneSignature(SIGNATURE_CANAL)}
# pre-push du CANAL CONFIDENTIEL — refuse un envoi quand le controle du canal echoue (${MARQUE_CANAL}).
# Pose par installer-hamecon-publication.mjs --seul=pre-push-canal (decision D-30 (a) du 27/09/2026).
# Contournement explicite : git push --no-verify.
#
# SIGPIPE ignore, en premiere commande (TF-1360) : si la sortie de git push part dans un filtre deja
# termine, l'echo du refus tuerait ce hamecon par SIGPIPE, et git lirait (sous Windows) un code 0.
trap '' PIPE
#
# Le controle est celui du DEPOT : il vit a la racine du canal et voyage avec lui. Il juge que le
# depot distant est PRIVE chez l'hebergeur (K1), qu'aucun fichier ne ressemble a un secret (K3), et
# ses autres regles. L'envoi passe sur code 0 ET verdict PASS lu dans la sortie, jamais sur l'un seul.
DEPOT="$(git rev-parse --show-toplevel)"
CONTROLE="$DEPOT/${MARQUE_CANAL}.mjs"
if [ ! -f "$CONTROLE" ]; then
  echo "ENVOI REFUSE — le controle du canal est introuvable : $CONTROLE" >&2
  echo "  Ce hamecon ne vaut que sur le canal confidentiel, dont le controle vit a la racine du depot." >&2
  echo "  Contournement explicite si vous savez ce que vous faites : git push --no-verify" >&2
  exit 1
fi

SORTIE="$(node "$CONTROLE" "$DEPOT" 2>&1)"
CODE=$?
VERDICT="$(printf '%s' "$SORTIE" | node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try { process.stdout.write(String(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).verdict || "")); }
    catch { process.stdout.write(""); }
  });')"
if [ "$CODE" -eq 0 ] && [ "$VERDICT" = "PASS" ]; then
  exit 0
fi

echo "" >&2
echo "ENVOI DU CANAL REFUSE — verdict \${VERDICT:-ILLISIBLE} du controle du canal (exit $CODE)." >&2
printf '%s' "$SORTIE" | node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try {
      const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      for (const c of (o.constats || []).filter((x) => x.statut !== "PASS")) console.error("  " + (c.regle || "") + "  " + (c.message || ""));
    } catch { console.error("  sortie illisible : " + t.slice(0, 2000)); }
  });
' >&2
echo "  Corrigez, ou contournez EXPLICITEMENT : git push --no-verify" >&2
exit 1
`;

// LES HAMEÇONS PASSENT PAR LE MÊME GESTE, et c'est ce qui garantit qu'ils se posent, se
// reposent, se vérifient et se retirent de la même façon. Un second hameçon traité par un second
// bloc de code recopié dériverait du premier au premier correctif. `id` distingue deux gabarits
// d'un même hameçon git ; `surDemande` en retire un du jeu par défaut.
const HAMECONS = [
  { nom: 'pre-push', marque: MARQUE, sigId: SIGNATURE, contenu: HAMECON },
  { nom: 'pre-commit', marque: MARQUE_COMMIT, sigId: SIGNATURE_COMMIT, contenu: HAMECON_COMMIT },
  { nom: 'commit-msg', marque: MARQUE, sigId: SIGNATURE_MSG, contenu: HAMECON_MSG },
  { id: 'pre-commit-skills', nom: 'pre-commit', marque: MARQUE_SKILLS, sigId: SIGNATURE_SKILLS,
    contenu: HAMECON_SKILLS, surDemande: true },
  { id: 'pre-push-canal', nom: 'pre-push', marque: MARQUE_CANAL, sigId: SIGNATURE_CANAL,
    contenu: HAMECON_CANAL, surDemande: true },
];
const cle = (h) => h.id || h.nom;
const migrer = args.includes('--migrer');
// NÔTRE = une ligne de signature de CET identifiant, entière (TF-1360 : quelle que soit sa
// version). ANCIEN = la marque sans la signature : un hameçon posé avant TF-0994, OU un étranger
// qui cite la marque — indiscernables par le texte, d'où le geste explicite `--migrer`.
const lignes = (txt) => txt.split(/\r?\n/);
const estNotre = (txt, h) => lignes(txt).some((l) => estSignature(l, h.sigId));
const estAncien = (txt, h) => !estNotre(txt, h) && txt.includes(h.marque);

// TF-1402 — la section propre : les lignes STRICTEMENT entre les deux marqueurs (null sans eux).
function prolongementDe(txt) {
  const L = lignes(txt);
  const i = L.findIndex((l) => l.trimEnd() === DEBUT_PROLONGEMENT);
  const j = L.findIndex((l) => l.trimEnd() === FIN_PROLONGEMENT);
  return i >= 0 && j > i ? L.slice(i + 1, j) : null;
}
const horsProlongement = (txt) => {
  const L = lignes(txt);
  const i = L.findIndex((l) => l.trimEnd() === DEBUT_PROLONGEMENT);
  const j = L.findIndex((l) => l.trimEnd() === FIN_PROLONGEMENT);
  return (i >= 0 && j > i ? [...L.slice(0, i + 1), ...L.slice(j)] : L).map((l) => l.trimEnd()).join('\n').trimEnd();
};
const nonVide = (section) => !!section && section.some((l) => l.trim());
// Le gabarit, sa section propre remplie par celle du hameçon en place ; null si le gabarit n'a pas
// de section et que le hameçon en place en porte une : on ne la perd pas, on dit CONFLIT.
function contenuAvec(h, section) {
  if (!nonVide(section)) return h.contenu;
  const L = h.contenu.split('\n');
  const i = L.findIndex((l) => l === DEBUT_PROLONGEMENT);
  return i < 0 ? null : [...L.slice(0, i + 1), ...section, ...L.slice(i + 1)].join('\n');
}
// Les lignes de CODE d'un hameçon en place, hors section propre, que le gabarit n'a pas.
const code = (txt) => lignes(txt).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const lignesPropres = (txt, h) => { const g = new Set(code(h.contenu)); return code(horsProlongement(txt)).filter((l) => !g.has(l)); };
const perime = (txt, h) => horsProlongement(txt) !== horsProlongement(h.contenu);
// Sans `--seul`, le jeu par défaut ; `--retirer` emporte aussi un hameçon posé sur demande.
const choisis = seul ? HAMECONS.filter((h) => cle(h) === seul) : HAMECONS.filter((h) => retirer || !h.surDemande);
if (!choisis.length) {
  console.error(`--seul=${seul} : hameçon inconnu. Attendu : ` + HAMECONS.map(cle).join(' ou '));
  process.exit(2);
}

let poses = 0, retires = 0, absents = 0, deja = 0;
for (const d of depots) {
  const hooks = path.join(d, '.git', 'hooks');
  if (!fs.existsSync(hooks)) { console.log(`  ABSENT   ${d} — pas de dépôt git ici`); absents++; continue; }

  for (const h of choisis) {
    const cible = path.join(hooks, h.nom);
    const etiquette = `${cle(h).padEnd(10)} ${d}`;

    const txtCible = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
    // TF-1402 — un ancien qui porte du code hors du gabarit est un PROLONGEMENT : jamais migré.
    const propres = txtCible !== null && estAncien(txtCible, h) ? lignesPropres(txtCible, h) : [];
    const ditPropres = () => `PROLONGÉ — porte la marque sans la signature, et ${propres.length} ligne(s) de code `
      + `absente(s) du gabarit (1re : « ${propres[0].slice(0, 80)} ») : --migrer l'effacerait. Entourer la `
      + `section propre des lignes « ${DEBUT_PROLONGEMENT} » et « ${FIN_PROLONGEMENT} », ajouter `
      + `« ${ligneSignature(h.sigId)} » en 2e ligne, puis relancer l'installeur ; ou, si ce n'est qu'un `
      + `ancien gabarit du parc, le supprimer puis relancer l'installeur (TF-1402)`;
    const reprendre = txtCible !== null && (estNotre(txtCible, h) || (migrer && estAncien(txtCible, h) && !propres.length));

    if (verifier) {
      const present = txtCible !== null && estNotre(txtCible, h);
      const ancien = txtCible !== null && estAncien(txtCible, h);
      const vieux = present && perime(txtCible, h);
      // TF-1275 — un hameçon étranger (le pre-commit propre au pilot, par exemple) n'est pas un manque :
      // il est compté non posé par ce contrôle, mais il se nomme ETRANGER, jamais MANQUANT.
      const etranger = txtCible !== null && !present && !ancien;
      console.log(`  ${vieux ? 'PERIME  ' : present ? 'POSE    ' : ancien && propres.length ? 'PROLONGE' : ancien ? 'A-MIGRER' : etranger ? 'ETRANGER' : 'MANQUANT'} ${etiquette}`
        + (vieux ? ' — signé, mais différent du gabarit courant (section propre exceptée) : relancer sans --verifier pour le reposer (TF-1360)'
          : ancien && propres.length ? ' — ' + ditPropres()
          : ancien ? ' — porte la marque sans la signature (TF-0994) : --migrer'
          : etranger ? ` — un ${h.nom} qui n'est pas de ce gabarit est posé : l'installeur n'y touche pas (--seul pour ne pas le viser)` : ''));
      present && !vieux ? poses++ : absents++;
      continue;
    }

    if (retirer) {
      if (reprendre) { if (!essai) fs.rmSync(cible); console.log(`  ${E}RETIRE   ${etiquette}`); retires++; }
      else console.log(`  RIEN     ${etiquette} — aucun hameçon signé de ce contrôle`);
      continue;
    }

    // JAMAIS écraser un hameçon qui n'est pas le nôtre : un hook étranger porte le travail
    // de quelqu'un d'autre, et l'écraser en silence est le genre de geste qu'on découvre trois
    // semaines plus tard. Le conflit se DIT, il ne se résout pas tout seul.
    if (txtCible !== null) {
      if (!reprendre) {
        // TF-1337 — deux gabarits du parc se disputent le même hameçon git : le dire tel quel.
        const autre = lignes(txtCible).find((l) => l.startsWith('# hamecon-parc:') && !estSignature(l, h.sigId));
        const motif = estAncien(txtCible, h) && propres.length ? ditPropres()
          : estAncien(txtCible, h)
          ? `porte la marque « ${h.marque} » sans la signature — ancien hameçon du parc, ou étranger qui la cite : --migrer pour le reprendre`
          : autre ? `un autre ${h.nom} du parc est déjà posé (« ${autre.trim()} ») — un dépôt n'a qu'un ${h.nom}`
          : `un ${h.nom} ÉTRANGER existe déjà`;
        console.log(`  CONFLIT  ${etiquette} — ${motif}, rien touché`); absents++; continue;
      }
      const migre = !estNotre(txtCible, h);
      // TF-1402 — la section propre en place passe dans le gabarit ; sans place pour elle, on ne
      // la perd pas : CONFLIT, rien touché.
      const section = prolongementDe(txtCible);
      const contenu = contenuAvec(h, section);
      if (contenu === null) {
        console.log(`  CONFLIT  ${etiquette} — porte une section « ${DEBUT_PROLONGEMENT} » que le gabarit de ce ${h.nom} `
          + `n'a pas : la reposer l'effacerait, rien touché (TF-1402)`); absents++; continue;
      }
      if (!essai) fs.writeFileSync(cible, contenu, { mode: 0o755 });
      console.log(`  ${E}${migre ? 'MIGRE   ' : 'REPOSE  '} ${etiquette}`
        + (nonVide(section) ? ` — section propre conservée (${section.length} ligne(s), TF-1402)` : '')); deja++; continue;
    }
    if (!essai) fs.writeFileSync(cible, h.contenu, { mode: 0o755 });
    console.log(`  ${E}POSE     ${etiquette}`);
    poses++;
  }
}
console.log(verifier ? `\n${poses} posé(s), ${absents} manquant(s)`
  : retirer ? `\n${E}${retires} retiré(s)` + (essai ? " — ESSAI : rien n'a été retiré" : '')
  : `\n${E}${poses} posé(s), ${deja} reposé(s), ${absents} non traité(s)` + (essai ? " — ESSAI : rien n'a été écrit" : ''));
process.exit(verifier && absents ? 1 : 0);
