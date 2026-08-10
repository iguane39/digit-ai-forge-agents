#!/usr/bin/env node
// oracle-charte-pptx-semantique — Domaine « Charte PPTX sémantique (sommaire, kicker, logos, footer) ».
// Comble le non_juge déclaré d'oracle-pptx (« charte sémantique → gate digit-ai-pptx », jusqu'ici
// purement comportemental). Inspection XML du .pptx réel via python zipfile (même mécanique
// qu'oracle-pptx — R3 : pas de réimplémentation zip maison). Checklist canonique :
//   S1 bijection stricte sommaire ↔ intercalaires : chaque entrée numérotée du slide « Sommaire »
//      a un intercalaire portant le même numéro et le même intitulé, et réciproquement ;
//   S2 aucun kicker au-dessus d'un titre : aucune forme texte positionnée au-dessus du
//      placeholder titre d'un slide ;
//   S3 aucun logo hors couverture (slide 1) et slide « interlocuteurs » — logo = image de
//      largeur ≤ 2 000 000 EMU (~5,5 cm), seuil documenté ici ;
//   S4 footer + pagination présents sur les slides de contenu (placeholders ftr/sldNum ou champ
//      slidenum au niveau slide).
// Conventions de détection (déterministes, versionnées ici) : slide « Sommaire » = titre
// contenant « sommaire » ou « agenda » ; entrée = paragraphe « NN Intitulé » / « NN. Intitulé » ;
// intercalaire = slide contenant un paragraphe-numéro isolé (1-2 chiffres) et l'intitulé.
// Provenance : règles kicker/logo/bijection nées de renders fautifs (charte v2, « legacy renders
// to discard ») ; overrides fantômes découverts après livraison le 08/06 (inventaire P2 §2).
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePython } from './lib/python.mjs';

const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const DOM = 'Charte PPTX sémantique (sommaire, kicker, logos, footer)';
const findings = [];
const non_juge = [
  'distinction logo vs image de contenu par TAILLE uniquement (≤ 2 000 000 EMU) — pas d analyse visuelle du contenu',
  'footers/pagination hérités des layouts/masters non inspectés (contrôle au niveau slide)',
  'structure zip, transitions, JPEG, compatibilité → oracle-pptx',
  'rendu visuel (débordements, contraste) → pipeline d inspection digit-ai-pptx'
];
const out = (verdict, code) => { process.stdout.write(JSON.stringify({ oracle: 'oracle-charte-pptx-semantique', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!/\.pptx$/i.test(file)) skip('extension non gérée');
const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
if (!py) skip('python indisponible (lecture zip impossible)');

const script = `
import sys, zipfile, re, json
z = zipfile.ZipFile(sys.argv[1])
def read(n):
    try: return z.read(n).decode("utf-8", "replace")
    except KeyError: return ""
rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', read("ppt/_rels/presentation.xml.rels")))
order = [rels.get(rid, "") for rid in re.findall(r'<p:sldId[^>]*r:id="([^"]+)"', read("ppt/presentation.xml"))]
slides = []
for idx, target in enumerate(order):
    name = "ppt/" + target.lstrip("/").replace("../", "")
    xml = read(name)
    srels = read("ppt/slides/_rels/" + name.split("/")[-1] + ".rels")
    shapes = []
    for sp in re.findall(r"<p:sp>.*?</p:sp>", xml, re.S):
        ph = re.search(r'<p:ph type="([^"]+)"', sp)
        off = re.search(r'<a:off x="(-?\\d+)" y="(-?\\d+)"', sp)
        txt = " ".join(t for t in re.findall(r"<a:t>([^<]*)</a:t>", sp)).strip()
        paras = [" ".join(re.findall(r"<a:t>([^<]*)</a:t>", p)).strip() for p in re.findall(r"<a:p>.*?</a:p>", sp, re.S)]
        shapes.append({"ph": ph.group(1) if ph else None, "y": int(off.group(2)) if off else None, "text": txt, "paras": [p for p in paras if p]})
    imgs = []
    for pic in re.findall(r"<p:pic>.*?</p:pic>", xml, re.S):
        ext = re.search(r'<a:ext cx="(\\d+)" cy="(\\d+)"', pic)
        if ext: imgs.append({"cx": int(ext.group(1))})
    has_media = bool(re.search(r'Target="\\.\\./media/', srels))
    has_ftr = bool(re.search(r'<p:ph type="ftr"', xml))
    has_num = bool(re.search(r'<p:ph type="sldNum"', xml) or re.search(r'type="slidenum"', xml))
    slides.append({"n": idx + 1, "file": name.split("/")[-1], "shapes": shapes, "imgs": imgs, "has_media": has_media, "has_ftr": has_ftr, "has_num": has_num})
print(json.dumps(slides))
`;
const r = spawnSync(py[0], [...py.slice(1), '-c', script, file], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
let slides = null; try { slides = JSON.parse((r.stdout || '').trim()); } catch {}
if (!slides) skip('inspection XML inexécutable : ' + (r.stderr || '').slice(0, 120));
if (!slides.length) { findings.push({ sev: 'bloquant', msg: 'aucun slide résolu depuis presentation.xml', where: path.basename(file) }); out('FAIL', 1); }

const titleOf = s => { const t = s.shapes.find(x => x.ph === 'title' || x.ph === 'ctrTitle'); return t ? t.text : ''; };
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const ENTRY = /^(\d{1,2})\s*[.·—-]?\s+(.{2,})$/;

// S1 — sommaire ↔ intercalaires
const sommaire = slides.find(s => /sommaire|agenda/i.test(titleOf(s)));
if (sommaire) {
  const entries = sommaire.shapes.filter(x => x.ph !== 'title' && x.ph !== 'ctrTitle').flatMap(x => x.paras).map(p => p.match(ENTRY)).filter(Boolean).map(m => ({ num: m[1].padStart(2, '0'), titre: m[2].trim() }));
  const libres = s => s.shapes.filter(x => !x.ph);
  const inters = slides.filter(s => s !== sommaire && libres(s).some(x => x.paras.some(p => /^\d{1,2}$/.test(p))));
  for (const e of entries) {
    const hit = inters.find(s => libres(s).some(x => x.paras.some(p => p.padStart(2, '0') === e.num)) && libres(s).some(x => x.paras.some(p => norm(p) === norm(e.titre))));
    if (!hit) findings.push({ sev: 'bloquant', msg: `S1 — entrée de sommaire sans intercalaire correspondant : « ${e.num} ${e.titre} »`, where: sommaire.file });
  }
  for (const s of inters) {
    const num = libres(s).flatMap(x => x.paras).find(p => /^\d{1,2}$/.test(p));
    const match = entries.find(e => e.num === num.padStart(2, '0') && libres(s).some(x => x.paras.some(p => norm(p) === norm(e.titre))));
    if (!match) findings.push({ sev: 'bloquant', msg: `S1 — intercalaire « ${num} » sans entrée de sommaire correspondante (numéro+intitulé)`, where: s.file });
  }
  if (!entries.length) findings.push({ sev: 'bloquant', msg: 'S1 — slide Sommaire sans entrée numérotée détectable (format « NN Intitulé »)', where: sommaire.file });
} else non_juge.push('S1 : aucun slide « Sommaire/Agenda » détecté — bijection non jugée (deck sans sommaire ou convention de titre différente)');

// S2 — kicker au-dessus du titre
for (const s of slides) {
  const t = s.shapes.find(x => x.ph === 'title' || x.ph === 'ctrTitle');
  if (!t || t.y == null) continue;
  for (const x of s.shapes) {
    if (x === t || !x.text || x.y == null) continue;
    if (x.y < t.y) findings.push({ sev: 'bloquant', msg: `S2 — texte au-dessus du titre (kicker interdit) : « ${x.text.slice(0, 60)} »`, where: s.file });
  }
}

// S3 — logos hors couverture/interlocuteurs
const LOGO_MAX_CX = 2000000;
for (const s of slides) {
  if (s.n === 1 || /interlocuteur/i.test(titleOf(s))) continue;
  s.imgs.filter(i => i.cx > 0 && i.cx <= LOGO_MAX_CX).forEach(() => findings.push({ sev: 'bloquant', msg: `S3 — image au gabarit logo (≤ ${LOGO_MAX_CX} EMU) hors couverture/interlocuteurs`, where: s.file }));
}

// S4 — footer + pagination sur les slides de contenu
for (const s of slides) {
  if (s.n === 1 || /interlocuteur/i.test(titleOf(s))) continue;
  if (!s.has_ftr) findings.push({ sev: 'bloquant', msg: 'S4 — footer absent (placeholder ftr au niveau slide)', where: s.file });
  if (!s.has_num) findings.push({ sev: 'bloquant', msg: 'S4 — pagination absente (placeholder sldNum au niveau slide)', where: s.file });
}

if (findings.length) out('FAIL', 1);
findings.push({ sev: 'info', msg: `conforme : ${slides.length} slide(s), S1-S4 vérifiés`, where: path.basename(file) });
out('PASS', 0);
