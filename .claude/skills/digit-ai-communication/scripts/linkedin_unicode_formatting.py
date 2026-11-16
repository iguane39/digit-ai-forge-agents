#!/usr/bin/env python3
"""
Mise en forme Unicode pour LinkedIn — gras Mathematical Bold, listes a puces.

Repris (TF-1157, 17/09/2026) d'un skill installe au poste et audite le meme jour (verdict
« Refondre »). Seule la mise en forme technique est reprise ici, agnostique de tout client
ou personne : le reste (structures nommees, generateur d'image, regles d'algorithme datees)
reste hors de ce skill — voir SKILL.md, section « Reste ».

LinkedIn ne rend pas le gras Markdown (**texte**) au copier-coller. Ce module convertit le
texte en veritables caracteres Unicode Mathematical Bold (U+1D400-U+1D7D7), qui survivent au
copier-coller LinkedIn. Une lettre accentuee est decomposee en NFD (TF-2637, 16/11/2026) : la
lettre de base passe en gras et son diacritique combinant est conserve, de sorte qu'un texte
francais ne sort plus avec des lettres maigres au milieu du gras. Les caracteres sans
decomposition (« œ », « æ », « ß », lettres non latines) restent inchanges :
`lettres_restees_maigres` les nomme. Le gras Unicode est lu lettre par lettre (« lettre
mathematique grasse a ») par les lecteurs d'ecran : a reserver a un mot ou deux, jamais a une
phrase.
"""

import sys
import unicodedata


def to_unicode_bold(text):
    """
    Convertit un texte en caracteres Unicode Mathematical Bold.

    Le texte est decompose en NFD avant conversion : « é » devient « e » en gras suivi du
    diacritique combinant U+0301, qui survit au copier-coller. Les caracteres sans
    decomposition ni lettre de base A-Z/a-z/0-9 restent inchanges (voir
    `lettres_restees_maigres`).

    Args:
        text (str): texte source.

    Returns:
        str: texte en gras Unicode ; diacritiques conserves en caracteres combinants.
    """
    bold_map = {
        **{chr(i): chr(0x1D400 + i - 0x41) for i in range(0x41, 0x5B)},  # A-Z
        **{chr(i): chr(0x1D41A + i - 0x61) for i in range(0x61, 0x7B)},  # a-z
        **{chr(i): chr(0x1D7CE + i - 0x30) for i in range(0x30, 0x3A)},  # 0-9
    }
    return ''.join(bold_map.get(c, c) for c in unicodedata.normalize('NFD', text))


def lettres_restees_maigres(text):
    """
    Liste les lettres que `to_unicode_bold` ne peut pas mettre en gras : celles qui, une fois le
    texte decompose en NFD, ne sont ni A-Z, a-z, 0-9 ni un diacritique combinant (« œ », « æ »,
    « ß », lettres non latines). Un texte francais courant n'en porte presque jamais, sauf « œ ».

    Args:
        text (str): texte source.

    Returns:
        list[str]: lettres restees maigres, sans doublon, dans l'ordre d'apparition.
    """
    vues = []
    for c in unicodedata.normalize('NFD', text):
        if c.isalpha() and not ('A' <= c <= 'Z' or 'a' <= c <= 'z') and c not in vues:
            vues.append(c)
    return vues


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

    # Cas VERT 3 (TF-2637) : une lettre accentuee sort en gras avec son diacritique combinant,
    # jamais maigre au milieu du gras. Reference figee en echappements.
    t3 = to_unicode_bold("Stratégie")
    assert t3 == (
        "\U0001d412\U0001d42d\U0001d42b\U0001d41a\U0001d42d\U0001d41é"
        "\U0001d420\U0001d422\U0001d41e"
    ), "une lettre accentuee doit sortir en gras avec son diacritique combinant"
    _ecrire("PASS - accents en gras, diacritique combinant conserve")

    # Cas VERT 3 bis : une accroche francaise entiere (grave, aigu, circonflexe, trema, cedille)
    # ne laisse aucune lettre maigre ; « œ » n'a pas de decomposition et est signale.
    accroche = to_unicode_bold("À Noël, l'élève français s'est hâté")
    assert not [c for c in accroche if c.isalpha() and not (0x1D400 <= ord(c) <= 0x1D7FF)], (
        "une accroche francaise accentuee ne doit laisser aucune lettre maigre"
    )
    assert lettres_restees_maigres("À Noël, l'élève français") == [], "faux avertissement"
    assert lettres_restees_maigres("cœur") == ["œ"], "« œ » doit etre signale comme lettre maigre"
    _ecrire("PASS - accroche francaise sans lettre maigre, « œ » signale")

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

    # CAS ROUGE 2 (TF-2637) : l'ancienne conversion, ASCII seul, laisse « é » maigre. La meme
    # assertion que le cas vert 3 bis doit y echouer, sinon elle ne distingue rien.
    def _bold_ascii_seul(text):
        return ''.join(
            chr(0x1D400 + ord(c) - 0x41) if 'A' <= c <= 'Z'
            else chr(0x1D41A + ord(c) - 0x61) if 'a' <= c <= 'z'
            else c
            for c in text
        )
    ancienne = _bold_ascii_seul("Stratégie")
    maigres = [c for c in ancienne if c.isalpha() and not (0x1D400 <= ord(c) <= 0x1D7FF)]
    if maigres != ["é"]:
        _ecrire("FAIL - le cas rouge 2 ne reproduit pas la lettre maigre : auto-test aveugle")
        sys.exit(1)
    _ecrire("PASS - le cas rouge 2 (ancienne conversion ASCII seul) laisse « é » maigre")

    _ecrire("\n=== Tous les tests PASSENT ===")


if __name__ == "__main__":
    _autotest()
