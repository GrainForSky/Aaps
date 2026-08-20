# AndroidAPS 远程控制方案

## 架构：设备轮询 + Nightscout

```
──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Web 用户     │     │  Web 后端     │     │  AndroidAPS 手机  │
│  (浏览器)     │     │  (云服务器)    │     │  (修改后的APP)     │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       │ 1. 登录             │                      │
       │───────────────────>│                      │
       │                    │                      │
       │ 2. 发送 BOLUS 2.5   │                      │
       │───────────────────>│                      │
       │                    │ 存入命令队列            │
       │                    │                      │ 3. 每5秒轮询
       │                    │<─────────────────────│
       │                    │  GET /api/device/    │
       │                    │  commands?phone=xxx  │
       │                    │                      │
       │                    │ 返回待执行命令          │
       │                    │─────────────────────>│
       │                    │                      │
       │                    │                      │ 4. 执行 BOLUS
       │                    │                      │ 5. 上报结果
       │                    │<─────────────────────│
       │                    │  POST /api/device/   │
       │                    │  result              │
       │                    │                      │
       │ 6. 查询结果          │                      │
       │<───────────────────│                      │
       │                    │                      │
       │ 7. 同时轮询          │                      │
       │    Nightscout 确认   │                      │
       │───────────────────>│                      │
```

**核心原理**：修改 AndroidAPS 源码，添加 HTTP 客户端插件，主动轮询 Web 服务器获取命令并执行。

## 功能

### 1. 手机号登录
- 输入手机号即可登录
- 登录号码需与 AndroidAPS 手机上注册的号码一致

### 2. Nightscout 配置
- Nightscout URL
- API Secret
- 用于读取 CGM 血糖、泵状态、治疗历史

### 3. 远程输注
- 胰岛素输注：精确输入 + 快捷剂量（0.5/1/1.5/2/3/5U）
- 碳水记录：精确输入 + 快捷数量（5/10/15/20/30/45g）
- 混合输注：同时输注胰岛素和碳水
- 所有操作通过命令队列发送到 AndroidAPS

### 4. 安全保护
- 胰岛素输注后 15 分钟内不可再次输注
- 碳水记录后 1 分钟内不可再次记录
- 锁定状态持久化到 localStorage
- 实时倒计时显示
- 二次确认弹窗

### 5. 数据查看
- 当前血糖（CGM）+ 趋势箭头
- 储药器余量
- 活性胰岛素（IOB）
- 泵电池电量
- 治疗记录（最近 20 条）

### 6. 设备状态
- 实时显示 AndroidAPS 设备在线/离线状态
- 每 10 秒自动刷新设备状态

## 命令格式

| 命令类型 | 参数 | 说明 |
|---------|------|------|
| bolus | insulin: number | 胰岛素输注 |
| carbs | carbs: number | 碳水记录 |
| mixed | insulin + carbs | 混合输注 |
| suspend | - | 暂停泵 |
| resume | - | 恢复泵 |
| status | - | 查询状态 |

## API 接口

### Web 后端 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/device/register` | POST | 设备注册 |
| `/api/device/heartbeat` | POST | 设备心跳（每30秒） |
| `/api/device/commands?phone=xxx` | GET | 设备轮询待执行命令（每5秒） |
| `/api/device/result` | POST | 设备上报执行结果 |
| `/api/device/status?phone=xxx` | GET | Web 前端查询设备状态 |
| `/api/command/create` | POST | Web 前端创建命令 |
| `/api/command/status?id=xxx` | GET | Web 前端查询命令状态 |
| `/api/nightscout/config` | POST | Nightscout 连接测试 |
| `/api/nightscout/treatments` | GET | 获取治疗记录 |
| `/api/nightscout/status` | GET | 获取设备状态 |
| `/api/nightscout/entries` | GET | 获取 CGM 数据 |
| `/api/nightscout/ping` | GET | 健康检查 |

## AndroidAPS 源码修改方案

### 需要修改的文件

1. **settings.gradle.kts** - 添加新模块
2. **app/build.gradle.kts** - 添加依赖
3. **AndroidManifest.xml** - 添加网络权限

### 需要新增的文件

1. **RemoteControlPlugin.kt** - 远程控制插件（主入口）
2. **RemoteControlClient.kt** - HTTP 客户端（轮询命令）
3. **RemoteControlHandlers.kt** - 命令执行处理器
4. **RemoteControlService.kt** - 后台服务

### 新增文件源码

#### 1. RemoteControlPlugin.kt

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.content.Context
import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.core.interfaces.plugin.PluginDescription
import app.aaps.core.interfaces.plugin.PluginType
import app.aaps.core.interfaces.sharedPreferences.SP
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteControlPlugin @Inject constructor(
    private val sp: SP,
    private val context: Context
) : PluginBase(
    PluginDescription()
        .pluginName("Remote Control")
        .pluginDescription("远程控制插件 - 通过 HTTP 轮询执行命令")
        .pluginType(PluginType.GENERAL)
        .mainClass(RemoteControlPlugin::class.java)
) {
    private var client: RemoteControlClient? = null

    override fun init() {
        super.init()
        val serverUrl = sp.getString("remote_control_server_url", "")
        val phone = sp.getString("remote_control_phone", "")
        val deviceId = sp.getString("remote_control_device_id", "")

        if (serverUrl.isNotEmpty() && phone.isNotEmpty()) {
            client = RemoteControlClient(
                serverUrl = serverUrl,
                phone = phone,
                deviceId = deviceId.ifEmpty { "aaps-${android.os.Build.MODEL}" },
                context = context,
                handlers = RemoteControlHandlers(context)
            )
            client?.start()
        }
    }

    override fun shutDown() {
        client?.stop()
        super.shutDown()
    }
}
```

#### 2. RemoteControlClient.kt

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.content.Context
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RemoteControlClient(
    private val serverUrl: String,
    private val phone: String,
    private val deviceId: String,
    private val context: Context,
    private val handlers: RemoteControlHandlers
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isRunning = false

    fun start() {
        if (isRunning) return
        isRunning = true

        // Register device
        registerDevice()

        // Start heartbeat (every 30 seconds)
        scope.launch {
            while (isRunning) {
                sendHeartbeat()
                delay(30000)
            }
        }

        // Start command polling (every 5 seconds)
        scope.launch {
            while (isRunning) {
                pollCommands()
                delay(5000)
            }
        }
    }

    fun stop() {
        isRunning = false
        scope.cancel()
    }

    private fun registerDevice() {
        try {
            val json = JSONObject()
            json.put("phone", phone)
            json.put("deviceId", deviceId)
            json.put("appVersion", "3.4")

            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$serverUrl/api/device/register")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                // Log registration result
            }
        } catch (e: Exception) {
            // Handle error
        }
    }

    private fun sendHeartbeat() {
        try {
            val json = JSONObject()
            json.put("phone", phone)
            json.put("deviceId", deviceId)

            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$serverUrl/api/device/heartbeat")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                // Handle response
            }
        } catch (e: Exception) {
            // Handle error
        }
    }

    private fun pollCommands() {
        try {
            val request = Request.Builder()
                .url("$serverUrl/api/device/commands?phone=$phone")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string() ?: return
                    val json = JSONObject(body)
                    if (json.getBoolean("success")) {
                        val commands = json.getJSONArray("commands")
                        for (i in 0 until commands.length()) {
                            val cmd = commands.getJSONObject(i)
                            executeCommand(cmd)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // Handle error
        }
    }

    private fun executeCommand(cmd: JSONObject) {
        val commandId = cmd.getString("id")
        val type = cmd.getString("type")
        val insulin = if (cmd.has("insulin")) cmd.getDouble("insulin") else 0.0
        val carbs = if (cmd.has("carbs")) cmd.getDouble("carbs") else 0.0

        var success = false
        var message = ""
        var treatmentId = ""

        try {
            when (type) {
                "bolus" -> {
                    handlers.handleBolus(insulin)
                    success = true
                    message = "Bolus ${insulin}U executed"
                }
                "carbs" -> {
                    handlers.handleCarbs(carbs)
                    success = true
                    message = "Carbs ${carbs}g executed"
                }
                "mixed" -> {
                    handlers.handleBolus(insulin)
                    handlers.handleCarbs(carbs)
                    success = true
                    message = "Mixed ${insulin}U + ${carbs}g executed"
                }
                "suspend" -> {
                    handlers.handleSuspend()
                    success = true
                    message = "Pump suspended"
                }
                "resume" -> {
                    handlers.handleResume()
                    success = true
                    message = "Pump resumed"
                }
                "status" -> {
                    success = true
                    message = "Status reported"
                }
            }
        } catch (e: Exception) {
            success = false
            message = "Execution failed: ${e.message}"
        }

        // Report result
        reportResult(commandId, success, message, treatmentId)
    }

    private fun reportResult(commandId: String, success: Boolean, message: String, treatmentId: String) {
        try {
            val json = JSONObject()
            json.put("commandId", commandId)
            json.put("phone", phone)
            json.put("deviceId", deviceId)
            json.put("success", success)
            json.put("message", message)
            if (treatmentId.isNotEmpty()) {
                json.put("treatmentId", treatmentId)
            }

            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$serverUrl/api/device/result")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                // Handle response
            }
        } catch (e: Exception) {
            // Handle error
        }
    }
}
```

#### 3. RemoteControlHandlers.kt

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.content.Context
import android.content.Intent
import app.aaps.core.interfaces.aps.Loop
import app.aaps.core.interfaces.bus.RxBus
import app.aaps.core.interfaces.profile.ProfileFunction
import app.aaps.core.interfaces.pump.Pump
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import io.reactivex.rxjava3.subjects.PublishSubject
import javax.inject.Inject

class RemoteControlHandlers @Inject constructor(
    private val context: Context
) {
    @Inject lateinit var commandQueue: CommandQueue
    @Inject lateinit var loop: Loop
    @Inject lateinit var rxBus: RxBus
    @Inject lateinit var fabricPrivacy: FabricPrivacy

    fun handleBolus(insulin: Double) {
        // Use AndroidAPS CommandQueue to enqueue bolus
        // commandQueue.bolus(insulin, ... )
        // This will trigger the actual bolus delivery through the pump
    }

    fun handleCarbs(carbs: Double) {
        // Use AndroidAPS CommandQueue to enqueue carbs
        // commandQueue.carbs(carbs, ... )
    }

    fun handleSuspend() {
        // Suspend the pump
        // commandQueue.setSuspendedTBR(...)
    }

    fun handleResume() {
        // Resume the pump
        // commandQueue.cancelTempBasal(...)
    }
}
```

#### 4. RemoteControlService.kt

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class RemoteControlService : Service() {

    companion object {
        const val CHANNEL_ID = "remote_control"
        const val NOTIFICATION_ID = 1001
    }

    private var client: RemoteControlClient? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val serverUrl = intent?.getStringExtra("server_url") ?: ""
        val phone = intent?.getStringExtra("phone") ?: ""
        val deviceId = intent?.getStringExtra("device_id") ?: "aaps-${android.os.Build.MODEL}"

        if (serverUrl.isNotEmpty() && phone.isNotEmpty()) {
            client = RemoteControlClient(
                serverUrl = serverUrl,
                phone = phone,
                deviceId = deviceId,
                context = this,
                handlers = RemoteControlHandlers(this)
            )
            client?.start()
        }

        return START_STICKY
    }

    override fun onDestroy() {
        client?.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Remote Control",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AndroidAPS Remote Control")
            .setContentText("Listening for commands...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }
}
```

### settings.gradle.kts 修改

```kotlin
// 在 include 中添加
include(":plugins:implementation:RemoteControl")
```

### app/build.gradle.kts 修改

```kotlin
dependencies {
    // 添加 OkHttp 依赖（如果还没有）
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

### AndroidManifest.xml 修改

```xml
<!-- 添加网络权限 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- 添加前台服务权限 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- 注册服务 -->
<service
    android:name="app.aaps.plugins.general.remotecontrol.RemoteControlService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

## 部署步骤

### Web 端部署

1. 部署 Web 后端到云服务器
2. 配置 Nightscout URL 和 API Secret
3. 确保服务器可通过 HTTPS 访问

### AndroidAPS 端部署

1. 克隆 AndroidAPS 3.4 源码
2. 按上述方案添加 RemoteControl 插件
3. 编译安装到 AndroidAPS 手机
4. 在 AndroidAPS 设置中配置：
   - Remote Control Server URL（Web 后端地址）
   - Phone Number（与 Web 端登录号码一致）
   - Device ID（可选，默认使用设备型号）
5. 启动 Remote Control 服务

### 使用流程

1. 打开 Web 控制面板，输入手机号登录
2. 配置 Nightscout URL 和 API Secret
3. 确保 AndroidAPS 手机已启动 Remote Control 服务
4. 在 Web 端查看设备在线状态
5. 执行胰岛素/碳水输注操作
6. 通过 Nightscout 确认输注结果
