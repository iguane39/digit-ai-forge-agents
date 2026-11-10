#!/usr/bin/env node
// oracle-charte-pptx-semantique — Domaine « Charte PPTX sémantique (sommaire, kicker, logos, footer) ».
// Comble le non_juge déclaré d'oracle-pptx (« charte sémantique → gate digit-ai-pptx », jusqu'ici
// purement comportemental). Inspection XML du .pptx réel via python zipfile (même mécanique
// qu'oracle-pptx — R3 : pas de réimplémentation zip maison). Checklist canonique :
//   S1 bijection stricte sommaire ↔ intercalaires : chaque entrée numérotée du slide « Sommaire »
//      a un intercalaire portant le même numéro et le même intitulé, et réciproquement ;
//   S2 aucun kicker au-dessus d'un titre : aucune forme texte dont le BAS est au-dessus du haut du
//      placeholder titre ET dont l'étendue horizontale recouvre celle du titre (TF-1380) ; un repère
//      posé À CÔTÉ du titre n'est pas un sur-titre. Le titre se lit quel que soit le rang de l'attribut `type`
//      dans `<p:ph>` (TF-1381 : pptxgenjs 4.0.1 écrit `idx` avant `type`, sur plusieurs lignes) ;
//      les diapositives où aucun titre n'est trouvé sont DITES au non_juge, jamais passées en silence ;
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
//   S7 aucune liste en ligne dans le texte visible (E-11 de ECRITURE.md, TF-1390) : un paragraphe qui
//      porte un « · », ou au moins deux « ; », hors pied de page et hors couverture, est une énumération
//      qui devait être une liste.
//   S6 un repère (« N / M ») posé à côté du titre est centré sur la 1re LIGNE du titre, tolérance 1 pt
//      (TF-1379) : mesure de RENDU (TextRange.Lines(1) de PowerPoint), non déductible du XML ; elle
//      vient de `--mesures <fichier>`, de `<deck>.mesures.json` posé à côté du deck, ou de
//      `--mesurer` (scripts/mesure-rendu-pptx.ps1). Sans mesure, S6 est dite NON jouée ;
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
import os from 'node:os';
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
const iMes = argv.indexOf('--mesures');
const mesuresChemin = iMes >= 0 ? argv[iMes + 1] : null;
const mesurer = argv.includes('--mesurer');
// TF-2373 : `--marque <MARQUE.md>` désigne le dossier de marque de l'émetteur quand il ne se trouve pas en remontant
// depuis le deck (donnees/marque/MARQUE.md).
const iMarque = argv.indexOf('--marque');
const marqueChemin = iMarque >= 0 ? argv[iMarque + 1] : null;
const file = argv.find((a, i) => !a.startsWith('--') && !(iProfil >= 0 && i === iProfil + 1) && !(iMes >= 0 && i === iMes + 1) && !(iMarque >= 0 && i === iMarque + 1));
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
  // TF-2325 : `--profil` accepte le chemin d'un profil OU son nom (profils/<nom>.json), comme run-oracles et oracle-pptx.
  const profilTrouve = [profilChemin, path.join(SKILLDIR, 'profils', profilChemin + '.json')].find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || profilChemin;
  try { prof = JSON.parse(fs.readFileSync(profilTrouve, 'utf8')); } catch { /* dit ci-dessous */ }
  if (!prof) skip('profil illisible : ' + profilChemin);
  const pol = prof.pptx || {};
  CHARTE = { logos: pol.logos ?? null, pied_de_page: pol.pied_de_page ?? null, profil: prof.nom || path.basename(profilChemin, '.json') };
}
const py = resolvePython(); // portable Windows/Unix, esquive l'alias Store (cf. lib/python.mjs)
if (!py) skip('python indisponible (lecture zip impossible)');

const script = `
import sys, zipfile, re, json, html
z = zipfile.ZipFile(sys.argv[1])
def read(n):
    try: return z.read(n).decode("utf-8", "replace")
    except KeyError: return ""
# TF-2323 : le texte d'un <a:t> est du XML ; &gt; &amp; &lt; sont décodés AVANT toute règle de texte
# (S1, S2, S5, S7, S8), sinon le « ; » de l'entité devient une liste en ligne.
def textes(xml):
    return [html.unescape(t) for t in re.findall(r"<a:t>([^<]*)</a:t>", xml)]
# TF-2324 : le fond d'une diapositive, lu sur elle puis sur son gabarit puis sur son masque.
def fond(rels_xml):
    m = re.search(r'<p:bg>.*?</p:bg>', rels_xml, re.S)
    c = re.search(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', m.group(0)) if m else None
    return c.group(1).upper() if c else None
def cible(rels_xml, motif):
    m = re.search(r'Target="([^"]*' + motif + r'[^"]*)"', rels_xml)
    return "ppt/" + m.group(1).lstrip("/").replace("../", "") if m else None
rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', read("ppt/_rels/presentation.xml.rels")))
order = [rels.get(rid, "") for rid in re.findall(r'<p:sldId[^>]*r:id="([^"]+)"', read("ppt/presentation.xml"))]
slides = []
for idx, target in enumerate(order):
    name = "ppt/" + target.lstrip("/").replace("../", "")
    xml = read(name)
    srels = read("ppt/slides/_rels/" + name.split("/")[-1] + ".rels")
    shapes = []
    for sp in re.findall(r"<p:sp>.*?</p:sp>", xml, re.S):
        ph = re.search(r'<p:ph\\b[^>]*?\\btype="([^"]+)"', sp)
        off = re.search(r'<a:off x="(-?\\d+)" y="(-?\\d+)"', sp)
        ext = re.search(r'<a:ext cx="(\\d+)" cy="(\\d+)"', sp)
        txt = " ".join(textes(sp)).strip()
        paras = [" ".join(textes(p)).strip() for p in re.findall(r"<a:p>.*?</a:p>", sp, re.S)]
        shapes.append({"ph": ph.group(1) if ph else None, "x": int(off.group(1)) if off else None, "y": int(off.group(2)) if off else None, "cx": int(ext.group(1)) if ext else None, "cy": int(ext.group(2)) if ext else None, "text": txt, "paras": [p for p in paras if p]})
    bg = fond(xml)
    if not bg:
        lay = cible(srels, "slideLayout")
        lrels = read(lay.rsplit("/", 1)[0] + "/_rels/" + lay.split("/")[-1] + ".rels") if lay else ""
        bg = fond(read(lay)) if lay else None
        if not bg and lrels:
            mas = cible(lrels, "slideMaster")
            bg = fond(read(mas)) if mas else None
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
        notes = " ".join(textes(read(nname)))
    has_ftr = bool(re.search(r'<p:ph\\b[^>]*?\\btype="ftr"', xml))
    has_num = bool(re.search(r'<p:ph\\b[^>]*?\\btype="sldNum"', xml) or re.search(r'type="slidenum"', xml))
    slides.append({"n": idx + 1, "file": name.split("/")[-1], "shapes": shapes, "imgs": imgs, "has_media": has_media, "has_ftr": has_ftr, "has_num": has_num, "notes": notes, "fond": bg})
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
// TF-2324 : l'intitulé d'une entrée porte au moins une lettre — « 03 / 15 », la pagination, n'est pas une entrée.
const ENTRY = /^(\d{1,2})\s*[.·—-]?\s+(.{2,})$/u;
const PORTE_UNE_LETTRE = /\p{L}/u;
const PH_HORS_CONTENU = ['title', 'ctrTitle', 'ftr', 'sldNum', 'dt']; // comme S7 : ni titre, ni pied, ni numéro, ni date
// TF-2324 : luminance relative WCAG d'un fond « RRGGBB » ; sombre sous 0,1 (le #0F172A de la charte : 0,009 ; l'accent #2563EB : 0,15).
const luminance = hex => { const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const fondSombre = s => !!s.fond && luminance(s.fond) < 0.1;
const aTitreDeContenu = s => s.shapes.some(x => (x.ph === 'title' || x.ph === 'ctrTitle') && x.text);

// S1 — sommaire ↔ intercalaires
const sommaire = slides.find(s => /sommaire|agenda/i.test(titleOf(s)));
let s1Etat = null;
if (sommaire) {
  const entries = sommaire.shapes.filter(x => !PH_HORS_CONTENU.includes(x.ph)).flatMap(x => x.paras).map(p => p.match(ENTRY)).filter(m => m && PORTE_UNE_LETTRE.test(m[2])).map(m => ({ num: m[1].padStart(2, '0'), titre: m[2].trim() }));
  const libres = s => s.shapes.filter(x => !x.ph);
  // TF-2324, TF-2356 : un intercalaire est une diapositive à fond sombre OU sans titre de contenu, qui porte un
  // paragraphe réduit à un numéro. Une pastille « 1 » sur une diapositive de contenu (fond clair, titre) n'en est pas un.
  const inters = slides.filter(s => s !== sommaire && (fondSombre(s) || !aTitreDeContenu(s)) && libres(s).some(x => x.paras.some(p => /^\d{1,2}$/.test(p))));
  // TF-2325 : le gabarit B de digit-ai-propale prescrit un sommaire dont les sections ne s'ouvrent pas par un
  // intercalaire. Un deck qui n'en porte AUCUN est de cette forme : la bijection n'a rien à joindre, et le dit.
  // Un deck qui en porte au moins un reste soumis à la bijection entière (« soit toutes, soit aucune »).
  if (entries.length && !inters.length) {
    const manque = entries.filter((e, i) => e.num !== String(i + 1).padStart(2, '0'));
    if (manque.length) findings.push({ sev: 'bloquant', msg: `S1 — sommaire sans intercalaires (forme du gabarit B) : numérotation des entrées non continue de 01 à ${String(entries.length).padStart(2, '0')} — « ${manque[0].num} ${manque[0].titre} » ne tient pas son rang`, where: sommaire.file });
    s1Etat = 'forme du gabarit B, sans intercalaire : numérotation des entrées jugée, bijection non jugée';
    non_juge.push('S1 : aucun intercalaire dans ce deck — sommaire de la forme du gabarit B de digit-ai-propale (sections non ouvertes par un intercalaire) ; seule la numérotation continue des entrées est jugée, la bijection sommaire ↔ intercalaires ne l\'est pas');
  } else for (const e of entries) {
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
// TF-2375 : la charte de digit-ai-pptx (« le kicker de la couverture reste autorisé — couverture uniquement ») et
// donnees/marque/MARQUE.md (« PROPOSITION COMMERCIALE · {année} », « couverture seulement, jamais au-dessus d'un
// titre de slide ») admettent le sur-titre de la couverture. Il se reconnaît à son libellé : un texte court, écrit
// en capitales, sur la diapositive 1. Toute autre diapositive, et tout texte de couverture qui n'est pas un libellé
// en capitales, reste refusé.
const estKickerDeCouverture = (s, texte) => s.n === 1 && texte.length <= 80 && /\p{L}/u.test(texte) && texte === texte.toLocaleUpperCase('fr');
let kickersDeCouverture = 0;
const sansTitre = [], titreSansPosition = [];
for (const s of slides) {
  const t = s.shapes.find(x => x.ph === 'title' || x.ph === 'ctrTitle');
  if (!t) { sansTitre.push(s.file); continue; }
  if (t.y == null) { titreSansPosition.push(s.file); continue; }
  for (const x of s.shapes) {
    if (x === t || !x.text || x.y == null) continue;
    // TF-1380 : un sur-titre est une forme dont le BAS est au-dessus du haut du titre ET dont l'étendue
    // horizontale recouvre celle du titre ; un repère à côté du titre n'en est pas un. Sans dimensions
    // lues, repli sur le seul haut (comportement d'avant) : on ne relâche rien faute de mesure.
    const bas = x.cy != null ? x.y + x.cy : x.y;
    const recouvre = (x.x == null || x.cx == null || t.x == null || t.cx == null) || (x.x < t.x + t.cx && x.x + x.cx > t.x);
    if (bas < t.y && recouvre) {
      if (estKickerDeCouverture(s, x.text)) { kickersDeCouverture++; continue; }
      findings.push({ sev: 'bloquant', msg: `S2 — texte au-dessus du titre (kicker interdit) : « ${x.text.slice(0, 60)} »`, where: s.file });
    }
  }
}
if (kickersDeCouverture) non_juge.push('S2 : le kicker de la couverture (libellé en capitales au-dessus du titre de la diapositive 1) est admis par la charte et la marque, et refusé partout ailleurs');
if (sansTitre.length) non_juge.push(`S2 : aucun titre (espace réservé title ou ctrTitle) trouvé sur ${sansTitre.length} diapositive(s) — kicker non jugé sur : ${sansTitre.join(', ')}`);
if (titreSansPosition.length) non_juge.push(`S2 : titre sans position propre (hérité du gabarit) sur ${titreSansPosition.length} diapositive(s) — kicker non jugé sur : ${titreSansPosition.join(', ')}`);

// S6 — un repère « N / M » posé à côté du titre est centré sur la 1re ligne du titre (TF-1379).
// Mesure de RENDU, jamais déduite du XML : le centre de la 1re ligne dépend de la police, de la largeur de la
// zone et du retour à la ligne. Les mesures viennent, dans cet ordre, de `--mesures <fichier>`, de
// `<deck>.mesures.json` posé à côté du deck, de `--mesurer` (PowerPoint, scripts/mesure-rendu-pptx.ps1).
// Sans mesure, ou si elles ne décrivent pas CE deck, S6 est dite NON jouée : un alignement non mesuré
// n'est pas déclaré conforme. Cas de départ : la remise Produit-68 du 24/09/2026, pastille centrée
// 6,84 pt sous la 1re ligne sur 10 diapositives, vue du seul destinataire.
const TOLERANCE_PT = 1;
const REPERE = /^\s*\d{1,3}\s*(?:\/\s*\d{1,3})?\s*$/;
let s6Etat = null;
{
  let source = null;
  if (mesuresChemin) source = mesuresChemin;
  else if (fs.existsSync(file.replace(/\.pptx$/i, '.mesures.json'))) source = file.replace(/\.pptx$/i, '.mesures.json');
  let mes = null, motif = null, tmpDir = null;
  if (!source && mesurer) {
    const ps = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mesure-rendu-pptx.ps1');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesure-'));
    const tmpMes = path.join(tmpDir, 'mesures.json');
    const r = process.platform === 'win32'
      ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Entree', path.resolve(file), '-Sortie', tmpMes], { encoding: 'utf8', timeout: 180000 })
      : { status: 2, stdout: '{"motif":"PowerPoint n\'existe pas hors de Windows"}' };
    if (r.status === 0 && fs.existsSync(tmpMes)) source = tmpMes;
    else { let m = ''; try { m = JSON.parse((r.stdout || '').trim().split('\n').pop()).motif || ''; } catch { /* statut illisible */ } motif = `la mesure par PowerPoint n'a pas été faite (code ${r.status}${m ? ' : ' + m.slice(0, 140) : ''})`; }
  }
  if (source) { try { mes = JSON.parse(fs.readFileSync(source, 'utf8')); } catch { motif = `mesures illisibles : ${source}`; } }
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  if (mes) {
    // les mesures décrivent-elles CE deck ? même nombre de diapositives et mêmes titres
    const sansEspace = t => norm(t).replace(/\s+/g, '');
    const titresMes = (mes.slides || []).map(sl => sansEspace(((sl.formes || []).find(f => f.titre) || {}).texte || ''));
    const titresDeck = slides.map(s => sansEspace(titleOf(s)));
    if (titresMes.length !== titresDeck.length || titresMes.some((t, i) => t !== titresDeck[i])) { motif = 'les mesures ne décrivent pas ce deck (nombre de diapositives ou titres différents) — à refaire'; mes = null; }
  }
  if (mes) {
    let reperes = 0;
    for (const sl of mes.slides) {
      const t = (sl.formes || []).find(f => f.titre && f.ligne1);
      if (!t) continue;
      const bas = t.haut + t.hauteur;
      for (const f of sl.formes) {
        if (f.titre || !REPERE.test(f.texte || '')) continue;
        const cote = f.gauche + f.largeur <= t.gauche || f.gauche >= t.gauche + t.largeur; // à côté, pas au-dessus ni en dessous
        const chevauche = f.haut < bas && f.haut + f.hauteur > t.haut; // même bande verticale que le titre
        if (!cote || !chevauche) continue;
        reperes++;
        const ecart = (f.haut + f.hauteur / 2) - (t.ligne1.haut + t.ligne1.hauteur / 2);
        if (Math.abs(ecart) > TOLERANCE_PT + 1e-9) findings.push({ sev: 'bloquant', msg: `S6 — repère « ${f.texte.trim()} » désaxé de ${ecart > 0 ? '+' : ''}${ecart.toFixed(2)} pt sur la 1re ligne du titre (tolérance ${TOLERANCE_PT} pt, centre du repère moins centre de la ligne)`, where: `diapositive ${sl.n}` });
      }
    }
    s6Etat = reperes ? `${reperes} repère(s) à côté d'un titre, tous alignés à ${TOLERANCE_PT} pt` : 'aucun repère « N / M » à côté d\'un titre dans les mesures';
  } else {
    non_juge.push('S6 NON jouée : ' + (motif || 'aucune mesure de rendu (--mesures <fichier>, <deck>.mesures.json à côté du deck, ou --mesurer avec PowerPoint) — alignement des repères sur la 1re ligne du titre non jugé'));
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
const dejaProscrits = new Set(); // TF-2373 : les mots déjà relevés par le lexique du destinataire
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
        employes.forEach(t => dejaProscrits.add(t.proscrit.trim().toLowerCase()));
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

// S5 (marque) — le vocabulaire proscrit par la MARQUE de l'émetteur (TF-2373).
// Le fait : le deck du 29/09/2026 portait « Limite » sur 3 pages et passait S5, parce que « point de vigilance »
// et non « limite » vit dans le tableau « On dit / On ne dit pas » de donnees/marque/MARQUE.md, et que S5 ne
// lisait que LEXIQUE.json et LEXIQUE-TRANSVERSE.json. La règle ne porte AUCUNE liste : elle lit le tableau de la
// marque (colonnes « On dit », « On ne dit pas »), cherché en remontant depuis le deck ou donné par --marque.
// Un terme proscrit qui porte une réserve entre parenthèses (« risque (dans une proposition) », « AO (hors usage
// interne) ») dépend d'un contexte que l'oracle ne juge pas : avertissement, réserve citée. Un terme sans réserve,
// ou réservé au livrable (« propale (dans un livrable) », un deck en est un), est bloquant. Un mot déjà relevé par
// le lexique du destinataire n'est pas relevé deux fois.
let s5MarqueEtat = null;
{
  const decoupeHorsParentheses = (t) => { const morceaux = []; let prof = 0, cur = ''; for (const c of t) { if (c === '(') prof++; if (c === ')') prof = Math.max(0, prof - 1); if (c === ',' && prof === 0) { morceaux.push(cur); cur = ''; } else cur += c; } morceaux.push(cur); return morceaux.map(m => m.trim()).filter(Boolean); };
  const lireTableau = (texte) => {
    const lignes = texte.split(/\r?\n/);
    const i = lignes.findIndex(l => /^\s*\|\s*On dit\s*\|\s*On ne dit pas\s*\|/i.test(l));
    if (i < 0) return null;
    const termes = [];
    for (let k = i + 1; k < lignes.length && /^\s*\|/.test(lignes[k]); k++) {
      const cases = lignes[k].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (cases.length < 2 || /^[-:\s]*$/.test(cases[0])) continue;
      for (const brut of decoupeHorsParentheses(cases[1])) {
        const m = brut.match(/^(.*?)\s*(?:\(([^)]*)\))?$/);
        const proscrit = (m && m[1] ? m[1] : brut).trim();
        if (proscrit) termes.push({ proscrit, remplacer_par: cases[0], reserve: m && m[2] ? m[2].trim() : null });
      }
    }
    return termes;
  };
  let chemin = null;
  if (marqueChemin) chemin = fs.existsSync(marqueChemin) ? marqueChemin : null;
  else {
    let d = path.dirname(path.resolve(file));
    for (let i = 0; i < 12 && !chemin; i++) {
      const c = path.join(d, 'donnees', 'marque', 'MARQUE.md');
      if (fs.existsSync(c)) chemin = c;
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  }
  if (!chemin) non_juge.push(marqueChemin
    ? `S5 (marque) NON jouée : --marque ${marqueChemin} introuvable — vocabulaire de la marque non jugé`
    : 'S5 (marque) NON jouée : aucun donnees/marque/MARQUE.md en remontant depuis le deck (ni --marque) — vocabulaire de la marque non jugé');
  else {
    let termes = null;
    try { termes = lireTableau(fs.readFileSync(chemin, 'utf8')); } catch (e) { non_juge.push(`S5 (marque) NON jouée : ${chemin} illisible (${String(e.message).slice(0, 80)})`); }
    if (termes === null) { if (fs.existsSync(chemin)) non_juge.push(`S5 (marque) NON jouée : ${chemin} ne porte pas de tableau « On dit / On ne dit pas »`); }
    else if (!termes.length) non_juge.push(`S5 (marque) : le tableau « On dit / On ne dit pas » de ${chemin} est vide`);
    else {
      const echappe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let emplois = 0;
      for (const s of slides) {
        const texte = [...s.shapes.map(x => x.text || ''), s.notes || ''].join('\n');
        const vus = [];
        for (const t of termes) {
          if (dejaProscrits.has(t.proscrit.toLowerCase())) continue;
          const n = (texte.match(new RegExp(`(?<![\\p{L}\\p{N}_])${echappe(t.proscrit)}s?(?![\\p{L}\\p{N}_])`, 'giu')) || []).length;
          if (n) vus.push({ ...t, occurrences: n });
        }
        if (!vus.length) continue;
        const bloquants = vus.filter(t => !t.reserve || /livrable/i.test(t.reserve)), reserves = vus.filter(t => !bloquants.includes(t));
        const dit = l => l.map(t => `« ${t.proscrit} » (${t.occurrences}) → « ${t.remplacer_par} »${t.reserve && !bloquants.includes(t) ? ` [réserve de la marque : ${t.reserve}]` : ''}`).join(' · ');
        if (bloquants.length) findings.push({ sev: 'bloquant', msg: `S5 — ${bloquants.length} terme(s) proscrit(s) par la marque de l'émetteur (${chemin}, tableau « On dit / On ne dit pas ») : ${dit(bloquants)}`, where: s.file });
        if (reserves.length) findings.push({ sev: 'avertissement', msg: `S5 — ${reserves.length} terme(s) proscrit(s) sous réserve par la marque de l'émetteur (${chemin}), contexte non jugé : ${dit(reserves)}`, where: s.file });
        emplois += vus.length;
      }
      s5MarqueEtat = emplois ? `${emplois} emploi(s) proscrit(s) par la marque` : `aucun des ${termes.length} terme(s) proscrit(s) de ${path.basename(chemin)} employé`;
    }
  }
}

// S7 — pas de liste en ligne dans le texte visible : E-11 de references/ECRITURE.md du pilot (« une
// énumération devient une liste », type T2, livrables Markdown, HTML et PowerPoint). Son seul juge, L12,
// ne lisait que les pages HTML ; oracle-ecriture, oracle-pptx et S1-S5 ne lisaient pas le texte d'un deck
// (TF-1390 : 7 listes en ligne séparées par « · » sur une diapositive, oracle-ecriture PASS, vues du seul
// destinataire). Un paragraphe visible qui porte un « · », ou au moins deux « ; », est une énumération.
// Exclus : la couverture (ligne d'identification, pas une énumération), les espaces réservés de pied de page,
// date et numéro, le bandeau bas de la diapositive (pied de page en zone de texte, au-delà de 80 % de la
// hauteur), et le préfixe « NN · » d'un intercalaire (« 01 · Contexte » est un numéro suivi d'un titre).
const ELEMENTS_EN_LIGNE = p => {
  const q = p.replace(/^\s*\d{1,2}\s*·\s*/, '');
  if (q.includes('·')) return Math.max(2, q.split('·').filter(e => e.trim()).length);
  const pv = q.split(';').filter(e => e.trim());
  return pv.length >= 3 ? pv.length : 0; // au moins deux « ; » = trois éléments
};
for (const s of slides) {
  if (s.n === 1) continue;
  for (const x of s.shapes) {
    if (['ftr', 'sldNum', 'dt'].includes(x.ph) || (x.y != null && x.y >= 0.8 * HAUTEUR)) continue;
    for (const p of x.paras) {
      const n = ELEMENTS_EN_LIGNE(p);
      if (n >= 2) findings.push({ sev: 'bloquant', msg: `S7 (E-11) — liste en ligne de ${n} élément(s) : « ${p.slice(0, 70)}${p.length > 70 ? '…' : ''} » — une énumération devient une liste, un élément par paragraphe`, where: s.file });
    }
  }
}

// S8 — la typographie française tient aux coupures de ligne (TF-1384, RG-16 du 26/09/2026) : sur une
// présentation, des deux-points ouvraient une ligne, « (point » finissait une ligne et « 4) » ouvrait la
// suivante, un titre se coupait entre « chapitre » et « 4 » ; deux remises remplacées le même jour pour
// la typographie seule. Une espace ORDINAIRE devant : ; ! ?, à l'intérieur de « », entre un nom et son
// numéro ou entre un mois et son année est un point de coupure que PowerPoint peut prendre. Règle NEUVE :
// AVERTISSEMENT (D-70 (b)), un constat par diapositive ; le placement réel des coupures reste une mesure
// de rendu (non_juge). Même table que L35 du socle HTML (check_html.py).
const TYPO_FR = [
  [/(?<=[^\s\u00a0\u202f]) (?=[:;!?](?:[\s\u00a0\u202f]|$))/g, 'devant une ponctuation haute'],
  [/« | »/g, "à l'intérieur de guillemets"],
  [/\b(?:chapitres?|points?|étapes?|lots?|phases?|parties?|annexes?|sections?|versions?|articles?|pages?|tomes?|niveaux?|paliers?|vagues?|sprints?|semaines?) \d+\b/gi, 'entre un nom et son numéro'],
  [/\b(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre) \d{4}\b/gi, 'entre un mois et son année'],
];
for (const s of slides) {
  const vus = [];
  for (const x of s.shapes) for (const p of x.paras) for (const [re, quoi] of TYPO_FR) {
    for (const m of p.matchAll(re)) vus.push(`${quoi} (« ${p.slice(Math.max(0, m.index - 16), m.index + m[0].length + 6).trim()} »)`);
  }
  if (vus.length) findings.push({ sev: 'avertissement', msg: `S8 typographie française — ${vus.length} espace(s) ordinaire(s) là où la ligne ne doit pas couper : ${vus.slice(0, 3).join(' · ')}${vus.length > 3 ? ' …' : ''} — remède : espace insécable (U+00A0, ou fine U+202F)`, where: s.file });
}
non_juge.push('S8 : le placement RÉEL des coupures de ligne (mesure de rendu PowerPoint) — S8 juge les espaces ordinaires qui les permettent, pas les lignes peintes');

if (findings.some(f => f.sev === 'bloquant')) out('FAIL', 1);
// TF-1490 : un PASS dit quelles règles il a jouées — sous un profil qui ne déclare pas S3 ou S4, elles ne l'ont pas été.
const regles34 = (CHARTE.logos === 'couverture-interlocuteurs' && CHARTE.pied_de_page === 'espace-reserve') ? 'S1-S4 vérifiés'
  : `S1-S2 vérifiés, S3 ${CHARTE.logos === 'couverture-interlocuteurs' ? 'vérifiée' : CHARTE.logos === 'partout' ? 'sans zone à juger' : 'NON jouée'}, `
    + `S4 ${['espace-reserve', 'zone-texte'].includes(CHARTE.pied_de_page) ? 'vérifiée (' + CHARTE.pied_de_page + ')' : 'NON jouée'}${duProfil}`;
findings.push({ sev: 'info', msg: `conforme : ${slides.length} slide(s), ${regles34}` + (s1Etat ? ` ; S1 — ${s1Etat}` : '')
  + (s5Etat ? ` ; S5 — ${s5Etat}` : ' ; S5 non jouée (motif au non_juge)') + (s5MarqueEtat ? ` ; S5 marque — ${s5MarqueEtat}` : '')
  + (s6Etat ? ` ; S6 — ${s6Etat}` : ' ; S6 non jouée (motif au non_juge)') + ' ; S7 (E-11) vérifiée ; S8 (typographie) jouée en avertissement', where: path.basename(file) });
out('PASS', 0);
