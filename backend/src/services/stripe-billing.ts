import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

export type StripeCheckoutSession = {
  id: string;
  mode?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

export type CheckoutActivationResult =
  | { status: 'activated'; organizationId: string; planCode: string }
  | { status: 'already_processed'; organizationId: string; planCode: string }
  | { status: 'not_paid' }
  | { status: 'unmatched' }
  | { status: 'invalid' };

/** Valide la signature Stripe sur les octets exacts reçus, avec fenêtre anti-rejeu. */
export function verifyStripeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  const fields = signatureHeader.split(',').map(part => part.trim().split('=', 2));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value || '');
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

function addBillingPeriod(start: Date, interval: 'month' | 'year'): Date {
  const end = new Date(start);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  if (interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const finalDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(originalDay, finalDay));
  return end;
}

/**
 * Active une session de paiement vérifiée, au sein de la transaction appelante.
 * Le statut pending -> paid est le verrou d'idempotence : un retour navigateur et
 * un webhook Stripe concurrents ne peuvent activer la même session qu'une fois.
 */
export async function activateStripeCheckout(
  client: PoolClient,
  session: StripeCheckoutSession,
  expectedOrganizationId?: string,
): Promise<CheckoutActivationResult> {
  if (!session?.id || session.mode !== 'payment') return { status: 'invalid' };
  if (session.payment_status !== 'paid') return { status: 'not_paid' };

  const paymentResult = expectedOrganizationId
    ? await client.query(
      `select id,organization_id,plan_code,reference,amount_ttc_cents,status
         from billing_payment_requests
        where provider_session_id=$1 and organization_id=$2 and method='card'
        for update`,
      [session.id, expectedOrganizationId],
    )
    : await client.query(
      `select id,organization_id,plan_code,reference,amount_ttc_cents,status
         from billing_payment_requests
        where provider_session_id=$1 and method='card'
        for update`,
      [session.id],
    );
  const payment = paymentResult.rows[0];
  if (!payment) return { status: 'unmatched' };

  const metadata = session.metadata || {};
  if (metadata.organization_id !== payment.organization_id
      || metadata.plan_code !== payment.plan_code
      || metadata.reference !== payment.reference) return { status: 'invalid' };
  if (!Number.isSafeInteger(session.amount_total)
      || session.amount_total !== Number(payment.amount_ttc_cents)
      || String(session.currency || '').toLowerCase() !== 'eur') return { status: 'invalid' };

  if (payment.status === 'paid') {
    return { status: 'already_processed', organizationId: payment.organization_id, planCode: payment.plan_code };
  }
  if (payment.status !== 'pending') return { status: 'invalid' };

  const plan = (await client.query(
    `select code,billing_interval from plans where code=$1 and active=true`,
    [payment.plan_code],
  )).rows[0];
  if (!plan || !['month', 'year'].includes(String(plan.billing_interval))) return { status: 'invalid' };

  const subscription = (await client.query(
    `select status,current_period_end from subscriptions where organization_id=$1 for update`,
    [payment.organization_id],
  )).rows[0];
  if (!subscription) throw new Error('BILLING_SUBSCRIPTION_MISSING');

  const now = new Date();
  const currentEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const start = subscription.status === 'active' && currentEnd && currentEnd > now ? currentEnd : now;
  const end = addBillingPeriod(start, plan.billing_interval);

  const claimed = await client.query(
    `update billing_payment_requests
        set status='paid',paid_at=coalesce(paid_at,now())
      where id=$1 and status='pending'
      returning id`,
    [payment.id],
  );
  if (claimed.rowCount !== 1) {
    return { status: 'already_processed', organizationId: payment.organization_id, planCode: payment.plan_code };
  }

  const updated = await client.query(
    `update subscriptions
        set status='active',plan_code=$2,current_period_start=$3::timestamptz,current_period_end=$4::timestamptz,
            cancel_at_period_end=false,canceled_at=null,
            data_read_only_until=$4::timestamptz+interval '60 days',payment_method='card',
            billing_reference=$5,updated_at=now()
      where organization_id=$1`,
    [payment.organization_id, payment.plan_code, start, end, payment.reference],
  );
  if (updated.rowCount !== 1) throw new Error('BILLING_SUBSCRIPTION_UPDATE_FAILED');

  await client.query(
    `insert into subscription_events(organization_id,kind,detail)
     values($1,'payment_succeeded',$2::jsonb)`,
    [payment.organization_id, JSON.stringify({
      method: 'card', planCode: payment.plan_code, reference: payment.reference,
      amountTtcCents: Number(payment.amount_ttc_cents), providerSessionId: session.id,
    })],
  );
  return { status: 'activated', organizationId: payment.organization_id, planCode: payment.plan_code };
}
