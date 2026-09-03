import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';

export const envRouter = router({
  info: protectedProcedure.query(async () => {
    return {
      message: 'Environment variables are stored locally on Mobile device using SQLite.',
      storageEngine: 'Mobile SQLite',
    };
  }),
});
