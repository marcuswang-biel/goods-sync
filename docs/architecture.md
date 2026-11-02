# 代码分层与组织

本文只说明 monorepo 怎么按层拆分，以及 web / backend / native 各自内部怎么摆文件。产品语义见 [CONTEXT.md](../CONTEXT.md)。

---

## 1. 整体分层

```text
apps/web · apps/native          表现层（UI、路由、客户端状态）
        │
        ├─► packages/shared     跨端契约（错误码等）
        ├─► packages/domain     纯业务规则（Effect，无 I/O）
        └─► Convex client
                │
                ▼
packages/backend/convex         边界层（鉴权、读写库、调用 domain）
                │
                ▼
packages/domain                 规则层（fold、校验、评估…）
```

| 层 | 路径 | 职责 |
| --- | --- | --- |
| 表现 · Web | `apps/web` | 页面、组件、调用 Convex、i18n |
| 表现 · Native | `apps/native` | 同上 + 本机离线队列与 sync 编排 |
| 边界 | `packages/backend/convex` | 鉴权、读库、跑 Effect、写库 |
| 规则 | `packages/domain` | 业务决策与校验；禁止依赖 Convex / UI |
| 契约 | `packages/shared` | 前后端共用的稳定类型（如错误码） |
| 配置 / 工具 | `packages/config`、`tools/`、`scripts/` | tsconfig、lint、脚手架 |

依赖只允许「上层 → 下层」。`domain` 不依赖 backend；backend 与两端客户端都可以依赖 `domain` / `shared`。

---

## 2. 后端（`packages/backend`）

Convex 即后端。按「入口函数 → 库内辅助 → schema」组织：

```text
packages/backend/convex/
├── schema.ts              表与 validators
├── functions.ts           mutation 包装（triggers）；业务里从此处 import mutation
├── auth.ts · http.ts      认证组件与 HTTP 路由
├── spaces.ts              货架成员 / space API
├── stock.ts               货架 board / sync / create …
├── purchases.ts           采购 API
├── viewer.ts · init.ts    当前用户、本地种子
├── migrations.ts          数据迁移
├── lib/
│   ├── identity.ts        requireUserId
│   ├── spaceAccess.ts     成员校验
│   └── applyStock.ts      读 movements → 调 domain fold → 写回
└── __tests__/             convex-test
```

**边界约定（handler 顺序）**

1. 授权  
2. 读库  
3. 调用 `@goods/domain`（Effect）  
4. 把 tagged error 映射成 `ConvexError`（code 来自 `@goods/shared`）  
5. 写库  

无业务决策的简单 CRUD 可以不经过 domain；有规则的路径以 `stock` + `lib/applyStock` 为样板。

规则本体不在这里，而在：

```text
packages/domain/src/
├── stock/       库存 fold、评估、货架行草稿
├── purchase/    采购篮校验
└── offline/     离线操作的 Schema / 形状
```

---

## 3. Web 前端（`apps/web`）

按「入口 → 路由 → 功能模块 → 壳 / UI → auth / lib」：

```text
apps/web/src/
├── main.tsx                 启动、Provider
├── routes/                  TanStack Router 页面入口
│   ├── __root.tsx
│   ├── index.tsx
│   ├── sign-in.tsx
│   ├── stock.tsx
│   └── purchases.tsx
├── features/                按业务域拆的界面逻辑
│   ├── stock/               看板、货架、领用相关 UI
│   ├── purchase/            采购列表
│   └── space/               当前货架选择等
├── components/
│   ├── app-shell.tsx · …    应用壳、鉴权门
│   └── ui/                  shadcn / Base UI 原子组件
├── auth/                    Better Auth 客户端（与业务 UI 隔离）
└── lib/ · utils/            env、i18n、convex 辅助
```

分层习惯：

- **路由**只挂页面，不堆业务细节。  
- **features/\*** 放该域的组件与文案映射；通过 Convex hooks 调后端。  
- **components/ui** 无业务；**auth** 只导出登录相关，业务侧用 `useConvexAuth` / `@/auth`。  
- Web **不做**完整离线队列；在线直连 Convex。

---

## 4. 移动端（`apps/native`）

Expo Router。结构与 web 同思路，但多一层「本机队列 / sync」：

```text
apps/native/
├── app/                     路由（Expo Router）
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── index.tsx · shelf.tsx · purchases.tsx
├── components/              屏幕与交互 hooks
│   ├── board-screen.tsx · shelf-screen.tsx · purchase-screen.tsx
│   ├── use-consume.ts · use-active-shelf.ts · …
│   └── ensure-shelf.tsx · shelf-gate.tsx
├── lib/                     无 UI 的客户端逻辑
│   ├── offline-queue.ts     本机队列读写
│   ├── sync-plan.ts         如何把队列打成 stock/purchases sync
│   ├── shelf-view.ts · purchase-view.ts · network.ts · …
│   └── convex.ts · env.ts
└── auth/                    Expo Better Auth（Secure Store）
```

分层习惯：

- **app/** = 路由壳，尽量薄。  
- **components/** = 屏幕与用户操作。  
- **lib/** = 离线、组 batch、展示用纯函数；形状与规则对齐 `@goods/domain/offline` 等。  
- 联网后的写入仍走与 web 相同的 Convex API（`stock.sync`、`purchases.*`…），不在 native 里另写一套服务端合并。

---

## 5. 三端对照

| 关注点 | Web | Native | Backend |
| --- | --- | --- | --- |
| 路由 | `src/routes` | `app/` | — |
| 业务 UI | `src/features/*` | `components/*` | — |
| 客户端辅助 | `src/lib` | `lib/`（含 offline / sync-plan） | `convex/lib` |
| 认证隔离目录 | `src/auth` | `auth/` | `auth.ts` / `http.ts` |
| 业务规则 | 可引用 domain 做展示/校验 | 同左 + offline queue 形状 | handler 内调用 domain |
| 数据真相 | Convex 查询/mutation | 同左；离线先写本机再 sync | schema + fold 写回缓存字段 |

---

## 6. 改代码时落在哪一层

| 你要改的是… | 落点 |
| --- | --- |
| 按钮、列表、页面布局 | `apps/web` 的 `features` / `components`，或 `apps/native` 的 `components` |
| 离线排队、flush 顺序 | `apps/native/lib`（+ 必要时 `packages/domain/src/offline`） |
| 领用能否成立、如何排序合并 | `packages/domain/src/stock` |
| 采购数量/总额校验 | `packages/domain/src/purchase` |
| 谁可读写、读哪些表、如何落库 | `packages/backend/convex/*.ts` 与 `lib/` |
| 表字段、索引 | `packages/backend/convex/schema.ts` |
| 客户端如何识别失败 | `packages/shared` 的 error codes，再在各端分支 |
