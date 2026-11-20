export const SETTINGS_ROUTE = '/settings' as const;

export function isSettingsRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === SETTINGS_ROUTE;
}
