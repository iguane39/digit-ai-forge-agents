# polices-embarquees.py — moteur de l'oracle des polices EMBARQUÉES (TF-1501 et TF-1504, 01/10/2026).
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
# tous les exports (29 lignes sur 128). Un processus neuf encode juste. La décision humaine du même
# jour (RP-04, TF-1504) étend le juge à TOUT livrable qui embarque des polices.
#
# LA MÉTHODE est celle du contrôle écrit par le produit (verifier-polices-embarquees.py 1.0.1),
# portée ici sans nom, sans deck ni rapport. Chaque police embarquée est DÉCODÉE comme la décode le
# poste du destinataire, puis jugée par trois règles :
#   E0 la police se décode : une police que le décodeur refuse est illisible chez le destinataire ;
#   E1 ses contours sont ceux de la police installée de même famille, graisse, pente et VERSION. Une
#      autre version de la police n'a pas les mêmes glyphes aux mêmes indices : E1 n'est alors pas
#      jouée, et c'est dit ;
#   E2 aucun glyphe simple ne sort de la boîte englobante que la police déclare (table head) — la
#      règle qui juge aussi une police absente du poste.
# Par type de livrable :
#   PPTX, POTX  parties ppt/fonts/* (flux EOT, MTX) décodées par t2embed.dll chargée en PRIVÉ dans ce
#               processus (rien n'est installé) ; E1 aux MÊMES indices de glyphes (un composite garde
#               ses composants et leurs décalages), la méthode mesurée par le produit ;
#   DOCX, DOTX  parties word/fonts/* que word/fontTable.xml désigne (w:embedRegular, w:embedBold…),
#               désobscurcies par leur w:fontKey (ECMA-376, 17.8.1 : les 32 premiers octets XOR la clé
#               lue à rebours) — aucune dépendance au système ;
#   PDF         programmes de police des descripteurs (FontFile2 TrueType, FontFile3 /OpenType à contours
#               TrueType), lus par pypdf. Les programmes CFF (FontFile3 Type1C, CIDFontType0C, OpenType
#               CFF) et Type 1 (FontFile) ne sont pas jugés : comptés et dits au non_juge.
#   HTML, HTM   polices d'une règle @font-face en data: (base64), WOFF2 (module brotli), WOFF ou sfnt,
#               localisées par la ligne de leur règle.
#   Pour DOCX, PDF et HTML, E1 apparie les glyphes par leurs INDICES si la table cmap Unicode de la
#   copie donne les mêmes indices que la source pour chaque point de code commun, sinon par POINT DE
#   CODE (contours aplatis comparés) ; sans table cmap Unicode, E1 n'est pas jouée et c'est dit.
#
# CE QUE CE MOTEUR NE FAIT PAS : il ne répare rien (le réencodage est un geste du producteur, pas
# d'un juge) et il ne décode pas le MTX hors de Windows — le portage par libeot n'a pas été mesuré,
# il n'est donc pas branché (SKIP motivé).
#
# Usage : python polices-embarquees.py <fichier.pptx|.potx|.docx|.dotx|.pdf|.html|.htm> [--polices <dossier>]
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
VERSION = "1.1.0"
EXTENSIONS_POLICE = (".ttf", ".ttc", ".otf")
PROFONDEUR_INDEX = 4
TYPES = {".pptx": "pptx", ".potx": "pptx", ".docx": "docx", ".dotx": "docx", ".pdf": "pdf", ".html": "html", ".htm": "html"}


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
ext = os.path.splitext(fichier)[1].lower()
if ext not in TYPES:
    rapport.update(verdict="SKIP", motif=f"extension non gérée ({ext or 'aucune'}) : {', '.join(TYPES)}")
    sortir(rapport, 2)
rapport["type"] = TYPES[ext]


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
    if not familles:
        return index
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


def identite(police):
    """Famille, style, version, graisse et pente lues dans la police elle-même ; None sans table name lisible."""
    try:
        if "name" not in police:
            return None
        nom = police["name"]
        return {"famille": (nom.getDebugName(1) or "").strip(), "style": (nom.getDebugName(2) or "").strip(),
                "version": (nom.getDebugName(5) or "").strip(),
                "graisse": police["OS/2"].usWeightClass if "OS/2" in police else 400,
                "italique": bool(police["head"].macStyle & 2) if "head" in police else False}
    except Exception:  # noqa: BLE001 — une table name ou OS/2 illisible laisse la famille inconnue, E1 le dira
        return None


def cmap_unicode(police):
    try:
        return police.getBestCmap() or {}
    except Exception:  # noqa: BLE001 — une cmap illisible ne permet pas d'apparier, E1 le dira
        return {}


# ---- E1 et E2
def e1_indices(decodee, source):
    """Compare glyphe à glyphe, aux MÊMES indices, la copie décodée et la police source (méthode du produit)."""
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
    return {"appariement": "indices", "glyphes_simples": simples, "contours_faux": faux, "composites": composites,
            "composites_faux": faux_c, "exemples_e1": exemples}


def e1_apparie(decodee, source):
    """DOCX et PDF : un sous-ensemble peut renuméroter ses glyphes. Les indices servent s'ils sont
    CONSERVÉS — la table cmap Unicode de la copie donne, pour chaque point de code commun, l'indice de
    la source ; sinon les glyphes s'apparient par POINT DE CODE, contours aplatis (composites résolus)."""
    ce, cs = cmap_unicode(decodee), cmap_unicode(source)
    communs = sorted(cp for cp in ce if cp in cs)
    if not communs:
        return None
    oe, os_ = decodee.getGlyphOrder(), source.getGlyphOrder()
    ie, is_ = {n: i for i, n in enumerate(oe)}, {n: i for i, n in enumerate(os_)}
    if all(ie[ce[cp]] == is_[cs[cp]] for cp in communs):
        return e1_indices(decodee, source)
    ge, gs = decodee["glyf"], source["glyf"]
    compares = faux = 0
    exemples = []
    for ne, ns in sorted({(ce[cp], cs[cp]) for cp in communs}):
        if ge[ne].numberOfContours == 0:
            continue
        compares += 1
        ca, cb = ge[ne].getCoordinates(ge), gs[ns].getCoordinates(gs)
        if list(ca[0]) != list(cb[0]) or list(ca[1]) != list(cb[1]):
            faux += 1
            if len(exemples) < 5:
                exemples.append(ns)
    return {"appariement": "points de code", "glyphes_simples": compares, "contours_faux": faux, "composites": 0,
            "composites_faux": 0, "exemples_e1": exemples}


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


def juger(entree, sources):
    """E1 et E2 sur une police décodée (entree["police"]) ; complète entree["ligne"], rend ses constats."""
    ligne, decodee = entree["ligne"], entree["police"]
    nom = (f"{ligne.get('famille') or ''} {ligne.get('style') or ''}".strip() or ligne.get("declaree") or "?")
    constats = []
    try:
        ligne.update(e2_boite(decodee))
    except Exception as e:  # noqa: BLE001 — un glyphe que fontTools ne sait pas lire, un lecteur ne le dessinera pas
        ligne.update(etat="FAIL", motif=f"glyphe illisible : {e}")
        return [{"regle": "E0", "partie": ligne["partie"], "police": nom, "constat": f"glyphe illisible par fontTools : {str(e)[:160]} — illisible chez le destinataire"}]
    if ligne["glyphes_hors_boite"]:
        b = ligne["boite"]
        constats.append({"regle": "E2", "partie": ligne["partie"], "police": nom,
                         "constat": f"{ligne['glyphes_hors_boite']} glyphe(s) sortent de la boîte englobante déclarée par la police "
                                    f"(xMin {b[0]}, yMin {b[1]}, xMax {b[2]}, yMax {b[3]})",
                         "exemples": ligne["exemples_e2"]})
    cle = (ligne.get("famille"), ligne.get("graisse"), ligne.get("italique"))
    if not ligne.get("famille"):
        rapport["non_juge"].append(f"{nom} ({ligne['partie']}) : copie sans table name, famille inconnue — E1 non jouée, E2 juge seule")
    elif cle not in sources:
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
            try:
                e1 = e1_indices(decodee, source) if rapport["type"] == "pptx" else e1_apparie(decodee, source)
                if e1 is None:
                    rapport["non_juge"].append(f"{nom} : copie sans table cmap Unicode commune avec la source — glyphes non appariables, E1 non jouée")
            except Exception as e:  # noqa: BLE001
                e1 = None
                rapport["non_juge"].append(f"{nom} : comparaison des contours interrompue ({str(e)[:100]}) — E1 non jouée, E2 juge seule")
            if e1 is not None:
                ligne.update(e1, source=os.path.basename(chemin))
                if ligne["contours_faux"] or ligne["composites_faux"]:
                    constats.append({"regle": "E1", "partie": ligne["partie"], "police": nom,
                                     "constat": f"{ligne['contours_faux']} glyphe(s) simple(s) sur {ligne['glyphes_simples']} et {ligne['composites_faux']} "
                                                f"composite(s) sur {ligne['composites']} ne redonnent pas les contours de la police installée ({ligne['source']})"
                                                + (f", glyphes appariés par {e1['appariement']}" if rapport["type"] != "pptx" else ""),
                                     "exemples": ligne["exemples_e1"]})
    ligne["etat"] = "FAIL" if constats else "PASS"
    return constats


def lire_sfnt(octets):
    """Ouvre une police sans lire d'avance ses tables : seules celles qui portent les CONTOURS (head,
    maxp, loca, glyf) font un E0 si elles sont illisibles. Mesuré le 01/10/2026 sur 198 PDF du poste :
    4 FAIL E0 venaient d'une table post de format inconnu, que ni un lecteur de PDF ni GDI ne lisent
    pour dessiner — la table est ignorée, et c'est dit, plutôt qu'un faux constat d'illisibilité."""
    police, ignorees = TTFont(io.BytesIO(octets), lazy=True), []
    if "post" in police.reader.tables:
        try:
            police["post"]
        except Exception as e:  # noqa: BLE001
            del police.reader.tables["post"]
            police.tables.pop("post", None)
            ignorees.append(f"table post illisible ({str(e)[:80]}), ignorée : sans effet sur les contours")
    police.getGlyphOrder()
    for tag in ("head", "maxp", "loca", "glyf"):
        if tag in police.reader.tables:
            police[tag]
    return police, ignorees


def decoder_sfnt(entree, octets, origine):
    """Lit une police sfnt décodée ; un échec est un constat E0. Rend True si la police est jugeable."""
    ligne = entree["ligne"]
    try:
        police, ignorees = lire_sfnt(octets)
    except Exception as e:  # noqa: BLE001
        # Un lecteur de PDF répare ce qu'il peut d'un programme de police (mesuré le 01/10/2026 : 4
        # programmes sur 844, d'un même producteur, ont une table glyf plus courte que ne l'annonce loca) ;
        # PowerPoint, Word et le filtre des navigateurs refusent. Pour un PDF, E0 AVERTIT donc, et se lit
        # chez le destinataire ; ailleurs il bloque.
        pdf = rapport["type"] == "pdf"
        ligne.update(etat="WARN" if pdf else "FAIL", motif=f"{origine} illisible par fontTools : {e}")
        rapport["constats"].append({"regle": "E0", "sev": "warn" if pdf else "bloquant", "partie": ligne["partie"],
                                    "police": ligne.get("declaree") or ligne.get("famille") or "?",
                                    "constat": f"{origine} illisible par fontTools : {str(e)[:160]} — "
                                               + ("un lecteur de PDF tolérant peut le réparer, un lecteur strict non : à vérifier chez le destinataire"
                                                  if pdf else "illisible chez le destinataire")})
        return False
    for message in ignorees:
        rapport["non_juge"].append(f"{ligne.get('declaree') or ligne.get('famille') or '?'} ({ligne['partie']}) : {message}")
    if "glyf" not in police:
        ligne["etat"] = "NON_JUGEE"
        rapport["non_juge"].append(f"{ligne.get('declaree') or ligne.get('famille') or '?'} ({ligne['partie']}) : contours CFF (pas de table glyf) — E1 et E2 non jouées")
        return False
    if not ligne.get("famille"):
        ligne.update({k: v for k, v in (identite(police) or {}).items() if v not in (None, "")})
    entree["police"] = police
    return True


# ---- PPTX : parties ppt/fonts/* (flux EOT), décodées par t2embed.dll
def lire_pptx():
    try:
        with zipfile.ZipFile(fichier) as z:
            parties = sorted((n for n in z.namelist() if n.startswith("ppt/fonts/") and not n.endswith("/")),
                             key=lambda n: (int(re.sub(r"\D", "", n) or 0), n))
            donnees = {n: z.read(n) for n in parties}
            pres = z.read("ppt/presentation.xml").decode("utf-8", "replace") if "ppt/presentation.xml" in z.namelist() else ""
    except (zipfile.BadZipFile, OSError, KeyError) as e:
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
    entrees = []
    for i, n in enumerate(parties):
        e = entete_eot(donnees[n])
        if e is None:
            rapport["polices"].append({"partie": n, "etat": "FAIL", "motif": "pas un flux EOT (nombre magique 0x504C absent)"})
            rapport["constats"].append({"regle": "E0", "partie": n, "police": "?", "constat": "partie de police qui n'est pas un flux EOT (nombre magique 0x504C absent) : illisible chez le destinataire"})
            continue
        entree = {"ligne": {"partie": n, **e}, "police": None}
        rapport["polices"].append(entree["ligne"])
        ttf, erreur = decoder(donnees[n], f"QOEmb{os.getpid()}x{i}")
        if erreur:
            entree["ligne"].update(etat="FAIL", motif=erreur)
            rapport["constats"].append({"regle": "E0", "partie": n, "police": f"{e['famille']} {e['style']}".strip(),
                                        "constat": f"police embarquée illisible par le décodeur de Windows : {erreur}"})
        elif decoder_sfnt(entree, ttf, "copie décodée"):
            entrees.append(entree)
    return entrees


# ---- DOCX : parties word/fonts/* que fontTable.xml désigne, désobscurcies par leur clé
def attributs_de(element):
    return dict(re.findall(r'([\w:]+)="([^"]*)"', element))


def desobscurcir(octets, cle):
    """ECMA-376, partie 1, 17.8.1 : les 32 premiers octets de la police XOR la clé GUID lue à rebours."""
    hexa = re.sub(r"[^0-9A-Fa-f]", "", cle or "")
    if len(hexa) != 32:
        return None
    k = bytes.fromhex(hexa)[::-1]
    b = bytearray(octets)
    for i in range(min(32, len(b))):
        b[i] ^= k[i % 16]
    return bytes(b)


def lire_docx():
    try:
        with zipfile.ZipFile(fichier) as z:
            noms = z.namelist()
            table = z.read("word/fontTable.xml").decode("utf-8", "replace") if "word/fontTable.xml" in noms else ""
            rels = z.read("word/_rels/fontTable.xml.rels").decode("utf-8", "replace") if "word/_rels/fontTable.xml.rels" in noms else ""
            parties = [n for n in noms if n.startswith("word/fonts/") and not n.endswith("/")]
            donnees = {n: z.read(n) for n in parties}
            reglages = z.read("word/settings.xml").decode("utf-8", "replace") if "word/settings.xml" in noms else ""
    except (zipfile.BadZipFile, OSError) as e:
        rapport.update(verdict="SKIP", motif=f"paquet illisible ({e}) : l'intégrité du paquet est jugée par oracle-docx")
        sortir(rapport, 2)
    rapport["attributs"] = {a: (a in reglages) for a in ("embedTrueTypeFonts", "saveSubsetFonts")}
    if not parties:
        rapport.update(verdict="SKIP", motif="aucune police embarquée (pas de partie word/fonts/ dans le paquet) : domaine sans objet")
        sortir(rapport, 2)
    cibles = {}
    for rel in re.findall(r"<Relationship\b[^>]*>", rels):
        a = attributs_de(rel)
        if "Id" in a and "Target" in a:
            t = a["Target"].lstrip("/")
            cibles[a["Id"]] = t if t.startswith("word/") else "word/" + t
    entrees, designees = [], set()
    for police in re.findall(r"<w:font\b.*?</w:font>", table, re.S):
        nom_police = attributs_de(police.split(">", 1)[0]).get("w:name", "?")
        for style, attr in re.findall(r"<w:embed(Regular|Bold|Italic|BoldItalic)\b([^>]*)/?>", police):
            a = attributs_de(attr)
            partie = cibles.get(a.get("r:id"))
            declaree = f"{nom_police} ({style})"
            if not partie or partie not in donnees:
                rapport["constats"].append({"regle": "E0", "partie": partie or "word/fontTable.xml", "police": declaree,
                                            "constat": f"police déclarée embarquée dont la partie est introuvable dans le paquet (relation {a.get('r:id')})"})
                continue
            designees.add(partie)
            entree = {"ligne": {"partie": partie, "declaree": declaree, "sous_ensemble": a.get("w:subsetted") in ("1", "true"),
                                "octets": len(donnees[partie])}, "police": None}
            rapport["polices"].append(entree["ligne"])
            octets = donnees[partie]
            if partie.lower().endswith(".odttf"):
                octets = desobscurcir(octets, a.get("w:fontKey"))
                if octets is None:
                    entree["ligne"].update(etat="FAIL", motif="clé d'obscurcissement absente ou illisible")
                    rapport["constats"].append({"regle": "E0", "partie": partie, "police": declaree,
                                                "constat": f"clé d'obscurcissement w:fontKey absente ou illisible ({a.get('w:fontKey')}) : police indéchiffrable chez le destinataire"})
                    continue
            if decoder_sfnt(entree, octets, "police désobscurcie"):
                entrees.append(entree)
    for n in sorted(set(parties) - designees):
        rapport["non_juge"].append(f"{n} : partie de police que fontTable.xml ne désigne pas — clé inconnue, non décodée (Word ne la lit pas)")
    return entrees


# ---- PDF : programmes de police des descripteurs, lus par pypdf
def lire_pdf():
    try:
        from pypdf import PdfReader
        from pypdf.generic import DictionaryObject, IndirectObject
    except ImportError:
        rapport.update(verdict="SKIP", motif="pypdf introuvable dans cet interpréteur (pip install pypdf) : programmes de police non lus")
        sortir(rapport, 2)
    try:
        lecteur = PdfReader(fichier, strict=False)
        if lecteur.is_encrypted:
            rapport.update(verdict="SKIP", motif="PDF chiffré : programmes de police non lus")
            sortir(rapport, 2)
        numeros = {(n, g) for g, d in lecteur.xref.items() for n in d} | {(n, 0) for n in getattr(lecteur, "xref_objStm", {})}
    except Exception as e:  # noqa: BLE001
        rapport.update(verdict="SKIP", motif=f"PDF illisible par pypdf ({str(e)[:120]})")
        sortir(rapport, 2)
    entrees, vus, non_juges = [], set(), {}
    for n, g in sorted(numeros):
        try:
            o = lecteur.get_object(IndirectObject(n, g, lecteur))
        except Exception:  # noqa: BLE001 — un objet illisible n'est pas un descripteur
            continue
        if not isinstance(o, DictionaryObject) or o.get("/Type") != "/FontDescriptor":
            continue
        declaree = re.sub(r"^[A-Z]{6}\+", "", str(o.get("/FontName", "?")).lstrip("/"))
        for cle in ("/FontFile2", "/FontFile3", "/FontFile"):
            if cle not in o:
                continue
            brut = o.raw_get(cle)
            num = brut.idnum if isinstance(brut, IndirectObject) else None
            if num in vus:
                continue
            vus.add(num)
            partie = f"objet {num} ({cle[1:]})"
            try:
                flux = brut.get_object()
                sous_type = str(flux.get("/Subtype", ""))
                octets = flux.get_data()
            except Exception as e:  # noqa: BLE001
                rapport["polices"].append({"partie": partie, "declaree": declaree, "etat": "FAIL", "motif": str(e)[:120]})
                rapport["constats"].append({"regle": "E0", "partie": partie, "police": declaree, "constat": f"programme de police indécodable : {str(e)[:160]}"})
                continue
            if cle == "/FontFile" or (cle == "/FontFile3" and sous_type != "/OpenType"):
                genre = "Type 1" if cle == "/FontFile" else f"CFF ({sous_type.lstrip('/')})"
                non_juges[genre] = non_juges.get(genre, 0) + 1
                continue
            entree = {"ligne": {"partie": partie, "declaree": declaree, "octets": len(octets)}, "police": None}
            rapport["polices"].append(entree["ligne"])
            if decoder_sfnt(entree, octets, "programme de police"):
                entrees.append(entree)
    for genre, nombre in sorted(non_juges.items()):
        rapport["non_juge"].append(f"{nombre} programme(s) de police {genre} : contours non TrueType — E1 et E2 non jouées")
    if not rapport["polices"] and not non_juges:
        rapport.update(verdict="SKIP", motif="aucun programme de police embarqué (aucun FontFile, FontFile2 ni FontFile3) : domaine sans objet")
        sortir(rapport, 2)
    if not rapport["polices"]:
        rapport.update(verdict="SKIP", motif="programmes de police tous CFF ou Type 1 : non jugés par cet oracle (" + ", ".join(sorted(non_juges)) + ")")
        sortir(rapport, 2)
    return entrees


# ---- page HTML : polices d'une règle @font-face en data: (base64 ; WOFF2, WOFF ou sfnt)
RX_FONT_FACE = re.compile(r"@font-face\s*\{(?P<corps>[^}]*)\}", re.I)
RX_DATA = re.compile(r"url\(\s*['\"]?data:(?P<mime>[\w/.+-]+);base64,(?P<b64>[A-Za-z0-9+/=\s]+?)['\"]?\s*\)", re.I)


def lire_html():
    import base64
    import binascii
    with open(fichier, encoding="utf-8", errors="replace") as f:
        texte = f.read()
    entrees, n = [], 0
    for bloc in RX_FONT_FACE.finditer(texte):
        corps = bloc.group("corps")
        famille = (re.search(r"font-family\s*:\s*['\"]?([^;'\"]+)", corps, re.I) or [None, "?"])[1].strip()
        graisse = (re.search(r"font-weight\s*:\s*([^;]+)", corps, re.I) or [None, "normal"])[1].strip()
        pente = (re.search(r"font-style\s*:\s*([^;]+)", corps, re.I) or [None, "normal"])[1].strip()
        ligne_html = texte.count("\n", 0, bloc.start()) + 1
        for d in RX_DATA.finditer(corps):
            n += 1
            declaree = f"{famille} {graisse} {pente}"
            partie = f"ligne {ligne_html} (@font-face {famille}, {d.group('mime')})"
            entree = {"ligne": {"partie": partie, "declaree": declaree}, "police": None}
            rapport["polices"].append(entree["ligne"])
            try:
                octets = base64.b64decode(re.sub(r"\s+", "", d.group("b64")), validate=True)
            except (binascii.Error, ValueError) as e:
                entree["ligne"].update(etat="FAIL", motif=f"base64 illisible : {e}")
                rapport["constats"].append({"regle": "E0", "partie": partie, "police": declaree,
                                            "constat": f"données base64 de la police illisibles ({str(e)[:80]}) : police indécodable par le navigateur"})
                continue
            entree["ligne"]["octets"] = len(octets)
            if octets[:4] == b"wOF2":
                try:
                    import brotli  # noqa: F401 — fontTools en a besoin pour décompresser un WOFF2
                except ImportError:
                    entree["ligne"]["etat"] = "NON_JUGEE"
                    rapport["non_juge"].append(f"{partie} : WOFF2 non décompressé, module brotli absent (pip install brotli) — E0, E1 et E2 non jouées")
                    continue
            if decoder_sfnt(entree, octets, "police décodée (WOFF2, WOFF ou sfnt)"):
                entrees.append(entree)
    if not n:
        rapport.update(verdict="SKIP", motif="aucune police embarquée en data: dans une règle @font-face : domaine sans objet")
        sortir(rapport, 2)
    return entrees


entrees = {"pptx": lire_pptx, "docx": lire_docx, "pdf": lire_pdf, "html": lire_html}[rapport["type"]]()
sources = index_reference({e["ligne"].get("famille") for e in entrees if e["ligne"].get("famille")})
for entree in entrees:
    rapport["constats"].extend(juger(entree, sources))
bloquants = [c for c in rapport["constats"] if c.get("sev", "bloquant") == "bloquant"]
rapport["verdict"] = "FAIL" if bloquants else "PASS"
sortir(rapport, 1 if bloquants else 0)
