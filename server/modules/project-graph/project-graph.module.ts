import { Module } from '@nestjs/common';
import { FeishuOpenApiModule } from '../feishu-openapi/feishu-openapi.module';
import { LarkCliBaseClient } from './lark-cli-base.client';
import { ProjectGraphController } from './project-graph.controller';
import { ProjectGraphService } from './project-graph.service';
import { ProjectWorkspaceRepository } from './project-workspace.repository';

@Module({
  imports: [FeishuOpenApiModule],
  controllers: [ProjectGraphController],
  providers: [
    LarkCliBaseClient,
    ProjectWorkspaceRepository,
    ProjectGraphService,
  ],
})
export class ProjectGraphModule {}
