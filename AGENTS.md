# AGENTS.md - AndroidAPS Remote Control

## 项目概览
AndroidAPS 远程控制面板，通过 Nightscout REST API 与 AndroidAPS 胰岛素泵系统通信，实现远程胰岛素输注、碳水记录和输注结果确认。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Package Manager**: pnpm

## 目录结构
```
src/
├── app/
│   ├── api/
│   │   ├── nightscout/       # Nightscout API 代理路由
│   │   │   ├── config/route.ts   # 连接测试 (POST)
│   │   │   ├── treatments/route.ts # 治疗记录 (GET/POST)
│   │   │   ├── status/route.ts   # 设备状态 (GET)
│   │   │   ├── entries/route.ts  # CGM 血糖数据 (GET)
│   │   │   └── ping/route.ts     # 健康检查 (GET)
│   │   └── direct/route.ts   # 直接 HTTP API 代理 (GET/POST)
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 主页面（连接 + 控制面板）
│   └── globals.css           # 全局样式
├── components/ui/            # shadcn/ui 组件库
├── hooks/
│   └── use-nightscout.ts     # AAPS 连接管理 Hook (支持双模式)
└── lib/
    ├── types.ts              # 类型定义 (含双模式配置)
    └── utils.ts              # 工具函数
```

## 开发命令
- `pnpm dev` - 启动开发服务器
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产服务器
- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint` - ESLint 检查

## 核心功能
1. **双模式连接**: 支持 Nightscout 模式和直接 HTTP API 模式
2. **连接配置**: 输入 Nightscout URL/API Secret 或设备 HTTP 地址建立连接
3. **状态面板**: 显示当前血糖(CGM)、储药器余量、活性胰岛素(IOB)、泵状态
4. **胰岛素输注**: 支持精确剂量输入 + 快捷剂量按钮
5. **碳水记录**: 支持碳水克数输入 + 快捷数量按钮
6. **混合输注**: 同时输注胰岛素和记录碳水
7. **二次确认**: 所有医疗操作必须经过确认弹窗
8. **治疗历史**: 查看最近 20 条治疗记录
9. **血糖趋势**: 简单的柱状图展示最近血糖变化

## API 说明
### Nightscout 模式 (通过后端代理)
- `POST /api/nightscout/config` - 测试 Nightscout 连接
- `GET /api/nightscout/treatments?url=&secret=&count=` - 获取治疗记录
- `POST /api/nightscout/treatments` - 提交新的治疗记录
- `GET /api/nightscout/status?url=&secret=` - 获取设备状态
- `GET /api/nightscout/entries?url=&secret=` - 获取 CGM 血糖数据
- `GET /api/nightscout/ping` - 健康检查

### 直接 HTTP API 模式 (代理到 Android 设备)
- `POST /api/direct` - 发送命令 (action: bolus/carbs/treatment/ping)
- `GET /api/direct?url=&action=&token=` - 获取数据 (action: status/cgm/treatments/ping)

### Android 设备端需实现的 API 端点
- `POST /bolus` - `{ insulin: number }` - 输注胰岛素
- `POST /carbs` - `{ carbs: number }` - 记录碳水
- `POST /treatment` - `{ insulin?, carbs?, notes? }` - 混合输注
- `GET /status` - 返回设备/泵状态
- `GET /cgm?count=12` - 返回 CGM 血糖数据
- `GET /treatments?count=20` - 返回治疗历史
- `GET /ping` - 健康检查

## 安全注意事项
- API Secret 仅在后端使用 SHA1 哈希后传递给 Nightscout
- 所有医疗操作需要二次确认
- 前端不持久化存储 API Secret（仅保存在内存 state 中）
