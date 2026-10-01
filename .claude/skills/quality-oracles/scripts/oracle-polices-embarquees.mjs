#!/usr/bin/env node
// oracle-polices-embarquees — Domaine « Polices embarquées d'un PPTX » (TF-1501, 01/10/2026).
// Scaffoldé par write-an-oracle, puis durci : le contrôle-marqueur du squelette est remplacé par le
// contrôle écrit par le produit qui a payé le défaut, porté sans nom, sans deck ni rapport.
//
// LE FAIT (lot du 30/09/2026, RA-02) : cinq versions d'un deck sont sorties avec huit polices
// embarquées fausses — texte en éclats sur tout poste qui n'a pas la police —, et oracle-pptx a
// rendu PASS sur chacune : aucune porte ne décodait la copie embarquée, et le poste producteur lit
// la police installée. Cause : la table du codage en triplets de t2embed.dll, altérée dans la
// mémoire du processus PowerPoint qui exportait.
//
// Checklist canonique (le moteur `polices-embarquees.py` l'applique à chaque partie ppt/fonts/*) :
//   E0 la partie se décode par le décodeur de Windows (t2embed.dll, chargement privé au processus) ;
//   E1 ses contours sont ceux de la police installée de même famille, graisse, pente et version ;
//   E2 aucun glyphe simple ne sort de la boîte englobante que la police déclare.
// Déclenchement : run-oracles ne route un .pptx/.potx vers ce domaine que si son paquet porte une
// partie sous `ppt/fonts/` (clé `parties_paquet` du registre) ; appelé à la main sur un deck sans
// police embarquée, l'oracle rend un SKIP motivé « sans objet ».
//
// CE QUE CE LANCEUR EXIGE DU POSTE : Node, un Python 3 et fontTools — importé par l'interpréteur
// résolu (lib/python.mjs), sinon fourni par `uv run --with fonttools` ; et, pour décoder le MTX,
// Windows (t2embed.dll). Il manque l'un d'eux : SKIP dont le motif nomme ce qui manque, jamais PASS.
//
// Usage : node oracle-polices-embarquees.mjs <fichier.pptx|.potx> [--polices <dossier de référence>]
// Contrat JSON commun · exit 0 PASS / 1 FAIL / 2 SKIP · tout SKIP porte `motif` (TF-1447).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePython } from './lib/python.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';

// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` ; ici, l'oracle le pose lui-même,
// et le PREMIER élément de non_juge le répète (domicile déclaré à l'écrivain).
const contratJSON = ecrivainDeContrat({ premier: true });
const ICI = path.dirname(fileURLToPath(import.meta.url));
const MOTEUR = path.join(ICI, 'polices-embarquees.py');
const args = process.argv.slice(2);
const iPolices = args.indexOf('--polices');
const polices = iPolices >= 0 ? args[iPolices + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && !(iPolices >= 0 && i === iPolices + 1));
const DOMAINES = { '.pptx': "Polices embarquées d'un PPTX", '.potx': "Polices embarquées d'un PPTX" };
const DOM = DOMAINES[path.extname(file || '').toLowerCase()] || "Polices embarquées d'un PPTX";
const LIMITES = [
  'le rendu réel chez le destinataire (Mac, poste sans la police) : l essai sur le poste qui a montré le défaut reste un geste humain',
  'E1 exige la police source parmi les polices de référence (poste, ou --polices), de même famille, graisse, pente ET version que la copie embarquée ; sinon E1 est déclarée non jouée police par police, et E2 juge seule',
  'un contour faux qui reste dans la boîte englobante échappe à E2 : seule E1 le voit',
  'la licence d incorporation de la police (fsType) et le choix des polices (charte) : → oracle-pptx P2 pour le jeu de polices du profil',
  'la réparation : l oracle juge, il ne réencode rien — le réencodage hors PowerPoint est un geste du producteur',
];
const out = (verdict, findings, nonJuge, code, extra = {}) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-polices-embarquees', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge, ...extra }));
  process.exit(code);
};
const skip = (motif, extra = {}) => out('SKIP', [], [motif, ...LIMITES], 2, { motif, ...extra });

if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!DOMAINES[path.extname(file).toLowerCase()]) skip(`extension non gérée (${path.extname(file) || 'aucune'}) : .pptx, .potx`);
if (polices && !fs.existsSync(polices)) skip(`dossier de polices de référence introuvable : ${polices}`);

// ---- un Python qui importe fontTools : l'interpréteur résolu, sinon uv qui le fournit ------------
function lanceur() {
  const py = resolvePython();
  if (py && spawnSync(py[0], [...py.slice(1), '-c', 'import fontTools'], { encoding: 'utf8', timeout: 30000 }).status === 0) {
    return { argv: [...py, '-B'], via: py.join(' ') };
  }
  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8', timeout: 30000 });
  if (uv.status === 0) return { argv: ['uv', 'run', '--quiet', '--no-project', '--with', 'fonttools', 'python', '-B'], via: 'uv run --with fonttools' };
  return { motif: 'fontTools introuvable : '
    + (py ? `l interpréteur résolu (${py.join(' ')}) ne l importe pas` : 'aucun interpréteur Python ne répond')
    + ', et uv n est pas sur le PATH pour le fournir — pip install fonttools, ou installer uv' };
}
const l = lanceur();
if (l.motif) skip(l.motif);
const argv = [...l.argv, MOTEUR, path.resolve(file), ...(polices ? ['--polices', path.resolve(polices)] : [])];
const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
let rap = null;
try { rap = JSON.parse((r.stdout || '').trim()); } catch { /* sortie illisible : dite ci-dessous */ }
if (!rap || !['PASS', 'FAIL', 'SKIP'].includes(rap.verdict)) {
  skip(`moteur polices-embarquees.py sans rapport lisible (via ${l.via}, exit ${r.status}${r.error ? ', ' + r.error.code : ''}) : `
    + String(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ').slice(0, 240));
}

// ---- le rapport du moteur, au contrat commun ---------------------------------------------------
const base = path.basename(file);
const extra = { moteur: { format: rap.format, version: rap.version, via: l.via }, polices: rap.polices, attributs: rap.attributs || null };
if (rap.verdict === 'SKIP') skip(rap.motif || 'le moteur n a rien jugé, sans dire pourquoi', extra);
const findings = (rap.constats || []).map((c) => ({
  sev: 'bloquant', regle: c.regle,
  msg: `${c.regle} — ${c.police} : ${c.constat}${c.exemples && c.exemples.length ? ` (exemples : ${c.exemples.join(', ')})` : ''}`,
  where: `${base}:${c.partie}`,
}));
const nonJuge = [...(rap.non_juge || []), ...LIMITES];
if (rap.verdict === 'FAIL') out('FAIL', findings, nonJuge, 1, extra);
const e1 = (rap.polices || []).filter((p) => 'contours_faux' in p).length;
const e2 = (rap.polices || []).filter((p) => 'glyphes_hors_boite' in p).length;
findings.push({ sev: 'info', msg: `conforme : ${(rap.polices || []).length} police(s) embarquée(s) décodée(s) — E2 jouée sur ${e2}, E1 sur ${e1}`, where: base });
out('PASS', findings, nonJuge, 0, extra);
