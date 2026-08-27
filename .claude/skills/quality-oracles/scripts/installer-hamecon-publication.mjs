#!/usr/bin/env node
// installer-hamecon-publication — pose (ou retire) le hameçon `pre-push` qui refuse une
// publication portant un nom de client.
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
//     absent) ne doit pas laisser passer. Laisser filer sur SKIP, c'est fabriquer un vert ;
//   · PASS → exit 0, la publication suit son cours ;
//   · il ne juge PAS ce qui est déjà publié — il empêche d'en ajouter. Le rattrapage de
//     l'existant est un run, pas un hameçon.
//
// CONTOURNEMENT ASSUMÉ : `git push --no-verify` passe outre. C'est voulu — un garde-fou qu'on ne
// peut pas lever en connaissance de cause se fait arracher au lieu d'être discuté. Le contournement
// est un geste EXPLICITE, pas un défaut.
//
// Usage : node installer-hamecon-publication.mjs <depot…> [--retirer] [--verifier]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const depots = args.filter((a) => !a.startsWith('--'));
const retirer = args.includes('--retirer');
const verifier = args.includes('--verifier');

const MARQUE = 'oracle-nom-client-publie';

const HAMECON = `#!/bin/sh
# pre-push — refuse une publication portant un nom de client (${MARQUE}).
# Posé par installer-hamecon-publication.mjs. Contournement explicite : git push --no-verify.
#
# L'oracle est cherché d'abord dans la copie INSTALLÉE des skills, parce que c'est elle qui
# s'exécute (même doctrine que le contrôle d'alignement des skills), puis dans la source.
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
fi
printf '%s' "$SORTIE" | node -e '
  let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
    try {
      const o = JSON.parse(t);
      for (const f of (o.findings || []).slice(0, 40)) console.error("  " + (f.regle || "") + "  " + (f.where || "") + "  " + f.msg);
      for (const n of (o.non_juge || []).slice(0, 3)) console.error("  · " + n);
    } catch { console.error(t.slice(0, 2000)); }
  });
' >&2
echo "" >&2
echo "  Corrigez, ou contournez EXPLICITEMENT : git push --no-verify" >&2
exit 1
`;

let poses = 0, retires = 0, absents = 0, deja = 0;
for (const d of depots) {
  const hooks = path.join(d, '.git', 'hooks');
  if (!fs.existsSync(hooks)) { console.log(`  ABSENT   ${d} — pas de dépôt git ici`); absents++; continue; }
  const cible = path.join(hooks, 'pre-push');

  if (verifier) {
    const present = fs.existsSync(cible) && fs.readFileSync(cible, 'utf8').includes(MARQUE);
    console.log(`  ${present ? 'POSE    ' : 'MANQUANT'} ${d}`);
    present ? poses++ : absents++;
    continue;
  }

  if (retirer) {
    if (fs.existsSync(cible) && fs.readFileSync(cible, 'utf8').includes(MARQUE)) { fs.rmSync(cible); console.log(`  RETIRE   ${d}`); retires++; }
    else console.log(`  RIEN     ${d} — aucun hameçon de ce contrôle`);
    continue;
  }

  // JAMAIS écraser un hameçon qui n'est pas le nôtre : un `pre-push` étranger porte le travail
  // de quelqu'un d'autre, et l'écraser en silence est le genre de geste qu'on découvre trois
  // semaines plus tard. Le conflit se DIT, il ne se résout pas tout seul.
  if (fs.existsSync(cible)) {
    const txt = fs.readFileSync(cible, 'utf8');
    if (!txt.includes(MARQUE)) { console.log(`  CONFLIT  ${d} — un pre-push ÉTRANGER existe déjà, rien touché`); absents++; continue; }
    fs.writeFileSync(cible, HAMECON, { mode: 0o755 });
    console.log(`  REPOSE   ${d}`); deja++; continue;
  }
  fs.writeFileSync(cible, HAMECON, { mode: 0o755 });
  console.log(`  POSE     ${d}`);
  poses++;
}
console.log(verifier ? `\n${poses} posé(s), ${absents} manquant(s)`
  : retirer ? `\n${retires} retiré(s)`
  : `\n${poses} posé(s), ${deja} reposé(s), ${absents} non traité(s)`);
process.exit(verifier && absents ? 1 : 0);
