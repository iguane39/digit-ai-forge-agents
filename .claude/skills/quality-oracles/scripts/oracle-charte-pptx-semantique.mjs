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
//      slidenum au niveau slide) ;
//   S5 aucun terme proscrit par le LEXIQUE DU DESTINATAIRE, ni dans les textes de slide, ni dans
//      les notes du présentateur (TF-1152). La règle ne réimplémente rien : elle appelle le module
//      partagé `lib-lexique.mjs` du pilot, celui que lisent déjà EC-7 d'oracle-ecriture (tout .md
//      écrit) et S46 d'oracle-synthese (toute restitution). Motif : le 16/09/2026, un lexique
//      rempli n'aurait arrêté aucun titre de deck — les deux seuls juges qui le lisaient ne
//      voyaient que du Markdown, et le support de présentation, celui que le client LIT, passait
//      à côté du seul contrôle qui porte son vocabulaire. Écrire ici une liste maison aurait
//      fabriqué la classe `oracle-remplace-par-controle-maison` que ce registre compte par
//      ailleurs : deux listes à tenir, une seule tenue.
// Conventions de détection (déterministes, versionnées ici) : slide « Sommaire » = titre
// contenant « sommaire » ou « agenda » ; entrée = paragraphe « NN Intitulé » / « NN. Intitulé » ;
// intercalaire = slide contenant un paragraphe-numéro isolé (1-2 chiffres) et l'intitulé.
// Provenance : règles kicker/logo/bijection nées de renders fautifs (charte v2, « legacy renders
// to discard ») ; overrides fantômes découverts après livraison le 08/06 (inventaire P2 §2).
//
// TF-1490 (01/10/2026) — S3 ET S4 SUIVENT LA POLITIQUE PPTX DU PROFIL, COMME P1 À P3 D'ORACLE-PPTX.
// Le fait (lot Produit-64 20260928c, RA-5) : sous `--profil generique`, le support d'un client au
// format de ce client rendait 69 constats, 21 S3 sur des icônes de contenu et 48 S4 faute d'espace
// réservé, quand son pied de page et sa pagination vivent en zones de texte ; le deck de référence
// du format en porte autant. Seule issue au vert : une exemption par fichier, à renouveler pour
// chaque support. `--profil <chemin>` lit désormais `pptx.logos` (zone admise pour les logos :
// `couverture-interlocuteurs` ou `partout`) et `pptx.pied_de_page` (forme admise : `espace-reserve`
// ou `zone-texte`, un texte au bas de la diapositive, sous 80 % de sa hauteur). Une clé absente du
// profil : la règle n'est pas jouée, et c'est dit. Sans `--profil`, la charte Digit-AI, comme avant.
// Contrat JSON commun · exit 0/1/2.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolvePython } from './lib/python.mjs';
import { resolvePilot, motifPilotAbsent } from './lib/pilot.mjs';
import { ecrivainDeContrat } from './lib/contrat.mjs';
// TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` (lib/contrat.mjs) ; ici, son domicile.
const contratJSON = ecrivainDeContrat({ premier: true });

const SKILLDIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const iProfil = argv.indexOf('--profil');
const profilChemin = iProfil >= 0 ? argv[iProfil + 1] : null;
const file = argv.find((a, i) => !a.startsWith('--') && !(iProfil >= 0 && i === iProfil + 1));
const DOM = 'Charte PPTX sémantique (sommaire, kicker, logos, footer)';
const findings = [];
const non_juge = [
  'distinction logo vs image de contenu par TAILLE uniquement (≤ 2 000 000 EMU) — pas d analyse visuelle du contenu',
  'footers/pagination hérités des layouts/masters non inspectés (contrôle au niveau slide)',
  'structure zip, transitions, JPEG, compatibilité → oracle-pptx',
  'rendu visuel (débordements, contraste) → pipeline d inspection digit-ai-pptx',
  'S5 : le texte vivant dans une IMAGE (capture, schéma embarqué) échappe au lexique — seuls les <a:t> des slides et des notes sont lus'
];
const out = (verdict, code) => { process.stdout.write(contratJSON({ oracle: 'oracle-charte-pptx-semantique', domaine: DOM, artefact: file || null, verdict, findings, non_juge })); process.exit(code); };
const skip = m => { non_juge.unshift(m); out('SKIP', 2); };
if (!file || !fs.existsSync(file)) skip('fichier absent');
if (!/\.pptx$/i.test(file)) skip('extension non gérée');
// TF-1490 : la zone admise pour les logos (S3) et la forme admise du pied de page (S4) viennent du
// profil quand il est passé ; sans profil, la charte Digit-AI, comme avant.
let CHARTE = { logos: 'couverture-interlocuteurs', pied_de_page: 'espace-reserve', profil: null };
if (profilChemin) {
  let prof = null;
  try { prof = JSON.parse(fs.readFileSync(profilChemin, 'utf8')); } catch { /* dit ci-dessous */ }
  if (!prof) skip('profil illisible : ' + profilChemin);
  const pol = prof.pptx || {};
  CHARTE = { logos: pol.logos ?? null, pied_de_page: pol.pied_de_page ?? null, profil: prof.nom || path.basename(profilChemin, '.json') };
}
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
    # S5 — les NOTES du présentateur sont du texte livré : elles partent avec le fichier et
    # s'impriment en mode notes. Un terme proscrit y vit aussi longtemps que sur la slide.
    notes = ""
    mnotes = re.search(r'Target="([^"]*notesSlide[^"]*)"', srels)
    if mnotes:
        nname = "ppt/" + mnotes.group(1).lstrip("/").replace("../", "")
        notes = " ".join(re.findall(r"<a:t>([^<]*)</a:t>", read(nname)))
    has_ftr = bool(re.search(r'<p:ph type="ftr"', xml))
    has_num = bool(re.search(r'<p:ph type="sldNum"', xml) or re.search(r'type="slidenum"', xml))
    slides.append({"n": idx + 1, "file": name.split("/")[-1], "shapes": shapes, "imgs": imgs, "has_media": has_media, "has_ftr": has_ftr, "has_num": has_num, "notes": notes})
sz = re.search(r'<p:sldSz\\b[^>]*?cy="(\\d+)"', read("ppt/presentation.xml"))
print(json.dumps({"hauteur": int(sz.group(1)) if sz else None, "slides": slides}))
`;
const r = spawnSync(py[0], [...py.slice(1), '-c', script, file], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
let lu = null; try { lu = JSON.parse((r.stdout || '').trim()); } catch {}
if (!lu) skip('inspection XML inexécutable : ' + (r.stderr || '').slice(0, 120));
const slides = lu.slides;
const HAUTEUR = lu.hauteur || 6858000; // 16:9 standard quand presentation.xml ne dit rien (TF-1490, S4 en zone de texte)
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

// S3 — logos hors couverture/interlocuteurs (zone admise par le profil, TF-1490)
const LOGO_MAX_CX = 2000000;
const duProfil = CHARTE.profil ? ` (profil « ${CHARTE.profil} »)` : '';
const parLeProfil = CHARTE.profil ? ` par le profil « ${CHARTE.profil} »` : '';
if (CHARTE.logos === 'couverture-interlocuteurs') {
  for (const s of slides) {
    if (s.n === 1 || /interlocuteur/i.test(titleOf(s))) continue;
    s.imgs.filter(i => i.cx > 0 && i.cx <= LOGO_MAX_CX).forEach(() => findings.push({ sev: 'bloquant', msg: `S3 — image au gabarit logo (≤ ${LOGO_MAX_CX} EMU) hors couverture/interlocuteurs`, where: s.file }));
  }
} else if (CHARTE.logos === 'partout') {
  non_juge.push(`S3 : logos et petites images admis sur toute diapositive${duProfil}, pptx.logos = partout — aucune zone à juger`);
} else {
  non_juge.push(CHARTE.logos == null
    ? `S3 NON jouée : le profil${duProfil} ne déclare aucune zone admise pour les logos (pptx.logos : couverture-interlocuteurs ou partout)`
    : `S3 NON jouée : zone de logos « ${CHARTE.logos} » inconnue${duProfil} (attendu couverture-interlocuteurs ou partout)`);
}

// S4 — footer + pagination sur les slides de contenu, dans la forme admise par le profil (TF-1490)
//   espace-reserve : placeholders ftr et sldNum (ou champ slidenum) au niveau de la diapositive ;
//   zone-texte     : un texte au bas de la diapositive (sous 80 % de sa hauteur) ; la pagination est
//                    un texte de ce bandeau qui FINIT par un numéro (« 12 », « 12 / 25 », « … · 12 »).
const NUMERO_SEUL = /^\s*\d{1,3}(?:\s*\/\s*\d{1,3})?\s*$/;
const FINIT_PAR_NUMERO = /(?:^|[\s·|—–-])\d{1,3}(?:\s*\/\s*\d{1,3})?\s*$/;
if (CHARTE.pied_de_page === 'espace-reserve' || CHARTE.pied_de_page === 'zone-texte') {
  const texte = CHARTE.pied_de_page === 'zone-texte';
  for (const s of slides) {
    if (s.n === 1 || /interlocuteur/i.test(titleOf(s))) continue;
    const bas = texte ? s.shapes.filter(x => !x.ph && x.y != null && x.y >= 0.8 * HAUTEUR && x.text) : [];
    const pied = s.has_ftr || bas.some(x => !NUMERO_SEUL.test(x.text));
    const page = s.has_num || bas.some(x => FINIT_PAR_NUMERO.test(x.text));
    if (!pied) findings.push({ sev: 'bloquant', msg: texte ? `S4 — footer absent (zone de texte au bas de la diapositive, forme admise${parLeProfil})` : 'S4 — footer absent (placeholder ftr au niveau slide)', where: s.file });
    if (!page) findings.push({ sev: 'bloquant', msg: texte ? `S4 — pagination absente (numéro en zone de texte au bas de la diapositive, forme admise${parLeProfil})` : 'S4 — pagination absente (placeholder sldNum au niveau slide)', where: s.file });
  }
} else {
  non_juge.push(CHARTE.pied_de_page == null
    ? `S4 NON jouée : le profil${duProfil} ne déclare aucune forme admise pour le pied de page (pptx.pied_de_page : espace-reserve ou zone-texte)`
    : `S4 NON jouée : forme de pied de page « ${CHARTE.pied_de_page} » inconnue${duProfil} (attendu espace-reserve ou zone-texte)`);
}

// S5 — le lexique du destinataire (TF-1152, 16/09/2026).
// La règle N'EMBARQUE AUCUNE LISTE : elle appelle `lib-lexique.mjs` du pilot, le module que lisent
// déjà EC-7 (tout .md écrit) et S46 (toute restitution). Le lexique vit chez le PRODUIT, jamais au
// pilot — le terme fondateur d'un retour client est souvent un mot juste ailleurs, et un contrôle
// qui crie sur l'usage légitime se fait désactiver dans la semaine. Absent, la règle le DIT au
// non_juge : un deck n'est jamais déclaré conforme au vocabulaire par le silence du lexique.
let s5Etat = null;
{
  const pilot = resolvePilot(SKILLDIR);
  let lexmod = null;
  if (!pilot) {
    non_juge.push(`S5 — vocabulaire du destinataire NON jugé : ${motifPilotAbsent(SKILLDIR)} ; `
      + 'le module partagé `oracles/lib-lexique.mjs` est injoignable depuis ce poste');
  } else {
    try { lexmod = await import(pathToFileURL(path.join(pilot, 'oracles', 'lib-lexique.mjs')).href); }
    catch (e) {
      non_juge.push('S5 — vocabulaire du destinataire NON jugé : module partagé illisible ('
        + path.join(pilot, 'oracles', 'lib-lexique.mjs') + ') — ' + String(e.message).slice(0, 120));
    }
  }
  if (lexmod) {
    const lex = lexmod.chargerLexique({ cheminJuge: file });
    if (!lex.trouve) non_juge.push('S5 — aucun lexique du destinataire dans le socle du projet de ce deck (forge\\LEXIQUE.json, docs\\projet\\LEXIQUE.json ou references\\LEXIQUE.json) : vocabulaire non jugé');
    else if (lex.illisible) non_juge.push(`S5 — lexique ILLISIBLE (${lex.chemin}) : ${lex.illisible} — ce n'est pas un constat sur le deck`);
    else if (!lex.termes.length) non_juge.push(`S5 — lexique présent et VIDE (${lex.chemin}) : aucun terme n'a encore coûté d'aller-retour`);
    else {
      let employesTotal = 0;
      for (const s of slides) {
        const texte = [...s.shapes.map(x => x.text || ''), s.notes || ''].join('\n');
        const employes = lexmod.termesEmployes(texte, lex.termes);
        if (!employes.length) continue;
        employesTotal += employes.length;
        findings.push({
          sev: 'bloquant',
          msg: `S5 — ${employes.length} terme(s) proscrit(s) par le lexique du destinataire (${lex.chemin}) : `
            + employes.map(t => `« ${t.proscrit} » (${t.occurrences}) → « ${t.remplacer_par || 'à remplacer'} »`).join(' · ')
            + " — un mot qui a coûté un aller-retour au client se remplace avant la livraison, pas après le second retour",
          where: s.file,
        });
      }
      s5Etat = employesTotal
        ? `${employesTotal} emploi(s) proscrit(s)`
        : `aucun des ${lex.termes.length} terme(s) proscrit(s) de ${lex.chemin} employé, textes et notes lus`;
    }
  }
}

if (findings.length) out('FAIL', 1);
// TF-1490 : un PASS dit quelles règles il a jouées — sous un profil qui ne déclare pas S3 ou S4, elles ne l'ont pas été.
const regles34 = (CHARTE.logos === 'couverture-interlocuteurs' && CHARTE.pied_de_page === 'espace-reserve') ? 'S1-S4 vérifiés'
  : `S1-S2 vérifiés, S3 ${CHARTE.logos === 'couverture-interlocuteurs' ? 'vérifiée' : CHARTE.logos === 'partout' ? 'sans zone à juger' : 'NON jouée'}, `
    + `S4 ${['espace-reserve', 'zone-texte'].includes(CHARTE.pied_de_page) ? 'vérifiée (' + CHARTE.pied_de_page + ')' : 'NON jouée'}${duProfil}`;
findings.push({ sev: 'info', msg: `conforme : ${slides.length} slide(s), ${regles34}`
  + (s5Etat ? ` ; S5 — ${s5Etat}` : ' ; S5 non jouée (motif au non_juge)'), where: path.basename(file) });
out('PASS', 0);
