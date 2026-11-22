export function normalizeBrowserAddress(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (!hasScheme && /\s/.test(value)) {
    return 'https://www.google.com/search?q=' + encodeURIComponent(value);
  }

  try {
    const candidate = hasScheme ? value : 'https://' + value;
    const url = new URL(candidate);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') ||
        !url.hostname || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isAllowedBrowserNavigation(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
