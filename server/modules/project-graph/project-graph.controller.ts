import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  CreateProjectGraphEdgeRequest,
  CreateProjectGraphNodeRequest,
  ProjectGraphResponse,
  UpdateProjectGraphEdgeRequest,
  UpdateProjectGraphNodeRequest,
} from '@shared/api.interface';
import { ProjectGraphService } from './project-graph.service';

@Controller('api/project-graph')
export class ProjectGraphController {
  constructor(private readonly projectGraphService: ProjectGraphService) {}

  @NeedLogin()
  @Get()
  async getGraph(): Promise<ProjectGraphResponse> {
    return this.projectGraphService.getGraph();
  }

  @NeedLogin()
  @Patch('nodes/:nodeId')
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() patch: UpdateProjectGraphNodeRequest,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.updateNode(nodeId, patch);
  }

  @NeedLogin()
  @Post('nodes')
  async createNode(
    @Body() node: CreateProjectGraphNodeRequest,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.createNode(node);
  }

  @NeedLogin()
  @Delete('nodes/:nodeId')
  async deleteNode(
    @Param('nodeId') nodeId: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.deleteNode(nodeId);
  }

  @NeedLogin()
  @Post('edges')
  async createEdge(
    @Body() edge: CreateProjectGraphEdgeRequest,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.createEdge(edge);
  }

  @NeedLogin()
  @Patch('edges/:edgeId')
  async updateEdge(
    @Param('edgeId') edgeId: string,
    @Body() patch: UpdateProjectGraphEdgeRequest,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.updateEdge(edgeId, patch);
  }

  @NeedLogin()
  @Delete('edges/:edgeId')
  async deleteEdge(
    @Param('edgeId') edgeId: string,
  ): Promise<ProjectGraphResponse> {
    return this.projectGraphService.deleteEdge(edgeId);
  }
}
