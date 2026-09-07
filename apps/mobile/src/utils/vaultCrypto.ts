import CryptoJS from 'crypto-js';

export const ENCRYPTED_PREFIX = 'enc:v1:';

// Secret master key used for AES vault encryption
const DEFAULT_VAULT_KEY = 'tubo_vault_master_aes_key_2026';

function getVaultKey(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.EXPO_PUBLIC_VAULT_KEY) return process.env.EXPO_PUBLIC_VAULT_KEY;
    if (process.env.VAULT_ENCRYPTION_KEY) return process.env.VAULT_ENCRYPTION_KEY;
  }
  return DEFAULT_VAULT_KEY;
}

/**
 * Check if an environment variable string is already encrypted
 */
export function isEncryptedEnvValue(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt an environment variable value using AES.
 * If value is empty or already encrypted, returns it directly.
 */
export function encryptEnvValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return value || '';
  if (isEncryptedEnvValue(value)) return value;

  try {
    const key = getVaultKey();
    const cipher = CryptoJS.AES.encrypt(value, key).toString();
    return `${ENCRYPTED_PREFIX}${cipher}`;
  } catch (err) {
    console.warn('[VaultCrypto] Encryption failed, fallback to original:', err);
    return value;
  }
}

/**
 * Decrypt an environment variable value using AES.
 * If value is not encrypted (e.g. plain text / legacy), returns it as-is.
 */
export function decryptEnvValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return value || '';
  if (!isEncryptedEnvValue(value)) return value;

  try {
    const cipher = value.slice(ENCRYPTED_PREFIX.length);
    const key = getVaultKey();
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted && value !== ENCRYPTED_PREFIX) {
      // If decryption yields empty string on non-empty payload, return value to avoid data loss
      return value;
    }
    return decrypted;
  } catch (err) {
    console.warn('[VaultCrypto] Failed to decrypt value:', err);
    return value;
  }
}
