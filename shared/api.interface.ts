export interface ProjectOwner {
  apaasUserId: string;
  larkUserId?: string;
  openId?: string;
  name: string;
  avatar?: string;
  email?: string;
}

export type ProjectLane = 'hardware' | 'software' | 'integration';

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
  owner: ProjectOwner | null;
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

export type UpdateProjectGraphNodeRequest = Partial<
  Pick<
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
    | 'linkedIds'
  >
>;

export interface BaseLinkConfig {
  baseToken: string;
  nodeTableId: string;
  edgeTableId: string;
}

export type CreateProjectGraphNodeRequest = Omit<
  ProjectGraphNode,
  'id' | 'sourceRecordId'
>;

export type CreateProjectGraphEdgeRequest = Omit<ProjectGraphEdge, 'id'>;

export type UpdateProjectGraphEdgeRequest = Partial<
  Pick<ProjectGraphEdge, 'label' | 'critical'>
>;
