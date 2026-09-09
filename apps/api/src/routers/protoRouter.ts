import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  ListEnvsRequestProtoType,
  ListEnvsResponseProtoType,
  ListFoldersRequestProtoType,
  ListFoldersResponseProtoType,
  UpsertEnvRequestProtoType,
  UpsertEnvResponseProtoType,
  FolderActionRequestProtoType,
  FolderActionResponseProtoType,
  DeleteEntityRequestProtoType,
  ApiResponseProtoType,
  IListEnvsRequestProto,
  IListFoldersRequestProto,
  IUpsertEnvRequestProto,
  IFolderActionRequestProto,
  IDeleteEntityRequestProto,
  encodeProto,
  decodeProto,
} from '@tubo/proto';
import { dataStore } from '../storage/store.js';
import { JWT_SECRET, UserSession } from '../context.js';

export const protoRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: UserSession;
}

// Authentication middleware for Protobuf API endpoints
function authProto(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const errBytes = encodeProto(ApiResponseProtoType, {
      success: false,
      error: 'UNAUTHORIZED: Missing or malformed authorization header',
    });
    res.setHeader('Content-Type', 'application/x-protobuf');
    return res.status(401).send(Buffer.from(errBytes));
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch (err: any) {
    const isExpired = err.name === 'TokenExpiredError';
    const errBytes = encodeProto(ApiResponseProtoType, {
      success: false,
      error: isExpired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED: Invalid access token',
    });
    res.setHeader('Content-Type', 'application/x-protobuf');
    return res.status(401).send(Buffer.from(errBytes));
  }
}

// Helper to extract binary buffer from request body
function getBufferFromBody(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  return Buffer.alloc(0);
}

// Helper to send Protobuf binary response
function sendProto(res: Response, type: any, payload: any, status: number = 200) {
  const bytes = encodeProto(type, payload);
  res.setHeader('Content-Type', 'application/x-protobuf');
  return res.status(status).send(Buffer.from(bytes));
}

// 1. LIST ENVIRONMENT VARIABLES (Protobuf)
protoRouter.post('/env.list', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    let input: IListEnvsRequestProto;

    if (buf.length > 0) {
      input = decodeProto<IListEnvsRequestProto>(ListEnvsRequestProtoType, buf);
    } else {
      input = {
        workspaceId: String(req.query.workspaceId || ''),
        teamId: String(req.query.teamId || ''),
        environment: String(req.query.environment || 'development'),
        folderId: req.query.folderId ? String(req.query.folderId) : undefined,
        hasFolderFilter: req.query.folderId !== undefined,
      };
    }

    if (!input.workspaceId || !input.teamId) {
      return sendProto(res, ListEnvsResponseProtoType, {
        success: false,
        error: 'Missing required fields: workspaceId, teamId',
        items: [],
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, ListEnvsResponseProtoType, {
        success: false,
        error: 'Access Denied: You are not a member of this team.',
        items: [],
      }, 403);
    }

    const env = ['development', 'staging', 'production'].includes(input.environment)
      ? (input.environment as 'development' | 'staging' | 'production')
      : 'development';

    const rawEnvs = await dataStore.getEnvs(
      input.workspaceId,
      input.teamId,
      env,
      input.hasFolderFilter ? input.folderId : undefined
    );

    const items = rawEnvs.map((e) => ({
      id: e.id,
      workspaceId: e.workspaceId,
      teamId: e.teamId,
      environment: e.environment,
      folderId: e.folderId || '',
      folderName: e.folderName || '',
      key: e.key,
      value: e.value,
      isSecret: Boolean(e.isSecret),
      comment: e.comment || '',
      createdBy: e.createdBy || '',
      createdById: e.createdById || '',
      createdAt: e.createdAt || '',
      updatedAt: e.updatedAt || '',
    }));

    return sendProto(res, ListEnvsResponseProtoType, {
      success: true,
      items,
    });
  } catch (err: any) {
    console.error('Error in /api/proto/env.list:', err);
    return sendProto(res, ListEnvsResponseProtoType, {
      success: false,
      error: err.message || 'Failed to list environment variables',
      items: [],
    }, 500);
  }
});

// 2. UPSERT ENVIRONMENT VARIABLE (Protobuf)
protoRouter.post('/env.upsert', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    if (buf.length === 0) {
      return sendProto(res, UpsertEnvResponseProtoType, {
        success: false,
        error: 'Request body must be a binary Protobuf buffer',
      }, 400);
    }

    const input = decodeProto<IUpsertEnvRequestProto>(UpsertEnvRequestProtoType, buf);
    if (!input.workspaceId || !input.teamId || !input.key) {
      return sendProto(res, UpsertEnvResponseProtoType, {
        success: false,
        error: 'Missing required fields: workspaceId, teamId, key',
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, UpsertEnvResponseProtoType, {
        success: false,
        error: 'Access Denied: You cannot add environment variables to this team.',
      }, 403);
    }

    const env = ['development', 'staging', 'production'].includes(input.environment)
      ? (input.environment as 'development' | 'staging' | 'production')
      : 'development';

    const saved = await dataStore.upsertEnv({
      id: input.id || undefined,
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      environment: env,
      folderId: input.folderId || null,
      key: input.key.toUpperCase().trim(),
      value: input.value,
      isSecret: input.isSecret ?? true,
      comment: input.comment || undefined,
      createdBy: req.user!.name || 'Team Member',
      createdById: req.user!.id,
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    return sendProto(res, UpsertEnvResponseProtoType, {
      success: true,
      item: {
        id: saved.id,
        workspaceId: saved.workspaceId,
        teamId: saved.teamId,
        environment: saved.environment,
        folderId: saved.folderId || '',
        folderName: '',
        key: saved.key,
        value: saved.value,
        isSecret: Boolean(saved.isSecret),
        comment: saved.comment || '',
        createdBy: saved.createdBy || '',
        createdById: saved.createdById || '',
        createdAt: saved.createdAt || '',
        updatedAt: saved.updatedAt || '',
      },
    });
  } catch (err: any) {
    console.error('Error in /api/proto/env.upsert:', err);
    return sendProto(res, UpsertEnvResponseProtoType, {
      success: false,
      error: err.message || 'Failed to save environment variable',
    }, 500);
  }
});

// 3. DELETE ENVIRONMENT VARIABLE (Protobuf)
protoRouter.post('/env.delete', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    if (buf.length === 0) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Request body must be a binary Protobuf buffer',
      }, 400);
    }

    const input = decodeProto<IDeleteEntityRequestProto>(DeleteEntityRequestProtoType, buf);
    if (!input.id || !input.teamId) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Missing required fields: id, teamId',
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Access Denied: You cannot delete variables in this team.',
      }, 403);
    }

    await dataStore.deleteEnv(input.id, input.teamId, req.user!.id, req.user!.role);
    return sendProto(res, ApiResponseProtoType, {
      success: true,
      message: 'Environment variable deleted successfully',
    });
  } catch (err: any) {
    const isNotFound = err.message?.toLowerCase().includes('not found');
    return sendProto(res, ApiResponseProtoType, {
      success: isNotFound, // Treat already deleted as success for idempotent sync
      error: isNotFound ? '' : (err.message || 'Failed to delete variable'),
      message: isNotFound ? 'Already deleted' : '',
    }, isNotFound ? 200 : 500);
  }
});

// 4. LIST FOLDERS (Protobuf)
protoRouter.post('/folder.list', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    let input: IListFoldersRequestProto;

    if (buf.length > 0) {
      input = decodeProto<IListFoldersRequestProto>(ListFoldersRequestProtoType, buf);
    } else {
      input = {
        workspaceId: String(req.query.workspaceId || ''),
        teamId: String(req.query.teamId || ''),
        environment: String(req.query.environment || 'development'),
      };
    }

    if (!input.workspaceId || !input.teamId) {
      return sendProto(res, ListFoldersResponseProtoType, {
        success: false,
        error: 'Missing required fields: workspaceId, teamId',
        items: [],
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, ListFoldersResponseProtoType, {
        success: false,
        error: 'Access Denied: You are not a member of this team.',
        items: [],
      }, 403);
    }

    const env = ['development', 'staging', 'production'].includes(input.environment)
      ? (input.environment as 'development' | 'staging' | 'production')
      : 'development';

    const rawFolders = await dataStore.getFolders(input.workspaceId, input.teamId, env);
    const items = rawFolders.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      teamId: f.teamId,
      environment: f.environment,
      name: f.name,
      description: f.description || '',
      createdBy: f.createdBy || '',
      createdById: f.createdById || '',
      createdAt: f.createdAt || '',
      updatedAt: f.updatedAt || '',
      envCount: f.envCount || 0,
    }));

    return sendProto(res, ListFoldersResponseProtoType, {
      success: true,
      items,
    });
  } catch (err: any) {
    console.error('Error in /api/proto/folder.list:', err);
    return sendProto(res, ListFoldersResponseProtoType, {
      success: false,
      error: err.message || 'Failed to list folders',
      items: [],
    }, 500);
  }
});

// 5. CREATE FOLDER (Protobuf)
protoRouter.post('/folder.create', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    if (buf.length === 0) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Request body must be a binary Protobuf buffer',
      }, 400);
    }

    const input = decodeProto<IFolderActionRequestProto>(FolderActionRequestProtoType, buf);
    if (!input.workspaceId || !input.teamId || !input.name) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Missing required fields: workspaceId, teamId, name',
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Access Denied: You cannot create folders in this team.',
      }, 403);
    }

    const envStr = input.environment || 'development';
    const env = ['development', 'staging', 'production'].includes(envStr)
      ? (envStr as 'development' | 'staging' | 'production')
      : 'development';

    const folder = await dataStore.createFolder({
      id: input.id || undefined,
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      environment: env,
      name: input.name,
      description: input.description || undefined,
      createdBy: req.user!.name || 'Team Member',
      createdById: req.user!.id,
    });

    return sendProto(res, FolderActionResponseProtoType, {
      success: true,
      item: {
        id: folder.id,
        workspaceId: folder.workspaceId,
        teamId: folder.teamId,
        environment: folder.environment,
        name: folder.name,
        description: folder.description || '',
        createdBy: folder.createdBy || '',
        createdById: folder.createdById || '',
        createdAt: folder.createdAt || '',
        updatedAt: folder.updatedAt || '',
        envCount: 0,
      },
    });
  } catch (err: any) {
    console.error('Error in /api/proto/folder.create:', err);
    return sendProto(res, FolderActionResponseProtoType, {
      success: false,
      error: err.message || 'Failed to create folder',
    }, 500);
  }
});

// 6. UPDATE FOLDER (Protobuf)
protoRouter.post('/folder.update', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    if (buf.length === 0) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Request body must be a binary Protobuf buffer',
      }, 400);
    }

    const input = decodeProto<IFolderActionRequestProto>(FolderActionRequestProtoType, buf);
    if (!input.id || !input.teamId || !input.name) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Missing required fields: id, teamId, name',
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, FolderActionResponseProtoType, {
        success: false,
        error: 'Access Denied: You cannot update folders in this team.',
      }, 403);
    }

    const folder = await dataStore.updateFolder(
      input.id,
      input.teamId,
      input.name,
      input.description || undefined,
      req.user!.id,
      req.user!.role
    );

    return sendProto(res, FolderActionResponseProtoType, {
      success: true,
      item: {
        id: folder.id,
        workspaceId: folder.workspaceId,
        teamId: folder.teamId,
        environment: folder.environment,
        name: folder.name,
        description: folder.description || '',
        createdBy: folder.createdBy || '',
        createdById: folder.createdById || '',
        createdAt: folder.createdAt || '',
        updatedAt: folder.updatedAt || '',
        envCount: folder.envCount || 0,
      },
    });
  } catch (err: any) {
    console.error('Error in /api/proto/folder.update:', err);
    return sendProto(res, FolderActionResponseProtoType, {
      success: false,
      error: err.message || 'Failed to update folder',
    }, 500);
  }
});

// 7. DELETE FOLDER (Protobuf)
protoRouter.post('/folder.delete', authProto, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const buf = getBufferFromBody(req);
    if (buf.length === 0) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Request body must be a binary Protobuf buffer',
      }, 400);
    }

    const input = decodeProto<IDeleteEntityRequestProto>(DeleteEntityRequestProtoType, buf);
    if (!input.id || !input.teamId) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Missing required fields: id, teamId',
      }, 400);
    }

    const isMember = await dataStore.isUserInTeam(input.teamId, req.user!.id);
    if (!isMember) {
      return sendProto(res, ApiResponseProtoType, {
        success: false,
        error: 'Access Denied: You cannot delete folders in this team.',
      }, 403);
    }

    await dataStore.deleteFolder(
      input.id,
      input.teamId,
      input.deleteEnvs ?? false,
      req.user!.id,
      req.user!.role
    );

    return sendProto(res, ApiResponseProtoType, {
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (err: any) {
    const isNotFound = err.message?.toLowerCase().includes('not found');
    return sendProto(res, ApiResponseProtoType, {
      success: isNotFound,
      error: isNotFound ? '' : (err.message || 'Failed to delete folder'),
      message: isNotFound ? 'Already deleted' : '',
    }, isNotFound ? 200 : 500);
  }
});
