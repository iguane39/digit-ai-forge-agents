# polices-embarquees.py — moteur de l'oracle des polices EMBARQUÉES (TF-1501, 01/10/2026).
# Appelé par oracle-polices-embarquees.mjs, qui écrit le contrat commun des oracles ; ce moteur
# rend sur stdout un rapport JSON (format quality-oracles/polices-embarquees@1) et sort en
# 0 (polices saines), 1 (au moins un constat) ou 2 (rien à juger, ou décodeur absent).
#
# LE FAIT (lot du 30/09/2026, RA-02). Cinq versions d'un deck de propale sont sorties avec huit
# polices embarquées fausses (Inter Regular : 232 contours faux sur 235) : sur un poste qui n'a pas
# la police, le texte s'affichait en éclats. oracle-pptx a rendu PASS sur chacune, son non_juge ne
# disait rien des polices, et le poste producteur ne voyait rien : il lit la police INSTALLÉE,
# jamais la copie embarquée. Cause mesurée chez le produit : PowerPoint embarque une police par le
# composant de Windows t2embed.dll (TTEmbedFont, sous-ensemble compressé MTX), et la table du codage
# en triplets de ce composant était altérée dans la mémoire du processus PowerPoint réutilisé par
# tous les exports (29 lignes sur 128). Un processus neuf encode juste.
#
# LA MÉTHODE est celle du contrôle écrit par le produit (verifier-polices-embarquees.py 1.0.1),
# portée ici sans nom, sans deck ni rapport. Chaque partie ppt/fonts/* (flux EOT) est décodée par
# le décodeur de Windows, t2embed.dll, chargée en PRIVÉ dans ce processus (rien n'est installé),
# puis jugée par trois règles :
#   E0 la partie se décode : une police que le décodeur refuse est illisible chez le destinataire ;
#   E1 ses contours sont ceux de la police installée de même famille, graisse, pente et VERSION
#      (mêmes indices de glyphes ; un composite garde ses composants et leurs décalages). Une autre
#      version de la police n'a pas les mêmes glyphes aux mêmes indices : E1 n'est alors pas jouée,
#      et c'est dit ;
#   E2 aucun glyphe simple ne sort de la boîte englobante que la police déclare (table head) — la
#      règle qui juge aussi une police absente du poste.
#
# CE QUE CE MOTEUR NE FAIT PAS : il ne répare rien (le réencodage hors PowerPoint est un geste du
# producteur, pas d'un juge) et il ne décode pas le MTX hors de Windows — le portage par libeot n'a
# pas été mesuré, il n'est donc pas branché (SKIP motivé).
#
# Usage : python polices-embarquees.py <fichier.pptx|.potx> [--polices <dossier>]
#   --polices désigne le dossier des polices de RÉFÉRENCE d'E1 et remplace les dossiers du système
#   (une recette désigne sa donnée, elle ne la résout jamais par voisinage — TF-0912).
import io
import json
import os
import re
import struct
import sys
import zipfile

FORMAT = "quality-oracles/polices-embarquees@1"
VERSION = "1.0.0"
EXTENSIONS_POLICE = (".ttf", ".ttc", ".otf")
PROFONDEUR_INDEX = 4


def sortir(rapport, code):
    sys.stdout.write(json.dumps(rapport, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(code)


def argument(nom):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv and sys.argv.index(nom) + 1 < len(sys.argv) else None


fichier = next((a for a in sys.argv[1:] if not a.startswith("--") and a != argument("--polices")), None)
dossier_polices = argument("--polices")
rapport = {"format": FORMAT, "version": VERSION, "fichier": os.path.basename(fichier or ""), "type": None,
           "verdict": None, "motif": None, "polices": [], "constats": [], "non_juge": []}

try:
    from fontTools.ttLib import TTCollection, TTFont
except ImportError:  # le lanceur vérifie fontTools avant d'appeler : ce repli ne sert qu'à l'appel direct
    rapport.update(verdict="SKIP", motif="fontTools introuvable dans cet interpréteur (pip install fonttools)")
    sortir(rapport, 2)

if not fichier or not os.path.isfile(fichier):
    rapport.update(verdict="SKIP", motif="fichier absent")
    sortir(rapport, 2)


# ---- l'en-tête EOT (spécification W3C « Embedded OpenType », versions 0x00020001 et 0x00020002)
def entete_eot(b):
    """Famille, style, version, drapeaux, graisse et pente lus dans l'en-tête d'un flux EOT ; None si ce n'en est pas un."""
    if len(b) < 82 or struct.unpack_from("<H", b, 34)[0] != 0x504C:
        return None
    _taille, taille_donnees, _version, drapeaux = struct.unpack_from("<IIII", b, 0)
    italique, graisse = b[27], struct.unpack_from("<I", b, 28)[0]
    pos, noms = 82, []
    for _ in range(4):
        if pos + 2 > len(b):
            return None
        n = struct.unpack_from("<H", b, pos)[0]
        noms.append(b[pos + 2:pos + 2 + n].decode("utf-16-le", "replace").strip("\x00 "))
        pos += 2 + n + 2
    return {"famille": noms[0], "style": noms[1], "version": noms[2], "sous_ensemble": bool(drapeaux & 0x1),
            "compresse_mtx": bool(drapeaux & 0x4), "octets": len(b), "octets_police": taille_donnees,
            "graisse": graisse, "italique": bool(italique)}


# ---- le décodeur de Windows : t2embed.dll, chargement PRIVÉ au processus (rien n'est installé)
def charger_t2embed():
    """Rend une fonction eot -> (octets TTF, erreur), ou (None, motif) si le décodeur manque."""
    if os.name != "nt":
        return None, ("décodeur MTX t2embed.dll absent hors de Windows : polices embarquées non décodées "
                      "(le portage par libeot n'est pas mesuré, donc pas branché)")
    import ctypes
    from ctypes import wintypes
    try:
        t2, gdi = ctypes.WinDLL("t2embed.dll"), ctypes.WinDLL("gdi32.dll")
    except OSError as e:
        return None, f"t2embed.dll introuvable sur ce poste ({e}) : polices embarquées non décodées"
    lecture = ctypes.CFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)
    t2.TTLoadEmbeddedFont.restype = ctypes.c_long
    t2.TTLoadEmbeddedFont.argtypes = [ctypes.POINTER(wintypes.HANDLE), ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_ulong,
                                      ctypes.POINTER(ctypes.c_ulong), lecture, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_char_p, ctypes.c_void_p]
    t2.TTDeleteEmbeddedFont.restype = ctypes.c_long
    t2.TTDeleteEmbeddedFont.argtypes = [wintypes.HANDLE, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong)]
    gdi.CreateCompatibleDC.restype = wintypes.HDC
    gdi.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi.CreateFontW.restype = wintypes.HFONT
    gdi.CreateFontW.argtypes = [ctypes.c_int] * 5 + [wintypes.DWORD] * 8 + [ctypes.c_wchar_p]
    gdi.SelectObject.restype = wintypes.HGDIOBJ
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
    gdi.GetFontData.restype = wintypes.DWORD
    gdi.GetFontData.argtypes = [wintypes.HDC, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
    gdi.DeleteObject.argtypes = [wintypes.HGDIOBJ]
    gdi.DeleteDC.argtypes = [wintypes.HDC]

    def decoder(eot, nom_prive):
        etat = {"pos": 0}

        def lire(_flux, tampon, n):
            bloc = eot[etat["pos"]:etat["pos"] + n]
            ctypes.memmove(tampon, bloc, len(bloc))
            etat["pos"] += len(bloc)
            return len(bloc)

        rappel = lecture(lire)
        ref, priv, statut = wintypes.HANDLE(), ctypes.c_ulong(0), ctypes.c_ulong(0)
        # TTLOAD_PRIVATE (0x1) et LICENSE_PREVIEWPRINT (0x4) : les drapeaux de l'appel du produit
        code = t2.TTLoadEmbeddedFont(ctypes.byref(ref), 0x1, ctypes.byref(priv), 0x4, ctypes.byref(statut), rappel, None, nom_prive, None, None)
        if code != 0:
            return None, f"TTLoadEmbeddedFont a rendu 0x{code & 0xFFFFFFFF:04x}"
        try:
            hdc = gdi.CreateCompatibleDC(None)
            hfont = gdi.CreateFontW(-2048, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, nom_prive)
            ancien = gdi.SelectObject(hdc, hfont)
            taille = gdi.GetFontData(hdc, 0, 0, None, 0)
            if taille == 0xFFFFFFFF:
                return None, "GetFontData a rendu GDI_ERROR"
            tampon = ctypes.create_string_buffer(taille)
            lu = gdi.GetFontData(hdc, 0, 0, tampon, taille)
            gdi.SelectObject(hdc, ancien)
            gdi.DeleteObject(hfont)
            gdi.DeleteDC(hdc)
            return tampon.raw[:lu], None
        finally:
            t2.TTDeleteEmbeddedFont(ref, 0, ctypes.byref(ctypes.c_ulong(0)))

    return decoder, None


# ---- les polices de RÉFÉRENCE d'E1 : celles du poste, ou le dossier désigné par --polices
def dossiers_reference():
    if dossier_polices:
        return [dossier_polices]
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA", "")
        return [os.path.join(local, "Microsoft", "Windows", "Fonts"), os.path.join(local, "Microsoft", "FontCache", "4", "CloudFonts"),
                os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]
    if sys.platform == "darwin":
        return ["/Library/Fonts", os.path.expanduser("~/Library/Fonts"), "/System/Library/Fonts"]
    return ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts"), os.path.expanduser("~/.local/share/fonts")]


def index_reference(familles):
    """(famille, graisse, pente) -> (chemin, rang dans une collection) pour les seules familles cherchées."""
    index = {}
    for racine in dossiers_reference():
        if not os.path.isdir(racine):
            continue
        base = racine.rstrip("\\/").count(os.sep)
        for dossier, sous, fichiers in os.walk(racine):
            if dossier.count(os.sep) - base >= PROFONDEUR_INDEX:
                sous[:] = []
            for nom in sorted(fichiers):
                if not nom.lower().endswith(EXTENSIONS_POLICE):
                    continue
                chemin = os.path.join(dossier, nom)
                try:
                    polices = TTCollection(chemin, lazy=True).fonts if nom.lower().endswith(".ttc") else [TTFont(chemin, lazy=True)]
                except Exception:  # noqa: BLE001 — un fichier illisible n'est pas une référence
                    continue
                for rang, f in enumerate(polices):
                    try:
                        fam = (f["name"].getDebugName(1) or "").strip()
                        if fam in familles:  # le style de l'en-tête EOT est localisé (« Gras ») : la graisse et la pente ne le sont pas
                            index.setdefault((fam, f["OS/2"].usWeightClass, bool(f["head"].macStyle & 2)), (chemin, rang))
                    except Exception:  # noqa: BLE001
                        continue
    return index


def ouvrir_reference(chemin, rang):
    return TTCollection(chemin, lazy=False).fonts[rang] if chemin.lower().endswith(".ttc") else TTFont(chemin, lazy=False)


# ---- E1 et E2
def e1_contours(decodee, source):
    """Compare glyphe à glyphe, aux MÊMES indices, la copie décodée et la police source."""
    ge, gs = decodee["glyf"], source["glyf"]
    oe, os_ = decodee.getGlyphOrder(), source.getGlyphOrder()
    simples = faux = composites = faux_c = 0
    exemples = []
    for i, nom in enumerate(oe):
        a = ge[nom]
        if a.numberOfContours == 0 or i >= len(os_):
            continue  # glyphe vidé par le sous-ensemble, ou absent de la source
        b = gs[os_[i]]
        if a.isComposite():
            composites += 1
            ca = [(oe.index(c.glyphName), c.x, c.y) for c in a.components]
            cb = [(os_.index(c.glyphName), c.x, c.y) for c in b.components] if b.isComposite() else None
            if ca != cb:
                faux_c += 1
                if len(exemples) < 5:
                    exemples.append(os_[i])
        else:
            simples += 1
            if b.numberOfContours <= 0 or list(a.coordinates) != list(b.coordinates) or list(a.endPtsOfContours) != list(b.endPtsOfContours):
                faux += 1
                if len(exemples) < 5:
                    exemples.append(os_[i])
    return {"glyphes_simples": simples, "contours_faux": faux, "composites": composites, "composites_faux": faux_c, "exemples_e1": exemples}


def e2_boite(decodee):
    h, g = decodee["head"], decodee["glyf"]
    dehors, exemples = 0, []
    for nom in decodee.getGlyphOrder():
        a = g[nom]
        if a.numberOfContours <= 0:
            continue
        xs, ys = [p[0] for p in a.coordinates], [p[1] for p in a.coordinates]
        if min(xs) < h.xMin or max(xs) > h.xMax or min(ys) < h.yMin or max(ys) > h.yMax:
            dehors += 1
            if len(exemples) < 5:
                exemples.append(nom)
    return {"glyphes_hors_boite": dehors, "boite": [h.xMin, h.yMin, h.xMax, h.yMax], "exemples_e2": exemples}


def juger_police(ligne, ttf, sources):
    """E1 et E2 sur une police décodée ; complète `ligne`, rend la liste des constats."""
    constats, nom = [], f"{ligne['famille']} {ligne['style']}".strip()
    try:
        decodee = TTFont(io.BytesIO(ttf), lazy=False)
        if "glyf" not in decodee:
            rapport["non_juge"].append(f"{nom} : contours non TrueType (pas de table glyf) — E1 et E2 non jouées")
            ligne["etat"] = "NON_JUGEE"
            return constats
        ligne.update(e2_boite(decodee))
    except Exception as e:  # noqa: BLE001
        ligne.update(etat="FAIL", motif=f"copie décodée illisible par fontTools : {e}")
        return [{"regle": "E0", "partie": ligne["partie"], "police": nom, "constat": f"copie décodée illisible par fontTools : {str(e)[:160]}"}]
    if ligne["glyphes_hors_boite"]:
        b = ligne["boite"]
        constats.append({"regle": "E2", "partie": ligne["partie"], "police": nom,
                         "constat": f"{ligne['glyphes_hors_boite']} glyphe(s) sortent de la boîte englobante déclarée par la police "
                                    f"(xMin {b[0]}, yMin {b[1]}, xMax {b[2]}, yMax {b[3]})",
                         "exemples": ligne["exemples_e2"]})
    cle = (ligne["famille"], ligne["graisse"], ligne["italique"])
    if cle not in sources:
        rapport["non_juge"].append(f"{nom} : police source absente des polices de référence ({' · '.join(dossiers_reference())}) — E1 non jouée, E2 juge seule")
    else:
        chemin, rang = sources[cle]
        source = ouvrir_reference(chemin, rang)
        version_src = (source["name"].getDebugName(5) or "").strip()
        if version_src != ligne["version"]:
            rapport["non_juge"].append(f"{nom} : police de référence en « {version_src} », copie embarquée en « {ligne['version']} » — "
                                       "une autre version n'a pas les mêmes glyphes aux mêmes indices : E1 non jouée, E2 juge seule")
        elif "glyf" not in source:
            rapport["non_juge"].append(f"{nom} : police de référence sans table glyf ({os.path.basename(chemin)}) — E1 non jouée")
        else:
            ligne.update(e1_contours(decodee, source), source=os.path.basename(chemin))
            if ligne["contours_faux"] or ligne["composites_faux"]:
                constats.append({"regle": "E1", "partie": ligne["partie"], "police": nom,
                                 "constat": f"{ligne['contours_faux']} glyphe(s) simple(s) sur {ligne['glyphes_simples']} et {ligne['composites_faux']} "
                                            f"composite(s) sur {ligne['composites']} ne redonnent pas les contours de la police installée ({ligne['source']})",
                                 "exemples": ligne["exemples_e1"]})
    ligne["etat"] = "FAIL" if constats else "PASS"
    return constats


# ---- le paquet PPTX
ext = os.path.splitext(fichier)[1].lower()
if ext not in (".pptx", ".potx"):
    rapport.update(verdict="SKIP", motif=f"extension non gérée ({ext or 'aucune'}) : .pptx, .potx")
    sortir(rapport, 2)
rapport["type"] = "pptx"
try:
    with zipfile.ZipFile(fichier) as z:
        parties = sorted((n for n in z.namelist() if n.startswith("ppt/fonts/") and not n.endswith("/")),
                         key=lambda n: (int(re.sub(r"\D", "", n) or 0), n))
        donnees = {n: z.read(n) for n in parties}
        pres = z.read("ppt/presentation.xml").decode("utf-8", "replace") if "ppt/presentation.xml" in z.namelist() else ""
except (zipfile.BadZipFile, OSError) as e:
    rapport.update(verdict="SKIP", motif=f"paquet illisible ({e}) : l'intégrité du paquet est jugée par oracle-pptx")
    sortir(rapport, 2)
rapport["attributs"] = {a: (m.group(1) if (m := re.search(rf'{a}="([^"]*)"', pres)) else None) for a in ("embedTrueTypeFonts", "saveSubsetFonts")}
if not parties:
    rapport.update(verdict="SKIP", motif="aucune police embarquée (pas de partie ppt/fonts/ dans le paquet) : domaine sans objet")
    sortir(rapport, 2)

decoder, motif_decodeur = charger_t2embed()
if decoder is None:
    rapport.update(verdict="SKIP", motif=f"{len(parties)} police(s) embarquée(s), {motif_decodeur}")
    sortir(rapport, 2)

entetes = {n: entete_eot(b) for n, b in donnees.items()}
sources = index_reference({e["famille"] for e in entetes.values() if e})
for i, n in enumerate(parties):
    e = entetes[n]
    if e is None:
        rapport["polices"].append({"partie": n, "etat": "FAIL", "motif": "pas un flux EOT (nombre magique 0x504C absent)"})
        rapport["constats"].append({"regle": "E0", "partie": n, "police": "?", "constat": "partie de police qui n'est pas un flux EOT (nombre magique 0x504C absent) : illisible chez le destinataire"})
        continue
    ligne = {"partie": n, **e}
    ttf, erreur = decoder(donnees[n], f"QOEmb{os.getpid()}x{i}")
    if erreur:
        ligne.update(etat="FAIL", motif=erreur)
        rapport["constats"].append({"regle": "E0", "partie": n, "police": f"{e['famille']} {e['style']}".strip(),
                                    "constat": f"police embarquée illisible par le décodeur de Windows : {erreur}"})
    else:
        rapport["constats"].extend(juger_police(ligne, ttf, sources))
    rapport["polices"].append(ligne)

rapport["verdict"] = "FAIL" if rapport["constats"] else "PASS"
sortir(rapport, 1 if rapport["constats"] else 0)
