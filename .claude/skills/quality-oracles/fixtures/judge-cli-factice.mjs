#!/usr/bin/env node
// judge-cli-factice — fait office de CLI `claude` pour la recette d'oracle-judge (TF-2033, 02/11/2026).
// Il répond ce que contient le fichier QO_JUGE_REPONSE, tel quel, sans aucun appel de modèle : la recette
// prouve ainsi ce que l'oracle fait d'un verdict (FAIL → exit 1, PASS → exit 0, sortie hors contrat → SKIP),
// et jamais ce qu'un juge LLM décide d'un texte, qui varie d'un appel à l'autre.
import fs from 'node:fs';

const reponse = process.env.QO_JUGE_REPONSE;
if (!reponse || !fs.existsSync(reponse)) {
  process.stderr.write('judge-cli-factice : QO_JUGE_REPONSE absent ou introuvable\n');
  process.exit(3);
}
process.stdout.write(fs.readFileSync(reponse, 'utf8'));
