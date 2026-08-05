import { Module } from '@nestjs/common';
import { ProjectGraphController } from './project-graph.controller';
import { ProjectGraphService } from './project-graph.service';

@Module({
  controllers: [ProjectGraphController],
  providers: [ProjectGraphService],
})
export class ProjectGraphModule {}
