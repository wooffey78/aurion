-- Bloc 15 — Reconnaissance et recherche des accents : fonction SQL déterministe et IMMUTABLE
-- (normalisation Unicode NFC native de PostgreSQL, puis translation des caractères accentués,
-- cédilles, ligatures ; apostrophe typographique U+2019 -> U+0027 ; plus casse).
-- Les VALEURS ORIGINALES sont conservées telles quelles (aucune réécriture de données) :
-- seule la COMPARAISON de recherche est insensible aux accents et à la décomposition Unicode.
-- Correspondance 1:1 (59 caractères sources -> 59 cibles).
create or replace function aurion_unaccent(input text) returns text
  language sql immutable parallel safe as $$
  select lower(translate(
    normalize(translate(normalize(input, NFC), chr(8217), chr(39)), NFC),
    'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÌÍÎÏìíîïÙÚÛÜùúûüÝýÿÑñÇçŒœÆæ',
    'aaaaaaaaaaaaooooooooooooeeeeeeeeiiiiiiiiuuuuuuuuyyyynncCOOA'
  ))
$$;
