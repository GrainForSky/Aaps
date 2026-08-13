# AndroidAPS Remote Server - Android 端部署指南

## 概述

这是在 Android 设备上运行的轻量级 HTTP 服务器，用于接收 Web 控制面板的指令并与 AndroidAPS 交互。

## 前提条件

- Android 手机已安装 [Termux](https://f-droid.org/packages/com.termux/) (推荐从 F-Droid 安装)
- AndroidAPS 已安装并正常运行
- 手机和 Web 端设备在同一局域网内

## 安装步骤

### 方法一：一键安装（推荐）

1. 将 `android-server` 文件夹传输到手机（可通过 USB、网盘、或 Web 下载）
2. 打开 Termux，执行：

```bash
cd /path/to/android-server
chmod +x setup.sh
./setup.sh
```

### 方法二：手动安装

```bash
# 1. 安装 Termux 依赖
pkg update
pkg install nodejs termux-api

# 2. 创建项目目录
mkdir -p ~/aaps-server && cd ~/aaps-server

# 3. 复制 server.js 和 package.json 到此目录

# 4. 安装依赖
npm install --production

# 5. 启动服务
node server.js
```

## 配置

编辑 `.env` 文件：

```bash
nano .env
```

### 配置项说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `AAPS_PORT` | HTTP 服务端口 | 8080 |
| `AAPS_TOKEN` | Bearer Token 认证密钥（建议设置） | 空（不认证） |
| `AAPS_USE_SMS` | 是否使用 SMS 方式发送命令 | false |
| `AAPS_SMS_NUMBER` | SMS 命令发送到的号码（本机号码） | 空 |

### 推荐配置

```
AAPS_PORT=8080
AAPS_TOKEN=my-secret-token-123
AAPS_USE_SMS=false
```

## 启动服务

### 前台运行（调试用）
```bash
npm start
```

### 后台运行（推荐）
```bash
nohup npm start > server.log 2>&1 &
```

### 停止服务
```bash
pkill -f "node server.js"
```

## 权限设置

### 1. Termux 权限
- 打开 Android 设置 → 应用 → Termux → 权限
- 授予「短信」权限（如果使用 SMS 方式）
- 授予「存储」权限（如果需要读取数据库）

### 2. AndroidAPS SMS Communicator（如果使用 SMS 方式）
- 打开 AndroidAPS → 配置 → SMS Communicator
- 启用 SMS Communicator
- 添加允许的号码（填入本机号码）
- 设置 SMS 密码（可选）

### 3. Root 权限（如果需要读取数据库）
- 确保手机已 root
- 在 Termux 中运行 `su` 获取 root 权限
- 授予 Termux root 访问权限

## 命令发送方式

服务器支持三种方式发送命令到 AndroidAPS：

### 方式一：广播（Broadcast）
- 通过 Android `am broadcast` 发送命令
- 需要 AndroidAPS 配置了接收广播的接收器
- 无需额外权限

### 方式二：SMS（推荐）
- 通过发送 SMS 到本机，AndroidAPS SMS Communicator 接收并执行
- 需要 AndroidAPS 开启 SMS Communicator
- 需要 Termux:API 和短信权限
- **最可靠的方式**

### 方式三：Service
- 通过 Android `am startservice` 直接调用 AndroidAPS 服务
- 需要知道 AndroidAPS 的内部服务接口
- 可能因版本不同而变化

## Web 端连接

在 Web 控制面板中：
1. 选择「直接连接」模式
2. 设备地址：`http://<手机IP>:8080`
3. Bearer Token：你设置的 `AAPS_TOKEN`

### 获取手机 IP
```bash
ifconfig wlan0 | grep 'inet '
# 或
ip addr show wlan0 | grep 'inet '
```

## API 端点

| 端点 | 方法 | 请求体 | 说明 |
|------|------|--------|------|
| `/ping` | GET | - | 健康检查 |
| `/bolus` | POST | `{ "insulin": 2.5 }` | 输注胰岛素 |
| `/carbs` | POST | `{ "carbs": 30 }` | 记录碳水 |
| `/treatment` | POST | `{ "insulin": 2.5, "carbs": 30 }` | 混合输注 |
| `/status` | GET | - | 获取设备状态 |
| `/cgm?count=12` | GET | - | 获取 CGM 数据 |
| `/treatments?count=20` | GET | - | 获取治疗历史 |

## 故障排除

### 服务无法启动
```bash
# 检查端口是否被占用
netstat -tlnp | grep 8080

# 查看日志
cat server.log
```

### 命令发送失败
1. 检查 AndroidAPS 是否正在运行
2. 如果使用 SMS 方式，检查 SMS Communicator 是否开启
3. 检查 Termux 是否有短信权限
4. 查看服务器日志：`cat server.log`

### 无法读取数据库
1. 确认手机已 root
2. 确认 Termux 有 root 权限
3. 检查数据库路径是否正确

### Web 端无法连接
1. 确认手机和 Web 端在同一局域网
2. 检查手机 IP 是否正确
3. 检查端口是否被防火墙阻止
4. 在手机上测试：`curl http://localhost:8080/ping`

## 安全建议

1. **务必设置 Bearer Token**：防止未授权访问
2. **限制网络访问**：只在局域网内使用
3. **定期更换 Token**：提高安全性
4. **监控日志**：定期检查 `server.log` 中的异常请求
