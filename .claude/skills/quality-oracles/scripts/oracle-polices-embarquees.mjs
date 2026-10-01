#!/usr/bin/env node
// oracle-polices-embarquees — Domaines « Polices embarquées d'un PPTX » (TF-1501), « … d'un DOCX »,
// « … d'un PDF » et « … d'une page HTML » (TF-1504), 01/10/2026. Scaffoldé par write-an-oracle,
// puis durci : le contrôle-marqueur du squelette est remplacé par le contrôle écrit par le produit
// qui a payé le défaut, porté sans nom, sans deck ni rapport.
//
// LE FAIT (lot du 30/09/2026, RA-02) : cinq versions d'un deck sont sorties avec huit polices
// embarquées fausses — texte en éclats sur tout poste qui n'a pas la police —, et oracle-pptx a
// rendu PASS sur chacune : aucune porte ne décodait la copie embarquée, et le poste producteur lit
// la police installée. Cause : la table du codage en triplets de t2embed.dll, altérée dans la
// mémoire du processus PowerPoint qui exportait. La décision humaine du même jour (RP-04) demande
// ce juge pour chaque document généré : PPTX, DOCX, PDF et page HTML le reçoivent ici.
//
// Checklist canonique (le moteur `polices-embarquees.py` l'applique à chaque police embarquée) :
//   E0 la police se décode comme la décode le poste du destinataire (PPTX : t2embed.dll ; DOCX :
//      désobscurcissement par la clé de fontTable.xml ; PDF : programme FontFile2 ou FontFile3 ;
//      page HTML : base64 d'une règle @font-face, WOFF2, WOFF ou sfnt) ;
//   E1 ses contours sont ceux de la police installée de même famille, graisse, pente et version ;
//   E2 aucun glyphe simple ne sort de la boîte englobante que la police déclare.
// Déclenchement : run-oracles ne route un .pptx/.potx que si son paquet porte une partie sous
// `ppt/fonts/`, un .docx/.dotx que s'il en porte une sous `word/fonts/` (clé `parties_paquet` du
// registre), une page que si elle porte une police en data: dans une règle @font-face
// (`content_patterns`) ; tout .pdf est routé. Sans police embarquée, SKIP motivé « sans objet ».
//
// CE QUE CE LANCEUR EXIGE DU POSTE : Node, un Python 3 et fontTools — pypdf en plus pour un PDF,
// brotli pour une page —, importés par l'interpréteur résolu (lib/python.mjs), sinon fournis par
// `uv run --with …` ; et, pour décoder le MTX d'un PPTX, Windows (t2embed.dll). Il manque l'un
// d'eux : SKIP dont le motif nomme ce qui manque, jamais PASS.
//
// Usage : node oracle-polices-embarquees.mjs <fichier.pptx|.potx|.docx|.dotx|.pdf|.html|.htm> [--polices <dossier de référence>]
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
const PPTX = "Polices embarquées d'un PPTX", DOCX = "Polices embarquées d'un DOCX", PDF = "Polices embarquées d'un PDF";
const HTML = "Polices embarquées d'une page HTML";
const DOMAINES = { '.pptx': PPTX, '.potx': PPTX, '.docx': DOCX, '.dotx': DOCX, '.pdf': PDF, '.html': HTML, '.htm': HTML };
const ext = path.extname(file || '').toLowerCase();
const DOM = DOMAINES[ext] || PPTX;
// Les modules Python dont le moteur a besoin, par type : pypdf ne sert qu'au PDF, brotli qu'au WOFF2 d'une page.
const MODULES = [['fontTools', 'fonttools'], ...(ext === '.pdf' ? [['pypdf', 'pypdf']] : []),
  ...(DOMAINES[ext] === HTML ? [['brotli', 'brotli']] : [])];
const LIMITES = [
  'le rendu réel chez le destinataire (Mac, poste sans la police) : l essai sur le poste qui a montré le défaut reste un geste humain',
  'E1 exige la police source parmi les polices de référence (poste, ou --polices), de même famille, graisse, pente ET version que la copie embarquée ; sinon E1 est déclarée non jouée police par police, et E2 juge seule',
  'un contour faux qui reste dans la boîte englobante échappe à E2 : seule E1 le voit',
  'les contours CFF (PDF FontFile3 Type1C, CIDFontType0C, OpenType CFF, WOFF à contours CFF) et Type 1 (FontFile) : comptés et dits, non jugés — seuls les contours TrueType (glyf) le sont',
  'une page HTML : seules les polices en data: d une règle @font-face sont lues ; une police appelée par URL (fichier voisin, réseau) n est pas embarquée, et pas jugée',
  'la licence d incorporation de la police (fsType) et le choix des polices (charte) : → oracle-pptx P2 pour le jeu de polices du profil',
  'la réparation : l oracle juge, il ne réencode rien — le réencodage est un geste du producteur',
];
const out = (verdict, findings, nonJuge, code, extra = {}) => {
  process.stdout.write(contratJSON({ oracle: 'oracle-polices-embarquees', domaine: DOM, artefact: file || null, verdict, findings, non_juge: nonJuge, ...extra }));
  process.exit(code);
};
const skip = (motif, extra = {}) => out('SKIP', [], [motif, ...LIMITES], 2, { motif, ...extra });

if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!DOMAINES[ext]) skip(`extension non gérée (${path.extname(file) || 'aucune'}) : ${Object.keys(DOMAINES).join(', ')}`);
if (polices && !fs.existsSync(polices)) skip(`dossier de polices de référence introuvable : ${polices}`);

// ---- un Python qui importe ses modules : l'interpréteur résolu, sinon uv qui les fournit --------
function lanceur() {
  const py = resolvePython();
  const importe = `import ${MODULES.map((m) => m[0]).join(', ')}`;
  if (py && spawnSync(py[0], [...py.slice(1), '-c', importe], { encoding: 'utf8', timeout: 30000 }).status === 0) {
    return { argv: [...py, '-B'], via: py.join(' ') };
  }
  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8', timeout: 30000 });
  if (uv.status === 0) {
    return { argv: ['uv', 'run', '--quiet', '--no-project', ...MODULES.flatMap((m) => ['--with', m[1]]), 'python', '-B'],
      via: 'uv run ' + MODULES.map((m) => '--with ' + m[1]).join(' ') };
  }
  return { motif: MODULES.map((m) => m[0]).join(' et ') + ' introuvable(s) : '
    + (py ? `l interpréteur résolu (${py.join(' ')}) ne les importe pas` : 'aucun interpréteur Python ne répond')
    + ', et uv n est pas sur le PATH pour les fournir — pip install ' + MODULES.map((m) => m[1]).join(' ') + ', ou installer uv' };
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
// Un constat porte sa sévérité : bloquant par défaut ; E0 d'un PDF avertit (un lecteur de PDF répare
// ce qu'il peut d'un programme de police, mesuré le 01/10/2026), et le niveau production le promeut.
const findings = (rap.constats || []).map((c) => ({
  sev: c.sev === 'warn' ? 'warn' : 'bloquant', regle: c.regle,
  msg: `${c.regle} — ${c.police} : ${c.constat}${c.exemples && c.exemples.length ? ` (exemples : ${c.exemples.join(', ')})` : ''}`,
  where: `${base}:${c.partie}`,
}));
const nonJuge = [...(rap.non_juge || []), ...LIMITES];
if (rap.verdict === 'FAIL') out('FAIL', findings, nonJuge, 1, extra);
const e1 = (rap.polices || []).filter((p) => 'contours_faux' in p).length;
const e2 = (rap.polices || []).filter((p) => 'glyphes_hors_boite' in p).length;
const avert = findings.filter((f) => f.sev === 'warn').length;
findings.push({ sev: 'info', msg: `conforme : ${(rap.polices || []).length} police(s) embarquée(s) — E2 jouée sur ${e2}, E1 sur ${e1}`
  + (avert ? ` ; ${avert} avertissement(s) à vérifier chez le destinataire` : ''), where: base });
out('PASS', findings, nonJuge, 0, extra);
