import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type {
  AuthNPaasService,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { ProjectGraphService } from './project-graph.service';

const NODE_PLUGIN_ID = 'project_graph_node_crud_1';
const EDGE_PLUGIN_ID = 'project_graph_connection_bitable_crud_1';

function nodeRecord(
  id: string,
  stableId: string,
  ownerId: number,
  group = '软件算法',
  type = '软件',
) {
  return {
    id,
    record: {
      '节点名称': { text: stableId },
      '节点ID': stableId,
      '副标题': '',
      '分组': group,
      '节点类型': type,
      '状态': '正常推进',
      '负责人': [ownerId],
      '进度': 20,
      '版本/分支': 'main',
      '日期': Date.UTC(2026, 7, 4),
      '标签': '',
      '工作内容': '',
      '下一步': '',
      '风险/阻塞': '',
      '图片URL': '',
      '父节点': [],
    },
  };
}

function createService(options?: { denyMessage?: string }) {
  const calls: Array<{
    pluginId: string;
    action: string;
    input: Record<string, unknown>;
  }> = [];
  const nodes = [
    nodeRecord('rec_node_1', 'stable-1', 101),
    nodeRecord('rec_node_2', 'stable-2', 202),
    nodeRecord('rec_node_3', 'stable-3', 303, '联调测试', '硬件'),
  ];
  const edges = [
    {
      id: 'rec_edge_1',
      record: {
        '连接ID': 'stable-edge-1',
        '连接类型': '跨节点',
        '来源节点': [{ id: 'rec_node_1' }],
        '目标节点': [{ id: 'rec_node_2' }],
        '标签': '依赖',
        '关键链路': true,
      },
    },
    {
      id: 'rec_edge_2',
      record: {
        '连接ID': 'stable-edge-2',
        '连接类型': '跨节点',
        '来源节点': [{ id: 'rec_node_1' }],
        '目标节点': [{ id: 'rec_node_3' }],
        '标签': '关联 A',
        '关键链路': false,
      },
    },
    {
      id: 'rec_edge_3',
      record: {
        '连接ID': 'stable-edge-3',
        '连接类型': '跨节点',
        '来源节点': [{ id: 'rec_node_2' }],
        '目标节点': [{ id: 'rec_node_3' }],
        '标签': '关联 B',
        '关键链路': false,
      },
    },
  ];
  const capabilityService = {
    load: (pluginId: string) => ({
      call: async (action: string, input: Record<string, unknown>) => {
        calls.push({ pluginId, action, input });
        if (options?.denyMessage) throw new Error(options.denyMessage);
        if (action === 'searchRecords') {
          return {
            hasMore: false,
            records: pluginId === NODE_PLUGIN_ID ? nodes : edges,
          };
        }
        if (action === 'batchAddRecords') {
          return { records: [{ id: 'rec_created' }] };
        }
        return { success: true, records: [] };
      },
    }),
  } as unknown as CapabilityService;
  const authnService = {
    getBatchLarkUserIds: jest.fn(async (ids: string[]) =>
      ids.map((id) => `employee-${id}`),
    ),
  } as unknown as AuthNPaasService;
  return {
    calls,
    service: new ProjectGraphService(capabilityService, authnService),
  };
}

describe('ProjectGraphService Base channel', () => {
  it('reads record IDs, linked records, dates and converted personnel IDs', async () => {
    const { service } = createService();

    const graph = await service.getGraph();

    expect(graph.writable).toBe(true);
    expect(graph.nodes[0]).toMatchObject({
      id: 'rec_node_1',
      date: '2026-08-04',
      owner: {
        apaasUserId: '101',
        larkUserId: 'employee-101',
      },
    });
    expect(graph.edges[0]).toMatchObject({
      id: 'rec_edge_1',
      source: 'rec_node_1',
      target: 'rec_node_2',
      kind: 'tree',
    });
    expect(graph.nodes[1].linkedIds).toEqual(['rec_node_1']);
    expect(graph.nodes[2]).toMatchObject({
      id: 'rec_node_3',
      lane: 'integration',
      kind: 'hardware',
      linkedIds: [],
    });
    expect(graph.edges.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rec_edge_2', kind: 'cross' }),
        expect.objectContaining({ id: 'rec_edge_3', kind: 'cross' }),
      ]),
    );
  });

  it('updates a displayed record ID with a real user field and epoch date', async () => {
    const { calls, service } = createService();

    await service.updateNode('rec_node_1', {
      owner: {
        apaasUserId: '303',
        larkUserId: 'employee-303',
        openId: 'ou_303',
        name: '张三',
      },
      date: '2026-08-04',
    });

    const update = calls.find((call) => call.action === 'batchUpdateRecords');
    expect(update?.pluginId).toBe(NODE_PLUGIN_ID);
    expect(update?.input).toEqual({
      records: [
        {
          id: 'rec_node_1',
          record: {
            '负责人ID': [303],
            '日期': Date.UTC(2026, 7, 4),
          },
        },
      ],
    });
  });

  it('accepts the stable node ID while updating the real Base record ID', async () => {
    const { calls, service } = createService();

    await service.updateNode('stable-1', { title: '已更新' });

    const update = calls.find((call) => call.action === 'batchUpdateRecords');
    expect(update?.input).toEqual({
      records: [
        {
          id: 'rec_node_1',
          record: { '节点名称': '已更新' },
        },
      ],
    });
  });

  it('creates every supported node field with Base-compatible values', async () => {
    const { calls, service } = createService();

    await service.createNode({
      title: '新节点',
      subtitle: '副标题',
      lane: 'software',
      kind: 'software',
      status: 'active',
      owner: { apaasUserId: '303', name: '张三' },
      progress: 40,
      version: 'feature/base-writeback',
      date: '2026-08-05',
      x: 0,
      y: 0,
      tags: ['Base', '人员'],
      summary: '接通写回',
      nextAction: '线上验证',
      risks: ['权限'],
      linkedIds: ['rec_node_1'],
      imageUrl: 'https://example.com/image.png',
    });

    const creation = calls.find(
      (call) =>
        call.pluginId === NODE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(creation?.input).toEqual({
      records: [
        {
          record: expect.objectContaining({
            '节点名称': '新节点',
            '副标题': '副标题',
            '分组': '软件算法',
            '节点类型': '软件',
            '负责人ID': [303],
            '日期': Date.UTC(2026, 7, 5),
            '标签': 'Base，人员',
            '图片URL': 'https://example.com/image.png',
          }),
        },
      ],
    });
    const parentEdgeCreation = calls.find(
      (call) =>
        call.pluginId === EDGE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(parentEdgeCreation?.input).toEqual({
      records: [
        {
          record: expect.objectContaining({
            '来源节点': ['rec_node_1'],
            '目标节点': ['rec_created'],
            '连接类型': '主树',
            '标签': '派生',
          }),
        },
      ],
    });
  });

  it('rejects invalid personnel and date values before calling Base', async () => {
    const { service } = createService();

    await expect(
      service.updateNode('rec_node_1', {
        owner: { apaasUserId: 'ou_not_apaas', name: '错误 ID' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateNode('rec_node_1', { date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates link fields for both edge endpoints', async () => {
    const { calls, service } = createService();

    await service.createEdge({
      source: 'rec_node_1',
      target: 'rec_node_2',
      label: '依赖',
      critical: false,
    });

    const creation = calls.find(
      (call) =>
        call.pluginId === EDGE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(creation?.input).toEqual({
      records: [
        {
          record: expect.objectContaining({
            '来源节点': ['rec_node_1'],
            '目标节点': ['rec_node_2'],
            '连接类型': '跨节点',
          }),
        },
      ],
    });
  });

  it('does not hide Base permission errors behind static fallback data', async () => {
    for (const denyMessage of [
      'permission denied',
      '403 forbidden',
      'not authorized',
      '没有权限访问该表格',
    ]) {
      const { service } = createService({ denyMessage });
      await expect(service.getGraph()).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });
});
