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
// l'historique, coûte trois à cinq minutes sur le plus gros dépôt du parc, et se rencontre
// quelques fois par jour. Le `pre-commit` CORRIGE : il ne juge que l'INDEX, coûte quelques
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
// Usage : node installer-hamecon-publication.mjs <depot…> [--retirer] [--verifier]
//         [--seul=pre-push|pre-commit] pour n'agir que sur l'un des deux.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const depots = args.filter((a) => !a.startsWith('--'));
const retirer = args.includes('--retirer');
const verifier = args.includes('--verifier');
const seul = (args.find((a) => a.startsWith('--seul=')) || '').split('=')[1] || null;

const MARQUE = 'oracle-nom-client-publie';
// La marque du SECOND hameçon est le nom de son lanceur, pour la raison exacte qui a fait choisir
// celle du premier : elle sert à reconnaître NOTRE hameçon d'un `pre-commit` étranger, et un texte
// qui n'apparaît nulle part ailleurs est le seul repère qui ne mente pas.
const MARQUE_COMMIT = 'pre-commit-anonymiser';

const HAMECON = `#!/bin/sh
# pre-push — refuse une publication portant un nom de client (${MARQUE}).
# Posé par installer-hamecon-publication.mjs. Contournement explicite : git push --no-verify.
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

DEPOT="$(git rev-parse --show-toplevel)"
SORTIE="$(node "$ORACLE" "$DEPOT" 2>&1)"
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
      for (const f of (o.findings || []).slice(0, 40)) console.error("  " + (f.regle || "") + "  " + (f.where || "") + "  " + f.msg);
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
# pre-commit — le nom est retire AVANT que le commit n'existe (${MARQUE_COMMIT}).
# Pose par installer-hamecon-publication.mjs. Contournement explicite : git commit --no-verify.
#
# Il CORRIGE le contenu indexe et le RE-INDEXE : dans le cas normal, aucun refus, aucune
# interruption. Il ne refuse que dans deux cas -- tables illisibles, ou NOM de fichier porteur --
# et le dit alors avec la commande exacte. Il ne juge que l'INDEX, jamais l'histoire : son cout est
# de quelques millisecondes, la ou la porte de publication prend trois a cinq minutes.
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

// LES DEUX HAMEÇONS PASSENT PAR LE MÊME GESTE, et c'est ce qui garantit qu'ils se posent, se
// reposent, se vérifient et se retirent de la même façon. Un second hameçon traité par un second
// bloc de code recopié dériverait du premier au premier correctif.
const HAMECONS = [
  { nom: 'pre-push', marque: MARQUE, contenu: HAMECON },
  { nom: 'pre-commit', marque: MARQUE_COMMIT, contenu: HAMECON_COMMIT },
];
const choisis = seul ? HAMECONS.filter((h) => h.nom === seul) : HAMECONS;
if (!choisis.length) {
  console.error(`--seul=${seul} : hameçon inconnu. Attendu : ` + HAMECONS.map((h) => h.nom).join(' ou '));
  process.exit(2);
}

let poses = 0, retires = 0, absents = 0, deja = 0;
for (const d of depots) {
  const hooks = path.join(d, '.git', 'hooks');
  if (!fs.existsSync(hooks)) { console.log(`  ABSENT   ${d} — pas de dépôt git ici`); absents++; continue; }

  for (const h of choisis) {
    const cible = path.join(hooks, h.nom);
    const etiquette = `${h.nom.padEnd(10)} ${d}`;

    if (verifier) {
      const present = fs.existsSync(cible) && fs.readFileSync(cible, 'utf8').includes(h.marque);
      console.log(`  ${present ? 'POSE    ' : 'MANQUANT'} ${etiquette}`);
      present ? poses++ : absents++;
      continue;
    }

    if (retirer) {
      if (fs.existsSync(cible) && fs.readFileSync(cible, 'utf8').includes(h.marque)) { fs.rmSync(cible); console.log(`  RETIRE   ${etiquette}`); retires++; }
      else console.log(`  RIEN     ${etiquette} — aucun hameçon de ce contrôle`);
      continue;
    }

    // JAMAIS écraser un hameçon qui n'est pas le nôtre : un hook étranger porte le travail
    // de quelqu'un d'autre, et l'écraser en silence est le genre de geste qu'on découvre trois
    // semaines plus tard. Le conflit se DIT, il ne se résout pas tout seul.
    if (fs.existsSync(cible)) {
      const txt = fs.readFileSync(cible, 'utf8');
      if (!txt.includes(h.marque)) { console.log(`  CONFLIT  ${etiquette} — un ${h.nom} ÉTRANGER existe déjà, rien touché`); absents++; continue; }
      fs.writeFileSync(cible, h.contenu, { mode: 0o755 });
      console.log(`  REPOSE   ${etiquette}`); deja++; continue;
    }
    fs.writeFileSync(cible, h.contenu, { mode: 0o755 });
    console.log(`  POSE     ${etiquette}`);
    poses++;
  }
}
console.log(verifier ? `\n${poses} posé(s), ${absents} manquant(s)`
  : retirer ? `\n${retires} retiré(s)`
  : `\n${poses} posé(s), ${deja} reposé(s), ${absents} non traité(s)`);
process.exit(verifier && absents ? 1 : 0);
