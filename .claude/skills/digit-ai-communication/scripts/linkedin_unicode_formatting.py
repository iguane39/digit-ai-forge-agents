#!/usr/bin/env python3
"""
Mise en forme Unicode pour LinkedIn — gras Mathematical Bold, listes a puces.

Repris (TF-1157, 17/09/2026) d'un skill installe au poste et audite le meme jour (verdict
« Refondre »). Seule la mise en forme technique est reprise ici, agnostique de tout client
ou personne : le reste (structures nommees, generateur d'image, regles d'algorithme datees)
reste hors de ce skill — voir SKILL.md, section « Reste ».

LinkedIn ne rend pas le gras Markdown (**texte**) au copier-coller. Ce module convertit le
texte en veritables caracteres Unicode Mathematical Bold (U+1D400-U+1D7D7), qui survivent au
copier-coller LinkedIn. Les caracteres hors A-Z/a-z/0-9 (accents compris) sont inchanges.
"""

import sys


def to_unicode_bold(text):
    """
    Convertit un texte en caracteres Unicode Mathematical Bold.

    Args:
        text (str): texte source.

    Returns:
        str: texte en gras Unicode ; les caracteres hors A-Z/a-z/0-9 (accents compris)
        restent inchanges.
    """
    bold_map = {
        **{chr(i): chr(0x1D400 + i - 0x41) for i in range(0x41, 0x5B)},  # A-Z
        **{chr(i): chr(0x1D41A + i - 0x61) for i in range(0x61, 0x7B)},  # a-z
        **{chr(i): chr(0x1D7CE + i - 0x30) for i in range(0x30, 0x3A)},  # 0-9
    }
    return ''.join(bold_map.get(c, c) for c in text)


def format_list_items(items, intro_text=None):
    """
    Formate une liste a puces (caractere U+2022), format strict LinkedIn : un saut de ligne
    apres les deux-points d'introduction, aucune ligne vide entre les puces.

    Args:
        items (list[str]): elements de la liste.
        intro_text (str, optional): texte d'introduction avant la liste.

    Returns:
        str: liste formatee, terminee par un saut de ligne.
    """
    result = ''
    if intro_text:
        result = intro_text.rstrip()
        if not result.endswith(':'):
            result += ':'
        result += '\n'
    for item in items:
        result += f"• {item}\n"
    return result


def generate_linkedin_post(titre, intro, sections, question_finale, hashtags):
    """
    Assemble un post LinkedIn a partir de sections structurees, avec gras Unicode et
    puces au format strict.

    Args:
        titre (str): titre principal.
        intro (str): paragraphe d'introduction.
        sections (list[dict]): chacune {emoji, titre, contenu, liste? (list[str])}.
        question_finale (str): question ou appel a l'action de cloture.
        hashtags (list[str]): hashtags sans le caractere '#'.

    Returns:
        str: post assemble, pret a copier-coller.
    """
    post = to_unicode_bold(titre) + "\n\n"
    post += intro + "\n\n"

    for section in sections:
        post += f"{section['emoji']} {to_unicode_bold(section['titre'])}\n\n"
        contenu = section['contenu'].rstrip()
        post += contenu
        if section.get('liste'):
            if not contenu.endswith(':'):
                post += "\n"
            post += "\n"
            for item in section['liste']:
                post += f"• {item}\n"
        post += "\n"

    post += question_finale + "\n\n"
    post += " ".join(f"#{tag}" for tag in hashtags)
    return post


def _ecrire(ligne):
    """Ecrit une ligne sur stdout sans jamais planter pour un motif d'encodage de console."""
    try:
        print(ligne)
    except UnicodeEncodeError:
        # Console qui ne sait pas rendre le gras Unicode (ex. cp1252 Windows hors terminal
        # UTF-8) : on retombe sur une forme ASCII-safe plutot que de faire echouer le script.
        print(ligne.encode('ascii', errors='backslashreplace').decode('ascii'))


def _autotest():
    """
    Auto-test a double sens (TF-1157, gabarit AGENT-CAMPAGNE) : des assertions VERTES sur le
    comportement reel de `to_unicode_bold` et `format_list_items`, et un CAS ROUGE qui prouve
    que les assertions savent detecter une conversion fautive (elles ne sont pas
    vacuously true — si le mapping se cassait, ce test le verrait).

    Robustesse console : force l'encodage de sortie en UTF-8 quand le flux le permet
    (`sys.stdout.reconfigure`) et retombe sur une forme ASCII-safe sinon. L'original importe
    de linkedin-post-generator plantait (UnicodeEncodeError) sur une console Windows cp1252
    hors terminal UTF-8 : ce script PASSE dans les deux cas.
    """
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass  # flux qui ne supporte pas reconfigure() (ex. capture figee) : _ecrire() couvre

    _ecrire("=== Auto-test linkedin_unicode_formatting ===")

    # Cas VERT 1 : lettres simples — valeur de reference calculee independamment (PYTHONUTF8=1,
    # interprete Python 3.12) et figee ici en echappements \U, jamais recopiee de tete.
    t1 = to_unicode_bold("Hello World")
    assert t1 == (
        "\U0001d407\U0001d41e\U0001d425\U0001d425\U0001d428"
        " \U0001d416\U0001d428\U0001d42b\U0001d425\U0001d41d"
    ), "conversion lettres simples incorrecte"
    _ecrire("PASS - conversion lettres simples")

    # Cas VERT 2 : chiffres
    t2 = to_unicode_bold("2025")
    assert t2 == "\U0001d7d0\U0001d7ce\U0001d7d0\U0001d7d3", "conversion chiffres incorrecte"
    _ecrire("PASS - conversion chiffres")

    # Cas VERT 3 : accents preserves (hors plage bold, jamais convertis)
    t3 = to_unicode_bold("Stratégie")
    assert t3[5] == 'é', "un caractere accentue ne doit jamais entrer dans la plage bold"
    _ecrire("PASS - accents preserves")

    # Cas VERT 4 : liste a puces, format strict (deux-points, saut de ligne, pas de ligne
    # vide entre puces)
    liste = format_list_items(["Un", "Deux"], intro_text="Trois points")
    assert liste == "Trois points:\n• Un\n• Deux\n", "format de liste incorrect"
    _ecrire("PASS - liste a puces au format strict")

    # CAS ROUGE : une assertion volontairement fausse DOIT echouer, pour la bonne raison.
    # Preuve que l'auto-test n'est pas aveugle : si `to_unicode_bold` se mettait a ne plus
    # convertir (regression), c'est CETTE ligne qui le dirait — pas une assertion vacuously
    # true qui passerait quoi qu'il arrive.
    echec_attrape = False
    try:
        assert to_unicode_bold("A") == "A", "cas rouge : 'A' ne doit PAS rester 'A' en gras"
    except AssertionError:
        echec_attrape = True
    if not echec_attrape:
        _ecrire("FAIL - le cas rouge n'a pas echoue : l'auto-test est aveugle")
        sys.exit(1)
    _ecrire("PASS - le cas rouge echoue pour la bonne raison (auto-test non aveugle)")

    _ecrire("\n=== Tous les tests PASSENT ===")


if __name__ == "__main__":
    _autotest()
