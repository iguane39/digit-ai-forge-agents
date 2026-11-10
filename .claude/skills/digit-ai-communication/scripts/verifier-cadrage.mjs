#!/usr/bin/env node
// verifier-cadrage — juge le fichier de cadrage d'un livrable de communication (TF-2379, TF-2317).
// Node pur, zéro dépendance, déterministe.
//
// LE FAIT (retour du 17/09/2026). L'étape 1 du workflow de ce skill (poser la question quand l'audience
// ou l'objectif manque) n'était vérifiée par aucun contrôle : une session pouvait supposer l'audience,
// produire le deck et passer tous les oracles ; deux retours humains de contenu en une journée sur le
// même deck. Le cadrage devient un fichier, et ce script refuse de le laisser passer incomplet.
//
// CE QU'IL JUGE. Le fichier porte une ligne « livrable : <preset> » et quatre sections non vides :
// « Audience », « Décision attendue », « Contexte », « Objection attendue ». Aucun emplacement du
// gabarit ne reste entre accolades, aucune mention « à définir » ne tient lieu de réponse. Quand le
// livrable est une formation ou un atelier (TF-2317), la section « Public par module » est exigée : un
// tableau dont chaque ligne nomme le module, son public réel, et répond oui ou non à « Se suit seul ».
//
// CE QU'IL NE JUGE PAS. La justesse des réponses : il vérifie qu'une réponse existe, pas qu'elle est vraie.
//
// Usage : node scripts/verifier-cadrage.mjs <fichier de cadrage.md>
// Sortie : JSON {oracle, verdict, findings, non_juge} sur stdout. Exit 0 (PASS) / 1 (FAIL) / 2 (usage,
// fichier absent ou illisible).
import fs from 'node:fs';

const SECTIONS = ['Audience', 'Décision attendue', 'Contexte', 'Objection attendue'];
const MIN_MOTS = 4;
const VIDES = /(?:^|\s)(?:à définir|à compléter|à préciser|tbd|todo|n\/a|aucune?|\?\?+|\.\.\.|…)(?:\s|$)/i;

function sortir(verdict, findings, code, fichier) {
  process.stdout.write(JSON.stringify({
    oracle: 'verifier-cadrage',
    artefact: fichier || null,
    verdict,
    findings,
    non_juge: [
      "ne juge pas la JUSTESSE des réponses : il vérifie qu'une réponse existe et qu'elle est écrite, pas qu'elle est vraie",
      "ne juge pas que le cadrage ait été validé par l'humain quand l'enjeu est fort",
    ],
  }, null, 2) + '\n');
  process.exit(code);
}

const fichier = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!fichier) sortir('SKIP', ['usage : node scripts/verifier-cadrage.mjs <fichier de cadrage.md>'], 2, null);
if (!fs.existsSync(fichier)) sortir('SKIP', [`fichier de cadrage absent : ${fichier} — le cadrage s'écrit à l'étape 1, avant le plan`], 2, fichier);

let texte;
try { texte = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, ''); } catch (e) { sortir('SKIP', [`fichier illisible : ${e.message}`], 2, fichier); }

const lignes = texte.split(/\r?\n/);
const findings = [];

// sections « ## Titre » : corps jusqu'au titre suivant, citations « > » ignorées
const sections = new Map();
let courant = null;
for (const l of lignes) {
  const t = l.match(/^##\s+(.+?)\s*$/);
  if (t) { courant = t[1].trim(); sections.set(courant, []); continue; }
  if (courant && !/^\s*>/.test(l)) sections.get(courant).push(l);
}
const corps = (nom) => (sections.get(nom) || []).join('\n').trim();
const mots = (s) => s.split(/\s+/).filter(Boolean).length;

const decl = lignes.find((l) => /^livrable\s*:/i.test(l));
const livrable = decl ? decl.replace(/^livrable\s*:/i, '').trim() : '';
if (!livrable || /^\{.*\}$/.test(livrable)) findings.push('la ligne « livrable : <preset> » manque ou reste entre accolades : le cadrage ne dit pas pour quel livrable il est écrit');

for (const nom of SECTIONS) {
  if (!sections.has(nom)) { findings.push(`section « ${nom} » absente`); continue; }
  const c = corps(nom);
  if (!c) findings.push(`section « ${nom} » vide`);
  else if (/\{[^{}\n]+\}/.test(c)) findings.push(`section « ${nom} » : un emplacement du gabarit reste entre accolades`);
  else if (VIDES.test(c) && mots(c) < 12) findings.push(`section « ${nom} » : « ${c.slice(0, 40)} » tient lieu de réponse`);
  else if (mots(c) < MIN_MOTS) findings.push(`section « ${nom} » : ${mots(c)} mot(s), ${MIN_MOTS} au moins pour une réponse`);
}

if (/formation|atelier/i.test(livrable)) {
  const nom = 'Public par module';
  if (!sections.has(nom)) {
    findings.push(`livrable « ${livrable} » : la section « ${nom} » est exigée (public réel de chaque module, et s'il se suit seul)`);
  } else {
    const rangs = corps(nom).split('\n').filter((l) => /^\s*\|/.test(l));
    const cellules = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const donnees = rangs.filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).slice(1);
    if (!donnees.length) findings.push(`section « ${nom} » : aucun module dans le tableau`);
    donnees.forEach((l, i) => {
      const c = cellules(l);
      if (c.length < 4) { findings.push(`section « ${nom} », ligne ${i + 1} : ${c.length} colonne(s), 4 attendues (module, public réel, se suit seul, usage attendu)`); return; }
      if (c.some((x) => !x || /\{[^{}]*\}/.test(x))) findings.push(`section « ${nom} », ligne ${i + 1} (« ${c[0] || 'sans nom'} ») : une cellule est vide ou reste entre accolades`);
      else if (!/^(oui|non)\b/i.test(c[2])) findings.push(`section « ${nom} », ligne ${i + 1} (« ${c[0]} ») : « Se suit seul » se répond par oui ou par non, pas « ${c[2].slice(0, 30)} »`);
    });
  }
}

sortir(findings.length ? 'FAIL' : 'PASS', findings, findings.length ? 1 : 0, fichier);
