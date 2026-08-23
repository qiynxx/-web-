import { BadRequestException, Injectable } from '@nestjs/common';
import type { BaseLinkConfig } from '@shared/api.interface';
import { FeishuOAuthService } from './feishu-oauth.service';
import { FeishuOpenApiClient } from './feishu-openapi.client';

export interface FeishuBaseRecord {
  id: string;
  record: Record<string, unknown>;
}

function collectBaseRecords(value: unknown): FeishuBaseRecord[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBaseRecords(item));
  }
  const object = value as Record<string, unknown>;
  if (
    Array.isArray(object.fields) &&
    object.fields.every((field) => typeof field === 'string') &&
    Array.isArray(object.data) &&
    Array.isArray(object.record_id_list)
  ) {
    const fieldNames = object.fields as string[];
    const rows = object.data as unknown[][];
    const ids = object.record_id_list as unknown[];
    return rows.flatMap((row, index) => {
      const id = ids[index];
      if (typeof id !== 'string' || !Array.isArray(row)) return [];
      return [
        {
          id,
          record: Object.fromEntries(
            fieldNames.map((field, fieldIndex) => [field, row[fieldIndex]]),
          ),
        },
      ];
    });
  }
  const fields =
    object.fields && typeof object.fields === 'object'
      ? (object.fields as Record<string, unknown>)
      : object.record &&
          typeof object.record === 'object' &&
          !Array.isArray(object.record)
        ? (object.record as Record<string, unknown>)
        : undefined;
  const id =
    typeof object.record_id === 'string'
      ? object.record_id
      : fields && typeof object.id === 'string'
        ? object.id
        : undefined;
  if (id && fields) return [{ id, record: fields }];
  return ['items', 'records', 'record', 'data'].flatMap((key) =>
    collectBaseRecords(object[key]),
  );
}

function findCreatedRecordId(
  value: unknown,
  allowGenericId = false,
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => findCreatedRecordId(item, allowGenericId))
      .find(Boolean);
  }
  const object = value as Record<string, unknown>;
  if (typeof object.record_id === 'string') return object.record_id;
  if (Array.isArray(object.record_id_list)) {
    const id = object.record_id_list.find(
      (recordId): recordId is string => typeof recordId === 'string',
    );
    if (id) return id;
  }
  if (allowGenericId && typeof object.id === 'string') return object.id;
  for (const key of ['record', 'records', 'items', 'data']) {
    const id = findCreatedRecordId(object[key], key !== 'data');
    if (id) return id;
  }
  return undefined;
}

function isAlreadyDeletedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not[_ ]found|does not exist|不存在|1061001/i.test(message);
}

@Injectable()
export class FeishuBaseClient {
  private readonly ensuredFieldSets = new Set<string>();
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
      nodeTableId = await this.findTableId(accessToken, baseToken, '项目节点');
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
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'PATCH',
      url: `/open-apis/drive/v1/permissions/${baseToken}/public`,
      params: { type: 'bitable' },
      data: {
        external_access: false,
        invite_external: false,
        link_share_entity: 'tenant_editable',
        share_entity: 'same_tenant',
      },
    });
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
        items?: Array<{
          record_id?: string;
          id?: string;
          fields?: Record<string, unknown>;
          record?: Record<string, unknown>;
        }>;
        records?: Array<{
          record_id?: string;
          id?: string;
          fields?: Record<string, unknown>;
          record?: Record<string, unknown>;
        }>;
        has_more?: boolean;
        page_token?: string;
      }>(accessToken, {
        method: 'GET',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records`,
        params: { page_size: 200, page_token: pageToken },
      });
      const page = collectBaseRecords(data);
      records.push(...page);
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return records;
  }

  async createSingleRecord(
    userId: string,
    baseToken: string,
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    return this.enqueueWrite(`${baseToken}:${tableId}`, async () => {
      const accessToken = await this.oauth.getAccessToken(userId);
      const data = await this.openApi.request<unknown>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records`,
        data: fields,
      });
      const id = findCreatedRecordId(data, true);
      if (!id) throw new BadRequestException('飞书未返回新目录记录 ID');
      return id;
    });
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
        records?: Array<{ record_id?: string; id?: string }>;
        items?: Array<{ record_id?: string; id?: string }>;
        record?: { record_id?: string; id?: string };
      }>(accessToken, {
        method: 'POST',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/records/batch_create`,
        data: { create_records: [fields] },
      });
      const id = findCreatedRecordId(data);
      if (id) return id;
      const records = await this.listRecords(userId, baseToken, tableId);
      const uniqueField = ['节点ID', '连线ID'].find(
        (name) => typeof fields[name] === 'string' && fields[name],
      );
      const recovered = uniqueField
        ? records.find(
            (record) => record.record[uniqueField] === fields[uniqueField],
          )?.id
        : undefined;
      if (!recovered) throw new BadRequestException('飞书未返回新记录 ID');
      return recovered;
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
          update_records: {
            [recordId]: fields,
          },
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

  async ensureSelectOptions(
    userId: string,
    baseToken: string,
    tableId: string,
    fieldName: string,
    requiredOptions: Array<Record<string, unknown> & { name: string }>,
  ): Promise<void> {
    return this.enqueueWrite(
      `schema:${baseToken}:${tableId}:${fieldName}`,
      () =>
        this.ensureSelectOptionsUnlocked(
          userId,
          baseToken,
          tableId,
          fieldName,
          requiredOptions,
        ),
    );
  }

  private async ensureSelectOptionsUnlocked(
    userId: string,
    baseToken: string,
    tableId: string,
    fieldName: string,
    requiredOptions: Array<Record<string, unknown> & { name: string }>,
  ): Promise<void> {
    const accessToken = await this.oauth.getAccessToken(userId);
    const data = await this.openApi.request<{
      items?: Array<{
        id?: string;
        field_id?: string;
        name?: string;
        field_name?: string;
        type?: string;
        multiple?: boolean;
        options?: Array<Record<string, unknown> & { name?: string }>;
      }>;
      fields?: Array<{
        id?: string;
        field_id?: string;
        name?: string;
        field_name?: string;
        type?: string;
        multiple?: boolean;
        options?: Array<Record<string, unknown> & { name?: string }>;
      }>;
    }>(accessToken, {
      method: 'GET',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields`,
      params: { page_size: 200 },
    });
    const field = (data.items ?? data.fields ?? []).find(
      (item) => (item.name ?? item.field_name) === fieldName,
    );
    const fieldId = field?.id ?? field?.field_id;
    if (!field || !fieldId || field.type !== 'select') return;
    const currentOptions = field.options ?? [];
    const existingNames = new Set(currentOptions.map((option) => option.name));
    const missingOptions = requiredOptions.filter(
      (option) => !existingNames.has(option.name),
    );
    if (missingOptions.length === 0) return;
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'PUT',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields/${fieldId}`,
      data: {
        name: fieldName,
        type: 'select',
        multiple: Boolean(field.multiple),
        options: [...currentOptions, ...missingOptions],
      },
    });
  }

  async ensureFields(
    userId: string,
    baseToken: string,
    tableId: string,
    requiredFields: Array<Record<string, unknown> & { name: string }>,
  ): Promise<void> {
    const cacheKey = `${baseToken}:${tableId}:${requiredFields
      .map((field) => field.name)
      .sort()
      .join(',')}`;
    if (this.ensuredFieldSets.has(cacheKey)) return;
    await this.enqueueWrite(`fields:${baseToken}:${tableId}`, async () => {
      if (this.ensuredFieldSets.has(cacheKey)) return;
      const accessToken = await this.oauth.getAccessToken(userId);
      const existing = await this.openApi.request<{
        items?: Array<{ field_name?: string; name?: string }>;
        fields?: Array<{ field_name?: string; name?: string }>;
      }>(accessToken, {
        method: 'GET',
        url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields`,
        params: { page_size: 200 },
      });
      const existingNames = new Set(
        (existing.items ?? existing.fields ?? []).map(
          (field) => field.field_name ?? field.name,
        ),
      );
      for (const field of requiredFields) {
        if (existingNames.has(field.name)) continue;
        await this.openApi.request<Record<string, unknown>>(accessToken, {
          method: 'POST',
          url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields`,
          data: field,
        });
      }
      this.ensuredFieldSets.add(cacheKey);
    });
  }

  async ensureUrlField(
    userId: string,
    baseToken: string,
    tableId: string,
    fieldName: string,
  ): Promise<void> {
    const accessToken = await this.oauth.getAccessToken(userId);
    const existing = await this.openApi.request<{
      items?: Array<{ field_name?: string; name?: string }>;
      fields?: Array<{ field_name?: string; name?: string }>;
    }>(accessToken, {
      method: 'GET',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields`,
      params: { page_size: 200 },
    });
    const fields = existing.items ?? existing.fields ?? [];
    if (
      fields.some((field) => (field.field_name ?? field.name) === fieldName)
    ) {
      return;
    }
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'POST',
      url: `/open-apis/base/v3/bases/${baseToken}/tables/${tableId}/fields`,
      data: { name: fieldName, type: 'text', style: { type: 'url' } },
    });
  }

  async deleteBase(userId: string, baseToken: string): Promise<void> {
    const accessToken = await this.oauth.getAccessToken(userId);
    let taskId: string | undefined;
    try {
      const deleted = await this.openApi.request<{
        task_id?: string;
        data?: { task_id?: string };
      }>(accessToken, {
        method: 'DELETE',
        url: `/open-apis/drive/v1/files/${baseToken}`,
        params: { type: 'bitable', async: true },
      });
      taskId = deleted.task_id ?? deleted.data?.task_id;
    } catch (error: unknown) {
      if (isAlreadyDeletedError(error)) return;
      throw error;
    }
    if (!taskId) return;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const task = await this.openApi.request<{
        status?: string;
        job_status?: string;
        data?: { status?: string; job_status?: string };
      }>(accessToken, {
        method: 'GET',
        url: '/open-apis/drive/v1/files/task_check',
        params: { task_id: taskId },
      });
      const status =
        task.status ??
        task.job_status ??
        task.data?.status ??
        task.data?.job_status;
      if (['success', 'succeeded', 'done', 'finished'].includes(status ?? ''))
        return;
      if (['failed', 'error', 'cancelled'].includes(status ?? '')) {
        throw new BadRequestException(`飞书 Base 删除失败: ${status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new BadRequestException('飞书 Base 删除超时，请稍后重试');
  }

  async renameBase(
    userId: string,
    baseToken: string,
    name: string,
  ): Promise<void> {
    const accessToken = await this.oauth.getAccessToken(userId);
    await this.openApi.request<Record<string, unknown>>(accessToken, {
      method: 'PATCH',
      url: `/open-apis/drive/v1/files/${baseToken}`,
      params: { type: 'bitable' },
      data: { new_title: name },
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
          table?: {
            id?: string;
            table_id?: string;
            name?: string;
            table_name?: string;
          };
        }>;
        tables?: Array<{
          id?: string;
          table_id?: string;
          name?: string;
          table_name?: string;
        }>;
        table?: {
          items?: Array<{
            id?: string;
            table_id?: string;
            name?: string;
            table_name?: string;
          }>;
        };
        has_more?: boolean;
        page_token?: string;
      }>(accessToken, {
        method: 'GET',
        url: `/open-apis/base/v3/bases/${baseToken}/tables`,
        params: { page_size: 100, page_token: pageToken },
      });
      type TableResource = {
        id?: string;
        table_id?: string;
        name?: string;
        table_name?: string;
      };
      type TableItem = TableResource & { table?: TableResource };
      const tables = (data.items ??
        data.tables ??
        data.table?.items ??
        []) as TableItem[];
      const match = tables.find((table) => {
        const resource = table.table;
        return (
          (resource?.name ??
            resource?.table_name ??
            table.name ??
            table.table_name) === name
        );
      });
      const resource = match?.table;
      const id =
        resource?.id ?? resource?.table_id ?? match?.id ?? match?.table_id;
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
    let viewId = existing.items?.find((view) => view.name === '人员分工看板');
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

  private enqueueWrite<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
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
