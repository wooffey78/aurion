-- Keep the user's explicit "not sure yet" choice on the journey record.
-- This only widens the allowed values; it does not rewrite existing organization data.
alter table onboarding_journeys
  drop constraint if exists onboarding_journeys_business_status_check;

alter table onboarding_journeys
  add constraint onboarding_journeys_business_status_check
  check (business_status is null or business_status in ('existing','to_create','unknown'));
