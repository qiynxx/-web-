# 研发项目 GitGraph 可视化

飞书妙搭全栈应用，以多维表格作为项目图谱数据库。当前本地开发模式通过已登录的 `lark-cli` 动态创建和读写 Base，使每个 Web 项目拥有独立的飞书文档；未开启本地 CLI 模式时，仍保留原有固定 Capability 兼容路径。

## 关键设计

- 知识库父节点：`硬件项目管理`
- Web 项目目录：`Web项目管理可视化`
- 项目边界：每个项目一个独立 Base，每个 Base 自动创建“项目节点”和“项目连接关系”表
- 飞书看板：每个独立项目自动创建“人员分工看板”，按任务负责人分列并展示状态和关键执行信息
- 本地动态读写通道：`server/modules/project-graph/lark-cli-base.client.ts`
- 固定 Base 兼容通道：`server/capabilities/*.json`
- 服务端映射：`server/modules/project-graph/project-graph.service.ts`
- 独立项目负责人：当前以姓名文本保存，避免把妙搭人员 ID 错写为飞书 `open_id`
- 人员模型：`ProjectOwner` 同时保留 `apaasUserId`、`larkUserId`、`openId`、姓名、头像和邮箱
- 权限：所有 `/api/project-graph` 路由均需登录；本地 CLI 使用当前已授权飞书用户身份。

## 本地开发

```bash
npm install
npm run dev
```

`.env.local` 需要配置：

```dotenv
MIAODA_LOCAL_DEV=1
PROJECT_GRAPH_STORAGE_MODE=lark-cli
PROJECT_GRAPH_CATALOG_BASE_TOKEN=<目录 Base token>
PROJECT_GRAPH_CATALOG_TABLE_ID=<目录表 ID>
PROJECT_GRAPH_CATALOG_WIKI_URL=<目录 Wiki URL>
PROJECT_GRAPH_WIKI_PARENT_NODE_TOKEN=<硬件项目管理节点 token>
```

首次使用先完成 `lark-cli auth login`。修改 `.env.local` 后必须重启 `npm run dev`，Nest watch 不会自动重新加载环境变量。

## 新建项目流程

Web 端点击“新建项目”并填写名称后，后端会在“硬件项目管理”下创建独立 Base、创建节点表和连线表、建立按任务负责人分列的“人员分工看板”、把 token 与表 ID 登记到“Web项目管理可视化”，随后 Web 自动切换到新项目并打开对应飞书文档。

打开项目后点击“修改项目名称”，会同步更新 Web 项目标题、目录表中的“项目名称”和该项目独立 Base 文档标题；如果目录写入失败，后端会尝试把 Base 标题回滚到原名称。

项目流程图由 Web 根据 Base 中的“项目节点”和“项目连接关系”两张表实时渲染。Base 本身保存结构化记录，不会自动生成同款流程图画布；Web 顶部提供“节点表”和“连线表”入口用于直接核对底层数据。

> `lark-cli` 动态创建属于本地开发方案。部署到妙搭运行环境前，需要改为可在云端运行的飞书 OpenAPI 用户授权通道，不能假定云端存在本机 CLI 登录状态。

## 验证

```bash
npm run type:check
npm test -- --runInBand
npm run lint
npm run build:prod
```

测试覆盖独立项目创建与重命名、人员分工看板创建与配置、重命名失败回滚、CLI 矩阵结果映射、Base 读写 payload、日期与单选字段解析、连线关联、节点删除时清理关联连线，以及权限错误传递。
