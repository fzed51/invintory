// IndexedDB en mémoire pour jsdom (Dexie, file de mutations hors ligne).
import 'fake-indexeddb/auto';

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
