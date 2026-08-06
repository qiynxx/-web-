import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleDot,
  Download,
  FolderOpen,
  GitBranch,
  Link,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { projectGraph } from '@client/src/api';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import { useUsersByIds } from '@client/src/components/business-ui/api/users/queries';
import { userInfoToUser } from '@client/src/components/business-ui/user-select/utils';
import { getI18nText } from '@client/src/components/business-ui/utils/user';
import type { User } from '@client/src/components/business-ui/types/user';
import type {
  ProjectBaseline,
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectOwner,
  ProjectGraphResponse,
  ProjectLane,
  ProjectMetric,
  ProjectNodeStatus,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  UpdateProjectGraphNodeRequest,
} from '@shared/api.interface';
import {
  applyNodeEdits,
  buildUiMetrics,
  clampProgress,
  clearNodeEdits,
  createProjectLibraryItem,
  createDefaultNode,
  createEdge,
  DEFAULT_PROJECT_ID,
  filterNodes,
  findAddedNode,
  LANE_LABELS,
  laneOptions,
  layoutGraph,
  normalizeImportedProject,
  parseCommaList,
  parseLineList,
  readActiveProjectId,
  readGraphDraft,
  readNodeEdits,
  readProjectLibrary,
  STATUS_CLASS,
  STATUS_LABELS,
  statusOptions,
  upsertProjectGraph,
  writeActiveProjectId,
  writeGraphDraft,
  writeNodeEdits,
  writeProjectLibrary,
  type EditableNodePatch,
  type GraphLayout,
  type ProjectGraphDraft,
  type ProjectLibraryItem,
} from './project-graph-model';
import './project-graph.css';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { Image } from '@client/src/components/ui/image';

const METRIC_ICON: Record<ProjectMetric['tone'], typeof CircleDot> = {
  neutral: CircleDot,
  good: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

function projectOwnerToUser(owner: ProjectOwner | null): User | null {
  if (!owner?.apaasUserId) return null;
  return {
    user_id: owner.apaasUserId,
    larkUserId: owner.openId,
    name: owner.name || '未知用户',
    avatar: owner.avatar,
    email: owner.email,
  };
}

function userToProjectOwner(user: User | null): ProjectOwner | null {
  if (!user?.user_id) return null;
  const larkIdentifier = user.larkUserId || undefined;
  return {
    apaasUserId: String(user.user_id),
    openId: larkIdentifier?.startsWith('ou_') ? larkIdentifier : undefined,
    larkUserId: larkIdentifier?.startsWith('ou_') ? undefined : larkIdentifier,
    name: getI18nText(user.name) || '未知用户',
    avatar: user.avatar,
    email: user.email,
  };
}

function getRequestErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '未知错误';
  }
  const candidate = error as {
    message?: unknown;
    response?: {
      data?: {
        message?: unknown;
        error?: { message?: unknown };
      };
    };
  };
  const messages: unknown[] = [
    candidate.response?.data?.message,
    candidate.response?.data?.error?.message,
    candidate.message,
  ];
  return (
    messages.find(
      (message: unknown): message is string =>
        typeof message === 'string' && message.trim().length > 0,
    ) ?? '未知错误'
  );
}

function ProjectGraphPage() {
  const [graph, setGraph] = useState<ProjectGraphResponse | null>(null);
  const [projectLibrary, setProjectLibrary] = useState<ProjectLibraryItem[]>(
    [],
  );
  const [activeProjectId, setActiveProjectId] =
    useState<string>(DEFAULT_PROJECT_ID);
  const [selectedId, setSelectedId] = useState<string>('hw-gen21');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');
  const [laneFilter, setLaneFilter] = useState<ProjectLane | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ProjectNodeStatus | 'all'>(
    'all',
  );
  const [query, setQuery] = useState<string>('');
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [savedAt, setSavedAt] = useState<string>('');
  const [creatingNode, setCreatingNode] = useState<boolean>(false);
  const baseSyncTimersRef = useRef<Record<string, number>>({});
  const creatingNodeRef = useRef<boolean>(false);
  const ownerIds = useMemo(
    () => [
      ...new Set(
        (graph?.nodes ?? [])
          .map((node: ProjectGraphNode) => node.owner?.apaasUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
    [graph?.nodes],
  );
  const { data: ownerProfiles } = useUsersByIds(ownerIds, 'apaas');

  useEffect(() => {
    const profileMap = ownerProfiles?.data?.userInfoMap;
    if (!profileMap) return;

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) return currentGraph;
      let changed = false;
      const nodes = currentGraph.nodes.map((node: ProjectGraphNode) => {
        const owner = node.owner;
        if (!owner?.apaasUserId) return node;
        const profile = profileMap[owner.apaasUserId];
        if (!profile) return node;
        const item = userInfoToUser(profile, 'apaas');
        const rawOpenId = profile.larkID || profile.larkUserID || undefined;
        const nextOwner: ProjectOwner = {
          ...owner,
          larkUserId: profile.employeeID || owner.larkUserId,
          openId: rawOpenId?.startsWith('ou_') ? rawOpenId : owner.openId,
          name: item.name || owner.name,
          avatar: item.avatar || owner.avatar,
          email: profile.email || owner.email,
        };
        if (
          nextOwner.name === owner.name &&
          nextOwner.avatar === owner.avatar &&
          nextOwner.email === owner.email &&
          nextOwner.larkUserId === owner.larkUserId &&
          nextOwner.openId === owner.openId
        ) {
          return node;
        }
        changed = true;
        return { ...node, owner: nextOwner };
      });
      return changed ? { ...currentGraph, nodes } : currentGraph;
    });
  }, [ownerProfiles]);

  useEffect(() => {
    void loadGraph();
  }, []);

  async function loadGraph(projectId?: string): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const targetProjectId: string = projectId ?? readActiveProjectId();
      const library: ProjectLibraryItem[] = readProjectLibrary();
      const data: ProjectGraphResponse = await projectGraph.getProjectGraph();
      const isBaseBacked: boolean = !!data.base;
      const draft: ProjectGraphDraft | null = isBaseBacked
        ? null
        : readGraphDraft();
      const editedNodes: ProjectGraphNode[] = isBaseBacked
        ? data.nodes
        : applyNodeEdits(data.nodes, readNodeEdits());
      const nextNodes: ProjectGraphNode[] = draft?.nodes ?? editedNodes;
      const nextEdges: ProjectGraphEdge[] = draft?.edges ?? data.edges;
      const defaultGraph: ProjectGraphResponse = {
        ...data,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      };
      const storedProject: ProjectLibraryItem | undefined = library.find(
        (item: ProjectLibraryItem) => item.id === targetProjectId,
      );
      const nextActiveProjectId: string = storedProject
        ? storedProject.id
        : DEFAULT_PROJECT_ID;
      const nextGraph: ProjectGraphResponse = storedProject
        ? storedProject.graph
        : defaultGraph;
      setProjectLibrary(library);
      setActiveProjectId(nextActiveProjectId);
      writeActiveProjectId(nextActiveProjectId);
      setGraph({
        ...nextGraph,
        metrics: buildUiMetrics(nextGraph.nodes),
      });
      setSelectedId((currentId: string) => {
        const exists: boolean = nextGraph.nodes.some(
          (node: ProjectGraphNode) => node.id === currentId,
        );
        return exists ? currentId : (nextGraph.nodes[0]?.id ?? '');
      });
      setSelectedEdgeId('');
    } catch {
      setError('项目图谱数据加载失败');
    } finally {
      setLoading(false);
    }
  }

  function persistCurrentGraph(nextGraph: ProjectGraphResponse): void {
    if (activeProjectId === DEFAULT_PROJECT_ID) {
      if (nextGraph.base) {
        return;
      }
      writeNodeEdits(nextGraph.nodes);
      writeGraphDraft({ nodes: nextGraph.nodes, edges: nextGraph.edges });
      return;
    }

    const nextLibrary: ProjectLibraryItem[] = upsertProjectGraph(
      projectLibrary,
      activeProjectId,
      nextGraph,
    );
    writeProjectLibrary(nextLibrary);
    setProjectLibrary(nextLibrary);
  }

  function updateSelectedNode(patch: Partial<EditableNodePatch>): void {
    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const nextNodes: ProjectGraphNode[] = currentGraph.nodes.map(
        (node: ProjectGraphNode) =>
          node.id === selectedId ? { ...node, ...patch } : node,
      );
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        nodes: nextNodes,
        metrics: buildUiMetrics(nextNodes),
      };
      persistCurrentGraph(nextGraph);
      if (isDefaultBaseGraph(nextGraph)) {
        queueBaseNodeSync(selectedId, patch as UpdateProjectGraphNodeRequest);
      } else {
        setSavedAt(formatSavedTime());
      }
      return nextGraph;
    });
  }

  function isDefaultBaseGraph(currentGraph: ProjectGraphResponse): boolean {
    return activeProjectId === DEFAULT_PROJECT_ID && !!currentGraph.base;
  }

  function queueBaseNodeSync(
    nodeId: string,
    patch: UpdateProjectGraphNodeRequest,
  ): void {
    if (!nodeId) {
      return;
    }

    window.clearTimeout(baseSyncTimersRef.current[nodeId]);
    baseSyncTimersRef.current[nodeId] = window.setTimeout(() => {
      void syncBaseNode(nodeId, patch);
    }, 500);
  }

  async function syncBaseNode(
    nodeId: string,
    patch: UpdateProjectGraphNodeRequest,
  ): Promise<void> {
    try {
      const syncedGraph: ProjectGraphResponse =
        await projectGraph.updateProjectNode(nodeId, patch);
      if (!syncedGraph.writable) {
        setSavedAt('该字段未写回 Base');
        return;
      }
      setSavedAt(`已写回 Base ${formatSavedTime()}`);
      setError('');
    } catch {
      setError('Base 写回失败：请确认已登录且对该多维表格有编辑权限');
      setSavedAt('写回失败');
    }
  }

  function applyServerGraph(
    nextGraph: ProjectGraphResponse,
    preferredSelectedId?: string,
  ): void {
    const normalizedGraph: ProjectGraphResponse = {
      ...nextGraph,
      metrics: buildUiMetrics(nextGraph.nodes),
    };
    setGraph(normalizedGraph);
    setSelectedId((currentId: string) => {
      if (
        preferredSelectedId &&
        normalizedGraph.nodes.some(
          (node: ProjectGraphNode) => node.id === preferredSelectedId,
        )
      ) {
        return preferredSelectedId;
      }
      const exists: boolean = normalizedGraph.nodes.some(
        (node: ProjectGraphNode) => node.id === currentId,
      );
      return exists ? currentId : (normalizedGraph.nodes[0]?.id ?? '');
    });
    setSelectedEdgeId((currentId: string) => {
      const exists: boolean = normalizedGraph.edges.some(
        (edge: ProjectGraphEdge) => edge.id === currentId,
      );
      return exists ? currentId : '';
    });
    setSavedAt(`已写回 Base ${formatSavedTime()}`);
    setError('');
  }

  async function writeBaseNode(node: ProjectGraphNode): Promise<void> {
    if (creatingNodeRef.current) {
      return;
    }
    creatingNodeRef.current = true;
    setCreatingNode(true);
    const previousNodes: ProjectGraphNode[] = graph?.nodes ?? [];
    try {
      const { id: _id, sourceRecordId: _sourceRecordId, ...payload } = node;
      const nextGraph: ProjectGraphResponse =
        await projectGraph.createProjectNode(
          payload as CreateProjectGraphNodeRequest,
        );
      const createdNode: ProjectGraphNode | undefined = findAddedNode(
        previousNodes,
        nextGraph.nodes,
      );
      applyServerGraph(nextGraph, createdNode?.id);
      setSavedAt(
        createdNode
          ? `已新建“${createdNode.title}”并写回 Base ${formatSavedTime()}`
          : `节点已写回 Base ${formatSavedTime()}`,
      );
    } catch (requestError: unknown) {
      setError(`Base 节点创建失败：${getRequestErrorMessage(requestError)}`);
      setSavedAt('新建失败');
    } finally {
      creatingNodeRef.current = false;
      setCreatingNode(false);
    }
  }

  async function removeBaseNode(nodeId: string): Promise<void> {
    try {
      const nextGraph: ProjectGraphResponse =
        await projectGraph.deleteProjectNode(nodeId);
      applyServerGraph(nextGraph);
    } catch {
      setError('Base 节点删除失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  async function writeBaseEdge(edge: ProjectGraphEdge): Promise<void> {
    try {
      const { id: _id, ...payload } = edge;
      const nextGraph: ProjectGraphResponse =
        await projectGraph.createProjectEdge(
          payload as CreateProjectGraphEdgeRequest,
        );
      applyServerGraph(nextGraph);
    } catch {
      setError('Base 连线创建失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  async function patchBaseEdge(
    edgeId: string,
    patch: Partial<Pick<ProjectGraphEdge, 'label' | 'critical'>>,
  ): Promise<void> {
    try {
      const nextGraph: ProjectGraphResponse =
        await projectGraph.updateProjectEdge(edgeId, patch);
      applyServerGraph(nextGraph);
    } catch {
      setError('Base 连线更新失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  async function removeBaseEdge(edgeId: string): Promise<void> {
    try {
      const nextGraph: ProjectGraphResponse =
        await projectGraph.deleteProjectEdge(edgeId);
      applyServerGraph(nextGraph);
    } catch {
      setError('Base 连线删除失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  function addNode(lane: ProjectLane, parentId: string | null): void {
    if (graph && isDefaultBaseGraph(graph)) {
      const nextNode: ProjectGraphNode = createDefaultNode(
        lane,
        parentId,
        graph.nodes.length,
      );
      void writeBaseNode(nextNode);
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const nextNode: ProjectGraphNode = createDefaultNode(
        lane,
        parentId,
        currentGraph.nodes.length,
      );
      const nextEdges: ProjectGraphEdge[] =
        parentId && parentId !== nextNode.id
          ? [
              ...currentGraph.edges,
              createEdge(
                parentId,
                nextNode.id,
                lane === 'hardware' ? '演进' : '派生',
              ),
            ]
          : currentGraph.edges;
      const nextNodes: ProjectGraphNode[] = [...currentGraph.nodes, nextNode];
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      };
      persistCurrentGraph(nextGraph);
      setSelectedId(nextNode.id);
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function addChildNode(parentId: string): void {
    const parentNode: ProjectGraphNode | undefined = graph?.nodes.find(
      (node: ProjectGraphNode) => node.id === parentId,
    );
    if (!parentNode) {
      return;
    }

    const childLane: ProjectLane =
      parentNode.lane === 'hardware'
        ? 'software'
        : parentNode.lane === 'software'
          ? 'integration'
          : parentNode.lane;
    addNode(childLane, parentId);
  }

  function deleteNode(nodeId: string): void {
    if (graph && isDefaultBaseGraph(graph)) {
      void removeBaseNode(nodeId);
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph || currentGraph.nodes.length <= 1) {
        return currentGraph;
      }

      const nextNodes: ProjectGraphNode[] = currentGraph.nodes.filter(
        (node: ProjectGraphNode) => node.id !== nodeId,
      );
      const nextEdges: ProjectGraphEdge[] = currentGraph.edges.filter(
        (edge: ProjectGraphEdge) =>
          edge.source !== nodeId && edge.target !== nodeId,
      );
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      };
      persistCurrentGraph(nextGraph);
      setSelectedId(nextNodes[0]?.id ?? '');
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function addEdge(targetId: string, label: string): void {
    addTreeEdge(targetId, label);
  }

  function addConnectionEdge(
    sourceId: string,
    targetId: string,
    label: string,
  ): void {
    if (graph && isDefaultBaseGraph(graph)) {
      void writeBaseEdge(createEdge(sourceId, targetId, label));
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph || !sourceId || sourceId === targetId) {
        return currentGraph;
      }

      const edgeExists: boolean = currentGraph.edges.some(
        (edge: ProjectGraphEdge) =>
          edge.source === sourceId && edge.target === targetId,
      );
      if (edgeExists) {
        return currentGraph;
      }

      const nextEdges: ProjectGraphEdge[] = [
        ...currentGraph.edges,
        createEdge(sourceId, targetId, label),
      ];
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        edges: nextEdges,
        metrics: buildUiMetrics(currentGraph.nodes),
      };
      persistCurrentGraph(nextGraph);
      setSelectedId(targetId);
      setSelectedEdgeId(nextEdges[nextEdges.length - 1]?.id ?? '');
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function addTreeEdge(targetId: string, label: string): void {
    if (graph && isDefaultBaseGraph(graph)) {
      void writeBaseEdge(createEdge(selectedId, targetId, label));
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph || !selectedId || selectedId === targetId) {
        return currentGraph;
      }

      const edgeExists: boolean = currentGraph.edges.some(
        (edge: ProjectGraphEdge) =>
          edge.source === selectedId && edge.target === targetId,
      );
      if (edgeExists) {
        return currentGraph;
      }

      const nextEdges: ProjectGraphEdge[] = [
        ...currentGraph.edges,
        createEdge(selectedId, targetId, label),
      ];
      const nextNodes: ProjectGraphNode[] = currentGraph.nodes.map(
        (node: ProjectGraphNode) =>
          node.id === targetId
            ? {
                ...node,
                linkedIds: [
                  selectedId,
                  ...node.linkedIds.filter((id: string) => id !== selectedId),
                ],
              }
            : node,
      );
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      };
      persistCurrentGraph(nextGraph);
      setSelectedEdgeId(nextEdges[nextEdges.length - 1]?.id ?? '');
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function updateEdge(
    edgeId: string,
    patch: Partial<Pick<ProjectGraphEdge, 'label' | 'critical'>>,
  ): void {
    if (graph && isDefaultBaseGraph(graph)) {
      void patchBaseEdge(edgeId, patch);
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const nextEdges: ProjectGraphEdge[] = currentGraph.edges.map(
        (edge: ProjectGraphEdge) =>
          edge.id === edgeId ? { ...edge, ...patch } : edge,
      );
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        edges: nextEdges,
        metrics: buildUiMetrics(currentGraph.nodes),
      };
      persistCurrentGraph(nextGraph);
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function deleteEdge(edgeId: string): void {
    if (graph && isDefaultBaseGraph(graph)) {
      void removeBaseEdge(edgeId);
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) {
        return currentGraph;
      }

      const deletedEdge: ProjectGraphEdge | undefined = currentGraph.edges.find(
        (edge: ProjectGraphEdge) => edge.id === edgeId,
      );
      const nextEdges: ProjectGraphEdge[] = currentGraph.edges.filter(
        (edge: ProjectGraphEdge) => edge.id !== edgeId,
      );
      const nextNodes: ProjectGraphNode[] = deletedEdge
        ? currentGraph.nodes.map((node: ProjectGraphNode) =>
            node.id === deletedEdge.target
              ? {
                  ...node,
                  linkedIds: node.linkedIds.filter(
                    (id: string) => id !== deletedEdge.source,
                  ),
                }
              : node,
          )
        : currentGraph.nodes;
      const nextGraph: ProjectGraphResponse = {
        ...currentGraph,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      };
      persistCurrentGraph(nextGraph);
      setSelectedEdgeId('');
      setSavedAt(formatSavedTime());
      return nextGraph;
    });
  }

  function resetLocalEdits(): void {
    if (activeProjectId !== DEFAULT_PROJECT_ID) {
      setSavedAt('当前项目已自动保存');
      return;
    }
    clearNodeEdits();
    setSavedAt('');
    void loadGraph(DEFAULT_PROJECT_ID);
  }

  function switchProject(projectId: string): void {
    writeActiveProjectId(projectId);
    setSelectedEdgeId('');
    setSavedAt('');
    void loadGraph(projectId);
  }

  function createProjectFromCurrent(): void {
    if (!graph) {
      return;
    }

    const currentName: string =
      activeProjectId === DEFAULT_PROJECT_ID
        ? '默认头戴项目'
        : (projectLibrary.find(
            (item: ProjectLibraryItem) => item.id === activeProjectId,
          )?.name ?? '未命名项目');
    const projectName: string = `${currentName} 副本`;
    const item: ProjectLibraryItem = createProjectLibraryItem(
      projectName,
      graph,
    );
    const nextLibrary: ProjectLibraryItem[] = [...projectLibrary, item];
    writeProjectLibrary(nextLibrary);
    writeActiveProjectId(item.id);
    setProjectLibrary(nextLibrary);
    setActiveProjectId(item.id);
    setGraph(item.graph);
    setSelectedId(item.graph.nodes[0]?.id ?? '');
    setSelectedEdgeId('');
    setSavedAt(formatSavedTime());
  }

  async function importProjectFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file: File | undefined = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const fileText: string = await file.text();
      const parsedValue: unknown = JSON.parse(fileText);
      const importedGraph: ProjectGraphResponse | null =
        normalizeImportedProject(parsedValue, graph, file.name);
      if (!importedGraph) {
        setError('导入失败：文件不是有效的项目图谱 JSON');
        return;
      }

      const importedName: string =
        activeProjectId === DEFAULT_PROJECT_ID
          ? '导入项目'
          : (projectLibrary.find(
              (item: ProjectLibraryItem) => item.id === activeProjectId,
            )?.name ?? '导入项目');
      const item: ProjectLibraryItem = createProjectLibraryItem(
        importedName,
        importedGraph,
      );
      const nextLibrary: ProjectLibraryItem[] = [...projectLibrary, item];
      writeProjectLibrary(nextLibrary);
      writeActiveProjectId(item.id);
      setProjectLibrary(nextLibrary);
      setActiveProjectId(item.id);
      setGraph(item.graph);
      setSelectedId(item.graph.nodes[0]?.id ?? '');
      setSelectedEdgeId('');
      setSavedAt(formatSavedTime());
      setError('');
    } catch {
      setError('导入失败：JSON 文件无法解析');
    }
  }

  function exportCurrentProject(): void {
    if (!graph) {
      return;
    }

    const exportName: string =
      activeProjectId === DEFAULT_PROJECT_ID
        ? '默认头戴项目'
        : (projectLibrary.find(
            (item: ProjectLibraryItem) => item.id === activeProjectId,
          )?.name ?? '项目图谱');
    const fileName: string = `${exportName}.json`;
    const blob: Blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: 'application/json',
    });
    const objectUrl: string = URL.createObjectURL(blob);
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  const filteredNodes: ProjectGraphNode[] = useMemo(() => {
    if (!graph) {
      return [];
    }
    return filterNodes(
      graph.nodes,
      laneFilter,
      statusFilter,
      query,
      compactMode,
    );
  }, [compactMode, graph, laneFilter, query, statusFilter]);

  const graphLayout: GraphLayout = useMemo(() => {
    return layoutGraph(filteredNodes, graph?.edges ?? []);
  }, [filteredNodes, graph]);

  const selectedNode: ProjectGraphNode | undefined = useMemo(() => {
    return graph?.nodes.find(
      (node: ProjectGraphNode) => node.id === selectedId,
    );
  }, [graph, selectedId]);

  const selectedEdge: ProjectGraphEdge | undefined = useMemo(() => {
    return graph?.edges.find(
      (edge: ProjectGraphEdge) => edge.id === selectedEdgeId,
    );
  }, [graph, selectedEdgeId]);

  if (loading && !graph) {
    return (
      <main className="graph-shell loading-shell">
        <GitBranch className="loading-icon" />
        <p>正在加载项目图谱</p>
      </main>
    );
  }

  if (!graph) {
    return (
      <main className="graph-shell loading-shell">
        <ShieldAlert className="loading-icon error-icon" />
        <p>{error || '项目图谱不可用'}</p>
        <Button onClick={() => void loadGraph()} variant="outline">
          <RefreshCw />
          重新加载
        </Button>
      </main>
    );
  }

  return (
    <main className="graph-shell">
      <section className="graph-header">
        <div>
          <div className="eyebrow">
            <GitBranch />
            硬件主干 / 软件分支
          </div>
          <h1>
            {activeProjectId === DEFAULT_PROJECT_ID
              ? '默认头戴项目'
              : (projectLibrary.find(
                  (item: ProjectLibraryItem) => item.id === activeProjectId,
                )?.name ?? '未命名项目')}
          </h1>
          <p>
            横向跟踪慢节奏硬件版本，纵向展开每个硬件版本下的软件算法、
            联调测试和风险闭环。
          </p>
        </div>
        <div className="header-actions">
          <div className="project-switcher">
            <FolderOpen />
            <select
              aria-label="切换项目"
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                switchProject(event.target.value)
              }
              value={activeProjectId}
            >
              <option value={DEFAULT_PROJECT_ID}>默认头戴项目</option>
              {projectLibrary.map((item: ProjectLibraryItem) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={createProjectFromCurrent} variant="outline">
            <Plus />
            新建项目
          </Button>
          <Button asChild variant="outline">
            <label className="file-import-button">
              <Upload />
              导入项目
              <input
                accept="application/json,.json"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  void importProjectFile(event)
                }
                type="file"
              />
            </label>
          </Button>
          <Button onClick={exportCurrentProject} variant="outline">
            <Download />
            导出
          </Button>
          <Button onClick={() => void loadGraph()} variant="outline">
            <RefreshCw />
            刷新
          </Button>
          <Button onClick={resetLocalEdits} variant="outline">
            <RotateCcw />
            恢复默认
          </Button>
          <Button asChild>
            <UniversalLink
              to={graph.base?.url ?? '#'}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowUpRight />
              打开 Base
            </UniversalLink>
          </Button>
        </div>
      </section>

      {error ? <div className="graph-alert">{error}</div> : null}
      {graph.message || graph.base ? (
        <div
          className={`data-source-banner source-${graph.base ? 'base' : 'static'}`}
        >
          <div>
            <strong>{graph.base ? 'Base 多维表格' : '本地静态数据'}</strong>
            <span>{graph.base ? '多维表格作为数据库' : '后端静态兆底'}</span>
          </div>
          {graph.message ? <p>{graph.message}</p> : null}
          <Badge variant="outline">
            {graph.writable ? '可写回' : '只读显示'}
          </Badge>
        </div>
      ) : null}

      <section className="metric-strip">
        {graph.metrics.map((metric: ProjectMetric) => {
          const MetricIcon = METRIC_ICON[metric.tone];
          return (
            <div className={`metric-tile tone-${metric.tone}`} key={metric.key}>
              <MetricIcon />
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            </div>
          );
        })}
      </section>

      <section className="graph-workspace">
        <div className="graph-main-panel">
          <div className="graph-toolbar">
            <div className="search-box">
              <Search />
              <Input
                aria-label="搜索节点"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setQuery(event.target.value)
                }
                placeholder="搜索版本、负责人、工作内容、标签"
                value={query}
              />
            </div>
            <SegmentedControl<ProjectLane | 'all'>
              label="类型"
              onChange={setLaneFilter}
              options={laneOptions}
              renderLabel={(value: ProjectLane | 'all') => LANE_LABELS[value]}
              value={laneFilter}
            />
            <SegmentedControl<ProjectNodeStatus | 'all'>
              label="状态"
              onChange={setStatusFilter}
              options={statusOptions}
              renderLabel={(value: ProjectNodeStatus | 'all') =>
                STATUS_LABELS[value]
              }
              value={statusFilter}
            />
            <button
              className={
                compactMode ? 'compact-toggle active' : 'compact-toggle'
              }
              onClick={() => setCompactMode((current: boolean) => !current)}
              type="button"
            >
              简洁模式
            </button>
          </div>

          <GraphCanvas
            creatingNode={creatingNode}
            layout={graphLayout}
            onAddChild={addChildNode}
            onConnectNodes={addConnectionEdge}
            onDeleteEdge={deleteEdge}
            onDeleteNode={deleteNode}
            onSelectEdge={setSelectedEdgeId}
            onSelect={setSelectedId}
            selectedEdgeId={selectedEdgeId}
            selectedId={selectedId}
          />
        </div>

        <aside className="graph-side-panel">
          {selectedNode ? (
            <NodeEditor
              isBaseBacked={isDefaultBaseGraph(graph)}
              node={selectedNode}
              onUpdate={updateSelectedNode}
              savedAt={savedAt}
            />
          ) : null}
          <FlowEditor
            creatingNode={creatingNode}
            edges={graph.edges}
            nodes={graph.nodes}
            onAddNode={addNode}
            onAddTreeEdge={addEdge}
            onDeleteEdge={deleteEdge}
            onDeleteNode={deleteNode}
            onUpdateEdge={updateEdge}
            selectedEdge={selectedEdge}
            selectedId={selectedId}
          />
          <BaselineList baselines={graph.baselines} />
        </aside>
      </section>
    </main>
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: T[];
  value: T;
  renderLabel: (value: T) => string;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  renderLabel,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="segmented-group" role="group" aria-label={label}>
      {options.map((option: T) => (
        <button
          className={option === value ? 'segment active' : 'segment'}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {renderLabel(option)}
        </button>
      ))}
    </div>
  );
}

interface GraphCanvasProps {
  creatingNode: boolean;
  layout: GraphLayout;
  selectedId: string;
  selectedEdgeId: string;
  onSelect: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onAddChild: (id: string) => void;
  onConnectNodes: (sourceId: string, targetId: string, label: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
}

interface DragConnectionState {
  sourceId: string;
  x: number;
  y: number;
}

function GraphCanvas({
  creatingNode,
  layout,
  selectedId,
  selectedEdgeId,
  onSelect,
  onSelectEdge,
  onAddChild,
  onConnectNodes,
  onDeleteEdge,
  onDeleteNode,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragConnection, setDragConnection] =
    useState<DragConnectionState | null>(null);
  const nodeMap: Map<string, ProjectGraphNode> = useMemo(() => {
    return new Map(
      layout.nodes.map((node: ProjectGraphNode) => [node.id, node]),
    );
  }, [layout.nodes]);
  const selectedLayoutNode: ProjectGraphNode | undefined =
    nodeMap.get(selectedId);
  const selectedRelatedEdges: ProjectGraphEdge[] = layout.edges.filter(
    (edge: ProjectGraphEdge) =>
      edge.source === selectedId || edge.target === selectedId,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const selectedNode = stageRef.current?.querySelector<HTMLElement>(
      '.graph-node.selected',
    );
    if (!canvas || !selectedNode) {
      return;
    }
    const margin = 24;
    const nodeLeft = selectedNode.offsetLeft;
    const nodeRight = nodeLeft + selectedNode.offsetWidth;
    const nodeTop = selectedNode.offsetTop;
    const nodeBottom = nodeTop + selectedNode.offsetHeight;
    const visibleLeft = canvas.scrollLeft;
    const visibleRight = visibleLeft + canvas.clientWidth;
    const visibleTop = canvas.scrollTop;
    const visibleBottom = visibleTop + canvas.clientHeight;
    if (
      nodeLeft >= visibleLeft + margin &&
      nodeRight <= visibleRight - margin &&
      nodeTop >= visibleTop + margin &&
      nodeBottom <= visibleBottom - margin
    ) {
      return;
    }
    canvas.scrollTo({
      behavior: 'smooth',
      left: Math.max(
        0,
        nodeLeft - (canvas.clientWidth - selectedNode.offsetWidth) / 2,
      ),
      top: Math.max(
        0,
        nodeTop - (canvas.clientHeight - selectedNode.offsetHeight) / 2,
      ),
    });
  }, [layout.nodes, selectedId]);

  function getStagePoint(event: React.PointerEvent<HTMLElement>): {
    x: number;
    y: number;
  } {
    const rect: DOMRect | undefined = stageRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }

  function startConnectionDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    sourceId: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const pointerPoint: { x: number; y: number } = getStagePoint(event);
    setDragConnection({ sourceId, ...pointerPoint });
    onSelect(sourceId);
  }

  function updateConnectionDrag(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (!dragConnection) {
      return;
    }
    const pointerPoint: { x: number; y: number } = getStagePoint(event);
    setDragConnection((current: DragConnectionState | null) =>
      current ? { ...current, ...pointerPoint } : current,
    );
  }

  function finishConnectionDrag(targetId: string): void {
    if (!dragConnection || dragConnection.sourceId === targetId) {
      setDragConnection(null);
      return;
    }
    onConnectNodes(dragConnection.sourceId, targetId, '关联');
    setDragConnection(null);
  }

  return (
    <div className="graph-canvas" ref={canvasRef}>
      <div
        className="graph-stage"
        onPointerMove={updateConnectionDrag}
        onPointerUp={() => setDragConnection(null)}
        ref={stageRef}
        style={{ height: layout.height, width: layout.width }}
      >
        <div className="hardware-rail" />
        <div className="stage-label hardware-stage-label">硬件主分支</div>
        <div className="stage-label software-stage-label">
          软件 / 算法 / 测试
        </div>
        <svg
          className="edge-layer"
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
        >
          {layout.edges.map((edge: ProjectGraphEdge) => {
            const source: ProjectGraphNode | undefined = nodeMap.get(
              edge.source,
            );
            const target: ProjectGraphNode | undefined = nodeMap.get(
              edge.target,
            );
            if (!source || !target) {
              return null;
            }
            const treeEdge: boolean = isTreeEdge(source, target);
            const highlighted: boolean = edge.id === selectedEdgeId;
            const visibleEdge: boolean =
              treeEdge || highlighted || edge.critical;
            if (!visibleEdge) {
              return null;
            }
            const edgeClassName: string = [
              'edge',
              treeEdge ? 'tree-edge' : 'cross-edge',
              edge.critical ? 'critical' : '',
            ].join(' ');
            return (
              <g
                className={[
                  'edge-group',
                  treeEdge ? 'tree-link' : 'cross-link',
                  highlighted ? 'selected' : '',
                ].join(' ')}
                key={edge.id}
                onClick={() => onSelectEdge(edge.id)}
              >
                <path className={edgeClassName} d={edgePath(source, target)} />
                {highlighted ? (
                  <text
                    className="edge-label"
                    x={(source.x + target.x) / 2 + 36}
                    y={(source.y + target.y) / 2 - 6}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {dragConnection ? (
            <path
              className="edge drag-preview-edge"
              d={dragPreviewPath(dragConnection, nodeMap)}
            />
          ) : null}
        </svg>
        {layout.nodes.map((node: ProjectGraphNode) => (
          <div
            className={[
              'graph-node',
              node.lane === 'hardware' ? 'hardware-node' : 'branch-node',
              STATUS_CLASS[node.status],
              selectedId === node.id ? 'selected' : '',
              dragConnection && dragConnection.sourceId !== node.id
                ? 'connection-target'
                : '',
            ].join(' ')}
            key={node.id}
            onClick={() => onSelect(node.id)}
            onPointerUp={(event: React.PointerEvent<HTMLDivElement>) => {
              if (!dragConnection) {
                return;
              }
              event.stopPropagation();
              finishConnectionDrag(node.id);
            }}
            role="button"
            style={{ left: node.x, top: node.y }}
            tabIndex={0}
          >
            <button
              aria-label={`为 ${node.title} 新建子分支`}
              className="node-quick-add"
              disabled={creatingNode}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onAddChild(node.id);
              }}
              type="button"
            >
              <Plus />
            </button>
            <button
              aria-label={`删除 ${node.title}`}
              className="node-delete-button"
              disabled={layout.nodes.length <= 1}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onDeleteNode(node.id);
              }}
              type="button"
            >
              <Trash2 />
            </button>
            <HardwareThumbnail node={node} />
            <span className="node-text">
              <span className="node-kind">{LANE_LABELS[node.lane]}</span>
              <strong>{node.title}</strong>
              <small>{node.subtitle}</small>
              <span className="node-owner">{node.owner?.name || '待指定'}</span>
            </span>
            <button
              aria-label={`从 ${node.title} 拖拽建立连接`}
              className="node-connect-handle"
              onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) =>
                startConnectionDrag(event, node.id)
              }
              type="button"
            >
              <Link />
            </button>
            <span className="node-progress">
              <span style={{ width: `${node.progress}%` }} />
            </span>
          </div>
        ))}
        {selectedLayoutNode && selectedRelatedEdges.length > 0 ? (
          <div
            className="node-edge-popover"
            style={{
              left: selectedLayoutNode.x,
              top: selectedLayoutNode.y + 138,
            }}
          >
            <span>连接</span>
            {selectedRelatedEdges.map((edge: ProjectGraphEdge) => {
              const source: ProjectGraphNode | undefined = nodeMap.get(
                edge.source,
              );
              const target: ProjectGraphNode | undefined = nodeMap.get(
                edge.target,
              );
              return (
                <button
                  className={[
                    'node-edge-chip',
                    edge.id === selectedEdgeId ? 'selected' : '',
                    edge.critical ? 'critical' : '',
                  ].join(' ')}
                  key={edge.id}
                  onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onSelectEdge(edge.id);
                  }}
                  type="button"
                >
                  <small>
                    {source?.title ?? edge.source} →{' '}
                    {target?.title ?? edge.target}
                  </small>
                  <strong>{edge.label}</strong>
                  <span
                    aria-label={`删除连接 ${edge.label}`}
                    className="node-edge-delete"
                    onClick={(event: React.MouseEvent<HTMLSpanElement>) => {
                      event.stopPropagation();
                      onDeleteEdge(edge.id);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Trash2 />
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {layout.nodes.length === 0 ? (
          <div className="empty-graph">
            <Boxes />
            <span>没有符合筛选条件的节点</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface HardwareThumbnailProps {
  node: ProjectGraphNode;
}

function HardwareThumbnail({ node }: HardwareThumbnailProps) {
  const generationClass: string = node.id.includes('gen21')
    ? 'thumb-gen21'
    : node.id.includes('gen2')
      ? 'thumb-gen2'
      : 'thumb-gen1';

  return (
    <span className={`node-visual ${generationClass}`}>
      {node.imageUrl ? (
        <Image alt="" src={node.imageUrl} />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 90 58">
          <rect
            className="device-band"
            height="10"
            rx="5"
            width="72"
            x="9"
            y="10"
          />
          <rect
            className="device-body"
            height="32"
            rx="10"
            width="56"
            x="17"
            y="18"
          />
          <circle className="device-lens left" cx="35" cy="34" r="7" />
          <circle className="device-lens right" cx="55" cy="34" r="7" />
          <path className="device-trace" d="M 24 24 L 66 24 M 30 46 L 60 46" />
        </svg>
      )}
    </span>
  );
}

function isTreeEdge(
  source: ProjectGraphNode,
  target: ProjectGraphNode,
): boolean {
  if (source.lane === 'hardware' && target.lane === 'hardware') {
    return true;
  }
  return target.linkedIds[0] === source.id;
}

function edgePath(source: ProjectGraphNode, target: ProjectGraphNode): string {
  const nodeWidth: number = 220;
  const nodeHeight: number = 128;
  const sourceCenterX: number = source.x + nodeWidth / 2;
  const sourceCenterY: number = source.y + nodeHeight / 2;
  const targetCenterX: number = target.x + nodeWidth / 2;
  const targetCenterY: number = target.y + nodeHeight / 2;

  if (source.lane === 'hardware' && target.lane === 'hardware') {
    return [
      `M ${source.x + nodeWidth} ${sourceCenterY}`,
      `L ${target.x} ${targetCenterY}`,
    ].join(' ');
  }

  if (isTreeEdge(source, target)) {
    const bendY: number = source.y + nodeHeight + 42;
    return [
      `M ${sourceCenterX} ${source.y + nodeHeight}`,
      `L ${sourceCenterX} ${bendY}`,
      `L ${targetCenterX} ${bendY}`,
      `L ${targetCenterX} ${target.y}`,
    ].join(' ');
  }

  const bendY: number = sourceCenterY + (targetCenterY - sourceCenterY) / 2;
  return [
    `M ${source.x + nodeWidth} ${sourceCenterY}`,
    `C ${source.x + nodeWidth + 56} ${sourceCenterY}`,
    `${target.x - 56} ${bendY}`,
    `${target.x} ${targetCenterY}`,
  ].join(' ');
}

function dragPreviewPath(
  dragConnection: DragConnectionState,
  nodeMap: Map<string, ProjectGraphNode>,
): string {
  const source: ProjectGraphNode | undefined = nodeMap.get(
    dragConnection.sourceId,
  );
  if (!source) {
    return '';
  }

  const nodeWidth: number = 220;
  const nodeHeight: number = 128;
  const sourceX: number = source.x + nodeWidth;
  const sourceY: number = source.y + nodeHeight / 2;
  const bendX: number =
    sourceX + Math.max(56, (dragConnection.x - sourceX) / 2);
  return [
    `M ${sourceX} ${sourceY}`,
    `C ${bendX} ${sourceY}`,
    `${bendX} ${dragConnection.y}`,
    `${dragConnection.x} ${dragConnection.y}`,
  ].join(' ');
}

interface NodeEditorProps {
  node: ProjectGraphNode;
  isBaseBacked: boolean;
  savedAt: string;
  onUpdate: (patch: Partial<EditableNodePatch>) => void;
}

function NodeEditor({
  node,
  isBaseBacked,
  savedAt,
  onUpdate,
}: NodeEditorProps) {
  async function updateImageFromFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file: File | undefined = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const imageUrl: string = await readFileAsDataUrl(file);
    onUpdate({ imageUrl });
  }

  return (
    <section className="detail-panel">
      <div className="detail-heading">
        <Badge className={STATUS_CLASS[node.status]} variant="outline">
          {STATUS_LABELS[node.status]}
        </Badge>
        <span>{LANE_LABELS[node.lane]}</span>
      </div>

      <div className="editor-title">
        <Pencil />
        <h2>编辑节点</h2>
      </div>

      <label className="field-stack">
        <span>项目名称</span>
        <Input
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onUpdate({ title: event.target.value })
          }
          value={node.title}
        />
      </label>

      <div className="node-image-editor">
        <HardwareThumbnail node={node} />
        <div>
          <label className="field-stack">
            <span>节点图片 URL</span>
            <Input
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onUpdate({ imageUrl: event.target.value })
              }
              placeholder="粘贴图片链接，或上传本地图片"
              value={node.imageUrl ?? ''}
            />
          </label>
          <div className="image-action-row">
            <label className="image-upload-button">
              <Upload />
              上传图片
              <input
                accept="image/*"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  void updateImageFromFile(event)
                }
                type="file"
              />
            </label>
            <button
              className="image-clear-button"
              onClick={() => onUpdate({ imageUrl: '' })}
              type="button"
            >
              恢复示意图
            </button>
          </div>
        </div>
      </div>

      <div className="editor-grid">
        <label className="field-stack">
          <span>负责人</span>
          <UserSelect
            accountType="apaas"
            onChange={(user: User | null) =>
              onUpdate({ owner: userToProjectOwner(user) })
            }
            placeholder="请选择负责人"
            value={projectOwnerToUser(node.owner)}
            valueType="object"
          />
        </label>
        <label className="field-stack">
          <span>状态</span>
          <select
            className="editor-select"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              onUpdate({ status: event.target.value as ProjectNodeStatus })
            }
            value={node.status}
          >
            {statusOptions
              .filter((status: ProjectNodeStatus | 'all') => status !== 'all')
              .map((status: ProjectNodeStatus | 'all') => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="editor-grid">
        <label className="field-stack">
          <span>版本 / 分支</span>
          <Input
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onUpdate({ version: event.target.value })
            }
            value={node.version}
          />
        </label>
        <label className="field-stack">
          <span>日期</span>
          <Input
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onUpdate({ date: event.target.value })
            }
            value={node.date}
          />
        </label>
      </div>

      <label className="field-stack">
        <span>进度 {node.progress}%</span>
        <input
          className="progress-slider"
          max="100"
          min="0"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onUpdate({ progress: clampProgress(Number(event.target.value)) })
          }
          type="range"
          value={node.progress}
        />
      </label>

      <label className="field-stack">
        <span>工作内容</span>
        <Textarea
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdate({ summary: event.target.value })
          }
          value={node.summary}
        />
      </label>

      <label className="field-stack">
        <span>下一步</span>
        <Textarea
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdate({ nextAction: event.target.value })
          }
          value={node.nextAction}
        />
      </label>

      <label className="field-stack">
        <span>标签</span>
        <Input
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onUpdate({ tags: parseCommaList(event.target.value) })
          }
          value={node.tags.join('，')}
        />
      </label>

      <label className="field-stack">
        <span>风险 / 阻塞</span>
        <Textarea
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdate({ risks: parseLineList(event.target.value) })
          }
          value={node.risks.join('\n')}
        />
      </label>

      <div className="save-state">
        <Save />
        <span>
          {savedAt ||
            (isBaseBacked ? '表内字段会自动写回 Base' : '修改会自动保存到本机')}
        </span>
      </div>
    </section>
  );
}

interface FlowEditorProps {
  creatingNode: boolean;
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  selectedId: string;
  selectedEdge: ProjectGraphEdge | undefined;
  onAddNode: (lane: ProjectLane, parentId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddTreeEdge: (targetId: string, label: string) => void;
  onUpdateEdge: (
    edgeId: string,
    patch: Partial<Pick<ProjectGraphEdge, 'label' | 'critical'>>,
  ) => void;
  onDeleteEdge: (edgeId: string) => void;
}

function FlowEditor({
  creatingNode,
  nodes,
  edges,
  selectedId,
  selectedEdge,
  onAddNode,
  onDeleteNode,
  onAddTreeEdge,
  onUpdateEdge,
  onDeleteEdge,
}: FlowEditorProps) {
  const selectedNode: ProjectGraphNode | undefined = nodes.find(
    (node: ProjectGraphNode) => node.id === selectedId,
  );
  const [newLane, setNewLane] = useState<ProjectLane>('software');
  const [parentId, setParentId] = useState<string>(nodes[0]?.id ?? '');
  const [targetId, setTargetId] = useState<string>('');
  const [edgeLabel, setEdgeLabel] = useState<string>('依赖');

  useEffect(() => {
    if (!parentId && nodes[0]?.id) {
      setParentId(nodes[0].id);
    }
  }, [nodes, parentId]);

  useEffect(() => {
    const fallbackTarget: string =
      nodes.find((node: ProjectGraphNode) => node.id !== selectedId)?.id ?? '';
    setTargetId((currentTarget: string) => {
      const exists: boolean = nodes.some(
        (node: ProjectGraphNode) => node.id === currentTarget,
      );
      return exists && currentTarget !== selectedId
        ? currentTarget
        : fallbackTarget;
    });
  }, [nodes, selectedId]);

  const relatedEdges: ProjectGraphEdge[] = edges.filter(
    (edge: ProjectGraphEdge) =>
      edge.source === selectedId || edge.target === selectedId,
  );

  return (
    <section className="flow-editor-panel">
      <div className="editor-title">
        <GitBranch />
        <h2>流程图编辑</h2>
      </div>

      <div className="editor-grid">
        <label className="field-stack">
          <span>新增分组</span>
          <select
            className="editor-select"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setNewLane(event.target.value as ProjectLane)
            }
            value={newLane}
          >
            <option value="hardware">硬件主干</option>
            <option value="software">软件算法</option>
            <option value="integration">联调测试</option>
          </select>
        </label>
        <label className="field-stack">
          <span>挂到节点</span>
          <select
            className="editor-select"
            disabled={newLane === 'hardware'}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setParentId(event.target.value)
            }
            value={parentId}
          >
            {nodes.map((node: ProjectGraphNode) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button
        className="full-width-action"
        disabled={creatingNode}
        onClick={() =>
          onAddNode(newLane, newLane === 'hardware' ? null : parentId)
        }
        variant="outline"
      >
        <Plus />
        {creatingNode ? '正在新建并写回 Base…' : '新增流程节点'}
      </Button>

      <div className="divider-line" />

      <label className="field-stack">
        <span>将当前节点设为父节点</span>
        <select
          className="editor-select"
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
            setTargetId(event.target.value)
          }
          value={targetId}
        >
          {nodes
            .filter((node: ProjectGraphNode) => node.id !== selectedId)
            .map((node: ProjectGraphNode) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
        </select>
      </label>
      <label className="field-stack">
        <span>父子关系说明</span>
        <Input
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setEdgeLabel(event.target.value)
          }
          value={edgeLabel}
        />
      </label>
      <Button
        className="full-width-action"
        disabled={!targetId}
        onClick={() => onAddTreeEdge(targetId, edgeLabel)}
        variant="outline"
      >
        <Link />
        建立树状分支
      </Button>

      <div className="edge-edit-list">
        <span>当前节点连接</span>
        {selectedEdge ? (
          <div className="selected-edge-editor">
            <label className="field-stack">
              <span>选中连接说明</span>
              <Input
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateEdge(selectedEdge.id, { label: event.target.value })
                }
                value={selectedEdge.label}
              />
            </label>
            <label className="field-stack">
              <span>连接状态</span>
              <select
                className="editor-select"
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  onUpdateEdge(selectedEdge.id, {
                    critical: event.target.value === 'critical',
                  })
                }
                value={selectedEdge.critical ? 'critical' : 'normal'}
              >
                <option value="normal">普通依赖</option>
                <option value="critical">关键依赖</option>
              </select>
            </label>
          </div>
        ) : null}
        {relatedEdges.length === 0 ? (
          <p>暂无连接</p>
        ) : (
          relatedEdges.map((edge: ProjectGraphEdge) => (
            <div className="edge-edit-row" key={edge.id}>
              <strong>{edge.label}</strong>
              <small>
                {edge.source} → {edge.target}
              </small>
              <button onClick={() => onDeleteEdge(edge.id)} type="button">
                <Trash2 />
              </button>
            </div>
          ))
        )}
      </div>

      <Button
        className="full-width-action danger-action"
        disabled={!selectedNode || nodes.length <= 1}
        onClick={() => onDeleteNode(selectedId)}
        variant="outline"
      >
        <Trash2 />
        删除当前节点
      </Button>
    </section>
  );
}

interface BaselineListProps {
  baselines: ProjectBaseline[];
}

function BaselineList({ baselines }: BaselineListProps) {
  return (
    <section className="baseline-panel">
      <h2>发布基线</h2>
      {baselines.map((baseline: ProjectBaseline) => (
        <div className="baseline-row" key={baseline.id}>
          <div>
            <strong>{baseline.name}</strong>
            <span>
              {baseline.hardwareVersion} / {baseline.softwareVersion}
            </span>
          </div>
          <Badge
            className={
              baseline.status.includes('阻塞')
                ? 'status-blocked'
                : 'status-released'
            }
            variant="outline"
          >
            {baseline.status}
          </Badge>
        </div>
      ))}
    </section>
  );
}

function formatSavedTime(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>(
    (resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
      const reader: FileReader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => reject(new Error('image read failed'));
      reader.readAsDataURL(file);
    },
  );
}

export default ProjectGraphPage;
