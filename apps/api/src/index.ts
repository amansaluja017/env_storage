import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from './router.js';
import { createContext } from './context.js';
import { seedInitialData } from './seed.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// tRPC Express middleware
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// REST Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Tubo API Server',
    trpc: '/trpc',
    timestamp: new Date().toISOString(),
  });
});

// Seed demo data on launch
seedInitialData();

app.listen(PORT, () => {
  console.log(`🚀 Tubo Express + tRPC Server running on http://localhost:${PORT}`);
  console.log(`⚡ tRPC Endpoint: http://localhost:${PORT}/trpc`);
});
