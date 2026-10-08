-- Keep the earliest feedback row per interview before enforcing one feedback per interview.
DELETE FROM public.interview_feedback AS dupe
USING public.interview_feedback AS keeper
WHERE dupe.interview_id = keeper.interview_id
  AND (
    keeper.submitted_at < dupe.submitted_at
    OR (keeper.submitted_at = dupe.submitted_at AND keeper.id < dupe.id)
  );

ALTER TABLE public.interview_feedback
  DROP CONSTRAINT IF EXISTS interview_feedback_interview_id_key;

ALTER TABLE public.interview_feedback
  ADD CONSTRAINT interview_feedback_interview_id_key UNIQUE (interview_id);
