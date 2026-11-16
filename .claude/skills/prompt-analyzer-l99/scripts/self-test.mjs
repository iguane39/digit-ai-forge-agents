#!/usr/bin/env node
// self-test — recette du skill prompt-analyzer-l99 : joue la recette de l'oracle du mode boucle
// (TF-1831), 2 verts et 8 rouges qui ne changent chacun qu'un élément du vert. Exit 0 / 1.
// TF-1975 (29/10/2026) : le type du rapport d'analyse est « Revue », au registre des types ; le
// SKILL.md et couches.md le prescrivent tous deux, et un type « Analyse » prescrit serait vu.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(ICI, 'oracle-boucle-l99.mjs'), '--self-test'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');

const NOM_REVUE = '<Projet> - Revue - Prompt <objet> passé au crible L99 - AAAAMMJJ<indice>.md';
const prescrit = (texte) => texte.includes(NOM_REVUE) && !/<Projet> - Analyse - /.test(texte);
const skill = readFileSync(path.join(ICI, '..', 'SKILL.md'), 'utf8');
const couches = readFileSync(path.join(ICI, '..', 'references', 'couches.md'), 'utf8');
const cas = [
  ['TF-1975 vert — SKILL.md prescrit le type « Revue » au rapport d analyse', prescrit(skill)],
  ['TF-1975 vert — couches.md prescrit le même nom', prescrit(couches)],
  ['TF-1975 rouge — un nom « <Projet> - Analyse - … » prescrit est vu', !prescrit(skill.replace(NOM_REVUE, '<Projet> - Analyse - Prompt <objet> - AAAAMMJJ<indice>.md'))],
];
// TF-2022 (29/10/2026) : le mode boucle s'ouvre d'office sur trois cas nommés, et le Ch8 dit pourquoi ;
// SKILL.md et boucle.md portent tous deux la règle, et son retrait se voit.
const boucle = readFileSync(path.join(ICI, '..', 'references', 'boucle.md'), 'utf8');
const ouvertureDOffice = (texte) => /Ouverture d'office/.test(texte) && /TF-2022/.test(texte)
  && /campagne d'agents qui écrit/.test(texte) && /défaut bloquant/.test(texte) && /pourquoi il ne l'a pas été/.test(texte);
cas.push(
  ['TF-2022 vert — SKILL.md ouvre le mode boucle d office sur ses trois cas', ouvertureDOffice(skill)],
  ['TF-2022 vert — boucle.md porte la même règle', ouvertureDOffice(boucle)],
  ['TF-2022 rouge — le paragraphe retiré de boucle.md est vu', !ouvertureDOffice(boucle.replace(/\*\*Ouverture d'office\*\*[\s\S]*?pas été\./, ''))],
);
// TF-2194 (06/11/2026) : le contrat de sortie du Ch8 nomme l'oracle de forme de CHAQUE format que le
// prompt peut produire, voie de repli comprise. Le 05/11, un contrat qui ne nommait que check_html.py
// a laissé sortir un Markdown à 9 défauts de forme (check_markdown.py, exit 1). `formatsSansOracle`
// rend les formats annoncés sur la ligne « Formats produits » dont l'oracle n'est pas nommé ; les
// deux fixtures ne diffèrent que par la ligne qui nomme check_markdown.py.
const ORACLE_PAR_FORMAT = { html: 'check_html.py', markdown: 'check_markdown.py' };
const formatsSansOracle = (contrat) => {
  const ligne = (contrat.match(/^Formats produits\s*:(.*)$/m) || [, ''])[1];
  return Object.entries(ORACLE_PAR_FORMAT)
    .filter(([format, oracle]) => new RegExp(format, 'i').test(ligne) && !contrat.includes(oracle))
    .map(([format]) => format);
};
const regleFormeContrat = (texte) => /TF-2194/.test(texte) && /check_markdown\.py/.test(texte) && /voie de repli|repli/.test(texte);
const contratVert = readFileSync(path.join(ICI, '..', 'fixtures', 'contrat-forme-vert.md'), 'utf8');
const contratRouge = readFileSync(path.join(ICI, '..', 'fixtures', 'contrat-forme-rouge.md'), 'utf8');
cas.push(
  ['TF-2194 vert — un contrat qui nomme check_html.py et check_markdown.py (repli compris) n est pas refusé', formatsSansOracle(contratVert).length === 0],
  ['TF-2194 rouge — un contrat à repli Markdown sans check_markdown.py est refusé, pour le seul format markdown', formatsSansOracle(contratRouge).join() === 'markdown'],
  ['TF-2194 vert — SKILL.md et couches.md prescrivent l oracle de forme par format, repli compris', regleFormeContrat(skill) && regleFormeContrat(couches)],
  ['TF-2194 rouge — la section retirée de couches.md est vue', !regleFormeContrat(couches.replace(/## Contrat de sortie : l'oracle de forme[\s\S]*?(?=## Nom du livrable)/, '').replace(/ \*\*Le contrat nomme l'oracle de forme[\s\S]*?un Markdown\./, ''))],
);
// TF-2202 (06/11/2026) : une note de relecteur est recomptée avant d'entrer dans une correction, et une
// régression due à un défaut créé ouvre une passe de reprise unique ; boucle.md et SKILL.md portent la
// règle, et le banc de l'oracle (B11, B12) la joue en rouge et en vert.
const reglesNotes = (texte) => /Deux clés de plus/.test(texte) && /`recompte_notes` : `true`/.test(texte) && /`reprise_unique` : `true`/.test(texte);
const oracleNotes = readFileSync(path.join(ICI, 'oracle-boucle-l99.mjs'), 'utf8');
cas.push(
  ['TF-2202 vert — boucle.md porte les deux clés recompte_notes et reprise_unique', reglesNotes(boucle)],
  ['TF-2202 vert — SKILL.md nomme la règle (note recomptée, reprise unique)', /TF-2202/.test(skill) && /passe de reprise unique/.test(skill)],
  ['TF-2202 rouge — le paragraphe retiré de boucle.md est vu', !reglesNotes(boucle.replace(/\*\*Deux clés de plus[\s\S]*?(?=\*\*Extension jusqu'à 5 passes\*\*)/, ''))],
  ['TF-2202 vert — l oracle joue B11 et B12', /B11/.test(oracleNotes) && /B12/.test(oracleNotes)],
);
// TF-2550 (14/11/2026) : le relevé des boucles n'imprime la règle de revue que si elle se déclenche (gain médian sous 3
// points) ; imprimée sans condition sous « gain médian : 7 », elle se lisait comme un verdict. Jetables : un journal de
// gain 7 (la fixture à deux passes, 84 → 91), le même ramené à un gain de 1, et un dossier sans journal.
const NON_DECLENCHEE = 'règle de revue non déclenchée';
const REGLE = 'le mode redevient optionnel';
const releve = (journaux, ...options) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'l99-releve-'));
  try {
    journaux.forEach((j, i) => writeFileSync(path.join(dossier, `analyse-${i}.md.boucle.json`), JSON.stringify(j)));
    const rr = spawnSync(process.execPath, [path.join(ICI, 'releve-boucles.mjs'), dossier, ...options], { encoding: 'utf8' });
    return rr.stdout || '';
  } finally { rmSync(dossier, { recursive: true, force: true }); }
};
const gain7 = JSON.parse(readFileSync(path.join(ICI, '..', 'fixtures', 'boucle-vert-deux-passes.json'), 'utf8'));
const gain1 = JSON.parse(JSON.stringify(gain7));
gain1.passes[1].score_mesure = gain1.passes[0].score_mesure + 1;
const texte7 = releve([gain7]), texte1 = releve([gain1]), texteVide = releve([]);
const json7 = JSON.parse(releve([gain7], '--json')), json1 = JSON.parse(releve([gain1], '--json'));
cas.push(
  ['TF-2550 vert — gain médian 7 : le relevé dit « règle de revue non déclenchée » et n imprime pas la règle', /gain médian : 7/.test(texte7) && texte7.includes(NON_DECLENCHEE) && !texte7.includes(REGLE)],
  ['TF-2550 vert — gain médian 1 : la règle se déclenche et s imprime, sans la mention « non déclenchée »', /gain médian : 1/.test(texte1) && texte1.includes(REGLE) && !texte1.includes(NON_DECLENCHEE)],
  ['TF-2550 vert — sans journal, rien ne se déclenche et le relevé le dit (gain nul : « null < 3 » vaudrait vrai en JavaScript)', texteVide.includes(NON_DECLENCHEE) && !texteVide.includes(REGLE)],
  ['TF-2550 vert — en --json, `regle_de_revue` suit le même déclenchement', json7.regle_de_revue === NON_DECLENCHEE && json1.regle_de_revue.includes(REGLE)],
);
// TF-2551 (14/11/2026) : dans un projet de la Factory, la revue L99 s'écrit dans un fichier et se préjuge avant d'être affichée ;
// le SKILL.md le rappelle (point 12), et le retrait du point se voit.
const rappelRestitution = (texte) => /TF-2551/.test(texte) && /s'\*\*écrit d'abord dans un\s+fichier\*\*/.test(texte)
  && /--prejuger/.test(texte) && /ne s'\*\*affiche qu'après\*\*/.test(texte) && /projet de la Factory/.test(texte);
cas.push(
  ['TF-2551 vert — SKILL.md rappelle d ecrire la restitution dans un fichier et de la préjuger avant affichage', rappelRestitution(skill)],
  ['TF-2551 rouge — le point retiré de SKILL.md est vu', !rappelRestitution(skill.replace(/12\. \*\*Restitution dans un projet de la Factory[\s\S]*?(?=\n## Les 8 couches)/, ''))],
);
// TF-2236 à TF-2242 (16/11/2026, étude 20261106b) : chaque règle de la revue porte sa clé d'arbitre à boucle.md (une puce), son
// rappel au SKILL.md et son contrôle à l'oracle ; la puce retirée de boucle.md se voit. Une entrée : [TF, clé d'arbitre, règle].
const REGLES_REVUE = [
  ['TF-2237', 'score_de_passe', 'B13'],
  ['TF-2238', 'arret_atteignable', 'B14'],
  ['TF-2239', 'garde_cumulee', 'B15'],
  ['TF-2240', 'jugement_apparie', 'B16'],
  ['TF-2236', 'fiche_premisses', 'B17'],
  ['TF-2241', 'type_relecteur', 'B18'],
  ['TF-2242', 'verification_diff', 'B19'],
];
for (const [tf, cle, regle] of REGLES_REVUE) {
  const puce = new RegExp(`- \\*\\*[^\\n]*\\(${tf}[\\s\\S]*?\`${cle}\``);
  const sansPuce = (texte) => texte.replace(new RegExp(`- \\*\\*[^\\n]*\\(${tf}[\\s\\S]*?(?=\\n- \\*\\*|\\n## )`), '');
  cas.push(
    [`${tf} vert — boucle.md porte la puce de la règle et sa clé d arbitre \`${cle}\``, puce.test(boucle)],
    [`${tf} vert — SKILL.md rappelle la règle (${regle})`, skill.includes(tf) && skill.includes(regle)],
    [`${tf} vert — l oracle joue ${regle}`, new RegExp(`\\b${regle}\\b`).test(oracleNotes)],
    [`${tf} rouge — la puce retirée de boucle.md est vue`, !puce.test(sansPuce(boucle))],
  );
}
// TF-2632 (16/11/2026) : le nom prescrit au point 9 donnait un journal au-delà du plafond de chemin de R-4 (116 caractères
// utiles : 150 moins les 34 du sidecar d'oracle). SKILL.md et couches.md rappellent le plafond, le suffixe `.boucle.json` et
// l'objet en 4 mots ; couches.md porte un exemple dont le chemin de journal se mesure ici (même arithmétique que
// `oracle-conformite-projet`, rejoué le 16/11 : 107 caractères PASS, 119 FAIL).
const PLAFOND_UTILE_R4 = 116;
const regleChemin = (texte) => /TF-2632/.test(texte) && /116 caractères/.test(texte) && /\.boucle\.json/.test(texte) && /4 mots/.test(texte);
const exempleRejoue = (texte) => (texte.match(/Exemple rejoué sous R-4 : `([^`]+)`/) || [, ''])[1];
const cheminAdmissible = (chemin) => /^output\/[^/]+\/.+ - Revue - Prompt .+ passé au crible L99 - \d{8}[a-z]\.md\.boucle\.json$/.test(chemin) && chemin.length <= PLAFOND_UTILE_R4;
const exemple = exempleRejoue(couches);
cas.push(
  ['TF-2632 vert — SKILL.md et couches.md rappellent le plafond de 116 caractères, le suffixe .boucle.json et l objet en 4 mots', regleChemin(skill) && regleChemin(couches)],
  ['TF-2632 vert — l exemple de couches.md suit le gabarit du point 9 et son journal tient sous le plafond', cheminAdmissible(exemple)],
  ['TF-2632 rouge — le même gabarit avec un objet de 8 mots dépasse le plafond et est refusé', !cheminAdmissible(exemple.replace(' relance ', ' relance des prospects LinkedIn du secteur industriel '))],
  ['TF-2632 rouge — le paragraphe retiré de couches.md est vu', !regleChemin(couches.replace(/\*\*Le chemin du journal borne l'objet\*\*[\s\S]*?(?=\*\*Borne\*\* : hors factory)/, ''))],
  ['TF-2632 rouge — la phrase retirée de SKILL.md est vue', !regleChemin(skill.replace(/\*\*Le chemin du journal borne l'objet\*\*[\s\S]*?(?=\n\s+Détail : `references\/couches\.md`, section « Nom du livrable »)/, ''))],
);
// TF-2669 (16/11/2026) : le tour qui attend les relecteurs aveugles rend un point d'étape préjugé au lieu de se clore sur une
// attente (refusée par S1 et S4). Le point 12 de SKILL.md le prescrit, nomme la mesure attendue et l'outil ; le retrait de la
// phrase se voit. Deux fixtures, un point d'étape et un message d'attente, sont jugées par `oracle-synthese` du pilot quand il
// est joignable (FORGE_ROOT, ou le dossier parent du dépôt) : le premier ne doit pas être refusé par S1 et S4, le second doit
// l'être. Pilot absent : les deux cas se disent SKIP, sans échec ni faux vert.
const regleAttente = (texte) => /TF-2669/.test(texte) && /point d'étape/.test(texte) && /Ce qui reste à mesurer, et par\s+quoi/.test(texte)
  && /scripts\/oracle-boucle-l99\.mjs/.test(texte) && /S1, S4/.test(texte);
const ORACLE_SYNTHESE = path.join(process.env.FORGE_ROOT || path.resolve(ICI, '..', '..', '..', '..', '..'), 'digit-ai-factory', 'oracles', 'oracle-synthese.mjs');
const reglesVues = (fixture) => {
  const rs = spawnSync(process.execPath, [ORACLE_SYNTHESE, path.join(ICI, '..', 'fixtures', fixture)], { encoding: 'utf8', timeout: 120000 });
  try { return Object.fromEntries(JSON.parse(rs.stdout).findings.filter((x) => ['S1', 'S4'].includes(x.regle)).map((x) => [x.regle, x.statut])); } catch { return null; }
};
cas.push(
  ['TF-2669 vert — SKILL.md prescrit le point d\'étape préjugé après le lancement des relecteurs, avec la mesure et l outil', regleAttente(skill)],
  ['TF-2669 rouge — la phrase retirée du point 12 est vue', !regleAttente(skill.replace(/\*\*Le tour qui attend les relecteurs aveugles\*\*[\s\S]*?(?=Hors de la Factory, aucune restitution)/, ''))],
);
if (existsSync(ORACLE_SYNTHESE)) {
  const vert = reglesVues('point-etape-vert.md'), rouge = reglesVues('attente-rouge.md');
  cas.push(
    ['TF-2669 vert — un point d\'étape (bloc 2 « ce qui reste à mesurer », outil nommé) n est refusé ni par S1 ni par S4', !!vert && vert.S1 === 'PASS' && vert.S4 === 'PASS'],
    ['TF-2669 rouge — un message d\'attente est refusé par S1 et par S4', !!rouge && rouge.S1 === 'FAIL' && rouge.S4 === 'FAIL'],
  );
} else console.log('SKIP TF-2669 — oracle-synthese du pilot introuvable (FORGE_ROOT) : le point d\'étape et l attente ne sont pas jugés ici');
// TF-2673 (16/11/2026) : à l'étape 3 de boucle.md, un recompte qui lit un champ de données lit aussi sa règle d'écriture et le
// croise avec une seconde source quand le champ porte un fait ; l'oracle (B20) le joue sur la fixture du journal (le banc de
// l'oracle porte les cas rouges, ici la phrase et le retrait de la phrase).
const regleChamp = (texte) => /TF-2673/.test(texte) && /lit aussi sa règle d'écriture/.test(texte) && /seconde source/.test(texte)
  && /`regle_ecriture`/.test(texte) && /`seconde_source`/.test(texte);
cas.push(
  ['TF-2673 vert — boucle.md prescrit à l étape 3 la lecture de la règle d écriture et la seconde source', regleChamp(boucle)],
  ['TF-2673 rouge — la phrase retirée de boucle.md est vue', !regleChamp(boucle.replace(/\*\*Un recompte qui lit un champ de données[\s\S]*?(?=\n4\. \*\*Mesurer la longueur)/, ''))],
  ['TF-2673 vert — l oracle joue B20', /B20/.test(oracleNotes)],
);
for (const [libelle, tenu] of cas) console.log(`${tenu ? 'ok  ' : 'FAIL'} ${libelle}`);
const echecs = cas.filter(([, tenu]) => !tenu).length;
process.exit(r.status === 0 && echecs === 0 ? 0 : 1);
