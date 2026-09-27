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
import type { StockTransferRepository } from './inventory/application/stock-transfer-repository.js';
import { StockTransferService } from './inventory/application/stock-transfer-service.js';
import { registerStockTransferRoutes } from './inventory/api/stock-transfer-routes.js';

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
  stockTransferRepository: StockTransferRepository;
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
  registerSupplierRoutes(app, new SupplierService(options.supplierRepository), authProvider);
  registerPurchaseRecordRoutes(app, new PurchaseRecordService(options.purchaseRecordRepository), authProvider);
  registerStockLocationRoutes(app, new StockLocationService(options.stockLocationRepository), authProvider);
  registerStockRoutes(app, new StockService(options.stockRepository), authProvider);
  registerGoodsReceiptRoutes(app, new GoodsReceiptService(options.goodsReceiptRepository), authProvider);
  registerPurchaseOrderRoutes(app, new PurchaseOrderService(options.purchaseOrderRepository), authProvider);
  registerStockTransferRoutes(app, new StockTransferService(options.stockTransferRepository), authProvider);
  return app;
}
