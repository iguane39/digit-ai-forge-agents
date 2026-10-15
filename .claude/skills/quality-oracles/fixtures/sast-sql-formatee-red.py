# TF-1705 (lot Produit-82 20261014c, RA-4) : la MÊME requête, cette fois FORMATÉE en Python.
# Le `%` et le `+` sont posés HORS du littéral : la valeur entre dans le texte SQL, c'est une
# injection. Chaque ligne doit rester accusée après la correction du faux positif psycopg.


def purger(conn, ids):
    conn.execute("DELETE FROM sessions WHERE id = ANY(%s)" % (ids,))


def chercher(cur, nom):
    cur.execute("SELECT * FROM comptes WHERE nom = '%s'" % nom)


def chercher_par_concatenation(cur, nom):
    cur.execute("SELECT * FROM comptes WHERE nom = '" + nom + "'")
