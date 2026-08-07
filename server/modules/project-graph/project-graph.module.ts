import { Module } from '@nestjs/common';
import { LarkCliBaseClient } from './lark-cli-base.client';
import { ProjectGraphController } from './project-graph.controller';
import { ProjectGraphService } from './project-graph.service';

@Module({
  controllers: [ProjectGraphController],
  providers: [LarkCliBaseClient, ProjectGraphService],
})
export class ProjectGraphModule {}
