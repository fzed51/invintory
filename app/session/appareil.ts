// Nom de l'appareil envoyé à la connexion (`device`, P35) : sert à reconnaître l'appareil
// dans la liste des appareils connectés (Réglages, étape 8). Déduit du User-Agent ; l'ordre
// compte, car Edge, Opera et Samsung Internet se déclarent aussi Chrome et Safari.

const NAVIGATEURS: [RegExp, string][] = [
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/.*Safari\//, 'Safari'],
];

// iPhone et iPad avant macOS : leur User-Agent contient « like Mac OS X ».
const SYSTEMES: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const reconnu = (userAgent: string, table: [RegExp, string][]) => table.find(([motif]) => motif.test(userAgent))?.[1];

/** « Navigateur sur système », la seule partie reconnue, ou null si rien ne l'est. */
export function nomAppareil(userAgent: string): string | null {
  const navigateur = reconnu(userAgent, NAVIGATEURS);
  const systeme = reconnu(userAgent, SYSTEMES);
  if (navigateur && systeme) return `${navigateur} sur ${systeme}`;
  return navigateur ?? systeme ?? null;
}
