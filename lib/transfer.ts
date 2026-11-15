import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
export async function shareText(text: string, filename: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is unavailable on this device.');
  const file = new File(Paths.cache, filename);
  await file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: filename.endsWith('.json') ? 'application/json' : 'text/plain',
    dialogTitle: 'MOHSEN SCOUT export',
  });
}
export async function readBackup(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return undefined;
  const file = new File(result.assets[0].uri);
  if (file.size > 20_000_000) throw new Error('This backup is too large. Maximum size is 20 MB.');
  return file.text();
}
export async function shareApk() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/vnd.android.package-archive',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return;
  if (!result.assets[0].name.endsWith('.apk')) throw new Error('Choose an APK file.');
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(result.assets[0].uri, {
    mimeType: 'application/vnd.android.package-archive',
  });
}
