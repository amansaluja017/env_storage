import protobuf from 'protobufjs';

/**
 * Protocol Buffers Definition Root for Tubo Vault
 */
export const root = protobuf.Root.fromJSON({
  nested: {
    tubo: {
      nested: {
        vault: {
          nested: {
            EncryptedEnvEnvelope: {
              fields: {
                version: { type: 'int32', id: 1 },
                algorithm: { type: 'string', id: 2 },
                ciphertext: { type: 'bytes', id: 3 },
                iv: { type: 'bytes', id: 4 },
                timestamp: { type: 'int64', id: 5 },
                keyId: { type: 'string', id: 6 },
              },
            },
            EnvItemProto: {
              fields: {
                id: { type: 'string', id: 1 },
                workspaceId: { type: 'string', id: 2 },
                teamId: { type: 'string', id: 3 },
                environment: { type: 'string', id: 4 },
                folderId: { type: 'string', id: 5 },
                folderName: { type: 'string', id: 6 },
                key: { type: 'string', id: 7 },
                value: { type: 'string', id: 8 },
                isSecret: { type: 'bool', id: 9 },
                comment: { type: 'string', id: 10 },
                createdBy: { type: 'string', id: 11 },
                createdById: { type: 'string', id: 12 },
                createdAt: { type: 'string', id: 13 },
                updatedAt: { type: 'string', id: 14 },
              },
            },
            FolderItemProto: {
              fields: {
                id: { type: 'string', id: 1 },
                workspaceId: { type: 'string', id: 2 },
                teamId: { type: 'string', id: 3 },
                environment: { type: 'string', id: 4 },
                name: { type: 'string', id: 5 },
                description: { type: 'string', id: 6 },
                createdBy: { type: 'string', id: 7 },
                createdById: { type: 'string', id: 8 },
                createdAt: { type: 'string', id: 9 },
                updatedAt: { type: 'string', id: 10 },
                envCount: { type: 'int32', id: 11 },
              },
            },
            ListEnvsRequestProto: {
              fields: {
                workspaceId: { type: 'string', id: 1 },
                teamId: { type: 'string', id: 2 },
                environment: { type: 'string', id: 3 },
                folderId: { type: 'string', id: 4 },
                hasFolderFilter: { type: 'bool', id: 5 },
              },
            },
            ListEnvsResponseProto: {
              fields: {
                success: { type: 'bool', id: 1 },
                error: { type: 'string', id: 2 },
                items: { rule: 'repeated', type: 'EnvItemProto', id: 3 },
              },
            },
            ListFoldersRequestProto: {
              fields: {
                workspaceId: { type: 'string', id: 1 },
                teamId: { type: 'string', id: 2 },
                environment: { type: 'string', id: 3 },
              },
            },
            ListFoldersResponseProto: {
              fields: {
                success: { type: 'bool', id: 1 },
                error: { type: 'string', id: 2 },
                items: { rule: 'repeated', type: 'FolderItemProto', id: 3 },
              },
            },
            UpsertEnvRequestProto: {
              fields: {
                id: { type: 'string', id: 1 },
                workspaceId: { type: 'string', id: 2 },
                teamId: { type: 'string', id: 3 },
                environment: { type: 'string', id: 4 },
                folderId: { type: 'string', id: 5 },
                key: { type: 'string', id: 6 },
                value: { type: 'string', id: 7 },
                isSecret: { type: 'bool', id: 8 },
                comment: { type: 'string', id: 9 },
              },
            },
            UpsertEnvResponseProto: {
              fields: {
                success: { type: 'bool', id: 1 },
                error: { type: 'string', id: 2 },
                item: { type: 'EnvItemProto', id: 3 },
              },
            },
            FolderActionRequestProto: {
              fields: {
                id: { type: 'string', id: 1 },
                workspaceId: { type: 'string', id: 2 },
                teamId: { type: 'string', id: 3 },
                environment: { type: 'string', id: 4 },
                name: { type: 'string', id: 5 },
                description: { type: 'string', id: 6 },
              },
            },
            FolderActionResponseProto: {
              fields: {
                success: { type: 'bool', id: 1 },
                error: { type: 'string', id: 2 },
                item: { type: 'FolderItemProto', id: 3 },
              },
            },
            DeleteEntityRequestProto: {
              fields: {
                id: { type: 'string', id: 1 },
                teamId: { type: 'string', id: 2 },
                deleteEnvs: { type: 'bool', id: 3 },
              },
            },
            ApiResponseProto: {
              fields: {
                success: { type: 'bool', id: 1 },
                error: { type: 'string', id: 2 },
                message: { type: 'string', id: 3 },
              },
            },
          },
        },
      },
    },
  },
});

// Message Types
export const EncryptedEnvEnvelopeType = root.lookupType('tubo.vault.EncryptedEnvEnvelope');
export const EnvItemProtoType = root.lookupType('tubo.vault.EnvItemProto');
export const FolderItemProtoType = root.lookupType('tubo.vault.FolderItemProto');
export const ListEnvsRequestProtoType = root.lookupType('tubo.vault.ListEnvsRequestProto');
export const ListEnvsResponseProtoType = root.lookupType('tubo.vault.ListEnvsResponseProto');
export const ListFoldersRequestProtoType = root.lookupType('tubo.vault.ListFoldersRequestProto');
export const ListFoldersResponseProtoType = root.lookupType('tubo.vault.ListFoldersResponseProto');
export const UpsertEnvRequestProtoType = root.lookupType('tubo.vault.UpsertEnvRequestProto');
export const UpsertEnvResponseProtoType = root.lookupType('tubo.vault.UpsertEnvResponseProto');
export const FolderActionRequestProtoType = root.lookupType('tubo.vault.FolderActionRequestProto');
export const FolderActionResponseProtoType = root.lookupType('tubo.vault.FolderActionResponseProto');
export const DeleteEntityRequestProtoType = root.lookupType('tubo.vault.DeleteEntityRequestProto');
export const ApiResponseProtoType = root.lookupType('tubo.vault.ApiResponseProto');

// TypeScript Interfaces
export interface IEncryptedEnvEnvelope {
  version: number;
  algorithm: string;
  ciphertext: Uint8Array | Buffer;
  iv?: Uint8Array | Buffer | null;
  timestamp?: number | string | null;
  keyId?: string | null;
}

export interface IEnvItemProto {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: string;
  folderId?: string | null;
  folderName?: string | null;
  key: string;
  value: string;
  isSecret: boolean;
  comment?: string | null;
  createdBy?: string | null;
  createdById?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface IFolderItemProto {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: string;
  name: string;
  description?: string | null;
  createdBy?: string | null;
  createdById?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  envCount?: number;
}

export interface IListEnvsRequestProto {
  workspaceId: string;
  teamId: string;
  environment: string;
  folderId?: string | null;
  hasFolderFilter?: boolean;
}

export interface IListEnvsResponseProto {
  success: boolean;
  error?: string | null;
  items: IEnvItemProto[];
}

export interface IListFoldersRequestProto {
  workspaceId: string;
  teamId: string;
  environment: string;
}

export interface IListFoldersResponseProto {
  success: boolean;
  error?: string | null;
  items: IFolderItemProto[];
}

export interface IUpsertEnvRequestProto {
  id?: string | null;
  workspaceId: string;
  teamId: string;
  environment: string;
  folderId?: string | null;
  key: string;
  value: string;
  isSecret?: boolean;
  comment?: string | null;
}

export interface IUpsertEnvResponseProto {
  success: boolean;
  error?: string | null;
  item?: IEnvItemProto | null;
}

export interface IFolderActionRequestProto {
  id?: string | null;
  workspaceId?: string | null;
  teamId: string;
  environment?: string | null;
  name: string;
  description?: string | null;
}

export interface IFolderActionResponseProto {
  success: boolean;
  error?: string | null;
  item?: IFolderItemProto | null;
}

export interface IDeleteEntityRequestProto {
  id: string;
  teamId: string;
  deleteEnvs?: boolean;
}

export interface IApiResponseProto {
  success: boolean;
  error?: string | null;
  message?: string | null;
}

// Helper Encoders and Decoders
export function encodeProto<T>(type: protobuf.Type, payload: T): Uint8Array {
  const errMsg = type.verify(payload as any);
  if (errMsg) {
    throw new Error(`Protobuf verification failed for ${type.name}: ${errMsg}`);
  }
  const message = type.create(payload as any);
  return type.encode(message).finish();
}

export function decodeProto<T>(type: protobuf.Type, buffer: Uint8Array | ArrayBuffer | Buffer): T {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decoded = type.decode(uint8);
  return type.toObject(decoded, {
    defaults: true,
    arrays: true,
    objects: true,
    bytes: Uint8Array,
  }) as T;
}
