# 研发项目 GitGraph 可视化

飞书妙搭全栈应用，以多维表格作为项目图谱的数据库。代码通过 Git 管理，在妙搭运行时通过官方 `feishu-bitable` Capability 按当前登录访客的身份读写 Base。

## 关键设计

- 节点表：`tblVIjVsxIbuk1QQ`
- 连线表：`tblFSCyy1hjLEFO5`
- 读写通道：`server/capabilities/*.json`
- 服务端映射：`server/modules/project-graph/project-graph.service.ts`
- 人员字段：Base 真实 User 字段，写入妙搭人员 ID 数组，不降级为姓名文本
- 人员模型：`ProjectOwner` 同时保留 `apaasUserId`、`larkUserId`、`openId`、姓名、头像和邮箱
- 权限：所有 `/api/project-graph` 路由均需登录；没有 Base 权限时返回明确错误，不使用应用密钥绕过用户权限。

## 本地开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run type:check
npm test -- --runInBand
npm run lint
npm run build:prod
```

测试覆盖 Base 读写 payload、人员 ID 转换、日期毫秒时间戳、连线关联字段和权限错误传递。
