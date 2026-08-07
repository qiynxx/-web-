import { spawnSync } from 'node:child_process';

const SOURCE = {
  baseToken: 'WC3cb3acOaminMsXKbTcwPKdnMg',
  taskTableId: 'tblgwPB7nEyjoXlN',
  rhythmTableId: 'tbl2yngvGJv5Tagg',
  nodeTableId: 'tblVIjVsxIbuk1QQ',
  edgeTableId: 'tblFSCyy1hjLEFO5',
};

const DESTINATION = {
  baseToken:
    process.env.DESTINATION_BASE_TOKEN || 'VFg8bUnzUa3c58sMbaZcp3N1nsc',
  wikiNodeToken:
    process.env.DESTINATION_WIKI_NODE_TOKEN || 'K03ww1fYlifzhvkdwkbcXbIlnRc',
  nodeTableId: process.env.DESTINATION_NODE_TABLE_ID || 'tblole9PfYd3gDaJ',
  edgeTableId: process.env.DESTINATION_EDGE_TABLE_ID || 'tbldoxIEycaenu2K',
};

const CATALOG = {
  baseToken: 'I2hLbxQOsaZYcQsPuSOc3UMWnSe',
  tableId: 'tblrpWm6qG55Xssv',
};

const SECOND_GENERATION_NODE_IDS = new Set([
  'hw-gen2',
  'core-board-gen2',
  'headband-gen2',
  'camera-bug-gen2',
  'cmos-fpc-gen2',
  'imu-test-gen2',
  'ota-usb-gen2',
]);

const TASK_FIELDS = [
  '子任务',
  '步骤',
  '所属阶段',
  '状态',
  '开始日期',
  '截止日期',
  '负责人',
  '完成定义',
  '依赖/卡点',
  '备注',
  '来源记录 ID',
];

const RHYTHM_FIELDS = [
  '阶段',
  '关键节点',
  '出口标准',
  '当前状态',
  '目标日期',
  '负责人',
  '关键卡点',
  '下一步动作',
  '来源记录 ID',
];

function run(args, { allowNoOperation = false } = {}) {
  const result = spawnSync('lark-cli', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `lark-cli ${args.slice(0, 2).join(' ')} 返回了无效 JSON`,
    );
  }
  if (!envelope.ok) {
    const noOperation =
      String(envelope.error?.code ?? '') === '800070003' ||
      envelope.error?.message === 'no operation produced';
    if (allowNoOperation && noOperation) return undefined;
    throw new Error(
      `${args.slice(0, 2).join(' ')}: ${envelope.error?.message || envelope.error?.hint || '操作失败'}`,
    );
  }
  return envelope.data;
}

function commonArgs() {
  return ['--as', 'user', '--format', 'json'];
}

function listRecords(baseToken, tableId, fields) {
  const data = run([
    'base',
    '+record-list',
    '--base-token',
    baseToken,
    '--table-id',
    tableId,
    '--offset',
    '0',
    '--limit',
    '200',
    ...fields.flatMap((field) => ['--field-id', field]),
    ...commonArgs(),
  ]);
  return (data.record_id_list ?? []).map((id, rowIndex) => ({
    id,
    fields: Object.fromEntries(
      (data.fields ?? []).map((field, fieldIndex) => [
        field,
        data.data?.[rowIndex]?.[fieldIndex] ?? null,
      ]),
    ),
  }));
}

function listTables() {
  return (
    run([
      'base',
      '+table-list',
      '--base-token',
      DESTINATION.baseToken,
      '--offset',
      '0',
      '--limit',
      '100',
      ...commonArgs(),
    ]).tables ?? []
  );
}

function createTable(name, fields) {
  const data = run([
    'base',
    '+table-create',
    '--base-token',
    DESTINATION.baseToken,
    '--name',
    name,
    '--fields',
    JSON.stringify(fields),
    ...commonArgs(),
  ]);
  if (!data.table?.id) throw new Error(`创建“${name}”后未返回 table ID`);
  return data.table;
}

function batchCreate(baseToken, tableId, fields, rows) {
  if (rows.length === 0) return [];
  const data = run([
    'base',
    '+record-batch-create',
    '--base-token',
    baseToken,
    '--table-id',
    tableId,
    '--json',
    JSON.stringify({ fields, rows }),
    ...commonArgs(),
  ]);
  const ids = data.record_id_list ?? [];
  if (ids.length !== rows.length) {
    throw new Error(
      `批量写入 ${rows.length} 行，但飞书仅返回 ${ids.length} 个记录 ID`,
    );
  }
  return ids;
}

function scalar(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function text(value) {
  const raw = scalar(value);
  return raw == null ? '' : String(raw).trim();
}

function userIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === 'object' && entry ? String(entry.id ?? '') : '',
    )
    .filter(Boolean)
    .map((id) => ({ id }));
}

function ownerNames(value, fallback = '') {
  const linkedNames = Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === 'object' && entry ? String(entry.name ?? '') : '',
        )
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const textNames = fallback
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set([...linkedNames, ...textNames])];
}

function ensureNodeOwnerOptions(sourceNodes) {
  const fieldData = run([
    'base',
    '+field-list',
    '--base-token',
    DESTINATION.baseToken,
    '--table-id',
    DESTINATION.nodeTableId,
    ...commonArgs(),
  ]);
  const field = fieldData.fields?.find(
    (candidate) => candidate.name === '任务负责人',
  );
  if (!field?.id) throw new Error('项目节点表缺少“任务负责人”字段');
  const requestedNames = sourceNodes.flatMap((record) =>
    ownerNames(record.fields['负责人ID'], text(record.fields['负责人'])),
  );
  const optionNames = [
    ...new Set([
      ...(field.options ?? []).map((option) => option.name),
      ...requestedNames,
    ]),
  ];
  if (optionNames.length === (field.options ?? []).length) return;
  run(
    [
      'base',
      '+field-update',
      '--base-token',
      DESTINATION.baseToken,
      '--table-id',
      DESTINATION.nodeTableId,
      '--field-id',
      field.id,
      '--json',
      JSON.stringify({
        name: '任务负责人',
        type: 'select',
        multiple: true,
        options: optionNames.map((name) => ({ name })),
      }),
      '--yes',
      ...commonArgs(),
    ],
    { allowNoOperation: true },
  );
}

function ensureTaskTable() {
  const existing = listTables().find((table) => table.name === '任务清单');
  const table =
    existing ??
    createTable('任务清单', [
      { name: '子任务', type: 'text' },
      { name: '步骤', type: 'text' },
      {
        name: '所属阶段',
        type: 'select',
        multiple: false,
        options: [
          '需求定义',
          '方案锁定',
          '设计开发',
          '样机验证',
          '测试验收',
          '交付准备',
          '维护复盘',
        ].map((name) => ({ name })),
      },
      {
        name: '状态',
        type: 'select',
        multiple: false,
        options: ['未开始', '进行中', '等待外部', '阻塞', '已完成'].map(
          (name) => ({ name }),
        ),
      },
      { name: '开始日期', type: 'datetime' },
      { name: '截止日期', type: 'datetime' },
      { name: '负责人', type: 'user', multiple: true },
      { name: '完成定义', type: 'text' },
      { name: '依赖/卡点', type: 'text' },
      { name: '备注', type: 'text' },
      { name: '来源记录 ID', type: 'text' },
    ]);

  const source = listRecords(SOURCE.baseToken, SOURCE.taskTableId, [
    '子任务',
    '步骤',
    '所属阶段',
    '状态',
    '开始日期',
    '截止日期',
    '负责人',
    '完成定义',
    '依赖/卡点',
    '备注',
  ]).filter(
    (record) =>
      text(record.fields['子任务']) ||
      text(record.fields['步骤']) ||
      userIds(record.fields['负责人']).length > 0,
  );
  const existingSourceIds = new Set(
    listRecords(DESTINATION.baseToken, table.id, ['来源记录 ID']).map(
      (record) => text(record.fields['来源记录 ID']),
    ),
  );
  const pending = source.filter((record) => !existingSourceIds.has(record.id));
  batchCreate(
    DESTINATION.baseToken,
    table.id,
    TASK_FIELDS,
    pending.map((record) => [
      text(record.fields['子任务']),
      text(record.fields['步骤']),
      scalar(record.fields['所属阶段']),
      scalar(record.fields['状态']),
      scalar(record.fields['开始日期']),
      scalar(record.fields['截止日期']),
      userIds(record.fields['负责人']),
      text(record.fields['完成定义']),
      text(record.fields['依赖/卡点']),
      text(record.fields['备注']),
      record.id,
    ]),
  );

  ensureOwnerBoard(table.id);
  return {
    tableId: table.id,
    sourceCount: source.length,
    created: pending.length,
  };
}

function ensureOwnerBoard(tableId) {
  const views =
    run([
      'base',
      '+view-list',
      '--base-token',
      DESTINATION.baseToken,
      '--table-id',
      tableId,
      '--offset',
      '0',
      '--limit',
      '100',
      ...commonArgs(),
    ]).views ?? [];
  let view = views.find((candidate) => candidate.name === '人员任务看板');
  if (!view) {
    view = run([
      'base',
      '+view-create',
      '--base-token',
      DESTINATION.baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify({ name: '人员任务看板', type: 'kanban' }),
      ...commonArgs(),
    ]).views?.[0];
  }
  if (!view?.id) throw new Error('人员任务看板未返回 view ID');
  run(
    [
      'base',
      '+view-set-group',
      '--base-token',
      DESTINATION.baseToken,
      '--table-id',
      tableId,
      '--view-id',
      view.id,
      '--json',
      JSON.stringify({ group_config: [{ field: '负责人', desc: false }] }),
      ...commonArgs(),
    ],
    { allowNoOperation: true },
  );
  run(
    [
      'base',
      '+view-set-visible-fields',
      '--base-token',
      DESTINATION.baseToken,
      '--table-id',
      tableId,
      '--view-id',
      view.id,
      '--json',
      JSON.stringify({
        visible_fields: [
          '子任务',
          '负责人',
          '状态',
          '所属阶段',
          '步骤',
          '截止日期',
          '依赖/卡点',
          '完成定义',
          '备注',
        ],
      }),
      ...commonArgs(),
    ],
    { allowNoOperation: true },
  );
}

function ensureRhythmTable() {
  const existing = listTables().find((table) => table.name === '项目节奏');
  const table =
    existing ??
    createTable('项目节奏', [
      { name: '阶段', type: 'text' },
      { name: '关键节点', type: 'text' },
      { name: '出口标准', type: 'text' },
      {
        name: '当前状态',
        type: 'select',
        multiple: false,
        options: ['待确认', '未开始', '进行中', '阻塞', '已完成', '暂缓'].map(
          (name) => ({ name }),
        ),
      },
      { name: '目标日期', type: 'datetime' },
      { name: '负责人', type: 'user', multiple: true },
      { name: '关键卡点', type: 'text' },
      { name: '下一步动作', type: 'text' },
      { name: '来源记录 ID', type: 'text' },
    ]);
  const source = listRecords(SOURCE.baseToken, SOURCE.rhythmTableId, [
    '阶段',
    '关键节点',
    '出口标准',
    '当前状态',
    '目标日期',
    '负责人',
    '关键卡点',
    '下一步动作',
  ]).filter((record) => text(record.fields['阶段']));
  const existingSourceIds = new Set(
    listRecords(DESTINATION.baseToken, table.id, ['来源记录 ID']).map(
      (record) => text(record.fields['来源记录 ID']),
    ),
  );
  const pending = source.filter((record) => !existingSourceIds.has(record.id));
  batchCreate(
    DESTINATION.baseToken,
    table.id,
    RHYTHM_FIELDS,
    pending.map((record) => [
      text(record.fields['阶段']),
      text(record.fields['关键节点']),
      text(record.fields['出口标准']),
      scalar(record.fields['当前状态']),
      scalar(record.fields['目标日期']),
      userIds(record.fields['负责人']),
      text(record.fields['关键卡点']),
      text(record.fields['下一步动作']),
      record.id,
    ]),
  );
  return {
    tableId: table.id,
    sourceCount: source.length,
    created: pending.length,
  };
}

function migrateGraph() {
  const sourceNodes = listRecords(SOURCE.baseToken, SOURCE.nodeTableId, [
    '节点名称',
    '节点ID',
    '副标题',
    '分组',
    '节点类型',
    '状态',
    '负责人',
    '负责人ID',
    '进度',
    '版本/分支',
    '日期',
    '标签',
    '工作内容',
    '下一步',
    '风险/阻塞',
    '图片URL',
    '排序',
  ]).filter((record) =>
    SECOND_GENERATION_NODE_IDS.has(text(record.fields['节点ID'])),
  );
  ensureNodeOwnerOptions(sourceNodes);
  const destinationNodes = listRecords(
    DESTINATION.baseToken,
    DESTINATION.nodeTableId,
    ['节点ID'],
  );
  const nodeRecordIdByStableId = new Map(
    destinationNodes.map((record) => [
      text(record.fields['节点ID']),
      record.id,
    ]),
  );
  const pendingNodes = sourceNodes.filter(
    (record) => !nodeRecordIdByStableId.has(text(record.fields['节点ID'])),
  );
  const nodeFields = [
    '节点名称',
    '节点ID',
    '副标题',
    '分组',
    '节点类型',
    '状态',
    '负责人',
    '任务负责人',
    '进度',
    '版本/分支',
    '日期',
    '标签',
    '工作内容',
    '下一步',
    '风险/阻塞',
    '图片URL',
    '排序',
  ];
  const newNodeRecordIds = batchCreate(
    DESTINATION.baseToken,
    DESTINATION.nodeTableId,
    nodeFields,
    pendingNodes.map((record) => [
      text(record.fields['节点名称']),
      text(record.fields['节点ID']),
      text(record.fields['副标题']),
      scalar(record.fields['分组']),
      scalar(record.fields['节点类型']),
      scalar(record.fields['状态']),
      text(record.fields['负责人']),
      ownerNames(record.fields['负责人ID'], text(record.fields['负责人'])),
      record.fields['进度'],
      text(record.fields['版本/分支']),
      scalar(record.fields['日期']),
      text(record.fields['标签']),
      text(record.fields['工作内容']),
      text(record.fields['下一步']),
      text(record.fields['风险/阻塞']),
      text(record.fields['图片URL']),
      record.fields['排序'],
    ]),
  );
  pendingNodes.forEach((record, index) => {
    nodeRecordIdByStableId.set(
      text(record.fields['节点ID']),
      newNodeRecordIds[index],
    );
  });

  const sourceNodeRecordIdToStableId = new Map(
    sourceNodes.map((record) => [record.id, text(record.fields['节点ID'])]),
  );
  const sourceEdges = listRecords(SOURCE.baseToken, SOURCE.edgeTableId, [
    '连接名称',
    '连接ID',
    '连接类型',
    '标签',
    '关键链路',
    '排序',
    '来源节点',
    '目标节点',
  ]).filter((record) => {
    const sourceRecordId = record.fields['来源节点']?.[0]?.id;
    const targetRecordId = record.fields['目标节点']?.[0]?.id;
    return (
      sourceNodeRecordIdToStableId.has(sourceRecordId) &&
      sourceNodeRecordIdToStableId.has(targetRecordId)
    );
  });
  const existingEdgeIds = new Set(
    listRecords(DESTINATION.baseToken, DESTINATION.edgeTableId, ['连接ID']).map(
      (record) => text(record.fields['连接ID']),
    ),
  );
  const pendingEdges = sourceEdges.filter(
    (record) => !existingEdgeIds.has(text(record.fields['连接ID'])),
  );
  const edgeFields = [
    '连接名称',
    '连接ID',
    '连接类型',
    '标签',
    '关键链路',
    '排序',
    '来源节点',
    '目标节点',
  ];
  batchCreate(
    DESTINATION.baseToken,
    DESTINATION.edgeTableId,
    edgeFields,
    pendingEdges.map((record) => {
      const sourceStableId = sourceNodeRecordIdToStableId.get(
        record.fields['来源节点'][0].id,
      );
      const targetStableId = sourceNodeRecordIdToStableId.get(
        record.fields['目标节点'][0].id,
      );
      return [
        text(record.fields['连接名称']),
        text(record.fields['连接ID']),
        scalar(record.fields['连接类型']),
        text(record.fields['标签']),
        Boolean(record.fields['关键链路']),
        record.fields['排序'],
        [{ id: nodeRecordIdByStableId.get(sourceStableId) }],
        [{ id: nodeRecordIdByStableId.get(targetStableId) }],
      ];
    }),
  );
  return {
    sourceNodes: sourceNodes.length,
    createdNodes: pendingNodes.length,
    sourceEdges: sourceEdges.length,
    createdEdges: pendingEdges.length,
  };
}

function ensureCatalogRecord(taskCount) {
  const existing = listRecords(CATALOG.baseToken, CATALOG.tableId, [
    '项目名称',
    'Base Token',
  ]).find(
    (record) =>
      text(record.fields['项目名称']) === '第二代头戴项目管理' ||
      text(record.fields['Base Token']) === DESTINATION.baseToken,
  );
  if (existing) return { recordId: existing.id, created: false };
  const url = `https://vcnqhq28cfdm.feishu.cn/wiki/${DESTINATION.wikiNodeToken}`;
  const fields = [
    '项目编码',
    '项目名称',
    '状态',
    '项目说明',
    '整体进度',
    '项目文档',
    'Base Token',
    'Wiki 节点 Token',
    '节点表 ID',
    '连线表 ID',
    '创建来源',
  ];
  const recordIds = batchCreate(CATALOG.baseToken, CATALOG.tableId, fields, [
    [
      'second-generation-headset',
      '第二代头戴项目管理',
      '推进中',
      `由原“第二代头戴”Base 迁移，包含 ${taskCount} 条有效任务、7 个项目阶段以及二代流程图；源文档保持不变。`,
      0,
      url,
      DESTINATION.baseToken,
      DESTINATION.wikiNodeToken,
      DESTINATION.nodeTableId,
      DESTINATION.edgeTableId,
      '迁移',
    ],
  ]);
  return { recordId: recordIds[0], created: true };
}

const task = ensureTaskTable();
const rhythm = ensureRhythmTable();
const graph = migrateGraph();
const catalog = ensureCatalogRecord(task.sourceCount);

console.log(
  JSON.stringify(
    {
      destination: DESTINATION,
      task,
      rhythm,
      graph,
      catalog,
    },
    null,
    2,
  ),
);
