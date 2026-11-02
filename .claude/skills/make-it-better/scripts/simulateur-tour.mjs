#!/usr/bin/env node
// simulateur-tour.mjs — joue un tour à la place du modèle, pour `lancer.mjs --simuler <cas>` : il écrit
// dans le dossier du tour ce qu'un modèle y écrirait et rend un flux stream-json. Il n'appelle rien.
//   node simulateur-tour.mjs <cas> <numero>   (lancé par lancer.mjs, dossier du tour pour répertoire)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const DIAPOS = join('paquet', 'ppt', 'slides');
const diapo = (nom) => join(DIAPOS, nom);

/** Les formes d'un paquet, tirées du XML tel qu'un tour le voit : fixture comme deck réel. */
function formesDuPaquet() {
  const out = [];
  for (const fichier of readdirSync(DIAPOS).filter((n) => /^slide\d+\.xml$/.test(n))) {
    const xml = readFileSync(diapo(fichier), 'utf8');
    for (const m of xml.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g)) {
      const car = [...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].reduce((s, t) => s + t[1].length, 0);
      out.push({ fichier, debut: m.index, texte: m[0], car });
    }
  }
  return out.sort((a, b) => b.car - a.car);
}

function ajouterDansForme(f, ajout) {
  const xml = readFileSync(diapo(f.fichier), 'utf8');
  const fin = f.debut + f.texte.lastIndexOf('</a:t>');
  writeFileSync(diapo(f.fichier), `${xml.slice(0, fin)}${ajout}${xml.slice(fin)}`);
}

const formeNommee = (nom) => formesDuPaquet().find((f) => f.texte.includes(`name="${nom}"`));

function ajouterPhrase(phrase) {
  if (ext === 'md') writeFileSync('document.md', `${readFileSync('document.md', 'utf8')}\n${phrase}\n`);
  else if (ext === 'html') writeFileSync('document.html', readFileSync('document.html', 'utf8').replace('</main>', `<p>${phrase}</p></main>`));
  else if (ext === 'docx') writeFileSync(XML, readFileSync(XML, 'utf8').replace(ANCRE_XML, ` ${phrase}${ANCRE_XML}`));
  else if (ext === 'pptx') ajouterDansForme(formesDuPaquet()[0], ` ${phrase}`);
  else {
    const ancien = LIGNES_FIXTURE[(numero - 1) % LIGNES_FIXTURE.length];
    writeFileSync('modifs.json', JSON.stringify([{ ancien, nouveau: phrase }]));
  }
}

const NEUTRE = 'Le tri sépare les pièces.';

const toucher = (chemin, avant, apres) => { const f = join('paquet', ...chemin.split('/')); writeFileSync(f, readFileSync(f, 'utf8').replace(avant, apres)); };

const ACTIONS = {
  change() { ajouterPhrase(NEUTRE); note('reformulation'); },
  court() { ajouterPhrase('Le tri.'); note('reformulation'); },
  'pptx-masque'() { ajouterPhrase(NEUTRE); toucher('ppt/slideMasters/slideMaster1.xml', 'Archives', 'Fonds'); note('reformulation'); },
  'pptx-disposition'() { ajouterPhrase(NEUTRE); toucher('ppt/slideLayouts/slideLayout1.xml', 'bureau', 'siège'); note('reformulation'); },
  'pptx-notes'() { ajouterPhrase(NEUTRE); toucher('ppt/notesSlides/notesSlide2.xml', 'rappelle', 'redit'); note('reformulation'); },
  'pptx-media'() { ajouterPhrase(NEUTRE); const f = join('paquet', 'ppt', 'media', 'image1.jpg'); writeFileSync(f, Buffer.concat([readFileSync(f), Buffer.from([0])])); note('reformulation'); },
  'pptx-relations'() { ajouterPhrase(NEUTRE); toucher('ppt/slides/_rels/slide2.xml.rels', 'slideLayout1.xml', 'slideLayout1.xml" TargetMode="Internal'); note('reformulation'); },
  'pptx-diapo-neuve'() { ajouterPhrase(NEUTRE); writeFileSync(diapo('slide11.xml'), readFileSync(diapo('slide10.xml'))); note('reformulation'); },
  'pptx-diapo-supprimee'() { rmSync(diapo('slide10.xml')); note('retrait', 'La dernière diapositive sort.', 'La dernière diapositive.'); },
  'pptx-aucune-diapo'() { rmSync(DIAPOS, { recursive: true }); note('reformulation'); },
  'pptx-balise'() { toucher('ppt/slides/slide2.xml', '</a:t>', '</a:x>'); note('reformulation'); },
  'pptx-un-octet'() { const f = diapo('slide1.xml'); writeFileSync(f, `${readFileSync(f, 'utf8')}\n`); note('reformulation'); },
  'pptx-gain-trop'() { const f = formeNommee('Titre'); ajouterDansForme(f, 'x'.repeat(Math.floor(f.car / 10) + 1)); note('ajout'); },
  'pptx-gain-juste'() { const f = formeNommee('Corps'); ajouterDansForme(f, 'x'.repeat(Math.floor(f.car / 10))); note('ajout'); },
  'pptx-forme-neuve'() { const f = formeNommee('Corps'); toucher('ppt/slides/slide2.xml', '</p:spTree>', `${f.texte.replace('id="3"', 'id="30"').replace(/<a:t>[^<]*<\/a:t>/g, '<a:t></a:t>')}</p:spTree>`); note('ajout'); },
  'pptx-forme-supprimee'() { toucher('ppt/slides/slide2.xml', formeNommee('Corps').texte, ''); note('retrait', 'Le corps sort.', 'Le corps de la diapositive.'); },
  'pptx-fait-masque'() { ajouterPhrase('Fonds de 1987, salle Mimosas.'); note('ajout'); },
  'pptx-fait-disposition'() { ajouterPhrase('Le bureau Glycines signe.'); note('ajout'); },
  'pptx-fait-notes'() { ajouterPhrase('Ariane Glossaire ouvre.'); note('ajout'); },
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
