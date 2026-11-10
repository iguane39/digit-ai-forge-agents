# lib/comparer_docx.py — compare un document Word retouché à sa version d'origine (TF-2370, 10/11/2026).
#
# Rend sur la sortie standard un JSON que lit oracle-docx-retouche.mjs : les parties du paquet et celles qui
# diffèrent hors du corps (octet pour octet), les textes des paragraphes de chaque version, la comparaison
# des tableaux rang par rang (XML identique, ou identique aux seuls marqueurs de pagination près), et les
# identifiants w14:paraId en double. Les textes ne servent qu'aux comparaisons : l'oracle ne les recopie pas.
#
# Usage : python comparer_docx.py <origine.docx> <retouche.docx>
import json
import re
import sys
import unicodedata
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
LIBRES = {"word/document.xml", "docProps/core.xml", "docProps/app.xml"}


def lire(chemin):
    z = zipfile.ZipFile(chemin)
    return {n: z.read(n) for n in z.namelist()}


def texte_paragraphe(xml):
    morceaux = []
    for m in re.finditer(rb"<w:t(?:\s[^>]*)?>([^<]*)</w:t>|<w:tab/>|<w:br/>", xml):
        if m.group(0).startswith(b"<w:tab"):
            morceaux.append("\t")
        elif m.group(0).startswith(b"<w:br"):
            morceaux.append("\n")
        else:
            morceaux.append(m.group(1).decode("utf-8", "replace"))
    t = "".join(morceaux)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'")):
        t = t.replace(a, b)
    return unicodedata.normalize("NFKC", t)


def paragraphes(doc):
    return [texte_paragraphe(m.group(0)) for m in re.finditer(rb"<w:p[\s>].*?</w:p>", doc, re.S)]


def tableaux(doc):
    return [m.group(0) for m in re.finditer(rb"<w:tbl>.*?</w:tbl>", doc, re.S)]


def sans_pagination(b):
    b = b.replace(b"<w:trPr><w:cantSplit/></w:trPr>", b"")
    b = b.replace(b"<w:cantSplit/>", b"").replace(b"<w:keepNext/>", b"")
    return b.replace(b"<w:pPr></w:pPr>", b"")


sortie = {"ok": False}
try:
    o, r = lire(sys.argv[1]), lire(sys.argv[2])
    if "word/document.xml" not in o or "word/document.xml" not in r:
        raise ValueError("word/document.xml absent d'un des deux paquets")
    do, dr = o["word/document.xml"], r["word/document.xml"]
    to, tr = tableaux(do), tableaux(dr)
    ids = [m.group(1).decode() for m in re.finditer(rb'w14:paraId="([0-9A-Fa-f]+)"', dr)]
    vus, doubles = set(), []
    for i in ids:
        if i in vus and i not in doubles:
            doubles.append(i)
        vus.add(i)
    sortie = {
        "ok": True,
        "parties_en_plus": sorted(set(r) - set(o)),
        "parties_en_moins": sorted(set(o) - set(r)),
        "parties_modifiees_hors_corps": sorted(n for n in o if n in r and n not in LIBRES and o[n] != r[n]),
        "parties_identiques_hors_corps": len([n for n in o if n in r and n not in LIBRES and o[n] == r[n]]),
        "paragraphes_origine": paragraphes(do),
        "paragraphes_retouche": paragraphes(dr),
        "tableaux_origine": len(to),
        "tableaux": [{"rang": i + 1, "identique": i < len(to) and t == to[i],
                      "pagination_seule": i < len(to) and t != to[i] and sans_pagination(t) == sans_pagination(to[i])}
                     for i, t in enumerate(tr)],
        "paraid_total": len(ids),
        "paraid_doubles": doubles,
    }
except Exception as e:
    sortie = {"ok": False, "erreur": str(e)[:300]}
print(json.dumps(sortie, ensure_ascii=False))
