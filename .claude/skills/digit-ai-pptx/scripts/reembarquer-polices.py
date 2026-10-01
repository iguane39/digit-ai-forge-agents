#!/usr/bin/env python3
# reembarquer-polices.py — réencode hors PowerPoint les polices EMBARQUÉES d'un PPTX (TF-1502, 01/10/2026).
#
# LE FAIT (lot de retours du 30/09/2026, RA-02 et RA-03). PowerPoint embarque une police par le
# composant de Windows t2embed.dll (TTEmbedFont, sous-ensemble compressé MTX). Ce jour-là, la table
# du codage en triplets de ce composant était altérée dans la mémoire du processus PowerPoint que tous
# les exports réutilisaient : cinq versions d'un deck sont sorties avec huit polices embarquées
# fausses, texte en éclats sur tout poste qui n'a pas la police. Un processus neuf encode juste.
#
# LA MÉTHODE est celle de l'outil écrit par le produit qui a payé le défaut, portée sans nom, sans
# deck ni rapport. Pour chaque partie ppt/fonts/*.fntdata : lire famille, graisse, pente et version
# dans l'en-tête EOT, retrouver la police source, redemander à TTEmbedFont, dans CE processus, la
# liste de caractères de la présentation, puis remplacer la partie. Les autres parties du paquet sont
# recopiées octet pour octet. Mesure du produit : sur un deck sain, 8 flux réencodés sur 8 identiques
# octet pour octet à ceux de PowerPoint.
#
# IL N'ÉCRIT RIEN quand la sortie existe déjà, quand une police source manque ou n'est pas de la même
# version que la copie embarquée, quand GDI ne sélectionne pas la police source, quand un glyphe est
# perdu ou quand un contour réencodé diffère de la police source. Il répare, il ne juge pas : le juge
# qui suit est oracle-polices-embarquees, du skill voisin quality-oracles.
#
# Usage : python reembarquer-polices.py <entrée.pptx> <sortie.pptx | --comparer> [--polices <dossier>]
#   --polices   le dossier des polices SOURCES, à la place de celles du poste : une recette désigne sa
#               donnée (TF-0912). Chaque police retenue y est chargée en privé, pour ce seul processus.
#   --comparer  réencode sans rien écrire, et dit si chaque flux est identique octet pour octet.
# Sortie : un rapport JSON sur stdout, une ligne par police sur stderr.
# Codes : 0 fait (ou comparaison identique), 1 refus ou écart, 2 rien à faire (aucune police
# embarquée) ou prérequis absent (Windows, fontTools).
import io
import json
import os
import re
import struct
import sys
import zipfile

FORMAT = "digit-ai-pptx/reembarquer-polices@1"
VERSION = "1.0.0"
EXTENSIONS_SOURCE = (".ttf", ".ttc")
PROFONDEUR_INDEX = 4

for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

args = sys.argv[1:]


def argument(nom):
    return args[args.index(nom) + 1] if nom in args and args.index(nom) + 1 < len(args) else None


dossier_polices = argument("--polices")
comparer = "--comparer" in args
positionnels = [a for i, a in enumerate(args) if not a.startswith("--") and not (i > 0 and args[i - 1] == "--polices")]
entree = positionnels[0] if positionnels else None
sortie = None if comparer else (positionnels[1] if len(positionnels) > 1 else None)
rapport = {"format": FORMAT, "version": VERSION, "entree": os.path.basename(entree or ""),
           "sortie": os.path.basename(sortie) if sortie else None, "comparer": comparer,
           "etat": None, "motif": None, "polices": []}


def sortir(etat, code, motif=None):
    rapport.update(etat=etat, motif=motif)
    sys.stdout.write(json.dumps(rapport, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(code)


if not entree or not (comparer or sortie):
    sortir("non-joue", 2, "usage : reembarquer-polices.py <entrée.pptx> <sortie.pptx | --comparer> [--polices <dossier>]")
if not os.path.isfile(entree):
    sortir("non-joue", 2, f"entrée absente : {entree}")
if sortie and os.path.exists(sortie):
    sortir("refus", 1, f"la sortie existe déjà ({sortie}) : ce script n'écrase aucun fichier")
if dossier_polices and not os.path.isdir(dossier_polices):
    sortir("non-joue", 2, f"dossier de polices sources introuvable : {dossier_polices}")
if os.name != "nt":
    sortir("non-joue", 2, "TTEmbedFont vit dans t2embed.dll, sous Windows seulement : réencodage impossible sur ce poste")
try:
    from fontTools.ttLib import TTCollection, TTFont
except ImportError:
    sortir("non-joue", 2, "fontTools introuvable dans cet interpréteur : pip install fonttools, ou uv run --with fonttools")

try:
    with zipfile.ZipFile(entree) as z:
        infos = z.infolist()
        contenus = {i.filename: z.read(i.filename) for i in infos}
except (zipfile.BadZipFile, OSError) as e:
    sortir("refus", 1, f"paquet illisible : {e}")
parties = sorted((n for n in contenus if re.match(r"ppt/fonts/[^/]+\.fntdata$", n)),
                 key=lambda n: (int(re.sub(r"\D", "", n) or 0), n))
if not parties:
    sortir("aucune", 2, "aucune police embarquée (pas de partie ppt/fonts/*.fntdata) : rien à réencoder")

import ctypes  # noqa: E402 — Windows seulement, vérifié ci-dessus
from ctypes import wintypes  # noqa: E402

ECRIT = ctypes.CFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)
LIT = ctypes.CFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)
t2, gdi = ctypes.WinDLL("t2embed.dll"), ctypes.WinDLL("gdi32.dll")
t2.TTEmbedFont.restype = ctypes.c_long
t2.TTEmbedFont.argtypes = [wintypes.HDC, ctypes.c_ulong, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
                           ECRIT, ctypes.c_void_p, ctypes.POINTER(ctypes.c_ushort), ctypes.c_ushort, ctypes.c_ushort, ctypes.c_void_p]
t2.TTLoadEmbeddedFont.restype = ctypes.c_long
t2.TTLoadEmbeddedFont.argtypes = [ctypes.POINTER(wintypes.HANDLE), ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_ulong,
                                  ctypes.POINTER(ctypes.c_ulong), LIT, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_char_p, ctypes.c_void_p]
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
gdi.GetTextFaceW.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_wchar_p]
gdi.AddFontResourceExW.restype = ctypes.c_int
gdi.AddFontResourceExW.argtypes = [ctypes.c_wchar_p, wintypes.DWORD, ctypes.c_void_p]
gdi.DeleteObject.argtypes = [wintypes.HGDIOBJ]
gdi.DeleteDC.argtypes = [wintypes.HDC]
FR_PRIVATE = 0x10


# ---- l'en-tête EOT (spécification W3C « Embedded OpenType », versions 0x00020001 et 0x00020002)
def entete_eot(b):
    if len(b) < 82 or struct.unpack_from("<H", b, 34)[0] != 0x504C:
        return None
    drapeaux = struct.unpack_from("<I", b, 12)[0]
    italique, graisse = b[27], struct.unpack_from("<I", b, 28)[0]
    pos, noms = 82, []
    for _ in range(4):
        if pos + 2 > len(b):
            return None
        n = struct.unpack_from("<H", b, pos)[0]
        noms.append(b[pos + 2:pos + 2 + n].decode("utf-16-le", "replace").strip("\x00 "))
        pos += 2 + n + 2
    return {"famille": noms[0], "style": noms[1], "version": noms[2], "drapeaux": drapeaux, "graisse": graisse, "italique": bool(italique)}


# ---- décodage par le décodeur de Windows, police chargée en privé (rien n'est installé)
def decoder(eot, nom_prive):
    etat = {"pos": 0}

    def lire(_flux, tampon, n):
        bloc = eot[etat["pos"]:etat["pos"] + n]
        ctypes.memmove(tampon, bloc, len(bloc))
        etat["pos"] += len(bloc)
        return len(bloc)

    rappel = LIT(lire)
    ref, priv, statut = wintypes.HANDLE(), ctypes.c_ulong(0), ctypes.c_ulong(0)
    # TTLOAD_PRIVATE (0x1) et LICENSE_PREVIEWPRINT (0x4) : les drapeaux de l'appel du produit et du juge
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
        return TTFont(io.BytesIO(tampon.raw[:lu]), lazy=False), None
    finally:
        t2.TTDeleteEmbeddedFont(ref, 0, ctypes.byref(ctypes.c_ulong(0)))


# ---- les polices SOURCES : celles du poste, ou le dossier désigné par --polices
def dossiers_sources():
    if dossier_polices:
        return [dossier_polices]
    local = os.environ.get("LOCALAPPDATA", "")
    return [os.path.join(local, "Microsoft", "Windows", "Fonts"), os.path.join(local, "Microsoft", "FontCache", "4", "CloudFonts"),
            os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]


def index_sources(familles):
    """(famille, graisse, pente) -> (chemin, rang dans une collection), pour les seules familles cherchées."""
    index = {}
    for racine in dossiers_sources():
        if not os.path.isdir(racine):
            continue
        base = racine.rstrip("\\/").count(os.sep)
        for dossier, sous, fichiers in os.walk(racine):
            if dossier.count(os.sep) - base >= PROFONDEUR_INDEX:
                sous[:] = []
            for nom in sorted(fichiers):
                if not nom.lower().endswith(EXTENSIONS_SOURCE):
                    continue
                chemin = os.path.join(dossier, nom)
                try:
                    polices = TTCollection(chemin, lazy=True).fonts if nom.lower().endswith(".ttc") else [TTFont(chemin, lazy=True)]
                except Exception:  # noqa: BLE001 — un fichier illisible n'est pas une source
                    continue
                for rang, f in enumerate(polices):
                    try:
                        fam = (f["name"].getDebugName(1) or "").strip()
                        if fam in familles:  # le style de l'en-tête EOT est localisé (« Gras ») : la graisse et la pente ne le sont pas
                            index.setdefault((fam, f["OS/2"].usWeightClass, bool(f["head"].macStyle & 2)), (chemin, rang))
                    except Exception:  # noqa: BLE001
                        continue
    return index


# ---- réencodage : TTEmbedFont dans CE processus, sur la police source sélectionnée par GDI
def selectionner(hdc, e, chemin):
    face = ctypes.create_unicode_buffer(64)
    gdi.SelectObject(hdc, gdi.CreateFontW(-48, 0, 0, 0, e["graisse"], 1 if e["italique"] else 0, 0, 0, 1, 0, 0, 0, 0, e["famille"]))
    gdi.GetTextFaceW(hdc, 64, face)
    return face.value == e["famille"] and gdi.GetFontData(hdc, 0, 0, None, 0) == os.path.getsize(chemin), face.value


def encoder(e, chemin, codes):
    hdc = gdi.CreateCompatibleDC(None)
    if dossier_polices:  # la source désignée est chargée AVANT la sélection : c'est elle que GDI doit retenir
        gdi.AddFontResourceExW(chemin, FR_PRIVATE, None)
    ok, retenue = selectionner(hdc, e, chemin)
    if not ok and not dossier_polices:  # police absente de GDI (police du nuage d'Office) : chargée pour ce seul processus
        gdi.AddFontResourceExW(chemin, FR_PRIVATE, None)
        ok, retenue = selectionner(hdc, e, chemin)
    if not ok:
        return None, (f"GDI ne sélectionne pas {e['famille']} graisse {e['graisse']}{' italique' if e['italique'] else ''} "
                      f"depuis {os.path.basename(chemin)} (police retenue : {retenue})")
    morceaux = []

    def ecrire(_flux, tampon, n):
        morceaux.append(ctypes.string_at(tampon, n))
        return n

    rappel = ECRIT(ecrire)
    tableau = (ctypes.c_ushort * len(codes))(*codes)
    priv, statut = ctypes.c_ulong(0), ctypes.c_ulong(0)
    sous_ensemble = bool(e["drapeaux"] & 0x1)
    # les drapeaux de l'en-tête EOT sont ceux de l'appel d'origine (TTEMBED_SUBSET 0x1, TTEMBED_TTCOMPRESSED 0x4) ;
    # jeu de caractères Unicode (1), la liste demandée seulement pour un sous-ensemble
    code = t2.TTEmbedFont(hdc, e["drapeaux"], 1, ctypes.byref(priv), ctypes.byref(statut), rappel, None,
                          tableau if sous_ensemble else None, len(codes) if sous_ensemble else 0, 0, None)
    gdi.DeleteDC(hdc)
    if code != 0:
        return None, f"TTEmbedFont a rendu 0x{code & 0xFFFFFFFF:04x} pour {e['famille']}"
    return b"".join(morceaux), None


# ---- ce qui se compare : glyphes pleins et contours, aux MÊMES indices que la police source
def glyphes_pleins(police):
    return {i for i, nom in enumerate(police.getGlyphOrder()) if police["glyf"][nom].numberOfContours != 0}


def contours_faux(decodee, source):
    ge, gs = decodee["glyf"], source["glyf"]
    oe, os_ = decodee.getGlyphOrder(), source.getGlyphOrder()
    rang_e, rang_s = {n: i for i, n in enumerate(oe)}, {n: i for i, n in enumerate(os_)}
    faux = 0
    for i, nom in enumerate(oe):
        a = ge[nom]
        if a.numberOfContours == 0 or i >= len(os_):
            continue  # glyphe vidé par le sous-ensemble, ou absent de la source
        b = gs[os_[i]]
        if a.isComposite():
            ca = [(rang_e.get(c.glyphName), c.x, c.y) for c in a.components]
            cb = [(rang_s.get(c.glyphName), c.x, c.y) for c in b.components] if b.isComposite() else None
            faux += ca != cb
        else:
            faux += b.numberOfContours <= 0 or list(a.coordinates) != list(b.coordinates) or list(a.endPtsOfContours) != list(b.endPtsOfContours)
    return faux


def ouvrir_source(chemin, rang):
    return TTCollection(chemin, lazy=False).fonts[rang] if chemin.lower().endswith(".ttc") else TTFont(chemin, lazy=False)


# ---- les vérifications qui précèdent tout réencodage : rien n'est tenté si l'une échoue
entetes = {n: entete_eot(contenus[n]) for n in parties}
non_eot = [n for n, e in entetes.items() if e is None]
if non_eot:
    sortir("refus", 1, "partie de police qui n'est pas un flux EOT (nombre magique 0x504C absent) : " + ", ".join(non_eot))
sources = index_sources({e["famille"] for e in entetes.values()})
cle = lambda e: (e["famille"], e["graisse"], e["italique"])  # noqa: E731
nom = lambda e: f"{e['famille']} {e['style']}".strip()  # noqa: E731
absentes = [nom(e) for e in entetes.values() if cle(e) not in sources]
if absentes:
    sortir("refus", 1, f"police source absente ({' · '.join(dossiers_sources())}) pour : " + ", ".join(absentes))
collections = [nom(e) for e in entetes.values() if sources[cle(e)][0].lower().endswith(".ttc")]
if collections:
    sortir("refus", 1, "police source dans une collection .ttc, que GDI ne rend pas fichier par fichier : réencodage non mesuré, refusé pour : "
           + ", ".join(collections))
# une autre version de la police n'a pas les mêmes glyphes aux mêmes indices : la réparation ne s'y risque pas
autres = []
for e in entetes.values():
    v = (TTFont(sources[cle(e)][0], lazy=True)["name"].getDebugName(5) or "").strip()
    if v != e["version"]:
        autres.append(f"{nom(e)} (source : {v}, embarquée : {e['version']})")
if autres:
    sortir("refus", 1, "version de police différente entre la source et la copie embarquée pour : " + ", ".join(autres))

anciennes = {}
for i, n in enumerate(parties):
    police, erreur = decoder(contenus[n], f"Reemb{os.getpid()}a{i}")
    if erreur:
        sortir("refus", 1, f"{nom(entetes[n])} : copie embarquée illisible par le décodeur ({erreur}), sa liste de caractères est perdue")
    anciennes[n] = police
# PowerPoint demande à l'encodeur la MÊME liste de caractères pour chaque police : ceux de la présentation. La
# table cmap d'une copie embarquée garde en plus les caractères des glyphes tirés par les substitutions de la
# police : la liste redemandée est donc celle que toutes les copies ont en commun (mesure du produit).
codes = sorted(set.intersection(*({c for c in a.getBestCmap() if c <= 0xFFFF} for a in anciennes.values())))
if not codes:
    sortir("refus", 1, "aucun caractère commun aux copies embarquées : la liste de caractères de la présentation n'est pas retrouvée")

ecart = False
neufs = {}
for i, n in enumerate(parties):
    e = entetes[n]
    chemin, rang = sources[cle(e)]
    source = ouvrir_source(chemin, rang)
    if "glyf" not in source or "glyf" not in anciennes[n]:
        sortir("refus", 1, f"{nom(e)} : contours non TrueType (pas de table glyf), réencodage non mesuré")
    neuf, erreur = encoder(e, chemin, codes)
    if erreur:
        sortir("refus", 1, erreur)
    nouvelle, erreur = decoder(neuf, f"Reemb{os.getpid()}b{i}")
    if erreur:
        sortir("refus", 1, f"{nom(e)} : copie réencodée illisible par le décodeur ({erreur})")
    ligne = {"partie": n, "police": nom(e), "source": os.path.basename(chemin), "caracteres": len(codes),
             "octets_avant": len(contenus[n]), "octets_apres": len(neuf), "identique_octet_pour_octet": neuf == contenus[n],
             "glyphes_perdus": len(glyphes_pleins(anciennes[n]) - glyphes_pleins(nouvelle)),
             "contours_faux_avant": contours_faux(anciennes[n], source), "contours_faux_apres": contours_faux(nouvelle, source)}
    ecart = ecart or ligne["glyphes_perdus"] > 0 or ligne["contours_faux_apres"] > 0 or (comparer and not ligne["identique_octet_pour_octet"])
    rapport["polices"].append(ligne)
    neufs[n] = neuf
    sys.stderr.write(f"{ligne['police']:28} caractères {ligne['caracteres']} | octets {ligne['octets_avant']} -> {ligne['octets_apres']}"
                     f" | identique {ligne['identique_octet_pour_octet']} | glyphes perdus {ligne['glyphes_perdus']}"
                     f" | contours faux {ligne['contours_faux_avant']} -> {ligne['contours_faux_apres']}\n")

if ecart:
    if comparer:
        sortir("ecart", 1, "au moins un flux réencodé diffère du flux d'origine")
    sortir("refus", 1, "écart constaté après réencodage (glyphe perdu ou contour différent de la source) : rien n'est écrit")
if comparer:
    sortir("identique", 0, f"{len(parties)} flux réencodé(s) sur {len(parties)} identique(s) octet pour octet")
try:
    zo = zipfile.ZipFile(sortie, "x")  # « x » : la création échoue si un autre a écrit ce chemin entre-temps
except FileExistsError:
    sortir("refus", 1, f"la sortie existe déjà ({sortie}) : ce script n'écrase aucun fichier")
except OSError as e:
    sortir("refus", 1, f"écriture de la sortie impossible : {e}")
try:
    with zo:
        for info in infos:
            zo.writestr(info, neufs.get(info.filename, contenus[info.filename]))
except Exception as e:  # noqa: BLE001 — une sortie à moitié écrite par ce script ne reste pas
    try:
        os.remove(sortie)
    except OSError:
        pass
    sortir("refus", 1, f"écriture de la sortie impossible : {e}")
sortir("reencodees", 0, f"{len(parties)} police(s) réencodée(s) hors PowerPoint, autres parties recopiées octet pour octet")
