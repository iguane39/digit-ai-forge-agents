#!/usr/bin/env python
"""oracle-a11y — Domaine « Accessibilite (WCAG structurel) ».

Charge la page dans Chromium (Playwright), attend la fin de ses animations et transitions
finies (5 s au plus, TF-2313), puis applique un jeu deterministe de
controles WCAG 2.2 a haute valeur : lang, title, alt d'images, noms accessibles
des controles de formulaire, texte des liens/boutons, ordre des titres, id
dupliques, viewport zoomable, tabindex positif. Bloquant sur les manques
critiques ; avertissements pour le reste. NE REMPLACE PAS un audit axe-core
complet ni le controle de contraste (render_page.py V2) -> declares en non_juge.

Contrat de sortie : JSON {oracle,domaine,artefact,verdict,findings[],non_juge[]}.
Exit 0=PASS, 1=FAIL, 2=SKIP.
"""
import sys, os, json

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# de caractères hors Latin-1 (✅, ①-⑤, tirets cadratins…). Garde-fou si non supporté.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


DOM = "Accessibilite (WCAG structurel)"
NON_JUGE = ["audit axe-core complet (ARIA avance, roles, ordre focus)",
            "contraste couleur (voir render_page.py V2)", "navigation clavier / pieges de focus"]

def emit(verdict, findings=None, non_juge=None):
    sortie = {"oracle": "oracle-a11y", "domaine": DOM,
        "artefact": file, "verdict": verdict, "findings": findings or [],
        "non_juge": non_juge if non_juge is not None else NON_JUGE}
    if verdict == "SKIP":
        # TF-1447 : le motif d'un SKIP a une place fixe, le champ `motif` — ici le premier
        # non_juge qui n'est pas une limite permanente, sinon le premier constat `info`.
        propres = [x for x in sortie["non_juge"] if isinstance(x, str) and x.strip() and x not in NON_JUGE]
        infos = [str(f.get("msg", "")) for f in sortie["findings"] if isinstance(f, dict) and str(f.get("msg", "")).strip()]
        sortie["motif"] = (propres[0] if propres else (infos[0] if infos else "")).strip()
    sys.stdout.write(json.dumps(sortie, ensure_ascii=False))
    sys.exit(1 if verdict == "FAIL" else 2 if verdict == "SKIP" else 0)

file = sys.argv[1] if len(sys.argv) > 1 else None
if not file or not os.path.isfile(file):
    emit("SKIP", [{"sev": "info", "msg": "fichier absent"}])
try:
    from playwright.sync_api import sync_playwright
except Exception:
    emit("SKIP", [], ["Playwright indisponible — audit a11y non execute"])

JS = r"""() => {
  const fail=[], warn=[];
  const doc=document;
  if(!doc.documentElement.getAttribute('lang')) fail.push('<html> sans attribut lang (WCAG 3.1.1)');
  if(!doc.title || !doc.title.trim()) fail.push('<title> vide (WCAG 2.4.2)');
  let imgs=0; doc.querySelectorAll('img').forEach(i=>{ if(!i.hasAttribute('alt')){imgs++;} });
  if(imgs) fail.push(imgs+' image(s) <img> sans attribut alt (WCAG 1.1.1)');
  const nameOf=el=>{ return (el.getAttribute('aria-label')||el.getAttribute('title')||'').trim()
     || (el.getAttribute('aria-labelledby')? 'ref':'')
     || (el.labels && el.labels.length? [...el.labels].map(l=>l.textContent).join('').trim():'')
     || (el.id && doc.querySelector('label[for="'+CSS.escape(el.id)+'"]')? 'for':''); };
  let noLbl=0; doc.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(c=>{ if(!nameOf(c)) noLbl++; });
  if(noLbl) fail.push(noLbl+' controle(s) de formulaire sans nom accessible (WCAG 3.3.2/4.1.2)');
  let empty=0; doc.querySelectorAll('a[href],button').forEach(b=>{ const t=(b.textContent||'').trim()
     || (b.getAttribute('aria-label')||'').trim() || (b.querySelector('img[alt]')?'img':''); if(!t) empty++; });
  if(empty) fail.push(empty+' lien(s)/bouton(s) sans intitule accessible (WCAG 2.4.4/4.1.2)');
  const ids={}; let dup=0; doc.querySelectorAll('[id]').forEach(e=>{ ids[e.id]=(ids[e.id]||0)+1; });
  Object.values(ids).forEach(n=>{ if(n>1) dup++; }); if(dup) fail.push(dup+' id(s) dupliques (WCAG 4.1.1)');
  const vp=doc.querySelector('meta[name=viewport]'); if(vp && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(vp.content||'')) fail.push('zoom desactive dans le viewport (WCAG 1.4.4)');
  let last=0, skip=0; doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h=>{ const lv=+h.tagName[1]; if(last && lv>last+1) skip++; last=lv; });
  if(skip) warn.push(skip+' saut(s) de niveau de titre (WCAG 1.3.1)');
  let tab=0; doc.querySelectorAll('[tabindex]').forEach(e=>{ if(+e.getAttribute('tabindex')>0) tab++; }); if(tab) warn.push(tab+' tabindex positif(s) (WCAG 2.4.3)');
  return {fail,warn};
}"""

# TF-2313 (09/11/2026) : UNE PAGE SE JUGE REPOSEE, JAMAIS AU MILIEU D'UNE TRANSITION. Une chaine de dev a juge un
# toast de 12 px au milieu de son fondu de 0,25 s (contraste de 1,53 mesure, 7,16:1 une fois affiche) ; le meme banc
# passait sur le poste, ou la page etait deja posee. Le poste ne devait pas etre plus indulgent que la chaine : avant
# toute mesure, l'oracle attend la fin des animations et transitions FINIES de la page, 5 s au plus. Une animation
# sans fin (iterations = Infinity : spinner, pulsation) ne finira jamais et n'est pas attendue. Les controles de
# cet oracle sont structurels, mais une page qui complete son DOM (libelle, nom accessible) a la fin d'une
# transition est jugee de la meme facon : l'etat repose, ou rien.
LIMITE_REPOS_MS = 5000
REPOS_JS = r"""async (limite) => {
  const t0 = performance.now();
  const deuxImages = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const finies = () => document.getAnimations().filter(a => {
    if (a.playState !== 'running' && a.playState !== 'pending') return false;
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return !(t && t.iterations === Infinity);
  });
  const infinies = () => document.getAnimations().filter(a => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return t && t.iterations === Infinity;
  }).length;
  await deuxImages();
  let attendues = 0, restantes = 0;
  while (true) {
    const encours = finies();
    if (!encours.length) break;
    attendues += encours.length;
    const reste = limite - (performance.now() - t0);
    if (reste <= 0) { restantes = encours.length; break; }
    await Promise.race([Promise.allSettled(encours.map(a => a.finished)), new Promise(r => setTimeout(r, reste))]);
    await deuxImages();
    if (performance.now() - t0 >= limite) { restantes = finies().length; break; }
  }
  return { attendues, restantes, infinies: infinies(), ms: Math.round(performance.now() - t0) };
}"""

abspath = os.path.abspath(file).replace("\\", "/")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto("file:///" + abspath, wait_until="load", timeout=30000)
        repos = pg.evaluate(REPOS_JS, LIMITE_REPOS_MS)
        r = pg.evaluate(JS)
        b.close()
except Exception as e:
    emit("SKIP", [], ["rendu impossible : " + str(e)[:120]])

findings = [{"sev": "bloquant", "msg": m} for m in r["fail"]] + [{"sev": "warn", "msg": m} for m in r["warn"]]
# TF-2313 : le repos se dit. Des animations finies attendues, des animations sans fin ignorees, ou une page qui ne
# se pose pas en 5 s (alors jugee en l'etat, et dit au non_juge : un etat non pose n'est pas declare conforme).
non_juge = list(NON_JUGE)
if repos["attendues"] or repos["infinies"]:
    findings.append({"sev": "info", "msg": "repos de la page : %d animation(s) ou transition(s) finie(s) attendue(s) (%d ms), %d animation(s) sans fin ignoree(s)" % (repos["attendues"], repos["ms"], repos["infinies"])})
if repos["restantes"]:
    non_juge.append("repos de la page NON atteint apres %d s : %d animation(s) finie(s) encore en cours, la page est jugee en l'etat" % (LIMITE_REPOS_MS // 1000, repos["restantes"]))
if r["fail"]:
    emit("FAIL", findings, non_juge)
emit("PASS", findings if findings else [{"sev": "info", "msg": "controles WCAG structurels OK"}], non_juge)
