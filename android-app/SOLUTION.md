# AndroidAPS Remote API - 完整方案文档

## 架构概览

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web 控制面板    │  HTTP   │  Android 手机端   │  Intent  │   AndroidAPS    │
│  (本 Web 项目)   │ ──────> │  Remote API App  │ ──────> │   (胰岛素泵)     │
│                 │  JSON   │  (HTTP Server)   │  SMS    │                 │
│  - 输注胰岛素    │ <────── │  - 接收命令       │ <────── │  - 执行输注      │
│  - 记录碳水      │  结果   │  - 执行命令       │  广播   │  - 返回结果      │
│  - 查看状态      │         │  - 返回结果       │         │                 │
│  - 结果确认      │         │  - 容错重试       │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## 核心特性

### 1. 真正的胰岛素输注执行
- 通过 Android Broadcast Intent 或 SMS Loopback 与 AndroidAPS 交互
- 命令实际触发胰岛素泵的输注操作
- 返回实际输注量（可能与请求量不同，如储药器不足）

### 2. 输注结果确认
- 异步命令模式：先返回 `requestId`，再轮询结果
- 支持查询命令执行状态：`GET /result/:requestId`
- 返回字段：`success`、`deliveredAmount`、`message`

### 3. 容错机制
- **自动重试**：网络失败时自动重试（最多 2 次）
- **超时保护**：命令执行超时 30 秒自动返回失败
- **结果轮询**：轮询命令执行结果，间隔 2 秒
- **错误分类**：区分网络错误、超时、执行失败

### 4. 安全保障
- Bearer Token 认证
- 最大单次剂量限制（胰岛素 25U，碳水 250g）
- 命令审计日志

## API 端点详解

### POST /bolus - 输注胰岛素

**请求：**
```json
{
  "insulin": 2.5,
  "id": "optional-request-id"
}
```

**响应（202 Accepted）：**
```json
{
  "status": "accepted",
  "requestId": "req_1723456789_1234",
  "type": "bolus",
  "insulin": 2.5,
  "message": "Command queued for execution",
  "resultUrl": "/result/req_1723456789_1234"
}
```

**查询结果（GET /result/:requestId）：**
```json
{
  "requestId": "req_1723456789_1234",
  "type": "bolus",
  "status": "completed",
  "requestedAmount": 2.5,
  "deliveredAmount": 2.5,
  "success": true,
  "message": "Bolus delivered successfully",
  "createdAt": 1723456789000,
  "completedAt": 1723456795000
}
```

### POST /carbs - 记录碳水

**请求：**
```json
{
  "carbs": 30,
  "id": "optional-request-id"
}
```

### POST /treatment - 混合输注

**请求：**
```json
{
  "insulin": 2.5,
  "carbs": 30,
  "notes": "午餐"
}
```

### GET /status - 设备状态

**响应：**
```json
{
  "status": "ok",
  "pump": {
    "connected": true,
    "battery": 85,
    "reservoir": 120.5,
    "state": "normal"
  },
  "loop": {
    "active": true,
    "lastRun": 1723456789000,
    "status": "success"
  },
  "iob": 1.2,
  "currentBasal": 0.8,
  "timestamp": 1723456789000
}
```

### GET /cgm?count=12 - 血糖数据
### GET /treatments?count=20 - 治疗历史
### GET /ping - 健康检查

## Android 端集成方式

### 方式一：Broadcast Intent（推荐）
```
Remote API App → sendBroadcast(ACTION_BOLUS) → AndroidAPS 接收 → 执行输注
```
- 需要 AndroidAPS 注册对应的 Broadcast Receiver
- 需要修改 AndroidAPS 源码添加 Remote API 支持
- 最可靠的方式

### 方式二：SMS Loopback
```
Remote API App → sendSMS(本机号码) → AndroidAPS SMS Communicator → 执行输注
```
- 利用 AndroidAPS 已有的 SMS 远程命令功能
- 无需修改 AndroidAPS 源码
- 需要手机支持 SMS 发送和接收

### 方式三：Content Provider（只读）
```
Remote API App → query(ContentProvider) → AndroidAPS 数据库
```
- 仅用于读取数据（状态、CGM、治疗历史）
- 不能用于执行命令

## 部署步骤

### 1. 准备 Android 开发环境
- 安装 Android Studio
- 克隆本项目的 `android-app/` 目录

### 2. 修改 AndroidAPS（如使用 Broadcast 方式）
需要在 AndroidAPS 中添加 Broadcast Receiver：

```kotlin
// 在 AndroidAPS 中添加
class RemoteCommandReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "info.nightscout.androidaps.action.BOLUS" -> {
                val amount = intent.getDoubleExtra("amount", 0.0)
                val commandId = intent.getStringExtra("commandId")
                // 调用 AndroidAPS 的 bolus 功能
                // ...
                // 发送结果广播
                sendResultBroadcast(commandId, true, "Bolus delivered", amount)
            }
        }
    }
}
```

### 3. 编译安装 Remote API App
```bash
cd android-app
./gradlew assembleDebug
# 安装到手机
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 4. 配置并启动
1. 打开 "AAPS Remote" 应用
2. 设置端口（默认 8080）
3. 设置 Auth Token（强烈建议）
4. 点击 "Start Server"

### 5. Web 端连接
- 选择「直接连接」模式
- 设备地址：`http://<手机IP>:8080`
- Bearer Token：你设置的 Token

## 容错机制详解

### Web 端容错
```
1. 发送命令 → 成功？→ 获取 requestId
                ↓ 失败
2. 等待 3s → 重试（最多 2 次）
                ↓ 仍失败
3. 返回错误

4. 获取 requestId → 轮询结果（每 2s）
                     ↓ 超时 30s
5. 返回超时错误
```

### Android 端容错
```
1. 接收命令 → 验证参数
2. 尝试 Broadcast → 成功？→ 等待结果广播
                    ↓ 失败
3. 尝试 SMS Loopback → 成功？→ 等待 SMS 执行结果
                        ↓ 失败
4. 返回错误
```

## 安全注意事项

1. **Token 认证**：始终设置 Bearer Token，防止未授权访问
2. **局域网限制**：确保手机和 Web 在同一局域网
3. **剂量限制**：服务端强制限制最大单次剂量
4. **审计日志**：所有命令都有日志记录
5. **HTTPS**：生产环境建议使用 HTTPS（可通过反向代理实现）

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 连接超时 | 手机 IP 变化 / 防火墙 | 检查手机 IP，关闭防火墙 |
| 401 Unauthorized | Token 不匹配 | 检查 Web 端和 Android 端 Token 是否一致 |
| 命令超时 | AndroidAPS 未响应 | 检查 AndroidAPS 是否运行，查看 Android 日志 |
| 输注未执行 | Broadcast 未注册 | 检查 AndroidAPS 是否安装了修改版本 |
| 结果查询 404 | requestId 过期 | 结果只保留最近 100 条，检查 requestId 是否正确 |
