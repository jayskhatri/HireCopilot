CREATE TABLE public.app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sla_warning_days integer NOT NULL DEFAULT 3,
  sla_breach_days integer NOT NULL DEFAULT 5,
  auto_schedule boolean NOT NULL DEFAULT true,
  ai_risk_analysis boolean NOT NULL DEFAULT true,
  teams_reminders boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_sla_range CHECK (
    sla_warning_days BETWEEN 1 AND 90
    AND sla_breach_days BETWEEN 2 AND 180
    AND sla_breach_days > sla_warning_days
  )
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_settings_touch_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.app_settings_touch_updated_at();

GRANT SELECT, UPDATE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo_read_app_settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "demo_update_app_settings" ON public.app_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
