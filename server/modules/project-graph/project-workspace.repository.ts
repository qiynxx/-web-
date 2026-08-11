import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/nestjs-datapaas';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { projectWorkspace } from '@server/database/project-storage.schema';
import type {
  BaseLinkConfig,
  ProjectWorkspace,
} from '@shared/api.interface';

export interface ProvisioningWorkspace {
  id: string;
  code: string;
  name: string;
  description: string;
  creatorUserId: string;
  provisioningStatus: string;
  provisioningError?: string;
  base?: Partial<BaseLinkConfig>;
  catalogRecordId?: string;
}

@Injectable()
export class ProjectWorkspaceRepository {
  constructor(
    @Optional()
    @Inject(DRIZZLE_DATABASE)
    private readonly db?: PostgresJsDatabase,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.db);
  }

  async listReady(): Promise<ProjectWorkspace[]> {
    const rows = await this.requireDatabase()
      .select()
      .from(projectWorkspace)
      .where(eq(projectWorkspace.provisioningStatus, 'ready'))
      .orderBy(asc(projectWorkspace.createdAt));
    return rows.flatMap((row) => {
      if (!row.baseToken || !row.nodeTableId || !row.edgeTableId) return [];
      return [
        {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          status: toStatus(row.status),
          sort: row.createdAt,
          source: 'linked-base' as const,
          base: {
            baseToken: row.baseToken,
            nodeTableId: row.nodeTableId,
            edgeTableId: row.edgeTableId,
            url: row.baseUrl ?? undefined,
          },
          writable: true,
          updatedAt: new Date(row.updatedAt).toISOString(),
        },
      ];
    });
  }

  async findOrCreate(
    name: string,
    description: string,
    creatorUserId: string,
  ): Promise<ProvisioningWorkspace> {
    const normalizedName = normalizeName(name);
    const db = this.requireDatabase();
    const [existing] = await db
      .select()
      .from(projectWorkspace)
      .where(eq(projectWorkspace.normalizedName, normalizedName))
      .limit(1);
    if (existing) return mapProvisioning(existing);

    const now = Date.now();
    const id = randomUUID();
    const code = `${normalizedName.replace(/\s+/g, '-').slice(0, 40) || 'project'}-${id.slice(0, 8)}`;
    await db
      .insert(projectWorkspace)
      .values({
        id,
        code,
        normalizedName,
        name,
        description,
        creatorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: projectWorkspace.normalizedName });
    const [created] = await db
      .select()
      .from(projectWorkspace)
      .where(eq(projectWorkspace.normalizedName, normalizedName))
      .limit(1);
    if (!created) throw new Error('项目目录记录创建失败');
    return mapProvisioning(created);
  }

  async saveProvisioningProgress(
    id: string,
    base: Partial<BaseLinkConfig>,
  ): Promise<void> {
    await this.requireDatabase()
      .update(projectWorkspace)
      .set({
        ...(base.baseToken ? { baseToken: base.baseToken } : {}),
        ...(base.nodeTableId ? { nodeTableId: base.nodeTableId } : {}),
        ...(base.edgeTableId ? { edgeTableId: base.edgeTableId } : {}),
        ...(base.url ? { baseUrl: base.url } : {}),
        provisioningStatus: 'creating',
        provisioningError: null,
        updatedAt: Date.now(),
      })
      .where(eq(projectWorkspace.id, id));
  }

  async saveBase(id: string, base: BaseLinkConfig): Promise<void> {
    await this.requireDatabase()
      .update(projectWorkspace)
      .set({
        baseToken: base.baseToken,
        nodeTableId: base.nodeTableId,
        edgeTableId: base.edgeTableId,
        baseUrl: base.url,
        provisioningStatus: 'ready',
        provisioningError: null,
        catalogSyncStatus: 'pending',
        updatedAt: Date.now(),
      })
      .where(eq(projectWorkspace.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.requireDatabase()
      .update(projectWorkspace)
      .set({
        provisioningStatus: 'failed',
        provisioningError: error.slice(0, 2_000),
        updatedAt: Date.now(),
      })
      .where(eq(projectWorkspace.id, id));
  }

  async markCatalogSynced(id: string, catalogRecordId: string): Promise<void> {
    await this.requireDatabase()
      .update(projectWorkspace)
      .set({
        catalogRecordId,
        catalogSyncStatus: 'synced',
        updatedAt: Date.now(),
      })
      .where(eq(projectWorkspace.id, id));
  }

  async rename(id: string, name: string): Promise<void> {
    await this.requireDatabase()
      .update(projectWorkspace)
      .set({
        name,
        normalizedName: normalizeName(name),
        catalogSyncStatus: 'pending',
        updatedAt: Date.now(),
      })
      .where(eq(projectWorkspace.id, id));
  }
  private requireDatabase(): PostgresJsDatabase {
    if (!this.db) throw new Error('妙搭数据库未启用');
    return this.db;
  }
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase();
}

function mapProvisioning(
  row: typeof projectWorkspace.$inferSelect,
): ProvisioningWorkspace {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    creatorUserId: row.creatorUserId,
    provisioningStatus: row.provisioningStatus,
    provisioningError: row.provisioningError ?? undefined,
    base: row.baseToken
      ? {
          baseToken: row.baseToken,
          nodeTableId: row.nodeTableId ?? undefined,
          edgeTableId: row.edgeTableId ?? undefined,
          url: row.baseUrl ?? undefined,
        }
      : undefined,
    catalogRecordId: row.catalogRecordId ?? undefined,
  };
}

function toStatus(value: string): ProjectWorkspace['status'] {
  return value === 'active' || value === 'paused' || value === 'archived'
    ? value
    : 'planned';
}
