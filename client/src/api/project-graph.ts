import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateProjectGraphNodeResponse,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  CreateProjectWorkspaceRequest,
  DeleteProjectGraphNodeResponse,
  ProjectGraphResponse,
  ProjectWorkspace,
  ProjectWorkspaceListResponse,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
  UpdateProjectWorkspaceRequest,
} from '@shared/api.interface';

function projectParams(projectId?: string): { projectId?: string } {
  return projectId ? { projectId } : {};
}

export async function getFeishuOAuthStatus(): Promise<{ authorized: boolean }> {
  const response = await axiosForBackend({
    url: '/api/feishu-oauth/status',
    method: 'GET',
  });
  return response.data as { authorized: boolean };
}

export async function getFeishuOAuthUrl(): Promise<{ url: string }> {
  const response = await axiosForBackend({
    url: '/api/feishu-oauth/authorize',
    method: 'GET',
  });
  return response.data as { url: string };
}

export async function listProjectWorkspaces(
  refresh = false,
): Promise<ProjectWorkspaceListResponse> {
  const response = await axiosForBackend({
    url: '/api/project-graph/projects',
    method: 'GET',
    params: refresh ? { refresh: 'true' } : undefined,
  });
  return response.data as ProjectWorkspaceListResponse;
}

export async function createProjectWorkspace(
  request: CreateProjectWorkspaceRequest,
): Promise<ProjectWorkspace> {
  const response = await axiosForBackend({
    url: '/api/project-graph/projects',
    method: 'POST',
    data: request,
  });
  return response.data as ProjectWorkspace;
}

export async function updateProjectWorkspace(
  projectId: string,
  request: UpdateProjectWorkspaceRequest,
): Promise<ProjectWorkspace> {
  const response = await axiosForBackend({
    url: `/api/project-graph/projects/${projectId}`,
    method: 'PATCH',
    data: request,
  });
  return response.data as ProjectWorkspace;
}

export async function getProjectGraph(
  projectId?: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph',
      method: 'GET',
      params: projectParams(projectId),
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('获取项目图谱失败', error);
    throw error;
  }
}

export async function updateProjectNode(
  nodeId: string,
  patch: UpdateProjectGraphNodeRequest,
  projectId?: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/nodes/${nodeId}`,
      method: 'PATCH',
      data: patch,
      params: projectParams(projectId),
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('写回项目节点失败', error);
    throw error;
  }
}

export async function createProjectNode(
  node: CreateProjectGraphNodeRequest,
  projectId?: string,
): Promise<CreateProjectGraphNodeResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph/nodes',
      method: 'POST',
      data: node,
      params: projectParams(projectId),
    });
    return response.data as CreateProjectGraphNodeResponse;
  } catch (error: unknown) {
    logger.error('创建项目节点失败', error);
    throw error;
  }
}

export async function deleteProjectNode(
  nodeId: string,
  projectId?: string,
): Promise<DeleteProjectGraphNodeResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/nodes/${nodeId}`,
      method: 'DELETE',
      params: projectParams(projectId),
    });
    return response.data as DeleteProjectGraphNodeResponse;
  } catch (error: unknown) {
    logger.error('删除项目节点失败', error);
    throw error;
  }
}

export async function createProjectEdge(
  edge: CreateProjectGraphEdgeRequest,
  projectId?: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph/edges',
      method: 'POST',
      data: edge,
      params: projectParams(projectId),
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('创建项目连线失败', error);
    throw error;
  }
}

export async function updateProjectEdge(
  edgeId: string,
  patch: UpdateProjectGraphEdgeRequest,
  projectId?: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/edges/${edgeId}`,
      method: 'PATCH',
      data: patch,
      params: projectParams(projectId),
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('更新项目连线失败', error);
    throw error;
  }
}

export async function deleteProjectEdge(
  edgeId: string,
  projectId?: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/edges/${edgeId}`,
      method: 'DELETE',
      params: projectParams(projectId),
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('删除项目连线失败', error);
    throw error;
  }
}
