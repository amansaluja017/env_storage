import CryptoJS from 'crypto-js';
import {
  EncryptedEnvEnvelopeType,
  IEncryptedEnvEnvelope,
  encodeProto,
  decodeProto,
} from '@tubo/proto';

export const PROTO_ENCRYPTED_PREFIX = 'enc:pb1:';
export const LEGACY_ENCRYPTED_PREFIX = 'enc:v1:';
export const ENCRYPTED_PREFIX = PROTO_ENCRYPTED_PREFIX;

// Secret master key used for AES vault encryption
const DEFAULT_VAULT_KEY = 'tubo_vault_master_aes_key_2026';

function getVaultKey(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VAULT_ENCRYPTION_KEY) return process.env.VAULT_ENCRYPTION_KEY;
    if (process.env.EXPO_PUBLIC_VAULT_KEY) return process.env.EXPO_PUBLIC_VAULT_KEY;
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  }
  return DEFAULT_VAULT_KEY;
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if an environment variable string is already encrypted (Protobuf or legacy)
 */
export function isEncryptedEnvValue(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith(PROTO_ENCRYPTED_PREFIX) || value.startsWith(LEGACY_ENCRYPTED_PREFIX);
}

/**
 * Encrypt an environment variable value using AES and serialize into a Protocol Buffer envelope.
 * If value is empty or already encrypted, returns it directly.
 */
export function encryptEnvValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return value || '';
  if (isEncryptedEnvValue(value)) return value;

  try {
    const key = getVaultKey();
    const cipher = CryptoJS.AES.encrypt(value, key).toString();
    const cipherBytes = typeof Buffer !== 'undefined'
      ? Buffer.from(cipher, 'utf8')
      : new TextEncoder().encode(cipher);

    const envelope: IEncryptedEnvEnvelope = {
      version: 1,
      algorithm: 'AES-256-CBC',
      ciphertext: cipherBytes,
      timestamp: Date.now(),
      keyId: 'default',
    };

    const protoBytes = encodeProto(EncryptedEnvEnvelopeType, envelope);
    return `${PROTO_ENCRYPTED_PREFIX}${uint8ToBase64(protoBytes)}`;
  } catch (err) {
    console.warn('[VaultCrypto] Protobuf encryption failed, fallback to original:', err);
    return value;
  }
}

/**
 * Decrypt an environment variable value using AES.
 * Supports both Protobuf envelope (enc:pb1:) and legacy (enc:v1:).
 * If value is not encrypted, returns it as-is.
 */
export function decryptEnvValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return value || '';
  if (!isEncryptedEnvValue(value)) return value;

  // 1. Handle Protocol Buffer encrypted values
  if (value.startsWith(PROTO_ENCRYPTED_PREFIX)) {
    try {
      const b64Payload = value.slice(PROTO_ENCRYPTED_PREFIX.length);
      const protoBytes = base64ToUint8(b64Payload);
      const envelope = decodeProto<IEncryptedEnvEnvelope>(EncryptedEnvEnvelopeType, protoBytes);

      const cipherStr = typeof Buffer !== 'undefined'
        ? Buffer.from(envelope.ciphertext).toString('utf8')
        : new TextDecoder().decode(envelope.ciphertext);

      const key = getVaultKey();
      const bytes = CryptoJS.AES.decrypt(cipherStr, key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted && value !== PROTO_ENCRYPTED_PREFIX) {
        return value;
      }
      return decrypted;
    } catch (err) {
      console.warn('[VaultCrypto] Failed to decode/decrypt Protobuf value:', err);
      return value;
    }
  }

  // 2. Handle legacy enc:v1: values for backwards compatibility
  if (value.startsWith(LEGACY_ENCRYPTED_PREFIX)) {
    try {
      const cipher = value.slice(LEGACY_ENCRYPTED_PREFIX.length);
      const key = getVaultKey();
      const bytes = CryptoJS.AES.decrypt(cipher, key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted && value !== LEGACY_ENCRYPTED_PREFIX) {
        return value;
      }
      return decrypted;
    } catch (err) {
      console.warn('[VaultCrypto] Failed to decrypt legacy value:', err);
      return value;
    }
  }

  return value;
}
