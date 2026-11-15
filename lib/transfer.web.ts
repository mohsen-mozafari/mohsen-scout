export async function shareText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: filename.endsWith('.json') ? 'application/json' : 'text/plain' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readBackup(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(undefined);
          return;
        }
        if (file.size > 20_000_000) {
          reject(new Error('This backup is too large. Maximum size is 20 MB.'));
          return;
        }
        void file
          .text()
          .then(resolve, () =>
            reject(new Error('Could not read the backup file. Try choosing it again.')),
          );
      },
      { once: true },
    );
    input.click();
  });
}
export async function shareApk() {
  throw new Error(
    'APK sharing uses the Android share sheet. No APK has been generated in this project.',
  );
}
