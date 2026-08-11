import { FeishuBaseClient } from './feishu-base.client';
import type { FeishuOpenApiClient } from './feishu-openapi.client';
import type { FeishuOAuthService } from './feishu-oauth.service';

describe('FeishuBaseClient', () => {
  it('provisions a Base when create returns top-level app_token', async () => {
    const previousFolderToken = process.env.PROJECT_BASE_FOLDER_TOKEN;
    process.env.PROJECT_BASE_FOLDER_TOKEN = 'folder-token';
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        app_token: 'base-token',
        url: 'https://example.feishu.cn/base/base-token',
      })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ table_id: 'node-table' })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ id: 'edge-table' })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ view_id: 'board-view' })
      .mockResolvedValueOnce({});
    const openApi = { request } as unknown as FeishuOpenApiClient;
    const oauth = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    } as unknown as FeishuOAuthService;
    const client = new FeishuBaseClient(openApi, oauth);
    const progress: Array<Record<string, unknown>> = [];

    const result = await client.provisionProjectBase(
      'user-id',
      'E2E project',
      {},
      [{ field_name: '节点名称', type: 1 }],
      () => [{ field_name: '连接名称', type: 1 }],
      async (value) => {
        progress.push(value);
      },
    );

    expect(result).toEqual({
      baseToken: 'base-token',
      nodeTableId: 'node-table',
      edgeTableId: 'edge-table',
      url: 'https://example.feishu.cn/base/base-token',
    });
    expect(progress).toEqual([
      {
        baseToken: 'base-token',
        url: 'https://example.feishu.cn/base/base-token',
      },
      {
        baseToken: 'base-token',
        nodeTableId: 'node-table',
        url: 'https://example.feishu.cn/base/base-token',
      },
      {
        baseToken: 'base-token',
        nodeTableId: 'node-table',
        edgeTableId: 'edge-table',
        url: 'https://example.feishu.cn/base/base-token',
      },
    ]);
    if (previousFolderToken === undefined) {
      delete process.env.PROJECT_BASE_FOLDER_TOKEN;
    } else {
      process.env.PROJECT_BASE_FOLDER_TOKEN = previousFolderToken;
    }
  });

  it('recovers an existing table before creating the next table', async () => {
    const previousFolderToken = process.env.PROJECT_BASE_FOLDER_TOKEN;
    process.env.PROJECT_BASE_FOLDER_TOKEN = 'folder-token';
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        tables: [{ table_id: 'node-table', table_name: '项目节点' }],
      })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ table_id: 'edge-table' })
      .mockResolvedValueOnce({
        items: [{ view_id: 'board-view', name: '人员分工看板' }],
      })
      .mockResolvedValueOnce({});
    const openApi = { request } as unknown as FeishuOpenApiClient;
    const oauth = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    } as unknown as FeishuOAuthService;
    const client = new FeishuBaseClient(openApi, oauth);
    const progress: Array<Record<string, unknown>> = [];

    const result = await client.provisionProjectBase(
      'user-id',
      'E2E project',
      {
        baseToken: 'base-token',
        url: 'https://example.feishu.cn/base/base-token',
      },
      [],
      () => [],
      async (value) => {
        progress.push(value);
      },
    );

    expect(result.nodeTableId).toBe('node-table');
    expect(result.edgeTableId).toBe('edge-table');
    expect(progress[0]).toMatchObject({ nodeTableId: 'node-table' });
    expect(
      request.mock.calls.filter(
        ([, config]) => config.method === 'POST' && config.url.endsWith('/tables'),
      ),
    ).toHaveLength(1);
    if (previousFolderToken === undefined) {
      delete process.env.PROJECT_BASE_FOLDER_TOKEN;
    } else {
      process.env.PROJECT_BASE_FOLDER_TOKEN = previousFolderToken;
    }
  });

  it('parses a created record ID from top-level items', async () => {
    const request = jest.fn().mockResolvedValueOnce({
      data: { items: [{ record_id: 'record-id' }] },
    });
    const openApi = { request } as unknown as FeishuOpenApiClient;
    const oauth = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    } as unknown as FeishuOAuthService;
    const client = new FeishuBaseClient(openApi, oauth);

    await expect(
      client.createRecord('user-id', 'base-token', 'table-id', {
        节点ID: 'business-node-id',
      }),
    ).resolves.toBe('record-id');
  });

  it('recovers a created record by its business ID when response omits ID', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        fields: ['节点ID'],
        data: [['business-node-id']],
        record_id_list: ['recovered-record-id'],
      });
    const openApi = { request } as unknown as FeishuOpenApiClient;
    const oauth = {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    } as unknown as FeishuOAuthService;
    const client = new FeishuBaseClient(openApi, oauth);

    await expect(
      client.createRecord('user-id', 'base-token', 'table-id', {
        节点ID: 'business-node-id',
      }),
    ).resolves.toBe('recovered-record-id');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
