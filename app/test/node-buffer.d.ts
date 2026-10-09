// Seul usage de Node côté tests front (setup.ts) : sans charger @types/node dans l'application.
declare module 'node:buffer' {
  export const Blob: typeof globalThis.Blob;
}
