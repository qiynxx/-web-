import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateProjectGraphNodeResponse,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  DeleteProjectGraphNodeResponse,
  ProjectGraphResponse,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
} from '@shared/api.interface';

export async function getProjectGraph(): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph',
      method: 'GET',
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
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/nodes/${nodeId}`,
      method: 'PATCH',
      data: patch,
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('写回项目节点失败', error);
    throw error;
  }
}

export async function createProjectNode(
  node: CreateProjectGraphNodeRequest,
): Promise<CreateProjectGraphNodeResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph/nodes',
      method: 'POST',
      data: node,
    });
    return response.data as CreateProjectGraphNodeResponse;
  } catch (error: unknown) {
    logger.error('创建项目节点失败', error);
    throw error;
  }
}

export async function deleteProjectNode(
  nodeId: string,
): Promise<DeleteProjectGraphNodeResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/nodes/${nodeId}`,
      method: 'DELETE',
    });
    return response.data as DeleteProjectGraphNodeResponse;
  } catch (error: unknown) {
    logger.error('删除项目节点失败', error);
    throw error;
  }
}

export async function createProjectEdge(
  edge: CreateProjectGraphEdgeRequest,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: '/api/project-graph/edges',
      method: 'POST',
      data: edge,
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
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/edges/${edgeId}`,
      method: 'PATCH',
      data: patch,
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('更新项目连线失败', error);
    throw error;
  }
}

export async function deleteProjectEdge(
  edgeId: string,
): Promise<ProjectGraphResponse> {
  try {
    const response = await axiosForBackend({
      url: `/api/project-graph/edges/${edgeId}`,
      method: 'DELETE',
    });
    return response.data as ProjectGraphResponse;
  } catch (error: unknown) {
    logger.error('删除项目连线失败', error);
    throw error;
  }
}
