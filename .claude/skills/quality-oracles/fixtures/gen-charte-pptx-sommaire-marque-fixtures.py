#!/usr/bin/env python3
# Génération scriptée des fixtures de six règles d'oracle-charte-pptx-semantique (lot du 10/11/2026, retours du
# produit marketing des 09/11/2026 b et c). Tout est FICTIF. Rejouable : python -B gen-charte-pptx-sommaire-marque-fixtures.py
# (bibliothèque standard seule). Chaque paire rend le MÊME deck à un défaut près :
#
#   charte-pptx-pastille-{green,red}.pptx     TF-2324, TF-2356 : S1 prend pour intercalaire toute diapositive qui porte un
#                                             paragraphe réduit à un numéro. La verte porte une pastille « 1 » sur une
#                                             diapositive de CONTENU (fond clair, titre), la pagination « 02 / 6 » du
#                                             sommaire et un espace réservé de numéro ; ses deux intercalaires sont l'un sans
#                                             titre, l'autre à fond SOMBRE avec titre. La rouge ajoute un vrai intercalaire
#                                             « 03 » absent du sommaire : S1 doit le refuser, et lui seul.
#   charte-pptx-gabarit-b-{green,red}.pptx    TF-2325 : sommaire du gabarit B de digit-ai-propale, sections ouvertes par des
#                                             diapositives de contenu, AUCUN intercalaire. La verte numérote 01 à 03 ; la rouge
#                                             saute de 02 à 04.
#   charte-pptx-entites-{green,red}.pptx      TF-2323 : « &gt; », « &amp; », « &lt; » portent un point-virgule. La verte les
#                                             porte dans un chemin de menu, un sigle et une balise d'exemple ; la rouge y ajoute
#                                             une VRAIE liste en ligne « lot 1 ; lot 2 ; lot 3 », seule à devoir être refusée.
#   charte-pptx-kicker-{green,red}.pptx       TF-2375 : le kicker de couverture « PROPOSITION COMMERCIALE · 2026 » au-dessus du
#                                             titre de la diapositive 1. La rouge garde ce kicker (admis) et y ajoute une phrase
#                                             en minuscules au-dessus du titre de couverture et un kicker au-dessus du titre de
#                                             la diapositive 2 : deux refus.
#   charte-pptx-marque-{green,red}/           TF-2373 : le tableau « On dit / On ne dit pas » d'un MARQUE.md fictif, posé en
#       deck.pptx + donnees/marque/MARQUE.md  donnees/marque/ au-dessus du deck. La rouge emploie « limite » (3 fois, dont une
#                                             dans les notes), « risque » (réservé à une proposition) et « Phase » ; la verte
#                                             emploie les termes de la colonne « On dit ».
import os
import zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DATE_ZIP = (2026, 11, 10, 0, 0, 0)
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
HAUTEUR = 6858000


def forme(paras, y, ph=None, cx=9000000, cy=500000, x=100):
    phx = f'<p:ph type="{ph}"/>' if ph else ''
    corps = "".join(f'<a:p><a:r><a:t>{t}</a:t></a:r></a:p>' for t in paras)
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Forme"/><p:cNvSpPr/><p:nvPr>{phx}</p:nvPr></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm></p:spPr>'
            f'<p:txBody><a:bodyPr/>{corps}</p:txBody></p:sp>')


def pieds(n):
    return [forme(["Digit-AI · support fictif"], HAUTEUR - 450000, ph="ftr", cx=6000000),
            forme([str(n)], HAUTEUR - 450000, ph="sldNum", cx=600000)]


def ecrire_deck(chemin, diapos, fonds=None, notes=None):
    """diapos : liste de listes de formes ; fonds : {numéro de diapositive: 'RRGGBB'} ; notes : {numéro: texte}."""
    fonds, notes = fonds or {}, notes or {}
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        def w(nom, contenu):
            info = zipfile.ZipInfo(nom, date_time=DATE_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, contenu)
        w("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="xml" ContentType="application/xml"/></Types>')
        rels = "".join(f'<Relationship Id="rId{i + 1}" Target="slides/slide{i + 1}.xml"/>' for i in range(len(diapos)))
        w("ppt/_rels/presentation.xml.rels", f'<Relationships>{rels}</Relationships>')
        ids = "".join(f'<p:sldId id="{256 + i}" r:id="rId{i + 1}"/>' for i in range(len(diapos)))
        w("ppt/presentation.xml", f'<p:presentation {NS}><p:sldIdLst>{ids}</p:sldIdLst><p:sldSz cx="12192000" cy="{HAUTEUR}"/></p:presentation>')
        for i, formes in enumerate(diapos):
            n = i + 1
            bg = (f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{fonds[n]}"/></a:solidFill></p:bgPr></p:bg>' if n in fonds else '')
            w(f"ppt/slides/slide{n}.xml", f'<p:sld {NS}><p:cSld>{bg}<p:spTree>{"".join(formes)}</p:spTree></p:cSld></p:sld>')
            if n in notes:
                w(f"ppt/slides/_rels/slide{n}.xml.rels", f'<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide{n}.xml"/></Relationships>')
                w(f"ppt/notesSlides/notesSlide{n}.xml", f'<p:notes {NS}><p:cSld><p:spTree>{forme([notes[n]], 100000)}</p:spTree></p:cSld></p:notes>')
    print("écrit :", os.path.relpath(chemin, ICI))


def sommaire(entrees, n, pagination=None):
    formes = [forme(["Sommaire"], 500000, ph="title"), forme(entrees, 1500000)]
    if pagination:
        formes.append(forme([pagination], 5600000, cx=1200000))   # pagination en zone libre : n'est pas une entrée
    return formes + pieds(n)


def contenu(titre, corps, n, extra=None):
    return [forme([titre], 400000, ph="title")] + [forme(c, 1500000 + 700000 * k) for k, c in enumerate(corps)] + (extra or []) + pieds(n)


def couverture(titre="Support fictif"):
    return [forme([titre], 2000000, ph="ctrTitle")]


# ---- S1 : pastille numérotée (TF-2324, TF-2356) ------------------------------------------------------------------
def pastille(rouge):
    diapos = [couverture(),
              sommaire(["01 Contexte", "02 Proposition"], 2, pagination="02 / 6"),
              # intercalaire 01 : sans titre de contenu (forme historique)
              [forme(["01"], 2000000), forme(["Contexte"], 3000000)] + pieds(3),
              # diapositive de CONTENU : titre, fond clair, une pastille « 1 » dans une zone libre
              contenu("Trois enjeux", [["Enjeu métier"]], 4, extra=[forme(["1"], 1500000, cx=500000, x=9500000)]),
              # intercalaire 02 : fond SOMBRE, avec un titre (la forme que S1 doit encore reconnaître)
              [forme(["Proposition"], 500000, ph="title"), forme(["02"], 2000000), forme(["Proposition"], 3000000)] + pieds(5)]
    fonds = {5: "0F172A"}
    if rouge:   # un vrai intercalaire dont le sommaire ne parle pas
        diapos.append([forme(["03"], 2000000), forme(["Chiffrage"], 3000000)] + pieds(6))
    ecrire_deck(os.path.join(ICI, f"charte-pptx-pastille-{'red' if rouge else 'green'}.pptx"), diapos, fonds=fonds)


# ---- S1 : gabarit B, sommaire sans intercalaire (TF-2325) ---------------------------------------------------------
def gabarit_b(rouge):
    entrees = ["01 Contexte et enjeux", "02 Notre réponse", "04 Planning"] if rouge else ["01 Contexte et enjeux", "02 Notre réponse", "03 Planning"]
    diapos = [couverture("Reprenez le contrôle de vos emails"),
              sommaire(entrees, 2, pagination="02 / 5"),
              contenu("Une gestion freinée par le volume", [["Quatre douleurs"]], 3),
              contenu("Traiter les emails plus vite", [["Ce que fait l'agent"]], 4),
              contenu("Deux semaines par lot", [["Cadrage, lot 1, lot 2"]], 5)]
    ecrire_deck(os.path.join(ICI, f"charte-pptx-gabarit-b-{'red' if rouge else 'green'}.pptx"), diapos)


# ---- S7 (et S5, S8) : les entités XML décodées avant les règles de texte (TF-2323) ---------------------------------
def entites(rouge):
    corps = [["Menu Fichier &gt; Ouvrir &gt; Récent &gt; Mes documents"],
             ["Questions &amp; réponses &amp; support &amp; suivi"],
             ["Balise d'exemple &lt;titre&gt; et &lt;corps&gt;"]]
    if rouge:
        corps.append(["Lot 1 ; lot 2 ; lot 3"])
    diapos = [couverture(), contenu("Repères de lecture", corps, 2)]
    ecrire_deck(os.path.join(ICI, f"charte-pptx-entites-{'red' if rouge else 'green'}.pptx"), diapos)


# ---- S2 : le kicker de couverture (TF-2375) ------------------------------------------------------------------------
def kicker(rouge):
    cover = [forme(["PROPOSITION COMMERCIALE · 2026"], 1200000, cx=6000000), forme(["Reprenez le contrôle"], 2000000, ph="ctrTitle")]
    suite = contenu("Le contexte", [["Corps"]], 2)
    if rouge:
        cover.insert(1, forme(["Une phrase placée au-dessus du titre de couverture"], 1300000, cx=6000000))
        suite = [forme(["NOTRE CONVICTION"], 200000, cx=6000000), forme(["Le contexte"], 1000000, ph="title"), forme(["Corps"], 2000000)] + pieds(2)
    ecrire_deck(os.path.join(ICI, f"charte-pptx-kicker-{'red' if rouge else 'green'}.pptx"), [cover, suite])


# ---- S5 : le vocabulaire proscrit par la marque (TF-2373) ----------------------------------------------------------
MARQUE_MD = """# Marque fictive

Fixture de recette : un tableau « On dit / On ne dit pas » comme celui d'un dossier de marque.

| On dit | On ne dit pas | Pourquoi |
|---|---|---|
| point de vigilance | risque (dans une proposition), limite | il porte sa parade |
| lot | phase, sprint | un lot est utile, utilisable, utilisé |
| agent | assistant, bot | un agent fait des choses qu'on peut lister |
"""


def marque(rouge):
    dossier = os.path.join(ICI, f"charte-pptx-marque-{'red' if rouge else 'green'}")
    os.makedirs(os.path.join(dossier, "donnees", "marque"), exist_ok=True)
    with open(os.path.join(dossier, "donnees", "marque", "MARQUE.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(MARQUE_MD)
    if rouge:
        corps = [["Limite du périmètre et limite de budget"], ["Un risque assumé"], ["Phase de cadrage"]]
        notes = {2: "Rappeler la limite de la première version."}
    else:
        corps = [["Point de vigilance sur le périmètre, sur le temps et sur le budget"], ["Un agent assume la reprise"], ["Lot de cadrage"]]
        notes = {2: "Rappeler le point de vigilance de la première version."}
    diapos = [couverture(), contenu("Cadrage du lot", corps, 2)]
    ecrire_deck(os.path.join(dossier, "deck.pptx"), diapos, notes=notes)


for rouge in (False, True):
    pastille(rouge)
    gabarit_b(rouge)
    entites(rouge)
    kicker(rouge)
    marque(rouge)
