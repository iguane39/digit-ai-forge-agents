---
name: delegue-a-codex-et-gemini
description: >
  Confie à Codex (GPT) et à Gemini (par Antigravity) l'un des 3 gestes que la Factory leur ouvre, sur
  l'abonnement du porteur et sans API : relire à charge un prompt ou un document généré par Claude,
  concevoir une variante de design pour en présenter 3 à challenger, générer une image dont Claude a
  besoin. Un lanceur unique tient le bac à sable par construction : dossier jetable hors de tout dépôt,
  lecture seule pour relire, aucun drapeau qui lève une protection. Use when / déclencher dès qu'une
  relecture aveugle d'un autre modèle est voulue (boucle L99, contre-expertise, note ou étude à relire),
  qu'un design, une maquette ou une direction artistique est demandé à Claude, ou qu'une image, une
  illustration ou un visuel doit être produit, et quand l'utilisateur demande la procédure pour
  installer ou connecter Codex ou Gemini. Agent non configuré sur le poste : Claude travaille seul,
  sans erreur, et l'annonce de la possibilité sort une seule fois. Ne pas déclencher pour du code ou des commits dans un
  dépôt (Codex ne peut pas commiter), pour juger un livrable par oracle (→ quality-oracles), ni pour
  une API d'OpenAI ou de Gemini dans un produit (→ integre-openai-gemini).
metadata:
  version: "1.1.0"
---

# delegue-a-codex-et-gemini — un second modèle pour relire, concevoir et dessiner

Claude reste le pilote. Codex et Gemini exécutent un geste borné et rendent un résultat que Claude juge
avant tout usage. Décisions du porteur : D-240 (b) et sa réponse à D-231, le 23/11/2026.

## Avant tout geste : seulement les agents configurés

Consigne du porteur du 23/11/2026 : « Ne faire travailler les autres LLMs que s'ils sont configurés
sur le poste. Si aucun autre LLM n'est configuré, ne pas remonter d'erreurs, travailler uniquement
avec Claude. »

```
node {skilldir}/scripts/agent-tiers.mjs etat
```

- **`PRET`** : la liste `disponibles` nomme les agents installés et connectés. Seuls ceux-là reçoivent
  un geste ; Claude fait la part d'un agent absent.
- **`CLAUDE_SEUL`** : aucun agent n'est prêt. Claude fait tout le geste seul, avec ses propres moyens.
  Ce n'est pas une erreur : rien ne se signale comme un défaut, un risque ou un reste, ni dans la
  restitution ni dans un retour au pilot.
- **`annonce`** non nulle : la recopier une fois à l'utilisateur, telle quelle, dans la réponse du
  tour. Elle sort une seule fois par poste, la première fois qu'un agent manque, et dit que Codex et
  Gemini peuvent travailler avec Claude sur abonnement payant. Sa marque vit dans
  `~/.digit-ai/agents-tiers.json`.
- **« procédure Codex et Gemini »**, ou toute demande d'installer ou de connecter l'un d'eux : rendre
  la procédure pas à pas de [references/installer-codex-et-gemini.md](references/installer-codex-et-gemini.md).

Un geste lancé vers un agent absent rend `ABSENT` en code 0, jamais un refus : l'appelant le traite
comme `CLAUDE_SEUL` pour cet agent. Installé veut dire que le binaire est là ; connecté, que le
fichier posé par la connexion existe. Une connexion expirée ne se voit qu'au premier geste réel, qui
rend alors `FAIL` : Claude fait le geste seul et le dit en une ligne.

## Les 3 gestes

| Geste | Quand | Lanceur | Usage du résultat par Claude |
|---|---|---|---|
| `relire` | une boucle L99, une contre-expertise, une note ou une étude à relire | lecture seule : Codex `-s read-only`, Antigravity `--mode plan` sans droit d'écriture | recompte chaque défaut grave à la source avant de le corriger ; un relecteur tiers ne remplace pas l'oracle |
| `concevoir` | un design, une maquette ou une direction est demandé | Codex et Gemini produisent chacun une variante du même brief, chacun dans son dossier | présente 3 variantes côte à côte (la sienne et les 2 tierces), jugées par `critique-le-design` ou par la rubrique de `studio-de-direction` |
| `image` | Claude a besoin d'une image, d'une illustration ou d'un visuel | génération native (ImageGen chez Codex, Gemini chez Antigravity), PNG écrit sous le nom demandé | vérifie le fichier (format, dimensions) et le regarde avant de l'employer |

Claude ne génère pas d'image : il la dessine par programme. Au 2e banc du 23/11/2026, la relecture
aveugle a noté l'image de Claude 5, celles de Codex et de Gemini 9.

## Lancer

```
node {skilldir}/scripts/agent-tiers.mjs relire    --agent codex|antigravity --dossier <jetable> --consigne <f.md> --json --sortie <res.json>
node {skilldir}/scripts/agent-tiers.mjs concevoir --agent codex|antigravity --dossier <jetable> --consigne <brief.md> --sortie <res.json>
node {skilldir}/scripts/agent-tiers.mjs image     --agent codex|antigravity --dossier <jetable> --prompt "<demande>" --nom <x.png> --sortie <res.json>
```

1. Crée un dossier jetable par agent et par geste, hors de tout dépôt git ; le lanceur refuse un dossier
   sous `.git`. Copies-y l'entrée : le document à relire, le brief.
2. Lance les agents de la liste `disponibles` d'`etat`, et eux seuls, en parallèle, en arrière-plan (de 1 à 7 minutes chacun) ; l'entrée standard est fermée.
3. Lis la sortie JSON : `verdict` PASS ou FAIL, `reponse`, `json` (avec `--json`), `fichiers_ecrits`.
4. Juge le résultat, puis ressors du dossier jetable ce qui sert, vers sa place chez le produit.

Modèles par défaut : `gpt-6.2-sol` et `gemini-4-neon-high`, effort `high` ; `--modele` et `--effort`
les changent. Délai : `--delai`, 600 s pour `concevoir`, 400 s sinon.

Durées mesurées le 23/11/2026, 1 essai par case :

| Geste | Codex | Gemini |
|---|---|---|
| `relire` une note de 100 lignes | 175 s | 261 s |
| `concevoir` une page d'accueil | plus de 430 s, fichier complet écrit | 326 s |
| `image` en aquarelle | 90 s, 1536 × 1024 | 162 s, 1376 × 768 |

Sur la note 20261123c, les 2 relecteurs tiers ont trouvé, chacun de son côté, les 3 mêmes défauts
graves, qui ont résisté au recompte. Gemini a ajouté un biais qu'aucun relecteur Claude ne pouvait
voir : un juge Claude notait seul Claude face aux 2 autres modèles.

## Relire : la consigne

La consigne d'un relecteur tiers est celle d'un relecteur aveugle de Claude : elle nomme le lecteur
du document, les classes de défaut (grave, majeur, mineur), exige une citation exacte par défaut, et
demande un JSON seul. Le relecteur tiers ne voit ni l'analyse, ni les passes précédentes, ni l'auteur.

- **Boucle L99** (`prompt-analyzer-l99`, `references/boucle.md`) : l'un des 2 relecteurs d'une passe
  peut être Codex ou Gemini ; le journal porte `relecteur.type` : `codex` ou `antigravity`.
- **Document généré** (note, étude, synthèse) : un relecteur tiers s'ajoute au relecteur Claude, et
  les 2 regards se croisent ; un défaut vu par un seul se recompte avant d'être retenu.

## Concevoir : 3 designs à challenger

Le brief est le même pour les 3 : lecteur, objectif, contraintes, format de sortie. Chaque agent
nomme sa direction en une phrase. Claude produit la sienne, puis présente les 3 rendus (captures à
375 et 1280 px) avec une rubrique figée avant de voir les variantes. Le choix revient à l'humain
quand le skill appelant le prévoit (`studio-de-direction`, `systeme-de-marque`), sinon à la rubrique.

## Hors du champ de ce skill

- Pas de code ni de commit dans un dépôt : le bac à sable de Codex interdit `.git` ; pour ce travail,
  la file de tickets d'un produit le route à part.
- Pas de restitution, de décision ni de publication : les hooks de la Factory ne tournent que dans
  Claude Code, et un agent tiers n'en a aucun.
- Pas de quota garanti : Codex sur l'offre Plus a pris 9 % de sa fenêtre de 5 heures pour 10 appels
  (relu le 23/11/2026) ; le quota de Gemini n'est pas lisible en ligne de commande.

## Sécurité, mesurée le 23/11/2026

- Codex, `workspace-write` : écrit dans son dossier, jamais dans `.git` ; `%TEMP%` retiré de ses droits.
- Antigravity, `--sandbox` : l'écriture hors du dossier est refusée par l'outil comme par le terminal,
  sauf sous `%TEMP%` ; le réseau des commandes est coupé (essai A-6, 3 appels, témoin intact).
- Le lanceur ne construit jamais `--dangerously-*`, `danger-full-access` ni de contournement :
  sa recette le vérifie (`node {skilldir}/scripts/self-test.mjs`, 14 cas, dont 6 sur des postes sans agent, avec un seul ou avec les deux).
