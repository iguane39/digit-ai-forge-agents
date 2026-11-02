// lib/cas-simules.mjs — les cas de `lancer.mjs --simuler`, chacun avec son verdict attendu.
// Aucun appel au modèle : simulateur-tour.mjs prend sa place, lancé par le même code de processus, et
// tout le contrôle qui suit est le vrai. Chaque garde-fou a un cas rouge, qui le déclenche, et un vert,
// qui montre qu'il ne se déclenche pas à tort.

const change = (n) => Array.from({ length: n }, () => 'change');

const CAS_DE_BASE = {
  // 2 « rien » de suite
  'rien-2': { tours: 5, deroule: ['rien', 'rien'], attendu: { arret: '2-rien', joues: 2, exit: 0 } },
  'rien-1': { tours: 3, deroule: ['rien', 'change', 'rien'], attendu: { arret: 'borne', joues: 3, exit: 0 } },
  // Fait inventé
  'fait-invente': { tours: 1, deroule: ['fait-invente'], attendu: { statuts: ['rejetee'], motif: /Zorglub/, arret: 'borne' } },
  'fait-source': { tours: 1, deroule: ['fait-source'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'fait-reference': { tours: 1, deroule: ['fait-reference'], attendu: { statuts: ['rejetee'], motif: /Sirius/, arret: 'borne' } },
  // Plafond de mots
  'plafond-depasse': { tours: 1, deroule: ['trop-long'], attendu: { statuts: ['rejetee'], motif: /plafond de mots/, arret: 'borne' } },
  'plafond-tenu': { tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'plafond-defaut': { tours: 1, plafondBrief: null, deroule: ['trop-long'], attendu: { statuts: ['rejetee'], motif: /plafond de mots/, plafondSource: '1,5 fois l\'origine', arret: 'borne' } },
  // 3 versions rejetées de suite
  'rejets-3': { tours: 6, deroule: ['fait-invente', 'note-absente', 'note-invalide'], attendu: { arret: '3-rejets', joues: 3, exit: 0 } },
  'rejets-2': { tours: 4, deroule: ['fait-invente', 'fait-invente', 'change', 'fait-invente'], attendu: { arret: 'borne', joues: 4, statuts: ['rejetee', 'rejetee', 'gardee', 'rejetee'] } },
  // Une version rejetée ne sert pas de base au tour suivant
  'rejet-sans-base': { tours: 2, deroule: ['fait-invente', 'change'], attendu: { statuts: ['rejetee', 'gardee'], base: { 2: 0 }, absent: { 2: 'Zorglub' } } },
  // Identité : arrêt immédiat, tour non compté
  apikey: { tours: 3, flux: { apiKeySource: 'apikey' }, attendu: { arret: 'identite', joues: 0, exit: 4 } },
  'apikey-none': { tours: 1, deroule: change(1), attendu: { arret: 'borne', joues: 1, exit: 0, apiKeySource: 'none' } },
  overage: { tours: 3, flux: { isUsingOverage: true }, attendu: { arret: 'overage', joues: 0, exit: 4 } },
  'overage-faux': { tours: 1, flux: { isUsingOverage: false }, deroule: change(1), attendu: { arret: 'borne', joues: 1, exit: 0 } },
  'modele-different': { tours: 3, flux: { model: 'claude-sonnet-5' }, attendu: { arret: 'modele', joues: 0, exit: 4 } },
  'modele-attendu': { tours: 1, deroule: change(1), attendu: { arret: 'borne', joues: 1, exit: 0 } },
  'modele-sonnet-opus': { tours: 3, modele: 'sonnet', flux: { model: 'claude-opus-5-5' }, attendu: { arret: 'modele', joues: 0, exit: 4, essai: 'sonnet-1' } },
  'modele-sonnet': { tours: 1, modele: 'sonnet', flux: { model: 'claude-sonnet-5' }, deroule: change(1), attendu: { arret: 'borne', joues: 1, exit: 0, essai: 'sonnet-1' } },
  'identite-partielle': { tours: 2, delaiMs: 1500, deroule: ['gel'], flux: { apiKeySource: 'apikey' }, attendu: { arret: 'identite', joues: 0, exit: 4 } },
  // Quota
  'quota-080': { tours: 5, flux: { utilization: 0.8 }, deroule: change(5), attendu: { pause: 'quota', joues: 1, exit: 3, resetsAt: true } },
  'quota-079': { tours: 2, flux: { utilization: 0.79 }, deroule: change(2), attendu: { arret: 'borne', joues: 2, exit: 0 } },
  'quota-statut': { tours: 5, flux: { status: 'allowed_warning' }, deroule: change(5), attendu: { pause: 'statut', joues: 1, exit: 3 } },
  'quota-rejete': { tours: 5, flux: { status: 'rejected' }, deroule: ['sans-rien'], attendu: { pause: 'statut', joues: 0, exit: 3, rejetes: 0 } },
  // 3 tours sans mesure lisible
  'sans-mesure-3': { tours: 6, flux: { sansEvenement: true }, deroule: change(6), attendu: { pause: 'sans-mesure', joues: 3, exit: 3 } },
  'sans-mesure-2': { tours: 3, flux: (n) => (n <= 2 ? { sansEvenement: true } : {}), deroule: change(3), attendu: { arret: 'borne', joues: 3, exit: 0 } },
  'mesure-hors-bornes-3': { tours: 6, flux: { utilization: 23 }, deroule: change(6), attendu: { pause: 'sans-mesure', joues: 3, exit: 3 } },
  // Délai de 15 minutes, ramené à 1,5 seconde pour le banc : le processus est vraiment tué
  delai: { tours: 1, delaiMs: 1500, deroule: ['gel'], attendu: { statuts: ['rejetee'], motif: /^délai$/, sansSortie: 1, arret: 'borne' } },
  'dans-delai': { tours: 1, delaiMs: 60000, deroule: ['lent'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  // note.json
  'note-absente': { tours: 1, deroule: ['note-absente'], attendu: { statuts: ['rejetee'], motif: /note\.json absent/, arret: 'borne' } },
  'note-presente': { tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'note-invalide': { tours: 1, deroule: ['note-invalide'], attendu: { statuts: ['rejetee'], motif: /note\.json invalide/, arret: 'borne' } },
  'ajout-sans-retire': { tours: 1, deroule: ['ajout-sans-retire'], attendu: { statuts: ['rejetee'], motif: /un ajout dit ce qu'il retire/, arret: 'borne' } },
  // Reprise après coupure : le lanceur meurt en plein tour, le tour se rejoue sans compter de rejet
  coupure: { tours: 3, reprises: 1, deroule: ['change', 'coupure', 'change'], attendu: { arret: 'borne', joues: 3, rejetes: 0, coupures: 1, passages: { 1: 1, 2: 2, 3: 1 }, exitPremier: 'mort' } },
  // Coupure entre le contrôle et l'état : le tour est fini, il ne se rejoue pas
  'coupure-apres-controle': { tours: 2, reprises: 1, couperApresControle: 1, deroule: change(2), attendu: { arret: 'borne', joues: 2, rejetes: 0, coupures: 0, passages: { 1: 1, 2: 1 }, exitPremier: 137 } },
  // Capture : elle échoue, et le tour se joue sans elle ; elle réussit, et le modèle la lit
  'capture-echoue': { ext: 'html', tours: 1, capture: 'echec', deroule: ['change'], attendu: { statuts: ['gardee'], capture: false, arret: 'borne' } },
  'capture-reussit': { ext: 'html', tours: 1, capture: 'reelle', deroule: ['change'], attendu: { statuts: ['gardee'], capture: true, fichierDeTour: { 1: 'capture.png' }, arret: 'borne' } },
  // Un tour ordinaire et court, pour éprouver un document réel sans modèle : il ajoute 2 mots à sa plus longue forme
  normal: { tours: 1, deroule: ['court'], attendu: { statuts: ['gardee'], arret: 'borne', exit: 0 } },
};

// Par format : « rien » cohérent, « rien » incohérent, changement sans modification, changement réel.
const PAR_FORMAT = {};
for (const ext of ['md', 'html', 'docx', 'pptx', 'pdf']) {
  PAR_FORMAT[`rien-coherent-${ext}`] = { ext, tours: 1, deroule: ['rien'], attendu: { statuts: ['gardee'], types: ['rien'], arret: 'borne' } };
  PAR_FORMAT[`rien-incoherent-${ext}`] = { ext, tours: 1, deroule: ['rien-incoherent'], attendu: { statuts: ['rejetee'], motif: /incohérent : type « rien »/, arret: 'borne' } };
  PAR_FORMAT[`change-sans-modif-${ext}`] = { ext, tours: 1, deroule: ['change-sans-modif'], attendu: { statuts: ['rejetee'], motif: /incohérent : type « reformulation »/, arret: 'borne' } };
  PAR_FORMAT[`change-${ext}`] = { ext, tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], types: ['reformulation'], motsAjoutes: true, fichierDeTour: { 1: `document.${ext}` }, arret: 'borne' } };
  PAR_FORMAT[`fait-invente-${ext}`] = { ext, tours: 1, deroule: ['fait-invente'], attendu: { statuts: ['rejetee'], motif: /Zorglub/, arret: 'borne' } };
  PAR_FORMAT[`plafond-${ext}`] = { ext, tours: 1, plafondBrief: 40, deroule: ['change'], attendu: { statuts: ['rejetee'], motif: /plafond de mots/, arret: 'borne' } };
}

const WORD = {
  'paquet-refuse': { ext: 'docx', tours: 1, deroule: ['xml-casse'], attendu: { statuts: ['rejetee'], motif: /oracle-docx refuse/, arret: 'borne' } },
  'paquet-accepte': { ext: 'docx', tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], oracleDocx: 0, arret: 'borne' } },
  'paquet-sans-document': { ext: 'docx', tours: 1, deroule: ['xml-supprime'], attendu: { statuts: ['rejetee'], motif: /document\.xml absent/, arret: 'borne' } },
  'paquet-autre-partie': { ext: 'docx', tours: 1, deroule: ['autre-partie'], attendu: { statuts: ['rejetee'], motif: /autre chose que word\/document\.xml/, arret: 'borne' } },
};

const POWERPOINT = {
  // La version gardée : oracle-pptx en exit 0 malgré le JPEG et la transition de la fixture
  'pptx-gardee': { ext: 'pptx', tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], oraclePptx: 0, premiereEntree: true, seulesDiapos: true, arret: 'borne' } },
  // Une partie étrangère touchée, une par famille que la consigne laisse identique
  'pptx-masque-touche': { ext: 'pptx', tours: 1, deroule: ['pptx-masque'], attendu: { statuts: ['rejetee'], motif: /autre chose que le texte des diapositives : ppt\/slideMasters/, arret: 'borne' } },
  'pptx-disposition-touchee': { ext: 'pptx', tours: 1, deroule: ['pptx-disposition'], attendu: { statuts: ['rejetee'], motif: /ppt\/slideLayouts/, arret: 'borne' } },
  'pptx-notes-touchees': { ext: 'pptx', tours: 1, deroule: ['pptx-notes'], attendu: { statuts: ['rejetee'], motif: /ppt\/notesSlides/, arret: 'borne' } },
  'pptx-media-touche': { ext: 'pptx', tours: 1, deroule: ['pptx-media'], attendu: { statuts: ['rejetee'], motif: /ppt\/media/, arret: 'borne' } },
  'pptx-relations-touchees': { ext: 'pptx', tours: 1, deroule: ['pptx-relations'], attendu: { statuts: ['rejetee'], motif: /ppt\/slides\/_rels/, arret: 'borne' } },
  'pptx-diapo-ajoutee': { ext: 'pptx', tours: 1, deroule: ['pptx-diapo-neuve'], attendu: { statuts: ['rejetee'], motif: /slide11\.xml/, arret: 'borne' } },
  'pptx-diapo-retiree': { ext: 'pptx', tours: 1, deroule: ['pptx-diapo-supprimee'], attendu: { statuts: ['rejetee'], motif: /slide10\.xml/, arret: 'borne' } },
  'pptx-sans-diapo': { ext: 'pptx', tours: 1, deroule: ['pptx-aucune-diapo'], attendu: { statuts: ['rejetee'], motif: /slide<N>\.xml absent/, arret: 'borne' } },
  // Une balise cassée : oracle-pptx ne la voit pas sans LibreOffice, le lanceur si
  'pptx-balise-cassee': { ext: 'pptx', tours: 1, deroule: ['pptx-balise'], attendu: { statuts: ['rejetee'], motif: /XML mal formé : ppt\/slides\/slide2\.xml/, arret: 'borne' } },
  // Inchangée si et seulement si toutes les diapositives sont identiques octet par octet
  'pptx-inchangee': { ext: 'pptx', tours: 1, deroule: ['rien'], attendu: { statuts: ['gardee'], types: ['rien'], arret: 'borne' } },
  'pptx-un-octet': { ext: 'pptx', tours: 1, deroule: ['pptx-un-octet'], attendu: { statuts: ['gardee'], types: ['reformulation'], arret: 'borne' } },
  // Le seuil de la forme : un caractère au-delà de 10 % est rejeté, le plus grand gain entier en deçà passe
  'pptx-forme-gonflee': { ext: 'pptx', tours: 1, deroule: ['pptx-gain-trop'], attendu: { statuts: ['rejetee'], motif: /gagne \d+ caractères pour \d+ : plus de 10 %/, arret: 'borne' } },
  'pptx-forme-dix-pour-cent': { ext: 'pptx', tours: 1, deroule: ['pptx-gain-juste'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'pptx-forme-ajoutee': { ext: 'pptx', tours: 1, deroule: ['pptx-forme-neuve'], attendu: { statuts: ['rejetee'], motif: /forme ajoutée, retirée ou déplacée dans ppt\/slides\/slide2\.xml/, arret: 'borne' } },
  'pptx-forme-retiree': { ext: 'pptx', tours: 1, deroule: ['pptx-forme-supprimee'], attendu: { statuts: ['rejetee'], motif: /forme ajoutée, retirée ou déplacée/, arret: 'borne' } },
  // Masques, dispositions et notes : faits connus, jamais comptés au plafond
  'pptx-fait-du-masque': { ext: 'pptx', tours: 1, deroule: ['pptx-fait-masque'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'pptx-fait-de-la-disposition': { ext: 'pptx', tours: 1, deroule: ['pptx-fait-disposition'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'pptx-fait-des-notes': { ext: 'pptx', tours: 1, deroule: ['pptx-fait-notes'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'pptx-plafond-sur-le-corps': { ext: 'pptx', tours: 1, plafondBrief: 160, deroule: ['change'], attendu: { statuts: ['gardee'], arret: 'borne' } },
};

const PDF = {
  'modifs-invalide': { ext: 'pdf', tours: 1, deroule: ['modifs-invalide'], attendu: { statuts: ['rejetee'], motif: /modifs\.json invalide/, arret: 'borne' } },
  'modifs-casse': { ext: 'pdf', tours: 1, deroule: ['modifs-casse'], attendu: { statuts: ['rejetee'], motif: /modifs\.json invalide/, arret: 'borne' } },
  'modifs-paragraphe': { ext: 'pdf', tours: 1, deroule: ['modifs-paragraphe'], attendu: { statuts: ['rejetee'], motif: /nouveau paragraphe/, arret: 'borne' } },
  'modifs-valide': { ext: 'pdf', tours: 1, deroule: ['change'], attendu: { statuts: ['gardee'], arret: 'borne' } },
  'modifs-retrait': { ext: 'pdf', tours: 1, deroule: ['retrait'], attendu: { statuts: ['gardee'], types: ['retrait'], motsRetires: true, arret: 'borne' } },
  'modifs-identique': { ext: 'pdf', tours: 1, deroule: ['identique'], attendu: { statuts: ['gardee'], types: ['rien'], arret: 'borne' } },
  'ancien-introuvable': { ext: 'pdf', tours: 1, deroule: ['ancien-introuvable'], attendu: { statuts: ['rejetee'], motif: /ancien introuvable/, arret: 'borne' } },
  'texte-deborde': { ext: 'pdf', tours: 1, deroule: ['deborde'], attendu: { statuts: ['rejetee'], motif: /dépasse le bord de la page/, arret: 'borne' } },
  'pdf-modifie': { ext: 'pdf', tours: 1, deroule: ['pdf-modifie'], attendu: { statuts: ['rejetee'], motif: /document\.pdf a été modifié/, arret: 'borne' } },
  // D-124 : la voie (b) du porteur refuse le PDF, sans jouer un tour
  'pdf-voie-b': { ext: 'pdf', tours: 1, voieD124: 'b', attendu: { refus: /D-124/ } },
};

export const CAS = { ...CAS_DE_BASE, ...PAR_FORMAT, ...WORD, ...POWERPOINT, ...PDF };

// Les lignes de la fixture, pour écrire un modifs.json qui s'applique.
export const LIGNES_FIXTURE = [
  'La Coopérative du Val Fictif conserve ses archives dans la salle des Tilleuls depuis 2009.',
  'Camille Exemple pilote un atelier de tri prévu sur 3 samedis, avec 12 bénévoles.',
  'Le tri sépare les pièces à garder, les pièces à numériser et les pièces à détruire.',
  'Il est important de noter que chaque carton reçoit une étiquette avant de quitter la salle.',
  'Les pièces à détruire attendent la signature du bureau de la coopérative.',
  'Un inventaire de 240 cartons a été dressé au printemps, et il reste à vérifier sur place.',
  'À la fin de l\'atelier, la coopérative saura quels cartons quittent la salle des Tilleuls.',
];
