import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CapabilityService,
  AuthNPaasService,
} from '@lark-apaas/fullstack-nestjs-core';
import type {
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectGraphResponse,
  ProjectLane,
  ProjectNodeStatus,
  ProjectOwner,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
} from '@shared/api.interface';
import {
  buildStaticBaselines,
  buildStaticEdges,
  buildStaticMetrics,
  buildStaticNodes,
} from './project-graph-static';

const NODE_PLUGIN_ID = 'project_graph_node_crud_1';
const EDGE_PLUGIN_ID = 'project_graph_connection_bitable_crud_1';

const BASE_URL =
  'https://my.feishu.cn/base/WC3cb3acOaminMsXKbTcwPKdnMg?table=tblVIjVsxIbuk1QQ&view=vewqWl33qS';
const NODE_FIELD = {
  NAME: '节点名称',
  NODE_ID: '节点ID',
  SUBTITLE: '副标题',
  GROUP: '分组',
  TYPE: '节点类型',
  STATUS: '状态',
  OWNER: '负责人ID',
  LEGACY_OWNER: '负责人',
  PROGRESS: '进度',
  VERSION: '版本/分支',
  DATE: '日期',
  TAGS: '标签',
  SUMMARY: '工作内容',
  NEXT: '下一步',
  RISKS: '风险/阻塞',
  IMAGE: '图片URL',
  SORT: '排序',
  PROJECT: '所属项目',
  PARENT: '父节点',
} as const;

const EDGE_FIELD = {
  NAME: '连接名称',
  EDGE_ID: '连接ID',
  TYPE: '连接类型',
  LABEL: '标签',
  CRITICAL: '关键链路',
  SORT: '排序',
  PROJECT: '所属项目',
  SOURCE: '来源节点',
  TARGET: '目标节点',
} as const;

type PluginRecord = { id: string; record: Record<string, unknown> };

@Injectable()
export class ProjectGraphService {
  private readonly logger = new Logger(ProjectGraphService.name);

  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly authnService: AuthNPaasService,
  ) {}

  async getGraph(): Promise<ProjectGraphResponse> {
    try {
      return await this.buildBaseGraph();
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.warn(
        `Base graph read failed, using static fallback: ${stringifyError(error)}`,
      );
      return this.buildStaticGraph(
        'Base 连接不可用，当前展示的是模板内置示例图谱。',
      );
    }
  }

  async updateNode(
    nodeId: string,
    patch: UpdateProjectGraphNodeRequest,
  ): Promise<ProjectGraphResponse> {
    if (!nodeId) {
      throw new BadRequestException('nodeId is required');
    }
    const node = await this.findNodeByNodeId(nodeId);
    if (!node) {
      throw new BadRequestException('node not found');
    }
    await this.pluginUpdateRecord(NODE_PLUGIN_ID, node.id, toNodeFields(patch));
    return this.getGraph();
  }

  async createNode(
    node: CreateProjectGraphNodeRequest,
  ): Promise<ProjectGraphResponse> {
    if (!node.title) {
      throw new BadRequestException('title is required');
    }
    const createdNodeId = await this.pluginAddRecord(
      NODE_PLUGIN_ID,
      toNewNodeFields(node),
    );
    const parentId = node.linkedIds?.[0];
    if (parentId) {
      await this.pluginAddRecord(
        EDGE_PLUGIN_ID,
        toNewEdgeFields({
          source: parentId,
          target: createdNodeId,
          label: node.lane === 'hardware' ? '演进' : '派生',
          critical: false,
          kind: 'tree',
        }),
      );
    }
    return this.getGraph();
  }

  async deleteNode(nodeId: string): Promise<ProjectGraphResponse> {
    if (!nodeId) {
      throw new BadRequestException('nodeId is required');
    }
    const node = await this.findNodeByNodeId(nodeId);
    if (!node) {
      throw new BadRequestException('node not found');
    }
    await this.pluginDeleteRecord(NODE_PLUGIN_ID, node.id);
    return this.getGraph();
  }

  async createEdge(
    edge: CreateProjectGraphEdgeRequest,
  ): Promise<ProjectGraphResponse> {
    if (!edge.source || !edge.target) {
      throw new BadRequestException('source and target are required');
    }
    await this.pluginAddRecord(EDGE_PLUGIN_ID, toNewEdgeFields(edge));
    return this.getGraph();
  }

  async updateEdge(
    edgeId: string,
    patch: UpdateProjectGraphEdgeRequest,
  ): Promise<ProjectGraphResponse> {
    if (!edgeId) {
      throw new BadRequestException('edgeId is required');
    }
    const record = await this.findEdgeByEdgeId(edgeId);
    if (!record) {
      throw new BadRequestException('edge not found');
    }
    await this.pluginUpdateRecord(EDGE_PLUGIN_ID, record.id, toEdgeFields(patch));
    return this.getGraph();
  }

  async deleteEdge(edgeId: string): Promise<ProjectGraphResponse> {
    if (!edgeId) {
      throw new BadRequestException('edgeId is required');
    }
    const record = await this.findEdgeByEdgeId(edgeId);
    if (!record) {
      throw new BadRequestException('edge not found');
    }
    await this.pluginDeleteRecord(EDGE_PLUGIN_ID, record.id);
    return this.getGraph();
  }

  // --- Plugin Base operations ---

  private async searchAllRecords(
    pluginId: string,
  ): Promise<PluginRecord[]> {
    const allRecords: PluginRecord[] = [];
    let pageToken: string | undefined;
    do {
      const input: Record<string, unknown> = { pageSize: 500 };
      if (pageToken) {
        input.pageToken = pageToken;
      }
      const result = await this.callPlugin<{
        hasMore: boolean;
        pageToken?: string;
        records: PluginRecord[];
      }>(pluginId, 'searchRecords', input);
      if (result.records) {
        allRecords.push(...result.records);
      }
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);
    return allRecords;
  }

  private async pluginAddRecord(
    pluginId: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.callPlugin<{
      records: Array<{ id: string }>;
    }>(pluginId, 'batchAddRecords', { records: [{ record }] });
    if (!result.records?.[0]?.id) {
      throw new BadRequestException('Base record creation returned no id');
    }
    return result.records[0].id;
  }

  private async pluginUpdateRecord(
    pluginId: string,
    recordId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    await this.callPlugin(pluginId, 'batchUpdateRecords', {
      records: [{ id: recordId, record }],
    });
  }

  private async pluginDeleteRecord(
    pluginId: string,
    recordId: string,
  ): Promise<void> {
    await this.callPlugin(pluginId, 'deleteRecords', {
      recordIDs: [recordId],
    });
  }

  private async callPlugin<T = unknown>(
    pluginId: string,
    actionKey: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    try {
      const result = await this.capabilityService
        .load(pluginId)
        .call(actionKey, input);
      return result as T;
    } catch (error: unknown) {
      const msg = stringifyError(error);
      this.logger.error(
        `Plugin call failed: ${pluginId}.${actionKey} - ${msg}`,
      );
      const normalizedMessage = msg.toLowerCase();
      if (
        normalizedMessage.includes('permission') ||
        msg.includes('权限') ||
        normalizedMessage.includes('forbidden') ||
        normalizedMessage.includes('403') ||
        normalizedMessage.includes('not authorized')
      ) {
        throw new ForbiddenException(
          '当前用户没有该多维表格的操作权限，请联系管理员授权。',
        );
      }
      throw new BadRequestException(`Base 操作失败: ${msg}`);
    }
  }

  // --- Graph assembly ---

  private async buildBaseGraph(): Promise<ProjectGraphResponse> {
    const nodeRecords = await this.searchAllRecords(NODE_PLUGIN_ID);
    const edgeRecords = await this.searchAllRecords(EDGE_PLUGIN_ID);
    const nodeIds = new Set<string>(
      nodeRecords.map((r) => r.id),
    );
    const mappedNodes = nodeRecords.map((r) =>
      this.mapGraphNodeRecordToNode(r.record, r.id, nodeIds),
    );
    if (mappedNodes.length === 0) {
      return this.buildStaticGraph();
    }
    const mappedEdges = this.mapEdgeRecords(edgeRecords, nodeIds);
    const { nodes, edges } = reconcileGraphRelationships(
      mappedNodes,
      mappedEdges,
    );
    await this.enrichOwnerIds(nodes);
    return {
      nodes,
      edges,
      metrics: buildStaticMetrics(nodes),
      baselines: buildStaticBaselines(),
      base: {
        url: BASE_URL,
        nodeTableId: 'tblVIjVsxIbuk1QQ',
        edgeTableId: 'tblFSCyy1hjLEFO5',
      },
      writable: true,
      savedAt: formatNowTime(),
    };
  }

  private buildStaticGraph(message?: string): ProjectGraphResponse {
    const nodes = buildStaticNodes();
    return {
      nodes,
      edges: buildStaticEdges(),
      metrics: buildStaticMetrics(nodes),
      baselines: buildStaticBaselines(),
      base: {
        url: BASE_URL,
        nodeTableId: 'tblVIjVsxIbuk1QQ',
        edgeTableId: 'tblFSCyy1hjLEFO5',
      },
      writable: false,
      message,
    };
  }

  // --- Record mapping ---

  private mapGraphNodeRecordToNode(
    record: Record<string, unknown>,
    recordId: string,
    recordIdSet: Set<string>,
  ): ProjectGraphNode {
    const rawLinkedIds = extractLinkIds(
      record[NODE_FIELD.PARENT],
      recordIdSet,
    );
    const groupValue = extractText(record[NODE_FIELD.GROUP]);
    const typeValue = extractText(record[NODE_FIELD.TYPE]);
    const laneValue = toProjectLane(typeValue, groupValue);
    return {
      id: recordId,
      title: extractText(record[NODE_FIELD.NAME]) || '未命名节点',
      subtitle: extractText(record[NODE_FIELD.SUBTITLE]),
      lane: laneValue,
      kind: toProjectNodeKind(typeValue, laneValue),
      status: toProjectStatus(extractText(record[NODE_FIELD.STATUS])),
      owner:
        this.extractOwner(record[NODE_FIELD.OWNER]) ??
        this.extractOwner(record[NODE_FIELD.LEGACY_OWNER]),
      progress: normalizeProgress(extractNumber(record[NODE_FIELD.PROGRESS])),
      version: extractText(record[NODE_FIELD.VERSION]),
      date: formatDateValue(record[NODE_FIELD.DATE]),
      tags: splitTextList(extractText(record[NODE_FIELD.TAGS])),
      summary: extractText(record[NODE_FIELD.SUMMARY]),
      nextAction: extractText(record[NODE_FIELD.NEXT]),
      risks: splitTextList(extractText(record[NODE_FIELD.RISKS])),
      imageUrl: extractText(record[NODE_FIELD.IMAGE]),
      linkedIds: rawLinkedIds,
      x: 0,
      y: 0,
    };
  }

  private mapEdgeRecords(
    records: PluginRecord[],
    recordIdSet: Set<string>,
  ): ProjectGraphEdge[] {
    return records
      .map((r) => this.mapEdgeRecordToEdge(r.record, r.id, recordIdSet))
      .filter((edge): edge is ProjectGraphEdge => Boolean(edge));
  }

  private mapEdgeRecordToEdge(
    record: Record<string, unknown>,
    recordId: string,
    recordIdSet: Set<string>,
  ): ProjectGraphEdge | null {
    const sourceId = extractFirstLinkId(
      record[EDGE_FIELD.SOURCE],
      recordIdSet,
    );
    const targetId = extractFirstLinkId(
      record[EDGE_FIELD.TARGET],
      recordIdSet,
    );
    if (!sourceId || !targetId) {
      return null;
    }
    return {
      id: recordId,
      source: sourceId,
      target: targetId,
      label:
        extractText(record[EDGE_FIELD.LABEL]) ||
        extractText(record[EDGE_FIELD.NAME]) ||
        '依赖',
      critical: Boolean(record[EDGE_FIELD.CRITICAL]),
      kind:
        extractText(record[EDGE_FIELD.TYPE]) === '主树' ? 'tree' : 'cross',
    };
  }

  // --- Owner handling ---

  private extractOwner(value: unknown): ProjectOwner | null {
    if (value == null) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      if (first == null) return null;
      if (typeof first === 'object') {
        const item = first as Record<string, unknown>;
        const rawId = item.id ?? item.user_id ?? item.userId;
        const userId = rawId == null ? '' : String(rawId);
        if (!userId || userId === '0') return null;
        return {
          apaasUserId: userId,
          name: extractText(item.name),
          avatar: extractText(item.avatar) || undefined,
          email: extractText(item.email) || undefined,
        };
      }
      const userId = String(first);
      if (!userId || userId === '0') return null;
      return { apaasUserId: userId, name: '' };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed === '待指定') return null;
      return { apaasUserId: '', name: trimmed };
    }
    if (typeof value === 'number') {
      if (value === 0) return null;
      return { apaasUserId: String(value), name: '' };
    }
    return null;
  }

  private async enrichOwnerIds(nodes: ProjectGraphNode[]): Promise<void> {
    const owners = nodes
      .map((node) => node.owner)
      .filter((owner): owner is ProjectOwner => Boolean(owner?.apaasUserId));
    const uniqueIds = [...new Set(owners.map((owner) => owner.apaasUserId))];
    if (uniqueIds.length === 0) return;

    try {
      const larkUserIds = await this.authnService.getBatchLarkUserIds(uniqueIds);
      const mapping = new Map<string, string>();
      uniqueIds.forEach((id, index) => {
        const larkUserId = larkUserIds[index];
        if (larkUserId) mapping.set(id, larkUserId);
      });
      owners.forEach((owner) => {
        owner.larkUserId = mapping.get(owner.apaasUserId) ?? owner.larkUserId;
      });
    } catch (error: unknown) {
      this.logger.warn(`Owner ID conversion failed: ${stringifyError(error)}`);
    }
  }

  // --- Lookup helpers ---

  private async findNodeByNodeId(
    nodeId: string,
  ): Promise<PluginRecord | null> {
    const records = await this.searchAllRecords(NODE_PLUGIN_ID);
    return (
      records.find(
        (r) =>
          r.id === nodeId ||
          extractText(r.record[NODE_FIELD.NODE_ID]) === nodeId,
      ) ?? null
    );
  }

  private async findEdgeByEdgeId(
    edgeId: string,
  ): Promise<PluginRecord | null> {
    const records = await this.searchAllRecords(EDGE_PLUGIN_ID);
    return (
      records.find(
        (r) =>
          r.id === edgeId ||
          extractText(r.record[EDGE_FIELD.EDGE_ID]) === edgeId,
      ) ?? null
    );
  }
}

// --- Field builders ---

function toNodeFields(
  patch: UpdateProjectGraphNodeRequest,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.title === 'string') {
    fields[NODE_FIELD.NAME] = patch.title;
  }
  if (typeof patch.subtitle === 'string') {
    fields[NODE_FIELD.SUBTITLE] = patch.subtitle;
  }
  if (patch.status) {
    fields[NODE_FIELD.STATUS] = toBaseStatus(patch.status);
  }
  if (patch.owner !== undefined) {
    fields[NODE_FIELD.OWNER] = ownerToBaseFieldStatic(patch.owner);
  }
  if (typeof patch.progress === 'number') {
    fields[NODE_FIELD.PROGRESS] = normalizeProgress(patch.progress);
  }
  if (typeof patch.version === 'string') {
    fields[NODE_FIELD.VERSION] = patch.version;
  }
  if (typeof patch.date === 'string') {
    fields[NODE_FIELD.DATE] = toDateTimestamp(patch.date);
  }
  if (patch.tags) {
    fields[NODE_FIELD.TAGS] = patch.tags.join('，');
  }
  if (typeof patch.summary === 'string') {
    fields[NODE_FIELD.SUMMARY] = patch.summary;
  }
  if (typeof patch.nextAction === 'string') {
    fields[NODE_FIELD.NEXT] = patch.nextAction;
  }
  if (patch.risks) {
    fields[NODE_FIELD.RISKS] = patch.risks.join('\n');
  }
  if (typeof patch.imageUrl === 'string') {
    fields[NODE_FIELD.IMAGE] = patch.imageUrl;
  }
  return fields;
}

function toNewNodeFields(
  node: CreateProjectGraphNodeRequest,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [NODE_FIELD.NAME]: node.title,
    [NODE_FIELD.NODE_ID]: `new-${Date.now()}`,
    [NODE_FIELD.GROUP]: toBaseGroup(node.lane),
    [NODE_FIELD.TYPE]: toBaseNodeType(node.kind, node.lane),
    [NODE_FIELD.STATUS]: toBaseStatus(node.status),
    [NODE_FIELD.PROGRESS]: normalizeProgress(node.progress ?? 0),
    [NODE_FIELD.VERSION]: node.version ?? '',
    [NODE_FIELD.DATE]: toDateTimestamp(node.date),
    [NODE_FIELD.SUBTITLE]: node.subtitle ?? '',
    [NODE_FIELD.TAGS]: (node.tags ?? []).join('，'),
    [NODE_FIELD.SUMMARY]: node.summary ?? '',
    [NODE_FIELD.NEXT]: node.nextAction ?? '',
    [NODE_FIELD.RISKS]: (node.risks ?? []).join('\n'),
    [NODE_FIELD.IMAGE]: node.imageUrl ?? '',
    [NODE_FIELD.SORT]: 0,
  };
  if (node.owner) {
    fields[NODE_FIELD.OWNER] = ownerToBaseFieldStatic(node.owner);
  }
  return fields;
}

function toEdgeFields(
  patch: UpdateProjectGraphEdgeRequest,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.label === 'string') {
    fields[EDGE_FIELD.LABEL] = patch.label;
  }
  if (typeof patch.critical === 'boolean') {
    fields[EDGE_FIELD.CRITICAL] = patch.critical;
  }
  return fields;
}

function toNewEdgeFields(
  edge: CreateProjectGraphEdgeRequest,
): Record<string, unknown> {
  return {
    [EDGE_FIELD.NAME]: `${edge.source}-${edge.target}`,
    [EDGE_FIELD.EDGE_ID]: `edge-${Date.now()}`,
    [EDGE_FIELD.TYPE]: edge.kind === 'tree' ? '主树' : '跨节点',
    [EDGE_FIELD.LABEL]: edge.label || '关联',
    [EDGE_FIELD.CRITICAL]: Boolean(edge.critical),
    [EDGE_FIELD.SORT]: 0,
    [EDGE_FIELD.SOURCE]: toLinkField(edge.source),
    [EDGE_FIELD.TARGET]: toLinkField(edge.target),
  };
}

function reconcileGraphRelationships(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): { nodes: ProjectGraphNode[]; edges: ProjectGraphEdge[] } {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incomingByTarget = new Map<string, ProjectGraphEdge[]>();
  edges.forEach((edge) => {
    const incoming = incomingByTarget.get(edge.target) ?? [];
    incoming.push(edge);
    incomingByTarget.set(edge.target, incoming);
  });
  const treeEdgeIds = new Set<string>();

  const reconciledNodes = nodes.map((node) => {
    if (node.lane === 'hardware') {
      return node;
    }
    const incoming = (incomingByTarget.get(node.id) ?? []).filter((edge) =>
      nodeIds.has(edge.source),
    );
    const linkedParentId = node.linkedIds.find(
      (parentId) => parentId !== node.id && nodeIds.has(parentId),
    );
    const parentEdge = linkedParentId
      ? incoming.find((edge) => edge.source === linkedParentId)
      : incoming.find((edge) => edge.kind === 'tree') ??
        (incoming.length === 1 ? incoming[0] : undefined);
    if (parentEdge) {
      treeEdgeIds.add(parentEdge.id);
    }
    if (linkedParentId || !parentEdge) {
      return node;
    }
    return { ...node, linkedIds: [parentEdge.source] };
  });

  const reconciledEdges = edges.map((edge) =>
    treeEdgeIds.has(edge.id) && edge.kind !== 'tree'
      ? { ...edge, kind: 'tree' as const }
      : edge,
  );
  return { nodes: reconciledNodes, edges: reconciledEdges };
}

function ownerToBaseFieldStatic(owner: ProjectOwner | null): number[] {
  if (!owner || !owner.apaasUserId) return [];
  const num = Number(owner.apaasUserId);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new BadRequestException('负责人缺少有效的妙搭人员 ID');
  }
  return [num];
}

function toLinkField(recordId?: string): string[] {
  return recordId ? [recordId] : [];
}

function toDateTimestamp(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new BadRequestException('日期格式无效，应为 YYYY-MM-DD');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException('日期格式无效，应为 YYYY-MM-DD');
  }
  return timestamp;
}

// --- Value extractors ---

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) {
    const textVal = (value as Record<string, unknown>).text;
    return typeof textVal === 'string' ? textVal : '';
  }
  return '';
}

function extractNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function extractLinkIds(value: unknown, recordIdSet: Set<string>): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return recordIdSet.has(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item): string | null => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const id = obj.id ?? obj.record_id ?? obj.recordId;
        return typeof id === 'string' ? id : null;
      })
      .filter((id): id is string => Boolean(id && recordIdSet.has(id)));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.record_ids === 'string' && recordIdSet.has(obj.record_ids)) {
      return [obj.record_ids];
    }
    if (Array.isArray(obj.record_ids)) {
      return (obj.record_ids as unknown[]).filter(
        (id): id is string => typeof id === 'string' && recordIdSet.has(id),
      );
    }
    const singleId = obj.record_id ?? obj.id;
    if (typeof singleId === 'string' && recordIdSet.has(singleId)) {
      return [singleId];
    }
  }
  return [];
}

function extractFirstLinkId(
  value: unknown,
  recordIdSet: Set<string>,
): string | null {
  const ids = extractLinkIds(value, recordIdSet);
  return ids[0] ?? null;
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitTextList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// --- Status mapping ---

const STATUS_TO_BASE: Record<ProjectNodeStatus, string> = {
  planned: '规划',
  active: '推进中',
  review: '评审',
  testing: '测试',
  blocked: '阻塞',
  passed: '通过',
  released: '发布',
  archived: '归档',
};

function toBaseStatus(status: ProjectNodeStatus): string {
  return STATUS_TO_BASE[status] ?? '正常推进';
}

function toProjectStatus(value: string): ProjectNodeStatus {
  if (!value) return 'planned';
  if (value.includes('规划') || value.includes('planned')) return 'planned';
  if (value.includes('正常') || value.includes('推进') || value.includes('active')) return 'active';
  if (value.includes('评审') || value.includes('review')) return 'review';
  if (value.includes('测试') || value.includes('testing')) return 'testing';
  if (value.includes('阻塞') || value.includes('blocked')) return 'blocked';
  if (value.includes('通过') || value.includes('passed')) return 'passed';
  if (value.includes('发布') || value.includes('released')) return 'released';
  if (value.includes('归档') || value.includes('archived')) return 'archived';
  return 'planned';
}

// --- Lane mapping ---

function toProjectLane(typeValue: string, groupValue: string): ProjectLane {
  const group = groupValue.toLowerCase();
  if (group.includes('硬件') || group.includes('hardware')) return 'hardware';
  if (group.includes('联调') || group.includes('integration')) return 'integration';
  if (group.includes('软件') || group.includes('software')) return 'software';

  const type = typeValue.toLowerCase();
  if (type.includes('硬件') || type.includes('hardware')) return 'hardware';
  if (type.includes('联调') || type.includes('integration')) return 'integration';
  return 'software';
}

function toBaseGroup(lane: ProjectLane): string {
  if (lane === 'hardware') return '硬件主干';
  if (lane === 'integration') return '联调测试';
  return '软件算法';
}

function toProjectNodeKind(
  typeValue: string,
  lane: ProjectLane,
): import('@shared/api.interface').ProjectNodeKind {
  const type = typeValue.toLowerCase();
  if (type.includes('项目') || type.includes('project')) return 'project';
  if (type.includes('问题') || type.includes('issue')) return 'issue';
  if (type.includes('风险') || type.includes('risk')) return 'risk';
  if (type.includes('发布') || type.includes('release')) return 'release';
  if (type.includes('测试') || type.includes('test')) return 'test';
  if (type.includes('联调') || type.includes('integration')) return 'integration';
  if (type.includes('硬件') || type.includes('hardware')) return 'hardware';
  if (type.includes('软件') || type.includes('software')) return 'software';
  return lane === 'hardware'
    ? 'hardware'
    : lane === 'integration'
      ? 'integration'
      : 'software';
}

function toBaseNodeType(
  kind: import('@shared/api.interface').ProjectNodeKind,
  lane: ProjectLane,
): string {
  const kindLabel: Record<import('@shared/api.interface').ProjectNodeKind, string> = {
    project: '项目',
    issue: '问题',
    hardware: '硬件',
    software: '软件',
    integration: '联调',
    test: '测试',
    risk: '风险',
    release: '发布',
  };
  return kindLabel[kind] ?? (lane === 'hardware' ? '硬件' : '软件');
}

function formatNowTime(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

function formatDateValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const text = extractText(value);
  if (!text) return '';
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().slice(0, 10)
    : text;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
