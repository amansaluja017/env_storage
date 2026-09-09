import express from 'express';
import jwt from 'jsonwebtoken';
import { protoRouter } from '../src/routers/protoRouter.js';
import { JWT_SECRET } from '../src/context.js';
import {
  ListFoldersRequestProtoType,
  ListFoldersResponseProtoType,
  ListEnvsRequestProtoType,
  ListEnvsResponseProtoType,
  encodeProto,
  decodeProto,
  IListFoldersRequestProto,
  IListFoldersResponseProto,
  IListEnvsRequestProto,
  IListEnvsResponseProto,
} from '@tubo/proto';

async function testEndpoint() {
  const app = express();
  app.use(express.raw({ type: ['application/x-protobuf', 'application/octet-stream'], limit: '15mb' }));
  app.use('/api/proto', protoRouter);

  const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    console.log(`🌐 Test Protobuf Express Server listening on port ${port}...`);

    try {
      const token = jwt.sign(
        { id: 'acc334d9-16a6-4b06-9b6c-b0c9c2274610', email: 'test@example.com', name: 'Tester', role: 'admin' },
        JWT_SECRET
      );

      // 1. Test folder.list Protobuf wire transfer
      const reqFolders: IListFoldersRequestProto = {
        workspaceId: '360a62e1-fa76-4c3f-9c42-82d21fa50087',
        teamId: 'b1c2d69e-d6c1-4778-848b-caff8fb059ff',
        environment: 'production',
      };
      const folderBytes = encodeProto(ListFoldersRequestProtoType, reqFolders);

      const fRes = await fetch(`http://localhost:${port}/api/proto/folder.list`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-protobuf',
          'Accept': 'application/x-protobuf',
        },
        body: folderBytes,
      });

      if (fRes.headers.get('content-type') !== 'application/x-protobuf') {
        throw new Error('Expected Content-Type: application/x-protobuf');
      }

      const fBuf = await fRes.arrayBuffer();
      const decodedFolders = decodeProto<IListFoldersResponseProto>(ListFoldersResponseProtoType, fBuf);
      console.log('✔ folder.list Protobuf wire response:', {
        count: decodedFolders.items.length,
        items: decodedFolders.items.map(f => f.name),
      });

      // 2. Test env.list Protobuf wire transfer
      const reqEnvs: IListEnvsRequestProto = {
        workspaceId: '360a62e1-fa76-4c3f-9c42-82d21fa50087',
        teamId: 'b1c2d69e-d6c1-4778-848b-caff8fb059ff',
        environment: 'production',
        hasFolderFilter: false,
      };
      const envBytes = encodeProto(ListEnvsRequestProtoType, reqEnvs);

      const eRes = await fetch(`http://localhost:${port}/api/proto/env.list`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-protobuf',
          'Accept': 'application/x-protobuf',
        },
        body: envBytes,
      });

      if (eRes.headers.get('content-type') !== 'application/x-protobuf') {
        throw new Error('Expected Content-Type: application/x-protobuf');
      }

      const eBuf = await eRes.arrayBuffer();
      const decodedEnvs = decodeProto<IListEnvsResponseProto>(ListEnvsResponseProtoType, eBuf);
      console.log('✔ env.list Protobuf wire response:', {
        count: decodedEnvs.items.length,
        keys: decodedEnvs.items.map(e => e.key),
      });

      console.log('\n🎉 ALL PROTOBUF WIRE ENDPOINTS PASSED SUCCESSFULLY!');
    } catch (err) {
      console.error('Test error:', err);
      process.exit(1);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

testEndpoint();
