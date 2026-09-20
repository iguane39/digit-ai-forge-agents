#!/usr/bin/env node
// oracle-premisse-acces — Domaine « Prémisse d'accès mesurée avant d'être classée (analyse L99) ».
// Standard §3 : déterministe, checklist canonique, artefact réel, non_juge déclaré,
// sortie localisante, autoportant, prouvé par fixtures.
//
// TF-1185 (17/09/2026). Un prompt désignait deux rapports distants par leur URL et affirmait de
// l'un « accessible ici ». Quatre lectures REST émises avec la même identité, dans la même
// seconde, ont rendu 200 (un seul espace visible), 200 (50 rapports), 401 et 401 sur l'espace
// visé : la prémisse était FAUSSE pour l'exécutant. Le Ch4 de `prompt-analyzer-l99` écrivait
// « classer invérifiable plutôt qu'inventer un verdict » — une règle qui protège de l'invention
// et jamais de la paresse. Sans les quatre appels, le défaut le plus grave du prompt serait passé
// de bloquant à majeur. Cet oracle joue la règle écrite depuis : une prémisse d'ACCÈS se mesure
// avant d'être classée, et son verdict porte ses quatre pièces.
//
// CHECKLIST CANONIQUE (unité jugée : le BLOC — un paragraphe, ou une ligne de tableau) :
//   A1  une prémisse d'accès classée « invérifiable » SANS mesure ni test manquant déclaré
//       → bloquant (« invérifiable » est réservé à ce qui n'a pas de test bon marché).
//   A2  un refus mesuré (401/403/404…) SANS contrôle positif avec la même identité
//       → bloquant (un refus ne se distingue pas d'un jeton mort).
//   A3  une mesure d'accès SANS horodatage ou SANS identité employée → bloquant.
//   A4  une conclusion d'indisponibilité SANS énumération des familles d'accès (scopes, points
//       d'entrée parallèles) → bloquant. Doctrine : un refus prouve qu'une porte est fermée,
//       jamais qu'il n'y en a qu'une.
//
// L'oracle N'ÉMET AUCUN APPEL RÉSEAU : il lit ce que l'analyse écrit. Mesurer est le travail de
// l'analyste ; prouver qu'il l'a fait et qu'il l'a écrit est le travail de cet oracle.
// Contrat : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]} · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DOM = "Prémisse d'accès mesurée avant d'être classée (analyse L99)";
const NJ = [
  "la VÉRACITÉ des codes rapportés : l'oracle lit ce que l'analyse écrit, il n'émet aucun appel",
  "la pertinence des familles d'accès énumérées (leur existence sur la plateforme visée n'est pas contre-vérifiée)",
  "les prémisses qui ne portent pas sur l'accès (→ reste du Ch4, jugement humain)",
  "un bloc qui parle d'accès sans employer le vocabulaire reconnu ci-dessous n'est pas vu",
  "une mesure écrite SANS son code de retour n'est pas reconnue comme une mesure (le code est la première des quatre pièces dues)",
  "la suffisance de la mesure : un seul appel peut satisfaire A1-A4 et rester une mesure pauvre"
];
const out = (verdict, findings, nj, code) => {
  process.stdout.write(JSON.stringify({ oracle: 'oracle-premisse-acces', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nj }));
  process.exit(code);
};
if (!file || !fs.existsSync(file)) out('SKIP', [], ['fichier absent'], 2);
if (!['.md', '.markdown', '.txt'].includes(path.extname(file).toLowerCase())) out('SKIP', [], ['extension non gérée'], 2);

const base = path.basename(file);
const lignes = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

// --- découpage en BLOCS -----------------------------------------------------------------
// Une ligne de tableau est un bloc à elle seule (le Ch4 liste ses prémisses en tableau) ; sinon
// un bloc est un paragraphe. Une clôture de bloc de code ne coupe jamais un paragraphe : le
// journal d'appels d'une mesure vit souvent dans une clôture, sous la phrase qu'il prouve.
const blocs = [];
let courant = null, dansCloture = false;
const fermer = () => { if (courant && courant.texte.trim()) blocs.push(courant); courant = null; };
lignes.forEach((l, i) => {
  if (/^\s*```/.test(l)) dansCloture = !dansCloture;
  const vide = !dansCloture && !l.trim();
  const tableau = !dansCloture && /^\s*\|.*\|\s*$/.test(l);
  if (vide) { fermer(); return; }
  if (tableau) { fermer(); blocs.push({ debut: i + 1, texte: l }); return; }
  if (!courant) courant = { debut: i + 1, texte: '' };
  courant.texte += l + '\n';
});
fermer();

// --- vocabulaire reconnu ----------------------------------------------------------------
const ACCES = /acc[èe]s|accessible|habilitation|autorisation|droits?\s+(de\s+)?(lecture|acc[èe]s)|permission/i;
const RESSOURCE = /https?:\/\/|\bURL\b|\bGET\s+\/|\bPOST\s+\/|point d'API|\bAPI\b|endpoint|d[ée]p[ôo]t\b|\brepo\b|base de donn[ée]es|espace de travail|workspace|chemin\s+\S|[A-Za-z]:\\\\?|\.pbix|\.xlsx|\.csv/i;
const INVERIFIABLE = /inv[ée]rifiable/i;
const CODE_REFUS = /\b(401|403|404|407|451)\b|acc[èe]s refus[ée]|non autoris|unauthorized|forbidden|permission denied/i;
const CODE_POSITIF = /\b(200|201|202|204)\b|contr[ôo]le positif|t[ée]moin positif/i;
// Une mesure d'accès SE RECONNAÎT À SON CODE DE RETOUR, ou à l'appel qui le rapporte. « J'ai
// mesuré l'accès » sans code n'est pas une mesure au sens de la règle : le code de retour est la
// première des quatre pièces que le verdict doit porter (cf. non_juge).
const MESURE = /\b(200|201|202|204|301|302|400|401|403|404|407|429|451|500|503)\b|appel [ée]mis|lecture [ée]mise|r[ée]ponse re[çc]ue/i;
const HORODATAGE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/;
const IDENTITE = /identit[ée]|jeton|token|compte\b|profil\b|principal de service|service principal|utilisateur\b|session\b/i;
const FAMILLES = /scopes?\b|famille[s]? d'acc[èe]s|espace personnel|espace partag[ée]|API d'administration|admin(istration)? API|partage par lien|export\b|copie locale|lecture d[ée]l[ée]gu[ée]e|points? d'entr[ée]e|chemins? parall[èe]le/i;
const FERME = /inaccessible|aucun acc[èe]s|pas d'acc[èe]s|acc[èe]s impossible|hors de port[ée]e|ne peut pas [êe]tre ouvert/i;
const TEST_MANQUANT = /test qui (lui |leur )?manque|test manquant|aucun test bon march[ée]|identit[ée] (qu'il|requise|manquante)|ce qu'il co[ûu]terait|co[ûu]t du test/i;

const findings = [];
const ko = (sev, regle, msg, bloc) => findings.push({ sev, msg: `${regle} — ${msg}`, where: `${base}:${bloc.debut}` });
const extrait = t => t.replace(/\s+/g, ' ').trim().slice(0, 90);

let juges = 0;
for (const bloc of blocs) {
  // Les marqueurs de cette checklist sont des LOCUTIONS (« test qui manque », « contrôle
  // positif », « famille d'accès ») : sur une prose repliée à cent colonnes, un retour à la ligne
  // tombe au milieu de l'une d'elles une fois sur trois. On juge donc le bloc à blancs normalisés,
  // et on ne garde le texte brut que pour l'extrait cité au constat.
  const t = bloc.texte.replace(/\s+/g, ' ');
  if (!ACCES.test(t)) continue;
  if (!RESSOURCE.test(t) && !CODE_REFUS.test(t) && !INVERIFIABLE.test(t)) continue;
  juges++;
  const mesure = MESURE.test(t);

  if (INVERIFIABLE.test(t) && !mesure && !TEST_MANQUANT.test(t))
    ko('bloquant', 'A1', `prémisse d'accès classée « invérifiable » sans mesure ni test manquant déclaré : « ${extrait(t)} »`, bloc);

  if (CODE_REFUS.test(t) && !CODE_POSITIF.test(t))
    ko('bloquant', 'A2', `refus d'accès sans contrôle positif avec la même identité — un refus ne se distingue pas d'un jeton mort : « ${extrait(t)} »`, bloc);

  if (mesure) {
    const manque = [];
    if (!HORODATAGE.test(t)) manque.push('horodatage');
    if (!IDENTITE.test(t)) manque.push('identité employée');
    if (manque.length)
      ko('bloquant', 'A3', `mesure d'accès sans ${manque.join(' ni ')} : « ${extrait(t)} »`, bloc);
  }

  if (FERME.test(t) && !FAMILLES.test(t))
    ko('bloquant', 'A4', `conclusion d'indisponibilité sans énumération des familles d'accès (scopes, points d'entrée parallèles) — un refus prouve qu'une porte est fermée, jamais qu'il n'y en a qu'une : « ${extrait(t)} »`, bloc);
}

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', findings, NJ, 1);
if (!juges) out('SKIP', [], [...NJ, "aucune prémisse d'accès détectée dans ce document"], 2);
out('PASS', [{ sev: 'info', msg: `${juges} prémisse(s) d'accès contrôlée(s) — chacune mesurée, datée, identifiée, avec son contrôle positif et ses familles d'accès`, where: base }, ...findings], NJ, 0);
