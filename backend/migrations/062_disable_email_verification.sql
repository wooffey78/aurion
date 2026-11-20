-- Rollback of the temporarily enabled e-mail verification flow in Aurion 15.2.50.
-- Migration 061 is already recorded in production and must never be edited.
-- This new migration removes only the temporary verification schema.
drop table if exists email_verification_tokens;
alter table users drop column if exists email_verified_at;
