import { appSettingsFromRow, DEFAULT_APP_SETTINGS, type AppSettings } from "./app-settings";

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return appSettingsFromRow(data);
  } catch (error) {
    console.error("Failed to load app settings; using defaults", error);
    return DEFAULT_APP_SETTINGS;
  }
}
