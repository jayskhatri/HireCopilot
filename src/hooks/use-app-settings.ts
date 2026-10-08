import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import { appSettingsQuery } from "@/lib/hiring";
import { useQuery } from "@tanstack/react-query";

export function useAppSettings() {
  const query = useQuery(appSettingsQuery);
  return { settings: query.data ?? DEFAULT_APP_SETTINGS, query };
}
