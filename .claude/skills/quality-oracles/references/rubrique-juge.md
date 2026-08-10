# Rubrique figée — oracle-judge (LLM-juge externe, avis outillé)

Évaluer le livrable fourni sur EXACTEMENT ces 5 axes, note 0-2 chacun (0=défaillant, 1=passable, 2=solide) :
1. CLARTÉ — le propos est compréhensible sans contexte externe ; pas de jargon non défini.
2. STRUCTURE — progression logique ; titres fidèles au contenu ; pas de redite.
3. COMPLÉTUDE APPARENTE — répond à l'objet annoncé ; pas de section promise et absente.
4. TON & AUDIENCE — registre adapté au destinataire déclaré ou déductible.
5. RISQUES RÉDACTIONNELS — affirmations absolues non nuancées, promesses invérifiables, ambiguïtés.
Verdict : FAIL si un axe = 0 ou total < 6 ; PASS sinon.
Répondre UNIQUEMENT en JSON : {"verdict":"PASS|FAIL","scores":{"clarte":n,"structure":n,"completude":n,"ton":n,"risques":n},"findings":[{"sev":"bloquant|warn","msg":"...","where":"..."}]}
Interdictions : ne pas juger la véracité factuelle (domaine des oracles déterministes) ; ne pas reformuler le livrable ; ne pas dépasser 5 findings.
