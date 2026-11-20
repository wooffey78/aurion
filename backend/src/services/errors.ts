/** Erreur "métier" : renvoyée telle quelle au frontend ({error, message}). */
export class AurionError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) {
    super(message);
  }
}
