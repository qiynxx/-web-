import {
  buildStaticBaselines,
  buildStaticEdges,
  buildStaticMetrics,
  buildStaticNodes,
} from '../../server/modules/project-graph/project-graph-static';
import { findAddedNode } from '../../client/src/pages/project-graph/project-graph-model';

describe('project-graph-static', () => {
  describe('buildStaticNodes', () => {
    it('should return nodes with ProjectOwner type', () => {
      const nodes = buildStaticNodes();
      expect(nodes.length).toBeGreaterThan(0);
      nodes.forEach((node) => {
        expect(node.owner === null || typeof node.owner === 'object').toBe(
          true,
        );
        if (node.owner) {
          expect(typeof node.owner.apaasUserId).toBe('string');
          expect(typeof node.owner.name).toBe('string');
        }
      });
    });

    it('should have required fields on every node', () => {
      const nodes = buildStaticNodes();
      nodes.forEach((node) => {
        expect(typeof node.id).toBe('string');
        expect(typeof node.title).toBe('string');
        expect(typeof node.lane).toBe('string');
        expect(typeof node.kind).toBe('string');
        expect(typeof node.status).toBe('string');
        expect(typeof node.progress).toBe('number');
        expect(Array.isArray(node.tags)).toBe(true);
        expect(Array.isArray(node.risks)).toBe(true);
        expect(Array.isArray(node.linkedIds)).toBe(true);
      });
    });
  });

  describe('buildStaticEdges', () => {
    it('should return edges with valid source and target', () => {
      const edges = buildStaticEdges();
      expect(edges.length).toBeGreaterThan(0);
      edges.forEach((edge) => {
        expect(typeof edge.id).toBe('string');
        expect(typeof edge.source).toBe('string');
        expect(typeof edge.target).toBe('string');
        expect(typeof edge.label).toBe('string');
        expect(typeof edge.critical).toBe('boolean');
      });
    });
  });

  describe('buildStaticMetrics', () => {
    it('should compute metrics from nodes', () => {
      const nodes = buildStaticNodes();
      const metrics = buildStaticMetrics(nodes);
      expect(metrics.length).toBe(4);
      metrics.forEach((metric) => {
        expect(typeof metric.key).toBe('string');
        expect(typeof metric.label).toBe('string');
        expect(typeof metric.value).toBe('string');
        expect(['neutral', 'good', 'warning', 'danger']).toContain(metric.tone);
      });
    });
  });

  describe('buildStaticBaselines', () => {
    it('should return baselines', () => {
      const baselines = buildStaticBaselines();
      expect(baselines.length).toBeGreaterThan(0);
      baselines.forEach((baseline) => {
        expect(typeof baseline.id).toBe('string');
        expect(typeof baseline.name).toBe('string');
      });
    });
  });

  describe('findAddedNode', () => {
    it('finds the record created by the Base response', () => {
      const previousNodes = buildStaticNodes();
      const createdNode = {
        ...previousNodes[0],
        id: 'rec_new_branch',
        title: '新软件分支',
      };

      expect(
        findAddedNode(previousNodes, [...previousNodes, createdNode]),
      ).toEqual(createdNode);
    });
  });
});
