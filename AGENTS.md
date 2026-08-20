# AGENTS.md - AndroidAPS Remote Control

## 项目概览
AndroidAPS 远程控制面板，通过设备轮询机制发送命令到 AndroidAPS 手机，通过 Nightscout API 读取血糖和设备数据。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4 + lucide-react
- **Package Manager**: pnpm

## 目录结构
```
src/
├── app/
│   ├── api/
│   │   ├── device/              # 设备管理 API
│   │   │   ├── register/route.ts   # 设备注册 (POST)
│   │   │   ├── heartbeat/route.ts  # 设备心跳 (POST)
│   │   │   ├── commands/route.ts   # 设备轮询命令 (GET)
│   │   │   ├── result/route.ts     # 设备上报结果 (POST)
│   │   │   └── status/route.ts     # 设备状态查询 (GET)
│   │   ├── command/             # 命令管理 API
│   │   │   ├── create/route.ts     # 创建命令 (POST)
│   │   │   └── status/route.ts     # 查询命令状态 (GET)
│   │   └── nightscout/          # Nightscout API 代理
│   │       ├── config/route.ts     # 连接测试 (POST)
│   │       ├── treatments/route.ts # 治疗记录 (GET)
│   │       ├── status/route.ts     # 设备状态 (GET)
│   │       ├── entries/route.ts    # CGM 血糖数据 (GET)
│   │       └── ping/route.ts       # 健康检查 (GET)
│   ├── layout.tsx             # 根布局
│   ├── page.tsx               # 主页面（登录 + 配置 + 控制面板）
│   └── globals.css            # 全局样式
├── components/ui/             # shadcn/ui 组件库
├── hooks/
│   ├── use-safety-lock.ts     # 安全锁定 Hook (胰岛素15分钟/碳水1分钟)
│   └── use-remote-command.ts  # 远程命令发送 Hook
├── lib/
│   ├── types.ts               # 类型定义
│   ├── utils.ts               # 工具函数
│   └── store.ts               # 内存数据存储（设备注册、命令队列）
└── SOLUTION.md                # AndroidAPS 源码修改方案
```

## 开发命令
- `pnpm dev` - 启动开发服务器
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产服务器
- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint` - ESLint 检查

## 核心功能
1. **手机号登录**: 输入手机号登录，该号码需与 AndroidAPS 设备上注册的号码一致
2. **Nightscout 配置**: URL + API Secret，用于读取数据
3. **设备在线状态**: 实时显示 AndroidAPS 设备在线/离线状态
4. **远程输注**: 通过命令队列发送 BOLUS/CARBS 命令到 AndroidAPS
5. **安全锁定**: 胰岛素 15 分钟 / 碳水 1 分钟防重复
6. **数据查看**: CGM 血糖、泵状态、治疗历史
7. **二次确认**: 所有医疗操作需要确认弹窗

## 架构说明

### 命令流转
```
Web 用户 → POST /api/command/create → 命令存入队列
AndroidAPS 设备 → GET /api/device/commands?phone=xxx → 获取待执行命令
AndroidAPS 设备 → 执行命令 → POST /api/device/result → 上报结果
Web 用户 → GET /api/command/status?id=xxx → 查询命令状态
Web 用户 → GET /api/nightscout/treatments → Nightscout 二次确认
```

### 设备管理
- **注册**: 设备启动时调用 POST /api/device/register
- **心跳**: 设备每 30 秒调用 POST /api/device/heartbeat
- **轮询**: 设备每 5 秒调用 GET /api/device/commands
- **离线判定**: 超过 60 秒无心跳标记为离线

## API 说明

### 设备管理 API
- `POST /api/device/register` - 设备注册
- `POST /api/device/heartbeat` - 设备心跳
- `GET /api/device/commands?phone=` - 设备轮询命令
- `POST /api/device/result` - 设备上报结果
- `GET /api/device/status?phone=` - 查询设备状态

### 命令管理 API
- `POST /api/command/create` - 创建命令
- `GET /api/command/status?id=` - 查询命令状态

### Nightscout 代理 API
- `POST /api/nightscout/config` - 测试 Nightscout 连接
- `GET /api/nightscout/treatments?url=&secret=&count=` - 获取治疗记录
- `GET /api/nightscout/status?url=&secret=` - 获取设备状态
- `GET /api/nightscout/entries?url=&secret=` - 获取 CGM 血糖数据
- `GET /api/nightscout/ping` - 健康检查

## 安全注意事项
- API Secret 仅在后端使用 SHA1 哈希后传递给 Nightscout
- 所有医疗操作需要二次确认
- 前端不持久化存储 API Secret（仅保存在内存 state 中）
- 命令有效期 5 分钟，超时自动失效
- 登录手机号需与 AndroidAPS 设备上注册的号码一致
