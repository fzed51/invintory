export type ReponseSante = { status: string };

/** Appelle GET /api/health ; en cas d'échec, lève une Error dont le message est affichable. */
export async function verifierSante(): Promise<ReponseSante> {
  const reponse = await fetch('/api/health');
  const corps: unknown = await reponse.json().catch(() => null);

  if (!reponse.ok) {
    const message = (corps as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Réponse inattendue (code ${reponse.status}).`);
  }
  return corps as ReponseSante;
}
