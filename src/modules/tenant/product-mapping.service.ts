import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TenantIntegration,
  IntegrationPlatform,
} from './tenant-integration.entity';
import { ProductMapping, MappingSyncStatus } from './product-mapping.entity';

@Injectable()
export class ProductMappingService {
  private readonly logger = new Logger(ProductMappingService.name);

  constructor(
    @InjectRepository(TenantIntegration)
    private readonly integrationRepo: Repository<TenantIntegration>,
    @InjectRepository(ProductMapping)
    private readonly mappingRepo: Repository<ProductMapping>,
  ) {}

  /**
   * Get all integrations for a given tenant
   */
  async getIntegrations(tenantId: string): Promise<TenantIntegration[]> {
    return this.integrationRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get a specific integration by ID
   */
  async getIntegration(id: string): Promise<TenantIntegration | null> {
    return this.integrationRepo.findOne({ where: { id } });
  }

  /**
   * Find an existing integration or create a new one (e.g. for Horoshop store)
   */
  async findOrCreateIntegration(
    tenantId: string,
    platform: IntegrationPlatform,
    name: string,
    credentials: Record<string, any> = {},
    settings: Record<string, any> = {},
  ): Promise<TenantIntegration> {
    let integration = await this.integrationRepo.findOne({
      where: { tenantId, platform },
    });

    if (!integration) {
      integration = this.integrationRepo.create({
        tenantId,
        platform,
        name,
        isActive: true,
        syncEnabled: true,
        credentials,
        settings,
      });
      await this.integrationRepo.save(integration);
      this.logger.log(
        `Created new integration [${platform}] "${name}" for tenant ${tenantId}`,
      );
    }

    return integration;
  }

  /**
   * Resolve active integration for a tenant or create a fallback one
   */
  async resolveActiveIntegration(
    tenantId: string,
    platform: IntegrationPlatform,
    integrationId?: string,
    fallback?: {
      name: string;
      credentials?: Record<string, any>;
      settings?: Record<string, any>;
    },
  ): Promise<TenantIntegration | null> {
    if (integrationId) {
      return this.getIntegration(integrationId);
    }

    const integrations = await this.getIntegrations(tenantId);
    const active = integrations.find(
      (it) => it.platform === platform && it.isActive,
    );
    if (active) {
      return active;
    }

    if (fallback) {
      return this.findOrCreateIntegration(
        tenantId,
        platform,
        fallback.name,
        fallback.credentials || {},
        fallback.settings || {},
      );
    }

    return null;
  }

  /**
   * Update integration credentials or settings
   */
  async updateIntegration(
    id: string,
    data: Partial<TenantIntegration>,
  ): Promise<TenantIntegration> {
    await this.integrationRepo.update(id, data);
    const updated = await this.getIntegration(id);
    if (!updated) {
      throw new Error(`Integration with id ${id} not found`);
    }
    return updated;
  }

  /**
   * Find product mapping by Limansoft tcod for a specific integration
   */
  async getMappingByLimanTcod(
    integrationId: string,
    limanTcod: number,
  ): Promise<ProductMapping | null> {
    return this.mappingRepo.findOne({
      where: { integrationId, limanTcod },
    });
  }

  /**
   * Find product mapping by external article/SKU for a specific integration
   */
  async getMappingByExternalArticle(
    integrationId: string,
    externalArticle: string,
  ): Promise<ProductMapping | null> {
    return this.mappingRepo.findOne({
      where: { integrationId, externalArticle: String(externalArticle).trim() },
    });
  }

  /**
   * Create or update a product mapping
   */
  async saveMapping(
    data: {
      tenantId: string;
      integrationId: string;
      limanTcod: number;
      externalArticle: string;
      externalId?: string | null;
      limanBarcode?: string | null;
      limanArticul?: string | null;
      syncStatus?: MappingSyncStatus;
      lastSyncError?: string | null;
      metadata?: Record<string, any> | null;
    },
  ): Promise<ProductMapping> {
    const existing = await this.mappingRepo.findOne({
      where: {
        integrationId: data.integrationId,
        limanTcod: data.limanTcod,
      },
    });

    if (existing) {
      existing.externalArticle = data.externalArticle;
      if (data.externalId !== undefined) existing.externalId = data.externalId;
      if (data.limanBarcode !== undefined) existing.limanBarcode = data.limanBarcode;
      if (data.limanArticul !== undefined) existing.limanArticul = data.limanArticul;
      if (data.syncStatus !== undefined) existing.syncStatus = data.syncStatus;
      if (data.lastSyncError !== undefined) existing.lastSyncError = data.lastSyncError;
      if (data.metadata !== undefined) existing.metadata = data.metadata;
      existing.lastSyncAt = new Date();
      return this.mappingRepo.save(existing);
    }

    const mapping = this.mappingRepo.create({
      ...data,
      syncStatus: data.syncStatus ?? 'synced',
      lastSyncAt: new Date(),
    });
    return this.mappingRepo.save(mapping);
  }

  /**
   * Save mappings in batch (chunked to optimize DB transactions)
   */
  async saveBatchMappings(
    items: Array<{
      tenantId: string;
      integrationId: string;
      limanTcod: number;
      externalArticle: string;
      externalId?: string | null;
      limanBarcode?: string | null;
      limanArticul?: string | null;
      syncStatus?: MappingSyncStatus;
      lastSyncError?: string | null;
      metadata?: Record<string, any> | null;
    }>,
  ): Promise<number> {
    if (!items || items.length === 0) return 0;

    let saved = 0;
    const chunkSize = 200;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      for (const item of chunk) {
        await this.saveMapping(item);
        saved++;
      }
    }
    return saved;
  }

  /**
   * Get mapping statistics for an integration
   */
  async getMappingsStats(integrationId: string): Promise<{
    total: number;
    synced: number;
    error: number;
  }> {
    const total = await this.mappingRepo.count({ where: { integrationId } });
    const synced = await this.mappingRepo.count({
      where: { integrationId, syncStatus: 'synced' },
    });
    const error = await this.mappingRepo.count({
      where: { integrationId, syncStatus: 'error' },
    });
    return { total, synced, error };
  }

  /**
   * Get all mapped Limansoft tcods as a Set for fast in-memory lookup
   */
  async getAllMappedTcods(integrationId: string): Promise<Set<number>> {
    const records = await this.mappingRepo.find({
      select: { limanTcod: true },
      where: { integrationId },
    });
    return new Set(records.map((r) => r.limanTcod));
  }
}
