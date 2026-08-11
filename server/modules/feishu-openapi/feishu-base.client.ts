import { BadRequestException, Injectable } from '@nestjs/common';
import type { BaseLinkConfig } from '@shared/api.interface';
import { FeishuOAuthService } from './feishu-oauth.service';
import { FeishuOpenApiClient } from './feishu-openapi.client';

export interface FeishuBaseRecord {
  id: string;
  record: Record<string, unknown>;
}

@Injectable()
export class FeishuBaseClient {
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly openApi: FeishuOpenApiClient,
    private readonly oauth: FeishuOAuthService,
  ) {}

  async provisionProjectBase(
    userId: string,
    name: string,
    existing: Partial<BaseLinkConfig>,
    nodeFields: Array<Record<string, unknown>>,
    edgeFields: (nodeTableId: string) => Array<Record<string, unknown>>,
    onProgress: (base: Partial<BaseLinkConfig>) => Promise<void>,
  ): Promise<BaseLinkConfig> {
    const accessToken = await this.oauth.getAccessToken(userId);
    const folderToken = process.env.PROJECT_BASE_FOLDER_TOKEN?.trim();
    if (!folderToken) {
      throw new BadRequestException(
        '服务端缺少环境变量 PROJECT_BASE_FOLDER_TOKEN',
      );
    }
    let baseToken = existing.baseToken;
    let baseUrl = existing.url;
    if (!baseToken) {
      const created = await this.openApi.request<{
        base?: {
          token?: string;
          base_token?: string;
          app_token?: string;
          url?: string;
        };
        token?: string;
        base_token?: string;
        app_token?: string;
        url?: string;
      }>(accessToken, {
        method: 'POST',
        url: '/open-apis/base/v3/bases',
        data: { name, folder_token: folderToken },
      });
      baseToken =
        created.base?.token ??
        created.base?.base_token ??
        created.base?.app_token ??
        created.token ??
        created.base_token ??
        created.app_token;
      baseUrl = created.base?.url ?? created.url;
      if (!baseToken) {
        throw new BadRequestException('飞书未返回新 Base token');
      }
      await onProgress({ baseToken, url: baseUrl });
    }
    let nodeTableId = existing.nodeTableId;
    if (!nodeTableId) {
      nodeTableId = await this.findTableId(
        accessToken,
        baseToken,
        '项目节点',
      );
      if (nodeTableId) {
        await onProgress({ baseToken, nodeTableId, url: baseUrl });
      }
    }
    if (!nodeTableId) {
      const nodeTable = await this.createTable(
        accessToken,
        baseToken,
        '项目节点',
        nodeFields,
      );
      nodeTableId = nodeTable.id;
      await onProgress({ baseToken, nodeTableId, url: baseUrl });
    }
    let edgeTableId = existing.edgeTableId;
    if (!edgeTableId) {
      edgeTableId = await this.findTableId(
        accessToken,
        baseToken,
        '项目连接关系',
      );
      if (edgeTableId) {
        await onProgress({
          baseToken,
          nodeTableId,
          edgeTableId,
          url: baseUrl,
        });
      }
    }
    if (!edgeTableId) {
      const edgeTable = await this.createTable(
        accessToken,
        baseToken,
        '项目连接关系',
        edgeFields(nodeTableId),
      );
      edgeTableId = edgeTable.id;
      await onProgress({
        baseToken,
        nodeTableId,
        edgeTableId,
        url: baseUrl,
      });
    }
    await this.ensureProjectBoard(accessToken, baseToken, nodeTableId);
    return {
      baseToken,
      nodeTableId,
      edgeTableId,
      url: baseUrl,
    };
  }

  async createProjectBase(
    userId: string,
    name: string,
    nodeFields: Array<Record<string, unknown>>,
    edgeFields: (nodeTableId: string) => Array<Record<string, unknown>>,
  ): Promise<BaseLinkConfig> {
    return this.provisionProjectBase(
      userId,
      name,
      {},
      nodeFields,
      edgeFields,
      async () => undefined,
    );
  }

  async listRecords(
    userId: string,
    baseToken: string,
    tableId: string,
  ): Promise<FeishuBaseRecord[]> {
    const accessToken = await this.oauth.getAccessToken(userId);
    const records: FeishuBaseRecord[] = [];
    let pageToken: string | undefined;
    do {
      const data = await this.openApi.request<{
        items?: Array<{ record_id: string; fields: Record<string, unknown> }>;
        has_more?: boolean;
        page_token?: string;
      }>(accessToken, {
        method: 'GET',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records`,
        params: { page_size: 200, page_token: pageToken },
      });
      records.push(
        ...(data.items ?? []).map((item) => ({
          id: item.record_id,
          record: item.fields,
        })),
      );
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return records;
  }

  async createRecord(
    userId: string,
    baseToken: string,
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    return this.enqueueWrite(`${baseToken}:${tableId}`, async () => {
      const accessToken = await this.oauth.getAccessToken(userId);
      const data = await this.openApi.request<{
        records?: Array<{ record_id: string }>;
      }>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records/batch_create`,
        data: { create_records: [fields] },
      });
      const id = data.records?.[0]?.record_id;
      if (!id) throw new BadRequestException('飞书未返回新记录 ID');
      return id;
    });
  }

  async updateRecord(
    userId: string,
    baseToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.enqueueWrite(`${baseToken}:${tableId}`, async () => {
      const accessToken = await this.oauth.getAccessToken(userId);
      await this.openApi.request<Record<string, unknown>>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records/batch_update`,
        data: {
          updates: [{ record_id: recordId, fields }],
        },
      });
    });
  }

  async deleteRecord(
    userId: string,
    baseToken: string,
    tableId: string,
    recordId: string,
  ): Promise<void> {
    await this.enqueueWrite(`${baseToken}:${tableId}`, async () => {
      const accessToken = await this.oauth.getAccessToken(userId);
      await this.openApi.request<Record<string, unknown>>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records/batch_delete`,
        data: { record_id_list: [recordId] },
      });
    });
  }

  async renameBase(
    userId: string,
    baseToken: string,
    name: string,
  ): Promise<void> {
    const accessToken = await this.oauth.getAccessToken(userId);
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'PUT',
      url: `/open-apis/base/v3/bases/${baseToken}`,
      data: { name },
    });
  }

  private async findTableId(
    accessToken: string,
    baseToken: string,
    name: string,
  ): Promise<string | undefined> {
    let pageToken: string | undefined;
    do {
      const data = await this.openApi.request<{
        items?: Array<{
          id?: string;
          table_id?: string;
          name?: string;
          table_name?: string;
        }>;
        has_more?: boolean;
        page_token?: string;
      }>(accessToken, {
        method: 'GET',
        url: `/open-apis/base/v3/bases/${baseToken}/tables`,
        params: { page_size: 100, page_token: pageToken },
      });
      const match = data.items?.find(
        (table) => (table.name ?? table.table_name) === name,
      );
      const id = match?.id ?? match?.table_id;
      if (id) return id;
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return undefined;
  }

  private async createTable(
    accessToken: string,
    baseToken: string,
    name: string,
    fields: Array<Record<string, unknown>>,
  ): Promise<{ id: string }> {
    const data = await this.openApi.request<{
      table?: { id?: string; table_id?: string };
      id?: string;
      table_id?: string;
    }>(accessToken, {
      method: 'POST',
      url: `/open-apis/base/v3/bases/${baseToken}/tables`,
      data: { name, fields },
    });
    const id =
      data.table?.id ?? data.table?.table_id ?? data.id ?? data.table_id;
    if (!id) throw new BadRequestException('飞书未返回新数据表 ID');
    return { id };
  }

  private async ensureProjectBoard(
    accessToken: string,
    baseToken: string,
    tableId: string,
  ): Promise<void> {
    const existing = await this.openApi.request<{
      items?: Array<{ id?: string; view_id?: string; name?: string }>;
    }>(accessToken, {
      method: 'GET',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/views`,
      params: { page_size: 100 },
    });
    let viewId = existing.items?.find(
      (view) => view.name === '人员分工看板',
    );
    let resolvedViewId = viewId?.id ?? viewId?.view_id;
    if (!resolvedViewId) {
      const created = await this.openApi.request<{
        view?: { id?: string; view_id?: string };
        id?: string;
        view_id?: string;
      }>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/views`,
        data: { name: '人员分工看板', type: 'kanban' },
      });
      resolvedViewId =
        created.view?.id ??
        created.view?.view_id ??
        created.id ??
        created.view_id;
    }
    if (!resolvedViewId) throw new BadRequestException('飞书未返回项目看板 ID');
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'PUT',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/views/${resolvedViewId}/group`,
      data: {
        group_config: [{ field: '任务负责人', desc: false }],
      },
    });
  }

  private enqueueWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.writeQueues.set(
      key,
      next.finally(() => {
        if (this.writeQueues.get(key) === next) this.writeQueues.delete(key);
      }),
    );
    return next;
  }
}
