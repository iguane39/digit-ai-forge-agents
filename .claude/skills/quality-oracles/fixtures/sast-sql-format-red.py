# TF-1730 (15/10/2026, constat de TF-1705) : requêtes SQL construites par str.format() ou par une
# f-string que la règle d'origine ne voyait pas (triples guillemets, préfixe rf), passées à execute().
# La valeur entre dans le texte SQL : chaque ligne d'appel doit être accusée.


def chercher(cur, nom):
    cur.execute("SELECT * FROM comptes WHERE nom = '{}'".format(nom))


def purger(cur, ident):
    cur.execute("DELETE FROM sessions WHERE id = {ident}".format(ident=ident))


def lister(cur, table):
    cur.execute('''SELECT * FROM {0} WHERE actif = 1'''.format(table))


def compter(cur, client):
    cur.execute(f"""SELECT count(*) FROM traces WHERE client = '{client}'""")


def filtrer(cur, motif):
    cur.execute(rf"SELECT * FROM journaux WHERE ligne ~ '{motif}'")
