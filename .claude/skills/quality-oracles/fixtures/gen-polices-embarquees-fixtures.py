#!/usr/bin/env python3
# Génération scriptée des fixtures de l'oracle des polices EMBARQUÉES (TF-1501, 01/10/2026).
# Tout est FICTIF : la police « Essai Fictif » (17 glyphes polygonaux) est construite ici avec
# fontTools ; aucun deck, aucune police ni aucun rapport du produit qui a payé le défaut n'est repris.
#   polices-embarquees-sources/EssaiFictif-Regular.ttf  la police de RÉFÉRENCE d'E1 (« installée »),
#                                                       désignée par --polices au manifest (TF-0912) ;
#   polices-embarquees-green.pptx  un deck d'une diapositive, la police saine embarquée ;
#   polices-embarquees-red.pptx    le MÊME deck, dont la police embarquée a 5 glyphes sur 17 aux
#                                  contours déplacés hors de la boîte englobante que la police
#                                  déclare : les deux symptômes mesurés chez le produit (contours
#                                  différents de la police installée, glyphes hors de la boîte).
# L'embarquement est celui de PowerPoint : TTEmbedFont de t2embed.dll, sous-ensemble compressé MTX
# (drapeaux 0x5), dans un processus par police chargée en privé. D'où les prérequis de ce
# générateur : Windows et fontTools — `uv run --with fonttools python -B gen-polices-embarquees-fixtures.py`.
# Les deux decks ne diffèrent que par leur partie ppt/fonts/font1.fntdata.
import ctypes
import os
import subprocess
import sys
import tempfile
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(ICI, "polices-embarquees-sources")
FAMILLE = "Essai Fictif"
TEXTE = "Essai de polices embarquées"
HORODATAGE = 3842294400  # 2025-10-01 00:00:00, en secondes depuis 1904 : une police rejouée ne change pas d'octets
DATE_ZIP = (2026, 10, 1, 0, 0, 0)


def construire_police(chemin, altere):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    chars = sorted(set(TEXTE) - {" "})
    noms = [".notdef", "space"] + [f"uni{ord(c):04X}" for c in chars]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(noms)
    fb.setupCharacterMap({32: "space", **{ord(c): f"uni{ord(c):04X}" for c in chars}})
    glyphes = {}
    for i, nom in enumerate(noms):
        pen = TTGlyphPen(None)
        if nom != "space":
            k = i * 13 % 200
            pts = [(50, 0), (550, 0), (550, 600 + k), (300, 700), (50, 600 - k // 2)]
            if altere and i % 3 == 0 and nom != ".notdef":
                pts = [(x, y * 2 + 300) for (x, y) in pts]  # contours déplacés, sortis de la boîte déclarée
            pen.moveTo(pts[0])
            for p in pts[1:]:
                pen.lineTo(p)
            pen.closePath()
        glyphes[nom] = pen.glyph()
    fb.setupGlyf(glyphes)
    fb.setupHorizontalMetrics({n: (600, 50) for n in noms})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": FAMILLE, "styleName": "Regular", "uniqueFontIdentifier": "EssaiFictif-Regular 1.000",
                       "fullName": FAMILLE + " Regular", "psName": "EssaiFictif-Regular", "version": "Version 1.000"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0, usWeightClass=400, fsSelection=0x40)
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000, created=HORODATAGE, modified=HORODATAGE)
    police = fb.font
    police.recalcTimestamp = False
    if altere:
        # la boîte déclarée reste celle de la police saine : c'est elle que la copie fausse dépasse
        from fontTools.ttLib import TTFont
        saine = TTFont(os.path.join(SOURCES, "EssaiFictif-Regular.ttf"))
        for k in ("xMin", "yMin", "xMax", "yMax"):
            setattr(police["head"], k, getattr(saine["head"], k))
        police.recalcBBoxes = False
    police.save(chemin)


def embarquer(ttf, eot):
    """TTEmbedFont dans CE processus, la police chargée en privé : l'appel de PowerPoint."""
    from ctypes import wintypes
    ecrit = ctypes.CFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)
    t2, gdi = ctypes.WinDLL("t2embed.dll"), ctypes.WinDLL("gdi32.dll")
    t2.TTEmbedFont.restype = ctypes.c_long
    t2.TTEmbedFont.argtypes = [wintypes.HDC, ctypes.c_ulong, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
                               ecrit, ctypes.c_void_p, ctypes.POINTER(ctypes.c_ushort), ctypes.c_ushort, ctypes.c_ushort, ctypes.c_void_p]
    gdi.CreateCompatibleDC.restype = wintypes.HDC
    gdi.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi.CreateFontW.restype = wintypes.HFONT
    gdi.CreateFontW.argtypes = [ctypes.c_int] * 5 + [wintypes.DWORD] * 8 + [ctypes.c_wchar_p]
    gdi.SelectObject.restype = wintypes.HGDIOBJ
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
    gdi.GetTextFaceW.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_wchar_p]
    gdi.GetFontData.restype = wintypes.DWORD
    gdi.GetFontData.argtypes = [wintypes.HDC, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
    gdi.AddFontResourceExW.restype = ctypes.c_int
    gdi.AddFontResourceExW.argtypes = [ctypes.c_wchar_p, wintypes.DWORD, ctypes.c_void_p]
    if gdi.AddFontResourceExW(ttf, 0x10, None) != 1:  # FR_PRIVATE
        sys.exit(f"refus : GDI ne charge pas {ttf}")
    hdc = gdi.CreateCompatibleDC(None)
    gdi.SelectObject(hdc, gdi.CreateFontW(-48, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, FAMILLE))
    face = ctypes.create_unicode_buffer(64)
    gdi.GetTextFaceW(hdc, 64, face)
    if face.value != FAMILLE or gdi.GetFontData(hdc, 0, 0, None, 0) != os.path.getsize(ttf):
        sys.exit(f"refus : GDI sélectionne « {face.value} » au lieu de la police chargée")
    morceaux = []

    def ecrire(_flux, tampon, n):
        morceaux.append(ctypes.string_at(tampon, n))
        return n

    rappel = ecrit(ecrire)
    codes = sorted({ord(c) for c in TEXTE})
    tableau = (ctypes.c_ushort * len(codes))(*codes)
    priv, statut = ctypes.c_ulong(0), ctypes.c_ulong(0)
    # TTEMBED_SUBSET | TTEMBED_TTCOMPRESSED, jeu de caractères Unicode : l'appel d'un export « polices incorporées, sous-ensemble »
    code = t2.TTEmbedFont(hdc, 0x5, 1, ctypes.byref(priv), ctypes.byref(statut), rappel, None, tableau, len(codes), 0, None)
    if code != 0:
        sys.exit(f"refus : TTEmbedFont a rendu 0x{code & 0xFFFFFFFF:04x}")
    with open(eot, "wb") as f:
        f.write(b"".join(morceaux))


NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT = "application/vnd.openxmlformats-officedocument.presentationml"
ARBRE_VIDE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'


def rels(*liens):
    corps = "".join(f'<Relationship Id="rId{i + 1}" Type="{R}/{t}" Target="{c}"/>' for i, (t, c) in enumerate(liens))
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{corps}</Relationships>'


def theme():
    couleurs = "".join(f"<a:{n}><a:srgbClr val=\"{v}\"/></a:{n}>" for n, v in (
        ("dk1", "000000"), ("lt1", "FFFFFF"), ("dk2", "1F2937"), ("lt2", "F3F4F6"), ("accent1", "2563EB"), ("accent2", "059669"),
        ("accent3", "D97706"), ("accent4", "DC2626"), ("accent5", "7C3AED"), ("accent6", "0891B2"), ("hlink", "2563EB"), ("folHlink", "7C3AED")))
    polices = f'<a:latin typeface="{FAMILLE}"/><a:ea typeface=""/><a:cs typeface=""/>'
    trait = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    plein = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Essai"><a:themeElements>'
            f'<a:clrScheme name="Essai">{couleurs}</a:clrScheme>'
            f'<a:fontScheme name="Essai"><a:majorFont>{polices}</a:majorFont><a:minorFont>{polices}</a:minorFont></a:fontScheme>'
            f'<a:fmtScheme name="Essai"><a:fillStyleLst>{plein * 3}</a:fillStyleLst><a:lnStyleLst>{trait * 3}</a:lnStyleLst>'
            '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>'
            f'<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>{plein * 3}</a:bgFillStyleLst></a:fmtScheme>'
            '</a:themeElements></a:theme>')


def deck(chemin, eot):
    with open(eot, "rb") as f:
        police = f.read()
    parties = [
        ("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
         '<Default Extension="xml" ContentType="application/xml"/>'
         '<Default Extension="fntdata" ContentType="application/x-fontdata"/>'
         f'<Override PartName="/ppt/presentation.xml" ContentType="{CT}.presentation.main+xml"/>'
         f'<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="{CT}.slideMaster+xml"/>'
         f'<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="{CT}.slideLayout+xml"/>'
         f'<Override PartName="/ppt/slides/slide1.xml" ContentType="{CT}.slide+xml"/>'
         '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'),
        ("_rels/.rels", rels(("officeDocument", "ppt/presentation.xml"))),
        ("ppt/presentation.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation {NS} embedTrueTypeFonts="1" saveSubsetFonts="1">'
         '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
         '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
         f'<p:embeddedFontLst><p:embeddedFont><p:font typeface="{FAMILLE}" pitchFamily="2" charset="0"/><p:regular r:id="rId4"/></p:embeddedFont></p:embeddedFontLst>'
         '</p:presentation>'),
        ("ppt/_rels/presentation.xml.rels", rels(("slideMaster", "slideMasters/slideMaster1.xml"), ("slide", "slides/slide1.xml"),
                                                 ("theme", "theme/theme1.xml"), ("font", "fonts/font1.fntdata"))),
        ("ppt/slideMasters/slideMaster1.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster {NS}>'
         f'<p:cSld><p:spTree>{ARBRE_VIDE}</p:spTree></p:cSld>'
         '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" '
         'accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
         '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'),
        ("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels(("slideLayout", "../slideLayouts/slideLayout1.xml"), ("theme", "../theme/theme1.xml"))),
        ("ppt/slideLayouts/slideLayout1.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout {NS} type="blank" preserve="1">'
         f'<p:cSld name="Vide"><p:spTree>{ARBRE_VIDE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'),
        ("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels(("slideMaster", "../slideMasters/slideMaster1.xml"))),
        ("ppt/slides/slide1.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld {NS}><p:cSld><p:spTree>{ARBRE_VIDE}'
         '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Texte"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
         '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10363200" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
         f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="4000"><a:latin typeface="{FAMILLE}"/></a:rPr><a:t>{TEXTE}</a:t></a:r></a:p></p:txBody></p:sp>'
         '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'),
        ("ppt/slides/_rels/slide1.xml.rels", rels(("slideLayout", "../slideLayouts/slideLayout1.xml"))),
        ("ppt/theme/theme1.xml", theme()),
        ("ppt/fonts/font1.fntdata", police),
    ]
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        for nom, contenu in parties:
            info = zipfile.ZipInfo(nom, date_time=DATE_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu.encode("utf-8") if isinstance(contenu, str) else contenu)
    print("écrit :", os.path.relpath(chemin, ICI))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--embarquer":  # sous-processus : une police chargée par processus
        embarquer(sys.argv[2], sys.argv[3])
        sys.exit(0)
    if os.name != "nt":
        sys.exit("refus : l'embarquement MTX passe par t2embed.dll, Windows seulement")
    os.makedirs(SOURCES, exist_ok=True)
    saine = os.path.join(SOURCES, "EssaiFictif-Regular.ttf")
    construire_police(saine, altere=False)
    print("écrit :", os.path.relpath(saine, ICI))
    with tempfile.TemporaryDirectory() as tmp:
        fausse = os.path.join(tmp, "EssaiFictif-Regular-fausse.ttf")
        construire_police(fausse, altere=True)
        for nom, ttf in (("green", saine), ("red", fausse)):
            eot = os.path.join(tmp, f"{nom}.fntdata")
            subprocess.run([sys.executable, "-B", os.path.abspath(__file__), "--embarquer", ttf, eot], check=True)
            deck(os.path.join(ICI, f"polices-embarquees-{nom}.pptx"), eot)
