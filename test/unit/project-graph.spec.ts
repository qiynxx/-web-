import {
  buildStaticBaselines,
  buildStaticEdges,
  buildStaticMetrics,
  buildStaticNodes,
} from '../../server/modules/project-graph/project-graph-static';
import {
  buildBaseTableUrl,
  buildGanttTimeline,
  createDefaultNode,
  layoutGraph,
  calculateGraphFitScale,
  clampGraphScale,
  findAddedNode,
  getDeadlineState,
  getGanttPosition,
  LANE_DEFAULT_KIND,
  LANE_LABELS,
  laneOptions,
  PROJECT_LANES,
  normalizeSchedulePatch,
} from '../../client/src/pages/project-graph/project-graph-model';

describe('project-graph-static', () => {
  describe('buildStaticNodes', () => {
    it('should return nodes with ProjectOwner type', () => {
      const nodes = buildStaticNodes();
      expect(nodes.length).toBeGreaterThan(0);
      nodes.forEach((node) => {
        expect(Array.isArray(node.owners)).toBe(true);
        node.owners.forEach((owner) => {
          expect(typeof owner.apaasUserId).toBe('string');
          expect(typeof owner.name).toBe('string');
        });
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

  describe('engineering groups', () => {
    it('exposes every group in a stable engineering order', () => {
      expect(PROJECT_LANES).toEqual([
        'hardware',
        'structure',
        'electronics',
        'driver',
        'software',
        'algorithm',
        'integration',
      ]);
      expect(laneOptions).toEqual(['all', ...PROJECT_LANES]);
      expect(PROJECT_LANES.map((lane) => LANE_LABELS[lane])).toEqual([
        '硬件主干',
        '结构设计',
        '电子电气',
        '驱动固件',
        '软件应用',
        '算法',
        '联调测试',
      ]);
    });

    it('creates each group with its compatible default node type', () => {
      const expectedKinds = {
        hardware: 'hardware',
        structure: 'hardware',
        electronics: 'hardware',
        driver: 'software',
        software: 'software',
        algorithm: 'algorithm',
        integration: 'test',
      } as const;

      for (const lane of PROJECT_LANES) {
        const node = createDefaultNode(lane, null, 0);
        expect(node).toMatchObject({ lane, kind: expectedKinds[lane] });
        expect(LANE_DEFAULT_KIND[lane]).toBe(expectedKinds[lane]);
      }
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

  describe('buildBaseTableUrl', () => {
    it('opens the requested Base table when the stored URL has no table', () => {
      expect(
        buildBaseTableUrl('https://my.feishu.cn/base/base_token', 'tbl_nodes'),
      ).toBe('https://my.feishu.cn/base/base_token?table=tbl_nodes');
    });

    it('replaces a stale table while preserving the selected view', () => {
      expect(
        buildBaseTableUrl(
          'https://my.feishu.cn/base/base_token?table=tbl_old&view=vew_1',
          'tbl_edges',
        ),
      ).toBe('https://my.feishu.cn/base/base_token?table=tbl_edges&view=vew_1');
    });
  });

  describe('graph zoom', () => {
    it('fits a wide graph into desktop and portrait viewports', () => {
      expect(calculateGraphFitScale(1200, 760, 1280, 720)).toBeCloseTo(
        0.909,
        2,
      );
      expect(calculateGraphFitScale(430, 650, 1280, 720)).toBeCloseTo(0.32, 2);
    });

    it('keeps continuous zoom inside usable limits', () => {
      expect(clampGraphScale(0.1)).toBe(0.32);
      expect(clampGraphScale(1.27)).toBe(1.27);
      expect(clampGraphScale(3)).toBe(1.8);
      expect(clampGraphScale(Number.NaN)).toBe(1);
    });
  });

  describe('gantt schedule', () => {
    it('builds a padded timeline and positions a node by its stored dates', () => {
      const node = {
        ...buildStaticNodes()[0],
        startDate: '2026-08-10',
        deadline: '2026-08-20',
      };
      const timeline = buildGanttTimeline([node], '2026-08-15');
      const position = getGanttPosition(node, timeline);

      expect(timeline.startDate).toBe('2026-08-07');
      expect(timeline.endDate).toBe('2026-08-23');
      expect(position.left).toBeCloseTo((3 / 17) * 100);
      expect(position.width).toBeCloseTo((11 / 17) * 100);
    });

    it('classifies ddl state and keeps edited ranges valid', () => {
      const node = {
        ...buildStaticNodes()[0],
        status: 'active' as const,
        startDate: '2026-08-10',
        deadline: '2026-08-20',
      };

      expect(getDeadlineState(node, '2026-08-21')).toBe('overdue');
      expect(getDeadlineState(node, '2026-08-16')).toBe('due-soon');
      expect(normalizeSchedulePatch(node, 'startDate', '2026-08-25')).toEqual({
        startDate: '2026-08-25',
        deadline: '2026-08-25',
      });
      expect(normalizeSchedulePatch(node, 'deadline', '2026-08-05')).toEqual({
        startDate: '2026-08-05',
        deadline: '2026-08-05',
      });
    });
  });

  describe('free graph connections', () => {
    it('keeps a cross connection out of the tree layout', () => {
      const templateNodes = buildStaticNodes();
      const hardware = {
        ...templateNodes.find((node) => node.lane === 'hardware')!,
        id: 'hardware-root',
        linkedIds: [],
      };
      const software = {
        ...templateNodes.find((node) => node.lane === 'software')!,
        id: 'software-independent',
        linkedIds: [],
      };
      const layout = layoutGraph(
        [hardware, software],
        [
          {
            id: 'free-link',
            source: hardware.id,
            target: software.id,
            label: '自由连接',
            critical: false,
            kind: 'cross',
          },
        ],
      );
      const positionedHardware = layout.nodes.find(
        (node) => node.id === hardware.id,
      )!;
      const positionedSoftware = layout.nodes.find(
        (node) => node.id === software.id,
      )!;

      expect(positionedSoftware.x).toBeGreaterThan(positionedHardware.x);
      expect(layout.width).toBeLessThan(1280);
    });
  });
});
