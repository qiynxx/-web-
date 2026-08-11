# 研发项目 GitGraph 可视化

飞书妙搭全栈应用，以多维表格作为项目图谱数据库。生产模式通过当前登录用户的飞书 OAuth 授权，在指定共享文件夹中为每个项目创建独立 Base；妙搭 PostgreSQL 保存权威项目目录和创建状态，飞书目录 Base 保留可见镜像。本地开发仍可使用已登录的 `lark-cli`。

## 关键设计

- 知识库父节点：`硬件项目管理`
- Web 项目目录：`Web项目管理可视化`
- 项目边界：每个项目一个独立 Base，每个 Base 自动创建“项目节点”和“项目连接关系”表
- 飞书看板：每个独立项目自动创建“人员分工看板”，按任务负责人分列并展示状态和关键执行信息
- 生产 OpenAPI 通道：`server/modules/feishu-openapi/`
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

## 妙搭云端部署

飞书自建应用需要启用网页 OAuth，并开通 Base 创建、表/字段/视图管理、记录读写和目标云空间文件夹访问权限。OAuth 重定向地址必须与 `FEISHU_OAUTH_REDIRECT_URI` 完全一致，例如：

```text
https://<妙搭域名>/app/<app_id>/oauth/feishu/callback
```

妙搭环境变量：

```dotenv
PROJECT_GRAPH_STORAGE_MODE=feishu-openapi
FEISHU_APP_ID=<飞书自建应用 App ID>
FEISHU_APP_SECRET=<飞书自建应用 App Secret>
FEISHU_OAUTH_REDIRECT_URI=<OAuth 回调完整 URL>
FEISHU_TOKEN_ENCRYPTION_KEY=<至少 32 字节的随机密钥>
PROJECT_BASE_FOLDER_TOKEN=<共享文件夹 token>
PROJECT_GRAPH_CATALOG_BASE_TOKEN=<目录 Base token>
PROJECT_GRAPH_CATALOG_TABLE_ID=<目录表 ID>
```

首次部署前对妙搭数据库执行 `server/database/migrations/001_feishu_project_storage.sql`。迁移只新增表和索引，不修改或删除现有 Base 数据。用户第一次创建项目时会弹出飞书授权窗口；token 加密后只保存在妙搭数据库，不返回浏览器。

项目创建使用可恢复状态机：Base、节点表、连线表每完成一步就保存 token/ID。网络或权限失败后重试会从已有资源继续，不重复创建 Base；目录 Base 镜像失败不会让已创建项目失效。

## 新建项目流程

Web 端点击“新建项目”并填写名称后，后端会在“硬件项目管理”下创建独立 Base、创建节点表和连线表、建立按任务负责人分列的“人员分工看板”、把 token 与表 ID 登记到“Web项目管理可视化”，随后 Web 自动切换到新项目并打开对应飞书文档。

打开项目后点击“修改项目名称”，会同步更新 Web 项目标题、目录表中的“项目名称”和该项目独立 Base 文档标题；如果目录写入失败，后端会尝试把 Base 标题回滚到原名称。

项目流程图由 Web 根据 Base 中的“项目节点”和“项目连接关系”两张表实时渲染。Base 本身保存结构化记录，不会自动生成同款流程图画布；Web 顶部提供“节点表”和“连线表”入口用于直接核对底层数据。

生产环境使用飞书 OpenAPI 用户授权通道；本地 `lark-cli` 仅用于开发和迁移，不作为妙搭云端运行依赖。

## 验证

```bash
npm run type:check
npm test -- --runInBand
npm run lint
npm run build:prod
```

测试覆盖独立项目创建与重命名、人员分工看板创建与配置、重命名失败回滚、CLI 矩阵结果映射、Base 读写 payload、日期与单选字段解析、连线关联、节点删除时清理关联连线，以及权限错误传递。

## 飞书 Base 原生插件

`base-plugin/` 是同一套项目图谱的飞书多维表格数据表视图版本。它直接运行在 Base 内部，不需要单独部署 Web 前端服务器，并从当前 Base 的节点表和连线表读写数据。

插件源码、字段约定、构建命令、发布状态和企业成员访问条件见 [`base-plugin/README.md`](./base-plugin/README.md)。
