#!/usr/bin/env python
# self-test.py — preuve du skill digit-ai-pdf, en double sens : le vert passe, chaque défaut fabriqué
# tombe sur SA règle. Un oracle qui ne sait pas échouer n'est pas un oracle (P1 de quality-oracles).
#   python self-test.py          exit 0 tout vert · 1 au moins un échec
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import fixtures_pdf as fx  # noqa: E402
import self_test_lot2  # noqa: E402
from lib_pdf import exiger  # noqa: E402

resultats = []


def controle(nom, ok, detail=""):
    resultats.append((nom, bool(ok), detail))
    print(("ok   " if ok else "ECHEC"), nom, ("" if ok else f"→ {detail}"))


def jouer(script, *args):
    r = subprocess.run([sys.executable, os.path.join(ICI, script), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r


def oracle(rempli, valeurs, source=None):
    args = [rempli, "--attendu", valeurs] + (["--source", source] if source else [])
    r = jouer("oracle-formulaire-pdf.py", *args)
    try:
        return r.returncode, json.loads(r.stdout)
    except Exception:
        return r.returncode, {"verdict": "ILLISIBLE", "findings": [], "motif": r.stderr[-400:]}


def regles(sortie):
    return {f["msg"].split(" ")[0] for f in sortie.get("findings", []) if f["sev"] == "bloquant"}


def attendre_regle(nom, code_sortie, regle):
    code, sortie = code_sortie
    controle(nom, code == 1 and regle in regles(sortie), f"exit {code}, règles {sorted(regles(sortie))}, verdict {sortie.get('verdict')}, {sortie.get('motif', '')}")


def modifier(source, sortie, geste):
    from pypdf import PdfReader, PdfWriter
    w = PdfWriter(clone_from=PdfReader(source))
    geste(w)
    with open(sortie, "wb") as f:
        w.write(f)


def annot(w, nom):
    for ref in w.pages[0]["/Annots"]:
        a = ref.get_object()
        if str(a.get("/T") or "") == nom:
            return a
    raise KeyError(nom)


def valeurs(d, nom, contenu):
    p = os.path.join(d, nom)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(contenu, f, ensure_ascii=False)
    return p


def surimpression(source, sortie, geste):
    """Ajoute du contenu de page, comme le ferait un script de session."""
    import io
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    t = io.BytesIO()
    c = canvas.Canvas(t, pagesize=A4)
    geste(c)
    c.save()
    t.seek(0)
    w = PdfWriter(clone_from=PdfReader(source))
    w.pages[0].merge_page(PdfReader(t).pages[0])
    with open(sortie, "wb") as f:
        w.write(f)


def lot1(d):
    from pypdf.generic import NameObject, NumberObject, TextStringObject
    vierge = os.path.join(d, "champs-vierge.pdf")
    plat = os.path.join(d, "plat-vierge.pdf")
    fx.formulaire_champs(vierge)
    fx.formulaire_plat(plat)
    v_champs = valeurs(d, "v-champs.json", fx.VALEURS_CHAMPS)
    v_plat = valeurs(d, "v-plat.json", fx.VALEURS_PLAT)
    vert = os.path.join(d, "champs-vert.pdf")
    plat_vert = os.path.join(d, "plat-vert.pdf")

    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", v_champs, "--out", vert)
    controle("remplir à champs : contrôle enchaîné et PASS", r.returncode == 0 and '"PASS"' in r.stdout, r.stdout[-300:] + r.stderr[-300:])
    r = jouer("formulaire.py", "remplir", plat, "--valeurs", v_plat, "--out", plat_vert)
    controle("remplir plat : contrôle enchaîné et PASS", r.returncode == 0 and '"PASS"' in r.stdout, r.stdout[-300:] + r.stderr[-300:])

    # Défauts à champs, chacun sur sa règle.
    p = lambda n: os.path.join(d, n)
    attendre_regle("F1 fichier illisible", (lambda: (open(p("casse.pdf"), "wb").write(b"%PDF-1.7 pas un pdf"), oracle(p("casse.pdf"), v_champs))[1])(), "F1")
    attendre_regle("F2 champ attendu absent", oracle(vert, valeurs(d, "v-f2.json", {"champs": {"inexistant": "x"}})), "F2")
    modifier(vert, p("f3.pdf"), lambda w: annot(w, "nom").__setitem__(NameObject("/V"), TextStringObject("Autre Personne")))
    attendre_regle("F3 valeur relue différente", oracle(p("f3.pdf"), v_champs, vierge), "F3")
    modifier(vert, p("f3b.pdf"), lambda w: annot(w, "accepte").__setitem__(NameObject("/AS"), NameObject("/Off")))
    attendre_regle("F3 case : /V et /AS discordants", oracle(p("f3b.pdf"), v_champs, vierge), "F3")
    modifier(vert, p("f4.pdf"), lambda w: annot(w, "nom").__delitem__(NameObject("/AP")))
    attendre_regle("F4 valeur sans apparence", oracle(p("f4.pdf"), v_champs, vierge), "F4")
    modifier(vert, p("f4b.pdf"), lambda w: annot(w, "nom").__setitem__(NameObject("/F"), NumberObject(0)))
    attendre_regle("F4 champ non imprimable", oracle(p("f4b.pdf"), v_champs, vierge), "F4")
    # Apparence périmée : /V corrigé après coup, l'image du champ montre l'ancienne valeur.
    perime = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    perime["champs"]["nom"] = "Jean Martin"
    modifier(vert, p("f4c.pdf"), lambda w: annot(w, "nom").__setitem__(NameObject("/V"), TextStringObject("Jean Martin")))
    attendre_regle("F4 apparence périmée", oracle(p("f4c.pdf"), valeurs(d, "v-f4c.json", perime), vierge), "F4")
    long_ = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    long_["champs"]["ville"] = "Une commune au nom vraiment très long qui ne tiendra jamais dans ce petit champ de deux cents points"
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-f5.json", long_), "--out", p("f5.pdf"))
    controle("F5 texte trop large (remplir rend le FAIL)", r.returncode == 1 and "F5" in r.stdout, r.stdout[-300:])
    long2 = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    long2["champs"]["iban"] = "FR" + "7" * 40
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-f5b.json", long2), "--out", p("f5b.pdf"))
    controle("F5 MaxLen dépassé", r.returncode == 1 and "F5" in r.stdout, r.stdout[-300:])
    long3 = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    long3["champs"]["adresse"] = "Une ligne d'adresse beaucoup trop longue pour ce champ. " * 6
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-f5c.json", long3), "--out", p("f5c.pdf"))
    controle("F5 multiligne : le bas serait coupé", r.returncode == 1 and "F5" in r.stdout, r.stdout[-300:])
    sans_ville = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    del sans_ville["champs"]["ville"]
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-f6.json", sans_ville), "--out", p("f6.pdf"))
    controle("F6 champ requis vide", r.returncode == 1 and "F6" in r.stdout, r.stdout[-300:])
    sans_nom = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    del sans_nom["champs"]["nom"]
    attendre_regle("F7 champ non déclaré modifié", oracle(vert, valeurs(d, "v-f7.json", sans_nom), vierge), "F7")
    code, s = oracle(vert, valeurs(d, "v-f7b.json", sans_nom))
    controle("F7 sans source : averti, non bloquant", code == 0 and any(f["sev"] == "avert" and f["msg"].startswith("F7") for f in s["findings"]), str(s.get("findings")))
    surimpression(vert, p("f8.pdf"), lambda c: c.drawString(300, 100, "ajout discret"))
    attendre_regle("F8 écriture hors zone", oracle(p("f8.pdf"), v_champs, vierge), "F8")

    # Peigne (RT-142 point 3, TF-2042) : chaque caractère d'IBAN dans la case de son rang.
    code, s = oracle(vert, v_champs, vierge)
    controle("F9 vert : l'IBAN du peigne a chaque caractère dans sa case", code == 0 and s["verdict"] == "PASS", f"exit {code}, règles {sorted(regles(s))}")

    def sur_apparence(nom_champ, geste):
        def f(w):
            ap = annot(w, nom_champ)["/AP"]["/N"].get_object()
            ap.set_data(geste(ap.get_data().decode("latin-1")).encode("latin-1"))
        return f

    def tasser(data):
        signes = re.findall(r"\((.)\) Tj", data)
        return data.split("1 0 0 1")[0] + "2 4 Td (" + "".join(signes) + ") Tj\nET Q EMC"

    def permuter(data):
        lignes = data.split("\n")
        idx = [i for i, l in enumerate(lignes) if re.search(r"Tm \(.\) Tj", l)]
        a = next(i for i in range(10, len(idx) - 1) if lignes[idx[i]].split("Tm ")[1] != lignes[idx[i + 1]].split("Tm ")[1])
        la, lb = lignes[idx[a]], lignes[idx[a + 1]]
        pa, ca = la.split(" Tm ")
        pb, cb = lb.split(" Tm ")
        lignes[idx[a]], lignes[idx[a + 1]] = pa + " Tm " + cb, pb + " Tm " + ca
        return "\n".join(lignes)

    def decaler(data):
        return re.sub(r"1 0 0 1 ([\d.]+) ([\d.]+) Tm", lambda m: f"1 0 0 1 {float(m.group(1)) + 340 / 27:.2f} {m.group(2)} Tm", data)

    modifier(vert, p("f9a.pdf"), sur_apparence("iban", tasser))
    attendre_regle("F9 peigne : IBAN tassé à gauche, hors de ses cases", oracle(p("f9a.pdf"), v_champs, vierge), "F9")
    modifier(vert, p("f9b.pdf"), sur_apparence("iban", permuter))
    code_b, s_b = oracle(p("f9b.pdf"), v_champs, vierge)
    attendre_regle("F4 peigne : deux chiffres permutés à l'affichage, refusés par ce que le lecteur affiche", (code_b, s_b), "F4")
    court = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    court["champs"]["iban"] = fx.IBAN_FICTIF[:20]
    v_court = valeurs(d, "v-f9c.json", court)
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", v_court, "--out", p("f9c-vert.pdf"))
    controle("F9 vert : IBAN de 20 signes, cases 1 à 20", r.returncode == 0 and '"PASS"' in r.stdout, r.stdout[-300:] + r.stderr[-300:])
    modifier(p("f9c-vert.pdf"), p("f9c.pdf"), sur_apparence("iban", decaler))
    attendre_regle("F9 peigne : tout l'IBAN décalé d'une case", oracle(p("f9c.pdf"), v_court, vierge), "F9")
    modifier(vert, p("f9d.pdf"), lambda w: annot(w, "iban").__setitem__(NameObject("/Q"), NumberObject(1)))
    code, s = oracle(p("f9d.pdf"), v_champs, vierge)
    controle("F9 peigne centré : non jugé et dit, jamais un PASS muet", code == 0 and any(n.startswith("F9 NON JOUÉE") for n in s["non_juge"]), str(s.get("non_juge"))[-300:])
    altere = json.loads(json.dumps(fx.VALEURS_CHAMPS))
    altere["champs"]["iban"] = fx.IBAN_FICTIF[:12] + "9" + fx.IBAN_FICTIF[13:]
    attendre_regle("F3 IBAN altéré d'un chiffre", oracle(vert, valeurs(d, "v-f3iban.json", altere), vierge), "F3")

    # Défauts plats.
    attendre_regle("P3 collision (fixture rouge du manifest)", (lambda: (jouer("formulaire.py", "remplir", plat, "--valeurs", valeurs(d, "v-p3.json", {"plat": [dict(fx.VALEURS_PLAT["plat"][0], boite=[50, 88, 340, 106])] + fx.VALEURS_PLAT["plat"][1:]}), "--out", p("p3.pdf"), "--sans-controle"), oracle(p("p3.pdf"), p("v-p3.json"), plat))[1])(), "P3")
    def guides(c):
        c.setFont("Helvetica", 11)
        c.drawString(50, fx.HAUT - 102, "Nom : ______________________ Ville : ..........................")
    surimpression(plat, p("guides-vierge.pdf"), guides)
    v_guides = valeurs(d, "v-guides.json", {"plat": [{"page": 1, "boite": [85, 88, 200, 106], "texte": "Hélène"}]})
    r = jouer("formulaire.py", "remplir", p("guides-vierge.pdf"), "--valeurs", v_guides, "--out", p("guides.pdf"))
    controle("P3 : écrire sur des soulignés n'est pas une collision", r.returncode == 0, r.stdout[-400:])
    # Formulaire scanné : la page est une image, seule l'encre dit la collision.
    import pypdfium2 as pdfium
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl
    vu = pdfium.PdfDocument(plat)
    img = vu[0].render(scale=200 / 72, may_draw_forms=False).to_pil().convert("RGB")
    vu.close()
    c = rl.Canvas(p("plat-scan.pdf"), pagesize=A4, invariant=1)
    c.drawImage(ImageReader(img), 0, 0, A4[0], A4[1])
    c.save()
    v_encre = valeurs(d, "v-encre.json", {"plat": [{"page": 1, "boite": [50, 40, 300, 60], "texte": "Hélène Dupré", "taille": 13}]})
    r = jouer("formulaire.py", "remplir", p("plat-scan.pdf"), "--valeurs", v_encre, "--out", p("plat-scan-r.pdf"))
    controle("P3 sur un scan : encre sous le texte, avertissement", r.returncode == 0 and "d'encre de la source" in r.stdout, r.stdout[-400:])
    v_propre = valeurs(d, "v-encre2.json", {"plat": [{"page": 1, "boite": [110, 88, 400, 106], "texte": "Hélène Dupré"}]})
    r = jouer("formulaire.py", "remplir", p("plat-scan.pdf"), "--valeurs", v_propre, "--out", p("plat-scan-r2.pdf"))
    controle("P3 sur un scan : une zone libre ne crie pas", r.returncode == 0 and "d'encre de la source" not in r.stdout, r.stdout[-400:])
    attendre_regle("P1 texte attendu absent", oracle(plat, v_plat, plat), "P1")
    def blanc(c):
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica", 11)
        c.drawString(111, fx.HAUT - 102, "Hélène Dupré")
    surimpression(plat, p("p1b.pdf"), blanc)
    attendre_regle("P1 texte présent mais invisible", oracle(p("p1b.pdf"), valeurs(d, "v-p1b.json", {"plat": [fx.VALEURS_PLAT["plat"][0]]}), plat), "P1")
    surimpression(plat, p("p2.pdf"), lambda c: (c.setFont("Helvetica", 11), c.drawString(111, fx.HAUT - 102, "Hélène Dupré"), c.drawString(420, fx.HAUT - 102, "déborde")))
    attendre_regle("P2 caractère hors de sa boîte", oracle(p("p2.pdf"), valeurs(d, "v-p2.json", {"plat": [fx.VALEURS_PLAT["plat"][0]]}), plat), "P2")
    cochee = [dict(e) for e in fx.VALEURS_PLAT["plat"]]
    cochee[2]["coche"] = False
    attendre_regle("P4 case vide attendue, cochée au fichier", oracle(plat_vert, valeurs(d, "v-p4.json", {"plat": cochee}), plat), "P4")
    cochee2 = [dict(e) for e in fx.VALEURS_PLAT["plat"]]
    cochee2[3]["coche"] = True
    attendre_regle("P4 case cochée attendue, vide au fichier", oracle(plat_vert, valeurs(d, "v-p4b.json", {"plat": cochee2}), plat), "P4")
    petit = [dict(fx.VALEURS_PLAT["plat"][0], taille=4)] + fx.VALEURS_PLAT["plat"][1:]
    r = jouer("formulaire.py", "remplir", plat, "--valeurs", valeurs(d, "v-p5.json", {"plat": petit}), "--out", p("p5.pdf"))
    controle("P5 corps trop petit : averti, non bloquant", r.returncode == 0 and '"P5' in r.stdout.replace("P5 —", '"P5'), r.stdout[-400:])

    # Rangée de cases d'un formulaire plat (RT-142 point 3, TF-2042) : un caractère par case.
    iban_vierge = p("iban-vierge.pdf")
    fx.formulaire_plat_iban(iban_vierge)
    v_iban = valeurs(d, "v-iban.json", fx.VALEURS_IBAN)
    r = jouer("formulaire.py", "remplir", iban_vierge, "--valeurs", v_iban, "--out", p("iban-vert.pdf"))
    controle("remplir plat à cases : contrôle enchaîné et PASS", r.returncode == 0 and '"PASS"' in r.stdout, r.stdout[-300:] + r.stderr[-300:])

    def iban_tasse(c):
        c.setFont("Helvetica", 11)
        c.drawString(111, fx.HAUT - 101, fx.IBAN_FICTIF)

    surimpression(iban_vierge, p("p6a.pdf"), iban_tasse)
    code, s = oracle(p("p6a.pdf"), v_iban, iban_vierge)
    controle("P6 IBAN tassé : le texte est lu juste et la boîte le tient, seules les cases le refusent", code == 1 and regles(s) == {"P6"}, f"exit {code}, règles {sorted(regles(s))}")

    def iban_decale(c):
        c.setFont("Helvetica", 11)
        for k, ch in enumerate(fx.IBAN_FICTIF[:26]):
            c.drawString(110 + 14 * (k + 1) + 7 - c.stringWidth(ch, "Helvetica", 11) / 2, fx.HAUT - 101, ch)

    surimpression(iban_vierge, p("p6b.pdf"), iban_decale)
    v_26 = valeurs(d, "v-iban26.json", {"plat": [dict(fx.VALEURS_IBAN["plat"][0], texte=fx.IBAN_FICTIF[:26])]})
    attendre_regle("P6 IBAN décalé d'une case", oracle(p("p6b.pdf"), v_26, iban_vierge), "P6")
    v_trop = valeurs(d, "v-iban20.json", {"plat": [dict(fx.VALEURS_IBAN["plat"][0], cases=20)]})
    attendre_regle("P6 plus de caractères que de cases", oracle(p("iban-vert.pdf"), v_trop, iban_vierge), "P6")
    v_pas_lisible = valeurs(d, "v-iban-nl.json", {"plat": [dict(fx.VALEURS_IBAN["plat"][0], cases="vingt")]})
    attendre_regle("P6 déclaration de cases illisible", oracle(p("iban-vert.pdf"), v_pas_lisible, iban_vierge), "P6")
    v_paires = valeurs(d, "v-iban-paires.json", {"plat": [dict(fx.VALEURS_IBAN["plat"][0], cases=[[110 + 14 * k, 124 + 14 * k] for k in range(27)])]})
    code, s = oracle(p("iban-vert.pdf"), v_paires, iban_vierge)
    controle("P6 vert : cases données par paires [gauche, droite]", code == 0 and s["verdict"] == "PASS", f"exit {code}, règles {sorted(regles(s))}")
    altere_plat = valeurs(d, "v-iban-alt.json", {"plat": [dict(fx.VALEURS_IBAN["plat"][0], texte=fx.IBAN_FICTIF[:12] + "9" + fx.IBAN_FICTIF[13:])]})
    attendre_regle("P1 IBAN altéré d'un chiffre", oracle(p("iban-vert.pdf"), altere_plat, iban_vierge), "P1")

    # RT-142 point 4 : les ajouts se distinguent de l'original sans le nom de police ni la couleur.
    import pdfplumber
    with pdfplumber.open(plat) as pdf_v, pdfplumber.open(plat_vert) as pdf_r:
        source_c, rempli_c = pdf_v.pages[0].chars, pdf_r.pages[0].chars
    cles = {}
    for c_ in source_c:
        k_ = (c_["text"], round(c_["x0"], 1), round(c_["top"], 1))
        cles[k_] = cles.get(k_, 0) + 1
    ajouts = []
    for c_ in rempli_c:
        k_ = (c_["text"], round(c_["x0"], 1), round(c_["top"], 1))
        if cles.get(k_, 0) > 0:
            cles[k_] -= 1
        else:
            ajouts.append(c_)
    memes = {c_["fontname"] for c_ in ajouts} <= {c_["fontname"] for c_ in source_c} and {str(c_.get("non_stroking_color")) for c_ in ajouts} <= {str(c_.get("non_stroking_color")) for c_ in source_c}
    code, s = oracle(plat_vert, v_plat, plat)
    controle("P1 vert : ajouts dans la police et l'encre de l'original, lus quand même", bool(ajouts) and memes and code == 0 and s["verdict"] == "PASS", f"{len(ajouts)} ajout(s), mêmes polices et encre : {memes}, exit {code}")
    mauvais = [dict(fx.VALEURS_PLAT["plat"][0], texte="Hélène Dupres")] + fx.VALEURS_PLAT["plat"][1:]
    attendre_regle("P1 même police et même encre, texte faux : refusé", oracle(plat_vert, valeurs(d, "v-p1c.json", {"plat": mauvais}), plat), "P1")

    # RT-142 point 2 : l'original, calque retiré, reste ce qu'il était (F8 vaut aussi pour un retrait).
    sans_titre = p("plat-sans-titre.pdf")
    fx.formulaire_plat(sans_titre, titre=False)
    r = jouer("formulaire.py", "remplir", sans_titre, "--valeurs", v_plat, "--out", p("plat-sans-titre-r.pdf"), "--sans-controle")
    attendre_regle("F8 original abîmé : le titre de la source a disparu", oracle(p("plat-sans-titre-r.pdf"), v_plat, plat), "F8")

    # Ce que l'oracle refuse de juger n'est jamais un PASS.
    code, s = oracle(plat_vert, v_plat)
    controle("SKIP plat sans source", code == 2 and s["verdict"] == "SKIP" and s.get("motif"), str(s.get("motif")))
    r = jouer("oracle-formulaire-pdf.py", vert)
    controle("SKIP sans attendu", r.returncode == 2 and '"SKIP"' in r.stdout, r.stdout[-200:])

    # Ce que remplir refuse.
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-r1.json", {"champs": {"inexistant": "x"}}), "--out", p("r1.pdf"))
    controle("remplir refuse un champ absent", r.returncode == 2 and "inexistant" in r.stderr, r.stderr[-200:])
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-r2.json", {"champs": {"nom": "東京"}}), "--out", p("r2.pdf"))
    controle("remplir refuse un caractère hors encodage", r.returncode == 2, r.stderr[-200:])
    r = jouer("formulaire.py", "remplir", vierge, "--valeurs", valeurs(d, "v-r3.json", {"champs": {"signature": "x"}}), "--out", p("r3.pdf"))
    controle("remplir refuse un champ de signature", r.returncode == 2 and "signature" in r.stderr, r.stderr[-200:])
    r = jouer("formulaire.py", "relever", vierge, "--modele", p("modele.json"))
    modele = json.load(open(p("modele.json"), encoding="utf-8"))
    controle("relever : modèle de valeurs sans la signature", r.returncode == 0 and "nom" in modele["champs"] and "signature" not in modele["champs"], r.stderr[-200:])
    r = jouer("formulaire.py", "relever", plat, "--png", p("png"))
    sortie = json.loads(r.stdout)
    controle("relever plat : 3 lignes de saisie, 2 cases, image quadrillée", r.returncode == 0 and len(sortie["plat"][0]["lignes_saisie"]) == 3 and len(sortie["plat"][0]["cases"]) == 2 and os.path.isfile(sortie["images"][0]), str(sortie.get("plat", [{}])[0].get("lignes_saisie")))


def main():
    manque = exiger("pypdf", "pypdfium2", "pdfplumber", "reportlab", "PIL")
    if manque:
        print(f"SKIP — dépendances absentes : {', '.join(manque)}")
        sys.exit(2)
    d = tempfile.mkdtemp(prefix="digit-ai-pdf-")
    try:
        lot1(d)
        self_test_lot2.jouer_lot(d, controle, jouer, valeurs)
    finally:
        shutil.rmtree(d, ignore_errors=True)
    echecs = [r for r in resultats if not r[1]]
    print(f"\n{len(resultats) - len(echecs)}/{len(resultats)} contrôles au vert")
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
