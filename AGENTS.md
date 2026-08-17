# AGENTS.md - AndroidAPS Remote Control

## 项目概览
AndroidAPS 远程控制面板，通过 SMS 网关发送命令到 AndroidAPS 手机（利用内置 SMS Communicator），通过 Nightscout API 读取血糖和设备数据。

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
│   │   ├── nightscout/       # Nightscout API 代理路由
│   │   │   ├── config/route.ts   # 连接测试 (POST)
│   │   │   ├── treatments/route.ts # 治疗记录 (GET/POST)
│   │   │   ├── status/route.ts   # 设备状态 (GET)
│   │   │   ├── entries/route.ts  # CGM 血糖数据 (GET)
│   │   │   └── ping/route.ts     # 健康检查 (GET)
│   │   └── sms/route.ts      # SMS 网关发送命令 (POST)
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 主页面（登录 + 配置 + 控制面板）
│   └── globals.css           # 全局样式
├── components/ui/            # shadcn/ui 组件库
├── hooks/
│   ├── use-safety-lock.ts    # 安全锁定 Hook (胰岛素15分钟/碳水1分钟)
│   └── use-sms-command.ts    # SMS 命令发送 Hook
├── lib/
│   ├── types.ts              # 类型定义
│   └── utils.ts              # 工具函数
└── SOLUTION.md               # 方案文档
```

## 开发命令
- `pnpm dev` - 启动开发服务器
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产服务器
- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint` - ESLint 检查

## 核心功能
1. **手机号登录**: 输入手机号登录，该号码作为 AndroidAPS SMS 白名单
2. **SMS 网关配置**: 支持阿里云/腾讯云/Twilio/通用网关
3. **Nightscout 配置**: URL + API Secret，用于读取数据
4. **远程输注**: 通过 SMS 发送 BOLUS/CARBS 命令到 AndroidAPS
5. **安全锁定**: 胰岛素 15 分钟 / 碳水 1 分钟防重复
6. **数据查看**: CGM 血糖、泵状态、治疗历史
7. **二次确认**: 所有医疗操作需要确认弹窗

## API 说明
### SMS 网关 (发送命令)
- `POST /api/sms` - 发送 SMS 命令到 AndroidAPS 手机

### Nightscout 代理 (读取数据)
- `POST /api/nightscout/config` - 测试 Nightscout 连接
- `GET /api/nightscout/treatments?url=&secret=&count=` - 获取治疗记录
- `GET /api/nightscout/status?url=&secret=` - 获取设备状态
- `GET /api/nightscout/entries?url=&secret=` - 获取 CGM 血糖数据
- `GET /api/nightscout/ping` - 健康检查

## 安全注意事项
- API Secret 仅在后端使用 SHA1 哈希后传递给 Nightscout
- 所有医疗操作需要二次确认
- 前端不持久化存储 API Secret（仅保存在内存 state 中）
- SMS 命令发送后无法撤回，需确认操作正确
- 登录手机号需在 AndroidAPS SMS Communicator 白名单中
