# AndroidAPS 远程控制方案

## 架构：SMS 网关 + Nightscout

```
Web 控制面板 ──SMS 网关──> 短信 ──> AndroidAPS 手机（SMS Communicator）──> 胰岛素泵
                  ↑                                                         ↓
                  │                                                    执行输注
                  │                                                         ↓
                  └──────────────── 确认 SMS ◄──────────────────────────────┘

Web 控制面板 ──Nightscout API──> 读取血糖、泵状态、治疗历史
```

**核心原理**：利用 AndroidAPS 内置的 SMS Communicator 插件，无需修改 AndroidAPS 源码。

## 功能

### 1. 手机号登录
- 输入手机号即可登录
- 登录号码自动作为 AndroidAPS SMS 白名单号码
- 需在 AndroidAPS SMS Communicator 中将该号码添加到白名单

### 2. SMS 网关配置（登录后配置）
支持 4 种短信服务商：
- **阿里云短信**：需要 AccessKeyId、AccessKeySecret、签名、模板
- **腾讯云短信**：需要 SecretId、SecretKey、签名、模板
- **Twilio**：需要 Account SID、Auth Token
- **通用 HTTP 网关**：自定义 API 地址

### 3. Nightscout 配置
- Nightscout URL
- API Secret
- 用于读取 CGM 血糖、泵状态、治疗历史

### 4. 远程输注
- 胰岛素输注：精确输入 + 快捷剂量（0.5/1/1.5/2/3/5U）
- 碳水记录：精确输入 + 快捷数量（5/10/15/20/30/45g）
- 混合输注：同时输注胰岛素和碳水
- 所有操作通过 SMS 发送命令到 AndroidAPS

### 5. 安全保护
- 胰岛素输注后 15 分钟内不可再次输注
- 碳水记录后 1 分钟内不可再次记录
- 锁定状态持久化到 localStorage
- 实时倒计时显示
- 二次确认弹窗

### 6. 数据查看
- 当前血糖（CGM）+ 趋势箭头
- 储药器余量
- 活性胰岛素（IOB）
- 泵电池电量
- 治疗记录（最近 20 条）

## SMS 命令格式

| 命令 | 格式 | 示例 |
|------|------|------|
| 胰岛素 | `BOLUS <剂量>` | `BOLUS 2.5` |
| 碳水 | `CARBS <克数>` | `CARBS 30` |
| 状态查询 | `STATUS` | `STATUS` |
| 暂停泵 | `SUSPEND` | `SUSPEND` |
| 恢复泵 | `RESUME` | `RESUME` |
| 临时目标 | `TARGET <低> <高> <时长>` | `TARGET 80 120 60` |

## AndroidAPS 端配置

1. 打开 AndroidAPS → 配置构建器 → 启用 **SMS Communicator**
2. 进入 SMS Communicator 设置
3. 添加允许的手机号（白名单）：填入 Web 端登录的手机号
4. 确保手机能接收短信

## 部署步骤

1. 配置 SMS 网关服务（阿里云/腾讯云/Twilio）
2. 打开 Web 控制面板，输入手机号登录
3. 配置 SMS 网关参数
4. 配置 Nightscout URL 和 API Secret
5. 在 AndroidAPS 中添加白名单号码
6. 开始使用
