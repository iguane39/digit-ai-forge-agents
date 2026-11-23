---
lecteur: l'utilisateur de la Factory sous Windows qui veut faire travailler Codex ou Gemini avec Claude, et qui paie déjà l'abonnement correspondant
---

# Installer et connecter Codex et Gemini

Cette procédure vous permet de faire travailler Codex ou Gemini avec Claude sur votre poste. Ils relisent un document, proposent une variante de design et génèrent des images. Claude les lance lui-même et juge leur résultat. Sans eux, Claude fait ces gestes seul, sans erreur.

Chaque agent consomme votre abonnement, jamais une clé d'API : la Factory n'autorise aucune API payante hors de Claude. Installez l'un, l'autre ou les deux.

## Ce qu'il vous faut

- Windows, avec Node.js 20 ou plus : `node -v` l'affiche.
- Pour Codex, un abonnement ChatGPT payant. L'offre Plus suffit : le 23/11/2026, 10 appels ont pris 9 % de sa fenêtre de 5 heures.
- Pour Gemini, un compte Google avec un abonnement payant qui ouvre Antigravity. Gemini CLI ne sert plus : depuis le 21/11/2026, le serveur de Google le refuse aux comptes personnels et renvoie vers Antigravity.

## Codex

1. Installez le programme, dans PowerShell :
   ```powershell
   npm install -g @openai/codex
   codex --version
   ```
   La Factory l'a mesuré en version 0.171.0, le 21/11/2026.
2. Connectez votre compte ChatGPT :
   ```powershell
   codex login
   ```
   Le navigateur s'ouvre ; connectez-vous. Sans navigateur sur le poste, `codex login --device-auth` donne un code à saisir sur une page. N'utilisez jamais `codex login --with-api-key` : une clé facture chaque appel.
3. Vérifiez la connexion :
   ```powershell
   codex login status
   ```
   Réponse attendue : « Logged in using ChatGPT ».
4. Vérifiez le bac à sable de Windows. Le fichier `~\.codex\config.toml` doit porter :
   ```toml
   [windows]
   sandbox = "elevated"
   ```
   Ce bac à sable empêche Codex d'écrire hors de son dossier. Son installation demande une fois l'accord d'un administrateur. Sur le poste mesuré, l'extension VS Code l'avait faite le 12/11/2026. Sur un poste neuf, le moment exact de cette demande n'a pas été observé.
5. Diagnostic facultatif : `codex doctor` rend ses contrôles. Ses 2 avertissements habituels sont facultatifs : une exclusion Microsoft Defender et un Dev Drive.

Le fichier `~\.codex\auth.json` porte votre connexion. Ne le copiez pas, ne le lisez pas et ne le commitez jamais.

## Gemini, par Antigravity

1. Téléchargez le script d'installation officiel, lisez-le, puis lancez-le :
   ```powershell
   Invoke-WebRequest https://antigravity.google/cli/install.ps1 -OutFile "$env:TEMP\install-agy.ps1"
   notepad "$env:TEMP\install-agy.ps1"
   powershell -ExecutionPolicy Bypass -File "$env:TEMP\install-agy.ps1"
   ```
   Le script pose `agy.exe` dans `%LOCALAPPDATA%\agy\bin`, pour vous seul, sans droits d'administrateur. Il refuse d'installer un binaire dont l'empreinte SHA-512 diffère de celle annoncée.
2. Vérifiez l'installation :
   ```powershell
   agy --version
   ```
   La Factory l'a mesuré en version 1.5.14, signé par Google LLC.
3. Connectez votre compte Google en ouvrant `agy` une première fois. Le navigateur s'ouvre ; connectez-vous, puis choisissez le dossier de confiance proposé. Cette connexion pose `~\.gemini\antigravity-cli\settings.json`.
4. Vérifiez la connexion :
   ```powershell
   agy models
   ```
   Le code de retour 0 et une liste de modèles confirment la connexion. Le 21/11/2026, 23 modèles étaient listés, dont Gemini 4.

## Brancher la Factory

1. Copiez les skills de la Factory chez les agents, depuis le dossier du pilot :
   ```powershell
   node bootstrap.mjs --pull
   ```
   Le script `scripts/propager-skills-agents.mjs` copie les skills vers `~\.codex\skills` et `~\.gemini\config\skills`. Il ne touche que les agents installés.
2. Demandez à Claude de vérifier le poste. Il lance :
   ```powershell
   node <dossier du skill delegue-a-codex-et-gemini>\scripts\agent-tiers.mjs etat
   ```
   Le verdict `PRET` et la liste `disponibles` disent quels agents travailleront. `CLAUDE_SEUL` veut dire qu'aucun n'est prêt : reprenez l'étape qui manque.

## Revenir en arrière

- Codex : `codex logout` coupe la connexion, puis `npm uninstall -g @openai/codex` retire le programme.
- Antigravity : supprimez le dossier `%LOCALAPPDATA%\agy` et `~\.gemini\antigravity-cli`.

Ces 2 gestes vous reviennent : la Factory ne supprime aucun programme de votre poste. Après eux, Claude travaille seul, sans erreur.
