// IndexedDB en mémoire pour jsdom (Dexie, file de mutations hors ligne).
import 'fake-indexeddb/auto';
import { Blob as BlobNode } from 'node:buffer';

// Le Blob de jsdom ne survit pas au clonage de fake-indexeddb (relu en objet vide) : celui de
// Node, oui (photos stockées en Blob).
globalThis.Blob = BlobNode;

// jsdom n'implémente pas l'ouverture modale de <dialog> : simulation minimale (Sheet).
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
