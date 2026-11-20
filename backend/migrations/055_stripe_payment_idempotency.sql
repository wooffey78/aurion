-- Refuse une activation idempotente si des sessions réutilisées existent déjà : une résolution métier est requise.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM billing_payment_requests
    WHERE provider_session_id IS NOT NULL
    GROUP BY provider_session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider_session_id values exist; resolve them before enabling Stripe idempotency.';
  END IF;
END $$;

-- Les virements n'ont pas de provider_session_id, d'où l'index partiel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_payment_requests_provider_session
  ON billing_payment_requests(provider_session_id)
  WHERE provider_session_id IS NOT NULL;

-- billing_webhook_events possède déjà UNIQUE(provider,event_id), défini en migration 009.
