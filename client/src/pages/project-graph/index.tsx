import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
  LoaderCircle,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
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
  ProjectNodeKind,
  ProjectNodeStatus,
  CreateProjectGraphNodeResponse,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  CreateProjectWorkspaceRequest,
  ProjectWorkspace,
  UpdateProjectGraphNodeRequest,
  UpdateProjectWorkspaceRequest,
} from '@shared/api.interface';
import {
  buildBaseTableUrl,
  buildUiMetrics,
  calculateGraphFitScale,
  clampProgress,
  clampGraphScale,
  createDefaultNode,
  createEdge,
  filterNodes,
  LANE_LABELS,
  laneOptions,
  layoutGraph,
  parseCommaList,
  parseLineList,
  readActiveProjectId,
  STATUS_CLASS,
  STATUS_LABELS,
  statusOptions,
  writeActiveProjectId,
  type EditableNodePatch,
  type GraphLayout,
} from './project-graph-model';
import './project-graph.css';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { Image } from '@client/src/components/ui/image';

const PROJECT_LIBRARY_URL =
  'https://vcnqhq28cfdm.feishu.cn/wiki/UfSvwXb9SiKnr0kb9PjceJ93nHb?table=tblrpWm6qG55Xssv';

const METRIC_ICON: Record<ProjectMetric['tone'], typeof CircleDot> = {
  neutral: CircleDot,
  good: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

const NODE_KIND_LABELS: Record<ProjectNodeKind, string> = {
  project: '项目',
  issue: '问题',
  hardware: '硬件',
  software: '软件',
  algorithm: '算法',
  integration: '联调',
  test: '测试',
  risk: '风险',
  release: '发布',
};

const NODE_KIND_OPTIONS: ProjectNodeKind[] = [
  'hardware',
  'software',
  'algorithm',
  'integration',
  'test',
  'project',
  'issue',
  'risk',
  'release',
];

function laneForNodeKind(
  kind: ProjectNodeKind,
  currentLane: ProjectLane,
): ProjectLane {
  if (kind === 'hardware') return 'hardware';
  if (kind === 'software' || kind === 'algorithm') return 'software';
  if (kind === 'integration' || kind === 'test') return 'integration';
  return currentLane;
}

function kindForLane(
  lane: ProjectLane,
  currentKind: ProjectNodeKind,
): ProjectNodeKind {
  if (lane === 'hardware') return 'hardware';
  if (lane === 'software') {
    return currentKind === 'software' || currentKind === 'algorithm'
      ? currentKind
      : 'software';
  }
  return currentKind === 'integration' || currentKind === 'test'
    ? currentKind
    : 'test';
}

function projectOwnersToUsers(owners: ProjectOwner[]): User[] {
  return owners
    .filter((owner) => Boolean(owner.apaasUserId))
    .map((owner) => ({
      user_id: owner.apaasUserId,
      larkUserId: owner.openId,
      name: owner.name || '未知用户',
      avatar: owner.avatar,
      email: owner.email,
    }));
}

function usersToProjectOwners(users: User[]): ProjectOwner[] {
  return users
    .filter((user) => Boolean(user.user_id))
    .map((user) => {
      const larkIdentifier = user.larkUserId || undefined;
      return {
        apaasUserId: String(user.user_id),
        openId: larkIdentifier?.startsWith('ou_') ? larkIdentifier : undefined,
        larkUserId: larkIdentifier?.startsWith('ou_')
          ? undefined
          : larkIdentifier,
        name: getI18nText(user.name) || '未知用户',
        avatar: user.avatar,
        email: user.email,
      };
    });
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
  const [projects, setProjects] = useState<ProjectWorkspace[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [projectDialogOpen, setProjectDialogOpen] = useState<boolean>(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
  });
  const [creatingProject, setCreatingProject] = useState<boolean>(false);
  const [projectCreationStage, setProjectCreationStage] = useState<
    'idle' | 'authorizing' | 'provisioning'
  >('idle');
  const [projectCreationError, setProjectCreationError] = useState<string>('');
  const [renameDialogOpen, setRenameDialogOpen] = useState<boolean>(false);
  const [renameProjectName, setRenameProjectName] = useState<string>('');
  const [renamingProject, setRenamingProject] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string>('hw-gen21');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');
  const [laneFilter, setLaneFilter] = useState<ProjectLane | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ProjectNodeStatus | 'all'>(
    'all',
  );
  const [query, setQuery] = useState<string>('');
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [navigationCollapsed, setNavigationCollapsed] =
    useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [savedAt, setSavedAt] = useState<string>('');
  const [creatingNode, setCreatingNode] = useState<boolean>(false);
  const [deletingEdgeId, setDeletingEdgeId] = useState<string>('');
  const baseSyncTimersRef = useRef<Record<string, number>>({});
  const baseSyncPatchesRef = useRef<
    Record<string, UpdateProjectGraphNodeRequest>
  >({});
  const activeProjectIdRef = useRef<string>('');
  const graphRequestIdRef = useRef<number>(0);
  const creatingNodeRef = useRef<boolean>(false);
  const deletingNodeRef = useRef<boolean>(false);
  const ownerIds = useMemo(
    () => [
      ...new Set(
        (graph?.nodes ?? [])
          .flatMap((node: ProjectGraphNode) =>
            node.owners.map((owner) => owner.apaasUserId),
          )
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
        const nextOwners = node.owners.map((owner) => {
          if (!owner.apaasUserId) return owner;
          const profile = profileMap[owner.apaasUserId];
          if (!profile) return owner;
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
            nextOwner.name !== owner.name ||
            nextOwner.avatar !== owner.avatar ||
            nextOwner.email !== owner.email ||
            nextOwner.larkUserId !== owner.larkUserId ||
            nextOwner.openId !== owner.openId
          ) {
            changed = true;
          }
          return nextOwner;
        });
        return changed ? { ...node, owners: nextOwners } : node;
      });
      return changed ? { ...currentGraph, nodes } : currentGraph;
    });
  }, [ownerProfiles]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    void initializeProjects();
  }, []);

  async function initializeProjects(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const catalog = await projectGraph.listProjectWorkspaces();
      setProjects(catalog.projects);
      if (catalog.projects.length === 0) {
        setActiveProjectId('');
        setGraph({
          nodes: [],
          edges: [],
          metrics: buildUiMetrics([]),
          baselines: [],
          writable: false,
          message: '项目目录为空，请点击左侧“新建项目”创建独立飞书文档。',
        });
        setLoading(false);
        return;
      }
      const storedProjectId = readActiveProjectId();
      const targetProjectId = catalog.projects.some(
        (project) => project.id === storedProjectId,
      )
        ? storedProjectId
        : catalog.defaultProjectId;
      await loadGraph(targetProjectId, false);
    } catch (loadError: unknown) {
      setError(`项目目录加载失败：${getRequestErrorMessage(loadError)}`);
      setLoading(false);
    }
  }

  async function loadGraph(
    projectId?: string,
    manageLoading = true,
  ): Promise<void> {
    const requestId = ++graphRequestIdRef.current;
    if (manageLoading) setLoading(true);
    setError('');
    try {
      const targetProjectId = projectId || activeProjectIdRef.current;
      if (!targetProjectId) return;
      const nextGraph = await projectGraph.getProjectGraph(targetProjectId);
      if (requestId !== graphRequestIdRef.current) return;
      activeProjectIdRef.current = targetProjectId;
      setActiveProjectId(targetProjectId);
      writeActiveProjectId(targetProjectId);
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
    } catch (loadError: unknown) {
      if (requestId !== graphRequestIdRef.current) return;
      setError(`项目图谱数据加载失败：${getRequestErrorMessage(loadError)}`);
    } finally {
      if (requestId === graphRequestIdRef.current) setLoading(false);
    }
  }

  function persistCurrentGraph(nextGraph: ProjectGraphResponse): void {
    void nextGraph;
  }

  function updateSelectedNode(patch: Partial<EditableNodePatch>): void {
    if (creatingNodeRef.current) {
      return;
    }
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
      if (nextGraph.base) {
        queueBaseNodeSync(
          activeProjectIdRef.current,
          selectedId,
          patch as UpdateProjectGraphNodeRequest,
        );
      } else {
        setSavedAt(formatSavedTime());
      }
      return nextGraph;
    });
  }

  function queueBaseNodeSync(
    projectId: string,
    nodeId: string,
    patch: UpdateProjectGraphNodeRequest,
  ): void {
    if (!projectId || !nodeId) {
      return;
    }
    const syncKey = `${projectId}:${nodeId}`;

    window.clearTimeout(baseSyncTimersRef.current[syncKey]);
    baseSyncPatchesRef.current[syncKey] = {
      ...baseSyncPatchesRef.current[syncKey],
      ...patch,
    };
    baseSyncTimersRef.current[syncKey] = window.setTimeout(() => {
      const pendingPatch = baseSyncPatchesRef.current[syncKey] ?? patch;
      delete baseSyncPatchesRef.current[syncKey];
      delete baseSyncTimersRef.current[syncKey];
      void syncBaseNode(projectId, nodeId, pendingPatch);
    }, 500);
  }

  async function syncBaseNode(
    projectId: string,
    nodeId: string,
    patch: UpdateProjectGraphNodeRequest,
  ): Promise<void> {
    try {
      const syncedGraph: ProjectGraphResponse =
        await projectGraph.updateProjectNode(nodeId, patch, projectId);
      if (activeProjectIdRef.current !== projectId) return;
      if (!syncedGraph.writable) {
        setSavedAt('该字段未写回 Base');
        return;
      }
      setSavedAt(`已写回 Base ${formatSavedTime()}`);
      setError('');
    } catch {
      if (activeProjectIdRef.current !== projectId) return;
      setError('Base 写回失败：请确认飞书授权有效且对该多维表格有编辑权限');
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

  async function writeBaseNode(
    projectId: string,
    node: ProjectGraphNode,
    previousGraph: ProjectGraphResponse,
    optimisticEdge?: ProjectGraphEdge,
  ): Promise<void> {
    if (creatingNodeRef.current) {
      return;
    }
    creatingNodeRef.current = true;
    setCreatingNode(true);
    try {
      const { id: _id, sourceRecordId: _sourceRecordId, ...payload } = node;
      const creation: CreateProjectGraphNodeResponse =
        await projectGraph.createProjectNode(
          payload as CreateProjectGraphNodeRequest,
          projectId,
        );
      if (activeProjectIdRef.current !== projectId) return;
      setGraph((currentGraph: ProjectGraphResponse | null) => {
        if (!currentGraph) {
          return currentGraph;
        }
        const nextNodes: ProjectGraphNode[] = currentGraph.nodes.map(
          (currentNode: ProjectGraphNode) =>
            currentNode.id === node.id ? creation.node : currentNode,
        );
        const nextEdges: ProjectGraphEdge[] = currentGraph.edges.map(
          (edge: ProjectGraphEdge) => {
            if (optimisticEdge && edge.id === optimisticEdge.id) {
              return (
                creation.edge ?? {
                  ...edge,
                  source:
                    edge.source === node.id ? creation.node.id : edge.source,
                  target:
                    edge.target === node.id ? creation.node.id : edge.target,
                }
              );
            }
            return {
              ...edge,
              source: edge.source === node.id ? creation.node.id : edge.source,
              target: edge.target === node.id ? creation.node.id : edge.target,
            };
          },
        );
        return {
          ...currentGraph,
          nodes: nextNodes,
          edges: nextEdges,
          metrics: buildUiMetrics(nextNodes),
          savedAt: creation.savedAt,
        };
      });
      setSelectedId(creation.node.id);
      setSavedAt(
        `已新建“${creation.node.title}”并写回 Base ${formatSavedTime()}`,
      );
      setError('');
    } catch (requestError: unknown) {
      if (activeProjectIdRef.current !== projectId) return;
      setGraph((currentGraph: ProjectGraphResponse | null) => {
        if (!currentGraph) {
          return previousGraph;
        }
        const nextNodes: ProjectGraphNode[] = currentGraph.nodes.filter(
          (currentNode: ProjectGraphNode) => currentNode.id !== node.id,
        );
        const nextEdges: ProjectGraphEdge[] = currentGraph.edges.filter(
          (edge: ProjectGraphEdge) =>
            edge.source !== node.id && edge.target !== node.id,
        );
        return {
          ...currentGraph,
          nodes: nextNodes,
          edges: nextEdges,
          metrics: buildUiMetrics(nextNodes),
        };
      });
      setSelectedId(node.linkedIds[0] ?? previousGraph.nodes[0]?.id ?? '');
      setError(`Base 节点创建失败：${getRequestErrorMessage(requestError)}`);
      setSavedAt('新建失败');
    } finally {
      creatingNodeRef.current = false;
      setCreatingNode(false);
    }
  }

  async function removeBaseNode(
    projectId: string,
    nodeId: string,
    previousGraph: ProjectGraphResponse,
    previousSelectedId: string,
  ): Promise<void> {
    try {
      await projectGraph.deleteProjectNode(nodeId, projectId);
      if (activeProjectIdRef.current !== projectId) return;
      setSavedAt(`已删除节点并写回 Base ${formatSavedTime()}`);
      setError('');
    } catch (requestError: unknown) {
      if (activeProjectIdRef.current !== projectId) return;
      setGraph(previousGraph);
      setSelectedId(previousSelectedId);
      setError(`Base 节点删除失败：${getRequestErrorMessage(requestError)}`);
      setSavedAt('删除失败，已恢复节点');
    } finally {
      deletingNodeRef.current = false;
    }
  }

  async function writeBaseEdge(
    projectId: string,
    edge: ProjectGraphEdge,
  ): Promise<void> {
    try {
      const { id: _id, ...payload } = edge;
      const nextGraph: ProjectGraphResponse =
        await projectGraph.createProjectEdge(
          payload as CreateProjectGraphEdgeRequest,
          projectId,
        );
      if (activeProjectIdRef.current !== projectId) return;
      applyServerGraph(nextGraph);
    } catch {
      if (activeProjectIdRef.current !== projectId) return;
      setError('Base 连线创建失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  async function patchBaseEdge(
    projectId: string,
    edgeId: string,
    patch: Partial<Pick<ProjectGraphEdge, 'label' | 'critical'>>,
  ): Promise<void> {
    try {
      const nextGraph: ProjectGraphResponse =
        await projectGraph.updateProjectEdge(edgeId, patch, projectId);
      if (activeProjectIdRef.current !== projectId) return;
      applyServerGraph(nextGraph);
    } catch {
      if (activeProjectIdRef.current !== projectId) return;
      setError('Base 连线更新失败：请确认已登录且对该多维表格有编辑权限');
    }
  }

  async function removeBaseEdge(
    projectId: string,
    edgeId: string,
  ): Promise<void> {
    if (deletingEdgeId) return;
    const edgeLabel =
      graph?.edges.find((edge: ProjectGraphEdge) => edge.id === edgeId)
        ?.label || '连接';
    setDeletingEdgeId(edgeId);
    setError('');
    setSavedAt(`正在删除“${edgeLabel}”…`);
    try {
      const nextGraph: ProjectGraphResponse =
        await projectGraph.deleteProjectEdge(edgeId, projectId);
      if (activeProjectIdRef.current !== projectId) return;
      applyServerGraph(nextGraph);
      setSelectedEdgeId('');
      setSavedAt(`已删除“${edgeLabel}”并写回 Base ${formatSavedTime()}`);
    } catch (requestError: unknown) {
      if (activeProjectIdRef.current !== projectId) return;
      setError(`Base 连线删除失败：${getRequestErrorMessage(requestError)}`);
      setSavedAt('连线删除失败');
    } finally {
      setDeletingEdgeId('');
    }
  }

  function addNode(lane: ProjectLane, parentId: string | null): void {
    if (graph?.base) {
      const nextNode: ProjectGraphNode = createDefaultNode(
        lane,
        parentId,
        graph.nodes.length,
      );
      const nextEdge: ProjectGraphEdge | undefined =
        parentId && parentId !== nextNode.id
          ? createEdge(
              parentId,
              nextNode.id,
              lane === 'hardware' ? '演进' : '派生',
              'tree',
            )
          : undefined;
      const nextNodes: ProjectGraphNode[] = [...graph.nodes, nextNode];
      setGraph({
        ...graph,
        nodes: nextNodes,
        edges: nextEdge ? [...graph.edges, nextEdge] : graph.edges,
        metrics: buildUiMetrics(nextNodes),
      });
      setSelectedId(nextNode.id);
      setInspectorOpen(true);
      setSelectedEdgeId('');
      setSavedAt('正在写回 Base…');
      setError('');
      void writeBaseNode(
        activeProjectIdRef.current,
        nextNode,
        graph,
        nextEdge,
      );
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
                'tree',
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
      setInspectorOpen(true);
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
    if (graph?.base) {
      if (deletingNodeRef.current || creatingNodeRef.current) {
        return;
      }
      deletingNodeRef.current = true;
      const previousGraph: ProjectGraphResponse = graph;
      const previousSelectedId: string = selectedId;
      const nextNodes: ProjectGraphNode[] = graph.nodes.filter(
        (node: ProjectGraphNode) => node.id !== nodeId,
      );
      const nextEdges: ProjectGraphEdge[] = graph.edges.filter(
        (edge: ProjectGraphEdge) =>
          edge.source !== nodeId && edge.target !== nodeId,
      );
      setGraph({
        ...graph,
        nodes: nextNodes,
        edges: nextEdges,
        metrics: buildUiMetrics(nextNodes),
      });
      setSelectedId(nextNodes[0]?.id ?? '');
      setSelectedEdgeId('');
      setSavedAt('正在从 Base 删除…');
      setError('');
      void removeBaseNode(
        activeProjectIdRef.current,
        nodeId,
        previousGraph,
        previousSelectedId,
      );
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
    if (!graph || !sourceId || !targetId || sourceId === targetId) {
      setError('请选择两个不同的节点建立连接');
      return;
    }
    const edgeExists: boolean = graph.edges.some(
      (edge: ProjectGraphEdge) =>
        edge.source === sourceId && edge.target === targetId,
    );
    if (edgeExists) {
      setError('这两个节点之间已经存在同方向连接');
      return;
    }
    setError('');
    if (graph?.base) {
      setSavedAt('正在将新连接写回 Base…');
      void writeBaseEdge(
        activeProjectIdRef.current,
        createEdge(sourceId, targetId, label),
      );
      return;
    }

    setGraph((currentGraph: ProjectGraphResponse | null) => {
      if (!currentGraph) {
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

  function selectNodeForEditing(nodeId: string): void {
    setSelectedId(nodeId);
    setSelectedEdgeId('');
    setInspectorOpen(true);
  }

  function selectEdgeForEditing(edgeId: string): void {
    setSelectedEdgeId(edgeId);
    setInspectorOpen(true);
  }

  function addTreeEdge(targetId: string, label: string): void {
    if (graph?.base) {
      void writeBaseEdge(
        activeProjectIdRef.current,
        createEdge(selectedId, targetId, label),
      );
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
    if (graph?.base) {
      void patchBaseEdge(activeProjectIdRef.current, edgeId, patch);
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
    if (graph?.base) {
      void removeBaseEdge(activeProjectIdRef.current, edgeId);
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
    setSavedAt('');
    void loadGraph(activeProjectId);
  }

  function switchProject(projectId: string): void {
    graphRequestIdRef.current += 1;
    activeProjectIdRef.current = projectId;
    writeActiveProjectId(projectId);
    setSelectedEdgeId('');
    setSavedAt('');
    void loadGraph(projectId);
  }

  function openProjectDialog(): void {
    setProjectForm({ name: '', description: '' });
    setProjectCreationStage('idle');
    setProjectCreationError('');
    setProjectDialogOpen(true);
    setError('');
  }

  function closeProjectDialog(): void {
    if (creatingProject) return;
    setProjectDialogOpen(false);
  }

  async function ensureFeishuAuthorization(
    popup: Window | null,
  ): Promise<void> {
    const status = await projectGraph.getFeishuOAuthStatus();
    if (status.authorized) return;
    const { url } = await projectGraph.getFeishuOAuthUrl();
    if (!popup) {
      throw new Error('浏览器阻止了飞书授权窗口，请允许此站点打开新窗口');
    }
    popup.location.replace(url);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let statusRequestPending = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        window.clearInterval(statusPoll);
        window.removeEventListener('message', receiveAuthorization);
        if (error) reject(error);
        else resolve();
      };
      const checkAuthorization = async (): Promise<void> => {
        if (settled || statusRequestPending) return;
        if (popup.closed) {
          finish(new Error('飞书授权窗口已关闭，请重新创建项目'));
          return;
        }
        statusRequestPending = true;
        try {
          const currentStatus = await projectGraph.getFeishuOAuthStatus();
          if (currentStatus.authorized) finish();
        } catch {
          // The callback message still provides the primary completion signal.
        } finally {
          statusRequestPending = false;
        }
      };
      function receiveAuthorization(event: MessageEvent): void {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'feishu-oauth-complete') {
          finish();
        } else if (event.data?.type === 'feishu-oauth-failed') {
          finish(new Error(event.data.message || '飞书授权失败，请重试'));
        }
      }
      const statusPoll = window.setInterval(
        () => void checkAuthorization(),
        1_000,
      );
      const timeout = window.setTimeout(
        () => finish(new Error('飞书授权等待超时，请重新创建项目')),
        5 * 60 * 1_000,
      );
      window.addEventListener('message', receiveAuthorization);
    });
  }

  async function submitProjectForm(): Promise<void> {
    const name = projectForm.name.trim();
    if (!name || creatingProject) return;
    const feishuWindow = window.open('', '_blank');
    setCreatingProject(true);
    setProjectCreationStage('authorizing');
    setProjectCreationError('');
    try {
      await ensureFeishuAuthorization(feishuWindow);
      setProjectCreationStage('provisioning');
      const request: CreateProjectWorkspaceRequest = {
        name,
        description: projectForm.description.trim(),
        source: 'linked-base',
      };
      const project = await projectGraph.createProjectWorkspace(request);
      setProjects((currentProjects) => [...currentProjects, project]);
      setProjectDialogOpen(false);
      activeProjectIdRef.current = project.id;
      writeActiveProjectId(project.id);
      setActiveProjectId(project.id);
      setSelectedEdgeId('');
      if (feishuWindow) {
        feishuWindow.location.replace(project.base.url || PROJECT_LIBRARY_URL);
      }
      await loadGraph(project.id);
      setSavedAt(
        project.source === 'linked-base'
          ? `已创建独立项目文档“${project.name}”`
          : `已创建项目“${project.name}”并同步到共享飞书 Base`,
      );
      setError('');
    } catch (requestError: unknown) {
      if (feishuWindow && !feishuWindow.closed) {
        feishuWindow.location.replace(PROJECT_LIBRARY_URL);
      }
      const message = getRequestErrorMessage(requestError);
      setProjectCreationError(message);
      setError(`项目创建失败：${message}`);
    } finally {
      setCreatingProject(false);
      setProjectCreationStage('idle');
    }
  }

  function openRenameProjectDialog(): void {
    if (!activeProject) return;
    setRenameProjectName(activeProject.name);
    setRenameDialogOpen(true);
    setError('');
  }

  function closeRenameProjectDialog(): void {
    if (renamingProject) return;
    setRenameDialogOpen(false);
  }

  async function submitProjectRename(): Promise<void> {
    const name = renameProjectName.trim();
    if (!activeProject || !name || renamingProject) return;
    setRenamingProject(true);
    try {
      const request: UpdateProjectWorkspaceRequest = { name };
      const updatedProject = await projectGraph.updateProjectWorkspace(
        activeProject.id,
        request,
      );
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
      setRenameDialogOpen(false);
      setSavedAt(`项目已重命名为“${updatedProject.name}”并同步到飞书`);
      setError('');
    } catch (requestError: unknown) {
      setError(`项目名称修改失败：${getRequestErrorMessage(requestError)}`);
    } finally {
      setRenamingProject(false);
    }
  }

  function exportCurrentProject(): void {
    if (!graph) {
      return;
    }

    const exportName: string =
      projects.find((item) => item.id === activeProjectId)?.name ?? '项目图谱';
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

  const activeProject = projects.find(
    (project) => project.id === activeProjectId,
  );
  const projectRows = useMemo(() => buildProjectTreeRows(projects), [projects]);
  const baseNodeTableUrl = buildBaseTableUrl(
    graph?.base?.url,
    graph?.base?.nodeTableId,
  );
  const baseEdgeTableUrl = buildBaseTableUrl(
    graph?.base?.url,
    graph?.base?.edgeTableId,
  );

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
    <main
      className={[
        'graph-shell',
        'project-shell',
        navigationCollapsed ? 'navigation-collapsed' : '',
      ].join(' ')}
    >
      <aside className="project-navigation">
        <div className="project-navigation-title">
          <div>
            <span>项目工作台</span>
            <strong>飞书项目目录</strong>
          </div>
          <Badge variant="outline">{projects.length}</Badge>
          <button
            aria-label={navigationCollapsed ? '展开项目目录' : '收起项目目录'}
            className="navigation-collapse-button"
            onClick={() =>
              setNavigationCollapsed((collapsed: boolean) => !collapsed)
            }
            title={navigationCollapsed ? '展开项目目录' : '收起项目目录'}
            type="button"
          >
            {navigationCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <div className="project-navigation-actions">
          <Button onClick={openProjectDialog} size="sm">
            <Plus />
            <span>新建项目</span>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={PROJECT_LIBRARY_URL} rel="noreferrer" target="_blank">
              <ArrowUpRight />
              <span>项目目录</span>
            </a>
          </Button>
        </div>
        <label className="mobile-project-picker">
          <FolderOpen />
          <select
            aria-label="选择项目"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              switchProject(event.target.value)
            }
            value={activeProjectId}
          >
            {projects.map((project: ProjectWorkspace) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <nav className="project-tree" aria-label="项目层次">
          {projectRows.map(({ project, depth }) => (
            <button
              className={
                project.id === activeProjectId
                  ? 'project-tree-item active'
                  : 'project-tree-item'
              }
              key={project.id}
              onClick={() => switchProject(project.id)}
              style={{ paddingLeft: 14 + depth * 18 }}
              type="button"
            >
              <FolderOpen />
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.source === 'linked-base'
                    ? '独立 Base'
                    : '共享 Base 项目空间'}
                </small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="project-content">
        <section className="graph-header">
          <div>
            <div className="eyebrow">
              <GitBranch />
              硬件主干 / 软件分支
            </div>
            <h1>{activeProject?.name ?? '未命名项目'}</h1>
            <p>
              横向跟踪慢节奏硬件版本，纵向展开每个硬件版本下的软件算法、
              联调测试和风险闭环。
            </p>
          </div>
          <div className="header-actions">
            <Button
              disabled={!activeProject}
              onClick={openRenameProjectDialog}
              variant="outline"
            >
              <Pencil />
              <span>项目名称</span>
            </Button>
            <Button onClick={exportCurrentProject} variant="outline">
              <Download />
              <span>导出</span>
            </Button>
            <Button onClick={() => void loadGraph()} variant="outline">
              <RefreshCw />
              <span>刷新</span>
            </Button>
            <Button onClick={resetLocalEdits} variant="outline">
              <RotateCcw />
              <span>恢复</span>
            </Button>
            <Button asChild variant="outline">
              <UniversalLink
                to={baseNodeTableUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowUpRight />
                <span>节点表</span>
              </UniversalLink>
            </Button>
            <Button asChild variant="outline">
              <UniversalLink
                to={baseEdgeTableUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowUpRight />
                <span>连线表</span>
              </UniversalLink>
            </Button>
            <Button
              aria-label={inspectorOpen ? '收起编辑详情' : '打开编辑详情'}
              className={
                inspectorOpen ? 'inspector-toggle active' : 'inspector-toggle'
              }
              onClick={() => setInspectorOpen((open: boolean) => !open)}
              title={inspectorOpen ? '收起编辑详情' : '打开编辑详情'}
              variant="outline"
            >
              {inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}
              <span>{inspectorOpen ? '收起详情' : '编辑详情'}</span>
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
              <span>
                {graph.base
                  ? '节点表和连线表保存数据，流程图由 Web 实时渲染'
                  : '后端静态兜底'}
              </span>
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
              <div
                className={`metric-tile tone-${metric.tone}`}
                key={metric.key}
              >
                <MetricIcon />
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              </div>
            );
          })}
        </section>

        <section
          className={
            inspectorOpen ? 'graph-workspace inspector-open' : 'graph-workspace'
          }
        >
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
              deletingEdgeId={deletingEdgeId}
              layout={graphLayout}
              onAddChild={addChildNode}
              onConnectNodes={addConnectionEdge}
              onDeleteEdge={deleteEdge}
              onDeleteNode={deleteNode}
              onSelectEdge={selectEdgeForEditing}
              onSelect={selectNodeForEditing}
              selectedEdgeId={selectedEdgeId}
              selectedId={selectedId}
            />
          </div>

          <aside className="graph-side-panel">
            <div className="inspector-heading">
              <div>
                <span>节点与连线</span>
                <strong>{selectedNode?.title ?? '未选择节点'}</strong>
              </div>
              <button
                aria-label="关闭编辑详情"
                onClick={() => setInspectorOpen(false)}
                type="button"
              >
                <PanelRightClose />
              </button>
            </div>
            {selectedNode ? (
              <NodeEditor
                isBaseBacked={Boolean(graph.base)}
                node={selectedNode}
                onUpdate={updateSelectedNode}
                savedAt={savedAt}
              />
            ) : null}
            <FlowEditor
              creatingNode={creatingNode}
              deletingEdgeId={deletingEdgeId}
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
      </div>

      {projectDialogOpen ? (
        <div className="project-dialog-backdrop" role="presentation">
          <section
            aria-labelledby="project-dialog-title"
            aria-modal="true"
            className="project-dialog"
            role="dialog"
          >
            <div className="project-dialog-heading">
              <div>
                <span>独立项目</span>
                <h2 id="project-dialog-title">创建飞书项目文档</h2>
              </div>
              <button onClick={closeProjectDialog} type="button">
                ×
              </button>
            </div>
            <label className="field-stack">
              <span>项目名称</span>
              <Input
                autoFocus
                disabled={creatingProject}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="例如：ir-slam"
                value={projectForm.name}
              />
            </label>
            <label className="field-stack">
              <span>项目说明</span>
              <Textarea
                disabled={creatingProject}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="项目目标、范围或当前阶段"
                value={projectForm.description}
              />
            </label>
            {projectCreationError ? (
              <div className="project-dialog-error" role="alert">
                <ShieldAlert />
                <span>项目创建失败：{projectCreationError}</span>
              </div>
            ) : null}
            <p className="project-dialog-note">
              确认后会在“硬件项目管理”下新建一个独立 Base，自动建立“项目节点”和
              “项目连接关系”两张表及按负责人分列的“人员分工看板”，并登记到
              “Web项目管理可视化”目录。
            </p>
            <ol className="project-sync-steps">
              <li>飞书创建独立项目文档、数据表和人员分工看板。</li>
              <li>Web 自动切换到新项目。</li>
              <li>新文档会在标签页中打开，返回 Web 即可继续可视化编辑。</li>
            </ol>
            <div className="project-dialog-actions">
              <Button
                disabled={creatingProject}
                onClick={closeProjectDialog}
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={creatingProject || !projectForm.name.trim()}
                onClick={() => void submitProjectForm()}
              >
                <Plus />
                {projectCreationStage === 'authorizing'
                  ? '等待飞书授权…'
                  : projectCreationStage === 'provisioning'
                    ? '正在创建飞书文档…'
                    : '创建并打开飞书'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {renameDialogOpen ? (
        <div className="project-dialog-backdrop" role="presentation">
          <section
            aria-labelledby="rename-project-dialog-title"
            aria-modal="true"
            className="project-dialog"
            role="dialog"
          >
            <div className="project-dialog-heading">
              <div>
                <span>项目设置</span>
                <h2 id="rename-project-dialog-title">修改项目名称</h2>
              </div>
              <button onClick={closeRenameProjectDialog} type="button">
                ×
              </button>
            </div>
            <label className="field-stack">
              <span>新项目名称</span>
              <Input
                autoFocus
                disabled={renamingProject}
                maxLength={100}
                onChange={(event) => setRenameProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitProjectRename();
                  }
                }}
                value={renameProjectName}
              />
            </label>
            <p className="project-dialog-note">
              保存后会同时更新 Web
              项目目录、飞书目录表中的“项目名称”，以及该项目独立 Base
              文档的标题。
            </p>
            <div className="project-dialog-actions">
              <Button
                disabled={renamingProject}
                onClick={closeRenameProjectDialog}
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={renamingProject || !renameProjectName.trim()}
                onClick={() => void submitProjectRename()}
              >
                <Save />
                {renamingProject ? '正在同步飞书…' : '保存名称'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
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
  deletingEdgeId: string;
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
  targetId?: string;
  sticky: boolean;
}

interface CanvasPanState {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface CanvasPinchState {
  distance: number;
  scale: number;
  stageX: number;
  stageY: number;
}

function GraphCanvas({
  creatingNode,
  deletingEdgeId,
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
  const scaleRef = useRef<number>(1);
  const panRef = useRef<CanvasPanState | null>(null);
  const pinchRef = useRef<CanvasPinchState | null>(null);
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const dragConnectionRef = useRef<DragConnectionState | null>(null);
  const connectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const connectionMovedRef = useRef<boolean>(false);
  const onConnectNodesRef = useRef(onConnectNodes);
  const [scale, setScale] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
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
  const selectedRelatedNodeIds: Set<string> = new Set(
    selectedRelatedEdges.flatMap((edge: ProjectGraphEdge) => [
      edge.source,
      edge.target,
    ]),
  );

  onConnectNodesRef.current = onConnectNodes;

  function commitScale(nextScale: number): number {
    const normalizedScale = clampGraphScale(nextScale);
    scaleRef.current = normalizedScale;
    setScale(normalizedScale);
    return normalizedScale;
  }

  function centerScaledStage(nextScale: number): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    requestAnimationFrame(() => {
      canvas.scrollTo({
        left: Math.max(0, (layout.width * nextScale - canvas.clientWidth) / 2),
        top: Math.max(0, (layout.height * nextScale - canvas.clientHeight) / 2),
      });
    });
  }

  function fitGraphToViewport(): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = canvas.parentElement ?? canvas;
    const nextScale = commitScale(
      calculateGraphFitScale(
        viewport.clientWidth,
        viewport.clientHeight,
        layout.width,
        layout.height,
      ),
    );
    centerScaledStage(nextScale);
  }

  function zoomAroundPoint(
    nextScale: number,
    clientX: number,
    clientY: number,
  ): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const currentScale = scaleRef.current;
    const stageX = (canvas.scrollLeft + offsetX) / currentScale;
    const stageY = (canvas.scrollTop + offsetY) / currentScale;
    const normalizedScale = commitScale(nextScale);
    requestAnimationFrame(() => {
      canvas.scrollTo({
        left: Math.max(0, stageX * normalizedScale - offsetX),
        top: Math.max(0, stageY * normalizedScale - offsetY),
      });
    });
  }

  function zoomFromCenter(factor: number): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAroundPoint(
      scaleRef.current * factor,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  }

  function setConnectionState(next: DragConnectionState | null): void {
    dragConnectionRef.current = next;
    setDragConnection(next);
  }

  function getStagePointFromClient(
    clientX: number,
    clientY: number,
  ): {
    x: number;
    y: number;
  } {
    const rect = stageRef.current?.getBoundingClientRect();
    const currentScale = scaleRef.current;
    return {
      x: (clientX - (rect?.left ?? 0)) / currentScale,
      y: (clientY - (rect?.top ?? 0)) / currentScale,
    };
  }

  function getNodeIdAtPoint(clientX: number, clientY: number): string {
    const element = document.elementFromPoint(clientX, clientY);
    return (
      element?.closest<HTMLElement>('[data-graph-node-id]')?.dataset
        .graphNodeId ?? ''
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const selectedNode = stageRef.current?.querySelector<HTMLElement>(
      '.graph-node.selected',
    );
    if (!canvas || !selectedNode) {
      return;
    }
    const margin = 28;
    const canvasRect = canvas.getBoundingClientRect();
    const nodeRect = selectedNode.getBoundingClientRect();
    if (
      nodeRect.left >= canvasRect.left + margin &&
      nodeRect.right <= canvasRect.right - margin &&
      nodeRect.top >= canvasRect.top + margin &&
      nodeRect.bottom <= canvasRect.bottom - margin
    ) {
      return;
    }
    canvas.scrollBy({
      behavior: 'smooth',
      left:
        nodeRect.left +
        nodeRect.width / 2 -
        (canvasRect.left + canvasRect.width / 2),
      top:
        nodeRect.top +
        nodeRect.height / 2 -
        (canvasRect.top + canvasRect.height / 2),
    });
  }, [layout.nodes, selectedId]);

  useEffect(() => {
    fitGraphToViewport();
    const canvas = canvasRef.current;
    const canvasShell = canvas?.parentElement;
    if (!canvas || !canvasShell || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => fitGraphToViewport());
    observer.observe(canvasShell);
    return () => observer.disconnect();
  }, [layout.height, layout.width]);

  useEffect(() => {
    function updateConnection(event: PointerEvent): void {
      const current = dragConnectionRef.current;
      if (!current) return;
      const start = connectionStartRef.current;
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
      ) {
        connectionMovedRef.current = true;
      }
      const point = getStagePointFromClient(event.clientX, event.clientY);
      const targetId = getNodeIdAtPoint(event.clientX, event.clientY);
      setConnectionState({
        ...current,
        ...point,
        targetId:
          targetId && targetId !== current.sourceId ? targetId : undefined,
      });
    }

    function finishConnection(event: PointerEvent): void {
      const current = dragConnectionRef.current;
      if (!current) return;
      const targetId = getNodeIdAtPoint(event.clientX, event.clientY);
      if (targetId && targetId !== current.sourceId) {
        onConnectNodesRef.current(current.sourceId, targetId, '关联');
        setConnectionState(null);
      } else if (!connectionMovedRef.current) {
        setConnectionState({ ...current, sticky: true, targetId: undefined });
      } else if (!current.sticky) {
        setConnectionState(null);
      }
      connectionStartRef.current = null;
    }

    function cancelConnection(event: KeyboardEvent): void {
      if (event.key === 'Escape') setConnectionState(null);
    }

    window.addEventListener('pointermove', updateConnection);
    window.addEventListener('pointerup', finishConnection);
    window.addEventListener('keydown', cancelConnection);
    return () => {
      window.removeEventListener('pointermove', updateConnection);
      window.removeEventListener('pointerup', finishConnection);
      window.removeEventListener('keydown', cancelConnection);
    };
  }, []);

  function startConnectionDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    sourceId: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    connectionMovedRef.current = false;
    connectionStartRef.current = { x: event.clientX, y: event.clientY };
    const pointerPoint = getStagePointFromClient(event.clientX, event.clientY);
    setConnectionState({
      sourceId,
      ...pointerPoint,
      sticky: false,
    });
    onSelect(sourceId);
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    zoomAroundPoint(scaleRef.current * factor, event.clientX, event.clientY);
  }

  function handleCanvasPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    const interactiveTarget = (event.target as Element).closest(
      '.graph-node, .edge-group, .canvas-zoom-controls, .node-edge-popover, button, a, input, select, textarea, [role="button"]',
    );
    if (interactiveTarget || (event.button !== 0 && event.button !== 1)) {
      return;
    }
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsPanning(true);
  }

  function handleCanvasPointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    const touchPoints = [...touchPointersRef.current.values()];
    if (touchPoints.length >= 2) {
      const [first, second] = touchPoints;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      if (!pinchRef.current) {
        const rect = canvas.getBoundingClientRect();
        pinchRef.current = {
          distance,
          scale: scaleRef.current,
          stageX: (canvas.scrollLeft + centerX - rect.left) / scaleRef.current,
          stageY: (canvas.scrollTop + centerY - rect.top) / scaleRef.current,
        };
      } else {
        const pinch = pinchRef.current;
        const nextScale = commitScale(
          pinch.scale * (distance / Math.max(1, pinch.distance)),
        );
        const rect = canvas.getBoundingClientRect();
        canvas.scrollTo({
          left: Math.max(0, pinch.stageX * nextScale - (centerX - rect.left)),
          top: Math.max(0, pinch.stageY * nextScale - (centerY - rect.top)),
        });
      }
      panRef.current = null;
      setIsPanning(false);
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    canvas.scrollTo({
      left: pan.scrollLeft - (event.clientX - pan.clientX),
      top: pan.scrollTop - (event.clientY - pan.clientY),
    });
  }

  function handleCanvasPointerEnd(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    touchPointersRef.current.delete(event.pointerId);
    if (touchPointersRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
    }
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="graph-canvas-shell">
      <div className="mobile-pan-hint" aria-hidden="true">
        单指拖动画布 · 双指缩放 · 点击连接点后选择目标
      </div>
      <div className="canvas-zoom-controls">
        <button
          aria-label="缩小流程图"
          onClick={() => zoomFromCenter(0.84)}
          title="缩小"
          type="button"
        >
          <ZoomOut />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          aria-label="放大流程图"
          onClick={() => zoomFromCenter(1.19)}
          title="放大"
          type="button"
        >
          <ZoomIn />
        </button>
        <button
          aria-label="适应窗口"
          onClick={fitGraphToViewport}
          title="适应窗口"
          type="button"
        >
          <Maximize2 />
        </button>
      </div>
      {dragConnection ? (
        <div className="connection-mode-hint">
          <Link />
          {dragConnection.targetId
            ? '松开即可连接到当前节点'
            : dragConnection.sticky
              ? '请选择任意目标节点，Esc 取消'
              : '拖到目标节点并松开'}
        </div>
      ) : null}
      <div
        className={isPanning ? 'graph-canvas is-panning' : 'graph-canvas'}
        onPointerCancel={handleCanvasPointerEnd}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerEnd}
        onWheel={handleCanvasWheel}
        ref={canvasRef}
      >
        <div
          className="graph-stage-viewport"
          style={
            {
              '--graph-band-height': `${236 * scale}px`,
              '--graph-grid-size': `${Math.max(8, 22 * scale)}px`,
              height: layout.height * scale,
              width: layout.width * scale,
            } as CSSProperties
          }
        >
          <div
            className="graph-stage"
            ref={stageRef}
            style={{
              height: layout.height,
              transform: `scale(${scale})`,
              width: layout.width,
            }}
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
              <defs>
                <marker
                  id="graph-arrow-default"
                  markerHeight="9"
                  markerUnits="userSpaceOnUse"
                  markerWidth="9"
                  orient="auto"
                  refX="8"
                  refY="4.5"
                  viewBox="0 0 9 9"
                >
                  <path
                    className="edge-arrow-default"
                    d="M 0 0 L 9 4.5 L 0 9 z"
                  />
                </marker>
                <marker
                  id="graph-arrow-related"
                  markerHeight="10"
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  orient="auto"
                  refX="9"
                  refY="5"
                  viewBox="0 0 10 10"
                >
                  <path
                    className="edge-arrow-related"
                    d="M 0 0 L 10 5 L 0 10 z"
                  />
                </marker>
                <marker
                  id="graph-arrow-critical"
                  markerHeight="10"
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  orient="auto"
                  refX="9"
                  refY="5"
                  viewBox="0 0 10 10"
                >
                  <path
                    className="edge-arrow-critical"
                    d="M 0 0 L 10 5 L 0 10 z"
                  />
                </marker>
              </defs>
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
                const treeEdge: boolean = isTreeEdge(edge, source, target);
                const highlighted: boolean = edge.id === selectedEdgeId;
                const relatedToSelected: boolean =
                  edge.source === selectedId || edge.target === selectedId;
                const labelPoint = edgeLabelPoint(edge, source, target);
                const labelText: string =
                  edge.label || (treeEdge ? '派生' : '关联');
                const labelWidth: number = Math.min(
                  190,
                  Math.max(58, labelText.length * 12 + 24),
                );
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
                      relatedToSelected ? 'related' : 'unrelated',
                    ].join(' ')}
                    key={edge.id}
                    onClick={() => onSelectEdge(edge.id)}
                  >
                    <path
                      className="edge-hit-area"
                      d={edgePath(edge, source, target)}
                    />
                    <path
                      className={edgeClassName}
                      d={edgePath(edge, source, target)}
                      markerEnd={
                        'url(#' +
                        (edge.critical
                          ? 'graph-arrow-critical'
                          : highlighted || relatedToSelected
                            ? 'graph-arrow-related'
                            : 'graph-arrow-default') +
                        ')'
                      }
                    />
                    {highlighted || relatedToSelected ? (
                      <g
                        className="edge-label-group"
                        transform={
                          'translate(' + labelPoint.x + ' ' + labelPoint.y + ')'
                        }
                      >
                        <rect
                          height="24"
                          rx="12"
                          width={labelWidth}
                          x={-labelWidth / 2}
                          y="-12"
                        />
                        <text className="edge-label" textAnchor="middle" y="4">
                          {labelText}
                        </text>
                      </g>
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
                  selectedRelatedNodeIds.has(node.id) && selectedId !== node.id
                    ? 'relation-peer'
                    : '',
                  dragConnection?.targetId === node.id
                    ? 'connection-target'
                    : '',
                ].join(' ')}
                data-graph-node-id={node.id}
                key={node.id}
                onClick={() => {
                  const connection = dragConnectionRef.current;
                  if (connection?.sticky && connection.sourceId !== node.id) {
                    onConnectNodes(connection.sourceId, node.id, '关联');
                    setConnectionState(null);
                    return;
                  }
                  onSelect(node.id);
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
                  <span className="node-owner">
                    {node.owners.map((owner) => owner.name).join(' / ') ||
                      '待指定'}
                  </span>
                </span>
                <button
                  aria-label={`从 ${node.title} 拖拽建立连接`}
                  className="node-connect-handle"
                  onPointerDown={(
                    event: React.PointerEvent<HTMLButtonElement>,
                  ) => startConnectionDrag(event, node.id)}
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
                  const outgoing: boolean = edge.source === selectedId;
                  const deleting: boolean = deletingEdgeId === edge.id;
                  return (
                    <div
                      className={[
                        'node-edge-chip',
                        edge.id === selectedEdgeId ? 'selected' : '',
                        edge.critical ? 'critical' : '',
                      ].join(' ')}
                      key={edge.id}
                    >
                      <button
                        className="node-edge-select"
                        onClick={(
                          event: React.MouseEvent<HTMLButtonElement>,
                        ) => {
                          event.stopPropagation();
                          onSelectEdge(edge.id);
                        }}
                        type="button"
                      >
                        <span
                          className={
                            outgoing
                              ? 'edge-direction outgoing'
                              : 'edge-direction incoming'
                          }
                        >
                          {outgoing ? '传出' : '传入'}
                        </span>
                        <small>
                          {source?.title ?? edge.source} →{' '}
                          {target?.title ?? edge.target}
                        </small>
                        <strong>{edge.label || '关联'}</strong>
                      </button>
                      <button
                        aria-label={`删除连接 ${edge.label}`}
                        className="node-edge-delete"
                        disabled={deleting}
                        onClick={(
                          event: React.MouseEvent<HTMLButtonElement>,
                        ) => {
                          event.stopPropagation();
                          onDeleteEdge(edge.id);
                        }}
                        title="删除这条连接"
                        type="button"
                      >
                        {deleting ? <LoaderCircle /> : <Trash2 />}
                      </button>
                    </div>
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
  edge: ProjectGraphEdge,
  source: ProjectGraphNode,
  target: ProjectGraphNode,
): boolean {
  if (edge.kind === 'tree') {
    return true;
  }
  if (source.lane === 'hardware' && target.lane === 'hardware') {
    return true;
  }
  return target.linkedIds[0] === source.id;
}

function edgePath(
  edge: ProjectGraphEdge,
  source: ProjectGraphNode,
  target: ProjectGraphNode,
): string {
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

  if (isTreeEdge(edge, source, target)) {
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

function edgeLabelPoint(
  edge: ProjectGraphEdge,
  source: ProjectGraphNode,
  target: ProjectGraphNode,
): { x: number; y: number } {
  const nodeWidth = 220;
  const nodeHeight = 128;
  const sourceCenterX = source.x + nodeWidth / 2;
  const targetCenterX = target.x + nodeWidth / 2;
  const sourceCenterY = source.y + nodeHeight / 2;
  const targetCenterY = target.y + nodeHeight / 2;

  if (source.lane === 'hardware' && target.lane === 'hardware') {
    return {
      x: (source.x + nodeWidth + target.x) / 2,
      y: (sourceCenterY + targetCenterY) / 2 - 14,
    };
  }
  if (isTreeEdge(edge, source, target)) {
    return {
      x: (sourceCenterX + targetCenterX) / 2,
      y: source.y + nodeHeight + 60,
    };
  }
  return {
    x: (source.x + nodeWidth + target.x) / 2,
    y: (sourceCenterY + targetCenterY) / 2 - 14,
  };
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
          <span>所属分组</span>
          <select
            className="editor-select"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const lane = event.target.value as ProjectLane;
              onUpdate({ lane, kind: kindForLane(lane, node.kind) });
            }}
            value={node.lane}
          >
            <option value="hardware">硬件主干</option>
            <option value="software">软件算法</option>
            <option value="integration">联调测试</option>
          </select>
        </label>
        <label className="field-stack">
          <span>节点类型</span>
          <select
            className="editor-select"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const kind = event.target.value as ProjectNodeKind;
              onUpdate({ kind, lane: laneForNodeKind(kind, node.lane) });
            }}
            value={node.kind}
          >
            {NODE_KIND_OPTIONS.map((kind: ProjectNodeKind) => (
              <option key={kind} value={kind}>
                {NODE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="editor-grid">
        <label className="field-stack">
          <span>负责人</span>
          <UserSelect
            accountType="apaas"
            multiple
            onChange={(users: User[]) =>
              onUpdate({ owners: usersToProjectOwners(users) })
            }
            placeholder="请选择一位或多位负责人"
            value={projectOwnersToUsers(node.owners)}
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
  deletingEdgeId: string;
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
  deletingEdgeId,
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
          relatedEdges.map((edge: ProjectGraphEdge) => {
            const source = nodes.find(
              (node: ProjectGraphNode) => node.id === edge.source,
            );
            const target = nodes.find(
              (node: ProjectGraphNode) => node.id === edge.target,
            );
            const deleting = deletingEdgeId === edge.id;
            return (
              <div className="edge-edit-row" key={edge.id}>
                <strong>{edge.label || '关联'}</strong>
                <small>
                  {source?.title ?? edge.source} →{' '}
                  {target?.title ?? edge.target}
                </small>
                <button
                  aria-label={`删除连接 ${edge.label}`}
                  disabled={deleting}
                  onClick={() => onDeleteEdge(edge.id)}
                  type="button"
                >
                  {deleting ? <LoaderCircle /> : <Trash2 />}
                </button>
              </div>
            );
          })
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

interface ProjectTreeRow {
  project: ProjectWorkspace;
  depth: number;
}

function buildProjectTreeRows(projects: ProjectWorkspace[]): ProjectTreeRow[] {
  const projectIds = new Set(projects.map((project) => project.id));
  const children = new Map<string, ProjectWorkspace[]>();
  projects.forEach((project) => {
    const parentId =
      project.parentId && projectIds.has(project.parentId)
        ? project.parentId
        : '';
    const list = children.get(parentId) ?? [];
    list.push(project);
    children.set(parentId, list);
  });
  children.forEach((list) =>
    list.sort(
      (left, right) =>
        left.sort - right.sort || left.name.localeCompare(right.name),
    ),
  );
  const rows: ProjectTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string, depth: number) => {
    (children.get(parentId) ?? []).forEach((project) => {
      if (visited.has(project.id)) return;
      visited.add(project.id);
      rows.push({ project, depth });
      visit(project.id, depth + 1);
    });
  };
  visit('', 0);
  projects.forEach((project) => {
    if (!visited.has(project.id)) rows.push({ project, depth: 0 });
  });
  return rows;
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
