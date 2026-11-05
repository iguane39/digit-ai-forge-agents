#!/usr/bin/env python3
"""appel_modele_sous_verrou.py — analyse statique (ast) : un appel de modèle tenu sous une transaction d'écriture.

TF-2163 (05/11/2026). Le fait (Produit-86, lot 20261104a, RA-2) : un produit rangeait des pseudonymes en
base SQLite, puis appelait le modèle, puis rétablissait les valeurs et validait. La transaction ouverte par
l'écriture restait tenue pendant toute la réflexion du modèle (des dizaines de secondes) : tout autre
écrivain attendait le verrou, et la fiche d'une mission est partie en erreur 500. Python ouvre la
transaction à la PREMIÈRE écriture (INSERT, UPDATE, DELETE, REPLACE) et la garde jusqu'à commit() ou
rollback() — le module sqlite3 n'a pas besoin de `BEGIN` pour cela.

CE QUE FAIT L'ANALYSE. Par fonction (et pour le corps du module), dans l'ordre du source, elle suit un état
« transaction d'écriture ouverte » :
  · s'ouvre à une écriture (`.execute / .executemany / .executescript` d'une requête INSERT|UPDATE|DELETE|
    REPLACE, ou `BEGIN IMMEDIATE|EXCLUSIVE`), à une écriture d'ORM dans un `with` transactionnel
    (`session.add`, `.save()`, `bulk_create`…) ;
  · se ferme à `.commit()`, `.rollback()`, `COMMIT|ROLLBACK|END`, et à la sortie d'un `with` transactionnel
    (`with conn:`, `with db.begin():`, `with transaction.atomic():`, `with engine.begin() as c:`) ;
  · un appel de modèle (SDK Anthropic ou OpenAI, `claude -p` lancé par subprocess, requête HTTP vers une API
    de modèle, ou un nom donné par --appel) pendant que l'état est ouvert est un constat.
Deux appels de fonctions du MÊME fichier sont suivis : celle qui appelle le modèle (directement ou par une
autre) compte comme un appel de modèle ; celle qui écrit et revient sans valider laisse la transaction ouverte
chez son appelant. Les branches (if, try) se joignent par union : ouverte sur un chemin = ouverte ; une
boucle se joue deux fois pour voir l'écriture d'un tour sous l'appel du suivant.

EXEMPTION DÉCLARÉE. `# appel-sous-verrou-ok: <raison, 8 caractères au moins>` sur la ligne de l'appel ou la
précédente : le constat devient une info nommée. Une raison absente ou trop courte n'exempte rien.

Sortie : JSON { findings: [...], exemptes: [...], fonctions_suivies: n }. Exit 0 ; 2 si le fichier ne se parse pas.
"""
import ast
import json
import re
import sys

DML = re.compile(r"^\s*(INSERT|UPDATE|DELETE|REPLACE|UPSERT)\b", re.I)
BEGIN_ECRITURE = re.compile(r"^\s*BEGIN\s+(IMMEDIATE|EXCLUSIVE)\b", re.I)
BEGIN_SIMPLE = re.compile(r"^\s*BEGIN\b", re.I)
FIN_TXN = re.compile(r"^\s*(COMMIT|ROLLBACK|END)\b", re.I)
EXEMPTION = re.compile(r"#\s*appel-sous-verrou-ok\s*:\s*(\S.{7,})")

# Appels de modèle reconnus par le NOM POINTÉ de l'appel (client.messages.create → « client.messages.create »).
APPELS_MODELE = [
    r"(^|\.)messages\.(create|stream)$",
    r"(^|\.)chat\.completions\.(create|stream)$",
    r"(^|\.)responses\.create$",
    r"(^|\.)generate_content(_async)?$",
    r"(^|\.)(call_llm|appeler_modele|appel_modele|appeler_claude|ask_claude|query_llm|run_claude)$",
]
HTTP = re.compile(r"(^|\.)(post|request|stream)$")
URL_MODELE = re.compile(r"api\.anthropic\.com|api\.openai\.com|/v1/messages|/v1/chat/completions|generativelanguage\.googleapis", re.I)
SUBPROCESS = re.compile(r"(^|\.)(run|Popen|check_output|check_call|call)$")

# Contextes de `with` qui valident à la sortie (transaction).
CONTEXTE_NOM = re.compile(r"^_?(conn|con|cnx|connection|db|database|cursor)$", re.I)
CONTEXTE_APPEL = re.compile(r"(^|\.)(begin|begin_nested|transaction|atomic|connect)$")
ECRITURE_ORM = re.compile(r"(^|\.)(session|sess)\.(add|add_all|merge|delete|flush)$|\.objects\.(create|update|delete|bulk_create|bulk_update|get_or_create|update_or_create)$|\.(save|bulk_create|bulk_update)$")


def nom_pointe(n):
    """« a.b.c » d'un Name/Attribute/Call ; '' sinon."""
    if isinstance(n, ast.Name):
        return n.id
    if isinstance(n, ast.Attribute):
        base = nom_pointe(n.value)
        return f"{base}.{n.attr}" if base else n.attr
    if isinstance(n, ast.Call):
        return nom_pointe(n.func)
    return ""


def texte_requete(call):
    """Le texte (ou son début) du premier argument d'un execute, '' si non littéral."""
    if not call.args:
        return ""
    a = call.args[0]
    if isinstance(a, ast.Constant) and isinstance(a.value, str):
        return a.value
    if isinstance(a, ast.JoinedStr):
        return "".join(v.value for v in a.values if isinstance(v, ast.Constant) and isinstance(v.value, str))
    if isinstance(a, ast.BinOp) and isinstance(a.left, ast.Constant) and isinstance(a.left.value, str):
        return a.left.value
    return ""


class Analyse:
    def __init__(self, source, extra_appels):
        self.source = source
        self.lignes = source.splitlines()
        self.arbre = ast.parse(source)
        self.motifs = [re.compile(p) for p in APPELS_MODELE + list(extra_appels)]
        self.autocommit = bool(re.search(r"isolation_level\s*=\s*None|autocommit\s*=\s*True", source))
        self.toutes = [n for n in ast.walk(self.arbre) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        self.fonctions = {n.name: n for n in self.toutes}
        self.appellent_modele = set()
        self.laissent_ouverte = set()
        self.findings = []
        self.exemptes = []
        self._vus = set()

    # ---- reconnaissance ------------------------------------------------------------------------
    def est_appel_modele(self, call):
        nom = nom_pointe(call.func)
        if any(m.search(nom) for m in self.motifs):
            return nom
        if SUBPROCESS.search(nom) and call.args and isinstance(call.args[0], (ast.List, ast.Tuple)) and call.args[0].elts:
            premier = call.args[0].elts[0]
            if isinstance(premier, ast.Constant) and isinstance(premier.value, str) and re.search(r"(^|[\\/])claude(\.exe|\.cmd)?$", premier.value):
                return f"{nom}([\"claude\", …])"
        if SUBPROCESS.search(nom) and call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str) and call.args[0].value.lstrip().startswith("claude "):
            return f"{nom}(\"claude …\")"
        if HTTP.search(nom) and call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str) and URL_MODELE.search(call.args[0].value):
            return f"{nom}({call.args[0].value[:40]!r})"
        court = nom.rsplit(".", 1)[-1]
        if court in self.appellent_modele:
            return f"{court}() [fonction de ce fichier qui appelle le modèle]"
        return ""

    def est_with_transactionnel(self, with_node):
        for item in with_node.items:
            ctx = item.context_expr
            nom = nom_pointe(ctx)
            dernier = nom.rsplit(".", 1)[-1]
            if isinstance(ctx, ast.Call):
                if CONTEXTE_APPEL.search(nom) and dernier in ("begin", "begin_nested", "transaction", "atomic", "connect"):
                    return True
            elif CONTEXTE_NOM.match(dernier):
                return True
        return False

    # ---- l'état et les évènements --------------------------------------------------------------
    def evenements(self, noeud):
        """Les évènements d'une expression, dans l'ordre d'évaluation (arguments avant l'appel)."""
        if isinstance(noeud, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            return
        if isinstance(noeud, ast.Call):
            for enfant in [noeud.func, *noeud.args, *[k.value for k in noeud.keywords]]:
                yield from self.evenements(enfant)
            yield from self.evenement_appel(noeud)
            return
        for enfant in ast.iter_child_nodes(noeud):
            yield from self.evenements(enfant)

    def evenement_appel(self, call):
        nom = nom_pointe(call.func)
        court = nom.rsplit(".", 1)[-1]
        if court in ("execute", "executemany", "executescript"):
            q = texte_requete(call)
            if BEGIN_ECRITURE.match(q):
                yield ("ecriture", call.lineno, "BEGIN " + q.split()[1].upper())
            elif BEGIN_SIMPLE.match(q):
                yield ("begin", call.lineno, "BEGIN")
            elif FIN_TXN.match(q):
                yield ("fin", call.lineno, q.split()[0].upper())
            elif DML.match(q):
                yield ("dml", call.lineno, q.strip().split()[0].upper())
        if court in ("commit", "rollback"):
            yield ("fin", call.lineno, court)
        if ECRITURE_ORM.search(nom):
            yield ("orm", call.lineno, court)
        modele = self.est_appel_modele(call)
        if modele:
            yield ("appel", call.lineno, modele)
        if court in self.laissent_ouverte:
            yield ("ecriture", call.lineno, f"{court}() [fonction de ce fichier qui écrit sans valider]")

    def scanner(self, stmts, etat, rapporter, dans_with_txn, nom_fonction):
        """Suit `stmts` dans l'ordre ; `etat` = dict(ouverte=(ligne, pourquoi)|None, begin=bool). Rend l'état de fin."""
        for s in stmts:
            etat = self.instruction(s, etat, rapporter, dans_with_txn, nom_fonction)
        return etat

    @staticmethod
    def union(a, b):
        return {"ouverte": a["ouverte"] or b["ouverte"], "begin": a["begin"] or b["begin"]}

    def instruction(self, s, etat, rapporter, dans_with_txn, nom_fonction):
        if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            return etat
        if isinstance(s, (ast.With, ast.AsyncWith)):
            txn = self.est_with_transactionnel(s)
            # les expressions d'entrée du with s'évaluent d'abord
            for item in s.items:
                etat = self.evts(self.evenements(item.context_expr), etat, rapporter, dans_with_txn, nom_fonction)
            etat = self.scanner(s.body, dict(etat), rapporter, dans_with_txn or txn, nom_fonction)
            if txn:
                etat = {"ouverte": None, "begin": False}     # la sortie du with valide (ou annule)
            return etat
        if isinstance(s, ast.If):
            etat = self.evts(self.evenements(s.test), etat, rapporter, dans_with_txn, nom_fonction)
            a = self.scanner(s.body, dict(etat), rapporter, dans_with_txn, nom_fonction)
            b = self.scanner(s.orelse, dict(etat), rapporter, dans_with_txn, nom_fonction)
            return self.union(a, b)
        if isinstance(s, (ast.For, ast.AsyncFor, ast.While)):
            tete = s.iter if not isinstance(s, ast.While) else s.test
            etat = self.evts(self.evenements(tete), etat, rapporter, dans_with_txn, nom_fonction)
            tour1 = self.scanner(s.body, dict(etat), rapporter, dans_with_txn, nom_fonction)
            tour2 = self.scanner(s.body, self.union(etat, tour1), rapporter, dans_with_txn, nom_fonction)
            sortie = self.union(etat, self.union(tour1, tour2))
            return self.scanner(s.orelse, sortie, rapporter, dans_with_txn, nom_fonction)
        if isinstance(s, ast.Try) or (hasattr(ast, "TryStar") and isinstance(s, getattr(ast, "TryStar"))):
            apres_corps = self.scanner(s.body, dict(etat), rapporter, dans_with_txn, nom_fonction)
            sorties = [self.scanner(s.orelse, dict(apres_corps), rapporter, dans_with_txn, nom_fonction)]
            for h in s.handlers:
                sorties.append(self.scanner(h.body, self.union(etat, apres_corps), rapporter, dans_with_txn, nom_fonction))
            fin = sorties[0]
            for x in sorties[1:]:
                fin = self.union(fin, x)
            return self.scanner(s.finalbody, fin, rapporter, dans_with_txn, nom_fonction)
        if isinstance(s, getattr(ast, "Match", ())):
            sorties = [self.scanner(c.body, dict(etat), rapporter, dans_with_txn, nom_fonction) for c in s.cases]
            for x in sorties:
                etat = self.union(etat, x)
            return etat
        return self.evts(self.evenements(s), etat, rapporter, dans_with_txn, nom_fonction)

    def evts(self, flux, etat, rapporter, dans_with_txn, nom_fonction):
        etat = dict(etat)
        for type_, ligne, detail in flux:
            if type_ == "begin":
                etat["begin"] = True
            elif type_ == "ecriture":
                etat["ouverte"] = etat["ouverte"] or (ligne, detail)
            elif type_ == "dml":
                if not self.autocommit or etat["begin"] or dans_with_txn:
                    etat["ouverte"] = etat["ouverte"] or (ligne, detail)
            elif type_ == "orm":
                if dans_with_txn:
                    etat["ouverte"] = etat["ouverte"] or (ligne, detail)
            elif type_ == "fin":
                etat = {"ouverte": None, "begin": False}
            elif type_ == "appel" and etat["ouverte"] and rapporter:
                self.constat(ligne, detail, etat["ouverte"], nom_fonction)
        return etat

    def exemption(self, ligne):
        for l in (ligne, ligne - 1):
            if 1 <= l <= len(self.lignes):
                m = EXEMPTION.search(self.lignes[l - 1])
                if m:
                    return m.group(1).strip()
        return None

    def constat(self, ligne, appel, ouverte, fonction):
        cle = (ligne, ouverte[0])
        if cle in self._vus:
            return
        self._vus.add(cle)
        raison = self.exemption(ligne)
        element = {"ligne": ligne, "appel": appel, "ecriture_ligne": ouverte[0], "ecriture": ouverte[1], "fonction": fonction}
        if raison:
            self.exemptes.append({**element, "raison": raison})
        else:
            self.findings.append(element)

    # ---- orchestration -------------------------------------------------------------------------
    def lancer(self, extra=()):
        # 1. fonctions du fichier qui appellent le modèle (point fixe)
        def appelle_le_modele(fn):
            return any(isinstance(n, ast.Call) and self.est_appel_modele(n) for n in ast.walk(fn))
        for _ in range(8):
            avant = set(self.appellent_modele)
            for fn in self.toutes:
                if appelle_le_modele(fn):
                    self.appellent_modele.add(fn.name)
            if self.appellent_modele == avant:
                break
        # 2. fonctions qui écrivent et reviennent sans valider (point fixe)
        for _ in range(8):
            avant = set(self.laissent_ouverte)
            for fn in self.toutes:
                fin = self.scanner(fn.body, {"ouverte": None, "begin": False}, False, False, fn.name)
                if fin["ouverte"]:
                    self.laissent_ouverte.add(fn.name)
            if self.laissent_ouverte == avant:
                break
        # 3. le jugement
        for fn in self.toutes:
            self.scanner(fn.body, {"ouverte": None, "begin": False}, True, False, fn.name)
        corps_module = [s for s in self.arbre.body]
        self.scanner(corps_module, {"ouverte": None, "begin": False}, True, False, "<module>")
        self.findings.sort(key=lambda f: f["ligne"])
        return {"findings": self.findings, "exemptes": self.exemptes, "fonctions_suivies": len(self.fonctions)}


def main(argv):
    if not argv or argv[0].startswith("--"):
        print("usage : appel_modele_sous_verrou.py <fichier.py> [--appel <regex> …]", file=sys.stderr)
        return 2
    extra = [argv[i + 1] for i, a in enumerate(argv) if a == "--appel" and i + 1 < len(argv)]
    try:
        with open(argv[0], encoding="utf-8-sig") as f:
            source = f.read()
        res = Analyse(source, extra).lancer()
    except SyntaxError as e:
        print(json.dumps({"erreur": f"fichier Python non analysable : {e.msg} (ligne {e.lineno})"}, ensure_ascii=False))
        return 2
    print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main(sys.argv[1:]))
