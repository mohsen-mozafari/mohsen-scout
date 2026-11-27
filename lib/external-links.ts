import { Alert, Linking } from 'react-native';

export type ExternalLinkLanguage = 'fa' | 'en';

/** Open only ordinary web URLs and show a visible, localized error when the host cannot open them. */
export async function openExternalUrl(url: string, language: ExternalLinkLanguage = 'fa'): Promise<boolean> {
  const value = url.trim();
  if (!(value.startsWith('https://') || value.startsWith('http://'))) {
    Alert.alert(
      language === 'fa' ? 'پیوند نامعتبر' : 'Invalid link',
      language === 'fa' ? 'فقط پیوندهای وب با HTTP یا HTTPS قابل بازکردن هستند.' : 'Only HTTP and HTTPS web links can be opened.',
    );
    return false;
  }
  try {
    await Linking.openURL(value);
    return true;
  } catch {
    Alert.alert(
      language === 'fa' ? 'بازکردن پیوند ناموفق بود' : 'Could not open link',
      language === 'fa' ? 'برنامه نتوانست این پیوند را باز کند. اتصال و برنامه مرورگر پیش‌فرض را بررسی کن.' : 'The device could not open this link. Check connectivity and your default browser.',
    );
    return false;
  }
}
