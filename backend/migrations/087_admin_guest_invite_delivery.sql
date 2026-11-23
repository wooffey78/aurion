-- Aurion 15.4.33+ : suivi de livraison des invitations gratuites/VIP.
-- Migration additive : les invitations déjà enregistrées restent utilisables.
alter table admin_guest_invites add column if not exists email_sent_at timestamptz;
alter table admin_guest_invites add column if not exists email_error_code varchar(80);
