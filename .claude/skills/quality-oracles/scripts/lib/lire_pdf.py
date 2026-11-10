# lib/lire_pdf.py — lecture d'un PDF pour les oracles du skill (TF-2351, TF-2367, 10/11/2026).
#
# Rend sur la sortie standard un JSON : la structure du fichier lue par pypdf (pages et leur format,
# polices et leur embarquement, producteur), et le TEXTE de chaque page lu par DEUX lecteurs Python,
# pypdf et PyMuPDF. Le troisième lecteur, pdftotext, est un exécutable : lib/texte-pdf.mjs le lance.
# Un lecteur absent ou en échec se DIT (`ok: false`, `erreur`), il ne se remplace jamais par un autre :
# c'est la comparaison des lecteurs qui fait la règle de lisibilité (TF-2367), pas l'un d'eux.
#
# Usage : python lire_pdf.py <fichier.pdf>
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
sortie = {"ok": False, "erreur": None, "pages": [], "polices": [], "producteur": None, "createur": None, "lecteurs": {}}


def nom_police(v):
    return str(v)[1:] if str(v).startswith("/") else str(v)


def noms_employes(flux, lecteur):
    """Les noms de ressources des polices qui DESSINENT du texte dans un flux de contenu : la police courante
    (dernier Tf) au moment d'un opérateur d'affichage (Tj, TJ, ', "). None si le flux est illisible.
    Une police seulement déclarée, ou sélectionnée par Tf sans qu'aucun glyphe soit dessiné avec elle (reportlab
    pose ainsi Helvetica en tête de chaque page), ne s'imprime pas."""
    from pypdf.generic import ContentStream
    try:
        cs = flux if isinstance(flux, ContentStream) else ContentStream(flux, lecteur)
        courante, noms = None, set()
        for op, nom in cs.operations:
            if nom == b"Tf" and op:
                courante = str(op[0])
            elif nom in (b"Tj", b"TJ", b"'", b'"') and courante is not None:
                noms.add(courante)
        return noms
    except Exception:
        return None


def polices_de(ressources, numero, vues, acc, profondeur=0, employes=None, lecteur=None, ignorees=None):
    if ressources is None or profondeur > 3:
        return
    ressources = ressources.get_object()
    fontes = ressources.get("/Font")
    if fontes is not None:
        for cle_res, ref in fontes.get_object().items():
            if employes is not None and str(cle_res) not in employes:
                if ignorees is not None:
                    ignorees.add(nom_police(ref.get_object().get("/BaseFont", "(sans nom)")))
                continue
            f = ref.get_object()
            cle = id(f)
            sous_type = str(f.get("/Subtype", ""))
            base = nom_police(f.get("/BaseFont", "(sans nom)"))
            desc = None
            if sous_type == "/Type0":
                desc_f = f.get("/DescendantFonts")
                if desc_f is not None:
                    d0 = desc_f.get_object()[0].get_object()
                    desc = d0.get("/FontDescriptor")
            else:
                desc = f.get("/FontDescriptor")
            embarquee = sous_type == "/Type3"
            if desc is not None:
                d = desc.get_object()
                embarquee = embarquee or any(k in d for k in ("/FontFile", "/FontFile2", "/FontFile3"))
            entree = acc.get((base, sous_type))
            if entree is None:
                entree = {"nom": base, "type": sous_type[1:] if sous_type.startswith("/") else sous_type,
                          "embarquee": bool(embarquee), "sous_ensemble": bool(re.match(r"^[A-Z]{6}\+", base)), "pages": []}
                acc[(base, sous_type)] = entree
            if numero not in entree["pages"]:
                entree["pages"].append(numero)
    xobjets = ressources.get("/XObject")
    if xobjets is not None:
        for _, ref in xobjets.get_object().items():
            x = ref.get_object()
            if str(x.get("/Subtype", "")) == "/Form" and id(x) not in vues:
                vues.add(id(x))
                polices_de(x.get("/Resources"), numero, vues, acc, profondeur + 1,
                           noms_employes(x, lecteur) if lecteur is not None else None, lecteur, ignorees)


try:
    from pypdf import PdfReader
    lecteur = PdfReader(sys.argv[1])
    acc, textes, ignorees = {}, [], set()
    for i, page in enumerate(lecteur.pages, 1):
        mb = page.mediabox
        sortie["pages"].append({"largeur": round(float(mb.width), 2), "hauteur": round(float(mb.height), 2),
                                "rotation": int(page.get("/Rotate", 0) or 0)})
        contenu = page.get_contents()
        polices_de(page.get("/Resources"), i, set(), acc, 0,
                   noms_employes(contenu, lecteur) if contenu is not None else set(), lecteur, ignorees)
        try:
            textes.append(page.extract_text() or "")
        except Exception as e:  # une page illisible ne fait pas tomber les autres
            textes.append("")
    sortie["polices"] = list(acc.values())
    sortie["polices_declarees_non_employees"] = sorted(ignorees - {p["nom"] for p in acc.values()})
    meta = lecteur.metadata or {}
    sortie["producteur"] = str(meta.get("/Producer")) if meta.get("/Producer") else None
    sortie["createur"] = str(meta.get("/Creator")) if meta.get("/Creator") else None
    sortie["lecteurs"]["pypdf"] = {"ok": True, "pages": textes}
    sortie["ok"] = True
except ImportError as e:
    sortie["erreur"] = "pypdf absent : " + str(e)
    sortie["lecteurs"]["pypdf"] = {"ok": False, "erreur": "module absent"}
except Exception as e:
    sortie["erreur"] = "PDF illisible par pypdf : " + str(e)[:300]
    sortie["lecteurs"]["pypdf"] = {"ok": False, "erreur": str(e)[:300]}

try:
    import warnings
    warnings.filterwarnings("ignore")
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz
    doc = fitz.open(sys.argv[1])
    sortie["lecteurs"]["pymupdf"] = {"ok": True, "pages": [p.get_text() for p in doc]}
except ImportError:
    sortie["lecteurs"]["pymupdf"] = {"ok": False, "erreur": "module absent (pymupdf)"}
except Exception as e:
    sortie["lecteurs"]["pymupdf"] = {"ok": False, "erreur": str(e)[:300]}

print(json.dumps(sortie, ensure_ascii=False))
