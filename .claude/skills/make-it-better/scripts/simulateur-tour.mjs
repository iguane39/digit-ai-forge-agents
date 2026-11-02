#!/usr/bin/env node
// simulateur-tour.mjs — joue un tour à la place du modèle, pour `lancer.mjs --simuler <cas>` : il écrit
// dans le dossier du tour ce qu'un modèle y écrirait et rend un flux stream-json. Il n'appelle rien.
//   node simulateur-tour.mjs <cas> <numero>   (lancé par lancer.mjs, dossier du tour pour répertoire)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAS, LIGNES_FIXTURE } from './lib/cas-simules.mjs';

const [nomCas, numeroTexte] = process.argv.slice(2);
const cas = CAS[nomCas];
const numero = Number(numeroTexte);
const ext = process.env.MIB_SIM_FORMAT;
const modele = process.env.MIB_SIM_MODELE || 'opus';
const dossierSim = process.env.MIB_SIM_DOSSIER;
const XML = join('paquet', 'word', 'document.xml');
const ANCRE_XML = '</w:t></w:r></w:p>\n<w:sectPr';

const passages = (() => {
  mkdirSync(dossierSim, { recursive: true });
  const f = join(dossierSim, 'passages.json');
  const p = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  p[numero] = (p[numero] || 0) + 1;
  writeFileSync(f, JSON.stringify(p));
  return p;
})();

const fluxCas = typeof cas.flux === 'function' ? cas.flux(numero) : (cas.flux || {});
const flux = {
  apiKeySource: 'none', model: modele === 'sonnet' ? 'claude-sonnet-5' : 'claude-opus-5-5', status: 'allowed', isUsingOverage: false,
  utilization: 0.3 + numero / 1000, resetsAt: Math.floor(Date.now() / 1000) + 3 * 86400, ...fluxCas,
};

function emettre(o) {
  process.stdout.write(`${JSON.stringify(o)}\n`);
}
function evenementInit() {
  emettre({ type: 'system', subtype: 'init', apiKeySource: flux.apiKeySource, model: flux.model, tools: ['Edit', 'Glob', 'Grep', 'Read', 'Write'] });
}
function evenementsFin() {
  const contenu = [{ type: 'text', text: 'Tour simulé.' }];
  if (existsSync('capture.png')) contenu.unshift({ type: 'tool_use', name: 'Read', input: { file_path: join(process.cwd(), 'capture.png') } });
  emettre({ type: 'assistant', message: { model: flux.model, content: contenu } });
  if (!flux.sansEvenement) {
    emettre({ type: 'rate_limit_event', rate_limit_info: { status: flux.status, resetsAt: flux.resetsAt, rateLimitType: 'seven_day', isUsingOverage: flux.isUsingOverage, unifiedWindows: { seven_day: { utilization: flux.utilization, resetsAt: flux.resetsAt, status: flux.status } } } });
  }
  emettre({ type: 'result', subtype: 'success', is_error: false, result: 'Tour simulé.' });
}

const note = (type, apporte = 'Une phrase reprend le tri des pièces.', retire = 'Rien, la phrase ne remplace aucune autre.') => writeFileSync('note.json', JSON.stringify({ type, apporte, retire }));

function ajouterPhrase(phrase) {
  if (ext === 'md') writeFileSync('document.md', `${readFileSync('document.md', 'utf8')}\n${phrase}\n`);
  else if (ext === 'html') writeFileSync('document.html', readFileSync('document.html', 'utf8').replace('</main>', `<p>${phrase}</p></main>`));
  else if (ext === 'docx') writeFileSync(XML, readFileSync(XML, 'utf8').replace(ANCRE_XML, ` ${phrase}${ANCRE_XML}`));
  else {
    const ancien = LIGNES_FIXTURE[(numero - 1) % LIGNES_FIXTURE.length];
    writeFileSync('modifs.json', JSON.stringify([{ ancien, nouveau: phrase }]));
  }
}

const NEUTRE = 'Le tri sépare les pièces.';

const ACTIONS = {
  change() { ajouterPhrase(NEUTRE); note('reformulation'); },
  rien() { note('rien', '', 'Rien à changer.'); },
  'sans-rien'() { /* la limite tombe avant toute écriture : ni note, ni document */ },
  'rien-incoherent'() { ajouterPhrase(NEUTRE); note('rien', '', 'Rien à changer.'); },
  'change-sans-modif'() { note('reformulation'); },
  'fait-invente'() { ajouterPhrase('Le budget atteint 987654 euros selon Zorglub Industries.'); note('ajout'); },
  'fait-source'() { ajouterPhrase('Dominique Fictif tient le registre des cartons, et 4 étiquettes partent par heure.'); note('ajout'); },
  'fait-reference'() { ajouterPhrase('La salle Sirius compte 300 places.'); note('ajout'); },
  'trop-long'() { ajouterPhrase(Array.from({ length: 80 }, () => 'le tri sépare les pièces').join(', ')); note('ajout'); },
  'note-absente'() { ajouterPhrase(NEUTRE); },
  'note-invalide'() { ajouterPhrase(NEUTRE); writeFileSync('note.json', '{ "type": "reformulation", '); },
  'ajout-sans-retire'() { ajouterPhrase(NEUTRE); note('ajout', 'Une phrase.', ''); },
  'xml-casse'() { writeFileSync(XML, readFileSync(XML, 'utf8').replace('</w:body>', '</w:bod>')); note('reformulation'); },
  'xml-supprime'() { rmSync(XML); note('reformulation'); },
  'autre-partie'() { ajouterPhrase(NEUTRE); const s = join('paquet', 'word', 'styles.xml'); writeFileSync(s, readFileSync(s, 'utf8').replace('w:val="32"', 'w:val="40"')); note('reformulation'); },
  'modifs-invalide'() { writeFileSync('modifs.json', '{"pas": "une liste"}'); note('reformulation'); },
  'modifs-casse'() { writeFileSync('modifs.json', '[{"ancien": '); note('reformulation'); },
  'modifs-paragraphe'() { writeFileSync('modifs.json', JSON.stringify([{ ancien: LIGNES_FIXTURE[0], nouveau: 'Une ligne.\nUne autre ligne.' }])); note('ajout'); },
  retrait() { writeFileSync('modifs.json', JSON.stringify([{ ancien: LIGNES_FIXTURE[4], nouveau: '' }])); note('retrait', 'La ligne sur la signature sort.', 'La signature du bureau.'); },
  identique() { writeFileSync('modifs.json', JSON.stringify([{ ancien: LIGNES_FIXTURE[0], nouveau: LIGNES_FIXTURE[0] }])); note('rien', '', 'Rien à changer.'); },
  'ancien-introuvable'() { writeFileSync('modifs.json', JSON.stringify([{ ancien: 'Cette ligne n\'existe dans aucune page.', nouveau: 'Une ligne.' }])); note('reformulation'); },
  deborde() { writeFileSync('modifs.json', JSON.stringify([{ ancien: LIGNES_FIXTURE[0], nouveau: Array.from({ length: 14 }, () => LIGNES_FIXTURE[0]).join(' ').slice(0, 400) }])); note('reformulation'); },
  'pdf-modifie'() { writeFileSync('document.pdf', Buffer.concat([readFileSync('document.pdf'), Buffer.from('\n% ajout\n')])); writeFileSync('modifs.json', '[]'); note('rien', '', 'Rien à changer.'); },
};

const liste = cas.deroule || [];
const action = liste[numero - 1] ?? 'change';

evenementInit();
if (action === 'gel') {
  setInterval(() => {}, 1000); // ne répond plus : c'est au lanceur de le tuer
} else if (action === 'lent') {
  setTimeout(() => { ACTIONS.change(); evenementsFin(); }, 800);
} else if (action === 'coupure' && passages[numero] === 1) {
  // Le lanceur meurt en plein tour, comme à une coupure du poste : ni contrôle, ni marqueur retiré.
  try {
    process.kill(process.ppid, 'SIGKILL');
  } finally {
    process.exit(0);
  }
} else {
  (ACTIONS[action === 'coupure' ? 'change' : action] || ACTIONS.change)();
  evenementsFin();
}
