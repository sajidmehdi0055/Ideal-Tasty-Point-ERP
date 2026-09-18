import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export interface AuthContext { userId: string; role: string; branchId: string }

/** Trusted composition boundary. Never populate this from unverified client headers. */
export type AuthContextProvider = (request: FastifyRequest) => Promise<AuthContext | null>;

const contextSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.string().min(1),
  branchId: z.string().trim().min(1),
}).strict();

export function requireItemEditor(value: unknown): AuthContext {
  const result = contextSchema.safeParse(value);
  if (!result.success) throw new AppError(401, 'UNAUTHENTICATED', 'Valid authorization context required');
  if (result.data.role !== 'OWNER' && result.data.role !== 'MANAGER') {
    throw new AppError(403, 'FORBIDDEN', 'Item creation/editing requires Owner or Manager');
  }
  return result.data;
}
