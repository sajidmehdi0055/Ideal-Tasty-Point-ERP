import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { AuthContextProvider } from './auth/context.js';
import { AppError } from './errors.js';
import type { ItemRepository } from './inventory/application/item-repository.js';
import { ItemService } from './inventory/application/item-service.js';
import type { UomRepository } from './inventory/application/uom-repository.js';
import { UomService } from './inventory/application/uom-service.js';
import type { BrandRepository } from './inventory/application/brand-repository.js';
import { BrandService } from './inventory/application/brand-service.js';
import type { PackVariantRepository } from './inventory/application/pack-variant-repository.js';
import { PackVariantService } from './inventory/application/pack-variant-service.js';
import { registerItemRoutes } from './inventory/api/item-routes.js';
import { registerUomRoutes } from './inventory/api/uom-routes.js';
import { registerBrandRoutes } from './inventory/api/brand-routes.js';
import { registerPackVariantRoutes } from './inventory/api/pack-variant-routes.js';

export interface AppOptions {
  repository: ItemRepository;
  uomRepository: UomRepository;
  brandRepository: BrandRepository;
  packVariantRepository: PackVariantRepository;
  authProvider?: AuthContextProvider;
}

export function buildApp(options: AppOptions) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.code, message: error.message });
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: 'INVALID_REQUEST' });
    }
    // Avoid logging SQL values, credentials or driver error detail.
    request.log.error({ requestId: request.id, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Item operation failed');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Operation failed' });
  });
  const authProvider = options.authProvider ?? (async () => null);
  registerItemRoutes(app, new ItemService(options.repository), authProvider);
  registerUomRoutes(app, new UomService(options.uomRepository), authProvider);
  registerBrandRoutes(app, new BrandService(options.brandRepository), authProvider);
  registerPackVariantRoutes(app, new PackVariantService(options.packVariantRepository), authProvider);
  return app;
}
