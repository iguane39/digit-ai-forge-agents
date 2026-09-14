#!/usr/bin/env python3
"""
self_test.py — Preuve que les contrôles de lisibilité peuvent échouer.

Un contrôle qui ne peut pas échouer ne prouve rien. Ce script lance
`check_html.check()` sur les fixtures du skill et vérifie que :

  · la fixture VERTE ne déclenche AUCUN échec de lisibilité ;
  · chaque fixture ROUGE déclenche EXACTEMENT la (les) règle(s) attendue(s) —
    ni moins (le contrôle est aveugle), ni plus (le contrôle est bruyant).

Usage :
    python scripts/self_test.py
    python scripts/self_test.py --output json

Code de sortie : 0 si tous les cas passent, 1 sinon.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys

# Windows : forcer stdout/stderr en UTF-8 pour ne pas planter (cp1252) à l'impression
# de caractères hors Latin-1 (✅, ①-⑤, tirets cadratins…). Garde-fou si non supporté.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_html import check  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

# fichier -> règles attendues (ensemble de codes). Ensemble vide = doit passer.
CAS = {
    "lisibilite-verte.html": set(),
    # TF-0489 (23/08) — LE LECTEUR DE SOURCE, le composant que la regle A1 rendait necessaire
    # et qui n existait pas : une page autoportante ne peut pas renvoyer a des fichiers du
    # depot, donc elle EMBARQUE les documents cites — et un <pre> de 67 Ko est illisible. La
    # fixture porte le composant COLLE (aucun fichier voisin), son document en Markdown, et la
    # doctrine des liens non cliquables. Elle doit passer TOUTES les regles : c est un exemple
    # de reference, pas une demonstration.
    "src-lecteur-de-source.html": set(),
    # 23/08, choix humain (option etendue) : une PROMESSE ecrite en commentaire est verifiee. Le
    # cas fondateur est QUANTIFIE — « un <title> par forme » — et le schema portait bien UN titre,
    # celui du diagramme entier, et aucun sur ses formes. Une regle de simple presence passait
    # donc en donnant l'impression de couvrir son propre cas fondateur. Les deux fixtures ne
    # different que par les titres poses sur les groupes, et par un commentaire de NEGATION qui
    # ne promet rien.
    "l22-promesse-non-tenue.html": {"L22"},
    "l22-promesse-tenue.html": set(),
    # TF-0733 (31/08) — le voile invisible aux seize oracles : un composant masque par `hidden`
    # mais style par un display EXPLICITE devient un rectangle transparent qui intercepte chaque
    # clic — invisible en capture, invisible a la lecture, trouve par elementFromPoint chez le
    # produit. Les deux fixtures ne different que par la garde `[hidden]{display:none !important}` ;
    # une page qui n'emploie pas `hidden` n'est pas jugee (borne ecrite dans la regle).
    "l23-voile-sans-garde.html": {"L23"},
    "l23-garde-posee.html": set(),
    "l1-texte-coupe.html": {"L1"},
    "l1-ponctuation-orpheline.html": {"L1"},
    # TF-0488 (22/08) — le SUJET d un selecteur est son DERNIER composant. La verte porte
    # `a.kpi .kpi-label{display:flex}`, `li.item > .badge{display:block}` et
    # `.carte + .carte .titre{display:grid}` : avec la lecture au PREMIER composant, elle
    # rendait 3 faux L1 sur des phrases parfaitement formees (mesure du 22/08). La rouge garde
    # le meme CSS et y ajoute une vraie ponctuation orpheline : la regle doit encore mordre.
    "l1-selecteur-descendant-vert.html": set(),
    "l1-selecteur-descendant-rouge.html": {"L1"},
    # TF-0683 (26/08) — le sujet etait bien lu, mais la CONTRAINTE D ANCETRE etait jetee :
    # `.toc a` mettait en bloc TOUT `<a>` du document. Mesure sur piece : six constats faux sur
    # un livrable, dont les deux seules issues vertes etaient de RETIRER des liens d une prose ou
    # de RENOMMER une classe de sommaire pour tromper le controle. La verte porte un sommaire qui
    # FERME avant la prose ; la rouge porte le meme CSS avec le lien VRAIMENT dans le sommaire,
    # parce qu un matcher devenu trop strict passerait sinon pour un correctif.
    "l1-ancetre-hors-portee-vert.html": set(),
    "l1-ancetre-dans-portee-rouge.html": {"L1"},
    # TF-0517 (22/08) — retour DIRECT du client : « je ne sais pas ce qu est E2 ». Un renvoi code
    # porte son sens la ou on le lit. La verte emploie la bonne pratique qui existait DEJA dans le
    # rapport HTML du meme projet : une infobulle qui developpe le code, plus son ancre de
    # definition. Elle ne passait nulle part ailleurs, faute d etre ecrite.
    "l18-identifiant-muet.html": {"L18"},
    "l18-identifiant-glose.html": set(),
    # TF-0944 (08/09) — L18 bis : le SYSTEME d'identifiants, pas le jeton. Les trois fixtures
    # tiennent ensemble : la rouge porte des jetons TOUS gloses (L18 vert) et echoue quand meme ;
    # la verte pose la legende AVANT le tableau ; la troisieme pose la MEME legende APRES, et
    # echoue — sans elle, une regle qui se contenterait de trouver la declaration quelque part
    # rendrait le meme verdict sur les deux, et le vert ne prouverait rien.
    "l18bis-systeme-non-explique.html": {"L18"},
    "l18bis-systeme-explique.html": set(),
    "l18bis-legende-apres-le-tableau.html": {"L18"},
    # TF-0952 (08/09) — L31 : une hierarchie longue rendue en tableau se PLIE. Les deux fixtures
    # portent la MEME donnee ; seule la table de la verte porte `data-arbre`.
    "l31-hierarchie-non-pliable.html": {"L31"},
    "l31-hierarchie-pliable.html": set(),
    # TF-0492 (22/08) — `overflow-wrap: anywhere` est necessaire sur un chemin, ravageur sur de
    # la prose. La verte le reserve a `code`, `pre` et aux classes qui disent leur usage technique.
    "l19-coupure-en-prose.html": {"L19"},
    # TF-0554 (24/08, lot Produit-10) — LA REGLE REFUSAIT CE QUE LE SOCLE EXIGE. `composants.md` §6
    # impose « overflow-wrap: anywhere sur les cellules » comme palier intermediaire OBLIGATOIRE du
    # repli en cartes ; L19 traitait `td` comme de la prose et rendait FAIL bloquant. Mesure : huit
    # livrables PASS le 19/08 rendaient douze FAIL le 24/08 sans qu un octet ait bouge. La cause
    # profonde etait que `regles_css` APLATISSAIT la feuille sans garder le contexte d at-rule : un
    # selecteur ecrit sous `@media` etait juge comme s il s appliquait partout.
    "l19-repli-cartes-legitime.html": set(),
    "l19-coupure-reservee-au-technique.html": set(),
    # TF-0495 (22/08) — la frontiere entre « le contenu est PRESENT » et « le contenu est
    # EXPLOITABLE ». Un document embarque en texte brut passait TOUS les oracles ; il a fallu que
    # le client le redemande DEUX FOIS pour qu'une vue lisible soit produite. Les trois fixtures
    # portent le MEME bloc de 95 lignes : sans alternative, avec une bascule cablee, et avec le
    # motif declare — parce que ce qui est delibere se declare et ce qui est subi se corrige.
    "l20-brut-sans-alternative.html": {"L20"},
    "l20-brut-avec-bascule.html": set(),
    "l20-brut-declare.html": set(),
    # TF-0521 (23/08) — un composant DECLARE sans style est invisible aux DEUX oracles : celui du
    # MARQUAGE trouve la classe et s'arrete la, celui du RENDU ne voit rien tant que rien ne deborde.
    # Mesure : deux squelettes de la bibliotheque portaient un sommaire annonce et non style, il se
    # rendait en liste numerotee nue — vu seulement en comparant a un livrable REEL. La rouge est la
    # fixture verte AVEC LE SEUL BLOC DE STYLE DU SOMMAIRE RETIRE : une difference, une regle.
    "l21-composant-sans-style.html": {"L21"},
    "l2-largeur-bridee.html": {"L2"},
    "l3-tooltip-vide.html": {"L3"},
    "l3-bareme-absent.html": {"L3"},
    "l4-table-sans-filtre.html": {"L4"},
    "l5-surlignage-casse-mot.html": {"L5"},
    "l5-collision-de-classe.html": {"L5"},
    # Même page, classes disjointes (convention `find-hit` du socle) : L5 doit se taire.
    "l5-classes-separees.html": set(),
    "l6-ancre-morte.html": {"L6"},
    "l6-entree-sans-annonce.html": {"L6"},
    "l7-chapitre-sans-chapeau.html": {"L7"},
    "l8-lien-muet.html": {"L8"},
    # TF-0174 (13/08) : routage SPA par hash — data-nav + script = exempt ; data-nav sans
    # script = liens morts, L8 se déclenche.
    "l8-spa-cablee.html": set(),
    "l8-spa-morte.html": {"L8"},
    "l9-detail-vide.html": {"L9"},
    "l9-depliant-muet.html": {"L9"},
    "l9-depliant-inutile.html": {"L9"},
    "l12-enumeration-en-prose.html": {"L12"},
    # 22/08 — la MÊME page, sa zone de contenu déclarée citée (data-cite) : L12 se tait.
    # Doctrine TF-0436 étendue : un oracle de forme ne juge pas un texte que la page n'a pas
    # écrit. Cas réel : la page du registre TODO rend le contenu des candidatures.
    "l12-enumeration-citee.html": set(),
    "l10-table-sans-mode-emploi.html": {"L10"},
    # Delta n°6 (14/08) : liste ≥ 8 lignes sans champ de recherche statique — L13 seule
    # (data-filterable pose L4 muette, exemple de lecture pose L10 muette).
    "l13-liste-sans-recherche.html": {"L13"},
    "l11-litteral-null.html": {"L11"},
    # Lot Produit-02 du 02/09 (TF-0772/0771/0778/0777/0783/0754) — cinq regles neuves, cinq
    # paires. Chaque paire porte la MEME page a une difference pres, et cette difference est
    # exactement ce que la regle mesure : le sommaire (L25), la bride de largeur autour du
    # tableau et non autour de la prose (L26), la definition des en-tetes (L27), la valeur
    # d'ordre des mois (L28), le decalage du thead par le token --hh (L29).
    # G7 un cran plus bas : une exemption de facette PAR COLONNE se motive, comme celle du
    # tableau entier (TF-0782). Les deux fixtures ne different que par data-filter-reason.
    "l4-exemption-facette-muette.html": {"L4"},
    "l4-exemption-facette-motivee.html": set(),
    # TF-0932 (lot Produit-10 20260908b) — L30 : un chapitre dit CE QU'IL CONTIENT, et glose
    # son jargon. L7 porte sur ce que le chapitre APPREND — la promesse ; personne n'exigeait
    # l'INVENTAIRE, ni la difference avec le chapitre voisin, ni la glose d'un terme technique.
    # Treize chapitres reecrits en tete apres coup. Le triplet porte la MEME page : la verte
    # complete, la premiere rouge sans son .contenu (le chapeau L7 reste, et reste satisfait),
    # la seconde sans sa glose alors que le chapitre suivant garde la sienne — ce qui prouve
    # que la regle juge CHAPITRE PAR CHAPITRE et non une fois pour la page.
    # La verte est jugee DEUX FOIS : ici sur les echecs, et dans CAS_AVERT sur les
    # avertissements — un chapitre annonce ne doit declencher ni l'un ni l'autre.
    "l30-chapitre-annonce.html": set(),
    "l30-terme-non-glose.html": {"L30"},
    # TF-0969 (08/09) — le terme se cherche entre deux frontieres de mot Unicode : « gate »
    # dans `aggregate_type` ne compte pas, « la gate du mandat » reste rouge.
    "l30-identifiant-technique.html": set(),
    "l30-terme-employe-comme-mot.html": {"L30"},
    "l25-chapitres-sans-sommaire.html": {"L25"},
    "l25-sommaire-lateral.html": set(),
    "l26-donnees-colonne-de-lecture.html": {"L26"},
    "l26-donnees-pleine-largeur.html": set(),
    "l27-entetes-sans-definition.html": {"L27"},
    "l27-dictionnaire-de-colonnes.html": set(),
    "l28-mois-sans-ordre.html": {"L28"},
    "l28-mois-ordonnes.html": set(),
    "l29-thead-sous-entete-collant.html": {"L29"},
    "l29-thead-decale-par-token.html": set(),
    # TF-0227 (lot Produit-10 du 14/08) : 71 marqueurs [c:id] dans un livrable DIFFUSE, PASS
    # a tous les oracles du socle. La rouge porte le defaut reel, mot pour mot.
    "l14-plomberie-affichee.html": {"L14"},
    # Les deux sorties legitimes, chacune sa fixture : citer dans du code, ou s exempter
    # AVEC un motif. Sans elles, la regle passerait pour un simple refus de crochets.
    "l14-jetons-cites-en-code.html": set(),
    "l14-exemption-motivee.html": set(),
    # TF-0928 (lot Produit-10 20260908b) — L3 bis : la legende TAUTOLOGIQUE. 900 cellules dont
    # l'infobulle recopiait la cellule avaient passe L3, qui ne juge que l'EXISTENCE et la
    # longueur d'une legende. La paire porte le MEME tableau et le MEME dictionnaire de
    # colonnes (L27) : c'est ce qui prouve que le defaut n'est pas l'absence de definition de
    # colonne. La verte porte en outre le cas de sortie DECLARE (`data-legende-ok`), sans quoi
    # la regle passerait pour un refus de toute infobulle citant sa cellule.
    "l3-legende-tautologique.html": {"L3"},
    "l3-legende-explicative.html": set(),
    # TF-0954 (08/09) — la MEME loi, un cran plus haut et sur l'autre porteur : une DEFINITION DE
    # COLONNE qui repete son en-tete, et une `data-definition` de cellule qui recopie sa cellule.
    # G9 et L27 verifient qu'une definition EXISTE, jamais qu'elle APPREND quelque chose.
    "l3-definition-colonne-tautologique.html": {"L3"},
    "l3-definition-colonne-explicative.html": set(),
    # TF-0934 (lot Produit-10 20260908c) — L3 ter : l'objet NOMME que personne n'explique. Les
    # objets d'un systeme source CITE mais jamais joint n'ont aucun catalogue commente ; le
    # generateur fait retomber l'infobulle sur la DEFINITION DE LA COLONNE, la meme phrase sur
    # toute la colonne, qui se lit « pas d'explication ». Ni L3 bis (l'infobulle ne recopie pas
    # la cellule) ni L27 (la colonne a bien sa definition) ne le voient. La verte porte le
    # dictionnaire d'objets ecrit et source, et sa sortie declaree au niveau de la ligne.
    "l3-objet-source-muet.html": {"L3"},
    "l3-dictionnaire-d-objets.html": set(),
    # TF-0935 (lot Produit-10 20260908d) — L3 quater : la legende ILLISIBLE. 3 153 cellules a
    # `title`, 2 527 en portant plusieurs objets, la plus longue SEPT objets en 700 caracteres
    # d'un bloc : conforme a toutes les formes de L3, et illisible. La paire porte les MEMES
    # sept objets et les MEMES sous-precisions ; seule la mise en forme du `title` change.
    "l3-legende-en-bloc.html": {"L3"},
    "l3-legende-en-puces.html": set(),
    "l3-score-sans-formule.html": {"L3"},
    "l3-valeur-opaque.html": {"L3"},
    # TF-0233 (15/08) : un conteneur-valeur dont un DESCENDANT porte la légende est
    # couvert — plus de double échec L3 pour un seul chiffre.
    "l3-conteneur-couvert.html": set(),
    # Lot Produit-05 20260820a/b (21/08) — TF-0423 : L7 refuse le chapeau répété, le chapeau de
    # remplissage ; L10 refuse l'exemple de lecture en double. TF-0433 : « note » n'est un score
    # que suivi d'un chiffre — la carte-remarque se tait, la note chiffrée échoue. TF-0434 : un
    # libellé-identifiant sans title est elliptique (échec nommé), avec title il passe.
    # TF-0425/TF-0432 : onglets et lignes dépliables — rouge sans câblage, verte conforme.
    "l7-chapeaux-identiques.html": {"L7"},
    "l7-chapeau-remplissage.html": {"L7"},
    # TF-0931 / TF-0933 (lot Produit-10 20260908b et 20260908c) — le sommaire a DEUX NIVEAUX.
    # L7 le refusait sous toutes ses formes : cible = <h3> nu -> « sans chapeau » ; cible = le
    # bloc h3 + chapeau -> « chapeau IDENTIQUE » avec le parent, qui collectait les chapeaux de
    # TOUS ses descendants. Le produit a paye ce refus deux fois en une journee, la seconde en
    # remplacant ses liens de sous-chapitre par des BOUTONS. La verte porte la forme legitime
    # (sous-entrees en <a href="#...">, un chapeau propre par bloc cible) ; la rouge est la MEME
    # page avec un chapeau de sous-chapitre recopie du parent — un VRAI doublon, qui prouve que
    # la correction juge autrement et n'eteint rien.
    "l7-sommaire-deux-niveaux.html": set(),
    "l7-sommaire-deux-niveaux-chapeau-repete.html": {"L7"},
    "l10-exemple-double.html": {"L10"},
    "l3-note-encadre.html": set(),
    "l3-note-chiffree.html": {"L3"},
    "l8-identifiant-sans-title.html": {"L8"},
    "l8-identifiant-avec-title.html": set(),
    "l16-onglets-sans-controls.html": {"L16"},
    "l16-onglets-conformes.html": set(),
    "l17-depliant-sans-bouton.html": {"L17"},
    "l17-depliant-conforme.html": set(),
    # TF-0719 (31/08) — LE BADGE QUI AFFIRME UN RANG QUE RIEN NE VERIFIE. Un `span.badge.acte`,
    # titre « Decision prise le 22 aout 2026 par la direction... », a ete pose sur une decision
    # QUI N A JAMAIS ETE PRISE, sur CINQ emplacements d un livrable client — et il est passe :
    # L3 exige qu un badge porte une LEGENDE, et elle etait la. Le vocabulaire etait bon, la
    # discipline absente. Mesure du 02/09 : la rouge rendait PASS avant correction, FAIL ×2
    # apres. TROIS fixtures, parce que la regle a DEUX sorties legitimes et un piege :
    #   · rouge : un badge nu, et un second dont l `aria-describedby` RESOUT vers une note qui
    #     ne se declare PAS decision — une description resolue n est pas une trace ;
    #   · verte 1 : les memes emplacements, l un enveloppe d un lien vers son ADR, l autre
    #     decrit par un element qui se declare decision ;
    #   · verte 2 : la SORTIE PAR DEFAUT — sans trace, le badge se degrade en `propose`, jamais
    #     l inverse. Sans elle, la regle passerait pour un refus des badges.
    "l24-badge-acte-sans-trace.html": {"L24"},
    "l24-badge-acte-resolu.html": set(),
    "l24-badge-propose-degrade.html": set(),
}

# TF-0435 : L15 est un AVERTISSEMENT — jugé à part, sur les warns. La verte emploie un chevron
# sûr (U+203A), la rouge le triangle U+25B6 qui sortait en tofu sur mobile.
CAS_AVERT = {
    "l15-glyphe-hors-liste.html": {"L15"},
    "l15-glyphe-sur.html": set(),
    # TF-0932 — la moitie « ce que le chapitre CONTIENT » de L30 est un AVERTISSEMENT, pas un
    # echec : mesure du 08/09 sur les pages generees du pilot, tenues pour conformes, 40
    # constats sur TODO.html et 47 sur TODO-ARCHIVE.html, tous sur cette moitie. `.contenu` est
    # une obligation redactionnelle neuve ; la rendre bloquante d'un commit ferait rougir tout
    # le parc sans migration. L'avertissement propose le geste d'office et se decline en
    # l'ecrivant. La seconde moitie (le jargon) reste un echec, et a sa fixture dans CAS.
    "l30-chapitre-sans-contenu.html": {"L30"},
    "l30-chapitre-annonce.html": set(),
}

RE_CODE = re.compile(r"^(L\d+)\b")

# A1 (autonomie réseau, D-10) vit dans la famille « charte » : ses fixtures se
# jugent avec regles="charte" et on n'extrait que les codes A — les deux pages
# sont charte-conformes par construction, seul A1 les départage.
CAS_AUTONOMIE = {
    "a1-cdn-au-chargement.html": {"A1"},
    "a1-liens-documentaires.html": set(),  # liens <a>, xmlns, data: URI : silence exigé
    # RA-1 (Produit-10, 13/08) : un </script> en clair dans le commentaire d'un asset inliné
    # tronque le script hôte — le déséquilibre ouvertures/fermetures le trahit.
    "a1bis-script-tronque.html": {"A1-bis"},
    # TF-0307 : deux jumelles qui ne diffèrent QUE par la place d'une url() — dans un
    # commentaire (rien n'est chargé, silence exigé) ou dans la règle CSS qui suit
    # (requête réelle, A1 doit la nommer). Sans la rouge, retirer les commentaires
    # pourrait avaler le CSS qui les suit sans que rien ne le dise.
    "a1-reseau-cite-en-commentaire.html": set(),
    "a1-reseau-hors-commentaire.html": {"A1"},
    # TF-0896 (lot Produit-10 20260907c) — A5, la feuille de style se PARSE. Un générateur qui
    # extrait le style « à la première occurrence » avait embarqué le commentaire qui citait la
    # balise en toutes lettres : UNE règle obtenue pour 27 350 caractères, page rendue nue, et
    # trois passes d'oracles à mesurer des symptômes (2 106 px de débordement, sommaire perdu,
    # faux G1) avant de trouver une cause d'une ligne. Les DEUX branches ont leur rouge : le
    # résidu de balisage dans un sélecteur (signature exacte) et la densité de règles (forme
    # générale, quand le résidu ne porte aucun marqueur reconnaissable).
    "a5-feuille-parsable.html": set(),
    "a5-residu-de-commentaire.html": {"A5"},
    "a5-feuille-ecrasee.html": {"A5"},
    # TF-0984 (08/09) — le dénominateur de A5 exclut les `url(data:…)` que A1 impose : une page
    # qui embarque ses polices reste verte ; la même police suivie de prose diluée reste rouge.
    "a5-polices-embarquees.html": set(),
    "a5-polices-et-feuille-ecrasee.html": {"A5"},
}
RE_CODE_A = re.compile(r"^(A\d+(?:-bis)?)\b")

# G1 (bascule thème sombre câblée, R-30/TF-0134) vit lui aussi dans la famille
# « charte » : mêmes garanties anti-parasite que A1. Ensemble vide de FAILS
# n'exclut pas un WARN (cas sans bouton) — seul check() décide, ici on ne juge
# que les codes G en échec bloquant.
# TF-0241 (15/08) : la langue se DÉCLARE — lang="en" assumé passe (avertissement,
# jamais un échec), lang absent échoue. Jugé en famille charte, anti-parasite : la
# fixture verte doit être charte-verte par ailleurs.
CAS_LANG = {
    "charte-lang-en.html": False,     # aucun échec attendu (warn seulement)
    "charte-lang-absent.html": True,  # un échec « lang » attendu, et lui seul
}

CAS_G1 = {
    "g1-bouton-sans-cablage.html": {"G1"},  # bascule morte : bouton présent, jamais câblé
    "g1-bouton-cable.html": set(),          # bascule câblée : silence exigé
    "g1-sans-bouton.html": set(),           # aucun bouton : WARN seulement, jamais un FAIL
}
RE_CODE_G = re.compile(r"^(G\d+)\b")
# TF-0445 : famille S — structure du document (S1 cohérence de tableau). Une famille de plus
# demande son extracteur : `codes()` ne rend que ce que son motif reconnaît, et un code non
# reconnu se lit « aucun défaut » — c'est un faux vert de recette, pas une lacune anodine.
RE_CODE_S = re.compile(r"^(S\d+)\b")

# AUTOPORTANCE (TF-0303, décidé par l'étude d'opportunité 20260817b — verdict O3) :
# mécanisation des règles A1 (squelette auto-portant), A2/G2 (favicon data:), A3 (charset
# dans les 1024 premiers octets), A4 (titre marque + objet + version datée) et de la
# branche R-30 « clair par défaut STRICT » de G1 (auto-sombre hérité de l'OS interdit
# depuis TF-0158, tranché RV-9). Codes A et G jugés ENSEMBLE : le cas fondateur les cumule,
# et les séparer aurait fait passer un fragment sans en-tête pour un simple défaut de titre.
#
# Cas fondateur (lot Produit-01, 17/08) : un rapport d'audit remis à un client, écrit pour
# une publication hébergée — l'hôte fournissait le squelette, le fichier livré n'en avait
# aucun. Quatre règles écrites du socle violées d'un coup, zéro contrôle pour le dire.
CAS_AUTOPORTANCE = {
    "a1-fragment-sans-head.html": {"A1", "A2", "A3", "A4", "G1"},
    "a1-fragment-corrige.html": set(),      # le MÊME contenu, rendu auto-portant
    # La position se mesure en octets, pas en caractères, et le commentaire n'est pas
    # coupable en soi : les deux jumelles ne diffèrent que par l'ordre de trois lignes.
    "a3-charset-tardif.html": {"A3"},
    "a3-charset-en-tete.html": set(),
    # Le titre porte un nom de produit INVENTÉ (« Cartavia ») : la forme du défaut est celle
    # du cas fondateur — un seul bloc, sans marque ni indice daté — le nom, lui, n'est celui
    # de personne (relecture post-anonymisation du 02/09).
    "a4-titre-sans-marque.html": {"A4"},
    "a4-titre-sans-version.html": {"A4"},   # marque et objet présents, révision muette
    "a2-favicon-absent.html": {"A2"},
    "a2-favicon-fichier-externe.html": {"A2"},   # déclaré, mais pas embarqué
    # La verte de l'auto-sombre est g1-bouton-cable.html : elle CITE prefers-color-scheme
    # en commentaire pour dire qu'il est retiré — la règle doit y rester muette.
    "g1-auto-sombre-media.html": {"G1"},
}
RE_CODE_AG = re.compile(r"^(A\d+(?:-bis)?|G\d+)\b")

# Cas mesurés AU RENDU : le contrôle statique de L2 lit le CSS du conteneur et ne
# voit pas un paragraphe bridé à l'intérieur. Ces deux-là ne se jugent qu'en
# ouvrant la page dans un navigateur.
CAS_RENDU = {
    "l2r-texte-a-50-pourcent.html": ("l2_width", 1),   # paragraphe bridé
    "l2r-texte-pleine-largeur.html": ("l2_width", 0),  # colonne de mesure
    # TF-0421 (lot Produit-05 20260820a) : la bride par `width: min(75ch, 100%)` passait L2 (qui ne
    # regardait que max-width) et laissait 60 % de la fenêtre vide à 1 800 px. L2 mesure
    # désormais QUELLE QUE SOIT la propriété ; la mesure de lecture se pose sur le conteneur
    # (.chap.lire), jamais sur le paragraphe.
    "l2r-texte-width-min.html": ("l2_width", 1),       # bride par width:min(ch)
    "l2r-chap-lire.html": ("l2_width", 0),             # conteneur de lecture, texte plein
    # TF-0444 (21/08) : <colgroup>/<col> DÉCLARENT des largeurs, ils ne mettent rien en page —
    # leur boîte englobe celle du tableau, donc tout tableau à colgroup rendait deux faux
    # positifs BLOQUANTS (50 mesurés sur un livrable sain). Les deux sens sont dus : sans la
    # contre-épreuve, corriger le faux positif aurait pu éteindre la règle en silence.
    # TF-0633 (25/08, lot Produit-02) — V8 : un actif visuel se juge dans le CONTEXTE ou il
    # est servi. Les deux fixtures sont le meme fichier a une valeur hexadecimale pres, le
    # remplissage du logo : #2d4047 sur un bandeau #2d4047 (le fantome mesure en production,
    # ratio 1,0) contre #FFFFFF sur le meme bandeau. Si la regle rougissait sur les deux, ou
    # passait sur les deux, elle ne mesurerait pas ce qu'elle pretend mesurer.
    "v9-logo-invisible.html": ("v9_actif_invisible", 1),
    "v9-logo-visible.html": ("v9_actif_invisible", 0),
    "v4-colgroup-legitime.html": ("v4_overlap", 0),    # largeurs déclarées, rien ne se recouvre
    "v4-chevauchement-reel.html": ("v4_overlap", 1),   # deux frères qui se recouvrent vraiment
    # TF-0559 (24/08, lot Produit-10) — LA BOITE D'UN INLINE VAUT LA HAUTEUR D'EM, PAS L'INTERLIGNE.
    # Deux surlignages de lignes consecutives se recouvrent donc geometriquement des que line-height
    # est serre, SANS QU'AUCUN PIXEL PEINT NE SE SUPERPOSE. Mesure du 19/08 sur 1 246 surlignages
    # d'un livrable reel : a 1,22 le recouvrement vaut 5 px et rend un BLOQUANT a 390 px ; a 1,45 il
    # disparait. La parade existante ne couvrait que l'inline reparti sur plusieurs lignes ; deux
    # FRERES du meme parent restaient juges sur leur boite d'em. Les deux fixtures voisines
    # (chevauchement reel, colgroup) prouvent que la tolerance n'a pas eteint la regle.
    "v4-inline-freres-interligne.html": ("v4_overlap", 0),
    # TF-0558 (24/08, lot Produit-10) — LE CALIBRAGE DU REPLI ETAIT ECRIT EN PROSE, donc retraduit par
    # chaque emetteur, et mal : repli regle a 900 px alors qu un tableau de huit colonnes debordait
    # jusque vers 1 400 (bord droit mesure a 1 308 px pour un viewport de 1 280). Il est desormais
    # MECANISE — le nombre de colonnes se lit dans le marquage, `:has(th:nth-child(n))` declenche le
    # palier, aucun emetteur ne calibre plus rien. Cette fixture porte huit colonnes et doit rendre
    # ZERO debordement aux quatre largeurs. Deux defauts trouves en l ecrivant : un jeton
    # `--replier` qui ne declenchait rien (une propriete personnalisee n active aucune regle), et
    # `width:100%` sans `box-sizing` qui debordait de son propre remplissage — 1 300 px pour 1 280.
    "repli-huit-colonnes.html": ("v1_overflow", 0),
    # TF-0440 (21/08) : L2 mesurait le paragraphe contre son conteneur — déplacer la bride
    # d'un cran la satisfaisait sans rien changer pour le lecteur. Les deux fixtures ne
    # diffèrent que par le CENTRAGE de la colonne : centrée = mesure de lecture (légitime),
    # calée à gauche = gouttière (refusée par le lecteur humain le 21/08).
    "l2c-conteneur-cale-a-gauche.html": ("l2_conteneur", 1),
    "l2c-conteneur-centre.html": ("l2_conteneur", 0),
    # TF-0491 (23/08) — la rupture d'alignement ENTRE FRERES EMPILES. Les trois mesures L2
    # precedentes comparent un bloc a ce que son CONTENEUR lui offre : une prose bornee ET
    # CENTREE au-dessus de cartes pleine largeur les satisfait toutes les trois. Le client l'a
    # pourtant signalee TROIS FOIS en quatre versions, sous trois formulations. Les trois
    # fixtures sont geometriquement liees : la rouge, la meme alignee, et la meme DECLAREE.
    "l2fr-freres-desalignes.html": ("l2_freres", 1),       # prose bornee sur cartes larges
    "l2fr-freres-alignes.html": ("l2_freres", 0),          # le meme, aligne — ce que le client demandait
    "l2fr-freres-declares.html": ("l2_freres", 0),         # le meme, mais data-mesure-lecture
    "l2g-gouttiere-etiquettes.html": ("l2_gouttiere", 1),   # colonne d'étiquettes
    "l2g-etiquettes-en-tete.html": ("l2_gouttiere", 0),     # étiquette en tête
    # TF-0694 (27/08) — LA REGLE DECRIVAIT EXACTEMENT CE DEFAUT, AU SEUIL EXACT, ET RENDAIT PASS
    # DESSUS : son implementation commencait par `if (cs.display !== 'grid') continue`, et une
    # mise en page « intitule | contenu » en <table> n'y entrait jamais. Elle n'a pas echoue,
    # ELLE N'A PAS ETE APPELEE, et rien ne le disait. Mesure du 27/08 rejouee le 02/09 sur la
    # rouge : verdict PASS, l2_gouttiere 0, comme les douze autres familles — le socle rendait
    # PASS sur le document meme que la regle est faite pour condamner. Cout : deux fiches
    # livrees et trois regenerations avant qu'un humain ne l'ouvre.
    # TROIS fixtures, parce que la contre-epreuve porte ici tout le risque : faire entrer les
    # <table> pouvait condamner TOUS les tableaux a deux colonnes.
    "l2g-table-gouttiere.html": ("l2_gouttiere", 1),   # intitules a 32 % de la largeur rendue
    "l2g-table-etroite.html": ("l2_gouttiere", 0),     # les memes, ramenes au seuil exact (20 %)
    "l2g-table-donnees.html": ("l2_gouttiere", 0),     # vrai tableau : deux valeurs comparables
    # TF-0500 (22/08) : L2-largeur ne pouvait STRUCTURELLEMENT pas voir un texte écrasé en
    # colonne d'un mot — caption absente de sa collecte, écartée par closest('table'), et
    # seuil de 1100 px alors que le défaut n'existe que sous 640 px. L2-filet mesure un rapport
    # d'aspect anormal, à toute largeur. Les deux fixtures ne diffèrent QUE par une règle CSS :
    # `table` en display:block (la caption tombe à 70px pour 366px de conteneur, 12 lignes pour
    # 15 mots) ou non (366px, 2 lignes). Mesuré le 22/08 avant et après correction.
    # TF-0551 (24/08, lot Produit-03) — LE DEFAUT QU'UN ORACLE VISUEL NE PEUT
    # PAS VOIR. Une fiche livree, declaree conforme la veille par les DEUX controles, avait perdu
    # deux sections entieres et son pied de page : gabarit A4 a hauteur FIGEE, contenu 1441px pour
    # une boite de 1123px, 41 elements de texte invisibles. Aucun signal, ni a l'ecran ni a
    # l'impression — `overflow:hidden` EST le mecanisme qui rend un defaut invisible a un controle
    # d'apparence. Les deux fixtures ne different QUE par une propriete : `height` (plafond, le
    # contenu disparait) ou `min-height` (plancher, la feuille s'allonge).
    "rogne-contenu-perdu.html": ("contenu_rogne", 1),
    "rogne-hauteur-plancher.html": ("contenu_rogne", 0),
    "l2f-caption-ecrasee-en-filet.html": ("l2_filet", 1),
    "l2f-caption-pleine-largeur.html": ("l2_filet", 0),
    # TF-0582 (lot Produit-02 20260824) : ce qui PEINT sans etre un `background-color`.
    # Mesure en production : un fond peint par `.color-exp::before` sous un texte dont l'element
    # porte `background: transparent`. Une mesure par styles calcules remonte au conteneur, y lit
    # un fond clair et conclut « tout va bien » sur un texte a 1,0 de ratio — un faux PASS qui
    # porte une signature. Les deux fixtures ont les MEMES couleurs : seule la facon de peindre
    # les separe. La rouge doit sortir en NON MESURABLE, pas en contraste vert.
    "v2p-pseudo-element-peint.html": ("unmeasured", 1),
    "v2p-fond-mesurable.html": ("v2_contrast", 1),
    # V7 : le rythme vertical se mesure au blanc ENTRE les boîtes, pas au pas d'un
    # haut de boîte au suivant. Les deux pages sont identiques à une chose près —
    # un paragraphe hors de l'échelle d'espacement dans la rouge.
    "v7-prose-en-flux.html": ("v7_spacing", 0),   # hauteurs variables, blanc constant
    "v7-rythme-casse.html": ("v7_spacing", 1),    # un paragraphe hors échelle
    # Lot Produit-02 du 02/09 — quatre familles neuves, quatre paires. Chaque paire porte la
    # MEME page a une declaration pres, et cette declaration est exactement ce que la famille
    # mesure : l'etiquette de statut descendue sous le champ (TF-0773), la page qui prend la
    # largeur de la fenetre au lieu de se brider (TF-0771), le chapo qui remplit son conteneur
    # (TF-0778), le sommaire colle par `position: sticky; top: var(--hh)` (TF-0772).
    "ctrl-rangee-desalignee.html": ("controles_desalignes", 1),
    "ctrl-rangee-alignee.html": ("controles_desalignes", 0),
    "donnees-tableau-rogne.html": ("rognage_donnees", 1),
    "donnees-tableau-entier.html": ("rognage_donnees", 0),
    "donnees-prose-etroite.html": ("prose_etroite", 1),
    "donnees-prose-pleine.html": ("prose_etroite", 0),
    # TF-0930 (lot Produit-10 20260908b) — le troisieme angle de la page de donnees : le
    # CONTENEUR contre la FENETRE. La paire porte le MEME token `--w` du socle ; la seule
    # difference est la regle qui en exempte une page declaree page de donnees. La rouge
    # attend en outre ZERO constat des deux autres familles de la page de donnees : c'est ce
    # qui prouve que le defaut leur echappait, et non qu'on le compte deux fois.
    "donnees-conteneur-bride.html": [("conteneur_bride_donnees", 1),
                                     ("rognage_donnees", 0), ("prose_etroite", 0)],
    "donnees-conteneur-plein.html": ("conteneur_bride_donnees", 0),
    "sommaire-perdu-au-defilement.html": ("sommaire_perdu", 1),
    "sommaire-colle.html": ("sommaire_perdu", 0),
    # TF-0910 (lot Produit-10 20260908a) — V16 : deux etats qui se ressemblent ne sont pas deux
    # etats. Les cinq teintes pastel du socle vivent entre L* 93 et 97 ; le texte encre dessus
    # tient 4,5:1, donc V2 rendait PASS sur CHAQUE badge pris un par un. Le defaut vit ENTRE deux
    # badges — une distance, pas un ratio. La fixture rouge porte donc DEUX attentes : zero
    # constat V2 (c'est ce qui prouve que V16 mesure autre chose) et au moins cinq paires sous les
    # deux seuils. Mesures : vert/turquoise dE 7,3 · vert/ambre 19,5 · vert/gris 16,3 ·
    # turquoise/gris 16,5 · rouge/gris 12,5.
    "v16-etats-pastel.html": [("etats_indiscernables", 5), ("v2_contrast", 0)],
    # les MEMES cinq etats en fonds pleins a encre blanche : dE de 23,8 a 98,2, contraste de
    # 6,47:1 a 7,56:1, et un glyphe par palier — l'indice non colorimetrique de WCAG 1.4.1.
    "v16-etats-pleins.html": [("etats_indiscernables", 0), ("v2_contrast", 0)],
    # TF-0901 (lot Produit-10 20260907e) — V15 : l'en-tete de tableau, mesure APRES DEFILEMENT.
    # Huit en-tetes poses sur leurs propres lignes, TROIS oracles PASS, et l'humain seul
    # detecteur a la premiere ouverture : L29 lit la feuille et pas le style en ligne, V4 compare
    # des freres tous decales pareil, l'oracle de filtres juge le marquage. Deux branches, deux
    # causes, et chacune a sa paire :
    #   · le conteneur defilant (TF-0900) — l'en-tete recouvre ses lignes au repos ET se tient
    #     hors de son `top` declare apres defilement ;
    #   · la pose en ligne par un script (TF-0899) — l'en-tete recouvre ses lignes, et le
    #     `sticky` n'existe plus, donc la seconde branche n'a rien a mesurer.
    "l29-table-hote-defilante.html": [("entete_pose_sur_lignes", 1), ("entete_ne_colle_pas", 1)],
    "l29-table-hote-socle.html": [("entete_pose_sur_lignes", 0), ("entete_ne_colle_pas", 0)],
    "l29t-pose-nue.html": [("entete_pose_sur_lignes", 1), ("entete_ne_colle_pas", 0)],
    "l29t-pose-gardee.html": [("entete_pose_sur_lignes", 0), ("entete_ne_colle_pas", 0)],
    # TF-0929 (lot Produit-10 20260908b) — TROISIEME instance de la classe en deux jours, et la
    # troisieme branche de V15 : l'en-tete se tient EXACTEMENT a son `top` declare, et il est
    # quand meme illisible. `--hh` est un TOKEN ; des qu'une bande de sommaire colle sous
    # l'en-tete, ce qui surplombe le thead est plus haut que lui. La rouge attend donc ZERO
    # constat des DEUX branches existantes — c'est ce qui prouve qu'elles ne pouvaient pas le
    # voir, et non qu'on compte le meme defaut trois fois. La paire ne differe que par le
    # `--hh-tab` MESURE (poserHauteurs() du socle) contre le token fige.
    "l29q-empilement-token.html": [("entete_masque_par_collants", 1),
                                   ("entete_ne_colle_pas", 0), ("entete_pose_sur_lignes", 0)],
    "l29q-hauteurs-mesurees.html": ("entete_masque_par_collants", 0),
}


# TF-1066 (12/09/2026, regle E5 du pilot) — LES CAS QUI N'EXISTENT QU'AU-DELA DE 2560 px.
#
# Branche a part, et c'est le point : `CAS_RENDU` se joue a 1440 px, la ou les deux defauts de V18
# n'existent tout simplement pas — une prose bornee par la fenetre ne s'etire pas, un tableau a
# l'etroit dans 1 440 px n'a aucune place a prendre. Les jouer a 1440 rendrait quatre verts qui ne
# prouveraient rien. Chaque page porte DEUX attentes : celle de sa famille, et ZERO constat de
# l'autre — c'est ce qui prouve que les deux branches mesurent deux choses et non la meme deux fois.
#
# La paire de PROSE ne differe que par le chapitre de lecture (`.chap.lire`), la paire de DONNEES
# que par le plafond en pixels nus du tableau. La verte de prose borne a 720 px et non au token de
# 1 080 px du socle : au plafond de 100 caracteres par ligne, 1 080 px en mesure 134 — l'ecart est
# publie en NON MESURABLE par l'oracle (il ne bloque pas une forme que le gabarit prescrit), et la
# fixture verte prouve le sens vert PAR LA MESURE plutot que par la seule declaration.
CAS_RENDU_LARGE = {
    "v18-prose-etiree.html": [("v18_prose_etiree", 1), ("v18_tableau_etrique", 0)],
    "v18-prose-mesuree.html": [("v18_prose_etiree", 0), ("v18_tableau_etrique", 0)],
    "v18-donnees-tableau-etrique.html": [("v18_tableau_etrique", 1), ("v18_prose_etiree", 0)],
    "v18-donnees-tableau-plein.html": [("v18_tableau_etrique", 0), ("v18_prose_etiree", 0)],
}


# EXEMPTIONS DÉCLARÉES (TF-0308) — double sens du registre `EXEMPTIONS_DECLAREES`.
#
# Fixtures EMBARQUÉES ici, et non des fichiers de `fixtures/` : le mécanisme se déclenche
# sur le CHEMIN du fichier jugé (registre nominatif), et une fixture de ce skill ne peut
# pas vivre dans l'arbre d'un autre skill. Même contrainte, même choix que le self-test
# du hook C7. Ce que ces cas prouvent : l'exemption s'applique là où elle est déclarée,
# nulle part ailleurs, et n'écarte QUE ce qu'elle nomme.
FRAGMENT_CANEVAS = "\n".join([
    "<!-- TEMPLATE TOPOLOGIE · canevas Digit-AI",
    "     Utilisation : insérer ce <svg>...</svg> dans une page qui utilise le squelette",
    "     de template-multi-bandes.html. -->",
    '<div class="diagram-wrap">',
    '  <svg viewBox="0 0 1400 720" xmlns="http://www.w3.org/2000/svg" role="img">',
    "    <title>{{TITRE_TOPOLOGIE}} | {{SOUSTITRE}}</title>",
    '    <rect x="60" y="76" width="200" height="114" rx="8" fill="#ede9fe"/>',
    "  </svg>",
    "</div>",
])
CHEMIN_DECLARE = ".claude/skills/digit-ai-schemas/assets/template-topologie.html"
CHEMIN_GABARIT = ".claude/skills/digit-ai-schemas/assets/template-multi-bandes.html"
# Page datée : sous le chemin du gabarit à trous, l'exemption A4-version n'écarte plus
# rien — le contrôle doit le DIRE, sinon une ligne de registre survit à son motif.
PAGE_DATEE = "\n".join([
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Digit-AI — Canevas multi-bandes · essai — 20260817a</title>",
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg/%3E">',
    "<style>:root { --ink: #0f172a; } @media print { body { background: #fff; } }</style>",
    "</head><body><h1>Essai</h1><p>Contenu.</p></body></html>",
])


def run_exemptions():
    """Cas à double sens du registre d'exemptions déclarées. Même forme que run()."""
    def a_code_autoportance(fails):
        return any(f.startswith(("A1 DOCTYPE", "A1 <head>", "A3 ", "A2 ")) for f in fails)

    cas = []

    fails, warns = check(FRAGMENT_CANEVAS, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("VERTE  fragment déclaré : autoportance écartée",
                not a_code_autoportance(fails)
                and any("SKIP exemption déclarée" in w for w in warns), fails))

    fails, warns = check(FRAGMENT_CANEVAS, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("VERTE  le SKIP NOMME son motif (jamais muet)",
                any("fragment SVG de canevas" in w and "template-multi-bandes" in w
                    for w in warns), warns))

    fails, _ = check(FRAGMENT_CANEVAS, regles="charte",
                     source="output/livrable-client.html")
    cas.append(("ROUGE  même contenu HORS registre : les échecs reviennent",
                a_code_autoportance(fails), fails))

    fails, _ = check(FRAGMENT_CANEVAS, regles="charte")
    cas.append(("ROUGE  sans chemin fourni : aucune exemption possible",
                a_code_autoportance(fails), fails))

    cdn = FRAGMENT_CANEVAS.replace(
        '<div class="diagram-wrap">',
        '<link rel="stylesheet" href="https://cdn.exemple.invalid/t.css">\n'
        '<div class="diagram-wrap">')
    fails, _ = check(cdn, regles="charte", source=CHEMIN_DECLARE)
    cas.append(("ROUGE  fichier exempté qui charge un CDN : A1 réseau reste en échec",
                any("requête(s) réseau" in f for f in fails), fails))

    fails, warns = check(PAGE_DATEE, regles="charte", source=CHEMIN_GABARIT)
    cas.append(("       exemption devenue inutile : annoncée SANS EFFET",
                any("SANS EFFET" in w for w in warns), warns))

    return [{"fixture": nom, "verdict": "OK" if tenu else "ECHEC",
             "attendu": ["exemption"], "obtenu": ["exemption"] if tenu else [],
             "detail": "" if tenu else " | ".join(detail)[:300]}
            for nom, tenu, detail in cas]


def codes(messages, motif=RE_CODE):
    out = set()
    for m in messages:
        c = motif.match(m)
        if c:
            out.add(c.group(1))
    return out


# TF-0445 (21/08) — S1 : cohérence de tableau. Jugée sous `regles="charte"` et non "L" : ce
# n'est pas de la lisibilité, c'est de la structure. Les cas ne comparent QUE les codes S,
# sinon le bruit des règles de charte (favicon, responsive) d'une fixture minimale masquerait
# le seul point qu'elles prouvent.
CAS_STRUCTURE = {
    "s1-tableau-incoherent.html": {"S1"},   # `|` non échappé : 5 cellules pour un en-tête de 4
    "s1-tableau-coherent.html": set(),      # même page, la barre verticale échappée
    "s1-rowspan-non-juge.html": set(),      # rowspan : non comptable, écarté avec son motif
}


def run_structure():
    """Cas à double sens de S1. Ne compare que les codes S — voir le commentaire ci-dessus."""
    resultats = []
    for nom, attendu in CAS_STRUCTURE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_S)
        ok = obtenu == attendu
        resultats.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                          "attendu": sorted(attendu), "obtenu": sorted(obtenu),
                          "detail": "" if ok else "codes S obtenus != attendus"})
    return resultats


def run():
    resultats = []
    for nom, attendu in CAS.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="L")
        obtenu = codes(fails)
        ok = obtenu == attendu
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails)[:400],
        })
    for nom, attendu in CAS_AVERT.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, warns = check(chemin.read_text(encoding="utf-8"), regles="L")
        # Seule la famille de la fixture est en cause : l'avertissement L6 « aucun sommaire »
        # d'une page minimale n'est pas l'objet de deux jumelles qui ne diffèrent que par le
        # glyphe. La famille se lit dans le NOM de la fixture — `l15-…` juge L15, `l30-…` juge
        # L30 — plutôt que d'être écrite en dur : une famille en dur a valu, en ajoutant L30,
        # une fixture verte par défaut d'extraction.
        famille = {re.match(r"^(l\d+)", nom).group(1).upper()}
        obtenu = codes(warns) & famille
        # un avertissement ne doit jamais s'accompagner d'un ÉCHEC L parasite : la fixture est
        # verte par ailleurs, seul le glyphe la distingue de sa jumelle.
        ok = obtenu == attendu and not codes(fails)
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu | codes(fails)),
            "detail": "" if ok else " | ".join(warns + fails)[:400],
        })
    for nom, attendu in CAS_AUTONOMIE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_A)
        # une fixture A doit aussi être charte-verte : un échec charte parasite
        # rendrait le cas trompeur (on croirait tester A1, on testerait la charte).
        parasites = [f for f in fails if not RE_CODE_A.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    for nom, echec_lang_attendu in CAS_LANG.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE",
                              "attendu": ["lang" if echec_lang_attendu else "(aucun)"],
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        fails_lang = [f for f in fails if "lang" in f.lower()]
        parasites = [f for f in fails if f not in fails_lang]
        ok = (bool(fails_lang) == echec_lang_attendu) and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": ["lang"] if echec_lang_attendu else [],
            "obtenu": (["lang"] if fails_lang else []) + parasites,
            "detail": "" if ok else " | ".join(fails)[:400],
        })
    for nom, attendu in CAS_AUTOPORTANCE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_AG)
        # Même garde anti-parasite que A1 et G1 : un échec de charte NON codé (h1 absent,
        # :root manquant, @media print oublié) rendrait le cas trompeur — on croirait
        # mesurer l'autoportance, on mesurerait un oubli de gabarit.
        parasites = [f for f in fails if not RE_CODE_AG.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    for nom, attendu in CAS_G1.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": sorted(attendu),
                              "obtenu": [], "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = codes(fails, RE_CODE_G)
        # même garde anti-parasite que A1 : un échec charte étranger rendrait le
        # cas trompeur (on croirait tester G1, on testerait autre chose).
        parasites = [f for f in fails if not RE_CODE_G.match(f)]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": sorted(attendu),
            "obtenu": sorted(obtenu),
            "detail": "" if ok else " | ".join(fails + parasites)[:400],
        })
    return resultats


def run_rendu():
    """Rejoue les cas de largeur au rendu. Silencieux si playwright est absent."""
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import json as _json
    import subprocess
    import tempfile
    out = []
    # Les captures partent dans un dossier jetable (--out, TF-0058) : le dossier des
    # fixtures n'a pas à héberger les PNG de son propre auto-test.
    captures = tempfile.mkdtemp(prefix="self-test-render-")
    # TF-0910 : une fixture peut porter PLUSIEURS attentes de familles (liste de couples). Le cas
    # fondateur l'exige — la fixture pastel doit rendre 0 constat V2 ET au moins 5 constats V16 :
    # c'est le fait que V2 reste VERT qui prouve que V16 mesure autre chose qu'un ratio.
    for nom, spec in CAS_RENDU.items():
        paires = spec if isinstance(spec, list) else [spec]
        chemin = FIXTURES / nom
        etiquette = (lambda cle: nom if len(paires) == 1 else f"{nom} · {cle}")
        if not chemin.exists():
            for cle, attendu in paires:
                out.append({"fixture": etiquette(cle), "verdict": "ABSENTE", "attendu": attendu,
                            "obtenu": 0, "detail": "fixture manquante"})
            continue
        r = subprocess.run(
            [sys.executable, "-X", "utf8",
             str(Path(__file__).resolve().parent / "render_page.py"),
             str(chemin), "--widths", "1440", "--output", "json", "--out", captures],
            capture_output=True, text=True, encoding="utf-8")
        try:
            d = _json.loads(r.stdout)
        except Exception:
            for cle, attendu in paires:
                out.append({"fixture": etiquette(cle), "verdict": "ECHEC", "attendu": attendu,
                            "obtenu": 0, "detail": "render_page illisible"})
            continue
        for cle, attendu in paires:
            n = len(d["breakpoints"]["1440"]["issues"][cle])
            ok = (n >= attendu) if attendu else (n == 0)
            out.append({"fixture": etiquette(cle), "verdict": "OK" if ok else "ECHEC",
                        "attendu": attendu, "obtenu": n, "regle": cle,
                        "detail": "" if ok else f"{n} constat(s) {cle} au rendu"})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_rendu_large():
    """TF-1066 — les deux branches de V18, jouees a 2560 px (la ou elles se declenchent).

    Silencieux si playwright est absent : la mesure de lecture se prend dans un navigateur, pas en
    prose. Un `None` rendu ici ne vaut JAMAIS un vert — `main()` ne l'ajoute simplement pas au
    bilan, et l'absence de ces cas se lit dans le compte total.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import json as _json
    import subprocess
    import tempfile
    captures = tempfile.mkdtemp(prefix="self-test-4k-")
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    out = []
    for nom, paires in CAS_RENDU_LARGE.items():
        chemin = FIXTURES / nom
        etiquette = (lambda cle: f"{nom} · {cle}")
        if not chemin.exists():
            for cle, attendu in paires:
                out.append({"fixture": etiquette(cle), "verdict": "ABSENTE", "attendu": attendu,
                            "obtenu": 0, "detail": "fixture manquante"})
            continue
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(chemin),
                            "--widths", "2560", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            d = _json.loads(r.stdout)
        except Exception:  # noqa: BLE001
            for cle, attendu in paires:
                out.append({"fixture": etiquette(cle), "verdict": "ECHEC", "attendu": attendu,
                            "obtenu": 0, "detail": "render_page illisible"})
            continue
        for cle, attendu in paires:
            n = len(d["breakpoints"]["2560"]["issues"][cle])
            ok = (n >= attendu) if attendu else (n == 0)
            out.append({"fixture": etiquette(cle), "verdict": "OK" if ok else "ECHEC",
                        "attendu": attendu, "obtenu": n, "regle": cle + " (2560 px)",
                        "detail": "" if ok else f"{n} constat(s) {cle} a 2560 px"})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_repli_cartes():
    """TF-0442 — le repli en cartes du socle, mesuré à 390 px (là où il sert).

    Les autres cas de rendu se jouent à 1440 px : le repli ne s'y déclenche pas. Cette branche
    mesure la seule largeur où il compte.

    Ce que la mesure a APPRIS, et qui n'était pas la thèse de départ. La thèse était : « un
    conteneur `overflow-x: auto` ne fait pas passer V1, le repli en cartes le fait ». Mesuré le
    21/08 sur ces deux fixtures, avec le socle À JOUR : les DEUX rendent 0 constat V1 à 390 px.
    La raison est que le socle porte désormais `overflow-wrap: anywhere` sur les cellules — le
    tableau ne déborde plus, il s'ÉCRASE. La capture le montre sans discussion : huit colonnes
    réduites à un ou deux caractères par ligne, « Identifiant » rendu sur cinq lignes, et
    V1 PASS.

    Donc : le repli en cartes n'est PAS un correctif de débordement, c'est un correctif de
    LISIBILITÉ — et V1 est muet sur un tableau écrasé, même famille d'angle mort que TF-0440
    (une règle satisfaite sans être tenue). Le constat est versé au registre en candidat.

    Ce que ces deux cas verrouillent donc, en attendant :
      · le repli du socle ne CASSE rien (0 constat V1, la carte tient dans le viewport) ;
      · le cas sans repli est à 0 AUJOURD'HUI, et ce zéro est le défaut, pas le succès. Le jour
        où une règle saura voir l'écrasement, ce cas devra passer à >= 1 — et c'est ici qu'on
        le lira.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import json as _json
    import subprocess
    import tempfile
    captures = tempfile.mkdtemp(prefix="self-test-repli-")
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    cas = {
        "v1-tableau-repli-cartes.html": 0,   # replié : chaque ligne devient une carte
        # TF-0926 (08/09) — CE ZÉRO A ENFIN BOUGÉ, et c'est le scénario écrit ci-dessus qui
        # s'est produit : « le jour où une règle saura voir l'écrasement, ce cas devra passer
        # à >= 1 ». Ce n'est pas une règle neuve qui l'a vu, c'est la fixture qui a cessé de
        # mentir. Elle portait une copie FIGÉE du CSS du gabarit, prise le 21/08 ; TF-0724 D1
        # a retiré `overflow-wrap: anywhere` de `th, td` le 31/08, et la copie a continué
        # d'écraser dans son coin. Depuis que la feuille est POSÉE depuis le gabarit
        # (boilerplate.css, contrôle de parité), la mesure à 390 px rend le défaut réel :
        # `table` à 736 px de bord droit pour 390 px de fenêtre, 45 descendants avec elle.
        "v1-tableau-sans-repli.html": 1,     # non replié, et le débordement se VOIT enfin
    }
    out = []
    for nom, attendu in cas.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            out.append({"fixture": nom, "verdict": "ABSENTE", "attendu": attendu,
                        "obtenu": 0, "detail": "fixture manquante"})
            continue
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(chemin),
                            "--widths", "390", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            n = len(_json.loads(r.stdout)["breakpoints"]["390"]["issues"]["v1_overflow"])
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": attendu,
                        "obtenu": 0, "detail": "render_page illisible"})
            continue
        ok = n == attendu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC", "attendu": attendu,
                    "obtenu": n, "regle": "v1_overflow (390 px)",
                    "detail": "" if ok else f"{n} constat(s) v1_overflow à 390 px"})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_v1_bornes():
    """TF-0382 — les DEUX sens de la borne V1, en comptes EXACTS.

    `CAS_RENDU` teste « au moins n constats » : sur ces deux cas-là, un `>=` ne discriminerait
    rien — 16 entrees passeraient un `>= 4` aussi bien que 4. Or c'est precisement le nombre qui
    est en cause. D'ou une branche a part, a egalite stricte.

    Sens 1 — REGROUPEMENT : trois tableaux de gabarit identique, chacun portant 54 descendants
    debordants. Avant correction : 16 releves, tous dans le PREMIER tableau, les deux suivants
    jamais examines et rien ne le disait. Apres : 4 constats (le document + une cause par
    tableau), chacun annoncant ses descendants.

    Sens 2 — TRONCATURE DECLAREE : dix-neuf blocs FRERES, donc dix-neuf causes qu'aucun
    regroupement ne peut fusionner. Le plafond est alors atteint pour de vraies raisons, et le
    drapeau doit dire le compte exact — 20 defauts pour 17 lignes detaillees.

    Silencieux si playwright est absent : la borne se mesure dans un navigateur, pas en prose.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import json as _json
    import subprocess
    import tempfile
    captures = tempfile.mkdtemp(prefix="self-test-v1-bornes-")
    rendu = str(Path(__file__).resolve().parent / "render_page.py")

    def mesurer(nom):
        chemin = FIXTURES / nom
        if not chemin.exists():
            return None
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(chemin),
                            "--widths", "1440", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            return _json.loads(r.stdout)["breakpoints"]["1440"]
        except Exception:
            return None

    out = []
    groupe = mesurer("v1-trois-tableaux-debordants.html")
    if groupe is None:
        out.append({"fixture": "v1-trois-tableaux-debordants.html", "verdict": "ECHEC",
                    "attendu": 4, "obtenu": 0, "detail": "fixture absente ou rendu illisible"})
    else:
        n = len(groupe["issues"]["v1_overflow"])
        avec_descendants = [x for x in groupe["issues"]["v1_overflow"]
                            if "descendant(s) débordent AVEC lui" in x["detail"]]
        # Egalite stricte : 3 tableaux + le document. Et les trois tableaux doivent ANNONCER
        # leurs descendants, sinon le regroupement serait silencieux — on aurait remplace une
        # troncature muette par une fusion muette.
        ok = (n == 4 and len(avec_descendants) == 3
              and groupe["issues"].get("v1_tronque") is None
              and groupe["blocking"] == 4)
        out.append({"fixture": "v1-trois-tableaux-debordants.html",
                    "verdict": "OK" if ok else "ECHEC", "attendu": 4, "obtenu": n,
                    "regle": "v1_overflow (regroupement par sous-arbre)",
                    "detail": "" if ok else (f"{n} constat(s) au lieu de 4, "
                                             f"{len(avec_descendants)} annoncant des descendants "
                                             f"au lieu de 3, blocking {groupe['blocking']}")})

    borne = mesurer("v1-dix-neuf-causes-independantes.html")
    if borne is None:
        out.append({"fixture": "v1-dix-neuf-causes-independantes.html", "verdict": "ECHEC",
                    "attendu": 20, "obtenu": 0, "detail": "fixture absente ou rendu illisible"})
    else:
        t = borne["issues"].get("v1_tronque")
        # Le compte EXACT est ce qui dit l'ampleur ; la liste, elle, est plafonnee. Les deux
        # doivent etre lisibles, et `blocking` doit suivre le compte, pas la liste.
        ok = bool(t) and t["total"] == 20 and t["detaillees"] == 17 and t["plafond"] == 16 \
            and borne["blocking"] == 20 and "TRONQUÉ" in t["motif"]
        out.append({"fixture": "v1-dix-neuf-causes-independantes.html",
                    "verdict": "OK" if ok else "ECHEC", "attendu": 20,
                    "obtenu": (t or {}).get("total", 0),
                    "regle": "v1_tronque (borne declaree)",
                    "detail": "" if ok else f"drapeau {t!r}, blocking {borne['blocking']}"})

    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_glyphes_du_socle():
    """TF-0490 (22/08/2026) — LE SOCLE NE PROPAGE PAS UN GLYPHE QU'IL INTERDIT.

    Le fait fondateur, et c'est une CONFIRMATION : le lot du 20/08 avait signalé un chevron
    absent des piles de repli déclarées (TF-0435), corrigé en passant tout le socle à `›`
    (U+203A). Le 22/08, le même défaut revient — un producteur reprend le composant
    `details`/`summary` du socle, recopie les triangles de l'exemple, et hérite du risque.

    LA CAUSE N'EST PAS LE PRODUCTEUR : c'est que rien ne juge les EXEMPLES du socle. `L15` juge
    les glyphes en `content:` CSS d'une page produite ; personne ne juge ceux que le socle offre
    à la copie. Un exemple est une prescription silencieuse : ce qu'il montre sera repris.

    CE QUI EST JUGÉ, et la borne est délibérée : les BLOCS DE CODE des références (ce qu'on
    recopie) et les FIXTURES (ce qui sert de modèle). PAS la prose des références : les marqueurs
    de gravité de `bonnes-pratiques.md` (🔴 🟡 ⚪) sont la LÉGENDE du document, pas un exemple —
    personne ne les recopie dans un livrable, et les interdire dégraderait la référence sans rien
    gagner. Un contrôle qui déborde de son domaine se fait désactiver.
    """
    from check_html import GLYPHES_SURS
    racine = Path(__file__).resolve().parent.parent
    cibles = sorted((racine / 'references').rglob('*.md')) + sorted((racine / 'fixtures').rglob('*.html'))
    fautifs = {}
    for f in cibles:
        texte = f.read_text(encoding='utf-8')
        dans_code = False
        # TF-0926 (08/09) — un bloc POSÉ par `embarquer-composants.mjs` n'est pas un exemple
        # ÉCRIT dans la fixture : c'est la source elle-même, recopiée sous contrôle de parité.
        # La juger ici la jugerait DEUX FOIS et au mauvais endroit — la source vit dans
        # `assets/`, hors du domaine délibéré de ce contrôle (« les blocs de code des
        # références et les fixtures »). Le fait : dès que la feuille du gabarit a été posée
        # dans les deux fixtures V1, le séparateur de commentaire `──` (U+2500) du gabarit est
        # devenu un glyphe « d'exemple » — un faux positif né du contrôle de parité lui-même.
        dans_bloc_pose = False
        for i, ligne in enumerate(texte.split('\n'), 1):
            if f.suffix == '.html':
                if 'COMPOSANT-EMBARQUE:DEBUT' in ligne:
                    dans_bloc_pose = True
                    continue
                if 'COMPOSANT-EMBARQUE:FIN' in ligne:
                    dans_bloc_pose = False
                    continue
                if dans_bloc_pose:
                    continue
            if f.suffix == '.md':
                if ligne.strip().startswith('```'):
                    dans_code = not dans_code
                    continue
                if not dans_code:
                    # On ne lit QUE le contenu des spans de code, jamais la ligne entière : un
                    # marqueur de gravité en tête de puce (« - 🔴 Ouvrir par `<!DOCTYPE html>` »)
                    # n'est pas un exemple recopié, et juger la ligne le condamnait à tort.
                    ligne = ' '.join(re.findall(r'`([^`]+)`', ligne))
                    if not ligne:
                        continue
            for ch in set(ligne):
                if ord(ch) > 0x00FF and ch not in GLYPHES_SURS:
                    fautifs.setdefault(ch, []).append(f'{f.name}:{i}')
    if not fautifs:
        return [{'fixture': 'socle (références + fixtures)', 'verdict': 'OK',
                 'attendu': 'aucun glyphe hors liste blanche dans un exemple',
                 'obtenu': f'{len(cibles)} fichier(s) relus', 'regle': 'TF-0490 glyphes du socle',
                 'detail': ''}]
    detail = ' · '.join(f'U+{ord(c):04X} ({"/".join(o[:2])})' for c, o in sorted(fautifs.items()))
    return [{'fixture': 'socle (références + fixtures)', 'verdict': 'ECHEC',
             'attendu': 'aucun glyphe hors liste blanche dans un exemple',
             'obtenu': f'{len(fautifs)} glyphe(s)', 'regle': 'TF-0490 glyphes du socle',
             'detail': detail}]


def run_markdown():
    """TF-0518 (22/08/2026) — LA PORTE DU MARKDOWN, ouverte et jouée dans les deux sens.

    Le registre compte 48 domaines ; mesuré sur un livrable réel de 85 Ko, le lanceur en jugeait
    QUATRE et aucun de lisibilité. Les règles L1-L19 vivent dans `check_html.py`, qui ne
    s'exécute que sur du HTML — or le Markdown est le format de livraison DOMINANT des runs
    d'architecture et de conseil, et c'est exactement là que le défaut du retour jumeau (un
    identifiant sans son sens) s'est produit. Un humain l'a trouvé, comme pour L14.

    La paire rouge/verte porte le MÊME contenu à trois différences près, pour que ce qui est
    jugé soit isolé : un chapitre qui ouvre sur un tableau nu, un marqueur de balisage interne
    resté dans le texte, et un code employé sans son sens.
    """
    outil = Path(__file__).resolve().parent / 'check_markdown.py'
    fx = Path(__file__).resolve().parent.parent / 'fixtures'
    out = []
    # TF-0720 (31/08) — LE BALISAGE D'EMPHASE EST TRAITE COMME DU TEXTE, deuxieme fois que ca
    # casse une adjacence. Les deux fixtures portent le MEME document a deux differences pres :
    # dans la verte, `**RD-23**` porte sa glose en italique juste apres (les quatre marqueurs de
    # gras rompaient l'adjacence) et `RA-16` porte la sienne A LA LIGNE SUIVANTE (le controle
    # travaillait ligne par ligne, donc n'avait aucune suite a examiner) ; dans la rouge, les
    # deux memes jetons sont VRAIMENT muets. Mesure du 02/09 : la verte rendait FAIL sur DEUX
    # faux positifs avant correction, PASS apres, et la rouge mord toujours sur les deux — sans
    # la rouge, neutraliser l'emphase aurait pu eteindre la regle en silence.
    attendus = {'m-lisibilite-rouge.md': {'M7', 'M14', 'M18'}, 'm-lisibilite-vert.md': set(),
                'm18-emphase-rouge.md': {'M18'}, 'm18-emphase-vert.md': set()}
    for nom, attendu in attendus.items():
        cible = fx / nom
        if not cible.exists():
            out.append({'fixture': nom, 'verdict': 'ECHEC', 'attendu': 'fixture présente',
                        'obtenu': 'absente', 'regle': 'M (markdown)', 'detail': ''})
            continue
        r = subprocess.run([sys.executable, str(outil), str(cible), '--output', 'json'],
                           capture_output=True, text=True, encoding='utf-8', timeout=60)
        try:
            j = json.loads(r.stdout)
        except Exception:
            out.append({'fixture': nom, 'verdict': 'ECHEC', 'attendu': 'sortie JSON',
                        'obtenu': 'illisible', 'regle': 'M (markdown)', 'detail': (r.stderr or '')[:160]})
            continue
        obtenus = {m.split()[0] for m in j.get('fails', [])}
        ok = obtenus == attendu
        out.append({'fixture': nom, 'verdict': 'OK' if ok else 'ECHEC',
                    'attendu': ','.join(sorted(attendu)) or '(aucune règle)',
                    'obtenu': ','.join(sorted(obtenus)) or '(aucune)',
                    'regle': 'M (markdown)', 'detail': ''})
    out += run_emphase_partagee()
    return out


def run_emphase_partagee():
    """TF-0720 — LA FONCTION PARTAGEE, jugee pour elle-meme et dans les deux sens.

    Le retour porte DEUX manifestations d'une seule cause : un jeton en gras refuse par M18, et
    une cellule `**90**` que l'oracle Calculs ne lisait pas comme un nombre (re-somme a 189 au
    lieu de 99, signalee le 22/08). Les fixtures ci-dessus jugent la premiere ; cette branche
    juge la SECONDE ET LES BORNES, qu'aucun document entier ne montre proprement :

      · un nombre en gras est lu comme un nombre, et la re-somme retombe juste ;
      · les POSITIONS sont preservees — sans quoi lignes et colonnes d'un message d'echec
        mentiraient, et le correctif couterait plus cher que le defaut ;
      · une puce `* premier` et un `nom_de_variable` ne sont PAS de l'emphase : le sens rouge
        est ici, une neutralisation trop large mangerait le document au lieu de son balisage.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from check_markdown import neutraliser_emphase, nombres_de  # noqa: PLC0415

    cas = []
    ligne = '| total | **90** |'
    cas.append(('VERT   `**90**` lu comme un nombre (re-somme)', nombres_de(ligne) == ['90'],
                repr(nombres_de(ligne))))
    somme = [float(x) for x in nombres_de('| relecture | **40** | correction | **50** |')]
    cas.append(('VERT   la re-somme retombe juste (40 + 50 = 90)',
                sum(somme) == 90.0, repr(somme)))
    src = 'le jeton **RD-23** *(glose)* et un _mot_ en italique'
    cas.append(('VERT   positions preservees (meme longueur)',
                len(neutraliser_emphase(src)) == len(src),
                f'{len(neutraliser_emphase(src))} != {len(src)}'))
    cas.append(('VERT   les marqueurs disparaissent, le contenu reste',
                'RD-23' in neutraliser_emphase(src) and '**' not in neutraliser_emphase(src),
                neutraliser_emphase(src)))
    cas.append(('ROUGE  une puce `* premier` n est pas de l emphase',
                neutraliser_emphase('* premier') == '* premier',
                neutraliser_emphase('* premier')))
    cas.append(('ROUGE  `nom_de_variable` garde ses tirets bas',
                neutraliser_emphase('nom_de_variable') == 'nom_de_variable',
                neutraliser_emphase('nom_de_variable')))
    return [{'fixture': nom, 'verdict': 'OK' if tenu else 'ECHEC',
             'attendu': 'emphase neutralisee, positions justes',
             'obtenu': 'conforme' if tenu else 'ecart',
             'regle': 'TF-0720 fonction partagee', 'detail': '' if tenu else str(detail)[:200]}
            for nom, tenu, detail in cas]

def run_matrice_etats():
    """TF-0493 (23/08/2026) — LA MATRICE D'ETATS, et les deux defauts qu'un client a trouves.

    Les deux etaient reproductibles en deux clics, et invisibles au rendu par defaut :
      (1) le panneau de filtre CREE un ascenseur horizontal a l'ouverture ;
      (2) le bouton « Aucun » DETRUIT l'affichage, sans un mot.
    `--etats-ouverts` existait et avait ete utilise : il ouvre le PREMIER panneau et ne produit
    aucun etat d'echec. Or c'est la que les composants cassent, parce que personne ne les
    regarde.

    LE CAS QUI PORTE LA DEMONSTRATION est le panneau debordant : la MEME page rend 0 constat sur
    « filtre-premiere-colonne » et 2 sur « filtre-derniere-colonne ». Un panneau ne deborde pas
    du meme cote a droite qu'a gauche — ouvrir le premier ne prouve donc rien du dernier, et
    c'est exactement ce que faisait l'ancienne option.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import tempfile
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    captures = tempfile.mkdtemp(prefix="self-test-matrice-")
    # fixture -> etat -> (famille, compte attendu)
    CAS = {
        "mat-aucun-muet.html": {"filtre-sans-resultat": ("etat_muet", 1)},
        "mat-aucun-annonce.html": {"filtre-sans-resultat": ("etat_muet", 0)},
        "mat-panneau-deborde.html": {"filtre-derniere-colonne": ("v1_overflow", 2),
                                     "filtre-premiere-colonne": ("v1_overflow", 0)},
        "mat-panneau-ancre-droite.html": {"filtre-derniere-colonne": ("v1_overflow", 0)},
    }
    out = []
    for nom, attendus in CAS.items():
        cible = FIXTURES / nom
        if not cible.exists():
            out.append({"fixture": nom, "verdict": "ABSENTE", "attendu": "fixture présente",
                        "obtenu": "absente", "regle": "matrice d états", "detail": ""})
            continue
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(cible), "--widths", "1440",
                            "--matrice-etats", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            etats = json.loads(r.stdout)["breakpoints"]["1440"]["etats"]
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": "matrice lisible",
                        "obtenu": "illisible", "regle": "matrice d états",
                        "detail": (r.stderr or r.stdout or "")[:160]})
            continue
        for etat, (famille, attendu) in attendus.items():
            e = etats.get(etat) or {}
            if not e.get("applique"):
                out.append({"fixture": f"{nom} · {etat}", "verdict": "ECHEC",
                            "attendu": f"état joué ({famille} ×{attendu})",
                            "obtenu": "NON JOUÉ", "regle": "matrice d états",
                            "detail": e.get("motif", "état absent de la matrice")})
                continue
            n = len(e.get("issues", {}).get(famille, []))
            ok = (n >= attendu) if attendu else (n == 0)
            out.append({"fixture": f"{nom} · {etat}", "verdict": "OK" if ok else "ECHEC",
                        "attendu": attendu, "obtenu": n, "regle": f"{famille} (état)",
                        "detail": "" if ok else f"{n} constat(s) {famille} dans l état {etat}"})
    # Un etat NON JOUE se DECLARE : sur une page sans composant, la matrice ne doit pas rendre
    # « aucun defaut » — ce serait le pire des verdicts. On le verifie sur une fixture nue.
    nue = FIXTURES / "l2fr-freres-alignes.html"
    if nue.exists():
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(nue), "--widths", "1440",
                            "--matrice-etats", "--output", "json", "--out", captures],
                           capture_output=True, text=True, encoding="utf-8")
        try:
            j = json.loads(r.stdout)
            etats = j["breakpoints"]["1440"]["etats"]
            joues = [n for n, e in etats.items() if e.get("applique")]
            declares = [x for x in j.get("non_juge", []) if "NON JOUE" in x]
            ok = not joues and len(declares) >= 5
            out.append({"fixture": "page sans composant · tous les états", "verdict": "OK" if ok else "ECHEC",
                        "attendu": "0 état joué, chacun DÉCLARÉ au non_juge",
                        "obtenu": f"{len(joues)} joué(s), {len(declares)} déclaré(s)",
                        "regle": "matrice d états", "detail": ""})
        except Exception:
            out.append({"fixture": "page sans composant", "verdict": "ECHEC",
                        "attendu": "matrice lisible", "obtenu": "illisible",
                        "regle": "matrice d états", "detail": ""})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_filtres_runtime():
    """TF-0768/0769/0781/0782 (02/09/2026) — LE COMPOSANT DE FILTRES, JOUE DANS UN NAVIGATEUR.

    Les quatre defauts remontes par un produit sont des defauts d'EXECUTION : un tri qui range
    « 1 000 » avant « 250 », une facette de mois rangee par ordre alphabetique, une colonne cle
    sans facette, un second `init` qui rend `null`. Aucun oracle statique ne peut les voir — le
    marquage etait juste, c'est le COMPORTEMENT qui etait faux. Ces cas chargent donc l'ASSET
    REEL (`assets/table-filters.js`) dans Chromium et mesurent ce qu'il fait.

    CHAQUE CAS PORTE SON SENS ROUGE, et deux d'entre eux le portent DANS LA PAGE : la fixture
    calcule elle-meme l'ordre qu'aurait rendu l'ancienne lecture (parseFloat sur le texte brut,
    tri alphabetique des valeurs) et le banc EXIGE que l'ordre rendu en differe. Sans cette
    contre-epreuve, un ordre juste par hasard validerait une regle qui ne tient pas.

    Silencieux si playwright est absent : un comportement se mesure dans un navigateur.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from render_page import ensure_browser_path  # noqa: PLC0415
        ensure_browser_path()
    except Exception:  # noqa: BLE001 — l'auto-detection du navigateur est un confort, pas un du
        pass

    out = []

    def cas(nom, attendu, obtenu, regle):
        ok = attendu == obtenu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": str(attendu)[:120], "obtenu": str(obtenu)[:120],
                    "regle": regle,
                    "detail": "" if ok else f"attendu {attendu!r}, obtenu {obtenu!r}"[:300]})

    def proteger(nom, regle, fn):
        """Un composant qui LEVE est un composant EN ECHEC, pas un banc casse.

        Mesure du 02/09 : rejoue sur l'asset d'avant correctif, `api.etat()` n'existe pas et
        l'exception emportait les cas suivants — le banc rendait une trace Playwright au lieu
        d'un compte. Chaque section porte donc sa garde, et une panne se compte comme un echec
        nomme."""
        try:
            fn()
        except Exception as erreur:  # noqa: BLE001 — toute panne se compte, aucune n'arrete
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": "section jouee",
                        "obtenu": type(erreur).__name__, "regle": regle,
                        "detail": str(erreur).splitlines()[0][:300]})

    fichiers = ("tf-tri-milliers.html", "tf-facettes-ordre.html", "tf-etat-rejoue.html",
                "tf-th-sticky-preserve.html")
    manquantes = [n for n in fichiers if not (FIXTURES / n).exists()]
    for n in manquantes:
        out.append({"fixture": n, "verdict": "ABSENTE", "attendu": "fixture présente",
                    "obtenu": "absente", "regle": "filtres (runtime)", "detail": ""})
    if manquantes:
        return out

    with sync_playwright() as pw:
        navigateur = pw.chromium.launch()
        page = navigateur.new_page(viewport={"width": 1280, "height": 900})

        # ---- TF-0768 : le tri lit une VALEUR, pas un texte formate ----------------------
        def section_tri():
            page.goto((FIXTURES / "tf-tri-milliers.html").resolve().as_uri())
            page.wait_for_load_state("load")
            page.evaluate("() => document.querySelectorAll('#volumes thead th')[1].click()")
            rendu = page.evaluate("() => [...document.querySelectorAll('#volumes tbody tr')]"
                                  ".map(tr => tr.cells[1].textContent.trim())")
            attendu = page.evaluate(
                "() => [...document.querySelectorAll('#volumes tbody tr')]"
                ".map(tr => tr.cells[1].textContent.trim())"
                ".sort((a, b) => parseFloat(a.replace(/\\s/g, '')) - parseFloat(b.replace(/\\s/g, '')))")
            cas("tf-tri-milliers · ordre numerique", attendu, rendu, "TF-0768 tri")
            naif = page.evaluate("() => window.__ordreNaif(1)")
            cas("tf-tri-milliers · l'ancienne lecture DIFFERE (sens rouge)", True, naif != rendu,
                "TF-0768 contre-epreuve")
            page.evaluate("() => document.querySelectorAll('#volumes thead th')[3].click()")
            debits = page.evaluate("() => [...document.querySelectorAll('#volumes tbody tr')]"
                                   ".map(tr => tr.cells[3].textContent.trim())")
            cas("tf-tri-milliers · data-v prime sur le texte",
                ["un", "deux", "trois", "quatre", "cinq", "six"], debits, "TF-0768 cle declaree")

        proteger("tf-tri-milliers.html", "TF-0768", section_tri)

        # ---- TF-0781 / TF-0782 : ordre des facettes, et facette de la colonne cle -------
        def section_facettes():
            page.goto((FIXTURES / "tf-facettes-ordre.html").resolve().as_uri())
            page.wait_for_load_state("load")
            mois = page.evaluate("() => [...document.querySelectorAll('#fenetres thead th')[1]"
                                 ".querySelectorAll('.tf-opts label')].map(l => l.textContent.trim())")
            cas("tf-facettes-ordre · mois chronologiques",
                ["août 2025", "déc. 2025", "janv. 2026", "avr. 2026"], mois, "TF-0781 ordre")
            alpha = page.evaluate("() => window.__ordreAlphabetique(1)")
            cas("tf-facettes-ordre · l'ordre alphabetique DIFFERE (sens rouge)", True, alpha != mois,
                "TF-0781 contre-epreuve")
            cle = page.evaluate("() => { const th = document.querySelectorAll('#fenetres thead th')[0];"
                                " const p = th.querySelector('.tf-panel');"
                                " return { bouton: !!th.querySelector('.tf-btn'),"
                                "          forme: p && p.getAttribute('data-tf-forme'),"
                                "          valeurs: p ? p.querySelectorAll('.tf-opt').length : 0 }; }")
            cas("tf-facettes-ordre · la colonne CLE porte sa facette",
                {"bouton": True, "forme": "liste", "valeurs": 8}, cle, "TF-0782 existence")
            exempt = page.evaluate("() => { const th = document.querySelectorAll('#fenetres thead th')[3];"
                                   " const ex = (window.__tf.exemptions || [])[0] || {};"
                                   " return { bouton: !!th.querySelector('.tf-btn'),"
                                   "          motif: (ex.motif || '').length > 20,"
                                   "          colonne: ex.colonne }; }")
            cas("tf-facettes-ordre · exemption DECLAREE avec motif",
                {"bouton": False, "motif": True, "colonne": "Référence"}, exempt, "TF-0782 exemption")

        proteger("tf-facettes-ordre.html", "TF-0781/0782", section_facettes)

        # ---- TF-0769 : l'etat se lit, se rejoue, et survit a un re-rendu ----------------
        def section_etat():
            page.goto((FIXTURES / "tf-etat-rejoue.html").resolve().as_uri())
            page.wait_for_load_state("load")
            vu = page.evaluate("""() => {
              const th = document.querySelectorAll('#lots thead th')[1];
              const cb = [...th.querySelectorAll('.tf-opt')].find(x => x.value === 'livré');
              cb.checked = false;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              return { etat: window.__tf.etat(),
                       visibles: [...document.querySelectorAll('#lots tbody tr')]
                         .filter(tr => !tr.hasAttribute('data-tf-hidden')
                                    && !tr.hasAttribute('data-tf-empty')).length };
            }""")
            cas("tf-etat-rejoue · etat() nomme les valeurs exclues",
                {"Statut": {"exclues": ["livré"]}}, vu["etat"]["colonnes"], "TF-0769 etat")
            cas("tf-etat-rejoue · trois lignes visibles apres exclusion", 3, vu["visibles"],
                "TF-0769 etat")
            apres = page.evaluate("""() => {
              document.getElementById('rerendre').click();
              window.__tf.rafraichir();
              return { caches: document.querySelectorAll('#lots tbody tr[data-tf-hidden]').length,
                       restant: [...document.querySelectorAll('#lots tbody tr')]
                         .filter(tr => !tr.hasAttribute('data-tf-hidden')
                                    && !tr.hasAttribute('data-tf-empty')).length,
                       etat: window.__tf.etat().colonnes };
            }""")
            cas("tf-etat-rejoue · la selection SURVIT au re-rendu",
                {"caches": 2, "restant": 4, "exclues": ["livré"]},
                {"caches": apres["caches"], "restant": apres["restant"],
                 "exclues": (apres["etat"].get("Statut") or {}).get("exclues")},
                "TF-0769 rafraichir")
            meme = page.evaluate(
                "() => DigitAITableFilters.init(document.getElementById('lots')) === window.__tf")
            cas("tf-etat-rejoue · un second init rend l'INSTANCE, plus null (sens rouge)", True, meme,
                "TF-0769 re-init")
            rejoue = page.evaluate("""() => {
              const t = document.getElementById('lots');
              const etat = window.__tf.etat();
              window.__tf.detruire();
              const api = DigitAITableFilters.init(t, { etat: etat });
              return { exclues: (api.etat().colonnes['Statut'] || {}).exclues,
                       caches: t.querySelectorAll('tbody tr[data-tf-hidden]').length };
            }""")
            cas("tf-etat-rejoue · init(table, { etat }) rejoue la selection",
                {"exclues": ["livré"], "caches": 2}, rejoue, "TF-0769 rejouabilite")

        proteger("tf-etat-rejoue.html", "TF-0769", section_etat)

        # ---- TF-0899 : l ancrage du panneau n ECRASE PLUS le thead collant du socle -----
        def section_ancrage():
            page.goto((FIXTURES / "tf-th-sticky-preserve.html").resolve().as_uri())
            page.wait_for_load_state("load")
            colle = page.evaluate(
                "() => { const th = document.querySelectorAll('#colle thead th')[0];"
                " return { calculee: getComputedStyle(th).position,"
                "          en_ligne: th.style.position || '' }; }")
            cas("tf-th-sticky-preserve · le thead collant SURVIT a init",
                {"calculee": "sticky", "en_ligne": ""}, colle, "TF-0899 ancrage")
            naive = page.evaluate("() => window.__poseNaive()")
            cas("tf-th-sticky-preserve · l ancienne pose DIFFERE (sens rouge)",
                True, naive == "relative" and naive != colle["calculee"],
                "TF-0899 contre-epreuve")
            libre = page.evaluate(
                "() => getComputedStyle(document.querySelectorAll('#libre thead th')[0]).position")
            cas("tf-th-sticky-preserve · un th `static` recoit toujours son ancrage",
                "relative", libre, "TF-0899 affordance conservee")
            ancre = page.evaluate("""() => {
              const res = {};
              for (const id of ['colle', 'libre']) {
                const th = document.querySelectorAll('#' + id + ' thead th')[0];
                th.querySelector('.tf-btn').click();
                const p = th.querySelector('.tf-panel');
                res[id] = !p.hidden && p.offsetParent === th;
              }
              return res;
            }""")
            cas("tf-th-sticky-preserve · le panneau reste ancre dans son th (deux cas)",
                {"colle": True, "libre": True}, ancre, "TF-0899 ancrage")

        proteger("tf-th-sticky-preserve.html", "TF-0899", section_ancrage)

        page.close()
        navigateur.close()
    return out


# TF-0909 (lot Produit-10 20260908a) — L30 : une page de COUVERTURE affiche son DENOMINATEUR.
# Jugee dans sa propre branche, et sur des COMPTES EXACTS : la regle porte quatre constats
# distincts (couverture partielle, denominateur jamais affiche, aucun compte de manquants,
# renvoi hors page) et un ensemble de codes ne dirait pas lequel a mordu. Comme pour S1, on ne
# compare QUE les codes L30 : ces fixtures sont minimales, et le bruit des autres regles de
# lisibilite masquerait le seul point qu'elles prouvent.
CAS_COUVERTURE = {
    # la MEME page, rendue lisible : denominateur declare, affiche, manquants comptes
    "l30-couverture-declaree.html": {"fails": 0, "warns": 0},
    # la forme exacte du cas paye : 342 declares, 4 rendus, rien d'affiche, rien de compte
    "l30-couverture-muette.html": {"fails": 3, "warns": 1},
    # le cas paye ne portait AUCUN marquage — c'est ce qui l'a laisse passer
    "l30-mapping-non-declare.html": {"fails": 0, "warns": 2},
}


def run_couverture():
    """Cas a double sens de L30 (TF-0909), en comptes exacts de constats L30."""
    resultats = []
    for nom, attendu in CAS_COUVERTURE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE",
                              "attendu": f"{attendu['fails']} FAIL / {attendu['warns']} WARN",
                              "obtenu": "absente", "regle": "L30", "detail": "fixture manquante"})
            continue
        fails, warns = check(chemin.read_text(encoding="utf-8"), regles="L")
        f30 = [x for x in fails if x.startswith("L30")]
        w30 = [x for x in warns if x.startswith("L30")]
        ok = len(f30) == attendu["fails"] and len(w30) == attendu["warns"]
        resultats.append({
            "fixture": nom,
            "verdict": "OK" if ok else "ECHEC",
            "attendu": f"{attendu['fails']} FAIL / {attendu['warns']} WARN",
            "obtenu": f"{len(f30)} FAIL / {len(w30)} WARN",
            "regle": "L30 couverture",
            "detail": "" if ok else " | ".join(f30 + w30)[:400],
        })
    return resultats


# TF-0901 — complement STATIQUE de L29 : un script embarque qui pose `style.position` alors que
# la feuille declare un `<th>` collant. Comptes exacts d'avertissements de cette seule famille :
# les deux fixtures ne different QUE par la garde sur la position calculee, et la verte existe
# pour verrouiller que l'avertissement n'accuse PAS le correctif — un controle qui accuse ce
# qu'il prescrit se fait eteindre.
CAS_L29_TER = {
    "l29t-pose-nue.html": 1,
    "l29t-pose-gardee.html": 0,
}


def run_l29_ter():
    """Cas a double sens du complement statique de L29 (TF-0901)."""
    resultats = []
    for nom, attendu in CAS_L29_TER.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": attendu,
                              "obtenu": "absente", "regle": "L29 ter", "detail": "fixture manquante"})
            continue
        fails, warns = check(chemin.read_text(encoding="utf-8"), regles="L")
        n = len([x for x in warns if x.startswith("L29 un script")])
        # La fixture doit rester VERTE par ailleurs : un echec L parasite rendrait le cas
        # trompeur — on croirait mesurer la pose de position, on mesurerait un oubli de gabarit.
        parasites = [x for x in fails if x.startswith("L")]
        ok = n == attendu and not parasites
        resultats.append({
            "fixture": nom, "verdict": "OK" if ok else "ECHEC",
            "attendu": f"{attendu} avert. L29 ter", "obtenu": f"{n} avert. L29 ter",
            "regle": "L29 ter (pose en ligne)",
            "detail": "" if ok else " | ".join(parasites + warns)[:400],
        })
    return resultats


# TF-1049 (11/09) — la police Syne se juge sur sa DÉCLARATION, jamais sur le mot. Rouge : la
# feuille la déclare. Verte : le texte cite la règle « jamais Syne » sans rien déclarer — le
# cas de la page du registre du pilot, restée rouge une journée.
CAS_SYNE = {
    "syne-declaree-feuille.html": True,
    "syne-citee-en-texte.html": False,
}


def run_syne():
    """Cas a double sens de la règle Syne (TF-1049)."""
    resultats = []
    for nom, attendu in CAS_SYNE.items():
        chemin = FIXTURES / nom
        if not chemin.exists():
            resultats.append({"fixture": nom, "verdict": "ABSENTE", "attendu": attendu,
                              "obtenu": "absente", "regle": "Syne", "detail": "fixture manquante"})
            continue
        fails, _ = check(chemin.read_text(encoding="utf-8"), regles="charte")
        obtenu = any(f.startswith("Police Syne") for f in fails)
        # la fixture est charte-verte par ailleurs : un autre échec rendrait le cas trompeur
        parasites = [f for f in fails if not f.startswith("Police Syne")]
        ok = obtenu == attendu and not parasites
        resultats.append({
            "fixture": nom, "verdict": "OK" if ok else "ECHEC",
            "attendu": "Syne déclarée" if attendu else "aucun échec",
            "obtenu": "Syne déclarée" if obtenu else "aucun échec",
            "regle": "Syne (déclaration)",
            "detail": "" if ok else " | ".join(fails)[:400],
        })
    return resultats


def run_poseur_composants():
    """TF-0890 — LE POSEUR DE COMPOSANTS S'IMPORTE, ET POSE HORS DU DEPOT DES SKILLS.

    Le module exportait `blocCanonique`, `echapper` et `sha`, mais son analyse d'arguments
    s'executait A L'IMPORT : tout `import { blocCanonique }` terminait le processus avec le code
    2 AVANT le premier appel. Et `--ecrire` ne parcourait que l'arbre des skills. Un produit qui
    voulait embarquer trois composants du socle dans son livrable a donc REIMPLEMENTE le format
    du bloc en Python — marqueurs, echappement de la balise de script fermante, attributs
    `data-composant` et `data-empreinte`. Copie conforme au format, produite par un SECOND
    OUTIL : la classe de defaut exacte que ce script existe pour eliminer.

    QUATRE CAS, chacun a double sens :
      1. l'import ne tue plus le processus (sens rouge : c'etait exit 2) — et il rend un bloc
         canonique identique a celui que produit la ligne de commande ;
      2. la garde n'a PAS supprime le controle d'usage : execute sans drapeau, le script rend
         toujours 2 (sinon on aurait echange un defaut contre un autre) ;
      3. `--poser` pose dans une page QUELCONQUE, hors de l'arbre des skills : la feuille avant
         la fermeture de l'en-tete, le script avant celle du corps ;
      4. `--constat <page>` rejoue la parite sur ce meme fichier — PASS tel quel, et FAIL des
         qu'un octet du bloc bouge. C'est ce quatrieme cas qui prouve que la parite est jouable
         des DEUX cotes par le meme code.
    Silencieux si node est absent : le poseur est un module Node.
    """
    if not shutil.which("node"):
        return None
    import subprocess
    import tempfile
    poseur = str(Path(__file__).resolve().parent / "embarquer-composants.mjs")
    out = []

    def cas(nom, attendu, obtenu, regle, detail=""):
        ok = attendu == obtenu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": str(attendu)[:96], "obtenu": str(obtenu)[:96], "regle": regle,
                    "detail": "" if ok else (detail or f"attendu {attendu!r}, obtenu {obtenu!r}")[:300]})

    # ---- 1 et 2 : le module s'importe, et le script refuse toujours un appel sans drapeau ----
    script = ("import { blocCanonique } from " + json.dumps(Path(poseur).resolve().as_uri())
              + "; process.stdout.write(blocCanonique('sonde.js', 'const a = 1;'));")
    imp = subprocess.run(["node", "--input-type=module", "-e", script],
                         capture_output=True, text=True, encoding="utf-8")
    cas("poseur · l'import n'arrete plus le processus (sens rouge : exit 2)",
        0, imp.returncode, "TF-0890 API", (imp.stderr or "").splitlines()[-1:] and imp.stderr[-280:])
    cas("poseur · l'import rend bien le bloc canonique",
        True, "COMPOSANT-EMBARQUE:DEBUT sonde.js" in imp.stdout
              and 'data-composant="sonde.js"' in imp.stdout, "TF-0890 API")
    nu = subprocess.run(["node", poseur], capture_output=True, text=True, encoding="utf-8")
    cas("poseur · sans drapeau, l'usage est toujours refuse (la garde n'a rien eteint)",
        2, nu.returncode, "TF-0890 point d'entree", nu.stderr[-280:])

    # ---- 3 et 4 : poser hors de l'arbre des skills, puis rejouer la parite dessus ------------
    atelier = tempfile.mkdtemp(prefix="self-test-poseur-")
    try:
        page = Path(atelier) / "livrable-hors-skills.html"
        page.write_text(
            '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n'
            "<title>Digit-AI — pose hors depot · essai — 20260908a</title>\n</head>\n"
            "<body>\n<h1>Essai</h1>\n</body>\n</html>\n", encoding="utf-8")
        pose = subprocess.run(
            ["node", poseur, "--poser", str(page),
             "--composants", "table-filters.css,table-filters.js"],
            capture_output=True, text=True, encoding="utf-8")
        cas("poseur · --poser aboutit sur une page hors arbre des skills",
            0, pose.returncode, "TF-0890 --poser", (pose.stderr or pose.stdout)[-280:])
        html = page.read_text(encoding="utf-8")
        place = {
            "style avant la fermeture de l'en-tete":
                0 < html.find('data-composant="table-filters.css"') < html.find("</head>"),
            "script avant la fermeture du corps":
                html.find("</head>") < html.find('data-composant="table-filters.js"') < html.find("</body>"),
        }
        cas("poseur · chaque bloc est pose la ou il doit vivre",
            {k: True for k in place}, place, "TF-0890 --poser")

        vert = subprocess.run(["node", poseur, "--constat", str(page)],
                              capture_output=True, text=True, encoding="utf-8")
        cas("poseur · --constat rejoue la parite hors arbre des skills (sens vert)",
            0, vert.returncode, "TF-0890 parite", vert.stdout[-280:])
        # SENS ROUGE : un seul octet du bloc suffit a rompre la parite. Sans ce cas, un `--constat`
        # qui rendrait 0 sur n'importe quoi passerait pour une preuve.
        page.write_text(html.replace("data-composant=\"table-filters.js\"",
                                     "data-composant=\"table-filters.js\" data-derive=\"1\"", 1),
                        encoding="utf-8")
        rouge = subprocess.run(["node", poseur, "--constat", str(page)],
                               capture_output=True, text=True, encoding="utf-8")
        cas("poseur · un octet modifie ROMPT la parite (sens rouge)",
            (1, True), (rouge.returncode, "PÉRIMÉE" in rouge.stdout), "TF-0890 parite",
            rouge.stdout[-280:])

        # ---- TF-0926 : la FEUILLE DU GABARIT, source synthetique `boilerplate.css` ----------
        #
        # Deux fixtures du socle portaient une copie FIGEE du CSS de `assets/boilerplate.html`,
        # prise le 21/08 : 91 lignes du gabarit y manquaient, dont le token --hh et le registre
        # rouge. Rien ne les rattachait a leur source — meme classe de defaut que la copie
        # embarquee d'un composant, dans le depot meme qui edicte la parite. La feuille du
        # gabarit n'est pas un fichier `.css` (elle vit DANS le HTML, et l'en sortir changerait
        # le gabarit que tout auteur copie) : le poseur l'expose donc comme source SYNTHETIQUE.
        # Les deux sens, sur une page hors arbre des skills, comme au-dessus.
        page2 = Path(atelier) / "livrable-feuille-de-gabarit.html"
        page2.write_text(
            '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n'
            "<title>Digit-AI — feuille du gabarit · essai — 20260908a</title>\n</head>\n"
            "<body>\n<h1>Essai</h1>\n</body>\n</html>\n", encoding="utf-8")
        pose2 = subprocess.run(
            ["node", poseur, "--poser", str(page2), "--composants", "boilerplate.css"],
            capture_output=True, text=True, encoding="utf-8")
        cas("poseur · la feuille du gabarit se pose comme un composant",
            0, pose2.returncode, "TF-0926 gabarit", (pose2.stderr or pose2.stdout)[-280:])
        html2 = page2.read_text(encoding="utf-8")
        cas("poseur · la feuille posee porte bien le CSS du gabarit",
            True, 'data-composant="boilerplate.css"' in html2 and "--hh:" in html2,
            "TF-0926 gabarit")
        vert2 = subprocess.run(["node", poseur, "--constat", str(page2)],
                               capture_output=True, text=True, encoding="utf-8")
        cas("poseur · la feuille posee est a la parite de son gabarit (sens vert)",
            0, vert2.returncode, "TF-0926 parite", vert2.stdout[-280:])
        # SENS ROUGE : la copie FIGEE. On rejoue exactement ce qui s'est passe — une ligne du
        # gabarit retiree de la copie, sans toucher au gabarit — et la parite doit le dire.
        page2.write_text(html2.replace("--hh: 64px;", "", 1), encoding="utf-8")
        rouge2 = subprocess.run(["node", poseur, "--constat", str(page2)],
                                capture_output=True, text=True, encoding="utf-8")
        cas("poseur · une copie FIGEE de la feuille du gabarit rend un constat (sens rouge)",
            (1, True), (rouge2.returncode, "PÉRIMÉE" in rouge2.stdout), "TF-0926 parite",
            rouge2.stdout[-280:])
    finally:
        shutil.rmtree(atelier, ignore_errors=True)
    return out


def run_capture_manquee():
    """TF-0897 — UNE CAPTURE QUI ECHOUE N'EST PAS UNE PANNE DE L'OUTIL.

    La branche d'echec de capture etait ecrite, mesuree et rendue au JSON (`capture.faite` a
    False, `png` a None, largeur portee a `captures_manquees`) : la sortie TEXTE la traversait
    quand meme en `Path(None)`. TypeError, exit 1, traceback dans le journal R-32, et AUCUN
    verdict pour la largeur concernee — alors que toutes les familles lues dans le DOM etaient
    deja mesurees. Mesure du 07/09/2026 : page de 188 Ko (~13 500 px de haut) a 768 px et
    echelle 2, reproduit deux fois ; le meme appel en echelle 1 rendait PASS.

    Les deux sens, sur la MEME page et par le seul delai de capture :
      · VERT  — delai normal : la capture aboutit, l'en-tete de largeur nomme le PNG ;
      · ROUGE — delai d'une milliseconde : la capture ne peut PAS aboutir. L'outil doit rendre
        son verdict quand meme, nommer « capture NON FAITE », imprimer le motif et declarer la
        largeur au non_juge — et surtout ne PAS lever. Un traceback ici est le defaut lui-meme.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    import subprocess
    import tempfile
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    page = FIXTURES / "a5-feuille-parsable.html"
    if not page.exists():
        return [{"fixture": page.name, "verdict": "ABSENTE", "attendu": "fixture présente",
                 "obtenu": "absente", "regle": "TF-0897", "detail": ""}]
    captures = tempfile.mkdtemp(prefix="self-test-capture-")
    out = []

    def jouer(delai):
        return subprocess.run(
            [sys.executable, "-X", "utf8", rendu, str(page), "--widths", "768",
             "--timeout", str(delai), "--out", captures],
            capture_output=True, text=True, encoding="utf-8")

    normal = jouer(30_000)
    ok_vert = ("Traceback" not in (normal.stderr or "")
               and "capture NON FAITE" not in normal.stdout
               and "Verdict :" in normal.stdout)
    out.append({"fixture": "capture aboutie · delai normal",
                "verdict": "OK" if ok_vert else "ECHEC",
                "attendu": "PNG nomme, aucun traceback", "regle": "TF-0897 sens vert",
                "obtenu": "conforme" if ok_vert else "verdict ou capture manquants",
                "detail": "" if ok_vert else (normal.stderr or normal.stdout)[-300:]})

    rate = jouer(1)
    manques = ["capture NON FAITE" in rate.stdout,
               "capture impossible a 768 px" in rate.stdout,
               "Verdict :" in rate.stdout,
               "NON JUGEES a 768 px" in rate.stdout,
               "Traceback" not in (rate.stderr or "")]
    ok_rouge = all(manques)
    out.append({"fixture": "capture impossible · delai 1 ms",
                "verdict": "OK" if ok_rouge else "ECHEC",
                "attendu": "constat declare, verdict rendu, aucun traceback",
                "regle": "TF-0897 sens rouge",
                "obtenu": "conforme" if ok_rouge else f"controles tenus : {manques}",
                "detail": "" if ok_rouge else (rate.stderr or rate.stdout)[-300:]})
    shutil.rmtree(captures, ignore_errors=True)
    return out


def run_thead_colle():
    """TF-0900 — LE CONTENEUR DE TABLEAU CONTRE LE THEAD COLLANT, mesure d'execution.

    Un ancetre dont l'`overflow` n'est pas `visible` devient la boite de defilement de tout
    `position: sticky` de son sous-arbre. `.table-hote { overflow-x: auto }`, pose a toutes les
    largeurs par le socle, DEFAISAIT donc a lui seul le geste L29 pose vingt lignes plus bas
    dans le meme gabarit : le thead se figeait sous le haut de SON TABLEAU (+67 px au repos,
    une ligne recouverte en permanence) et quittait l'ecran avec lui (-96 px apres 200 px de
    defilement, mesure du 07/09/2026 sur quatre tableaux).

    Aucun oracle statique ne pouvait le voir : la feuille DECLARE bien `position: sticky` et
    `top: var(--hh)`, et L29 juge des declarations. Ce qui est faux, c'est le REFERENTIEL de ce
    top — et un referentiel ne se lit qu'apres defilement, dans un navigateur.

    Les deux fixtures ne different QUE par la ligne `.table-hote { overflow-x: … }` :
      · VERTE — apres 400 px de defilement, le bord haut du premier `<th>` vaut `--hh` (104 px)
        a 4 px pres : le thead est colle sous l'en-tete de page, comme L29 le prescrit ;
      · ROUGE — le meme document avec le conteneur defilant : le banc EXIGE que la mesure en
        differe. Sans ce sens rouge, une page qui n'aurait jamais colle passerait pour verte.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from render_page import ensure_browser_path  # noqa: PLC0415
        ensure_browser_path()
    except Exception:  # noqa: BLE001 — l'auto-detection du navigateur est un confort, pas un du
        pass

    out = []
    fichiers = ("l29-table-hote-socle.html", "l29-table-hote-defilante.html")
    manquantes = [n for n in fichiers if not (FIXTURES / n).exists()]
    for n in manquantes:
        out.append({"fixture": n, "verdict": "ABSENTE", "attendu": "fixture présente",
                    "obtenu": "absente", "regle": "L29 (runtime)", "detail": ""})
    if manquantes:
        return out

    HH = 104          # valeur du token --hh dans les deux fixtures
    TOLERANCE = 4     # px — l'arrondi de peinture, pas un assouplissement

    def mesurer(nom):
        """Le tableau est amene 300 px AU-DESSUS du bord haut de la fenetre, son corps restant
        a l'ecran : c'est exactement la situation ou un thead collant doit etre visible."""
        page.goto((FIXTURES / nom).resolve().as_uri())
        page.wait_for_load_state("load")
        return page.evaluate("""() => {
          const t = document.getElementById('lots');
          window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY + 300);
          const th = document.querySelector('#lots thead th');
          const r = th.getBoundingClientRect();
          const tr = t.getBoundingClientRect();
          return { top: Math.round(r.top),
                   tableau_a_l_ecran: tr.bottom > 0 && tr.top < window.innerHeight };
        }""")

    with sync_playwright() as pw:
        navigateur = pw.chromium.launch()
        page = navigateur.new_page(viewport={"width": 1280, "height": 800})
        try:
            vert = mesurer("l29-table-hote-socle.html")
            rouge = mesurer("l29-table-hote-defilante.html")
        except Exception as erreur:  # noqa: BLE001 — une panne se compte, elle n'arrete pas
            out.append({"fixture": "l29-table-hote-*.html", "verdict": "ECHEC",
                        "attendu": "section jouee", "obtenu": type(erreur).__name__,
                        "regle": "TF-0900", "detail": str(erreur).splitlines()[0][:300]})
            navigateur.close()
            return out
        page.close()
        navigateur.close()

    ok_vert = vert["tableau_a_l_ecran"] and abs(vert["top"] - HH) <= TOLERANCE
    out.append({"fixture": "l29-table-hote-socle.html", "verdict": "OK" if ok_vert else "ECHEC",
                "attendu": f"th colle a --hh ({HH} px ± {TOLERANCE})", "obtenu": f"{vert['top']} px",
                "regle": "TF-0900 collage",
                "detail": "" if ok_vert else
                          f"le thead ne se colle pas sous l'en-tete de page : {vert['top']} px "
                          f"au lieu de {HH}, tableau a l'ecran = {vert['tableau_a_l_ecran']}"})
    ok_rouge = (rouge["tableau_a_l_ecran"] and abs(rouge["top"] - HH) > TOLERANCE
                and rouge["top"] < 0)
    out.append({"fixture": "l29-table-hote-defilante.html", "verdict": "OK" if ok_rouge else "ECHEC",
                "attendu": f"th HORS de l'ecran (sens rouge, ni {HH} px, ni >= 0)",
                "obtenu": f"{rouge['top']} px", "regle": "TF-0900 contre-epreuve",
                "detail": "" if ok_rouge else
                          "le conteneur defilant ne casse plus le collage : la mesure ne "
                          "discrimine plus rien, la fixture verte ne prouve plus rien"})
    return out


def run_infobulle_runtime():
    """TF-0935 — le composant d'INFOBULLE, joue dans un navigateur.

    Un `title` de sept objets concatenes en 700 caracteres est conforme a L3 sous toutes ses
    formes et illisible : « formatte tous les tooltips, puces et sous-puces », dit le retour
    humain. La regle statique (L3 quater) refuse le bloc ; ce banc prouve que le socle sait
    faire ce qu'il exige. Quatre cas, chacun avec son sens :

      · sept objets et neuf sous-precisions rendent SEPT puces et NEUF sous-puces ;
      · l'infobulle d'une cible collee au bord droit reste DANS l'ecran ;
      · le `title` natif est retire pendant l'affichage puis RESTITUE — un `title` perdu est un
        contenu perdu a l'impression et pour les technologies d'assistance ;
      · CONTRE-EPREUVE : un `title` d'une seule ligne rend un paragraphe, pas une fausse liste a
        une puce. Sans ce cas, un composant qui met tout en puces passerait pour correct.

    Silencieux si playwright est absent : un comportement se mesure dans un navigateur.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from render_page import ensure_browser_path  # noqa: PLC0415
        ensure_browser_path()
    except Exception:  # noqa: BLE001 — l'auto-detection du navigateur est un confort, pas un du
        pass

    out = []
    fixture = FIXTURES / "tf-infobulle-structuree.html"
    if not fixture.exists():
        return [{"fixture": fixture.name, "verdict": "ABSENTE", "attendu": "fixture présente",
                 "obtenu": "absente", "regle": "infobulle (runtime)", "detail": ""}]

    def cas(nom, attendu, obtenu, regle):
        ok = attendu == obtenu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": str(attendu)[:120], "obtenu": str(obtenu)[:120],
                    "regle": regle,
                    "detail": "" if ok else f"attendu {attendu!r}, obtenu {obtenu!r}"[:300]})

    with sync_playwright() as pw:
        navigateur = pw.chromium.launch()
        page = navigateur.new_page(viewport={"width": 1280, "height": 900})
        try:
            page.goto(fixture.resolve().as_uri())
            page.wait_for_load_state("load")

            # -- puces et sous-puces reconstruites depuis le SEUL `title` -----------------
            page.evaluate("() => window.DigitAIInfobulle.ouvrir(document.getElementById('riche'))")
            compte = page.evaluate(
                "() => ({ puces: document.querySelectorAll('#infobulle > ul > li').length,"
                "        sous: document.querySelectorAll('#infobulle > ul > li ul > li').length })")
            cas("tf-infobulle-structuree · puces", {"puces": 7, "sous": 9}, compte,
                "TF-0935 structure")

            # -- l'infobulle reste dans l'ecran ------------------------------------------
            page.evaluate("() => window.DigitAIInfobulle.fermer()")
            page.evaluate("() => window.DigitAIInfobulle.ouvrir(document.getElementById('bord'))")
            dedans = page.evaluate(
                "() => { const r = document.getElementById('infobulle').getBoundingClientRect();"
                "  return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth"
                "      && r.bottom <= window.innerHeight; }")
            cas("tf-infobulle-structuree · dans l'ecran", True, dedans, "TF-0935 placement")

            # -- le `title` natif : retire pendant, RESTITUE apres ------------------------
            page.evaluate("() => window.DigitAIInfobulle.fermer()")
            # L'attendu du `title` restitue est le `title` INITIAL, releve dans la page : le
            # comparer a une constante recopiee ici ferait passer une fixture editee.
            avant = page.evaluate(
                "() => document.getElementById('riche').getAttribute('title')")
            page.evaluate("() => window.DigitAIInfobulle.ouvrir(document.getElementById('riche'))")
            pendant = page.evaluate(
                "() => document.getElementById('riche').hasAttribute('title')")
            page.evaluate("() => window.DigitAIInfobulle.fermer()")
            apres = page.evaluate(
                "() => document.getElementById('riche').getAttribute('title')")
            cas("tf-infobulle-structuree · title neutralise puis restitue",
                {"pendant": False, "restitue": True},
                {"pendant": pendant, "restitue": apres == avant and bool(avant)},
                "TF-0935 title")

            # -- CONTRE-EPREUVE : une ligne = un paragraphe, pas une puce -----------------
            page.evaluate("() => window.DigitAIInfobulle.ouvrir(document.getElementById('plat'))")
            forme = page.evaluate(
                "() => ({ p: document.querySelectorAll('#infobulle > p').length,"
                "        ul: document.querySelectorAll('#infobulle > ul').length })")
            cas("tf-infobulle-structuree · une ligne reste un paragraphe (sens rouge)",
                {"p": 1, "ul": 0}, forme, "TF-0935 contre-epreuve")
        except Exception as erreur:  # noqa: BLE001 — toute panne se compte, aucune n'arrete
            out.append({"fixture": fixture.name, "verdict": "ECHEC",
                        "attendu": "banc joue", "obtenu": type(erreur).__name__,
                        "regle": "infobulle (runtime)",
                        "detail": str(erreur).splitlines()[0][:300]})
        finally:
            navigateur.close()
    return out


def run_table_arbre_runtime():
    """TF-0952 (08/09/2026) — UNE HIERARCHIE RENDUE EN TABLEAU SE PLIE, ET LE SOCLE SAIT LE FAIRE.

    LE FAIT PAYE, ET IL EST MESURE. Un livrable rendait deux hierarchies (schema > table >
    colonne) dans des tableaux. Les lignes portaient DEJA `data-niveau`, et l'indentation etait
    faite d'espaces insecables. Mesure a l'ouverture : 134 lignes visibles d'un coup sur la
    premiere, 296 sur la seconde — aucun pliage, aucun compte d'enfants sur la ligne parente. Le
    destinataire a du citer un composant EXTERNE pour se faire comprendre. Le socle n'avait aucun
    composant de tableau arborescent : chaque livrable qui en avait besoin le reecrivait, ou
    renoncait.

    POURQUOI UN BANC D'EXECUTION : le defaut n'est pas dans le HTML — la page est conforme, avec
    ou sans pliage. Il est dans ce que le lecteur RECOIT a l'ouverture. Seul un navigateur le dit.

    QUATRE CAS, ET LE DERNIER EST CELUI QUI JUSTIFIE L'ARBITRAGE DE TF-0953 :
      · a l'arrivee, seules les RACINES sont visibles (3 sur 48) — c'est tout l'interet ;
      · « tout deplier » rend les 48, « tout replier » ramene a 3 ;
      · deplier UNE racine n'ouvre qu'ELLE : ses tables paraissent, pas les colonnes de ses
        tables. Sans ce cas, un composant qui deplierait tout au premier clic passerait ;
      · le pliage SURVIT au passage du composant de filtres. C'est la cohabitation qui etait
        impossible avant l'arbitrage partage, et qui obligeait un produit a poser un
        MutationObserver sur `hidden`.

    SENS ROUGE : la MEME page avec `data-arbre="off"` — le composant ne s'initialise pas, et le
    lecteur recoit les 48 lignes d'un coup, sans un chevron. C'est l'etat du livrable d'origine.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from render_page import ensure_browser_path  # noqa: PLC0415
        ensure_browser_path()
    except Exception:  # noqa: BLE001
        pass
    fixture = FIXTURES / "tf-table-arbre.html"
    if not fixture.exists():
        return [{"fixture": fixture.name, "verdict": "ABSENTE", "attendu": "fixture présente",
                 "obtenu": "absente", "regle": "TF-0952", "detail": ""}]
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="self-test-arbre-"))
    eteinte = tmp / "arbre-eteint.html"
    eteinte.write_text(fixture.read_text(encoding="utf-8").replace('id="t1" data-arbre>',
                                                                   'id="t1" data-arbre="off">'),
                       encoding="utf-8")
    out = []

    def cas(nom, attendu, obtenu, regle):
        ok = attendu == obtenu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": str(attendu)[:120], "obtenu": str(obtenu)[:120], "regle": regle,
                    "detail": "" if ok else f"attendu {attendu!r}, obtenu {obtenu!r}"[:300]})

    with sync_playwright() as pw:
        navigateur = pw.chromium.launch()
        page = navigateur.new_page(viewport={"width": 1280, "height": 900})
        try:
            page.goto(fixture.resolve().as_uri())
            page.wait_for_load_state("load")
            vues = lambda: page.evaluate("() => window.BancArbre.vues()")  # noqa: E731
            cas("tf-table-arbre · à l'arrivée, seules les racines",
                {"vues": 3, "total": 48}, {"vues": vues(), "total": 48}, "TF-0952 pliage")
            page.evaluate("() => window.__arbre.deplierTout()")
            depliees = vues()
            page.evaluate("() => window.__arbre.plierTout()")
            cas("tf-table-arbre · tout déplier / tout replier",
                {"deplie": 48, "replie": 3}, {"deplie": depliees, "replie": vues()},
                "TF-0952 commandes")
            page.evaluate("() => window.__arbre.deplier('s1')")
            cas("tf-table-arbre · déplier une racine n'ouvre qu'elle",
                {"vues": 6, "table": True, "colonne": False},
                {"vues": vues(),
                 "table": page.evaluate("() => window.BancArbre.estVue('s1.baux')"),
                 "colonne": page.evaluate("() => window.BancArbre.estVue('s1.baux.identifiant')")},
                "TF-0952 profondeur")
            avant = vues()
            page.evaluate("() => { if (window.__tf) window.__tf.appliquer(); }")
            cas("tf-table-arbre · le pliage survit au composant de filtres",
                {"vues": avant, "repliee": False},
                {"vues": vues(),
                 "repliee": page.evaluate("() => window.BancArbre.estVue('s2.baux')")},
                "TF-0952 cohabitation")
            # SENS ROUGE : le composant eteint — l'etat du livrable d'origine.
            page.goto(eteinte.resolve().as_uri())
            page.wait_for_load_state("load")
            cas("tf-table-arbre · composant éteint : tout d'un coup (sens rouge)",
                {"vues": 48, "chevrons": 0},
                {"vues": vues(),
                 "chevrons": page.evaluate(
                     "() => document.querySelectorAll('button[data-arbre-chevron]').length")},
                "TF-0952 reproduction")
        except Exception as erreur:  # noqa: BLE001
            out.append({"fixture": fixture.name, "verdict": "ECHEC", "attendu": "banc joué",
                        "obtenu": type(erreur).__name__, "regle": "TF-0952",
                        "detail": str(erreur).splitlines()[0][:300]})
        finally:
            navigateur.close()
    return out


def run_visibilite_lignes():
    """TF-0953 (08/09/2026) — LA VISIBILITE D'UNE LIGNE EST UNE DISJONCTION, ARBITREE A UN SEUL
    ENDROIT.

    LE FAIT PAYE. Deux composants du socle calculaient chacun, pour leur compte, si une ligne
    devait etre vue : `kpi-filter.js` posait `tr.hidden` depuis SA liste d'attributs, ecrite en
    dur ; `table-filters.js` forcait `style.display = ''` sur toute ligne passant son filtre.
    Aucun des deux ne laissait de place a un TROISIEME mecanisme. Un produit qui avait besoin
    d'un pliage d'arbre n'a eu d'autre issue qu'un MutationObserver sur `hidden` — pour
    reappliquer son pliage APRES chaque passage des filtres — puis un depliage complet de
    l'arbre a chaque changement de filtre, pour ne jamais cacher un resultat. Deux
    contournements qui ne devraient pas exister.

    POURQUOI UN BANC D'EXECUTION ET PAS UNE REGLE DE MARQUAGE : le defaut n'est pas dans le HTML,
    il est dans ce que le JavaScript FAIT a l'ouverture. Aucun oracle de marquage ne le voit — la
    page est parfaitement conforme avant comme apres.

    DEUX SENS, ET LE SECOND EST LA REPRODUCTION DU DEFAUT :
      (1) VERT  — `visibilite-arbitree.html` charge le composant d'arbitrage. Une ligne pliee par
                  l'arbre reste pliee quand le filtre par indicateur passe, ET quand le composant
                  de filtres de tableau repasse. Les deux composants sont eprouves, parce que
                  chacun ecrasait a sa maniere : l'un par `hidden`, l'autre par `style.display` ;
      (2) ROUGE — `visibilite-sans-arbitrage.html`, la MEME page et le MEME pliage SANS le
                  composant : la ligne pliee REAPPARAIT. Sans ce sens, un vert obtenu par une
                  mesure devenue muette serait indistinguable d'un vert obtenu par le correctif.

    LE TEMOIN QUI EMPECHE LE VERT DE MENTIR : une ligne que le filtre exclut VRAIMENT doit rester
    masquee dans les deux pages. Un arbitrage qui rendrait tout visible passerait les deux cas
    ci-dessus et casserait le filtrage.

    Silencieux si playwright est absent : un comportement se mesure dans un navigateur.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from render_page import ensure_browser_path  # noqa: PLC0415
        ensure_browser_path()
    except Exception:  # noqa: BLE001 — l'auto-detection du navigateur est un confort, pas un dû
        pass

    out = []

    def cas(nom, attendu, obtenu, regle):
        ok = attendu == obtenu
        out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                    "attendu": str(attendu)[:120], "obtenu": str(obtenu)[:120],
                    "regle": regle,
                    "detail": "" if ok else f"attendu {attendu!r}, obtenu {obtenu!r}"[:300]})

    def jouer(fichier):
        """Plie deux sous-arbres, passe les DEUX filtres, et rend ce qui est encore vu."""
        cible = FIXTURES / fichier
        if not cible.exists():
            return {"absente": True}
        with sync_playwright() as pw:
            navigateur = pw.chromium.launch()
            page = navigateur.new_page(viewport={"width": 1280, "height": 900})
            try:
                page.goto(cible.resolve().as_uri())
                page.wait_for_load_state("load")
                # r3 et r4 sont les enfants de r2 ; r6 est l'enfant de r5.
                page.evaluate("() => { window.BancArbre.plier('r2'); window.BancArbre.plier('r5'); }")
                plie_avant = page.evaluate("() => window.BancArbre.estVue('r3')")
                # (a) le filtre par indicateur : il RECALCULE `hidden` sur chaque ligne.
                page.evaluate("() => document.querySelector('button[data-kpi-filtre]').click()")
                apres_kpi = page.evaluate("() => window.BancArbre.estVue('r3')")
                # (b) le composant de filtres de tableau : il force `style.display` sur chaque
                #     ligne qui passe son filtre. Sans filtre pose, TOUTES passent.
                page.evaluate("() => { if (window.__tf) window.__tf.appliquer(); }")
                apres_filtres = page.evaluate("() => window.BancArbre.estVue('r6')")
                # TEMOIN : r4 est exclu par le filtre lui-meme (statut « ecart »).
                exclu = page.evaluate("() => window.BancArbre.estVue('r4')")
                return {"plie_avant": plie_avant, "apres_kpi": apres_kpi,
                        "apres_filtres": apres_filtres, "exclu": exclu}
            except Exception as erreur:  # noqa: BLE001
                return {"erreur": type(erreur).__name__ + " · " + str(erreur).splitlines()[0][:160]}
            finally:
                navigateur.close()

    vert = jouer("visibilite-arbitree.html")
    rouge = jouer("visibilite-sans-arbitrage.html")
    for nom, res in (("visibilite-arbitree.html", vert), ("visibilite-sans-arbitrage.html", rouge)):
        if res.get("absente"):
            out.append({"fixture": nom, "verdict": "ABSENTE", "attendu": "fixture présente",
                        "obtenu": "absente", "regle": "TF-0953", "detail": ""})
        elif res.get("erreur"):
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": "banc joué",
                        "obtenu": "panne", "regle": "TF-0953", "detail": res["erreur"]})
    if vert.get("absente") or vert.get("erreur") or rouge.get("absente") or rouge.get("erreur"):
        return out

    # (1) SENS VERT — le pliage survit aux DEUX composants.
    cas("visibilite-arbitree · pliage puis filtre par indicateur",
        {"plie": False, "apres_kpi": False}, {"plie": vert["plie_avant"], "apres_kpi": vert["apres_kpi"]},
        "TF-0953 disjonction")
    cas("visibilite-arbitree · pliage puis filtres de tableau",
        False, vert["apres_filtres"], "TF-0953 disjonction")
    # (2) SENS ROUGE — sans arbitrage, la ligne pliée REVIENT. C'est le défaut du produit.
    cas("visibilite-sans-arbitrage · la ligne pliée réapparaît (sens rouge)",
        True, rouge["apres_kpi"] or rouge["apres_filtres"], "TF-0953 reproduction")
    # (3) TÉMOIN — le filtre filtre encore, dans les deux pages.
    cas("visibilite · témoin : la ligne exclue par le filtre reste masquée",
        {"arbitree": False, "sans": False}, {"arbitree": vert["exclu"], "sans": rouge["exclu"]},
        "TF-0953 témoin")
    return out


def _page_hote_du_canevas(legende_en_glyphes=False):
    """Fabrique une page hote portant le canevas differentiel, 40 cartes et 274 puces.

    La page est GENEREE depuis le canevas, jamais recopiee : une fixture figee derive de sa
    source le jour ou le canevas change, et c'est le defaut que le controle de parite des
    composants embarques (TF-0784) existe deja pour attraper ailleurs. Ici, la seule facon de
    ne pas le payer est de ne pas creer la copie.

    `legende_en_glyphes=True` rend la LEGENDE telle qu'elle etait avant TF-0938 — trois glyphes
    « caractere teinte » a la place des trois pastilles. C'est le sens rouge : la meme page, la
    meme couleur, un porteur different.
    """
    socle = Path(__file__).resolve().parents[2] / "digit-ai-page-html" / "assets" / "boilerplate.html"
    canevas = (Path(__file__).resolve().parents[2] / "digit-ai-schemas" / "assets"
               / "template-schema-differentiel.html")
    if not socle.exists() or not canevas.exists():
        return None
    bp = socle.read_text(encoding="utf-8")
    frag = canevas.read_text(encoding="utf-8")
    # Le VRAI <style> du canevas est seul sur sa ligne ; celui du commentaire d'en-tete est suivi
    # d'un espace. Prendre la premiere occurrence brute embarquerait la fin du commentaire.
    i = frag.index("\n<style>\n")
    sty = frag[i:frag.index("</style>") + len("</style>")]
    corps = frag[frag.index("<!-- La LÉGENDE"):]
    if legende_en_glyphes:
        corps = re.sub(r'<b class="tbl-pastille (est-[a-z]+)" aria-hidden="true"></b>',
                       lambda m: '<b style="color:var(--%s)">▭</b>' % {
                           "est-creee": "blue", "est-modifiee": "amber",
                           "est-reprise": "muted"}[m.group(1)], corps)
    etats = ["est-creee", "est-modifiee", "est-reprise"]
    libelles = {"est-creee": "creee", "est-modifiee": "etendue",
                "est-reprise": "reprise sans changement"}
    noms = ["dim_client", "fait_contrat_mois", "dim_batiment", "fait_loyer_quotidien",
            "dim_calendrier", "stg_avenant_locatif", "dim_unite_locative",
            "fait_charge_recuperable", "dim_bail", "ref_indice_revision"]
    cols = ["identifiant_technique_de_la_ligne", "date_de_debut_avenant_actif",
            "montant_hors_taxes_annuel", "code_postal_du_batiment",
            "libelle_long_du_type_de_bail", "cle_de_substitution_du_contrat",
            "horodatage_de_chargement_source", "indicateur_de_renouvellement_automatique"]
    glyphes = {"est-ajoutee": "＋", "est-corrigee": "✎", "est-reprise": "●"}
    cartes = []
    for k in range(40):
        etat, nom = etats[k % 3], "%s_%d" % (noms[k % len(noms)], k)
        puces = []
        for j in range((k % 9) + 3):
            col = cols[(k + j) % len(cols)]
            cl = ["est-ajoutee", "est-corrigee", "est-reprise"][(k + j) % 3]
            puces.append(
                '<li class="col %s"><span class="col-g" aria-hidden="true">%s</span>'
                '<span class="col-n" title="%s\n  type : varchar(64)\n'
                '  source : systeme amont, champ homonyme">%s</span></li>'
                % (cl, glyphes[cl], col, col))
        cartes.append(
            '<article class="tbl-card %s"><p class="tbl-nom">silver.%s</p>'
            '<p class="tbl-etat">%s — une ligne par contrat et par mois</p><ul>%s</ul>'
            '<p class="tbl-cle">cle de substitution : sk_%s — hachage stable des cles '
            'naturelles</p></article>'
            % (etat, nom, libelles[etat], "".join(puces), nom))
    corps = re.sub(r'<div class="tbl-grid">.*?</div>\s*$',
                   '<div class="tbl-grid">%s</div>' % "".join(cartes), corps, flags=re.S)
    page = bp.replace("</head>", sty + "\n</head>")
    ancre = "<h1>{Titre du livrable}</h1>"
    j = page.index(ancre) + len(ancre)
    return page[:j] + "\n" + corps + "\n" + page[j:]


def run_canevas_modele_donnees():
    """TF-0941 (08/09/2026) — LE CANEVAS ERD POSE SES PROPRES DECLARATIONS, ET C'EST MESURE.

    LE FAIT. Insere dans une page de donnees, le canevas « modele de donnees » declenchait une
    volee de constats du socle, que le produit levait A LA MAIN, chez lui, a chaque
    instanciation. Personne ne les avait jamais mesures sur le GABARIT lui-meme : c'est une page
    complete, mais aucune recette ne la rendait. Mesure du 08/09, aux quatre largeurs :
    **11, 12, 12 et 18 bloquants** — 11 chevauchements V4 (une etiquette de cardinalite sur son
    arete, et deux aretes qui se croisent), 1 a 5 « contenu rogne » sur le conteneur mis a
    l'echelle par `fitSchema`, 2 debordements V1 du dictionnaire a 390 px.

    CE QUI A CHANGE, ET AUCUN N'EST UN ASSOUPLISSEMENT :
      · l'etiquette de cardinalite chevauche SON arete par construction du dessin, et deux aretes
        d'un graphe relationnel peuvent devoir passer par le meme couloir — `data-overlap-ok` est
        pose sur les ARETES ET LEURS ETIQUETTES SEULES ; les cartes, elles, restent jugees ;
      · `fitSchema` met le schema a l'echelle et fixe la hauteur du conteneur a la hauteur mise a
        l'echelle : le socle lit un contenu plus haut que sa boite. Rien n'est masque —
        `data-rognage-assume` le declare, DANS le gabarit ;
      · le dictionnaire se REPLIE sous 900 px (une ligne devient un bloc etiquete, comme le repli
        en cartes du socle) au lieu de deborder, et la coupure des noms techniques porte une
        classe qui DIT son usage (`.dd-mono`), jamais la colonne de note qui est de la prose.

    DEUX SENS : le gabarit LIVRE rend 0 bloquant aux quatre largeurs ; le MEME gabarit prive de
    ses deux declarations les fait revenir. Sans le second, une page qui aurait cesse de dessiner
    ses aretes passerait pour corrigee.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    canevas = (Path(__file__).resolve().parents[2] / "digit-ai-schemas" / "assets"
               / "template-modele-donnees.html")
    if not canevas.exists():
        return [{"fixture": "canevas modele de donnees", "verdict": "ECHEC",
                 "attendu": "gabarit present", "obtenu": "absent", "regle": "TF-0941",
                 "detail": str(canevas)}]
    import tempfile
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    tmp = Path(tempfile.mkdtemp(prefix="self-test-erd-"))
    livre = canevas.read_text(encoding="utf-8")
    # Le sens ROUGE ne reecrit pas le gabarit : il lui RETIRE ses deux declarations. La page
    # reste la meme a l'octet pres par ailleurs, donc ce qui revient vient bien de leur absence.
    sans = livre.replace(" data-overlap-ok", "")
    sans = re.sub(r' data-rognage-assume="[^"]*"', "", sans)
    out = []
    for nom, contenu, attendu in (("canevas modele de donnees · livre", livre, 0),
                                  ("canevas modele de donnees · sans ses declarations (sens rouge)",
                                   sans, 1)):
        cible = tmp / ("erd-%s.html" % ("livre" if attendu == 0 else "nu"))
        cible.write_text(contenu, encoding="utf-8")
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(cible), "--output", "json",
                            "--out", str(tmp)], capture_output=True, text=True, encoding="utf-8")
        try:
            bps = json.loads(r.stdout)["breakpoints"]
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": "rendu lisible",
                        "obtenu": "illisible", "regle": "TF-0941",
                        "detail": (r.stderr or r.stdout or "")[:160]})
            continue
        bloquants = sum(int(b.get("blocking") or 0) for b in bps.values())
        largeurs = len(bps)
        if attendu == 0:
            ok = bloquants == 0
            out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                        "attendu": "0 bloquant sur %d largeurs" % largeurs,
                        "obtenu": "%d bloquant(s)" % bloquants, "regle": "TF-0941 gabarit livre",
                        "detail": "" if ok else "largeurs %s" % ",".join(sorted(bps))})
        else:
            ok = bloquants >= largeurs
            out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                        "attendu": "au moins 1 bloquant par largeur (%d)" % largeurs,
                        "obtenu": "%d bloquant(s)" % bloquants, "regle": "TF-0941 sens rouge",
                        "detail": "" if ok else "retirer les declarations ne fait plus rien "
                                                "revenir : la mesure est devenue muette"})
    return out


def run_canevas_differentiel():
    """TF-0938 (08/09/2026) — LE CANEVAS DIFFERENTIEL TIENT SES PROPRES REGLES, MESURE.

    CE QUE L'ITEM DEMANDAIT, ET CE QUE LA MESURE A REPONDU. La demande etait d'EXCLURE de V4
    les enfants d'une meme `.tbl-card`, comme le sont deja les formes d'un groupe SVG titre.
    Mesure faite ici, canevas insere dans une page hote de 40 cartes et 274 puces, AUX QUATRE
    LARGEURS (1920, 1280, 768, 390) : **zero constat V4**, a chacune. Deuxieme mesure
    concordante apres celle de la campagne precedente. Aucune exclusion n'est donc posee — un
    oracle ne s'assouplit pas sur une hypothese, et une exclusion posee « au cas ou » rendrait
    aveugle un jour ou une carte se cassera vraiment.

    CE QUE LA MEME MESURE A TROUVE, ET QUE PERSONNE NE CHERCHAIT : **1 bloquant V2 a chacune des
    quatre largeurs**, dans le canevas lui-meme. La legende rendait ses trois etats de table par
    un glyphe « ▭ » teinte ; l'ambre du socle (#D97706) sur le fond du socle donne 3,08:1, sous
    les 4,5:1 qu'un TEXTE doit tenir. Le bleu, le rouge et le gris passaient — l'ambre seul
    echouait. Le canevas est passe a une PASTILLE (un cadre dont la bordure porte l'etat, comme
    la carte qu'elle legende) : la meme couleur, jugee par la regle qui lui convient (WCAG
    1.4.11, 3:1, tenu), et non plus par celle du texte.

    POURQUOI CE CAS EXISTE PLUTOT QU'UN SIMPLE CORRECTIF : le canevas est un FRAGMENT. Aucune
    recette ne le rendait, donc aucune ne mesurait ce qu'il produit une fois pose. Le trou n'est
    pas la couleur, c'est qu'un gabarit du parc pouvait echouer aux quatre largeurs sans que
    rien ne le dise.

    DEUX SENS :
      (1) VERT  — le canevas TEL QU'IL EST LIVRE, pose dans une page hote : zero bloquant aux
                  quatre largeurs. Avant le correctif, ce sens rend 1 bloquant a chacune ;
      (2) ROUGE — la MEME page, la MEME couleur, la legende rendue par le glyphe teinte d'avant :
                  V2 crie. Sans lui, on ne saurait pas si le vert vient du correctif ou d'une
                  mesure devenue muette.
    """
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
    except ImportError:
        return None
    page = _page_hote_du_canevas()
    if page is None:
        return [{"fixture": "canevas differentiel", "verdict": "ECHEC",
                 "attendu": "canevas et socle presents", "obtenu": "absents",
                 "regle": "TF-0938", "detail": "template-schema-differentiel.html introuvable"}]
    import tempfile
    rendu = str(Path(__file__).resolve().parent / "render_page.py")
    tmp = Path(tempfile.mkdtemp(prefix="self-test-canevas-"))
    out = []
    for nom, glyphes, attendu in (("canevas differentiel · livre", False, 0),
                                  ("canevas differentiel · legende en glyphes (sens rouge)", True, 1)):
        cible = tmp / ("canevas-%s.html" % ("glyphes" if glyphes else "livre"))
        cible.write_text(_page_hote_du_canevas(glyphes), encoding="utf-8")
        r = subprocess.run([sys.executable, "-X", "utf8", rendu, str(cible), "--output", "json",
                            "--out", str(tmp)], capture_output=True, text=True, encoding="utf-8")
        try:
            bps = json.loads(r.stdout)["breakpoints"]
        except Exception:
            out.append({"fixture": nom, "verdict": "ECHEC", "attendu": "rendu lisible",
                        "obtenu": "illisible", "regle": "TF-0938",
                        "detail": (r.stderr or r.stdout or "")[:160]})
            continue
        v4 = sum(len(b["issues"]["v4_overlap"]) for b in bps.values())
        v2 = sum(len(b["issues"]["v2_contrast"]) for b in bps.values())
        bloquants = sum(int(b.get("blocking") or 0) for b in bps.values())
        largeurs = len(bps)
        if not glyphes:
            # Le sens VERT porte AUSSI le constat de la demande initiale : V4 doit rester a zero,
            # sinon l'exclusion refusee ci-dessus deviendrait justifiee et il faudrait le savoir.
            ok = bloquants == 0 and v4 == 0
            out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                        "attendu": "0 bloquant · 0 V4 sur %d largeurs" % largeurs,
                        "obtenu": "%d bloquant(s) · %d V4" % (bloquants, v4),
                        "regle": "TF-0938 canevas pose",
                        "detail": "" if ok else "40 cartes / 274 puces, largeurs %s"
                                                % ",".join(sorted(bps))})
        else:
            ok = v2 >= largeurs
            out.append({"fixture": nom, "verdict": "OK" if ok else "ECHEC",
                        "attendu": "au moins 1 V2 par largeur (%d)" % largeurs,
                        "obtenu": "%d V2" % v2, "regle": "TF-0938 sens rouge",
                        "detail": "" if ok else "le glyphe teinte ne fait plus crier V2 : la "
                                                "mesure est devenue muette, le vert ne prouve rien"})
    return out


def main():
    ap = argparse.ArgumentParser(description="Auto-test des règles de lisibilité L1-L10.")
    ap.add_argument("--output", choices=["text", "json"], default="text")
    args = ap.parse_args()

    res = (run() + run_exemptions() + run_structure() + run_couverture() + run_l29_ter()
           + run_glyphes_du_socle() + run_markdown() + run_syne())
    rendu = run_rendu()
    if rendu:
        res += rendu
    # TF-1066 — les deux branches de V18 se mesurent a 2560 px : a 1440, les defauts du 4K
    # n'existent pas et quatre verts ne prouveraient rien.
    large = run_rendu_large()
    if large:
        res += large
    # TF-0442 — le repli en cartes se mesure a 390 px, la seule largeur ou il se declenche.
    repli = run_repli_cartes()
    if repli:
        res += repli
    # TF-0382 — les deux sens de la borne V1, en comptes EXACTS (branche a part : CAS_RENDU
    # teste « au moins n », et c est precisement le nombre qui est en cause ici).
    bornes = run_v1_bornes()
    if bornes:
        res += bornes
    # TF-0493 — la matrice d etats : chaque etat mesure ET capture, et un etat qui ne trouve pas
    # son declencheur est declare NON JOUE, jamais vert.
    matrice = run_matrice_etats()
    if matrice:
        res += matrice
    # TF-0768/0769/0781/0782 — le composant de filtres joue DANS un navigateur : ses defauts
    # sont des defauts d'execution, qu'aucun oracle de marquage ne peut voir.
    filtres = run_filtres_runtime()
    if filtres:
        res += filtres
    # TF-0900 — le conteneur de tableau contre le thead collant : un referentiel de `top` ne se
    # lit qu'APRES defilement, dans un navigateur. La feuille, elle, declarait juste.
    colle = run_thead_colle()
    if colle:
        res += colle
    # TF-0897 — une capture qui echoue est un CONSTAT, pas une panne : l'outil rend son verdict
    # sur les familles du DOM et declare ce qu'il n'a pas pu inspecter.
    capture = run_capture_manquee()
    if capture:
        res += capture
    # TF-0890 — le poseur de composants : une API qu'on peut IMPORTER, et une pose jouable hors
    # de l'arbre des skills. Sans ces deux portes, un produit reecrit le poseur.
    poseur = run_poseur_composants()
    if poseur:
        res += poseur
    # TF-0935 — le composant d'infobulle : un `title` de sept objets rendu en puces, et la
    # contre-epreuve qu'une seule ligne reste un paragraphe. Aucun oracle de marquage ne voit
    # ce qu'un composant FAIT.
    infobulle = run_infobulle_runtime()
    if infobulle:
        res += infobulle
    # TF-0938 — le canevas differentiel POSE dans une page hote : un fragment que rien ne rendait
    # pouvait echouer aux quatre largeurs sans que rien ne le dise. Le cas porte AUSSI le constat
    # qui refuse d'exclure `.tbl-card` de V4 : zero chevauchement mesure, donc rien a assouplir.
    canevas = run_canevas_differentiel()
    if canevas:
        res += canevas
    # TF-0953 — l'arbitrage PARTAGE de la visibilite d'une ligne : deux composants du socle
    # calculaient chacun `hidden` ou `display` pour leur compte, et ecrasaient tout troisieme
    # mecanisme sans un mot. Le defaut n'est pas dans le HTML, il est dans ce que le JavaScript
    # FAIT a l'ouverture — donc il se mesure dans un navigateur, pas par une regle de marquage.
    visibilite = run_visibilite_lignes()
    if visibilite:
        res += visibilite
    # TF-0941 — le canevas ERD est une page COMPLETE que rien ne rendait : ses declarations se
    # posaient chez chaque consommateur, a la main, a chaque instanciation.
    erd = run_canevas_modele_donnees()
    if erd:
        res += erd
    # TF-0952 — le tableau arborescent : le defaut n'est pas dans le HTML, il est dans ce que le
    # lecteur RECOIT a l'ouverture. 296 lignes d'un coup est un defaut ; seul un navigateur le dit.
    arbre = run_table_arbre_runtime()
    if arbre:
        res += arbre
    rates = [r for r in res if r["verdict"] != "OK"]

    if args.output == "json":
        print(json.dumps({"total": len(res), "echecs": len(rates), "cas": res},
                         ensure_ascii=False, indent=2))
    else:
        print("self-test — fixtures de lisibilité du skill digit-ai-page-html\n")
        for r in res:
            marque = "OK  " if r["verdict"] == "OK" else "ECHEC"
            att = (",".join(r["attendu"]) if isinstance(r["attendu"], list)
                   else f'{r.get("regle", "rendu")} ×{r["attendu"]}') or "(aucune règle)"
            obt = (",".join(r["obtenu"]) if isinstance(r["obtenu"], list)
                   else f'×{r["obtenu"]}') or "(aucune)"
            print(f"  [{marque}] {r['fixture']:<34} attendu {att:<12} obtenu {obt}")
            if r["detail"]:
                print(f"          {r['detail']}")
        print(f"\n{len(res) - len(rates)}/{len(res)} cas passés")

    sys.exit(1 if rates else 0)


if __name__ == "__main__":
    main()
