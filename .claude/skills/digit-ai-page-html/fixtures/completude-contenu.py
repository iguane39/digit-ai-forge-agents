"""Module de contenu de la fixture TF-2362 : des données, lues par `ast` et jamais exécutées.

Ce docstring n'est pas une affectation : il n'entre pas dans la source jugée.
"""
import os

# Si ce module était exécuté, la ligne suivante lèverait : la lecture par ast ne l'exécute pas.
ECHEC_SI_EXECUTE = os.environ["VARIABLE_QUI_N_EXISTE_PAS_TF2362"]

TITRE = "Kit des apporteurs"
SECTIONS = [
    {"id": "intro", "titre": "Ce que vous apportez",
     "corps": "Un apporteur présente une opportunité et " "suit le dossier jusqu'à sa signature."},
    {"id": "etapes", "titre": "Les trois étapes",
     "items": ("Qualifier le besoin", "Présenter l'équipe", "Suivre la proposition")},
    {"id": "contact", "titre": "Qui contacter",
     "corps": "Écrire à l’équipe commerciale avant toute relance du client."},
]
PIED = f"{TITRE} — calculé à l'exécution"
