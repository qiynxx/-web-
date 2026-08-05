// ---- plugin:project_graph_connection_bitable_crud_1 ----
// ============================================================
// 插件 project_graph_connection_bitable_crud_1 (项目图谱连线表多维表格CRUD操作) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProjectGraphConnectionBitableCrudOneAggregatequeryInput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    fieldName: string;
    aggregation: string;
    alias: string;
  }[];
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { pageToken, result, hasMore } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneAggregatequeryOutput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
}

export interface ProjectGraphConnectionBitableCrudOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '连接ID': string;
      '连接类型': string;
      '标签': string;
      '所属项目': string;
      '连接名称': string;
      '关键链路': boolean;
      '排序': number;
      '来源节点': unknown;
      '目标节点': unknown;
    };
  }[];
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProjectGraphConnectionBitableCrudOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    record: {
      '来源节点': unknown;
      '关键链路': boolean;
      '排序': number;
      '所属项目': string;
      '目标节点': unknown;
      '连接名称': string;
      '连接ID': string;
      '连接类型': string;
      '标签': string;
    };
    id: string;
  }[];
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProjectGraphConnectionBitableCrudOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface ProjectGraphConnectionBitableCrudOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {
    '连接名称': {
      text: string;
    };
    '标签': unknown;
    '来源节点': unknown;
    '目标节点': unknown;
    '连接ID': unknown;
    '连接类型': string;
    '关键链路': unknown;
    '排序': number;
    '所属项目': unknown;
  };
}

export interface ProjectGraphConnectionBitableCrudOneSearchrecordsInput {
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      operator: string;
      value: string[];
      fieldName: string;
    }[];
  };
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
}

/**
 * capabilityClient.load('project_graph_connection_bitable_crud_1').call<ProjectGraphConnectionBitableCrudOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface ProjectGraphConnectionBitableCrudOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    record: {
      '标签': unknown;
      '所属项目': unknown;
      '来源节点': unknown;
      '目标节点': unknown;
      '连接ID': unknown;
      '连接类型': string;
      '排序': number;
      '连接名称': {
        text: string;
      };
      '关键链路': unknown;
    };
    id: string;
  }[];
}
// ---- end:project_graph_connection_bitable_crud_1 ----

// ---- plugin:project_graph_node_crud_1 ----
// ============================================================
// 插件 project_graph_node_crud_1 (项目图谱节点表CRUD操作) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProjectGraphNodeCrudOneAggregatequeryInput {
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    fieldName: string;
    aggregation: string;
    alias: string;
  }[];
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, result } = result;
 */
export interface ProjectGraphNodeCrudOneAggregatequeryOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  result: {

  }[];
}

export interface ProjectGraphNodeCrudOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '下一步': string;
      '排序': number;
      '所属项目': string;
      '分组': string;
      '版本/分支': string;
      '日期': number;
      '工作内容': string;
      '负责人': number[];
      '进度': number;
      '父节点': unknown;
      '节点ID': string;
      '副标题': string;
      '节点类型': string;
      '状态': string;
      '节点名称': string;
      '风险/阻塞': string;
      '标签': string;
      '图片URL': string;
    };
  }[];
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProjectGraphNodeCrudOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProjectGraphNodeCrudOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {
      '版本/分支': string;
      '日期': number;
      '父节点': unknown;
      '节点ID': string;
      '进度': number;
      '标签': string;
      '所属项目': string;
      '工作内容': string;
      '节点名称': string;
      '节点类型': string;
      '状态': string;
      '负责人': number[];
      '图片URL': string;
      '排序': number;
      '副标题': string;
      '分组': string;
      '下一步': string;
      '风险/阻塞': string;
    };
  }[];
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProjectGraphNodeCrudOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProjectGraphNodeCrudOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface ProjectGraphNodeCrudOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface ProjectGraphNodeCrudOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface ProjectGraphNodeCrudOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {
    '图片URL': unknown;
    '排序': number;
    '所属项目': unknown;
    '节点类型': string;
    '负责人': number[];
    '进度': number;
    '版本/分支': unknown;
    '标签': unknown;
    '分组': string;
    '工作内容': unknown;
    '下一步': unknown;
    '父节点': unknown;
    '节点名称': {
      text: string;
    };
    '状态': string;
    '节点ID': unknown;
    '副标题': unknown;
    '日期': number;
    '风险/阻塞': unknown;
  };
}

export interface ProjectGraphNodeCrudOneSearchrecordsInput {
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      operator: string;
      value: string[];
      fieldName: string;
    }[];
  };
  /** [object Object] */
  pageToken?: string;
}

/**
 * capabilityClient.load('project_graph_node_crud_1').call<ProjectGraphNodeCrudOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface ProjectGraphNodeCrudOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {
      '下一步': unknown;
      '排序': number;
      '日期': number;
      '图片URL': unknown;
      '节点ID': unknown;
      '节点类型': string;
      '负责人': number[];
      '进度': number;
      '父节点': unknown;
      '分组': string;
      '状态': string;
      '工作内容': unknown;
      '风险/阻塞': unknown;
      '所属项目': unknown;
      '标签': unknown;
      '节点名称': {
        text: string;
      };
      '副标题': unknown;
      '版本/分支': unknown;
    };
  }[];
}
// ---- end:project_graph_node_crud_1 ----