# TF-1730 (15/10/2026) : les mêmes requêtes, PARAMÉTRÉES. Les valeurs passent en second argument
# d'execute() ; str.format() ne sert qu'à un message de journal, hors de toute requête. PASS attendu.
import json
import logging

journal = logging.getLogger(__name__)


def chercher(cur, nom):
    cur.execute("SELECT * FROM comptes WHERE nom = %s", (nom,))
    journal.info("SELECT sur comptes : {} ligne(s)".format(cur.rowcount))


def purger(cur, ident):
    cur.execute("DELETE FROM sessions WHERE id = %(ident)s", {"ident": ident})


def enregistrer(cur, doc):
    cur.execute("INSERT INTO documents (corps) VALUES (%s)", (json.dumps({"corps": doc}),))
