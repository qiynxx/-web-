import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  CreateProjectGraphNodeResponse,
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  CreateProjectWorkspaceRequest,
  DeleteProjectWorkspaceRequest,
  DeleteProjectWorkspaceResponse,
  DeleteProjectGraphNodeResponse,
  ProjectGraphResponse,
  ProjectWorkspace,
  ProjectWorkspaceListResponse,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
  UpdateProjectWorkspaceRequest,
} from '@shared/api.interface';
import { ProjectGraphService } from './project-graph.service';

@Controller('api/project-graph')
export class ProjectGraphController {
  constructor(private readonly projectGraphService: ProjectGraphService) {}

  @NeedLogin()
  @Get('projects')
  async listProjects(
    @Query('refresh') refresh?: string,
  ): Promise<ProjectWorkspaceListResponse> {
    return this.projectGraphService.listProjects(refresh === 'true');
  }

  @NeedLogin()
  @Post('projects/catalog-sync')
  async retryCatalogSync(): Promise<{ synced: boolean }> {
    return this.projectGraphService.retryCatalogSync();
  }

  @NeedLogin()
  @Post('projects')
  async createProject(
    @Body() request: CreateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    return this.projectGraphService.createProject(request);
  }

  @NeedLogin()
  @Patch('projects/:projectId')
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() request: UpdateProjectWorkspaceRequest,
  ): Promise<ProjectWorkspace> {
    return this.projectGraphService.updateProjectName(projectId, request);
  }

  @NeedLogin()
  @Delete('projects/:projectId')
  async deleteProject(
    @Param('projectId') projectId: string,
    @Body() request: DeleteProjectWorkspaceRequest,
  ): Promise<DeleteProjectWorkspaceResponse> {
    return this.projectGraphService.deleteProject(projectId, request);
  }

  @NeedLogin()
  @Get()
  async getGraph(
    @Query('projectId') projectId?: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.getGraph(projectId);
  }

  @NeedLogin()
  @Patch('nodes/:nodeId')
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() patch: UpdateProjectGraphNodeRequest,
    @Query('projectId') projectId?: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.updateNode(nodeId, patch, projectId);
  }

  @NeedLogin()
  @Post('nodes')
  async createNode(
    @Body() node: CreateProjectGraphNodeRequest,
    @Query('projectId') projectId?: string,
  ): Promise<CreateProjectGraphNodeResponse> {
    return this.projectGraphService.createNode(node, projectId);
  }

  @NeedLogin()
  @Delete('nodes/:nodeId')
  async deleteNode(
    @Param('nodeId') nodeId: string,
    @Query('projectId') projectId?: string,
  ): Promise<DeleteProjectGraphNodeResponse> {
    return this.projectGraphService.deleteNode(nodeId, projectId);
  }

  @NeedLogin()
  @Post('edges')
  async createEdge(
    @Body() edge: CreateProjectGraphEdgeRequest,
    @Query('projectId') projectId?: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.createEdge(edge, projectId);
  }

  @NeedLogin()
  @Patch('edges/:edgeId')
  async updateEdge(
    @Param('edgeId') edgeId: string,
    @Body() patch: UpdateProjectGraphEdgeRequest,
    @Query('projectId') projectId?: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.updateEdge(edgeId, patch, projectId);
  }

  @NeedLogin()
  @Delete('edges/:edgeId')
  async deleteEdge(
    @Param('edgeId') edgeId: string,
    @Query('projectId') projectId?: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.deleteEdge(edgeId, projectId);
  }
}
