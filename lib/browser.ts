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


/** Convert native WebView failures into actionable, user-facing network diagnostics. */
export function getBrowserFailureMessage(description: string, code?: number): string {
  const detail = description.trim();
  const normalized = detail.toUpperCase();
  if (normalized.includes('ERR_INTERNET_DISCONNECTED') || normalized.includes('NETWORK_ACCESS_DENIED')) {
    return 'The WebView cannot reach the internet. Check the phone connection and allow mobile data for MOHSEN SCOUT in Android app settings. Also check Data Saver, VPN and Private DNS.';
  }
  if (normalized.includes('ERR_NAME_NOT_RESOLVED') || normalized.includes('ERR_DNS') || code === -2) {
    return 'The website address could not be resolved (DNS). Check mobile data or Wi-Fi, Private DNS and VPN, then try again.';
  }
  if (normalized.includes('ERR_CONNECTION_TIMED_OUT') || normalized.includes('ERR_TIMED_OUT') || code === -7) {
    return 'The website connection timed out. Check the current network or VPN and retry.';
  }
  if (normalized.includes('ERR_CONNECTION_REFUSED') || normalized.includes('ERR_CONNECTION_FAILED') || code === -6) {
    return 'The website refused or could not establish the connection. Check the network, VPN and website availability.';
  }
  if (normalized.includes('ERR_CERT') || normalized.includes('ERR_SSL') || normalized.includes('CERTIFICATE') || code === -11) {
    return 'The secure connection failed certificate or SSL validation. Check the device date and time; do not bypass the certificate warning.';
  }
  const fallback = detail || 'The Android WebView failed to load the page.';
  return code === undefined ? fallback : fallback + ' (WebView error code ' + code + ').';
}
