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
import type { SupplierRepository } from './inventory/application/supplier-repository.js';
import { SupplierService } from './inventory/application/supplier-service.js';
import type { PurchaseRecordRepository } from './inventory/application/purchase-record-repository.js';
import { PurchaseRecordService } from './inventory/application/purchase-record-service.js';
import { registerItemRoutes } from './inventory/api/item-routes.js';
import { registerUomRoutes } from './inventory/api/uom-routes.js';
import { registerBrandRoutes } from './inventory/api/brand-routes.js';
import { registerPackVariantRoutes } from './inventory/api/pack-variant-routes.js';
import { registerSupplierRoutes } from './inventory/api/supplier-routes.js';
import { registerPurchaseRecordRoutes } from './inventory/api/purchase-record-routes.js';
import type { StockLocationRepository } from './inventory/application/stock-location-repository.js';
import { StockLocationService } from './inventory/application/stock-location-service.js';
import type { StockRepository } from './inventory/application/stock-repository.js';
import { StockService } from './inventory/application/stock-service.js';
import { registerStockLocationRoutes } from './inventory/api/stock-location-routes.js';
import { registerStockRoutes } from './inventory/api/stock-routes.js';
import type { GoodsReceiptRepository } from './inventory/application/goods-receipt-repository.js';
import { GoodsReceiptService } from './inventory/application/goods-receipt-service.js';
import { registerGoodsReceiptRoutes } from './inventory/api/goods-receipt-routes.js';
import type { PurchaseOrderRepository } from './inventory/application/purchase-order-repository.js';
import { PurchaseOrderService } from './inventory/application/purchase-order-service.js';
import { registerPurchaseOrderRoutes } from './inventory/api/purchase-order-routes.js';
import type { AiAppOptions } from './ai/module.js';
import { createAiRuntime } from './ai/module.js';
import { registerAiRoutes } from './ai/routes.js';
import { inventoryTools } from './ai/tools/inventory-tools.js';

export interface AppOptions {
  repository: ItemRepository;
  uomRepository: UomRepository;
  brandRepository: BrandRepository;
  packVariantRepository: PackVariantRepository;
  supplierRepository: SupplierRepository;
  purchaseRecordRepository: PurchaseRecordRepository;
  stockLocationRepository: StockLocationRepository;
  stockRepository: StockRepository;
  goodsReceiptRepository: GoodsReceiptRepository;
  purchaseOrderRepository: PurchaseOrderRepository;
  authProvider?: AuthContextProvider;
  /** Optional AI layer (ADR-0011). Omitted or disabled → no effect on any ERP route. */
  ai?: AiAppOptions;
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
  const services = {
    items: new ItemService(options.repository),
    uoms: new UomService(options.uomRepository),
    brands: new BrandService(options.brandRepository),
    packVariants: new PackVariantService(options.packVariantRepository),
    suppliers: new SupplierService(options.supplierRepository),
    purchaseRecords: new PurchaseRecordService(options.purchaseRecordRepository),
    stockLocations: new StockLocationService(options.stockLocationRepository),
    stock: new StockService(options.stockRepository),
    goodsReceipts: new GoodsReceiptService(options.goodsReceiptRepository),
    purchaseOrders: new PurchaseOrderService(options.purchaseOrderRepository),
  };
  registerItemRoutes(app, services.items, authProvider);
  registerUomRoutes(app, services.uoms, authProvider);
  registerBrandRoutes(app, services.brands, authProvider);
  registerPackVariantRoutes(app, services.packVariants, authProvider);
  registerSupplierRoutes(app, services.suppliers, authProvider);
  registerPurchaseRecordRoutes(app, services.purchaseRecords, authProvider);
  registerStockLocationRoutes(app, services.stockLocations, authProvider);
  registerStockRoutes(app, services.stock, authProvider);
  registerGoodsReceiptRoutes(app, services.goodsReceipts, authProvider);
  registerPurchaseOrderRoutes(app, services.purchaseOrders, authProvider);
  // AI tools reuse the very same service instances (ADR-0011 D-01/D-06).
  registerAiRoutes(app, createAiRuntime(options.ai, inventoryTools(services)), authProvider);
  return app;
}
