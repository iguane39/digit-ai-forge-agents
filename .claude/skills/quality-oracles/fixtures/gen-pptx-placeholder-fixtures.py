#!/usr/bin/env python3
# Génération scriptée des fixtures de l'espace réservé VIDE d'oracle-pptx (TF-2599, rejouable).
# Trois .pptx minimaux de deux diapositives, [Content_Types].xml en première entrée, sans JPEG ni transition,
# jugés sous le profil GÉNÉRIQUE (profils/generique.json) :
#   rouge  = la couverture porte un espace réservé de titre (`<p:ph type="ctrTitle"/>`) VIDE, le titre étant posé en
#            zone libre à côté (le défaut mesuré le 12/11/2026 : PowerPoint affiche « Cliquez pour ajouter un titre »
#            par-dessus), et un espace réservé de titre vide sur la diapositive 2 ;
#   verte  = les mêmes diapositives, les espaces réservés de titre REMPLIS (premier remède du message) ;
#   retire = les mêmes diapositives, l'espace réservé vide RETIRÉ de la diapositive, le titre en zone libre (second
#            remède du message).
# Les trois portent aussi un pied de page, un numéro et une date VIDES (`ftr`, `sldNum`, `dt`) : ils sont exemptés,
# la rouge ne peut donc échouer que par les espaces réservés de titre.
import zipfile, os

HERE = os.path.dirname(os.path.abspath(__file__))
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')


def forme(ident, nom, texte=None, ph=None):
    """Une forme <p:sp> ; `ph` = type d'espace réservé, `texte` None = corps vide."""
    nvpr = f'<p:nvPr><p:ph type="{ph}"/></p:nvPr>' if ph else '<p:nvPr/>'
    run = (f'<a:p><a:r><a:rPr lang="fr-FR"/><a:t>{texte}</a:t></a:r></a:p>' if texte
           else '<a:p><a:endParaRPr lang="fr-FR"/></a:p>')
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{ident}" name="{nom}"/><p:cNvSpPr/>{nvpr}</p:nvSpPr>'
            f'<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{run}</p:txBody></p:sp>')


def diapo(formes):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<p:sld {NS}><p:cSld><p:spTree>{"".join(formes)}</p:spTree></p:cSld></p:sld>')


def pied(debut):
    # pied de page, numéro et date VIDES : exemptés par la règle
    return [forme(debut, "Pied", ph="ftr"), forme(debut + 1, "Numéro", ph="sldNum"), forme(debut + 2, "Date", ph="dt")]


def build(chemin, variante):
    if variante == "rouge":
        d1 = [forme(2, "Titre", ph="ctrTitle"), forme(3, "Titre posé en zone libre", "Formation Gestion de rayon")]
        d2 = [forme(2, "Titre", ph="title"), forme(3, "Texte", "01 · Les bases")]
    elif variante == "verte":
        d1 = [forme(2, "Titre", "Formation Gestion de rayon", ph="ctrTitle")]
        d2 = [forme(2, "Titre", "01 · Les bases", ph="title")]
    else:  # retire
        d1 = [forme(3, "Titre posé en zone libre", "Formation Gestion de rayon")]
        d2 = [forme(3, "Texte", "01 · Les bases")]
    z = zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED)
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
    z.writestr("ppt/presentation.xml",
               '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>'
               '<p:sldSz cx="12192000" cy="6858000"/></p:presentation>')
    z.writestr("ppt/_rels/presentation.xml.rels",
               '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/>'
               '<Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>')
    z.writestr("ppt/slides/slide1.xml", diapo(d1 + pied(10)))
    z.writestr("ppt/slides/slide2.xml", diapo(d2 + pied(20)))
    z.close()
    print("écrit :", chemin)


build(os.path.join(HERE, "pptx-placeholder-vide-red.pptx"), "rouge")
build(os.path.join(HERE, "pptx-placeholder-vide-green.pptx"), "verte")
build(os.path.join(HERE, "pptx-placeholder-vide-retire.pptx"), "retire")
