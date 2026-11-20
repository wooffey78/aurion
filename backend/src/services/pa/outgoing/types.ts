// Bloc 4 — interface d'adaptateur PA pour l'ÉMISSION des factures électroniques.
//
// Miroir du socle de réception (bloc 3) : chaque fournisseur PA se branche derrière
// `PaOutgoingAdapter` sans toucher au reste de l'application. L'adaptateur ne fait QUE le
// transport : signature du flux sortant, lecture de l'accusé signé, traduction en résultat
// typé. Idempotence, archivage, journal et états relèvent du service (electronic-outgoing.ts).
//
// État de la connexion (15.4.3) : AUCUNE PA réelle n'est connectée. L'adaptateur « generic »
// implémente le contrat sortant documenté dans docs/PLATEFORME-AGREEE.md (§ 8) et sert de
// référence pour les tests de contrat. La transmission n'est PAS déclarée opérationnelle en
// production tant qu'aucune PA contractuelle n'a été validée en sandbox ; l'UI de transmission
// accompagnera cette connexion (blocs 4/5), comme en réception.

/** Document structuré prêt pour la transmission (déjà archivé côté service). */
export type PaOutgoingTransmission = {
  /** Identifiant d'idempotence (X-Aurion-PA-Transmission-Id), stable entre re-tentatives. */
  transmissionId: string;
  /** Format transmis : UBL 2.1 (Invoice), CII D16B (profil Factur-X BASIC) — bloc 4 — ou
   *  flux e-reporting « ereporting » (données de transaction et de paiement, bloc 5). */
  format: 'ubl' | 'cii' | 'ereporting';
  /** Nom de fichier transmis (ex. FA-2026-0142-ubl.xml). */
  filename: string;
  /** Octets XML UTF-8 du document structuré. */
  bytes: Buffer;
};

/** Point d'entrée d'émission résolu pour l'organisation (secret déchiffré en mémoire, jamais journalisé). */
export type PaOutgoingEndpoint = {
  baseUrl: string;
  secret: string;
  identifier: string | null;
};

/** Résultat normalisé d'une tentative de transmission. */
export type PaOutgoingResult =
  | {
      kind: 'accepted';
      /** Référence PA renvoyée dans l'accusé (tracée, non secrète). */
      paReference: string | null;
      /** Corps brut de l'accusé (archivé sans altération par le service). */
      raw: Buffer;
      rawContentType: string;
    }
  | {
      kind: 'rejected';
      code: string;
      message: string | null;
      raw: Buffer;
      rawContentType: string;
    }
  | { kind: 'transport_error'; message: string; timedOut: boolean }
  | { kind: 'invalid_ack'; message: string; raw: Buffer | null; rawContentType: string | null };

/**
 * Interface stable d'adaptateur d'émission : un fournisseur PA réel = un fichier d'adaptateur
 * + une entrée au registre (pa/index.ts). Aucun endpoint ni identifiant de PA réelle codé en dur.
 */
export interface PaOutgoingAdapter {
  /** Identifiant du fournisseur (ex. « generic ») — valeur de AURION_PA_PROVIDER. */
  readonly provider: string;
  /**
   * Transmet un document structuré au point d'entrée d'émission configuré et retourne le
   * résultat normalisé. Ne touche JAMAIS à la persistance : le service décide des états.
   */
  transmit(endpoint: PaOutgoingEndpoint, transmission: PaOutgoingTransmission, timeoutMs: number): Promise<PaOutgoingResult>;
}
