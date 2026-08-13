import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type {
  AuthNPaasService,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import type { LarkCliBaseClient } from './lark-cli-base.client';
import { ProjectGraphService } from './project-graph.service';

const NODE_PLUGIN_ID = 'project_graph_node_crud_1';
const EDGE_PLUGIN_ID = 'project_graph_connection_bitable_crud_1';
const PROJECT_PLUGIN_ID = 'project_graph_project_crud_1';
const PROJECT_RECORD_ID = 'recvrkK0GUt2Sf';

function nodeRecord(
  id: string,
  stableId: string,
  ownerId: number | number[],
  group = '软件算法',
  type = '软件',
  projectId = PROJECT_RECORD_ID,
  parentId?: string,
) {
  return {
    id,
    record: {
      节点名称: { text: stableId },
      节点ID: stableId,
      副标题: '',
      分组: group,
      节点类型: type,
      状态: '正常推进',
      负责人: Array.isArray(ownerId) ? ownerId : [ownerId],
      进度: 20,
      '版本/分支': 'main',
      日期: Date.UTC(2026, 7, 4),
      标签: '',
      工作内容: '',
      下一步: '',
      '风险/阻塞': '',
      图片URL: '',
      所属项目: [{ id: projectId }],
      父节点: parentId ? [{ id: parentId }] : [],
    },
  };
}

function createService(options?: {
  denyMessage?: string;
  emptyNodes?: boolean;
  failEdgeCreate?: boolean;
}) {
  const calls: Array<{
    pluginId: string;
    action: string;
    input: Record<string, unknown>;
  }> = [];
  const nodes = [
    nodeRecord('rec_node_1', 'stable-1', [101, 404]),
    nodeRecord(
      'rec_node_2',
      'stable-2',
      202,
      '软件算法',
      '软件',
      PROJECT_RECORD_ID,
      'rec_node_1',
    ),
    nodeRecord('rec_node_3', 'stable-3', 303, '联调测试', '硬件'),
    nodeRecord('rec_node_structure', 'stable-structure', 606, '结构设计', '硬件'),
    nodeRecord('rec_node_electronics', 'stable-electronics', 607, '电子电气', '硬件'),
    nodeRecord('rec_node_driver', 'stable-driver', 608, '驱动固件', '软件'),
    nodeRecord('rec_node_algorithm', 'stable-algorithm', 609, '算法', '算法'),
    nodeRecord(
      'rec_node_nonempty',
      'stable-nonempty',
      505,
      '软件算法',
      '软件',
      'rec_project_nonempty',
    ),
  ];
  const edges = [
    {
      id: 'rec_edge_1',
      record: {
        连接ID: 'stable-edge-1',
        连接类型: '主树',
        来源节点: { link_record_ids: ['rec_node_1'] },
        目标节点: { link_record_ids: ['rec_node_2'] },
        标签: '依赖',
        关键链路: true,
      },
    },
    {
      id: 'rec_edge_2',
      record: {
        连接ID: 'stable-edge-2',
        连接类型: '跨节点',
        来源节点: [{ id: 'rec_node_1' }],
        目标节点: [{ id: 'rec_node_3' }],
        标签: '关联 A',
        关键链路: false,
      },
    },
    {
      id: 'rec_edge_3',
      record: {
        连接ID: 'stable-edge-3',
        连接类型: '跨节点',
        来源节点: [{ id: 'rec_node_2' }],
        目标节点: [{ id: 'rec_node_3' }],
        标签: '关联 B',
        关键链路: false,
      },
    },
  ];
  const projects = [
    {
      id: 'rec_blank_project',
      record: {},
    },
    {
      id: PROJECT_RECORD_ID,
      record: {
        项目编码: 'headset-rd',
        项目名称: '头戴设备硬件代际项目管理',
        状态: '推进中',
        说明: '默认项目',
      },
    },
    {
      id: 'rec_project_empty',
      record: {
        项目编码: 'empty-project',
        项目名称: '空项目',
        状态: '待启动',
        说明: '无节点和连线的测试项目',
      },
    },
    {
      id: 'rec_project_nonempty',
      record: {
        项目编码: 'nonempty-project',
        项目名称: '非空项目',
        状态: '推进中',
        说明: '包含节点的测试项目',
      },
    },
    {
      id: 'rec_project_linked',
      record: {
        项目编码: 'linked-project',
        项目名称: '独立 Base 项目',
        状态: '推进中',
        说明:
          '云端动态绑定项目\n[project-graph-meta]{"sort":4,"source":"linked-base","base":{"baseToken":"base_linked","nodeTableId":"tbl_node_linked","edgeTableId":"tbl_edge_linked","url":"https://example.feishu.cn/wiki/linked"}}',
      },
    },
    {
      id: 'rec_project_modern',
      record: {
        项目编码: 'modern-project',
        项目名称: '现代目录项目',
        状态: '规划',
        项目说明: '使用新版目录字段',
        项目文档: {
          text: '打开现代目录项目',
          link: 'https://example.feishu.cn/base/base_modern',
        },
        'Base Token': 'base_modern',
        '节点表 ID': 'tbl_node_modern',
        '连线表 ID': 'tbl_edge_modern',
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
            records:
              pluginId === NODE_PLUGIN_ID
                ? options?.emptyNodes
                  ? []
                  : nodes
                : pluginId === EDGE_PLUGIN_ID
                  ? edges
                  : projects,
          };
        }
        if (action === 'batchAddRecords') {
          if (options?.failEdgeCreate && pluginId === EDGE_PLUGIN_ID) {
            throw new Error('edge creation failed');
          }
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

function createCliService() {
  const listRecords = jest.fn(async (_baseToken: string, tableId: string) => {
    if (tableId === 'tblrpWm6qG55Xssv') {
      return [
        {
          id: 'rec_catalog_1',
          record: {
            项目编码: 'cli-project',
            项目名称: 'CLI 独立项目',
            状态: ['推进中'],
            项目说明: '独立 Base',
            项目文档:
              '[https://example.feishu.cn/wiki/wiki_project](https://example.feishu.cn/wiki/wiki_project)',
            'Base Token': 'base_cli',
            'Wiki 节点 Token': 'wiki_project',
            '节点表 ID': 'tbl_node_cli',
            '连线表 ID': 'tbl_edge_cli',
            创建时间: '2026-08-07 10:00:00',
            更新时间: '2026-08-07 11:00:00',
          },
        },
      ];
    }
    if (tableId === 'tbl_node_cli') {
      return [
        {
          id: 'rec_cli_node',
          record: {
            节点名称: 'CLI 节点',
            节点ID: 'cli-node',
            分组: ['硬件主干'],
            节点类型: ['硬件'],
            状态: ['推进中'],
            进度: 50,
          },
        },
      ];
    }
    return [];
  });
  const larkCli = {
    isEnabled: () => true,
    listRecords,
    createWikiBase: jest.fn(async () => ({
      baseToken: 'base_created',
      nodeToken: 'wiki_created',
      url: 'https://example.feishu.cn/wiki/wiki_created',
    })),
    listTables: jest.fn(async () => [{ id: 'tbl_overview', name: 'Table' }]),
    renameTable: jest.fn(async () => undefined),
    renameBitable: jest.fn(async () => undefined),
    createTable: jest.fn(async (_baseToken, name: string) => ({
      id: name === '项目节点' ? 'tbl_created_node' : 'tbl_created_edge',
      name,
    })),
    createView: jest.fn(async () => ({
      id: 'vew_created_board',
      name: '人员分工看板',
      type: 'kanban',
    })),
    setViewGroup: jest.fn(async () => undefined),
    setViewVisibleFields: jest.fn(async () => undefined),
    createRecord: jest.fn(async () => 'rec_created_catalog'),
    updateRecord: jest.fn(async () => undefined),
    deleteRecord: jest.fn(async () => undefined),
  } as unknown as LarkCliBaseClient;
  const capabilityService = {
    load: () => ({
      call: async () => {
        throw new Error('CLI mode must not call a fixed capability');
      },
    }),
  } as unknown as CapabilityService;
  const authnService = {
    getBatchLarkUserIds: jest.fn(async () => []),
  } as unknown as AuthNPaasService;
  return {
    larkCli,
    listRecords,
    service: new ProjectGraphService(capabilityService, authnService, larkCli),
  };
}

describe('ProjectGraphService Base channel', () => {
  it('reads record IDs, linked records, dates and converted personnel IDs', async () => {
    const { service } = createService();

    const graph = await service.getGraph();

    expect(graph.writable).toBe(true);
    expect(graph.nodes[0]).toMatchObject({
      id: 'rec_node_1',
      lane: 'software',
      date: '2026-08-04',
      owners: [
        {
          apaasUserId: '101',
          larkUserId: 'employee-101',
        },
        {
          apaasUserId: '404',
          larkUserId: 'employee-404',
        },
      ],
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
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rec_node_structure', lane: 'structure' }),
        expect.objectContaining({
          id: 'rec_node_electronics',
          lane: 'electronics',
        }),
        expect.objectContaining({ id: 'rec_node_driver', lane: 'driver' }),
        expect.objectContaining({ id: 'rec_node_algorithm', lane: 'algorithm' }),
      ]),
    );
    expect(graph.edges.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rec_edge_2', kind: 'cross' }),
        expect.objectContaining({ id: 'rec_edge_3', kind: 'cross' }),
      ]),
    );
  });

  it('returns a writable empty graph for a newly created project space', async () => {
    const { service } = createService({ emptyNodes: true });

    const graph = await service.getGraph();

    expect(graph).toMatchObject({
      nodes: [],
      edges: [],
      writable: true,
    });
  });

  it('lists the Base-backed project catalog', async () => {
    const { service } = createService();

    const catalog = await service.listProjects();

    expect(catalog.defaultProjectId).toBe(PROJECT_RECORD_ID);
    expect(catalog.projects[0]).toMatchObject({
      id: PROJECT_RECORD_ID,
      code: 'headset-rd',
      name: '头戴设备硬件代际项目管理',
      source: 'shared-base',
    });
    expect(catalog.projects.some((project) => project.name === '未命名项目')).toBe(
      false,
    );
    expect(
      catalog.projects.find((project) => project.id === 'rec_project_modern'),
    ).toMatchObject({
      name: '现代目录项目',
      base: {
        url: 'https://example.feishu.cn/base/base_modern',
      },
    });
  });

  it('bypasses the project catalog cache after returning from Feishu', async () => {
    const { calls, service } = createService();

    await service.listProjects();
    await service.listProjects();
    expect(
      calls.filter(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'searchRecords',
      ),
    ).toHaveLength(1);

    await service.listProjects(true);
    expect(
      calls.filter(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'searchRecords',
      ),
    ).toHaveLength(2);
  });

  it('creates a project registry record in the shared Base', async () => {
    const { calls, service } = createService();

    const project = await service.createProject({
      name: '机器人视觉平台',
      description: '视觉项目',
      parentId: PROJECT_RECORD_ID,
      source: 'shared-base',
    });

    expect(project).toMatchObject({
      id: 'rec_created',
      name: '机器人视觉平台',
      parentId: PROJECT_RECORD_ID,
      source: 'shared-base',
    });
    const creation = calls.find(
      (call) =>
        call.pluginId === PROJECT_PLUGIN_ID &&
        call.action === 'batchAddRecords',
    );
    expect(creation?.input).toEqual({
      records: [
        {
          record: expect.objectContaining({
            项目名称: '机器人视觉平台',
            状态: '规划',
            项目说明: '视觉项目',
            项目文档: {
              text: '机器人视觉平台',
              link: expect.stringContaining(
                '/base/WC3cb3acOaminMsXKbTcwPKdnMg',
              ),
            },
            'Base Token': 'WC3cb3acOaminMsXKbTcwPKdnMg',
            '节点表 ID': 'tblVIjVsxIbuk1QQ',
            '连线表 ID': 'tblFSCyy1hjLEFO5',
            创建来源: 'Web',
          }),
        },
      ],
    });
  });

  it('rejects a duplicate project name before creating another catalog row', async () => {
    const { calls, service } = createService();

    await expect(
      service.createProject({
        name: ' 空项目 ',
        description: '不应重复创建',
        source: 'shared-base',
      }),
    ).rejects.toThrow('项目名称已存在');
    expect(
      calls.some(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'batchAddRecords',
      ),
    ).toBe(false);
  });

  it('updates a shared project name in the project catalog', async () => {
    const { calls, service } = createService();

    const project = await service.updateProjectName('rec_project_empty', {
      name: '空项目二期',
    });

    expect(project.name).toBe('空项目二期');
    expect(
      calls.find(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'batchUpdateRecords',
      )?.input,
    ).toEqual({
      records: [
        {
          id: 'rec_project_empty',
          record: { 项目名称: '空项目二期' },
        },
      ],
    });
  });

  it('rejects an empty or duplicate project name before writing', async () => {
    const { calls, service } = createService();

    await expect(
      service.updateProjectName('rec_project_empty', { name: '  ' }),
    ).rejects.toThrow('项目名称不能为空');
    await expect(
      service.updateProjectName('rec_project_empty', { name: '非空项目' }),
    ).rejects.toThrow('项目名称已存在');
    expect(
      calls.filter((call) => call.action === 'batchUpdateRecords'),
    ).toHaveLength(0);
  });

  it('falls back to a durable shared-Base project in the cloud runtime', async () => {
    const { calls, service } = createService();

    const project = await service.createProject({
      name: '云端新项目',
      source: 'linked-base',
    });

    expect(project).toMatchObject({
      id: 'rec_created',
      name: '云端新项目',
      source: 'shared-base',
    });
    expect(
      calls.find(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'batchAddRecords',
      )?.input,
    ).toEqual(
      expect.objectContaining({
        records: [
          {
            record: expect.objectContaining({
              项目名称: '云端新项目',
              项目说明: '',
              'Base Token': 'WC3cb3acOaminMsXKbTcwPKdnMg',
            }),
          },
        ],
      }),
    );
  });

  it('deletes an empty non-default project registry record', async () => {
    const { calls, service } = createService();

    const result = await service.deleteProject('rec_project_empty');

    expect(result.deletedProjectId).toBe('rec_project_empty');
    expect(result.deletedBase).toBe(false);
    expect(
      calls.find(
        (call) =>
          call.pluginId === PROJECT_PLUGIN_ID &&
          call.action === 'deleteRecords',
      )?.input,
    ).toEqual({ recordIDs: ['rec_project_empty'] });
  });

  it('protects the default project from deletion', async () => {
    const { calls, service } = createService();

    await expect(service.deleteProject(PROJECT_RECORD_ID)).rejects.toThrow(
      '默认项目不能删除',
    );
    expect(calls.some((call) => call.action === 'deleteRecords')).toBe(false);
  });

  it('rejects deletion while a project still has graph data', async () => {
    const { calls, service } = createService();

    await expect(service.deleteProject('rec_project_nonempty')).rejects.toThrow(
      '项目仍有节点或连线，不能直接删除',
    );
    expect(calls.some((call) => call.action === 'deleteRecords')).toBe(false);
  });

  it('updates a displayed record ID with a real user field and epoch date', async () => {
    const { calls, service } = createService();

    await service.updateNode('rec_node_1', {
      lane: 'integration',
      kind: 'test',
      owners: [
        {
          apaasUserId: '303',
          larkUserId: 'employee-303',
          openId: 'ou_303',
          name: '张三',
        },
        {
          apaasUserId: '404',
          larkUserId: 'employee-404',
          name: '李四',
        },
      ],
      date: '2026-08-04',
    });

    const update = calls.find((call) => call.action === 'batchUpdateRecords');
    expect(update?.pluginId).toBe(NODE_PLUGIN_ID);
    expect(update?.input).toEqual(
      expect.objectContaining({
        records: [
          {
            id: 'rec_node_1',
            record: {
              分组: '联调测试',
              节点类型: '测试',
              负责人ID: [303, 404],
              日期: Date.UTC(2026, 7, 4),
            },
          },
        ],
      }),
    );
  });

  it('accepts the stable node ID while updating the real Base record ID', async () => {
    const { calls, service } = createService();

    await service.updateNode('stable-1', { title: '已更新' });

    const update = calls.find((call) => call.action === 'batchUpdateRecords');
    expect(update?.input).toEqual(
      expect.objectContaining({
        records: [
          {
            id: 'rec_node_1',
            record: { 节点名称: '已更新' },
          },
        ],
      }),
    );
  });

  it('creates every supported node field with Base-compatible values', async () => {
    const { calls, service } = createService();

    const result = await service.createNode({
      title: '新节点',
      subtitle: '副标题',
      lane: 'software',
      kind: 'software',
      status: 'active',
      owners: [
        { apaasUserId: '303', name: '张三' },
        { apaasUserId: '404', name: '李四' },
      ],
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
    expect(creation?.input).toEqual(
      expect.objectContaining({
        records: [
          {
            record: expect.objectContaining({
              节点名称: '新节点',
              副标题: '副标题',
              分组: '软件应用',
              节点类型: '软件',
              负责人ID: [303, 404],
              所属项目: [PROJECT_RECORD_ID],
              日期: Date.UTC(2026, 7, 5),
              标签: 'Base，人员',
              图片URL: 'https://example.com/image.png',
              父节点: ['rec_node_1'],
            }),
          },
        ],
      }),
    );
    const parentEdgeCreation = calls.find(
      (call) =>
        call.pluginId === EDGE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(parentEdgeCreation?.input).toEqual(
      expect.objectContaining({
        records: [
          {
            record: expect.objectContaining({
              来源节点: ['rec_node_1'],
              目标节点: ['rec_created'],
              连接类型: '主树',
              标签: '派生',
            }),
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      node: {
        id: 'rec_created',
        title: '新节点',
        linkedIds: ['rec_node_1'],
      },
      edge: {
        source: 'rec_node_1',
        target: 'rec_created',
        kind: 'tree',
      },
    });
    expect(
      calls.some(
        (call) =>
          call.pluginId === NODE_PLUGIN_ID && call.action === 'searchRecords',
      ),
    ).toBe(false);
  });

  it('writes a linked Base with its independent schema through cloud capabilities', async () => {
    const { calls, service } = createService();

    await service.createNode(
      {
        title: '云端独立节点',
        subtitle: 'Capability 动态 Base',
        lane: 'software',
        kind: 'algorithm',
        status: 'active',
        owners: [{ apaasUserId: '', name: '曾启渊' }],
        progress: 35,
        version: 'cloud-linked',
        date: '2026-08-10',
        x: 0,
        y: 0,
        tags: ['云端', '同步'],
        summary: '验证妙搭写入独立 Base',
        nextAction: '回归编辑与删除',
        risks: [],
        linkedIds: ['rec_parent'],
      },
      'rec_project_linked',
    );

    const nodeCreation = calls.find(
      (call) =>
        call.pluginId === NODE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(nodeCreation?.input).toEqual(
      expect.objectContaining({
        baseToken: 'base_linked',
        tableId: 'tbl_node_linked',
        records: [
          {
            record: expect.objectContaining({
              节点名称: '云端独立节点',
              负责人: '曾启渊',
              任务负责人: ['曾启渊'],
              日期: Date.UTC(2026, 7, 10),
            }),
          },
        ],
      }),
    );
    const nodeFields = (
      nodeCreation?.input.records as Array<{ record: Record<string, unknown> }>
    )[0].record;
    expect(nodeFields).not.toHaveProperty('负责人ID');
    expect(nodeFields).not.toHaveProperty('父节点');
    expect(nodeFields).not.toHaveProperty('所属项目');

    const edgeCreation = calls.find(
      (call) =>
        call.pluginId === EDGE_PLUGIN_ID && call.action === 'batchAddRecords',
    );
    expect(edgeCreation?.input).toEqual(
      expect.objectContaining({
        baseToken: 'base_linked',
        tableId: 'tbl_edge_linked',
      }),
    );
  });

  it('rolls a new node back when its parent edge cannot be created', async () => {
    const { calls, service } = createService({ failEdgeCreate: true });

    await expect(
      service.createNode({
        title: '需要回滚的节点',
        lane: 'software',
        kind: 'software',
        status: 'planned',
        owners: [],
        progress: 0,
        date: '2026-08-10',
        x: 0,
        y: 0,
        linkedIds: ['rec_node_1'],
      }),
    ).rejects.toThrow('edge creation failed');

    expect(
      calls.find(
        (call) =>
          call.pluginId === NODE_PLUGIN_ID && call.action === 'deleteRecords',
      )?.input,
    ).toEqual(expect.objectContaining({ recordIDs: ['rec_created'] }));
  });

  it('edits linked-Base owners without writing shared-only fields', async () => {
    const { calls, service } = createService();

    await service.updateNode(
      'rec_node_1',
      {
        owners: [
          { apaasUserId: '', name: '曾启渊' },
          { apaasUserId: '', name: '沈智伟' },
        ],
        linkedIds: ['rec_parent'],
        date: '2026-08-10',
      },
      'rec_project_linked',
    );

    const update = calls.find(
      (call) =>
        call.pluginId === NODE_PLUGIN_ID &&
        call.action === 'batchUpdateRecords',
    );
    expect(update?.input).toEqual(
      expect.objectContaining({
        baseToken: 'base_linked',
        tableId: 'tbl_node_linked',
        records: [
          {
            id: 'rec_node_1',
            record: {
              负责人: '曾启渊 / 沈智伟',
              任务负责人: ['曾启渊', '沈智伟'],
              日期: Date.UTC(2026, 7, 10),
            },
          },
        ],
      }),
    );
  });

  it('deletes incident edges before deleting a Base node record', async () => {
    const { calls, service } = createService();

    const result = await service.deleteNode('rec_node_1');

    expect(result.deletedNodeId).toBe('rec_node_1');
    expect(
      calls.filter(
        (call) =>
          call.pluginId === NODE_PLUGIN_ID && call.action === 'deleteRecords',
      ),
    ).toEqual([
      {
        pluginId: NODE_PLUGIN_ID,
        action: 'deleteRecords',
        input: expect.objectContaining({ recordIDs: ['rec_node_1'] }),
      },
    ]);
    expect(
      calls.filter(
        (call) =>
          call.pluginId === EDGE_PLUGIN_ID && call.action === 'deleteRecords',
      ),
    ).toHaveLength(2);
  });

  it('deletes a Base edge record and clears its tree parent link', async () => {
    const { calls, service } = createService();

    await service.deleteEdge('rec_edge_1');

    expect(
      calls.find(
        (call) =>
          call.pluginId === EDGE_PLUGIN_ID && call.action === 'deleteRecords',
      )?.input,
    ).toEqual(expect.objectContaining({ recordIDs: ['rec_edge_1'] }));
    expect(
      calls.find(
        (call) =>
          call.pluginId === NODE_PLUGIN_ID &&
          call.action === 'batchUpdateRecords',
      )?.input,
    ).toEqual(
      expect.objectContaining({
        records: [
          {
            id: 'rec_node_2',
            record: { 父节点: [] },
          },
        ],
      }),
    );
  });

  it('reads independent project metadata and select arrays through lark-cli', async () => {
    const { service } = createCliService();

    const catalog = await service.listProjects();
    const graph = await service.getGraph('rec_catalog_1');

    expect(catalog.projects[0]).toMatchObject({
      id: 'rec_catalog_1',
      name: 'CLI 独立项目',
      source: 'linked-base',
      base: {
        url: 'https://example.feishu.cn/wiki/wiki_project',
      },
    });
    expect(graph.nodes[0]).toMatchObject({
      id: 'rec_cli_node',
      title: 'CLI 节点',
      lane: 'hardware',
      kind: 'hardware',
      status: 'active',
      progress: 50,
    });
  });

  it('creates an independent node and tree edge without writing the shared parent field', async () => {
    const { larkCli, service } = createCliService();
    (larkCli.createRecord as jest.Mock)
      .mockResolvedValueOnce('rec_cli_created_node')
      .mockResolvedValueOnce('rec_cli_created_edge');

    const result = await service.createNode(
      {
        title: '独立 Base 新节点',
        lane: 'software',
        kind: 'software',
        status: 'planned',
        owners: [{ apaasUserId: '', name: '张三' }],
        progress: 0,
        date: '2026-08-09',
        x: 0,
        y: 0,
        linkedIds: ['rec_cli_node'],
      },
      'rec_catalog_1',
    );

    const nodeFields = (larkCli.createRecord as jest.Mock).mock.calls[0][2];
    expect(nodeFields).toEqual(
      expect.objectContaining({
        节点名称: '独立 Base 新节点',
        负责人: '张三',
        任务负责人: ['张三'],
      }),
    );
    expect(nodeFields).not.toHaveProperty('父节点');
    expect(larkCli.createRecord).toHaveBeenNthCalledWith(
      2,
      'base_cli',
      'tbl_edge_cli',
      expect.objectContaining({
        来源节点: [{ id: 'rec_cli_node' }],
        目标节点: [{ id: 'rec_cli_created_node' }],
        连接类型: '主树',
      }),
    );
    expect(result).toMatchObject({
      node: {
        id: 'rec_cli_created_node',
        linkedIds: ['rec_cli_node'],
      },
      edge: {
        id: 'rec_cli_created_edge',
        source: 'rec_cli_node',
        target: 'rec_cli_created_node',
      },
    });
  });

  it('does not write the shared parent field while editing an independent node', async () => {
    const { larkCli, service } = createCliService();

    await service.updateNode(
      'rec_cli_node',
      { title: '已更新节点', linkedIds: ['rec_cli_parent'] },
      'rec_catalog_1',
    );

    expect(larkCli.updateRecord).toHaveBeenCalledWith(
      'base_cli',
      'tbl_node_cli',
      'rec_cli_node',
      { 节点名称: '已更新节点' },
    );
  });

  it('creates and registers an independent wiki Base through lark-cli', async () => {
    const { larkCli, service } = createCliService();

    const project = await service.createProject({
      name: '新独立项目',
      description: '端到端项目',
      source: 'linked-base',
    });

    expect(project).toMatchObject({
      id: 'rec_created_catalog',
      name: '新独立项目',
      source: 'linked-base',
      base: {
        baseToken: 'base_created',
        nodeTableId: 'tbl_created_node',
        edgeTableId: 'tbl_created_edge',
      },
    });
    expect(larkCli.createWikiBase).toHaveBeenCalledWith(
      'EVYowE8rSi4ZWqkCIu8cc2EQn8d',
      '新独立项目',
    );
    expect(larkCli.createTable).toHaveBeenNthCalledWith(
      1,
      'base_created',
      '项目节点',
      expect.any(Array),
    );
    expect(larkCli.createTable).toHaveBeenNthCalledWith(
      2,
      'base_created',
      '项目连接关系',
      expect.arrayContaining([
        expect.objectContaining({
          name: '来源节点',
          link_table: 'tbl_created_node',
        }),
      ]),
    );
    expect(larkCli.createRecord).toHaveBeenCalledWith(
      'I2hLbxQOsaZYcQsPuSOc3UMWnSe',
      'tblrpWm6qG55Xssv',
      expect.objectContaining({
        项目名称: '新独立项目',
        'Base Token': 'base_created',
        '节点表 ID': 'tbl_created_node',
        '连线表 ID': 'tbl_created_edge',
      }),
    );
    expect(larkCli.createView).toHaveBeenCalledWith(
      'base_created',
      'tbl_created_node',
      '人员分工看板',
      'kanban',
    );
    expect(larkCli.setViewGroup).toHaveBeenCalledWith(
      'base_created',
      'tbl_created_node',
      'vew_created_board',
      '任务负责人',
    );
    expect(larkCli.setViewVisibleFields).toHaveBeenCalledWith(
      'base_created',
      'tbl_created_node',
      'vew_created_board',
      [
        '节点名称',
        '任务负责人',
        '状态',
        '工作内容',
        '进度',
        '日期',
        '下一步',
        '风险/阻塞',
        '节点类型',
        '版本/分支',
        '标签',
      ],
    );
  });

  it('renames both the independent Base and its catalog record through lark-cli', async () => {
    const { larkCli, service } = createCliService();

    const project = await service.updateProjectName('rec_catalog_1', {
      name: 'CLI 独立项目二期',
    });

    expect(project.name).toBe('CLI 独立项目二期');
    expect(larkCli.renameBitable).toHaveBeenCalledWith(
      'base_cli',
      'CLI 独立项目二期',
    );
    expect(larkCli.updateRecord).toHaveBeenCalledWith(
      'I2hLbxQOsaZYcQsPuSOc3UMWnSe',
      'tblrpWm6qG55Xssv',
      'rec_catalog_1',
      { 项目名称: 'CLI 独立项目二期' },
    );
  });

  it('rolls the Base title back when the catalog rename fails', async () => {
    const { larkCli, service } = createCliService();
    (larkCli.updateRecord as jest.Mock).mockRejectedValueOnce(
      new Error('catalog write failed'),
    );

    await expect(
      service.updateProjectName('rec_catalog_1', {
        name: '不会保留的名称',
      }),
    ).rejects.toThrow('项目名称修改失败: catalog write failed');
    expect(larkCli.renameBitable).toHaveBeenNthCalledWith(
      1,
      'base_cli',
      '不会保留的名称',
    );
    expect(larkCli.renameBitable).toHaveBeenNthCalledWith(
      2,
      'base_cli',
      'CLI 独立项目',
    );
  });

  it('resolves a stable node ID only when it is not a Base record ID', async () => {
    const { calls, service } = createService();

    await service.deleteNode('stable-1');

    const nodeCalls = calls.filter((call) => call.pluginId === NODE_PLUGIN_ID);
    expect(nodeCalls.map((call) => call.action)).toEqual([
      'searchRecords',
      'deleteRecords',
    ]);
    expect(nodeCalls[1].input).toEqual(
      expect.objectContaining({ recordIDs: ['rec_node_1'] }),
    );
  });

  it('rejects invalid personnel and date values before calling Base', async () => {
    const { service } = createService();

    await expect(
      service.updateNode('rec_node_1', {
        owners: [{ apaasUserId: 'ou_not_apaas', name: '错误 ID' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateNode('rec_node_1', { date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects records and endpoints outside the resolved project', async () => {
    const { calls, service } = createService();

    await expect(
      service.updateNode('rec_other_project', { title: '越界修改' }),
    ).rejects.toThrow('node not found');
    await expect(
      service.deleteNode('rec_other_project'),
    ).rejects.toThrow('node not found');
    await expect(
      service.createEdge({
        source: 'rec_node_1',
        target: 'rec_other_project',
        label: '越界连接',
        critical: false,
      }),
    ).rejects.toThrow('连接节点不属于当前项目');

    expect(
      calls.some(
        (call) =>
          (call.action === 'batchUpdateRecords' ||
            call.action === 'deleteRecords' ||
            call.action === 'batchAddRecords') &&
          JSON.stringify(call.input).includes('rec_other_project'),
      ),
    ).toBe(false);
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
    expect(creation?.input).toEqual(
      expect.objectContaining({
        records: [
          {
            record: expect.objectContaining({
              来源节点: ['rec_node_1'],
              目标节点: ['rec_node_2'],
              连接类型: '跨节点',
            }),
          },
        ],
      }),
    );
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

  it('does not hide Base routing errors behind static fallback data', async () => {
    const { service } = createService({
      denyMessage:
        'xdomain gateway routing failed (likely invalid app_token / table_id)',
    });

    await expect(service.getGraph()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
