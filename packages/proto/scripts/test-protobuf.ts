import {
  EncryptedEnvEnvelopeType,
  ListFoldersRequestProtoType,
  ListFoldersResponseProtoType,
  ListEnvsRequestProtoType,
  ListEnvsResponseProtoType,
  UpsertEnvRequestProtoType,
  UpsertEnvResponseProtoType,
  encodeProto,
  decodeProto,
  IEncryptedEnvEnvelope,
  IListFoldersRequestProto,
  IListFoldersResponseProto,
  IListEnvsRequestProto,
  IListEnvsResponseProto,
} from '../src/index.js';
import {
  encryptEnvValue,
  decryptEnvValue,
  PROTO_ENCRYPTED_PREFIX,
  LEGACY_ENCRYPTED_PREFIX,
} from '../../../apps/api/src/utils/vaultCrypto.js';
import CryptoJS from 'crypto-js';

async function runTests() {
  console.log('🧪 Starting Protocol Buffers (Protobuf) Verification Suite...\n');

  // Test 1: Protobuf Encryption & Decryption Envelope
  console.log('Test 1: Vault Env Encryption with Protobuf Envelope...');
  const secret = 'stripe_sk_live_51M0abcdef9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA';
  const encrypted = encryptEnvValue(secret);
  console.log('   Encrypted String:', encrypted.substring(0, 50) + '...');

  if (!encrypted.startsWith(PROTO_ENCRYPTED_PREFIX)) {
    throw new Error(`Expected encrypted value to start with ${PROTO_ENCRYPTED_PREFIX}, got: ${encrypted}`);
  }

  // Verify internal Protobuf envelope structure
  const b64 = encrypted.slice(PROTO_ENCRYPTED_PREFIX.length);
  const rawBytes = Buffer.from(b64, 'base64');
  const envelope = decodeProto<IEncryptedEnvEnvelope>(EncryptedEnvEnvelopeType, rawBytes);
  console.log('   Decoded Protobuf Envelope:', {
    version: envelope.version,
    algorithm: envelope.algorithm,
    ciphertextLength: envelope.ciphertext.length,
    keyId: envelope.keyId,
  });

  if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-CBC') {
    throw new Error('Protobuf envelope fields did not match expected values.');
  }

  const decrypted = decryptEnvValue(encrypted);
  if (decrypted !== secret) {
    throw new Error(`Decrypted secret mismatch! Expected: ${secret}, Got: ${decrypted}`);
  }
  console.log('   ✔ Protobuf encryption & decryption round-trip PASSED!\n');

  // Test 2: Backwards Compatibility with Legacy enc:v1:
  console.log('Test 2: Backwards Compatibility with legacy enc:v1: ciphertext...');
  const legacyKey = 'tubo_vault_master_aes_key_2026';
  const legacyCipher = CryptoJS.AES.encrypt(secret, legacyKey).toString();
  const legacyEncrypted = `${LEGACY_ENCRYPTED_PREFIX}${legacyCipher}`;

  const legacyDecrypted = decryptEnvValue(legacyEncrypted);
  if (legacyDecrypted !== secret) {
    throw new Error(`Legacy decryption failed! Expected: ${secret}, Got: ${legacyDecrypted}`);
  }
  console.log('   ✔ Legacy enc:v1: decryption PASSED!\n');

  // Test 3: Protobuf Wire Transfer Messages (Folder & Env List)
  console.log('Test 3: Protobuf Wire Serialization & Deserialization...');
  const mockFolderRequest: IListFoldersRequestProto = {
    workspaceId: 'ws-12345',
    teamId: 'team-67890',
    environment: 'production',
  };

  const reqBytes = encodeProto(ListFoldersRequestProtoType, mockFolderRequest);
  console.log(`   Encoded ListFoldersRequestProto: ${reqBytes.length} bytes (binary)`);

  const decodedReq = decodeProto<IListFoldersRequestProto>(ListFoldersRequestProtoType, reqBytes);
  if (decodedReq.workspaceId !== mockFolderRequest.workspaceId || decodedReq.teamId !== mockFolderRequest.teamId) {
    throw new Error('ListFoldersRequestProto decode mismatch');
  }

  const mockFolderResponse: IListFoldersResponseProto = {
    success: true,
    items: [
      {
        id: 'f-1',
        workspaceId: 'ws-12345',
        teamId: 'team-67890',
        environment: 'production',
        name: 'Database Credentials',
        description: 'Postgres & Redis secrets',
        envCount: 3,
      },
    ],
  };

  const resBytes = encodeProto(ListFoldersResponseProtoType, mockFolderResponse);
  console.log(`   Encoded ListFoldersResponseProto: ${resBytes.length} bytes (binary)`);

  const decodedRes = decodeProto<IListFoldersResponseProto>(ListFoldersResponseProtoType, resBytes);
  if (!decodedRes.success || decodedRes.items.length !== 1 || decodedRes.items[0].name !== 'Database Credentials') {
    throw new Error('ListFoldersResponseProto decode mismatch');
  }
  console.log('   ✔ Protobuf wire models PASSED!\n');

  console.log('🎉 ALL PROTOBUF TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
