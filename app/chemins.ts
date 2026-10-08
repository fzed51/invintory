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
} as const;
