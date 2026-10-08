import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ouvrir } from '../test/application.tsx';
import { erreur, jeton, simulerServeur } from '../test/serveur.ts';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SANS_SESSION = { 'POST /api/auth/refresh': erreur(401, 'SESSION_INVALID', 'Session expirée.') };
const EN_ATTENTE = (statut: string) => Response.json({ status: statut }, { status: 202 });

describe('Inscription', () => {
  it('envoie email et mot de passe, annonce le lien, puis le renvoie à la demande', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/register': EN_ATTENTE('confirmation_pending'),
      'POST /api/auth/register/resend': EN_ATTENTE('confirmation_pending'),
    });
    ouvrir('/register');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer le compte' }));

    const annonce = await screen.findByRole('status');
    expect(annonce.textContent).toContain('Lien de confirmation envoyé');
    expect(annonce.textContent).toContain('a@exemple.fr');
    expect(await serveur.appels('POST /api/auth/register')[0].json()).toEqual({
      email: 'a@exemple.fr',
      password: 'motdepasse-solide',
    });
    expect(screen.queryByRole('button', { name: 'Créer le compte' })).toBeNull();

    await utilisateur.click(screen.getByRole('button', { name: 'Renvoyer le lien' }));

    expect((await screen.findByText(/Nouveau lien envoyé/)).textContent).toContain('a@exemple.fr');
    expect(await serveur.appels('POST /api/auth/register/resend')[0].json()).toEqual({ email: 'a@exemple.fr' });
  });

  it('refus : message du serveur', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/register': erreur(409, 'EMAIL_ALREADY_USED', 'Cette adresse est déjà associée à un compte.'),
    });
    ouvrir('/register');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer le compte' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Inscription refusée');
    expect(alerte.textContent).toContain('Cette adresse est déjà associée à un compte.');
  });

  it('renvoi refusé : message du serveur, l’annonce reste', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/register': EN_ATTENTE('confirmation_pending'),
      'POST /api/auth/register/resend': erreur(429, 'RATE_LIMITED', 'Trop de demandes. Réessayez plus tard.'),
    });
    ouvrir('/register');
    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer le compte' }));

    await utilisateur.click(await screen.findByRole('button', { name: 'Renvoyer le lien' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Trop de demandes. Réessayez plus tard.');
    expect(screen.getByText('Lien de confirmation envoyé')).toBeTruthy();
  });

  it('l’aide rappelle la longueur du mot de passe', async () => {
    simulerServeur(SANS_SESSION);
    ouvrir('/register');

    expect((await screen.findByLabelText('Mot de passe')).getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Entre 8 et 72 caractères.')).toBeTruthy();
  });
});

describe('Mot de passe oublié', () => {
  it('message identique que l’adresse existe ou non (anti-énumération)', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/password/forgot': EN_ATTENTE('reset_pending'),
    });
    ouvrir('/password/forgot');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'a@exemple.fr');
    await utilisateur.click(screen.getByRole('button', { name: 'Recevoir un lien' }));

    const annonce = await screen.findByRole('status');
    expect(annonce.textContent).toContain('Si un compte existe pour cette adresse');
    expect(annonce.textContent).not.toContain('a@exemple.fr');
    expect(await serveur.appels('POST /api/auth/password/forgot')[0].json()).toEqual({ email: 'a@exemple.fr' });
  });

  it('refus : message du serveur', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/password/forgot': erreur(400, 'VALIDATION_FAILED', 'Adresse email invalide.'),
    });
    ouvrir('/password/forgot');

    await utilisateur.type(await screen.findByLabelText('Adresse email'), 'x');
    await utilisateur.click(screen.getByRole('button', { name: 'Recevoir un lien' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Demande refusée');
    expect(alerte.textContent).toContain('Adresse email invalide.');
  });
});

describe('Nouveau mot de passe', () => {
  it('enregistre le mot de passe, ferme la session locale, propose de se connecter', async () => {
    const utilisateur = userEvent.setup();
    const serveur = simulerServeur({
      'POST /api/auth/refresh': jeton('j1'),
      'POST /api/auth/password/reset': new Response(null, { status: 204 }),
    });
    ouvrir('/password/reset');

    await utilisateur.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));

    expect((await screen.findByRole('status')).textContent).toContain('Mot de passe changé');
    expect(await serveur.appels('POST /api/auth/password/reset')[0].json()).toEqual({ password: 'nouveau-solide' });

    // Toutes les sessions sont révoquées : le lien mène à la connexion, pas à la cave.
    await utilisateur.click(screen.getByRole('link', { name: 'Se connecter' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('lien expiré ou déjà utilisé : le dit et propose une nouvelle demande', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/password/reset': erreur(400, 'RESET_TOKEN_INVALID', 'Lien de réinitialisation invalide ou expiré.'),
    });
    ouvrir('/password/reset');

    await utilisateur.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau-solide');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('Lien de réinitialisation invalide ou expiré.');
    await utilisateur.click(screen.getByRole('link', { name: 'Refaire une demande' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Mot de passe oublié' })).toBeTruthy();
  });

  it('mot de passe refusé : message du serveur, sans lien de nouvelle demande', async () => {
    const utilisateur = userEvent.setup();
    simulerServeur({
      ...SANS_SESSION,
      'POST /api/auth/password/reset': erreur(400, 'VALIDATION_FAILED', 'Mot de passe trop court.'),
    });
    ouvrir('/password/reset');

    await utilisateur.type(await screen.findByLabelText('Nouveau mot de passe'), 'court');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Mot de passe trop court.');
    expect(screen.queryByRole('link', { name: 'Refaire une demande' })).toBeNull();
  });
});

describe('Page de retour du callback', () => {
  it.each([
    ['user_registration', 'confirmed', 'Adresse confirmée', 'Se connecter'],
    ['user_registration', 'already_confirmed', 'Adresse confirmée', 'Se connecter'],
    ['user_registration', 'expired', 'Lien expiré', 'Recommencer l’inscription'],
    ['password_reset', 'already_confirmed', 'Lien déjà utilisé', 'Refaire une demande'],
    ['password_reset', 'expired', 'Lien expiré', 'Refaire une demande'],
    ['email_change', 'confirmed', 'Nouvelle adresse confirmée', 'Revenir à la cave'],
    ['email_change', 'already_confirmed', 'Nouvelle adresse confirmée', 'Revenir à la cave'],
    ['email_change', 'expired', 'Lien expiré', 'Ouvrir les réglages'],
    ['email_change', 'email_taken', 'Adresse déjà utilisée', 'Ouvrir les réglages'],
    ['unknown', '', 'Lien non reconnu', 'Revenir à la cave'],
    ['password_reset', 'inattendu', 'Lien non reconnu', 'Revenir à la cave'],
  ])('%s / %s : « %s », lien « %s »', async (type, statut, titre, lien) => {
    simulerServeur(SANS_SESSION);

    ouvrir(`/auth/return?type=${type}&status=${statut}`);

    expect((await screen.findByText(titre)).closest('.ivt-banner')).not.toBeNull();
    expect(screen.getByRole('link', { name: lien })).toBeTruthy();
  });

  it('password_reset / confirmed : ouvre directement la saisie du nouveau mot de passe', async () => {
    simulerServeur(SANS_SESSION);

    ouvrir('/auth/return?type=password_reset&status=confirmed');

    expect(await screen.findByRole('heading', { level: 1, name: 'Nouveau mot de passe' })).toBeTruthy();
  });

  it('accessible avec une session ouverte (changement d’email)', async () => {
    simulerServeur({ 'POST /api/auth/refresh': jeton('j1') });

    ouvrir('/auth/return?type=email_change&status=confirmed');

    expect(await screen.findByText('Nouvelle adresse confirmée')).toBeTruthy();
  });
});
