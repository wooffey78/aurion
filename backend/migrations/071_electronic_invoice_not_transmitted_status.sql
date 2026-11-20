alter table quotes drop constraint if exists quotes_electronic_status_check;
alter table quotes add constraint quotes_electronic_status_check
  check (electronic_status in ('prepared','ready','sent','accepted','rejected','prepared_not_transmitted'));
