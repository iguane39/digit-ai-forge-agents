# Fixture de valeur — expert `accessibilite` (rejouée le 21/07/2026)

**Demande témoin** : « Nous allons projeter la fiche architecture X14 en salle chez le client (vidéoprojecteur, une personne malvoyante dans l'audience) puis l'envoyer en PDF — points d'attention avant diffusion ? »

**Protocole** : la section A (baseline) a été figée avant le durcissement de la fiche ; la section B applique la rubrique figée (5 axes) avec lecture du corpus. Verdict attendu : `oracle-judge` armé de `references/rubrique-juge-experts.md` (ou verdict humain).

---

## A. Baseline (sans la fiche)

Avant diffusion : vérifier que la fiche passe la checklist zéro défaut visuel de la forge (débordements, contraste, chevauchements) via `render_page.py` ; tester l'export PDF pour s'assurer que la mise en page tient ; relire les placeholders pour qu'aucun `{{…}}` ne subsiste ; prévoir une copie imprimée de secours si le vidéoprojecteur fait défaut ; envoyer le PDF après la séance plutôt qu'avant pour garder l'attention.

## B. Contribution expert-accessibilite (annotations par axe de la rubrique)

**Axe 1 — Contraste sur le support final.** Le PASS de `render_page.py` vaut pour un écran ; un vidéoprojecteur en salle éclairée écrase le contraste effectif — un ratio mesuré à 4.5:1 peut descendre sous le seuil perçu. → Deux actions : tester la fiche sur le projecteur réel (ou régler la salle en éclairage réduit), et pour la personne malvoyante, prévoir la fiche sur un écran individuel à distance de lecture choisie plutôt que la projection seule (corpus : checklist propre §1–2 — le seuil se juge sur le support final, la distance de lecture change la taille minimale).

**Axe 2 — Couleur seule.** Le schéma en zones de la fiche architecture distingue les composants par familles de couleurs ; en projection délavée ou pour une vision déficiente des couleurs, cette distinction disparaît. → Vérifier que chaque zone porte aussi son libellé textuel (c'est le cas dans le gabarit) et annoncer oralement les distinctions de zones pendant la présentation plutôt que « comme vous le voyez en vert » (corpus : §3 — jamais d'information portée par la couleur seule).

**Axe 3 — Lecture non visuelle.** Le schéma central n'a pas d'équivalent textuel : pour la personne malvoyante et pour tout lecteur du PDF en synthèse vocale, il est muet. → Ajouter sous le schéma (ou en annexe du PDF) une lecture textuelle en 4–5 lignes : zones, composants par zone, sens des flux — le tableau de décisions de la fiche en fournit déjà la matière (corpus : §4 — alternative textuelle sur tout élément porteur de sens).

**Axe 4 — PDF/print.** Si la fiche embarque des tooltips ou libellés au survol (pattern des gabarits Digit-AI), ils sont inertes en PDF : l'information n'existe plus pour le destinataire. → Avant envoi, balayer les éléments à `:hover`/JS et vérifier leur équivalent statique visible ; sinon les matérialiser (corpus : piège PDF — hover/focus/JS inertes, équivalent statique exigé).

**Axe 5 — Publics et contexte.** Salle, vidéoprojecteur, audience mixte : prévoir la remise du PDF **avant ou pendant** la séance à la personne malvoyante (lecture à son rythme et à sa taille), à rebours du réflexe « PDF après pour garder l'attention » de la baseline — l'attention des uns ne doit pas coûter l'accès des autres. → Envoi anticipé ciblé + version projetée pour la salle.

---

*Écart notable avec la baseline : B contredit ou dépasse A sur deux points concrets (validité du PASS écran en projection ; timing d'envoi du PDF) et ajoute trois actions absentes (équivalent textuel du schéma, balayage des tooltips, écran individuel). Verdict : en attente.*
