import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  CapabilityService,
  AuthNPaasService,
} from '@lark-apaas/fullstack-nestjs-core';
import type {
  CreateProjectGraphNodeResponse,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  CreateProjectWorkspaceRequest,
  DeleteProjectWorkspaceRequest,
  DeleteProjectWorkspaceResponse,
  DeleteProjectGraphNodeResponse,
  BaseLinkConfig,
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectGraphResponse,
  ProjectLane,
  ProjectNodeStatus,
  ProjectOwner,
  ProjectWorkspace,
  ProjectWorkspaceListResponse,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
  UpdateProjectWorkspaceRequest,
} from '@shared/api.interface';
import {
  buildStaticBaselines,
  buildStaticEdges,
  buildStaticMetrics,
  buildStaticNodes,
} from './project-graph-static';
import { LarkCliBaseClient, type LarkCliRecord } from './lark-cli-base.client';
import {
  FeishuBaseClient,
  type FeishuBaseRecord,
} from '../feishu-openapi/feishu-base.client';
import { FeishuOAuthService } from '../feishu-openapi/feishu-oauth.service';
import { ProjectWorkspaceRepository } from './project-workspace.repository';

const NODE_PLUGIN_ID = 'project_graph_node_crud_1';
const EDGE_PLUGIN_ID = 'project_graph_connection_bitable_crud_1';
const PROJECT_PLUGIN_ID = 'project_graph_project_crud_1';

const CATALOG_BASE_TOKEN =
  process.env.PROJECT_GRAPH_CATALOG_BASE_TOKEN || 'I2hLbxQOsaZYcQsPuSOc3UMWnSe';
const CATALOG_TABLE_ID =
  process.env.PROJECT_GRAPH_CATALOG_TABLE_ID || 'tblrpWm6qG55Xssv';
const CATALOG_WIKI_URL =
  process.env.PROJECT_GRAPH_CATALOG_WIKI_URL ||
  'https://vcnqhq28cfdm.feishu.cn/wiki/UfSvwXb9SiKnr0kb9PjceJ93nHb';
const PROJECT_WIKI_PARENT_NODE_TOKEN =
  process.env.PROJECT_GRAPH_WIKI_PARENT_NODE_TOKEN ||
  'EVYowE8rSi4ZWqkCIu8cc2EQn8d';

const PROJECT_WEB_APP_URL =
  process.env.PROJECT_GRAPH_WEB_APP_URL ||
  'https://vcnqhq28cfdm.feishuapp.com/app/app_17bfb2avggp';

const DEFAULT_BASE: BaseLinkConfig = {
  baseToken: 'WC3cb3acOaminMsXKbTcwPKdnMg',
  nodeTableId: 'tblVIjVsxIbuk1QQ',
  edgeTableId: 'tblFSCyy1hjLEFO5',
  url: 'https://my.feishu.cn/base/WC3cb3acOaminMsXKbTcwPKdnMg',
};
const DEFAULT_PROJECT_RECORD_ID = 'recvrkK0GUt2Sf';
const PROJECT_META_MARKER = '[project-graph-meta]';
const PROJECT_BOARD_VIEW_NAME = '人员分工看板';

const BASE_URL =
  'https://my.feishu.cn/base/WC3cb3acOaminMsXKbTcwPKdnMg?table=tblVIjVsxIbuk1QQ&view=vewqWl33qS';
const PROJECT_GROUP_OPTIONS = [
  { name: '硬件主干', hue: 'Orange', lightness: 'Light' },
  { name: '结构设计', hue: 'Yellow', lightness: 'Light' },
  { name: '电子电气', hue: 'Red', lightness: 'Light' },
  { name: '驱动固件', hue: 'Purple', lightness: 'Light' },
  { name: '软件应用', hue: 'Blue', lightness: 'Light' },
  { name: '算法', hue: 'Wathet', lightness: 'Light' },
  { name: '联调测试', hue: 'Green', lightness: 'Light' },
] as const;

const NODE_FIELD = {
  NAME: '节点名称',
  NODE_ID: '节点ID',
  SUBTITLE: '副标题',
  GROUP: '分组',
  TYPE: '节点类型',
  STATUS: '状态',
  OWNER: '负责人ID',
  LEGACY_OWNER: '负责人',
  TASK_OWNER: '任务负责人',
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

const PROJECT_FIELD = {
  CODE: '项目编码',
  NAME: '项目名称',
  STATUS: '状态',
  DESCRIPTION: '说明',
} as const;

const CATALOG_FIELD = {
  CODE: '项目编码',
  NAME: '项目名称',
  STATUS: '状态',
  DESCRIPTION: '项目说明',
  PROGRESS: '整体进度',
  DOCUMENT_URL: '项目文档',
  WEB_URL: 'Web 可视化',
  BASE_TOKEN: 'Base Token',
  WIKI_NODE_TOKEN: 'Wiki 节点 Token',
  NODE_TABLE_ID: '节点表 ID',
  EDGE_TABLE_ID: '连线表 ID',
  SOURCE: '创建来源',
  CREATED_AT: '创建时间',
  UPDATED_AT: '更新时间',
} as const;

type PluginRecord = { id: string; record: Record<string, unknown> };

interface ProjectWorkspaceMeta {
  parentId?: string;
  sort: number;
  source: ProjectWorkspace['source'];
  base: BaseLinkConfig;
}

@Injectable()
export class ProjectGraphService {
  private readonly logger = new Logger(ProjectGraphService.name);
  private projectCatalogCache?: {
    expiresAt: number;
    value: ProjectWorkspaceListResponse;
  };

  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly authnService: AuthNPaasService,
    @Optional() private readonly larkCli?: LarkCliBaseClient,
    @Optional() private readonly feishuBase?: FeishuBaseClient,
    @Optional() private readonly oauth?: FeishuOAuthService,
    @Optional() private readonly workspaceRepository?: ProjectWorkspaceRepository,
  ) {}

  async listProjects(
    forceRefresh = false,
  ): Promise<ProjectWorkspaceListResponse> {
    const openApiProjects = this.usesOpenApiStorage()
      ? await this.workspaceRepository!.listReady()
      : [];
    if (this.usesOpenApiStorage() && openApiProjects.length === 0) {
      this.logger.warn(
        'OpenAPI project directory is empty; using the legacy catalog until migration completes.',
      );
    }
    if (forceRefresh) {
      this.projectCatalogCache = undefined;
    }
    if (
      this.projectCatalogCache &&
      this.projectCatalogCache.expiresAt > Date.now()
    ) {
      return this.projectCatalogCache.value;
    }
    const records = this.usesLarkCliStorage()
      ? await this.larkCli!.listRecords(CATALOG_BASE_TOKEN, CATALOG_TABLE_ID)
      : await this.searchAllRecords(PROJECT_PLUGIN_ID);
    const catalogProjects = records
      .map((record, index) => {
        const catalogProject = mapCatalogRecord(record, index);
        if (catalogProject) return catalogProject;
        const hasLegacyIdentity = Boolean(
          extractText(record.record[PROJECT_FIELD.CODE]).trim() ||
            extractText(record.record[PROJECT_FIELD.NAME]).trim(),
        );
        return hasLegacyIdentity ? mapProjectRecord(record, index) : null;
      })
      .filter(
        (project): project is ProjectWorkspace =>
          Boolean(project?.id && project.name.trim()),
      );
    const openApiBaseTokens = new Set(
      openApiProjects.map((project) => project.base.baseToken),
    );
    const openApiIds = new Set(openApiProjects.map((project) => project.id));
    const projects = [
      ...openApiProjects,
      ...catalogProjects.filter(
        (project) =>
          !openApiIds.has(project.id) &&
          !openApiBaseTokens.has(project.base.baseToken),
      ),
    ];
    if (projects.length === 0 && !this.usesLarkCliStorage()) {
      projects.push(buildDefaultWorkspace());
    }
    const defaultProjectId =
      projects.find((project) => project.code === 'headset-rd')?.id ??
      projects[0]?.id ??
      '';
    const value = { projects, defaultProjectId };
    this.projectCatalogCache = {
      expiresAt: Date.now() + 5_000,
      value,
    };
    return value;
  }

  async retryCatalogSync(): Promise<{ synced: boolean }> {
    if (!this.usesOpenApiStorage()) return { synced: false };
    const userId = await this.requireCurrentLarkUserId();
    await this.retryPendingCatalogProjects(userId);
    this.projectCatalogCache = undefined;
    return { synced: true };
  }

  async createProject(
    request: CreateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    const name = request.name?.trim();
    if (!name) {
      throw new BadRequestException('项目名称不能为空');
    }
    if (request.source !== 'shared-base' && request.source !== 'linked-base') {
      throw new BadRequestException('项目数据源无效');
    }
    const catalog = await this.listProjects(true);
    if (
      catalog.projects.some(
        (project) =>
          project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new BadRequestException('项目名称已存在');
    }
    if (this.usesOpenApiStorage()) {
      return this.createOpenApiProject({ ...request, name });
    }
    if (this.usesLarkCliStorage()) {
      return this.createIndependentProject({
        ...request,
        name,
        source: 'linked-base',
      });
    }
    // Miaoda's cloud runtime cannot execute the local lark-cli flow that creates
    // a brand-new Wiki Base. Keep project creation durable by falling back to a
    // project-scoped workspace in the shared Base. The returned source is
    // truthful, so the client never claims that a separate document was made.
    const effectiveSource: ProjectWorkspace['source'] = 'shared-base';
    const base = DEFAULT_BASE;
    const code = buildProjectCode(name);
    const meta: ProjectWorkspaceMeta = {
      parentId: request.parentId || undefined,
      sort: Date.now(),
      source: effectiveSource,
      base,
    };
    const documentUrl = base.url?.trim();
    const recordId = await this.pluginAddRecord(PROJECT_PLUGIN_ID, {
      [CATALOG_FIELD.CODE]: code,
      [CATALOG_FIELD.NAME]: name,
      [CATALOG_FIELD.STATUS]: '规划',
      [CATALOG_FIELD.DESCRIPTION]: request.description?.trim() ?? '',
      [CATALOG_FIELD.PROGRESS]: 0,
      ...(documentUrl
        ? {
            [CATALOG_FIELD.DOCUMENT_URL]: {
              text: name,
              link: documentUrl,
            },
          }
        : {}),
      [CATALOG_FIELD.BASE_TOKEN]: base.baseToken,
      [CATALOG_FIELD.WIKI_NODE_TOKEN]: '',
      [CATALOG_FIELD.NODE_TABLE_ID]: base.nodeTableId,
      [CATALOG_FIELD.EDGE_TABLE_ID]: base.edgeTableId,
      [CATALOG_FIELD.SOURCE]: 'Web',
    });
    this.projectCatalogCache = undefined;
    return {
      id: recordId,
      code,
      name,
      description: request.description?.trim() ?? '',
      status: 'planned',
      parentId: meta.parentId,
      sort: meta.sort,
      source: meta.source,
      base,
      writable: true,
      updatedAt: formatNowTime(),
    };
  }

  async updateProjectName(
    projectId: string,
    request: UpdateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    const name = request.name?.trim();
    if (!name) {
      throw new BadRequestException('项目名称不能为空');
    }
    if (name.length > 100) {
      throw new BadRequestException('项目名称不能超过 100 个字符');
    }
    const catalog = await this.listProjects(true);
    const project = catalog.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new BadRequestException('项目不存在或已被移除');
    }
    if (
      catalog.projects.some(
        (item) =>
          item.id !== project.id &&
          item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new BadRequestException('项目名称已存在');
    }
    if (project.name === name) {
      return project;
    }

    try {
      if (this.usesOpenApiStorage()) {
        const userId = await this.requireCurrentLarkUserId();
        await this.feishuBase!.renameBase(userId, project.base.baseToken, name);
        try {
          await this.workspaceRepository!.rename(project.id, name);
        } catch (databaseError: unknown) {
          try {
            await this.feishuBase!.renameBase(
              userId,
              project.base.baseToken,
              project.name,
            );
          } catch (rollbackError: unknown) {
            this.logger.error(
              `Project title rollback failed: ${stringifyError(rollbackError)}`,
            );
          }
          throw databaseError;
        }
        this.projectCatalogCache = undefined;
      } else if (this.usesLarkCliStorage()) {
        await this.larkCli!.renameBitable(project.base.baseToken, name);
        try {
          await this.larkCli!.updateRecord(
            CATALOG_BASE_TOKEN,
            CATALOG_TABLE_ID,
            project.id,
            { [CATALOG_FIELD.NAME]: name },
          );
        } catch (error: unknown) {
          try {
            await this.larkCli!.renameBitable(
              project.base.baseToken,
              project.name,
            );
          } catch (rollbackError: unknown) {
            this.logger.error(
              `Project title rollback failed: ${stringifyError(rollbackError)}`,
            );
          }
          throw error;
        }
      } else {
        await this.pluginUpdateRecord(PROJECT_PLUGIN_ID, project.id, {
          [CATALOG_FIELD.NAME]: name,
        });
      }
      this.projectCatalogCache = undefined;
      return {
        ...project,
        name,
        updatedAt: formatNowTime(),
      };
    } catch (error: unknown) {
      this.logger.error(`Project rename failed: ${stringifyError(error)}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `项目名称修改失败: ${stringifyError(error)}`,
      );
    }
  }

  private async createOpenApiProject(
    request: CreateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    if (!this.feishuBase || !this.workspaceRepository) {
      throw new BadRequestException('飞书 OpenAPI 项目存储未初始化');
    }
    const userId = await this.authnService.getCurrentUserLarkUserId();
    if (!userId) throw new ForbiddenException('无法识别当前飞书用户');
    const workspace = await this.workspaceRepository.findOrCreate(
      request.name.trim(),
      request.description?.trim() ?? '',
      userId,
    );
    if (
      workspace.provisioningStatus === 'ready' &&
      workspace.base?.baseToken &&
      workspace.base.nodeTableId &&
      workspace.base.edgeTableId
    ) {
      return {
        id: workspace.id,
        code: workspace.code,
        name: workspace.name,
        description: workspace.description,
        status: 'planned',
        sort: Date.now(),
        source: 'linked-base',
        base: workspace.base as BaseLinkConfig,
        writable: true,
      };
    }
    try {
      const base = await this.feishuBase.provisionProjectBase(
        userId,
        workspace.name,
        workspace.base ?? {},
        buildIndependentNodeFields(),
        buildIndependentEdgeFields,
        async (progress) =>
          this.workspaceRepository!.saveProvisioningProgress(
            workspace.id,
            progress,
          ),
      );
      await this.workspaceRepository.saveBase(workspace.id, base);
      this.projectCatalogCache = undefined;
      try {
        await this.syncCatalogProject(userId, {
          ...workspace,
          base,
        });
      } catch (catalogError: unknown) {
        await this.workspaceRepository.markCatalogPending(
          workspace.id,
          stringifyError(catalogError),
        );
        this.logger.warn(
          `Project created but catalog mirror failed: ${stringifyError(catalogError)}`,
        );
      }
      return {
        id: workspace.id,
        code: workspace.code,
        name: workspace.name,
        description: workspace.description,
        status: 'planned',
        sort: Date.now(),
        source: 'linked-base',
        base,
        writable: true,
        updatedAt: formatNowTime(),
      };
    } catch (error: unknown) {
      await this.workspaceRepository.markFailed(
        workspace.id,
        stringifyError(error),
      );
      throw error;
    }
  }

  private async syncCatalogProject(
    userId: string,
    workspace: {
      id: string;
      code: string;
      name: string;
      description: string;
      catalogRecordId?: string;
      base?: Partial<BaseLinkConfig>;
    },
  ): Promise<void> {
    const base = workspace.base;
    if (!base?.baseToken || !base.nodeTableId || !base.edgeTableId) {
      throw new BadRequestException('项目 Base 尚未创建完成');
    }
    await this.feishuBase!.ensureUrlField(
      userId,
      CATALOG_BASE_TOKEN,
      CATALOG_TABLE_ID,
      CATALOG_FIELD.WEB_URL,
    );
    const webUrl = `${PROJECT_WEB_APP_URL}?projectId=${encodeURIComponent(workspace.id)}`;
    const fields = {
      [CATALOG_FIELD.CODE]: workspace.code,
      [CATALOG_FIELD.NAME]: workspace.name,
      [CATALOG_FIELD.STATUS]: '规划',
      [CATALOG_FIELD.DESCRIPTION]: workspace.description,
      [CATALOG_FIELD.PROGRESS]: 0,
      [CATALOG_FIELD.DOCUMENT_URL]: base.url ?? '',
      [CATALOG_FIELD.WEB_URL]: webUrl,
      [CATALOG_FIELD.BASE_TOKEN]: base.baseToken,
      [CATALOG_FIELD.WIKI_NODE_TOKEN]: '',
      [CATALOG_FIELD.NODE_TABLE_ID]: base.nodeTableId,
      [CATALOG_FIELD.EDGE_TABLE_ID]: base.edgeTableId,
      [CATALOG_FIELD.SOURCE]: 'Web OpenAPI',
    };
    let recordId = workspace.catalogRecordId;
    if (!recordId) {
      const records = await this.feishuBase!.listRecords(
        userId,
        CATALOG_BASE_TOKEN,
        CATALOG_TABLE_ID,
      );
      recordId = records.find(
        (record) =>
          extractText(record.record[CATALOG_FIELD.CODE]) === workspace.code ||
          extractText(record.record[CATALOG_FIELD.BASE_TOKEN]) === base.baseToken,
      )?.id;
    }
    if (recordId) {
      await this.feishuBase!.updateRecord(
        userId,
        CATALOG_BASE_TOKEN,
        CATALOG_TABLE_ID,
        recordId,
        fields,
      );
    } else {
      recordId = await this.feishuBase!.createSingleRecord(
        userId,
        CATALOG_BASE_TOKEN,
        CATALOG_TABLE_ID,
        fields,
      );
    }
    await this.workspaceRepository!.markCatalogSynced(workspace.id, recordId);
  }

  private async retryPendingCatalogProjects(userId: string): Promise<void> {
    const pending = await this.workspaceRepository!.listPendingCatalog(userId);
    for (const workspace of pending.slice(0, 5)) {
      try {
        await this.syncCatalogProject(userId, workspace);
      } catch (error: unknown) {
        await this.workspaceRepository!.markCatalogPending(
          workspace.id,
          stringifyError(error),
        );
        this.logger.warn(
          `Catalog mirror retry failed for ${workspace.id}: ${stringifyError(error)}`,
        );
      }
    }
  }

  private async createIndependentProject(
    request: CreateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    const name = request.name.trim();
    const code = buildProjectCode(name);
    try {
      const document = await this.larkCli!.createWikiBase(
        PROJECT_WIKI_PARENT_NODE_TOKEN,
        name,
      );
      const existingTables = await this.larkCli!.listTables(document.baseToken);
      if (existingTables[0]) {
        await this.larkCli!.renameTable(
          document.baseToken,
          existingTables[0].id,
          '项目概览',
        );
      }
      const nodeTable = await this.larkCli!.createTable(
        document.baseToken,
        '项目节点',
        buildIndependentNodeFields(),
      );
      const edgeTable = await this.larkCli!.createTable(
        document.baseToken,
        '项目连接关系',
        buildIndependentEdgeFields(nodeTable.id),
      );
      const boardView = await this.larkCli!.createView(
        document.baseToken,
        nodeTable.id,
        PROJECT_BOARD_VIEW_NAME,
        'kanban',
      );
      await this.larkCli!.setViewGroup(
        document.baseToken,
        nodeTable.id,
        boardView.id,
        NODE_FIELD.TASK_OWNER,
      );
      await this.larkCli!.setViewVisibleFields(
        document.baseToken,
        nodeTable.id,
        boardView.id,
        buildProjectBoardVisibleFields(),
      );
      const base: BaseLinkConfig = {
        baseToken: document.baseToken,
        nodeTableId: nodeTable.id,
        edgeTableId: edgeTable.id,
        url: document.url,
      };
      const recordId = await this.larkCli!.createRecord(
        CATALOG_BASE_TOKEN,
        CATALOG_TABLE_ID,
        {
          [CATALOG_FIELD.CODE]: code,
          [CATALOG_FIELD.NAME]: name,
          [CATALOG_FIELD.STATUS]: '规划',
          [CATALOG_FIELD.DESCRIPTION]: request.description?.trim() ?? '',
          [CATALOG_FIELD.PROGRESS]: 0,
          [CATALOG_FIELD.DOCUMENT_URL]: document.url,
          [CATALOG_FIELD.BASE_TOKEN]: document.baseToken,
          [CATALOG_FIELD.WIKI_NODE_TOKEN]: document.nodeToken,
          [CATALOG_FIELD.NODE_TABLE_ID]: nodeTable.id,
          [CATALOG_FIELD.EDGE_TABLE_ID]: edgeTable.id,
          [CATALOG_FIELD.SOURCE]: 'Web',
        },
      );
      this.projectCatalogCache = undefined;
      return {
        id: recordId,
        code,
        name,
        description: request.description?.trim() ?? '',
        status: 'planned',
        parentId: request.parentId || undefined,
        sort: Date.now(),
        source: 'linked-base',
        base,
        writable: true,
        updatedAt: formatNowTime(),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Independent project creation failed: ${stringifyError(error)}`,
      );
      throw new BadRequestException(
        `独立项目文档创建失败: ${stringifyError(error)}`,
      );
    }
  }

  async deleteProject(
    projectId: string,
    request?: DeleteProjectWorkspaceRequest,
  ): Promise<DeleteProjectWorkspaceResponse> {
    const project = await this.resolveProject(projectId);
    if (
      project.id === DEFAULT_PROJECT_RECORD_ID ||
      project.code === 'headset-rd'
    ) {
      throw new BadRequestException('默认项目不能删除');
    }
    if (project.source === 'linked-base' && this.usesOpenApiStorage()) {
      if (!request?.deleteBase || request.confirmName !== project.name) {
        throw new BadRequestException('请输入完整项目名称确认删除');
      }
      const workspace = await this.workspaceRepository!.findById(project.id);
      if (!workspace) throw new BadRequestException('项目不存在或已被移除');
      const userId = await this.requireCurrentLarkUserId();
      if (workspace.creatorUserId !== userId) {
        throw new ForbiddenException('只有项目创建者可以删除项目');
      }
      if (!workspace.base?.baseToken) {
        if (workspace.deletionStatus === 'deleted') {
          return {
            deletedProjectId: project.id,
            deletedBase: true,
            savedAt: formatNowTime(),
          };
        }
        throw new BadRequestException('项目缺少独立 Base 绑定，无法安全删除');
      }
      await this.workspaceRepository!.markDeleting(project.id);
      try {
        await this.feishuBase!.deleteBase(userId, workspace.base.baseToken);
        if (workspace.catalogRecordId) {
          try {
            await this.feishuBase!.deleteRecord(
              userId,
              CATALOG_BASE_TOKEN,
              CATALOG_TABLE_ID,
              workspace.catalogRecordId,
            );
          } catch (catalogError: unknown) {
            if (!/not[_ ]found|不存在/i.test(stringifyError(catalogError))) {
              throw catalogError;
            }
          }
        }
        await this.workspaceRepository!.markDeleted(project.id);
        this.projectCatalogCache = undefined;
        return {
          deletedProjectId: project.id,
          deletedBase: true,
          savedAt: formatNowTime(),
        };
      } catch (error: unknown) {
        await this.workspaceRepository!.markDeletionFailed(
          project.id,
          stringifyError(error),
        );
        throw error;
      }
    }
    if (project.source !== 'shared-base') {
      throw new BadRequestException('外部 Base 项目不能从当前应用删除');
    }
    const [nodeRecords, edgeRecords] = await Promise.all([
      this.searchAllRecords(NODE_PLUGIN_ID, project.base),
      this.searchAllRecords(EDGE_PLUGIN_ID, project.base),
    ]);
    const hasProjectData =
      nodeRecords.some((record) =>
        recordLinksToProject(record, NODE_FIELD.PROJECT, project.id),
      ) ||
      edgeRecords.some((record) =>
        recordLinksToProject(record, EDGE_FIELD.PROJECT, project.id),
      );
    if (hasProjectData) {
      throw new BadRequestException('项目仍有节点或连线，不能直接删除');
    }
    await this.pluginDeleteRecord(PROJECT_PLUGIN_ID, project.id);
    this.projectCatalogCache = undefined;
    return {
      deletedProjectId: project.id,
      deletedBase: false,
      savedAt: formatNowTime(),
    };
  }

  async getGraph(projectId?: string): Promise<ProjectGraphResponse> {
    try {
      const project = await this.resolveProject(projectId);
      return await this.buildBaseGraph(project);
    } catch (error: unknown) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
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
    projectId?: string,
  ): Promise<ProjectGraphResponse> {
    if (!nodeId) {
      throw new BadRequestException('nodeId is required');
    }
    const project = await this.resolveProject(projectId);
    const node = await this.findNodeForProject(nodeId, project);
    if (!node) throw new BadRequestException('node not found');
    if (patch.lane) {
      await this.ensureProjectGroupOptions(project);
    }
    await this.pluginUpdateRecord(
      NODE_PLUGIN_ID,
      node.id,
      project.source === 'linked-base'
        ? this.usesDirectBaseStorage()
          ? toCliNodeFields(patch)
          : toLinkedNodeFields(patch)
        : toNodeFields(patch),
      project.base,
    );
    return this.getGraph(project.id);
  }

  async createNode(
    node: CreateProjectGraphNodeRequest,
    projectId?: string,
  ): Promise<CreateProjectGraphNodeResponse> {
    if (!node.title) {
      throw new BadRequestException('title is required');
    }
    const project = await this.resolveProject(projectId);
    await this.ensureProjectGroupOptions(project);
    const createdNodeId = await this.pluginAddRecord(
      NODE_PLUGIN_ID,
      project.source === 'linked-base'
        ? this.usesDirectBaseStorage()
          ? toCliNewNodeFields(node)
          : toLinkedNewNodeFields(node)
        : toNewNodeFields(node, project),
      project.base,
    );
    const parentId = node.linkedIds?.[0];
    let createdEdge: ProjectGraphEdge | undefined;
    if (parentId) {
      const edgeInput: CreateProjectGraphEdgeRequest = {
        source: parentId,
        target: createdNodeId,
        label: node.lane === 'hardware' ? '演进' : '派生',
        critical: false,
        kind: 'tree',
      };
      try {
        const createdEdgeId = await this.pluginAddRecord(
          EDGE_PLUGIN_ID,
          this.usesDirectBaseStorage()
            ? toCliNewEdgeFields(edgeInput)
            : toNewEdgeFields(edgeInput, project),
          project.base,
        );
        createdEdge = { id: createdEdgeId, ...edgeInput };
      } catch (error: unknown) {
        try {
          await this.pluginDeleteRecord(
            NODE_PLUGIN_ID,
            createdNodeId,
            project.base,
          );
        } catch (rollbackError: unknown) {
          this.logger.error(
            `Node rollback after edge creation failure failed: ${stringifyError(rollbackError)}`,
          );
        }
        throw error;
      }
    }
    return {
      node: {
        ...node,
        id: createdNodeId,
        linkedIds: parentId ? [parentId] : [],
      },
      edge: createdEdge,
      savedAt: formatNowTime(),
    };
  }

  async deleteNode(
    nodeId: string,
    projectId?: string,
  ): Promise<DeleteProjectGraphNodeResponse> {
    if (!nodeId) {
      throw new BadRequestException('nodeId is required');
    }
    const project = await this.resolveProject(projectId);
    const node = await this.findNodeForProject(nodeId, project);
    if (!node) throw new BadRequestException('node not found');
    const recordId = node.id;
    const edgeRecords = await this.searchAllRecords(
      EDGE_PLUGIN_ID,
      project.base,
    );
    const recordIdSet = new Set([recordId]);
    const incidentEdges = edgeRecords.filter(
      (edgeRecord) =>
        extractLinkIds(edgeRecord.record[EDGE_FIELD.SOURCE], recordIdSet)
          .length > 0 ||
        extractLinkIds(edgeRecord.record[EDGE_FIELD.TARGET], recordIdSet)
          .length > 0,
    );
    for (const edgeRecord of incidentEdges) {
      await this.pluginDeleteRecord(
        EDGE_PLUGIN_ID,
        edgeRecord.id,
        project.base,
      );
    }
    await this.pluginDeleteRecord(NODE_PLUGIN_ID, recordId, project.base);
    return { deletedNodeId: nodeId, savedAt: formatNowTime() };
  }

  async createEdge(
    edge: CreateProjectGraphEdgeRequest,
    projectId?: string,
  ): Promise<ProjectGraphResponse> {
    if (!edge.source || !edge.target) {
      throw new BadRequestException('source and target are required');
    }
    const project = await this.resolveProject(projectId);
    const nodeRecords = await this.searchAllRecords(NODE_PLUGIN_ID, project.base);
    const nodeRecordIds = new Set(nodeRecords.map((record) => record.id));
    const sourceId = resolveRecordId(
      edge.source,
      nodeRecords,
      NODE_FIELD.NODE_ID,
    );
    const targetId = resolveRecordId(
      edge.target,
      nodeRecords,
      NODE_FIELD.NODE_ID,
    );
    if (
      !sourceId ||
      !targetId ||
      !nodeRecordIds.has(sourceId) ||
      !nodeRecordIds.has(targetId)
    ) {
      throw new BadRequestException('连接节点不属于当前项目');
    }
    const edgeInput = { ...edge, source: sourceId, target: targetId };
    await this.pluginAddRecord(
      EDGE_PLUGIN_ID,
      this.usesDirectBaseStorage()
        ? toCliNewEdgeFields(edgeInput)
        : toNewEdgeFields(edgeInput, project),
      project.base,
    );
    return this.getGraph(project.id);
  }

  async updateEdge(
    edgeId: string,
    patch: UpdateProjectGraphEdgeRequest,
    projectId?: string,
  ): Promise<ProjectGraphResponse> {
    if (!edgeId) {
      throw new BadRequestException('edgeId is required');
    }
    const project = await this.resolveProject(projectId);
    const record = await this.findEdgeByEdgeId(edgeId, project.base);
    if (!record) throw new BadRequestException('edge not found');
    await this.pluginUpdateRecord(
      EDGE_PLUGIN_ID,
      record.id,
      toEdgeFields(patch),
      project.base,
    );
    return this.getGraph(project.id);
  }

  async deleteEdge(
    edgeId: string,
    projectId?: string,
  ): Promise<ProjectGraphResponse> {
    if (!edgeId) {
      throw new BadRequestException('edgeId is required');
    }
    const project = await this.resolveProject(projectId);
    const record = await this.findEdgeByEdgeId(edgeId, project.base);
    if (!record) throw new BadRequestException('edge not found');
    let parentCleanup:
      | { targetId: string; remainingParentIds: string[] }
      | undefined;
    if (extractText(record.record[EDGE_FIELD.TYPE]) === '主树') {
      const nodeRecords = await this.searchAllRecords(
        NODE_PLUGIN_ID,
        project.base,
      );
      const nodeRecordIds = new Set(nodeRecords.map((node) => node.id));
      const sourceId = extractFirstLinkId(
        record.record[EDGE_FIELD.SOURCE],
        nodeRecordIds,
      );
      const targetId = extractFirstLinkId(
        record.record[EDGE_FIELD.TARGET],
        nodeRecordIds,
      );
      const targetRecord = nodeRecords.find((node) => node.id === targetId);
      const currentParentIds = targetRecord
        ? extractLinkIds(targetRecord.record[NODE_FIELD.PARENT], nodeRecordIds)
        : [];
      if (sourceId && targetId && currentParentIds.includes(sourceId)) {
        parentCleanup = {
          targetId,
          remainingParentIds: currentParentIds.filter(
            (parentId) => parentId !== sourceId,
          ),
        };
      }
    }
    await this.pluginDeleteRecord(EDGE_PLUGIN_ID, record.id, project.base);
    if (parentCleanup) {
      try {
        await this.pluginUpdateRecord(
          NODE_PLUGIN_ID,
          parentCleanup.targetId,
          { [NODE_FIELD.PARENT]: parentCleanup.remainingParentIds },
          project.base,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Edge deleted but parent link cleanup failed: ${stringifyError(error)}`,
        );
      }
    }
    return this.getGraph(project.id);
  }

  private async ensureProjectGroupOptions(
    project: ProjectWorkspace,
  ): Promise<void> {
    if (!this.usesOpenApiStorage() || project.source !== 'linked-base') return;
    const userId = await this.requireCurrentLarkUserId();
    await this.feishuBase!.ensureSelectOptions(
      userId,
      project.base.baseToken,
      project.base.nodeTableId,
      NODE_FIELD.GROUP,
      PROJECT_GROUP_OPTIONS.map((option) => ({ ...option })),
    );
  }

  // --- Plugin Base operations ---

  private async searchAllRecords(
    pluginId: string,
    base?: BaseLinkConfig,
    maxRecords?: number,
  ): Promise<PluginRecord[]> {
    if (this.usesOpenApiStorage() && base) {
      const userId = await this.requireCurrentLarkUserId();
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      return this.feishuBase!.listRecords(
        userId,
        base.baseToken,
        tableId,
      ) as Promise<FeishuBaseRecord[]>;
    }
    if (this.usesLarkCliStorage() && base) {
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      const records = await this.larkCli!.listRecords(base.baseToken, tableId);
      return maxRecords ? records.slice(0, maxRecords) : records;
    }
    const allRecords: PluginRecord[] = [];
    let pageToken: string | undefined;
    do {
      const input: Record<string, unknown> = this.withBaseBinding(
        pluginId,
        { pageSize: maxRecords ?? 500 },
        base,
      );
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
      if (maxRecords && allRecords.length >= maxRecords) {
        return allRecords.slice(0, maxRecords);
      }
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);
    return allRecords;
  }

  private async pluginAddRecord(
    pluginId: string,
    record: Record<string, unknown>,
    base?: BaseLinkConfig,
  ): Promise<string> {
    if (this.usesOpenApiStorage() && base) {
      const userId = await this.requireCurrentLarkUserId();
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      return this.feishuBase!.createRecord(
        userId,
        base.baseToken,
        tableId,
        record,
      );
    }
    if (this.usesLarkCliStorage() && base) {
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      return this.larkCli!.createRecord(base.baseToken, tableId, record);
    }
    const result = await this.callPlugin<{
      records: Array<{ id: string }>;
    }>(
      pluginId,
      'batchAddRecords',
      this.withBaseBinding(pluginId, { records: [{ record }] }, base),
    );
    if (!result.records?.[0]?.id) {
      throw new BadRequestException('Base record creation returned no id');
    }
    return result.records[0].id;
  }

  private async pluginUpdateRecord(
    pluginId: string,
    recordId: string,
    record: Record<string, unknown>,
    base?: BaseLinkConfig,
  ): Promise<void> {
    if (this.usesOpenApiStorage() && base) {
      const userId = await this.requireCurrentLarkUserId();
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      await this.feishuBase!.updateRecord(
        userId,
        base.baseToken,
        tableId,
        recordId,
        record,
      );
      return;
    }
    if (this.usesLarkCliStorage() && base) {
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      await this.larkCli!.updateRecord(
        base.baseToken,
        tableId,
        recordId,
        record,
      );
      return;
    }
    await this.callPlugin(
      pluginId,
      'batchUpdateRecords',
      this.withBaseBinding(
        pluginId,
        { records: [{ id: recordId, record }] },
        base,
      ),
    );
  }

  private async pluginDeleteRecord(
    pluginId: string,
    recordId: string,
    base?: BaseLinkConfig,
  ): Promise<void> {
    if (this.usesOpenApiStorage() && base) {
      const userId = await this.requireCurrentLarkUserId();
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      await this.feishuBase!.deleteRecord(
        userId,
        base.baseToken,
        tableId,
        recordId,
      );
      return;
    }
    if (this.usesLarkCliStorage() && base) {
      const tableId =
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId;
      await this.larkCli!.deleteRecord(base.baseToken, tableId, recordId);
      return;
    }
    await this.callPlugin(
      pluginId,
      'deleteRecords',
      this.withBaseBinding(pluginId, { recordIDs: [recordId] }, base),
    );
  }

  private withBaseBinding(
    pluginId: string,
    input: Record<string, unknown>,
    base?: BaseLinkConfig,
  ): Record<string, unknown> {
    if (!base || pluginId === PROJECT_PLUGIN_ID) return input;
    return {
      ...input,
      baseToken: base.baseToken,
      tableId:
        pluginId === EDGE_PLUGIN_ID ? base.edgeTableId : base.nodeTableId,
    };
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
        JSON.stringify({
          pluginInstanceId: pluginId,
          actionKey,
          outputMode: 'unary',
          inputKeys: Object.keys(input),
          error: msg,
        }),
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

  private usesOpenApiStorage(): boolean {
    return (
      process.env.PROJECT_GRAPH_STORAGE_MODE === 'feishu-openapi' &&
      Boolean(
        this.feishuBase &&
          this.workspaceRepository?.isEnabled() &&
          this.oauth,
      )
    );
  }

  private async requireCurrentLarkUserId(): Promise<string> {
    const userId = await this.authnService.getCurrentUserLarkUserId();
    if (!userId) throw new ForbiddenException('无法识别当前飞书用户');
    return userId;
  }

  private usesDirectBaseStorage(): boolean {
    return this.usesOpenApiStorage() || this.usesLarkCliStorage();
  }

  private usesLarkCliStorage(): boolean {
    return Boolean(this.larkCli?.isEnabled());
  }

  // --- Graph assembly ---

  private async resolveProject(projectId?: string): Promise<ProjectWorkspace> {
    const catalog = await this.listProjects();
    const targetId = projectId || catalog.defaultProjectId;
    const project = catalog.projects.find((item) => item.id === targetId);
    if (!project) {
      throw new BadRequestException('项目不存在或已被移除');
    }
    return project;
  }

  private async buildBaseGraph(
    project: ProjectWorkspace,
  ): Promise<ProjectGraphResponse> {
    const [nodeRecords, edgeRecords] = await Promise.all([
      this.searchAllRecords(NODE_PLUGIN_ID, project.base),
      this.searchAllRecords(EDGE_PLUGIN_ID, project.base),
    ]);
    const meaningfulNodeRecords = nodeRecords.filter(
      (record) =>
        Boolean(extractText(record.record[NODE_FIELD.NAME]).trim()) ||
        Boolean(extractText(record.record[NODE_FIELD.NODE_ID]).trim()),
    );
    const scopedNodeRecords =
      project.source === 'shared-base'
        ? meaningfulNodeRecords.filter((record) =>
            extractLinkIds(
              record.record[NODE_FIELD.PROJECT],
              new Set([project.id]),
            ).includes(project.id),
          )
        : meaningfulNodeRecords;
    const nodeIds = new Set<string>(scopedNodeRecords.map((r) => r.id));
    const mappedNodes = scopedNodeRecords.map((r) =>
      this.mapGraphNodeRecordToNode(r.record, r.id, nodeIds),
    );
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
        ...project.base,
        url:
          project.base.url ??
          `https://my.feishu.cn/base/${project.base.baseToken}`,
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
    const rawLinkedIds = extractLinkIds(record[NODE_FIELD.PARENT], recordIdSet);
    const groupValue = extractText(record[NODE_FIELD.GROUP]);
    const typeValue = extractText(record[NODE_FIELD.TYPE]);
    const laneValue = toProjectLane(typeValue, groupValue);
    const userOwners = this.extractOwners(record[NODE_FIELD.OWNER]);
    const taskOwners = extractNamedOwners(record[NODE_FIELD.TASK_OWNER]);
    const legacyUserOwners = this.extractOwners(
      record[NODE_FIELD.LEGACY_OWNER],
    );
    return {
      id: recordId,
      title: extractText(record[NODE_FIELD.NAME]) || '未命名节点',
      subtitle: extractText(record[NODE_FIELD.SUBTITLE]),
      lane: laneValue,
      kind: toProjectNodeKind(typeValue, laneValue),
      status: toProjectStatus(extractText(record[NODE_FIELD.STATUS])),
      owners: userOwners.length
        ? userOwners
        : taskOwners.length
          ? taskOwners
          : legacyUserOwners.length
            ? legacyUserOwners
            : extractNamedOwners(record[NODE_FIELD.LEGACY_OWNER]),
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
    const sourceId = extractFirstLinkId(record[EDGE_FIELD.SOURCE], recordIdSet);
    const targetId = extractFirstLinkId(record[EDGE_FIELD.TARGET], recordIdSet);
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
      kind: extractText(record[EDGE_FIELD.TYPE]) === '主树' ? 'tree' : 'cross',
    };
  }

  // --- Owner handling ---

  private extractOwners(value: unknown): ProjectOwner[] {
    if (value == null) return [];
    if (Array.isArray(value)) {
      return value
        .map((entry): ProjectOwner | null => {
          if (entry == null) return null;
          if (typeof entry === 'object') {
            const item = entry as Record<string, unknown>;
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
          const userId = String(entry);
          if (!userId || userId === '0') return null;
          return { apaasUserId: userId, name: '' };
        })
        .filter((owner): owner is ProjectOwner => Boolean(owner));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '待指定') return [];
      return trimmed
        .split('/')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ apaasUserId: '', name }));
    }
    if (typeof value === 'number') {
      if (value === 0) return [];
      return [{ apaasUserId: String(value), name: '' }];
    }
    return [];
  }

  private async enrichOwnerIds(nodes: ProjectGraphNode[]): Promise<void> {
    const owners = nodes
      .flatMap((node) => node.owners)
      .filter((owner) => Boolean(owner.apaasUserId));
    const uniqueIds = [...new Set(owners.map((owner) => owner.apaasUserId))];
    if (uniqueIds.length === 0) return;

    try {
      const larkUserIds =
        await this.authnService.getBatchLarkUserIds(uniqueIds);
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

  private async findNodeForProject(
    nodeId: string,
    project: ProjectWorkspace,
  ): Promise<PluginRecord | null> {
    const node = await this.findNodeByNodeId(nodeId, project.base);
    if (!node) return null;
    if (
      project.source === 'shared-base' &&
      !recordLinksToProject(node, NODE_FIELD.PROJECT, project.id)
    ) {
      return null;
    }
    return node;
  }

  private async findNodeByNodeId(
    nodeId: string,
    base: BaseLinkConfig,
  ): Promise<PluginRecord | null> {
    const records = await this.searchAllRecords(NODE_PLUGIN_ID, base);
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
    base: BaseLinkConfig,
  ): Promise<PluginRecord | null> {
    const records = await this.searchAllRecords(EDGE_PLUGIN_ID, base);
    return (
      records.find(
        (r) =>
          r.id === edgeId ||
          extractText(r.record[EDGE_FIELD.EDGE_ID]) === edgeId,
      ) ?? null
    );
  }
}

function mapProjectRecord(
  record: PluginRecord,
  index: number,
): ProjectWorkspace {
  const rawDescription = extractText(record.record[PROJECT_FIELD.DESCRIPTION]);
  const { description, meta } = decodeProjectDescription(rawDescription);
  return {
    id: record.id,
    code:
      extractText(record.record[PROJECT_FIELD.CODE]) || `project-${record.id}`,
    name: extractText(record.record[PROJECT_FIELD.NAME]) || '未命名项目',
    description,
    status: toProjectWorkspaceStatus(
      extractText(record.record[PROJECT_FIELD.STATUS]),
    ),
    parentId: meta?.parentId,
    sort: meta?.sort ?? index,
    source: meta?.source ?? 'shared-base',
    base: meta?.base ?? DEFAULT_BASE,
    writable: true,
  };
}

function mapCatalogRecord(
  record: LarkCliRecord,
  index: number,
): ProjectWorkspace | null {
  const name = extractText(record.record[CATALOG_FIELD.NAME]).trim();
  const baseToken = extractText(record.record[CATALOG_FIELD.BASE_TOKEN]).trim();
  const nodeTableId = extractText(
    record.record[CATALOG_FIELD.NODE_TABLE_ID],
  ).trim();
  const edgeTableId = extractText(
    record.record[CATALOG_FIELD.EDGE_TABLE_ID],
  ).trim();
  if (
    !name ||
    !baseToken ||
    !nodeTableId.startsWith('tbl') ||
    !edgeTableId.startsWith('tbl')
  ) {
    return null;
  }
  const createdAt = extractText(record.record[CATALOG_FIELD.CREATED_AT]);
  const updatedAt = extractText(record.record[CATALOG_FIELD.UPDATED_AT]);
  const createdTimestamp = Date.parse(createdAt);
  return {
    id: record.id,
    code:
      extractText(record.record[CATALOG_FIELD.CODE]).trim() ||
      `project-${record.id}`,
    name,
    description: extractText(record.record[CATALOG_FIELD.DESCRIPTION]).trim(),
    status: toProjectWorkspaceStatus(
      extractText(record.record[CATALOG_FIELD.STATUS]),
    ),
    sort: Number.isFinite(createdTimestamp) ? createdTimestamp : index,
    source:
      baseToken === DEFAULT_BASE.baseToken ? 'shared-base' : 'linked-base',
    base: {
      baseToken,
      nodeTableId,
      edgeTableId,
      url:
        extractUrl(record.record[CATALOG_FIELD.DOCUMENT_URL]) ||
        `https://vcnqhq28cfdm.feishu.cn/base/${baseToken}`,
    },
    writable: true,
    updatedAt: updatedAt || undefined,
  };
}

function recordLinksToProject(
  record: PluginRecord,
  fieldName: string,
  projectId: string,
): boolean {
  return extractLinkIds(
    record.record[fieldName],
    new Set([projectId]),
  ).includes(projectId);
}

function buildDefaultWorkspace(): ProjectWorkspace {
  return {
    id: DEFAULT_PROJECT_RECORD_ID,
    code: 'headset-rd',
    name: '默认头戴项目',
    description: '硬件主干与软件分支项目图谱',
    status: 'active',
    sort: 0,
    source: 'shared-base',
    base: DEFAULT_BASE,
    writable: true,
  };
}

function toProjectWorkspaceStatus(value: string): ProjectWorkspace['status'] {
  if (value === '推进中') return 'active';
  if (value === '暂停') return 'paused';
  if (value === '归档') return 'archived';
  return 'planned';
}

function encodeProjectDescription(
  description: string,
  meta: ProjectWorkspaceMeta,
): string {
  const text = description.trim();
  const encoded = `${PROJECT_META_MARKER}${JSON.stringify(meta)}`;
  return text ? `${text}\n\n${encoded}` : encoded;
}

function decodeProjectDescription(value: string): {
  description: string;
  meta?: ProjectWorkspaceMeta;
} {
  const markerIndex = value.lastIndexOf(PROJECT_META_MARKER);
  if (markerIndex < 0) return { description: value.trim() };
  const description = value.slice(0, markerIndex).trim();
  try {
    const candidate = JSON.parse(
      value.slice(markerIndex + PROJECT_META_MARKER.length),
    ) as Partial<ProjectWorkspaceMeta>;
    if (
      (candidate.source === 'shared-base' ||
        candidate.source === 'linked-base') &&
      candidate.base &&
      typeof candidate.base.baseToken === 'string' &&
      typeof candidate.base.nodeTableId === 'string' &&
      typeof candidate.base.edgeTableId === 'string'
    ) {
      return {
        description,
        meta: {
          parentId:
            typeof candidate.parentId === 'string'
              ? candidate.parentId
              : undefined,
          sort: Number(candidate.sort) || 0,
          source: candidate.source,
          base: candidate.base,
        },
      };
    }
  } catch {
    return { description: value.trim() };
  }
  return { description };
}

function buildProjectCode(name: string): string {
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  return `${normalized || 'project'}-${Date.now().toString(36)}`;
}

function buildIndependentNodeFields(): Array<Record<string, unknown>> {
  return [
    { name: NODE_FIELD.NAME, type: 'text' },
    { name: NODE_FIELD.NODE_ID, type: 'text' },
    { name: NODE_FIELD.SUBTITLE, type: 'text' },
    {
      name: NODE_FIELD.GROUP,
      type: 'select',
      multiple: false,
      options: PROJECT_GROUP_OPTIONS.map((option) => ({ ...option })),
    },
    {
      name: NODE_FIELD.TYPE,
      type: 'select',
      multiple: false,
      options: [
        '项目',
        '问题',
        '硬件',
        '软件',
        '算法',
        '联调',
        '测试',
        '风险',
        '发布',
      ].map((name) => ({ name })),
    },
    {
      name: NODE_FIELD.STATUS,
      type: 'select',
      multiple: false,
      options: [
        { name: '规划', hue: 'Gray', lightness: 'Light' },
        { name: '推进中', hue: 'Blue', lightness: 'Light' },
        { name: '评审', hue: 'Purple', lightness: 'Light' },
        { name: '测试', hue: 'Wathet', lightness: 'Light' },
        { name: '阻塞', hue: 'Red', lightness: 'Light' },
        { name: '通过', hue: 'Green', lightness: 'Light' },
        { name: '发布', hue: 'Turquoise', lightness: 'Light' },
        { name: '归档', hue: 'Gray', lightness: 'Standard' },
      ],
    },
    { name: NODE_FIELD.LEGACY_OWNER, type: 'text' },
    {
      name: NODE_FIELD.TASK_OWNER,
      type: 'select',
      multiple: true,
      options: [{ name: '待指定', hue: 'Gray', lightness: 'Light' }],
    },
    {
      name: NODE_FIELD.PROGRESS,
      type: 'number',
      style: { type: 'progress', percentage: true, color: 'Blue' },
    },
    { name: NODE_FIELD.VERSION, type: 'text' },
    {
      name: NODE_FIELD.DATE,
      type: 'datetime',
      style: { format: 'yyyy-MM-dd' },
    },
    { name: NODE_FIELD.TAGS, type: 'text' },
    { name: NODE_FIELD.SUMMARY, type: 'text' },
    { name: NODE_FIELD.NEXT, type: 'text' },
    { name: NODE_FIELD.RISKS, type: 'text' },
    {
      name: NODE_FIELD.IMAGE,
      type: 'text',
      style: { type: 'url' },
    },
    {
      name: NODE_FIELD.SORT,
      type: 'number',
      style: { type: 'plain', precision: 0 },
    },
  ];
}

function buildProjectBoardVisibleFields(): string[] {
  return [
    NODE_FIELD.NAME,
    NODE_FIELD.TASK_OWNER,
    NODE_FIELD.STATUS,
    NODE_FIELD.SUMMARY,
    NODE_FIELD.PROGRESS,
    NODE_FIELD.DATE,
    NODE_FIELD.NEXT,
    NODE_FIELD.RISKS,
    NODE_FIELD.TYPE,
    NODE_FIELD.VERSION,
    NODE_FIELD.TAGS,
  ];
}

function buildIndependentEdgeFields(
  nodeTableId: string,
): Array<Record<string, unknown>> {
  return [
    { name: EDGE_FIELD.NAME, type: 'text' },
    { name: EDGE_FIELD.EDGE_ID, type: 'text' },
    {
      name: EDGE_FIELD.TYPE,
      type: 'select',
      multiple: false,
      options: [{ name: '主树' }, { name: '跨节点' }],
    },
    { name: EDGE_FIELD.LABEL, type: 'text' },
    { name: EDGE_FIELD.CRITICAL, type: 'checkbox' },
    {
      name: EDGE_FIELD.SORT,
      type: 'number',
      style: { type: 'plain', precision: 0 },
    },
    {
      name: EDGE_FIELD.SOURCE,
      type: 'link',
      link_table: nodeTableId,
      bidirectional: false,
    },
    {
      name: EDGE_FIELD.TARGET,
      type: 'link',
      link_table: nodeTableId,
      bidirectional: false,
    },
  ];
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
  if (patch.lane) {
    fields[NODE_FIELD.GROUP] = toBaseGroup(patch.lane);
  }
  if (patch.kind) {
    fields[NODE_FIELD.TYPE] = toBaseNodeType(
      patch.kind,
      patch.lane ?? 'software',
    );
  }
  if (patch.status) {
    fields[NODE_FIELD.STATUS] = toBaseStatus(patch.status);
  }
  if (patch.owners !== undefined) {
    fields[NODE_FIELD.OWNER] = ownersToBaseFieldStatic(patch.owners);
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
  if (patch.linkedIds !== undefined) {
    fields[NODE_FIELD.PARENT] = patch.linkedIds.slice(0, 1);
  }
  return fields;
}

function toLinkedNodeFields(
  patch: UpdateProjectGraphNodeRequest,
): Record<string, unknown> {
  const fields = toNodeFields({ ...patch, owners: undefined, date: undefined });
  // Independent project Bases keep graph relationships in the edge table.
  // Their node tables intentionally do not contain the shared-Base 父节点 field.
  delete fields[NODE_FIELD.PARENT];
  if (patch.owners !== undefined) {
    const ownerNames = patch.owners
      .map((owner) => owner.name.trim())
      .filter(Boolean);
    fields[NODE_FIELD.LEGACY_OWNER] = ownerNames.join(' / ');
    fields[NODE_FIELD.TASK_OWNER] = ownerNames;
  }
  if (typeof patch.date === 'string') {
    fields[NODE_FIELD.DATE] = toDateTimestamp(patch.date);
  }
  return fields;
}

function toCliNodeFields(
  patch: UpdateProjectGraphNodeRequest,
): Record<string, unknown> {
  const fields = toLinkedNodeFields(patch);
  if (typeof patch.date === 'string') {
    fields[NODE_FIELD.DATE] = toCliDateValue(patch.date);
  }
  return fields;
}

function toNewNodeFields(
  node: CreateProjectGraphNodeRequest,
  project: ProjectWorkspace,
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
    [NODE_FIELD.PARENT]: (node.linkedIds ?? []).slice(0, 1),
    [NODE_FIELD.SORT]: 0,
  };
  if (project.source === 'shared-base') {
    fields[NODE_FIELD.PROJECT] = toLinkField(project.id);
  }
  if ((node.owners ?? []).length > 0) {
    fields[NODE_FIELD.OWNER] = ownersToBaseFieldStatic(node.owners);
  }
  return fields;
}

function toCliNewNodeFields(
  node: CreateProjectGraphNodeRequest,
): Record<string, unknown> {
  const fields = toLinkedNewNodeFields(node);
  fields[NODE_FIELD.DATE] = toCliDateValue(node.date);
  return fields;
}

function toLinkedNewNodeFields(
  node: CreateProjectGraphNodeRequest,
): Record<string, unknown> {
  const ownerNames = (node.owners ?? [])
    .map((owner) => owner.name.trim())
    .filter(Boolean);
  return {
    [NODE_FIELD.NAME]: node.title,
    [NODE_FIELD.NODE_ID]: `node-${Date.now()}`,
    [NODE_FIELD.GROUP]: toBaseGroup(node.lane),
    [NODE_FIELD.TYPE]: toBaseNodeType(node.kind, node.lane),
    [NODE_FIELD.STATUS]: toBaseStatus(node.status),
    [NODE_FIELD.LEGACY_OWNER]: ownerNames.join(' / '),
    [NODE_FIELD.TASK_OWNER]: ownerNames,
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
  project: ProjectWorkspace,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [EDGE_FIELD.NAME]: `${edge.source}-${edge.target}`,
    [EDGE_FIELD.EDGE_ID]: `edge-${Date.now()}`,
    [EDGE_FIELD.TYPE]: edge.kind === 'tree' ? '主树' : '跨节点',
    [EDGE_FIELD.LABEL]: edge.label || '关联',
    [EDGE_FIELD.CRITICAL]: Boolean(edge.critical),
    [EDGE_FIELD.SORT]: 0,
    [EDGE_FIELD.SOURCE]: toLinkField(edge.source),
    [EDGE_FIELD.TARGET]: toLinkField(edge.target),
  };
  if (project.source === 'shared-base') {
    fields[EDGE_FIELD.PROJECT] = toLinkField(project.id);
  }
  return fields;
}

function toCliNewEdgeFields(
  edge: CreateProjectGraphEdgeRequest,
): Record<string, unknown> {
  return {
    [EDGE_FIELD.NAME]: `${edge.source}-${edge.target}`,
    [EDGE_FIELD.EDGE_ID]: `edge-${Date.now()}`,
    [EDGE_FIELD.TYPE]: edge.kind === 'tree' ? '主树' : '跨节点',
    [EDGE_FIELD.LABEL]: edge.label || '关联',
    [EDGE_FIELD.CRITICAL]: Boolean(edge.critical),
    [EDGE_FIELD.SORT]: 0,
    [EDGE_FIELD.SOURCE]: [{ id: edge.source }],
    [EDGE_FIELD.TARGET]: [{ id: edge.target }],
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
      : incoming.find((edge) => edge.kind === 'tree');
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

function ownersToBaseFieldStatic(owners: ProjectOwner[]): number[] {
  return [...new Set(owners.map((owner) => owner.apaasUserId))].map((id) => {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num <= 0) {
      throw new BadRequestException('负责人缺少有效的妙搭人员 ID');
    }
    return num;
  });
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

function toCliDateValue(value: string): string | null {
  if (!value) return null;
  toDateTimestamp(value);
  return `${value} 00:00:00`;
}

// --- Value extractors ---

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('，');
  }
  if (value && typeof value === 'object' && 'text' in value) {
    const textVal = (value as Record<string, unknown>).text;
    return extractText(textVal);
  }
  if (value && typeof value === 'object' && 'name' in value) {
    return extractText((value as Record<string, unknown>).name);
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return extractText((value as Record<string, unknown>).value);
  }
  return '';
}

function extractNamedOwners(value: unknown): ProjectOwner[] {
  const names = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => extractText(entry).split('/'))
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)].map((name) => ({
    apaasUserId: '',
    name,
  }));
}

function extractUrl(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const link = record.link ?? record.url;
    if (typeof link === 'string' && link.trim()) {
      return link.trim();
    }
  }
  const text = extractText(value).trim();
  const markdownLink = /^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/u.exec(text);
  return markdownLink?.[1] ?? text;
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
    // Base SingleLink fields are returned by the OpenAPI as
    // { link_record_ids: ['rec...'] }. Keep the legacy variants because the
    // Miaoda plugin and test fixtures have used more than one representation.
    if (obj.link_record_ids !== undefined) {
      return extractLinkIds(obj.link_record_ids, recordIdSet);
    }
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
    if (obj.value !== undefined) {
      return extractLinkIds(obj.value, recordIdSet);
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

function resolveRecordId(
  candidate: string,
  records: PluginRecord[],
  stableIdField: string,
): string | null {
  return (
    records.find(
      (record) =>
        record.id === candidate ||
        extractText(record.record[stableIdField]) === candidate,
    )?.id ?? null
  );
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
  if (
    value.includes('正常') ||
    value.includes('推进') ||
    value.includes('active')
  )
    return 'active';
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
  if (group.includes('结构') || group.includes('structure')) return 'structure';
  if (
    group.includes('电子') ||
    group.includes('电气') ||
    group.includes('electronics')
  ) {
    return 'electronics';
  }
  if (
    group.includes('驱动') ||
    group.includes('固件') ||
    group.includes('driver') ||
    group.includes('firmware')
  ) {
    return 'driver';
  }
  if (group.includes('软件') || group.includes('software')) return 'software';
  if (group.includes('算法') || group.includes('algorithm')) return 'algorithm';
  if (group.includes('联调') || group.includes('测试') || group.includes('integration')) {
    return 'integration';
  }
  if (group.includes('硬件') || group.includes('hardware')) return 'hardware';

  const type = typeValue.toLowerCase();
  if (type.includes('算法') || type.includes('algorithm')) return 'algorithm';
  if (type.includes('联调') || type.includes('测试') || type.includes('integration')) {
    return 'integration';
  }
  if (type.includes('硬件') || type.includes('hardware')) return 'hardware';
  return 'software';
}

function toBaseGroup(lane: ProjectLane): string {
  const labels: Record<ProjectLane, string> = {
    hardware: '硬件主干',
    structure: '结构设计',
    electronics: '电子电气',
    driver: '驱动固件',
    software: '软件应用',
    algorithm: '算法',
    integration: '联调测试',
  };
  return labels[lane];
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
  if (type.includes('联调') || type.includes('integration'))
    return 'integration';
  if (type.includes('硬件') || type.includes('hardware')) return 'hardware';
  if (type.includes('算法') || type.includes('algorithm')) return 'algorithm';
  if (type.includes('软件') || type.includes('software')) return 'software';
  return lane === 'hardware' || lane === 'structure' || lane === 'electronics'
    ? 'hardware'
    : lane === 'integration'
      ? 'integration'
      : lane === 'algorithm'
        ? 'algorithm'
        : 'software';
}

function toBaseNodeType(
  kind: import('@shared/api.interface').ProjectNodeKind,
  lane: ProjectLane,
): string {
  const kindLabel: Record<
    import('@shared/api.interface').ProjectNodeKind,
    string
  > = {
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
