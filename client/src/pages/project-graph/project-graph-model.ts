import type {
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectGraphResponse,
  ProjectLane,
  ProjectMetric,
  ProjectNodeStatus,
} from '@shared/api.interface';

export const DEFAULT_PROJECT_ID = 'default-headset-project';
export const GRAPH_STORAGE_KEY = 'rd-project-graph-edits-v2';
export const GRAPH_DRAFT_STORAGE_KEY = 'rd-project-graph-draft-v3';
export const PROJECT_LIBRARY_KEY = 'rd-project-graph-library-v1';
export const ACTIVE_PROJECT_KEY = 'rd-project-graph-active-v1';

export const LANE_LABELS: Record<ProjectLane | 'all', string> = {
  all: '全部',
  hardware: '硬件主干',
  software: '软件算法',
  integration: '联调测试',
};

export const STATUS_LABELS: Record<ProjectNodeStatus | 'all', string> = {
  all: '全部状态',
  planned: '规划',
  active: '推进中',
  review: '评审',
  testing: '测试',
  blocked: '阻塞',
  passed: '通过',
  released: '发布',
  archived: '归档',
};

export const STATUS_CLASS: Record<ProjectNodeStatus, string> = {
  planned: 'status-planned',
  active: 'status-active',
  review: 'status-review',
  testing: 'status-testing',
  blocked: 'status-blocked',
  passed: 'status-passed',
  released: 'status-released',
  archived: 'status-archived',
};

export const laneOptions: Array<ProjectLane | 'all'> = [
  'all',
  'hardware',
  'software',
  'integration',
];

export const statusOptions: Array<ProjectNodeStatus | 'all'> = [
  'all',
  'planned',
  'active',
  'review',
  'testing',
  'blocked',
  'released',
];

export const activeWorkStatuses: ProjectNodeStatus[] = [
  'active',
  'review',
  'testing',
  'blocked',
];

export interface GraphLayout {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  width: number;
  height: number;
}

export interface ProjectGraphDraft {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
}

export interface ProjectLibraryItem {
  id: string;
  name: string;
  updatedAt: string;
  graph: ProjectGraphResponse;
}

export type EditableNodePatch = Pick<
  ProjectGraphNode,
  | 'title'
  | 'subtitle'
  | 'status'
  | 'owner'
  | 'progress'
  | 'version'
  | 'date'
  | 'tags'
  | 'summary'
  | 'nextAction'
  | 'risks'
  | 'imageUrl'
>;

export type NodeEditMap = Record<string, EditableNodePatch>;

export function createDefaultNode(
  lane: ProjectLane,
  parentId: string | null,
  nodeCount: number,
): ProjectGraphNode {
  const timestamp: number = Date.now();
  const prefix: Record<ProjectLane, string> = {
    hardware: 'hw',
    software: 'sw',
    integration: 'it',
  };
  const title: Record<ProjectLane, string> = {
    hardware: '新硬件版本',
    software: '新软件分支',
    integration: '新联调测试',
  };
  const kind: ProjectGraphNode['kind'] =
    lane === 'hardware' ? 'hardware' : lane === 'software' ? 'software' : 'test';

  return {
    id: `${prefix[lane]}-custom-${timestamp}`,
    title: title[lane],
    subtitle: lane === 'hardware' ? '硬件主干' : '流程图编辑新增',
    lane,
    kind,
    status: 'planned',
    owner: null,
    progress: 0,
    version: `draft-${nodeCount + 1}`,
    date: new Date().toISOString().slice(0, 10),
    x: 900 + nodeCount * 12,
    y: 360 + nodeCount * 12,
    tags: ['草稿'],
    summary: '补充该节点的工作内容、输入输出和验收标准。',
    nextAction: '指定负责人并拆解下一步任务。',
    risks: [],
    linkedIds: parentId ? [parentId] : [],
    imageUrl: '',
  };
}

export function createEdge(
  source: string,
  target: string,
  label: string,
): ProjectGraphEdge {
  return {
    id: `${source}-${target}-${Date.now()}`,
    source,
    target,
    label: label.trim() || '关联',
    critical: false,
  };
}

export function buildUiMetrics(nodes: ProjectGraphNode[]): ProjectMetric[] {
  const hardwareCount: number = nodes.filter(
    (node: ProjectGraphNode) => node.lane === 'hardware',
  ).length;
  const activeSoftwareCount: number = nodes.filter(
    (node: ProjectGraphNode) =>
      node.lane !== 'hardware' && activeWorkStatuses.includes(node.status),
  ).length;
  const blockedCount: number = nodes.filter(
    (node: ProjectGraphNode) => node.status === 'blocked',
  ).length;
  const reviewCount: number = nodes.filter(
    (node: ProjectGraphNode) =>
      node.status === 'review' || node.status === 'testing',
  ).length;

  return [
    {
      key: 'hardware',
      label: '硬件主干',
      value: String(hardwareCount),
      tone: 'neutral',
    },
    {
      key: 'activeSoftware',
      label: '进行中软件',
      value: String(activeSoftwareCount),
      tone: 'good',
    },
    {
      key: 'review',
      label: '评审/测试',
      value: String(reviewCount),
      tone: 'warning',
    },
    {
      key: 'blocked',
      label: '阻塞项',
      value: String(blockedCount),
      tone: blockedCount > 0 ? 'danger' : 'good',
    },
  ];
}

export function filterNodes(
  nodes: ProjectGraphNode[],
  laneFilter: ProjectLane | 'all',
  statusFilter: ProjectNodeStatus | 'all',
  query: string,
  compactMode: boolean,
): ProjectGraphNode[] {
  const normalizedQuery: string = query.trim().toLowerCase();

  return nodes.filter((node: ProjectGraphNode) => {
    const compactMatched: boolean =
      !compactMode ||
      node.lane === 'hardware' ||
      activeWorkStatuses.includes(node.status);
    const laneMatched: boolean =
      laneFilter === 'all' || node.lane === laneFilter;
    const statusMatched: boolean =
      statusFilter === 'all' || node.status === statusFilter;
    const queryMatched: boolean =
      normalizedQuery.length === 0 ||
      [
        node.title,
        node.subtitle,
        node.owner?.name ?? '',
        node.version,
        node.summary,
        node.nextAction,
        node.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);

    return compactMatched && laneMatched && statusMatched && queryMatched;
  });
}

export function layoutGraph(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): GraphLayout {
  const nodeMap: Map<string, ProjectGraphNode> = new Map(
    nodes.map((node: ProjectGraphNode) => [node.id, node]),
  );
  const hardwareNodes: ProjectGraphNode[] = nodes
    .filter((node: ProjectGraphNode) => node.lane === 'hardware')
    .sort((left: ProjectGraphNode, right: ProjectGraphNode) => left.x - right.x);

  const hardwareIds: Set<string> = new Set(
    hardwareNodes.map((node: ProjectGraphNode) => node.id),
  );
  const childrenByNode: Map<string, ProjectGraphNode[]> = new Map(
    nodes.map((node: ProjectGraphNode) => [node.id, []]),
  );
  const orphanNodes: ProjectGraphNode[] = [];

  nodes
    .filter((node: ProjectGraphNode) => node.lane !== 'hardware')
    .forEach((node: ProjectGraphNode) => {
      const parentId: string | undefined = findDirectParentId(
        node,
        edges,
        nodeMap,
      );
      if (!parentId) {
        orphanNodes.push(node);
        return;
      }
      childrenByNode.get(parentId)?.push(node);
    });

  const nodeWidth: number = 220;
  const leftPadding: number = 96;
  const mainY: number = 86;
  const branchStartY: number = 306;
  const branchGapY: number = 172;
  const branchColumnGap: number = 54;
  const subtreeGap: number = 170;

  const subtreeLeftByHardware: Map<string, number> = new Map();
  const subtreeWidthByHardware: Map<string, number> = new Map();
  const visitedWidths: Map<string, number> = new Map();
  let cursorX: number = leftPadding;
  hardwareNodes.forEach((node: ProjectGraphNode) => {
    const subtreeWidth: number = Math.max(
      nodeWidth,
      getChildrenWidth(node.id, childrenByNode, visitedWidths, nodeWidth, branchColumnGap),
    );
    subtreeLeftByHardware.set(node.id, cursorX);
    subtreeWidthByHardware.set(node.id, subtreeWidth);
    cursorX += subtreeWidth + subtreeGap;
  });

  const positionedHardware: ProjectGraphNode[] = hardwareNodes.map(
    (node: ProjectGraphNode) => {
      const subtreeLeft: number = subtreeLeftByHardware.get(node.id) ?? leftPadding;
      const subtreeWidth: number = subtreeWidthByHardware.get(node.id) ?? nodeWidth;
      return {
        ...node,
        x: subtreeLeft + subtreeWidth / 2 - nodeWidth / 2,
        y: mainY,
      };
    },
  );

  const positionedChildren: ProjectGraphNode[] = [];
  let maxDepth: number = 0;
  hardwareNodes.forEach((hardwareNode: ProjectGraphNode) => {
    const sortedChildren: ProjectGraphNode[] = [
      ...(childrenByNode.get(hardwareNode.id) ?? []),
    ].sort(compareBranchNodes);
    if (sortedChildren.length === 0) {
      return;
    }
      const subtreeLeft: number =
      subtreeLeftByHardware.get(hardwareNode.id) ?? leftPadding;
      const subtreeWidth: number =
      subtreeWidthByHardware.get(hardwareNode.id) ?? nodeWidth;
    const childrenWidth: number = getChildrenWidth(
      hardwareNode.id,
      childrenByNode,
      visitedWidths,
      nodeWidth,
      branchColumnGap,
    );
    const rowLeft: number = subtreeLeft + subtreeWidth / 2 - childrenWidth / 2;
    let childCursorX: number = rowLeft;
    sortedChildren.forEach((child: ProjectGraphNode) => {
      const childWidth: number = getSubtreeWidth(
        child.id,
        childrenByNode,
        visitedWidths,
        nodeWidth,
        branchColumnGap,
      );
      const depth: number = placeBranchSubtree(
        child,
        childCursorX,
        branchStartY,
        childrenByNode,
        positionedChildren,
        visitedWidths,
        nodeWidth,
        branchColumnGap,
        branchGapY,
        new Set<string>([hardwareNode.id]),
      );
      maxDepth = Math.max(maxDepth, depth);
      childCursorX += childWidth + branchColumnGap;
    });
  });

  const orphanStartX: number = Math.max(cursorX, leftPadding + nodeWidth);
  const positionedOrphans: ProjectGraphNode[] = orphanNodes.map(
    (node: ProjectGraphNode, index: number) => ({
      ...node,
      x: orphanStartX + (index % 2) * (nodeWidth + branchColumnGap),
      y: branchStartY + Math.floor(index / 2) * branchGapY,
    }),
  );
  const orphanRows: number = Math.ceil(orphanNodes.length / 2);
  maxDepth = Math.max(maxDepth, orphanRows);

  const positionedNodes: ProjectGraphNode[] = [
    ...positionedHardware,
    ...positionedChildren,
    ...positionedOrphans,
  ];
  const visibleIds: Set<string> = new Set(
    positionedNodes.map((node: ProjectGraphNode) => node.id),
  );
  const visibleEdges: ProjectGraphEdge[] = edges.filter(
    (edge: ProjectGraphEdge) =>
      visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  return {
    nodes: positionedNodes,
    edges: visibleEdges,
    width: Math.max(1280, orphanStartX + 2 * nodeWidth + branchColumnGap + 96),
    height: Math.max(720, branchStartY + maxDepth * branchGapY + 170),
  };
}

export function applyNodeEdits(
  nodes: ProjectGraphNode[],
  edits: NodeEditMap,
): ProjectGraphNode[] {
  return nodes.map((node: ProjectGraphNode) => {
    const edit: EditableNodePatch | undefined = edits[node.id];
    return edit ? { ...node, ...edit } : node;
  });
}

export function readNodeEdits(): NodeEditMap {
  if (typeof window === 'undefined') {
    return {};
  }

  const rawValue: string | null = window.localStorage.getItem(GRAPH_STORAGE_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== 'object') {
      return {};
    }
    return parsedValue as NodeEditMap;
  } catch {
    return {};
  }
}

export function readGraphDraft(): ProjectGraphDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue: string | null = window.localStorage.getItem(
    GRAPH_DRAFT_STORAGE_KEY,
  );
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isGraphDraft(parsedValue)) {
      return null;
    }
    return parsedValue;
  } catch {
    return null;
  }
}

export function writeGraphDraft(draft: ProjectGraphDraft): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(
    GRAPH_DRAFT_STORAGE_KEY,
    JSON.stringify(draft),
  );
}

export function readProjectLibrary(): ProjectLibraryItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawValue: string | null = window.localStorage.getItem(
    PROJECT_LIBRARY_KEY,
  );
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }
    return parsedValue.filter(isProjectLibraryItem);
  } catch {
    return [];
  }
}

export function writeProjectLibrary(items: ProjectLibraryItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(items));
}

export function readActiveProjectId(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_PROJECT_ID;
  }
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;
}

export function writeActiveProjectId(projectId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

export function createProjectLibraryItem(
  name: string,
  graph: ProjectGraphResponse,
): ProjectLibraryItem {
  const updatedAt: string = new Date().toISOString();
  const projectId: string = `project-${Date.now()}`;
  return {
    id: projectId,
    name: name.trim() || '未命名项目',
    updatedAt,
    graph: {
      ...graph,
      metrics: buildUiMetrics(graph.nodes),
    },
  };
}

export function createBaseProjectLibraryItem(
  name: string,
  graph: ProjectGraphResponse,
): ProjectLibraryItem {
  const updatedAt: string = new Date().toISOString();
  return {
    id: `base-project-${Date.now()}`,
    name: name.trim() || '导入的多维表格项目',
    updatedAt,
    graph: {
      ...graph,
      nodes: [],
      edges: [],
      metrics: [],
    },
  };
}

export function upsertProjectGraph(
  items: ProjectLibraryItem[],
  projectId: string,
  graph: ProjectGraphResponse,
): ProjectLibraryItem[] {
  const updatedAt: string = new Date().toISOString();
  const existingItem = items.find(
    (item: ProjectLibraryItem) => item.id === projectId,
  );
  const nextItem: ProjectLibraryItem = {
    id: projectId,
    name: existingItem?.name || '未命名项目',
    updatedAt,
    graph: {
      ...graph,
      metrics: buildUiMetrics(graph.nodes),
    },
  };
  const itemExists: boolean = items.some(
    (item: ProjectLibraryItem) => item.id === projectId,
  );
  if (!itemExists) {
    return [...items, nextItem];
  }

  return items.map((item: ProjectLibraryItem) =>
    item.id === projectId ? nextItem : item,
  );
}

export function normalizeImportedProject(
  value: unknown,
  fallbackGraph: ProjectGraphResponse | null,
  fileName: string,
): ProjectGraphResponse | null {
  if (isProjectLibraryItem(value)) {
    return {
      ...value.graph,
      metrics: buildUiMetrics(value.graph.nodes),
    };
  }

  if (isProjectGraphResponse(value)) {
    return {
      ...value,
      metrics: buildUiMetrics(value.nodes),
    };
  }

  if (isGraphDraft(value) && fallbackGraph) {
    return {
      ...fallbackGraph,
      nodes: value.nodes,
      edges: value.edges,
      metrics: buildUiMetrics(value.nodes),
    };
  }

  return null;
}

export function writeNodeEdits(nodes: ProjectGraphNode[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const edits: NodeEditMap = {};
  nodes.forEach((node: ProjectGraphNode) => {
    edits[node.id] = {
      title: node.title,
      subtitle: node.subtitle,
      status: node.status,
      owner: node.owner,
      progress: node.progress,
      version: node.version,
      date: node.date,
      tags: node.tags,
      summary: node.summary,
      nextAction: node.nextAction,
      risks: node.risks,
      imageUrl: node.imageUrl,
    };
  });

  window.localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(edits));
}

export function clearNodeEdits(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(GRAPH_STORAGE_KEY);
  window.localStorage.removeItem(GRAPH_DRAFT_STORAGE_KEY);
}

export function parseCommaList(value: string): string[] {
  return value
    .split(/[,，]/u)
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

export function parseLineList(value: string): string[] {
  return value
    .split('\n')
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function findDirectParentId(
  node: ProjectGraphNode,
  edges: ProjectGraphEdge[],
  nodeMap: Map<string, ProjectGraphNode>,
): string | undefined {
  const linkedParentId: string | undefined = node.linkedIds.find(
    (id: string) => id !== node.id && nodeMap.has(id),
  );
  if (linkedParentId) {
    return linkedParentId;
  }

  const edgeParent: ProjectGraphEdge | undefined = edges.find(
    (edge: ProjectGraphEdge) =>
      edge.target === node.id &&
      edge.source !== node.id &&
      nodeMap.has(edge.source),
  );
  if (!edgeParent) {
    return undefined;
  }

  return edgeParent.source;
}

function compareBranchNodes(
  left: ProjectGraphNode,
  right: ProjectGraphNode,
): number {
  const laneRank: Record<ProjectLane, number> = {
    software: 0,
    integration: 1,
    hardware: 2,
  };
  const laneDelta: number = laneRank[left.lane] - laneRank[right.lane];
  if (laneDelta !== 0) {
    return laneDelta;
  }
  return left.date.localeCompare(right.date);
}

function getSubtreeWidth(
  nodeId: string,
  childrenByNode: Map<string, ProjectGraphNode[]>,
  visitedWidths: Map<string, number>,
  nodeWidth: number,
  branchColumnGap: number,
  activeIds: Set<string> = new Set<string>(),
): number {
  const cachedWidth: number | undefined = visitedWidths.get(nodeId);
  if (cachedWidth !== undefined) {
    return cachedWidth;
  }
  if (activeIds.has(nodeId)) {
    return nodeWidth;
  }

  const childWidth: number = getChildrenWidth(
    nodeId,
    childrenByNode,
    visitedWidths,
    nodeWidth,
    branchColumnGap,
    new Set<string>([...activeIds, nodeId]),
  );
  const subtreeWidth: number = Math.max(nodeWidth, childWidth);
  visitedWidths.set(nodeId, subtreeWidth);
  return subtreeWidth;
}

function getChildrenWidth(
  nodeId: string,
  childrenByNode: Map<string, ProjectGraphNode[]>,
  visitedWidths: Map<string, number>,
  nodeWidth: number,
  branchColumnGap: number,
  activeIds: Set<string> = new Set<string>(),
): number {
  const children: ProjectGraphNode[] = [
    ...(childrenByNode.get(nodeId) ?? []),
  ].sort(compareBranchNodes);
  if (children.length === 0) {
    return nodeWidth;
  }

  return children.reduce((totalWidth: number, child: ProjectGraphNode, index: number) => {
    const gapWidth: number = index === 0 ? 0 : branchColumnGap;
    return (
      totalWidth +
      gapWidth +
      getSubtreeWidth(
        child.id,
        childrenByNode,
        visitedWidths,
        nodeWidth,
        branchColumnGap,
        activeIds,
      )
    );
  }, 0);
}

function placeBranchSubtree(
  node: ProjectGraphNode,
  subtreeLeft: number,
  y: number,
  childrenByNode: Map<string, ProjectGraphNode[]>,
  positionedChildren: ProjectGraphNode[],
  visitedWidths: Map<string, number>,
  nodeWidth: number,
  branchColumnGap: number,
  branchGapY: number,
  visitedIds: Set<string>,
): number {
  if (visitedIds.has(node.id)) {
    return 1;
  }

  const nextVisitedIds: Set<string> = new Set(visitedIds);
  nextVisitedIds.add(node.id);
  const subtreeWidth: number = getSubtreeWidth(
    node.id,
    childrenByNode,
    visitedWidths,
    nodeWidth,
    branchColumnGap,
  );
  positionedChildren.push({
    ...node,
    x: subtreeLeft + subtreeWidth / 2 - nodeWidth / 2,
    y,
  });

  const sortedChildren: ProjectGraphNode[] = [
    ...(childrenByNode.get(node.id) ?? []),
  ].sort(compareBranchNodes);
  if (sortedChildren.length === 0) {
    return 1;
  }

  const childrenWidth: number = getChildrenWidth(
    node.id,
    childrenByNode,
    visitedWidths,
    nodeWidth,
    branchColumnGap,
  );
  let childCursorX: number = subtreeLeft + subtreeWidth / 2 - childrenWidth / 2;
  let maxChildDepth: number = 0;
  sortedChildren.forEach((child: ProjectGraphNode) => {
    const childWidth: number = getSubtreeWidth(
      child.id,
      childrenByNode,
      visitedWidths,
      nodeWidth,
      branchColumnGap,
    );
    const childDepth: number = placeBranchSubtree(
      child,
      childCursorX,
      y + branchGapY,
      childrenByNode,
      positionedChildren,
      visitedWidths,
      nodeWidth,
      branchColumnGap,
      branchGapY,
      nextVisitedIds,
    );
    maxChildDepth = Math.max(maxChildDepth, childDepth);
    childCursorX += childWidth + branchColumnGap;
  });

  return 1 + maxChildDepth;
}

function isGraphDraft(value: unknown): value is ProjectGraphDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate: Partial<ProjectGraphDraft> = value;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function isProjectLibraryItem(value: unknown): value is ProjectLibraryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate: Partial<ProjectLibraryItem> = value;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    isProjectGraphResponse(candidate.graph)
  );
}

function isProjectGraphResponse(value: unknown): value is ProjectGraphResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate: Partial<ProjectGraphResponse> = value;
  return (
    Array.isArray(candidate.nodes) &&
    candidate.nodes.every(isProjectGraphNode) &&
    Array.isArray(candidate.edges) &&
    candidate.edges.every(isProjectGraphEdge) &&
    Array.isArray(candidate.metrics) &&
    Array.isArray(candidate.baselines)
  );
}

function isProjectGraphNode(value: unknown): value is ProjectGraphNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate: Partial<ProjectGraphNode> = value;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.subtitle === 'string' &&
    isProjectLane(candidate.lane) &&
    (candidate.owner === null || typeof candidate.owner === 'object') &&
    typeof candidate.progress === 'number' &&
    typeof candidate.version === 'string' &&
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.risks) &&
    Array.isArray(candidate.linkedIds)
  );
}

function isProjectGraphEdge(value: unknown): value is ProjectGraphEdge {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate: Partial<ProjectGraphEdge> = value;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.target === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.critical === 'boolean'
  );
}

function isProjectLane(value: unknown): value is ProjectLane {
  return value === 'hardware' || value === 'software' || value === 'integration';
}

function stripJsonExtension(fileName: string): string {
  const normalizedName: string = fileName.trim();
  return normalizedName.replace(/[.]json$/iu, '') || '导入项目';
}
