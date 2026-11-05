"""Fixture ROUGE de oracle-appel-modele-sous-verrou (TF-2163, lot Produit-86 20261104a, RA-2).

Le cas payé, réduit à sa forme : des pseudonymes rangés en base SQLite AVANT l'appel du modèle. Python ouvre
la transaction à la première écriture et la tient jusqu'à commit() : le verrou d'écriture reste pris pendant
toute la réflexion du modèle, et la fiche d'une mission part en erreur 500.

Attendu : FAIL avec 3 constats —
  1. proposer()            : l'écriture passe par un helper de ce fichier (ranger_pseudonymes) qui ne valide pas ;
  2. proposer_avec_bloc()  : écriture et appel directs dans un `with sqlite3.connect(...)` ;
  3. exemption_trop_courte : une exemption sans vraie raison n'exempte rien.
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
    reponse = appeler_modele(texte)          # le verrou d'écriture est tenu ici
    conn.commit()
    return reponse


def proposer_avec_bloc(db_path, texte):
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE missions SET etat = 'en_cours' WHERE id = ?", (1,))
        return client.messages.create(
            model="claude-sonnet-5-5", max_tokens=1024, messages=[{"role": "user", "content": texte}]
        )


def exemption_trop_courte(conn, texte):
    conn.execute("DELETE FROM brouillons WHERE id = ?", (1,))
    # appel-sous-verrou-ok: ok
    return appeler_modele(texte)
