CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL UNIQUE,
  code varchar NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_format CHECK (code ~ '^[A-Z0-9]{2,6}$')
);

INSERT INTO public.departments (name, code) VALUES
('Engineering', 'ENG'),
('Enterprise Apps', 'EA'),
('Cloud Platform', 'CP'),
('Data & AI', 'DA'),
('Product', 'PRD')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.departments (name, code)
SELECT DISTINCT
  j.department,
  'D' || lpad(row_number() OVER (ORDER BY j.department)::text, 5, '0')
FROM public.jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.name = j.department
)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_code varchar;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_open_closed;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_open_closed CHECK (status IN ('OPEN', 'CLOSED'));

UPDATE public.jobs j
SET department_id = d.id
FROM public.departments d
WHERE j.department_id IS NULL AND j.department = d.name;

WITH numbered AS (
  SELECT
    j.id,
    to_char(j.open_since, 'YY') || lpad(row_number() OVER (ORDER BY j.open_since, j.id)::text, 5, '0') || d.code AS generated_code
  FROM public.jobs j
  JOIN public.departments d ON d.id = j.department_id
  WHERE j.job_code IS NULL
)
UPDATE public.jobs j
SET job_code = numbered.generated_code
FROM numbered
WHERE numbered.id = j.id;

ALTER TABLE public.jobs ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN job_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_code ON public.jobs(job_code);
CREATE INDEX IF NOT EXISTS idx_jobs_department_id ON public.jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_candidates_job_id ON public.candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id ON public.interviews(job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO anon, authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo_all_departments" ON public.departments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_job_with_code(
  title varchar,
  department_id uuid,
  description text DEFAULT NULL,
  location varchar DEFAULT 'Bengaluru, IN',
  required_skills text[] DEFAULT '{}',
  status varchar DEFAULT 'OPEN'
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept public.departments%ROWTYPE;
  next_sequence integer;
  generated_code varchar;
  inserted_job public.jobs%ROWTYPE;
BEGIN
  IF status NOT IN ('OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'Invalid job status: %', status;
  END IF;

  SELECT * INTO dept FROM public.departments WHERE id = create_job_with_code.department_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department not found';
  END IF;

  SELECT coalesce(max(substring(job_code from 3 for 5)::integer), 0) + 1
  INTO next_sequence
  FROM public.jobs
  WHERE substring(job_code from 1 for 2) = to_char(now(), 'YY')
    AND job_code ~ '^[0-9]{7}[A-Z0-9]{2,6}$';

  generated_code := to_char(now(), 'YY') || lpad(next_sequence::text, 5, '0') || dept.code;

  INSERT INTO public.jobs (title, department_id, department, description, location, required_skills, status, job_code)
  VALUES (title, dept.id, dept.name, description, location, required_skills, status, generated_code)
  RETURNING * INTO inserted_job;

  RETURN inserted_job;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_job_with_code(varchar, uuid, text, varchar, text[], varchar) TO anon, authenticated;