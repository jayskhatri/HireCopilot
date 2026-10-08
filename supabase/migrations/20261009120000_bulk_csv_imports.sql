DO $$
DECLARE
  collisions text;
BEGIN
  SELECT string_agg(email_group, '; ')
  INTO collisions
  FROM (
    SELECT format('%s (%s rows)', min(email), count(*)) AS email_group
    FROM public.candidates
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
    ORDER BY lower(btrim(min(email)))
    LIMIT 10
  ) duplicate_emails;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add normalized candidate email uniqueness; resolve existing collisions first: %', collisions;
  END IF;
END;
$$;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD CONSTRAINT candidates_resume_url_https
    CHECK (resume_url IS NULL OR resume_url ~* '^https://[^[:space:]]+$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_email_normalized
  ON public.candidates (lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.import_candidates(import_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  row_number bigint;
  inserted_count integer := 0;
  normalized_email text;
  normalized_stage text;
  normalized_experience numeric;
  matched_job public.jobs%ROWTYPE;
  inserted_candidate public.candidates%ROWTYPE;
  duplicate_email text;
BEGIN
  IF jsonb_typeof(import_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import must be a JSON array of candidates';
  END IF;
  IF jsonb_array_length(import_rows) = 0 THEN
    RAISE EXCEPTION 'Import must contain at least one candidate row';
  END IF;
  IF jsonb_array_length(import_rows) > 100 THEN
    RAISE EXCEPTION 'Candidate import exceeds the 100 row maximum';
  END IF;

  SELECT lower(btrim(value->>'email'))
  INTO duplicate_email
  FROM jsonb_array_elements(import_rows) value
  GROUP BY lower(btrim(value->>'email'))
  HAVING count(*) > 1
  LIMIT 1;
  IF duplicate_email IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate email in import: %', duplicate_email;
  END IF;

  FOR item, row_number IN
    SELECT value, ordinality
    FROM jsonb_array_elements(import_rows) WITH ORDINALITY AS entries(value, ordinality)
  LOOP
    IF nullif(btrim(item->>'first_name'), '') IS NULL THEN
      RAISE EXCEPTION 'row % field first_name: first_name is required', row_number;
    END IF;
    IF nullif(btrim(item->>'last_name'), '') IS NULL THEN
      RAISE EXCEPTION 'row % field last_name: last_name is required', row_number;
    END IF;

    normalized_email := lower(btrim(item->>'email'));
    IF normalized_email = '' OR normalized_email IS NULL THEN
      RAISE EXCEPTION 'row % field email: email is required', row_number;
    END IF;
    IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'row % field email: enter a valid email address', row_number;
    END IF;

    BEGIN
      normalized_experience := coalesce(nullif(btrim(item->>'experience_years'), '')::numeric, 5);
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'row % field experience_years: experience must be between 0 and 50', row_number;
    END;
    IF normalized_experience < 0 OR normalized_experience > 50 THEN
      RAISE EXCEPTION 'row % field experience_years: experience must be between 0 and 50', row_number;
    END IF;

    normalized_stage := coalesce(nullif(btrim(item->>'current_stage'), ''), 'SCREENING');
    IF normalized_stage NOT IN ('SCREENING', 'L1', 'L2', 'L3', 'OFFER', 'REJECTED') THEN
      RAISE EXCEPTION 'row % field current_stage: must be one of SCREENING, L1, L2, L3, OFFER, REJECTED', row_number;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.candidates candidate
      WHERE lower(btrim(candidate.email)) = normalized_email
    ) THEN
      RAISE EXCEPTION 'row % field email: email already exists', row_number;
    END IF;

    SELECT * INTO matched_job
    FROM public.jobs job
    WHERE job.job_code = btrim(item->>'job_code') AND job.status = 'OPEN';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'row % field job_code: matching OPEN job not found', row_number;
    END IF;

    BEGIN
      INSERT INTO public.candidates (
        first_name, last_name, email, phone, job_id, source, experience_years,
        skills, current_stage, resume_url
      ) VALUES (
        btrim(item->>'first_name'),
        btrim(item->>'last_name'),
        normalized_email,
        nullif(btrim(item->>'phone'), ''),
        matched_job.id,
        coalesce(nullif(btrim(item->>'source'), ''), 'Referral'),
        normalized_experience,
        coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'skills', '[]'::jsonb))), '{}'),
        normalized_stage,
        nullif(btrim(item->>'resume_url'), '')
      ) RETURNING * INTO inserted_candidate;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'row % field email: email already exists', row_number;
    END;

    INSERT INTO public.candidate_activity_log (candidate_id, action_type, details)
    VALUES (
      inserted_candidate.id,
      'APPLICATION_RECEIVED',
      jsonb_build_object(
        'source', inserted_candidate.source,
        'stage', inserted_candidate.current_stage,
        'job_code', matched_job.job_code
      )
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_positions(import_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  row_number bigint;
  inserted_count integer := 0;
  matched_department public.departments%ROWTYPE;
  department_matches integer;
BEGIN
  IF jsonb_typeof(import_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Import must be a JSON array of positions';
  END IF;
  IF jsonb_array_length(import_rows) = 0 THEN
    RAISE EXCEPTION 'Import must contain at least one position row';
  END IF;
  IF jsonb_array_length(import_rows) > 100 THEN
    RAISE EXCEPTION 'Position import exceeds the 100 row maximum';
  END IF;

  FOR item, row_number IN
    SELECT value, ordinality
    FROM jsonb_array_elements(import_rows) WITH ORDINALITY AS entries(value, ordinality)
  LOOP
    IF nullif(btrim(item->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'row % field title: title is required', row_number;
    END IF;

    SELECT count(*) INTO department_matches
    FROM public.departments department
    WHERE lower(btrim(department.name)) = lower(btrim(item->>'department'));
    IF department_matches <> 1 THEN
      RAISE EXCEPTION 'row % field department: existing department not found or ambiguous', row_number;
    END IF;

    SELECT * INTO matched_department
    FROM public.departments department
    WHERE lower(btrim(department.name)) = lower(btrim(item->>'department'));

    PERFORM public.create_job_with_code(
      btrim(item->>'title'),
      matched_department.id,
      nullif(btrim(item->>'description'), ''),
      coalesce(nullif(btrim(item->>'location'), ''), 'Bengaluru, IN'),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'required_skills', '[]'::jsonb))), '{}'),
      coalesce(nullif(btrim(item->>'status'), ''), 'OPEN')
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.import_candidates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_positions(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_candidates(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_positions(jsonb) TO anon, authenticated;
