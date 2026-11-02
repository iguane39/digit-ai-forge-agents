# L'espace et les tours

## Disposition

```text
<espace>/
  document/            origine.<ext>, brief.md, sources/, reference/
  essais/<modele>-<n>/ etat.json, jugements.json, aveugle.json, classement.json
    tours/000/         l'origine : document.<ext>, controle.json
    tours/<NNN>/       document.<ext>, note.json, controle.json, sortie.jsonl, historique.md,
                       modifs.json pour un PDF, capture.png pour une page HTML
  apercus/             images de pages, reconstruites à la demande
  simulation/          compteurs de `--simuler`, jamais écrits par un tour réel
```

L'espace par défaut est `C:\dev\_essais-make-it-better\<AAAAMMJJ>-<nom court>\`, ou la même chose sous `$FORGE_ROOT`. `lancer.mjs` refuse tout espace situé dans un dépôt git, quelle que soit sa visibilité : les versions d'un document n'entrent jamais dans un dépôt.

## Le brief

```markdown
- Lecteur : qui lit ce document, et ce qu'il sait déjà.
- Objectif : ce que le lecteur saura ou fera après l'avoir lu.
- Plafond de mots : 1200
- Référence : reference/modele.md, ce qu'elle montre.
```

Lecteur, Objectif et Référence sont exigés. Sans plafond chiffré, le plafond vaut 1,5 fois les mots de l'origine. `reference/` porte une forme à imiter et n'est pas une source : un fait qui ne vit que là est refusé. Une source doit se lire en texte : `.md`, `.txt`, `.html`, `.csv`, `.json`, `.docx`, ou `.pdf` à couche de texte. Une autre refuse le lancement, car ses faits seraient refusés à tort.

## Un tour

1. `etat.json` reçoit le marqueur `tour_en_cours`.
2. Le lanceur crée un dossier temporaire hors de l'espace et de tout dépôt, et y copie la dernière version gardée, `brief.md`, `sources/`, `reference/`. Il y écrit `historique.md`, les 5 dernières notes avec les rejets et leur motif. Pour une page HTML, il y joue la capture ; si elle manque, le tour se joue sans elle et `controle.json` le note.
3. La CLI tourne sans shell, avec les arguments de `argumentsDeTour` dans `lancer.mjs`, et son environnement perd les clés d'API et les variables de la session parente. Après 15 minutes, le processus est tué, la sortie partielle écartée, le motif « délai » noté : c'est un rejet.
4. Le lanceur juge, sans modèle, et rapatrie. `controle.json` s'écrit en dernier ; c'est lui qui dit qu'un tour est fini.

| Format | Ligne de consigne | Inchangé | Rejet propre au format |
|---|---|---|---|
| Markdown, HTML | Modifie `document.<ext>` | fichier identique octet par octet | fichier supprimé |
| Word | Modifie le texte de `paquet/word/document.xml` | ce fichier identique octet par octet | `oracle-docx` différent de exit 0, autre partie du paquet touchée |
| PDF | Écris `modifs.json` | liste vide ou absente, `ancien` égal à `nouveau` | liste invalide, `ancien` introuvable ou ambigu, texte hors de la page ou sur une autre ligne, `document.pdf` touché |

Le paquet d'un Word se dépaquette avec `word/document.xml` à une ligne par paragraphe, car l'outil `Read` se borne par lignes et Word écrit tout sur une seule. Ces sauts de ligne restent dans les versions : ils ne changent ni le texte ni le rendu.

Mots et faits se comptent sur le texte extrait. Le plafond d'un Word se compte sur le corps du document et ses notes ; ses en-têtes et pieds comptent seulement comme faits connus. Un Word dont les balises changent sans casser le paquet n'est pas rejeté : la consigne le demande, l'oracle juge la validité.

## Les arrêts

Le lanceur s'arrête au premier cas atteint, et `etat.json` dit lequel.

| Cas | Effet | `etat.json` |
|---|---|---|
| 2 réponses « rien » de suite | arrêt | `arret.type` = `2-rien` |
| La borne de tours | arrêt, repoussable par `--reprendre --tours <n>` tant que la revue n'est pas ouverte | `borne` |
| 3 versions rejetées de suite | arrêt | `3-rejets` |
| `apiKeySource` différent de `none` | arrêt immédiat, tour non compté | `identite` |
| `isUsingOverage` vrai | arrêt immédiat, tour non compté | `overage` |
| Modèle servi qui ne commence pas par `claude-opus-` (`claude-sonnet-` pour `--modele sonnet`) | arrêt immédiat, tour non compté | `modele` |
| `utilization` à 0,80 ou plus | pause ; la reprise attend `resetsAt` | `pause.type` = `quota` |
| `status` différent de `allowed` | pause | `statut` |
| 3 tours de suite sans mesure lisible | pause ; reprise libre | `sans-mesure` |

`utilization` hors de [0, 1] compte comme une mesure manquante. Une limite atteinte avant que le modèle ait écrit n'accuse pas le document : pas de rejet, le tour se rejoue.

## Les champs lus dans la sortie

Relevés sur la CLI 2.1.314 : `apiKeySource` et `model` dans l'événement `system` de sous-type `init` ; `message.model` de chaque événement `assistant` ; `rate_limit_info.status`, `rate_limit_info.isUsingOverage`, `rate_limit_info.unifiedWindows.seven_day.utilization` et `.resetsAt` dans `rate_limit_event`. Un nom qui change se corrige dans `scripts/lib/sortie.mjs`, et nulle part ailleurs.

## La reprise

Un marqueur sans `controle.json` vaut coupure du poste : le tour se rejoue sans compter de rejet, et la coupure se note dans `etat.coupures`. Un marqueur avec `controle.json` vaut tour fini : il ne se rejoue pas. Les compteurs d'arrêt se recalculent toujours depuis les `controle.json`. Un lanceur encore vivant bloque la reprise, sauf si son numéro de processus a démarré après le marqueur : Windows redonne vite un numéro, c'est alors un autre processus.
