CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.interviews
  ADD COLUMN booking_group_id uuid NOT NULL DEFAULT gen_random_uuid();

WITH groups AS (
  SELECT candidate_id, stage, scheduled_start, scheduled_end,
         gen_random_uuid() AS group_id
  FROM public.interviews
  GROUP BY candidate_id, stage, scheduled_start, scheduled_end
)
UPDATE public.interviews iv
SET booking_group_id = g.group_id
FROM groups g
WHERE iv.candidate_id = g.candidate_id
  AND iv.stage = g.stage
  AND iv.scheduled_start = g.scheduled_start
  AND iv.scheduled_end = g.scheduled_end;

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_time_order_check
  CHECK (scheduled_end > scheduled_start);

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED'));

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_candidate_no_overlap
  EXCLUDE USING gist (
    candidate_id WITH =,
    booking_group_id WITH <>,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (status = 'SCHEDULED');

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_interviewer_no_overlap
  EXCLUDE USING gist (
    interviewer_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (status = 'SCHEDULED' AND interviewer_id IS NOT NULL);

CREATE INDEX idx_interviews_booking_group ON public.interviews(booking_group_id);
