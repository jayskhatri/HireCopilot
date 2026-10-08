CREATE OR REPLACE FUNCTION public.is_valid_candidate_resume_url(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  authority text;
  host text;
  dns_name text;
  label text;
  port_text text;
  parsed_ip inet;
BEGIN
  IF p_url ~ '[[:space:]]' OR p_url !~* '^https://' THEN
    RETURN false;
  END IF;

  IF p_url !~* '^https://[^/?#]+([/?#][^[:space:]]*)?$' THEN
    RETURN false;
  END IF;

  authority := substring(lower(p_url) FROM '^https://([^/?#]+)');
  IF authority IS NULL OR authority = '' OR position('@' IN authority) > 0 THEN
    RETURN false;
  END IF;

  IF authority ~ '^\[[0-9a-f:.]+\](:[0-9]+)?$' THEN
    host := substring(authority FROM '^\[([0-9a-f:.]+)\]');
    port_text := substring(authority FROM '^\[[0-9a-f:.]+\]:([0-9]+)$');

    IF port_text IS NOT NULL AND (length(port_text) > 5 OR port_text::integer > 65535) THEN
      RETURN false;
    END IF;

    BEGIN
      parsed_ip := host::inet;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN false;
    END;
    RETURN family(parsed_ip) = 6;
  END IF;

  IF position('[' IN authority) > 0 OR position(']' IN authority) > 0 THEN
    RETURN false;
  END IF;

  IF authority ~ ':[0-9]+$' THEN
    host := substring(authority FROM '^([^:]+):[0-9]+$');
    port_text := substring(authority FROM ':([0-9]+)$');
    IF host IS NULL OR length(port_text) > 5 OR port_text::integer > 65535 THEN
      RETURN false;
    END IF;
  ELSE
    IF position(':' IN authority) > 0 THEN
      RETURN false;
    END IF;
    host := authority;
  END IF;

  IF host ~ '^[0-9.]+$' THEN
    IF host !~ '^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$' THEN
      RETURN false;
    END IF;
    FOREACH label IN ARRAY string_to_array(host, '.') LOOP
      IF label::integer > 255 THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  dns_name := CASE
    WHEN right(host, 1) = '.' THEN left(host, length(host) - 1)
    ELSE host
  END;
  IF dns_name = '' OR length(dns_name) > 253 THEN
    RETURN false;
  END IF;

  FOREACH label IN ARRAY string_to_array(dns_name, '.') LOOP
    IF length(label) > 63 OR label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

DO $migration$
DECLARE
  invalid_count bigint;
  example_ids text;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM public.candidates
  WHERE resume_url IS NOT NULL
    AND NOT public.is_valid_candidate_resume_url(resume_url);

  IF invalid_count > 0 THEN
    SELECT string_agg(candidate_id, ', ' ORDER BY candidate_id)
    INTO example_ids
    FROM (
      SELECT id::text AS candidate_id
      FROM public.candidates
      WHERE resume_url IS NOT NULL
        AND NOT public.is_valid_candidate_resume_url(resume_url)
      ORDER BY id::text
      LIMIT 10
    ) AS invalid_candidates;

    RAISE EXCEPTION
      'Cannot enforce candidate resume URL validation: % existing row(s) have invalid HTTPS URLs; sample candidate IDs: %. No candidate data was modified.',
      invalid_count,
      example_ids
      USING HINT = 'Review and correct these resume_url values explicitly, then re-run this migration.';
  END IF;
END;
$migration$;

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_resume_url_https,
  ADD CONSTRAINT candidates_resume_url_https
    CHECK (
      resume_url IS NULL
      OR public.is_valid_candidate_resume_url(resume_url)
    );
