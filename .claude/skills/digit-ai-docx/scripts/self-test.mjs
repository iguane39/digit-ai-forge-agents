#!/usr/bin/env node
// self-test — digit-ai-docx (TF-1027). Double sens, zéro dépendance, rejouable.
//
//   VERT  un plan de mémoire technique rendu sur une marque synthétique : oracle-docx PASS (D1-D6,
//         D6 déléguée au verifier-ooxml.py du pilot) ; relecture par une bibliothèque TIERCE
//         (python-docx) quand elle est installée — titres, puces et tableau retrouvés ;
//   ROUGE quatre paquets abîmés à partir du vert, chacun pour UNE raison, et chacun doit tomber
//         sur SA règle : w:sectPr en tête du corps (D5), w:pPr après un run (D5), styles.xml
//         retiré sous sa relation (D3), corps tronqué (D4) ;
//   ROUGE une marque sans police de corps : le rendu REFUSE (exit 2) au lieu d'inventer ;
//   TRAME le vert sert de trame imposée à un second plan : oracle PASS, styles.xml repris OCTET
//         pour OCTET, format de page repris, relevé qui retrouve les styles de titre.
// Sortie JSON · exit 0 = tout conforme, 1 = un cas au moins en échec.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ecrireZip, lireZip } from './lib-zip.mjs';
import { juger } from './oracle-docx.mjs';
import { rendreSurMarque, rendreSurTrame, lireMarque, relever } from './rendre-docx.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const F = path.resolve(ICI, '..', 'fixtures');
const cas = [];
const non_juge = [];
const verif = (nom, ok, detail = '') => cas.push({ nom, ok: !!ok, detail: String(detail).slice(0, 300) });
const regles = (r) => r.findings.filter((f) => f.sev === 'bloquant').map((f) => f.msg.split(' — ')[0]);

const plan = JSON.parse(fs.readFileSync(path.join(F, 'plan-memoire.json'), 'utf8'));
const vert = rendreSurMarque(plan, lireMarque(path.join(F, 'marque')));
const jv = juger(vert.buffer, 'vert.docx');
verif('VERT — le mémoire rendu sur la marque passe D1-D6', jv.findings.length === 0, JSON.stringify(jv.findings));
const d6 = jv.non_juge.find((n) => n.startsWith('D6 NON JUGÉE'));
if (d6) non_juge.push(d6); else verif('VERT — D6 jouée par le verifier-ooxml.py du pilot', jv.mesure.drawingml_controles !== undefined, JSON.stringify(jv.mesure));
verif('VERT — deux rendus du même plan donnent les mêmes octets', rendreSurMarque(plan, lireMarque(path.join(F, 'marque'))).buffer.equals(vert.buffer));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'digit-ai-docx-'));
const fVert = path.join(tmp, 'vert.docx');
fs.writeFileSync(fVert, vert.buffer);
const py = spawnSync('python', ['-c', [
  'import sys, json, docx',
  'd = docx.Document(sys.argv[1])',
  'print(json.dumps({"titres": [p.text for p in d.paragraphs if p.style.name.startswith("Heading")], "puces": sum(1 for p in d.paragraphs if p.style.name == "List Bullet"), "tableaux": len(d.tables), "cellule": d.tables[0].cell(0, 0).text if d.tables else None}))',
].join('\n'), fVert], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
let lu = null;
try { lu = JSON.parse(py.stdout); } catch { /* bibliothèque absente */ }
if (!lu) non_juge.push(`relecture tierce NON JOUÉE : python-docx indisponible (${(py.stderr || '').trim().split('\n').pop() || 'python absent'})`);
else {
  const attendus = plan.sections.map((s) => s.titre);
  verif('VERT — une bibliothèque tierce relit les titres MOT POUR MOT', JSON.stringify(lu.titres) === JSON.stringify(attendus), JSON.stringify(lu.titres));
  verif('VERT — … les puces et le tableau', lu.puces === 3 && lu.tableaux === 1 && lu.cellule === 'Exigence', JSON.stringify(lu));
}

const abimer = (transfo) => {
  const p = lireZip(vert.buffer);
  const parts = [...p].map(([nom, donnees]) => ({ nom, donnees }));
  return ecrireZip(transfo(parts));
};
const surDoc = (f) => (parts) => parts.map((q) => (q.nom === 'word/document.xml' ? { ...q, donnees: f(q.donnees.toString('utf8')) } : q));
const rouges = [
  ['w:sectPr en tête du corps', surDoc((d) => d.replace(/(<w:body>)([\s\S]*)(<w:sectPr>[\s\S]*<\/w:sectPr>)(<\/w:body>)/, '$1$3$2$4')), 'D5', /sectPr/],
  ['w:pPr après un run', surDoc((d) => d.replace(/<w:p><w:pPr>([\s\S]*?)<\/w:pPr>(<w:r>[\s\S]*?<\/w:r>)/, '<w:p>$2<w:pPr>$1</w:pPr>')), 'D5', /w:pPr/],
  ['styles.xml retiré sous sa relation', (parts) => parts.filter((q) => q.nom !== 'word/styles.xml'), 'D3', /styles\.xml/],
  ['corps tronqué (</w:body> perdu)', surDoc((d) => d.replace('</w:body>', '')), 'D4', /jamais fermé|ferme/],
];
for (const [nom, transfo, regle, motif] of rouges) {
  const r = juger(abimer(transfo), 'rouge.docx', { deleguer: false });
  const msgs = r.findings.map((f) => f.msg).join(' | ');
  verif(`ROUGE — ${nom} → ${regle}`, regles(r).includes(regle) && motif.test(msgs), msgs || 'aucun constat');
}

let refus = null;
try { lireMarque(path.join(F, 'marque-incomplete')); } catch (e) { refus = e.message; }
verif('ROUGE — marque sans police de corps : le rendu REFUSE au lieu d\'inventer', refus && /--sans/.test(refus), refus || 'aucun refus');

const planTrame = JSON.parse(fs.readFileSync(path.join(F, 'plan-sur-trame.json'), 'utf8'));
const surTrame = rendreSurTrame(planTrame, vert.buffer);
const jt = juger(surTrame.buffer, 'trame.docx', { deleguer: false });
verif('TRAME — le document rendu sur la trame passe D1-D5', jt.findings.length === 0, JSON.stringify(jt.findings));
const pv = lireZip(vert.buffer), pt = lireZip(surTrame.buffer);
verif('TRAME — styles.xml de la trame repris OCTET POUR OCTET', pv.get('word/styles.xml').equals(pt.get('word/styles.xml')));
const sect = (b) => (/<w:sectPr>[\s\S]*<\/w:sectPr>/.exec(b.get('word/document.xml').toString('utf8')) || [''])[0];
verif('TRAME — format de page de la trame repris', sect(pv) && sect(pv) === sect(pt));
const rel = relever(vert.buffer);
verif('TRAME — le relevé retrouve titre, titres 1-2, puce et tableau', rel.correspondance.h1 === 'Heading1' && rel.correspondance.h2 === 'Heading2' && rel.correspondance.puce === 'ListBullet' && rel.correspondance.tableau === 'TableauMarque', JSON.stringify(rel.correspondance));

fs.rmSync(tmp, { recursive: true, force: true });
const rates = cas.filter((c) => !c.ok);
process.stdout.write(JSON.stringify({ self_test: 'digit-ai-docx', verdict: rates.length ? 'FAIL' : 'PASS', cas: cas.map((c) => `${c.ok ? 'OK   ' : 'ECHEC'} ${c.nom}${c.ok ? '' : ' — ' + c.detail}`), non_juge }, null, 2) + '\n');
process.exit(rates.length ? 1 : 0);
