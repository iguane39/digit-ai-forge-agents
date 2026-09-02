// Jeu d'essai — grille tarifaire d'un hébergement (données INVENTÉES).
// Sert la règle N5 : le document qui DÉCLARE cette source y trouve de quoi CALCULER la valeur
// d'un séjour au lieu de la supposer. La grille rend la valeur d'une nuit calculable.
export const grilleTarifaire = {
  nuitBasseSaison: 55,          // € par nuit
  nuitHauteSaison: 85,          // € par nuit
  nuitsParSejourMoyen: 2,       // nuits par séjour, mesuré sur l'historique
};
export const marches = [
  { nom: 'Nord', sejours: 120 },
  { nom: 'Sud', sejours: 90 },
  { nom: 'Est', sejours: 60 },
];
