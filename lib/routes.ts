export const SETTINGS_ROUTE = '/settings' as const;

export function isSettingsRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').endsWith('/settings');
}
