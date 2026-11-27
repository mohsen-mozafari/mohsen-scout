import * as SecureStore from 'expo-secure-store';
export type Credential = 'youtube' | 'openrouter' | 'gemini' | 'xai' | 'cloudflare' | 'cloudflare-account-id' | 'firecrawl';
export const credentialPersistence = 'Encrypted on this device';
export async function getKey(kind: Credential) {
  return SecureStore.getItemAsync(`mohsen-scout-${kind}`);
}
export async function setKey(kind: Credential, key: string) {
  if (!key.trim()) throw new Error('Enter a key first.');
  await SecureStore.setItemAsync(`mohsen-scout-${kind}`, key.trim());
}
export async function deleteKey(kind: Credential) {
  await SecureStore.deleteItemAsync(`mohsen-scout-${kind}`);
}
