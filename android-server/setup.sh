#!/bin/bash
# ============================================================
# AndroidAPS Remote Server - 一键安装脚本
# 在 Termux 中运行此脚本完成安装
# ============================================================

set -e

echo "============================================================"
echo "AndroidAPS Remote Server - 安装脚本"
echo "============================================================"
echo ""

# 检查是否在 Termux 中运行
if [ ! -d "$PREFIX" ]; then
    echo "错误: 此脚本需要在 Termux 中运行"
    echo "请从 Google Play 或 F-Droid 安装 Termux"
    exit 1
fi

echo "[1/5] 更新软件包..."
pkg update -y -q

echo "[2/5] 安装 Node.js..."
pkg install -y -q nodejs

echo "[3/5] 安装 Termux:API (用于 SMS 功能)..."
pkg install -y -q termux-api

echo "[4/5] 安装依赖..."
npm install --production

echo "[5/5] 配置环境变量..."

# 创建配置文件
CONFIG_FILE=".env"
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << 'EOF'
# AndroidAPS Remote Server 配置

# 服务端口 (默认 8080)
AAPS_PORT=8080

# Bearer Token 认证 (留空则不启用认证)
# 建议设置一个安全的 token，Web 端连接时需要填写
AAPS_TOKEN=

# 是否使用 SMS 方式发送命令 (true/false)
# 启用后需要 AndroidAPS 开启 SMS Communicator
AAPS_USE_SMS=false

# SMS 命令发送到的号码 (本机号码，用于 SMS 方式)
AAPS_SMS_NUMBER=
EOF
    echo "  已创建配置文件: $CONFIG_FILE"
    echo "  请编辑配置文件设置你的参数"
else
    echo "  配置文件已存在，跳过"
fi

echo ""
echo "============================================================"
echo "安装完成!"
echo "============================================================"
echo ""
echo "下一步:"
echo "  1. 编辑配置文件: nano .env"
echo "     - 设置 AAPS_TOKEN (建议设置，用于安全认证)"
echo "     - 如果使用 SMS 方式，设置 AAPS_USE_SMS=true 和 AAPS_SMS_NUMBER"
echo ""
echo "  2. 启动服务: npm start"
echo "     或后台运行: nohup npm start > server.log 2>&1 &"
echo ""
echo "  3. 在 Web 控制面板中配置:"
echo "     - 选择 '直接连接' 模式"
echo "     - 设备地址: http://<手机IP>:8080"
echo "     - Bearer Token: 你设置的 AAPS_TOKEN"
echo ""
echo "  4. 查看手机 IP: ifconfig wlan0 | grep 'inet '"
echo ""
echo "============================================================"
echo "权限设置 (重要!)"
echo "============================================================"
echo ""
echo "  1. 打开 Android 设置 -> 应用 -> Termux -> 权限"
echo "     - 授予 '短信' 权限 (如果使用 SMS 方式)"
echo "     - 授予 '存储' 权限 (如果需要读取数据库)"
echo ""
echo "  2. 如果使用 SMS 方式:"
echo "     - 打开 AndroidAPS -> 配置 -> SMS Communicator"
echo "     - 启用 SMS Communicator"
echo "     - 添加允许的号码 (本机号码)"
echo ""
echo "  3. 如果使用数据库读取方式 (需要 root):"
echo "     - 确保手机已 root"
echo "     - 授予 Termux root 权限: su"
echo ""
echo "============================================================"
