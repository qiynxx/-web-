import { execFile } from 'node:child_process';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

export interface LarkCliRecord {
  id: string;
  record: Record<string, unknown>;
}

export interface LarkCliWikiBase {
  baseToken: string;
  nodeToken: string;
  url: string;
}

export interface LarkCliTable {
  id: string;
  name: string;
}

export interface LarkCliView {
  id: string;
  name: string;
  type: string;
}

interface LarkCliEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: number | string;
    message?: string;
    hint?: string;
  };
}

interface RecordListData {
  data?: unknown[][];
  fields?: string[];
  has_more?: boolean;
  record_id_list?: string[];
}

@Injectable()
export class LarkCliBaseClient {
  private readonly logger = new Logger(LarkCliBaseClient.name);
  private readonly executable = process.env.LARK_CLI_BIN?.trim() || 'lark-cli';

  isEnabled(): boolean {
    return process.env.PROJECT_GRAPH_STORAGE_MODE === 'lark-cli';
  }

  async createWikiBase(
    parentNodeToken: string,
    title: string,
  ): Promise<LarkCliWikiBase> {
    const data = await this.run<{
      node_token: string;
      obj_token: string;
      url: string;
    }>([
      'wiki',
      '+node-create',
      '--parent-node-token',
      parentNodeToken,
      '--obj-type',
      'bitable',
      '--title',
      title,
      '--as',
      'user',
      '--format',
      'json',
    ]);
    if (!data.obj_token || !data.node_token || !data.url) {
      throw new Error('飞书未返回新项目文档的完整 token 或链接');
    }
    return {
      baseToken: data.obj_token,
      nodeToken: data.node_token,
      url: data.url,
    };
  }

  async listTables(baseToken: string): Promise<LarkCliTable[]> {
    const data = await this.run<{
      tables?: Array<{ id: string; name: string }>;
    }>([
      'base',
      '+table-list',
      '--base-token',
      baseToken,
      '--offset',
      '0',
      '--limit',
      '100',
      '--as',
      'user',
      '--format',
      'json',
    ]);
    return data.tables ?? [];
  }

  async renameTable(
    baseToken: string,
    tableId: string,
    name: string,
  ): Promise<void> {
    await this.run(
      [
        'base',
        '+table-update',
        '--base-token',
        baseToken,
        '--table-id',
        tableId,
        '--name',
        name,
        '--as',
        'user',
        '--format',
        'json',
      ],
      { allowNoOperation: true },
    );
  }

  async renameBitable(baseToken: string, name: string): Promise<void> {
    await this.run(
      [
        'drive',
        'files',
        'patch',
        '--file-token',
        baseToken,
        '--type',
        'bitable',
        '--data',
        JSON.stringify({ new_title: name }),
        '--as',
        'user',
        '--format',
        'json',
      ],
      { allowNoOperation: true },
    );
  }

  async createTable(
    baseToken: string,
    name: string,
    fields: Array<Record<string, unknown>>,
  ): Promise<LarkCliTable> {
    const data = await this.run<{
      table?: { id: string; name: string };
    }>([
      'base',
      '+table-create',
      '--base-token',
      baseToken,
      '--name',
      name,
      '--fields',
      JSON.stringify(fields),
      '--as',
      'user',
      '--format',
      'json',
    ]);
    if (!data.table?.id) {
      throw new Error(`飞书未返回“${name}”的数据表 ID`);
    }
    return data.table;
  }

  async createView(
    baseToken: string,
    tableId: string,
    name: string,
    type: 'grid' | 'kanban' | 'gallery' | 'calendar' | 'gantt',
  ): Promise<LarkCliView> {
    const data = await this.run<{
      views?: Array<{ id: string; name: string; type: string }>;
    }>([
      'base',
      '+view-create',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify({ name, type }),
      '--as',
      'user',
      '--format',
      'json',
    ]);
    const view = data.views?.[0];
    if (!view?.id) {
      throw new Error(`飞书未返回“${name}”的视图 ID`);
    }
    return view;
  }

  async setViewGroup(
    baseToken: string,
    tableId: string,
    viewId: string,
    field: string,
  ): Promise<void> {
    await this.run(
      [
        'base',
        '+view-set-group',
        '--base-token',
        baseToken,
        '--table-id',
        tableId,
        '--view-id',
        viewId,
        '--json',
        JSON.stringify({ group_config: [{ field, desc: false }] }),
        '--as',
        'user',
        '--format',
        'json',
      ],
      { allowNoOperation: true },
    );
  }

  async setViewVisibleFields(
    baseToken: string,
    tableId: string,
    viewId: string,
    visibleFields: string[],
  ): Promise<void> {
    await this.run(
      [
        'base',
        '+view-set-visible-fields',
        '--base-token',
        baseToken,
        '--table-id',
        tableId,
        '--view-id',
        viewId,
        '--json',
        JSON.stringify({ visible_fields: visibleFields }),
        '--as',
        'user',
        '--format',
        'json',
      ],
      { allowNoOperation: true },
    );
  }

  async listRecords(
    baseToken: string,
    tableId: string,
  ): Promise<LarkCliRecord[]> {
    const records: LarkCliRecord[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const data = await this.run<RecordListData>([
        'base',
        '+record-list',
        '--base-token',
        baseToken,
        '--table-id',
        tableId,
        '--offset',
        String(offset),
        '--limit',
        '200',
        '--as',
        'user',
        '--format',
        'json',
      ]);
      const page = recordsFromMatrix(data);
      records.push(...page);
      hasMore = Boolean(data.has_more && page.length > 0);
      if (hasMore) {
        offset += page.length;
      }
    }
    return records;
  }

  async createRecord(
    baseToken: string,
    tableId: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    const data = await this.run<{
      record_id_list?: string[];
      records?: Array<{ id?: string; record_id?: string }>;
    }>([
      'base',
      '+record-batch-create',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify({ create_records: [record] }),
      '--as',
      'user',
      '--format',
      'json',
    ]);
    const recordId =
      data.record_id_list?.[0] ??
      data.records?.[0]?.id ??
      data.records?.[0]?.record_id;
    if (!recordId) {
      throw new Error('飞书未返回新记录 ID');
    }
    return recordId;
  }

  async updateRecord(
    baseToken: string,
    tableId: string,
    recordId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    await this.run(
      [
        'base',
        '+record-batch-update',
        '--base-token',
        baseToken,
        '--table-id',
        tableId,
        '--json',
        JSON.stringify({ update_records: { [recordId]: record } }),
        '--as',
        'user',
        '--format',
        'json',
      ],
      { allowNoOperation: true },
    );
  }

  async deleteRecord(
    baseToken: string,
    tableId: string,
    recordId: string,
  ): Promise<void> {
    await this.run([
      'base',
      '+record-delete',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--record-id',
      recordId,
      '--yes',
      '--as',
      'user',
      '--format',
      'json',
    ]);
  }

  private async run<T = Record<string, unknown>>(
    args: string[],
    options?: { allowNoOperation?: boolean },
  ): Promise<T> {
    const { stdout, stderr } = await executeFile(this.executable, args);
    let envelope: LarkCliEnvelope<T>;
    try {
      envelope = JSON.parse(stdout) as LarkCliEnvelope<T>;
    } catch {
      this.logger.error(
        `lark-cli returned invalid JSON for ${args.slice(0, 2).join(' ')}: ${stdout.slice(0, 500)}`,
      );
      throw new Error(stderr.trim() || 'lark-cli 返回了无法解析的结果');
    }
    if (!envelope.ok) {
      if (options?.allowNoOperation && isNoOperationEnvelope(envelope)) {
        this.logger.debug(
          `lark-cli ${args.slice(0, 2).join(' ')} already matches the requested state`,
        );
        return undefined as T;
      }
      throw createLarkCliException(envelope.error, stderr.trim());
    }
    if (!envelope.data) {
      throw new Error('lark-cli 操作成功但未返回数据');
    }
    return envelope.data;
  }
}

export function isNoOperationEnvelope(
  envelope: Pick<LarkCliEnvelope<unknown>, 'ok' | 'error'>,
): boolean {
  return (
    !envelope.ok &&
    (String(envelope.error?.code ?? '') === '800070003' ||
      envelope.error?.message === 'no operation produced')
  );
}

export function createLarkCliException(
  error?: LarkCliEnvelope<unknown>['error'],
  fallback = '',
): BadRequestException | ForbiddenException {
  const code = String(error?.code ?? '').trim();
  const message = error?.message?.trim() || fallback || 'lark-cli 操作失败';
  const hint = error?.hint?.trim();
  const detail = hint && hint !== message ? `${message}；${hint}` : message;
  const normalized = `${code} ${detail}`.toLowerCase();
  if (
    normalized.includes('permission') ||
    normalized.includes('forbidden') ||
    normalized.includes('not authorized') ||
    normalized.includes('91403') ||
    detail.includes('权限')
  ) {
    return new ForbiddenException(
      `飞书操作权限不足${code ? `（${code}）` : ''}: ${detail}`,
    );
  }
  return new BadRequestException(
    `飞书 Base 操作失败${code ? `（${code}）` : ''}: ${detail}`,
  );
}

export function recordsFromMatrix(data: RecordListData): LarkCliRecord[] {
  const fields = data.fields ?? [];
  const rows = data.data ?? [];
  const recordIds = data.record_id_list ?? [];
  return recordIds.map((id, rowIndex) => {
    const row = rows[rowIndex] ?? [];
    const record = Object.fromEntries(
      fields.map((field, fieldIndex) => [field, row[fieldIndex] ?? null]),
    );
    return { id, record };
  });
}

function executeFile(
  executable: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          // lark-cli returns structured JSON on stdout for API failures while
          // also exiting non-zero. Let run() parse that envelope so callers get
          // the real Feishu code/message instead of a generic HTTP 500.
          if (stdout.trim()) {
            resolve({ stdout, stderr });
            return;
          }
          reject(
            new Error(stderr.trim() || stdout.trim() || error.message, {
              cause: error,
            }),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}
