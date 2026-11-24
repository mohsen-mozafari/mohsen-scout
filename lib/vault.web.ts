export type Credential = 'youtube' | 'openrouter' | 'gemini' | 'xai' | 'cloudflare' | 'cloudflare-account-id' | 'firecrawl';
const keys: Partial<Record<Credential, string>> = {};
export const credentialPersistence =
  'Browser preview: keys stay in memory only and clear on reload. Android uses encrypted SecureStore.';
export async function getKey(kind: Credential) {
  return keys[kind] ?? null;
}
export async function setKey(kind: Credential, key: string) {
  if (!key.trim()) throw new Error('Enter a key first.');
  keys[kind] = key.trim();
}
export async function deleteKey(kind: Credential) {
  delete keys[kind];
}
