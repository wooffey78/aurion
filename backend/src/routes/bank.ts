// Bloc 25 — Rapprochement bancaire (optionnel, décision D5 : défaut = IMPORT DE FICHIERS).
// AUCUN agrégateur bancaire, AUCUN ordre de paiement sortant : l'entrepreneur importe ses
// relevés CSV/OFX, les doublons sont détectés (réimport sans duplication), les suggestions
// sont proposées par montant/date/libellé, chaque rapprochement est VALIDÉ par l'utilisateur
// et ANNULABLE, les écarts sont LISTÉS (paiement sans relevé, relevé sans paiement) et
// jamais résolus silencieusement.
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parseOfx, parseCsvStatement, fingerprint, suggestMatches, detectColumnMapping, type PaymentCandidate, type ParsedStatementRow } from "../services/bank-reconciliation.js";

export async function bankRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // Import d'un relevé (multipart) : CSV (mapping auto + sauvegarde par nom) ou OFX.
  app.post("/bank/import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "FILE_MISSING", message: "Fournissez un relevé CSV ou OFX." });
    if (part.file.bytesRead > 10 * 1024 * 1024) return reply.code(413).send({ error: "FILE_TOO_LARGE" });
    const fields: Record<string, string> = {};
    let buffer: Buffer | null = null;
    const chunks: Buffer[] = [];
    for await (const c of part.file) chunks.push(c as Buffer);
    buffer = Buffer.concat(chunks);
    // Champs texte après le fichier (light-my-request lit tout le multipart) :
    const raw = (request as any).rawBody;
    const text = buffer.toString("utf8");
    const org = request.auth!.organizationId;
    let rows: ParsedStatementRow[] = [];
    let mapping: Record<string, number> | null = null;
    const isOfx = /<STMTTRN>/i.test(text) || part.filename.toLowerCase().endsWith(".ofx");
    if (isOfx) {
      rows = parseOfx(text);
      if (!rows.length) return reply.code(422).send({ error: "PARSE_FAILED", message: "Aucune opération OFX exploitable (blocs STMTTRN) dans ce relevé." });
    } else {
      // Mapping existant éventuellement fourni (nom de configuration sauvegardé).
      let savedMapping: Record<string, number> | null = null;
      const configName = String((request.query as any)?.config || "");
      if (configName) {
        const saved = (await query("select column_mapping from bank_import_configs where organization_id=$1 and name=$2", [org, configName])).rows[0];
        if (saved) savedMapping = saved.column_mapping as Record<string, number>;
      }
      const parsed = parseCsvStatement(text, savedMapping);
      mapping = parsed.mapping;
      rows = parsed.rows;
      if (!mapping) return reply.code(422).send({ error: "MAPPING_UNDETECTED", message: "Colonnes non reconnues : indiquez le mapping (date, montant, libellé, référence) puis réimportez, ou utilisez un en-tête standard (Date ; Montant ; Libellé ; Référence)." });
      if (!rows.length) return reply.code(422).send({ error: "PARSE_FAILED", message: "Aucune ligne exploitable (date et montant requis)." });
      if (configName) {
        await query(`insert into bank_import_configs(organization_id,name,column_mapping) values($1,$2,$3::jsonb)
          on conflict (organization_id,name) do update set column_mapping=$3::jsonb`, [org, configName, JSON.stringify(mapping)]);
      }
    }
    // Dédoublonnage par empreinte : un réimport identique n'écrit RIEN de plus.
    let inserted = 0, duplicates = 0;
    for (const row of rows) {
      const fp = fingerprint(row);
      const res = await query(
        `insert into bank_transactions(organization_id,value_date,amount,label,external_ref,fingerprint,source_file)
         values($1,$2,$3,$4,$5,$6,$7) on conflict (organization_id,fingerprint) do nothing returning id`,
        [org, row.valueDate, row.amount, row.label || "", row.externalRef || "", fp, String(part.filename || "").slice(0, 240)],
      );
      if (res.rowCount) inserted++; else duplicates++;
    }
    return reply.code(201).send({ inserted, duplicates, total: rows.length, format: isOfx ? "ofx" : "csv", mapping, note: "Aucun paiement n'est créé par l'import : les opérations attendent votre rapprochement." });
  });

  app.get("/bank/transactions", async r => {
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select t.id,t.value_date as "valueDate",t.amount,t.label,t.external_ref as "externalRef",t.status,t.source_file as "sourceFile",
              t.matched_payment_id as "matchedPaymentId",t.matched_at as "matchedAt",
              (select q.number from quotes q where q.id=(select p.quote_id from invoice_payments p where p.id=t.matched_payment_id)) as "matchedInvoiceNumber"
       from bank_transactions t where t.organization_id=$1 order by t.value_date desc, t.created_at desc limit 500`,
      [org],
    )).rows;
    // Suggestions pour chaque opération non rapprochée (montant/date/libellé), jamais appliquées.
    const payments = (await query(
      `select p.id,p.amount,p.paid_at,q.number invoice_number,c.name client_name,p.reference
       from invoice_payments p join quotes q on q.id=p.quote_id left join clients c on c.id=q.client_id
       where p.organization_id=$1 order by p.paid_at desc limit 1000`,
      [org],
    )).rows.map(p => ({ id: String(p.id), amount: Number(p.amount), paidAt: String(p.paid_at).slice(0, 10), invoiceNumber: String(p.invoice_number || ""), clientName: String(p.client_name || ""), reference: String(p.reference || "") }));
    return rows.map(t => {
      const suggestions = t.status === "unmatched"
        ? suggestMatches({ valueDate: t.valueDate, amount: Number(t.amount), label: t.label, externalRef: t.externalRef }, payments as PaymentCandidate[])
        : [];
      return { ...t, suggestions };
    });
  });

  // Rapprochement VALIDÉ par l'utilisateur : la transaction est liée à un règlement existant.
  app.post("/bank/transactions/:id/match", async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const paymentId = String((r.body as any)?.paymentId || "");
    const t = (await query("select id,amount,status from bank_transactions where id=$1 and organization_id=$2", [id, org])).rows[0];
    if (!t) return reply.code(404).send({ error: "NOT_FOUND" });
    if (t.status === "matched") return reply.code(409).send({ error: "ALREADY_MATCHED", message: "Cette opération est déjà rapprochée : annulez le rapprochement avant de la modifier." });
    const p = (await query("select id,amount from invoice_payments where id=$1 and organization_id=$2", [paymentId, org])).rows[0];
    if (!p) return reply.code(400).send({ error: "INVALID_PAYMENT", message: "Le règlement choisi n'existe pas dans votre organisation." });
    const used = (await query("select id from bank_transactions where matched_payment_id=$1 and organization_id=$2 and id<>$3", [paymentId, org, id])).rowCount;
    if (used) return reply.code(409).send({ error: "PAYMENT_ALREADY_RECONCILED", message: "Ce règlement est déjà rapproché avec une autre opération bancaire." });
    await query("update bank_transactions set status='matched',matched_payment_id=$2,matched_at=now() where id=$1", [id, paymentId]);
    return { ok: true, note: "Rapprochement enregistré (annulable). Aucune écriture comptable automatique n'a été modifiée." };
  });

  // Annulation du rapprochement : jamais d'effet irréversible.
  app.post("/bank/transactions/:id/unmatch", async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const x = await query("update bank_transactions set status='unmatched',matched_payment_id=null,matched_at=null where id=$1 and organization_id=$2 and status='matched' returning id", [id, org]);
    if (!x.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Aucun rapprochement à annuler." });
    return { ok: true };
  });

  // Ignorer une opération (aucune écriture cachée : le statut reste consultable).
  app.post("/bank/transactions/:id/ignore", async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const x = await query("update bank_transactions set status='ignored' where id=$1 and organization_id=$2 and status='unmatched' returning id", [id, org]);
    if (!x.rowCount) return reply.code(404).send({ error: "NOT_FOUND", message: "Seule une opération non rapprochée peut être ignorée." });
    return { ok: true };
  });

  // Écarts : règlements sans opération bancaire importée, et opérations bancaires sans règlement.
  app.get("/bank/gaps", async r => {
    const org = r.auth!.organizationId;
    const paymentsWithoutStatement = (await query(
      `select p.id,p.amount,p.paid_at,q.number invoice_number,c.name client_name from invoice_payments p
       join quotes q on q.id=p.quote_id left join clients c on c.id=q.client_id
       where p.organization_id=$1 and not exists (select 1 from bank_transactions t where t.matched_payment_id=p.id)
       order by p.paid_at desc limit 200`,
      [org],
    )).rows;
    const unmatched = (await query("select count(*)::int n, coalesce(sum(amount),0)::numeric total from bank_transactions where organization_id=$1 and status='unmatched'", [org])).rows[0];
    return {
      paymentsWithoutStatement,
      unmatchedTransactions: { count: Number(unmatched.n), total: Number(unmatched.total) },
      note: "Les écarts sont listés pour information : jamais résolus silencieusement. Rapprochez ou ignorez chaque opération vous-même.",
    };
  });
}
