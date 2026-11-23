-- 102 — Bloc 19 (prompt général §10) : réplication offline des nouveaux blocs.
-- Les entités créées par les blocs 10/13/15 sont consultables hors connexion et leurs
-- modifications locales rejouées via /sync/ops : même contrat métier sur web/PWA/natif.
-- Les réceptions d'achats et les runs de workflows restent volontairement SERVEUR :
-- ce sont des confirmations exécutées côté backend (mouvements de stock, actions
-- déterministes), jamais des états éditables localement.

do $$
declare
  t text;
  direct_tables text[] := array[
    'stock_movements','part_reservations','purchase_orders','purchase_order_lines','tasks','accountant_requests'
  ];
begin
  foreach t in array direct_tables loop
    execute format('drop trigger if exists aurion_sync_journal_trigger on public.%I', t);
    execute format('create trigger aurion_sync_journal_trigger after insert or update or delete on public.%I for each row execute function aurion_sync_journal_write()', t);
  end loop;
end
$$;
