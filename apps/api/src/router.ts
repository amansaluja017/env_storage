import { router } from './trpc.js';
import { authRouter } from './routers/auth.js';
import { workspaceRouter } from './routers/workspace.js';
import { teamRouter } from './routers/team.js';
import { envRouter } from './routers/env.js';
import { folderRouter } from './routers/folder.js';

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  team: teamRouter,
  folder: folderRouter,
  env: envRouter,
});

export type AppRouter = typeof appRouter;
