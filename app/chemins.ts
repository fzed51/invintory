/** Adresses des écrans de la PWA, en anglais comme les chemins d'API (P27). */
export const CHEMINS = {
  cave: '/',
  repas: '/meals',
  ajouter: '/add',
  manques: '/shortages',
  reglages: '/settings',
  connexion: '/login',
  inscription: '/register',
  oubli: '/password/forgot',
  nouveauMotDePasse: '/password/reset',
  /** Page de retour du callback d'auth-service (contrat §3). */
  retour: '/auth/return',
  nouvelleArmoire: '/cabinets/new',
  armoire: '/cabinets/:id',
  etagere: '/shelves/:id',
  nouveauCarton: '/boxes/new',
  carton: '/boxes/:id',
  bouteille: '/bottles/:id',
  modifierBouteille: '/bottles/:id/edit',
} as const;

export const cheminArmoire = (id: number) => `/cabinets/${id}`;
export const cheminEtagere = (id: number) => `/shelves/${id}`;
export const cheminCarton = (id: number) => `/boxes/${id}`;
export const cheminBouteille = (id: number) => `/bottles/${id}`;
