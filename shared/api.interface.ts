export interface ProjectOwner {
  apaasUserId: string;
  larkUserId?: string;
  openId?: string;
  name: string;
  avatar?: string;
  email?: string;
}

export type ProjectLane =
  | 'hardware'
  | 'structure'
  | 'electronics'
  | 'driver'
  | 'software'
  | 'algorithm'
  | 'integration';

export type ProjectNodeStatus =
  | 'planned'
  | 'active'
  | 'review'
  | 'testing'
  | 'blocked'
  | 'passed'
  | 'released'
  | 'archived';

export type ProjectNodeKind =
  | 'project'
  | 'issue'
  | 'hardware'
  | 'software'
  | 'algorithm'
  | 'integration'
  | 'test'
  | 'risk'
  | 'release';

export interface ProjectGraphNode {
  id: string;
  title: string;
  subtitle: string;
  lane: ProjectLane;
  kind: ProjectNodeKind;
  status: ProjectNodeStatus;
  owners: ProjectOwner[];
  progress: number;
  version: string;
  date: string;
  x: number;
  y: number;
  tags: string[];
  summary: string;
  nextAction: string;
  risks: string[];
  linkedIds: string[];
  imageUrl?: string;
  sourceRecordId?: string;
}

export interface ProjectGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  critical: boolean;
  kind?: 'tree' | 'cross';
}

export interface ProjectMetric {
  key: string;
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warning' | 'danger';
}

export interface ProjectBaseline {
  id: string;
  name: string;
  hardwareVersion: string;
  softwareVersion: string;
  status: string;
  releaseDate: string;
}

export interface ProjectGraphResponse {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  metrics: ProjectMetric[];
  baselines: ProjectBaseline[];
  base?: {
    url: string;
    nodeTableId: string;
    edgeTableId: string;
  };
  writable: boolean;
  savedAt?: string;
  message?: string;
}

export interface CreateProjectGraphNodeResponse {
  node: ProjectGraphNode;
  edge?: ProjectGraphEdge;
  savedAt: string;
}

export interface DeleteProjectGraphNodeResponse {
  deletedNodeId: string;
  savedAt: string;
}

export type UpdateProjectGraphNodeRequest = Partial<
  Pick<
    ProjectGraphNode,
    | 'title'
    | 'subtitle'
    | 'lane'
    | 'kind'
    | 'status'
    | 'owners'
    | 'progress'
    | 'version'
    | 'date'
    | 'tags'
    | 'summary'
    | 'nextAction'
    | 'risks'
    | 'imageUrl'
    | 'linkedIds'
  >
>;

export interface BaseLinkConfig {
  baseToken: string;
  nodeTableId: string;
  edgeTableId: string;
  url?: string;
}

export type ProjectWorkspaceSource = 'shared-base' | 'linked-base';

export interface ProjectWorkspace {
  id: string;
  code: string;
  name: string;
  description: string;
  status: 'planned' | 'active' | 'paused' | 'archived';
  parentId?: string;
  sort: number;
  source: ProjectWorkspaceSource;
  base: BaseLinkConfig;
  writable: boolean;
  updatedAt?: string;
}

export interface ProjectWorkspaceListResponse {
  projects: ProjectWorkspace[];
  defaultProjectId: string;
}

export interface DeleteProjectWorkspaceRequest {
  confirmName: string;
  deleteBase: true;
}

export interface DeleteProjectWorkspaceResponse {
  deletedProjectId: string;
  deletedBase: boolean;
  savedAt: string;
}

export interface CreateProjectWorkspaceRequest {
  name: string;
  description?: string;
  parentId?: string;
  source: ProjectWorkspaceSource;
  baseUrl?: string;
  nodeTableId?: string;
  edgeTableId?: string;
}

export interface UpdateProjectWorkspaceRequest {
  name: string;
}

export type CreateProjectGraphNodeRequest = Omit<
  ProjectGraphNode,
  'id' | 'sourceRecordId'
>;

export type CreateProjectGraphEdgeRequest = Omit<ProjectGraphEdge, 'id'>;

export type UpdateProjectGraphEdgeRequest = Partial<
  Pick<ProjectGraphEdge, 'label' | 'critical'>
>;
