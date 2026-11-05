"""Fixture VERTE de oracle-appel-modele-sous-verrou (TF-2163) : les gestes que le message de l'oracle propose,
JOUÉS — valider avant l'appel, ou appeler avant la première écriture — plus une lecture seule et une exemption
déclarée avec sa raison.

Attendu : PASS, 0 constat, 1 exemption nommée (exemption_declaree).
"""
import sqlite3

import anthropic

client = anthropic.Anthropic()


def ranger_pseudonymes(conn, table):
    for pseudo, reel in table.items():
        conn.execute("INSERT INTO pseudonymes (pseudo, reel) VALUES (?, ?)", (pseudo, reel))


def appeler_modele(texte):
    return client.messages.create(
        model="claude-sonnet-5-5", max_tokens=1024, messages=[{"role": "user", "content": texte}]
    )


def proposer(conn, table, texte):
    ranger_pseudonymes(conn, table)
    conn.commit()                            # la transaction est validée AVANT l'appel
    reponse = appeler_modele(texte)
    return reponse


def proposer_appel_d_abord(db_path, texte):
    reponse = client.messages.create(        # l'appel précède toute écriture
        model="claude-sonnet-5-5", max_tokens=1024, messages=[{"role": "user", "content": texte}]
    )
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE missions SET etat = 'termine' WHERE id = ?", (1,))
    return reponse


def lecture_seule(conn, texte):
    conn.execute("SELECT reel FROM pseudonymes")      # une lecture n'ouvre aucun verrou d'écriture
    return appeler_modele(texte)


def reprise_apres_validation(conn, texte):
    with conn:
        conn.execute("UPDATE missions SET etat = 'lu' WHERE id = ?", (2,))
    return appeler_modele(texte)             # la sortie du `with` a validé


def exemption_declaree(conn, texte):
    conn.execute("INSERT INTO journal (ligne) VALUES ('essai')")
    # appel-sous-verrou-ok: base locale mono-utilisateur, verrou de 40 ms mesuré le 05/11/2026
    return appeler_modele(texte)
