import type { FastifyInstance } from "fastify";

/**
 * Digital Asset Links — vérifie que l'application Android `com.easyfixit.aurion`
 * est autorisée à ouvrir l'origine Aurion en Trusted Web Activity (plein écran,
 * sans barre d'adresse). Google Play et Chrome lisent ce fichier à la racine du
 * domaine lors de l'installation et à chaque mise à jour.
 *
 * Les empreintes SHA-256 sont des données publiques (elles sont publiées ici).
 * Les fichiers de clé correspondants ne sont jamais dans le dépôt.
 *
 * - L'empreinte de la clé d'envoi locale sert aux tests sur appareil et à la
 *   signature de l'App Bundle déposé sur Play Console.
 * - Play App Signing resigne l'application avec la clé de signature Play : son
 *   empreinte, affichée dans Play Console (Intégrité de l'application), doit être
 *   ajoutée via AURION_ANDROID_SHA256_FINGERPRINTS sans redéployer de code.
 */
const PACKAGE_NAME = process.env.AURION_ANDROID_PACKAGE_NAME?.trim() || "com.easyfixit.aurion";
const DEFAULT_FINGERPRINTS = [
  "75:FF:0E:2B:B2:AD:A9:89:C3:EF:1F:2A:64:FE:2D:A0:34:5C:58:AA:AF:DF:F9:21:94:71:C0:CD:47:79:E4:43",
];
const CONFIGURED_FINGERPRINTS = (process.env.AURION_ANDROID_SHA256_FINGERPRINTS ?? "")
  .split(/[,\s]+/)
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

const FINGERPRINTS = [...new Set([...DEFAULT_FINGERPRINTS, ...CONFIGURED_FINGERPRINTS])];

export async function androidAssetLinksRoutes(app: FastifyInstance) {
  app.get("/.well-known/assetlinks.json", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    reply.type("application/json");
    return [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: FINGERPRINTS,
        },
      },
    ];
  });
}
