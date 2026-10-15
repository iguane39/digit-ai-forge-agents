# TF-1705 (lot Produit-82 20261014c, RA-4) : requêtes psycopg à PARAMÈTRES LIÉS.
# `%s` et `%(nom)s` sont des marqueurs écrits dans le littéral ; les valeurs passent
# en second argument d'execute(). Aucune injection : l'oracle doit rendre PASS.


def purger(conn, ids):
    conn.execute("DELETE FROM sessions WHERE id = ANY(%s)", (ids,))
    conn.execute("DELETE FROM traces WHERE session_id = ANY(%s) AND age > %s", (ids, 30))


def exporter(cur, client, ids):
    cur.execute("SELECT * FROM traces WHERE client = %(client)s AND id = ANY(%(ids)s)",
                {"client": client, "ids": ids})
    cur.execute('UPDATE comptes SET solde = solde + %s WHERE id = %s', (10, client))
