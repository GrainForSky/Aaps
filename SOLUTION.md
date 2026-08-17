# AndroidAPS 3.4 源码修改方案 - 内置 HTTP API 远程输注

## 概述

本方案通过修改 AndroidAPS 3.4 源码，在应用内部集成 HTTP API 服务，实现 Web 端远程输注胰岛素和碳水，同步返回输注结果（最长等待 120 秒）。

---

## 一、AndroidAPS 3.4 源码结构分析

### 1.1 项目结构（关键模块）

```
AndroidAPS/
├── app/                                    # 主应用模块
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml             # [需修改] 添加 HTTP 服务声明
│       └── kotlin/app/aaps/
│           └── MainActivity.kt
├── core/
│   ├── interfaces/                         # 核心接口定义
│   │   └── src/main/kotlin/app/aaps/core/interfaces/
│   │       ├── plugin/PluginBase.kt        # 插件基类接口
│   │       ├── pump/Pump.kt               # 泵接口（bolus/carbs 方法）
│   │       ├── queue/CommandQueue.kt       # 命令队列接口
│   │       ├── queue/Command.kt            # 命令类型定义
│   │       ├── nsclient/NSClient.kt        # NS 客户端接口
│   │       └── logging/AAPSLogger.kt       # 日志接口
│   ├── implementations/                    # 核心实现
│   │   └── src/main/kotlin/app/aaps/core/implementations/
│   │       └── queue/CommandQueueImplementation.kt  # [需参考] 命令队列实现
│   └── utils/                              # 工具类
├── plugins/
│   ├── sync/
│   │   └── nsclient/                       # NS 客户端插件（参考其插件结构）
│   │       ├── build.gradle.kts            # [参考] 插件模块配置
│   │       └── src/main/kotlin/.../NSClientPlugin.kt
│   └── main/
│       └── overview/                       # 概览页面（参考 bolus 触发流程）
│           └── src/main/kotlin/.../OverviewFragment.kt
├── pump/                                   # 泵驱动模块
│   ├── dana/                               # Dana 泵驱动
│   │   └── src/main/kotlin/.../DanaPump.kt # [需参考] 泵驱动实现
│   ├── omnipod-eop/                        # Omnipod 泵驱动
│   └── medtronic/                          # Medtronic 泵驱动
├── settings.gradle.kts                     # [需修改] 注册新模块
└── build.gradle.kts                        # 根构建配置
```

### 1.2 胰岛素输注流程（关键调用链）

```
UI 触发 → OverviewFragment.doBolus()
    → CommandQueue.bolus(amount, callback, ...)
        → CommandQueueImplementation 加入队列
            → PumpDriver（如 DanaPump）执行输注
                → 物理泵执行
                    → 结果回调 → BolusCallback
                        → UI 更新 + 记录到数据库
```

---

## 二、需要修改/新增的文件清单

### 2.1 新增文件（HTTP API 插件模块）

| 文件路径 | 说明 |
|---------|------|
| `plugins/control/httpapi/build.gradle.kts` | 模块构建配置 |
| `plugins/control/httpapi/src/main/AndroidManifest.xml` | 模块清单 |
| `plugins/control/httpapi/src/main/kotlin/.../HttpApiPlugin.kt` | 插件主类 |
| `plugins/control/httpapi/src/main/kotlin/.../HttpApiServer.kt` | HTTP 服务器 |
| `plugins/control/httpapi/src/main/kotlin/.../HttpApiService.kt` | 前台服务 |
| `plugins/control/httpapi/src/main/kotlin/.../HttpApiHandlers.kt` | API 路由处理 |
| `plugins/control/httpapi/src/main/kotlin/.../BolusResultWaiter.kt` | 同步等待结果 |
| `plugins/control/httpapi/src/main/kotlin/.../PhoneAuthManager.kt` | 手机号认证 |

### 2.2 需要修改的现有文件

| 文件路径 | 修改内容 |
|---------|---------|
| `settings.gradle.kts` | 添加 `include(":plugins:control:httpapi")` |
| `app/build.gradle.kts` | 添加 `implementation(project(":plugins:control:httpapi"))` |
| `app/src/main/AndroidManifest.xml` | 添加 HttpApiService 声明和网络权限 |
| `core/interfaces/.../queue/CommandQueue.kt` | 添加 `bolusSync()` 同步方法接口（可选） |

---

## 三、详细代码实现

### 3.1 settings.gradle.kts（修改）

```kotlin
// 在文件末尾 include 区域添加：
include(":plugins:control:httpapi")
```

### 3.2 app/build.gradle.kts（修改）

```kotlin
dependencies {
    // ... 现有依赖 ...
    
    // 新增：HTTP API 插件
    implementation(project(":plugins:control:httpapi"))
}
```

### 3.3 app/src/main/AndroidManifest.xml（修改）

```xml
<!-- 在 <application> 标签内添加 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<service
    android:name="app.aaps.plugins.control.httpapi.HttpApiService"
    android:exported="false"
    android:foregroundServiceType="connectedDevice" />
```

### 3.4 plugins/control/httpapi/build.gradle.kts（新增）

```kotlin
plugins {
    id("com.android.library")
    id("kotlin-android")
}

android {
    namespace = "app.aaps.plugins.control.httpapi"
    compileSdk = 34
    
    defaultConfig {
        minSdk = 28
        targetSdk = 34
    }
}

dependencies {
    implementation(project(":core:interfaces"))
    implementation(project(":core:utils"))
    implementation(project(":core:implementations"))
    
    // NanoHTTPD - 轻量级 HTTP 服务器
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    
    // JSON 处理
    implementation("org.json:json:20231013")
    
    // 协程
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

### 3.5 HttpApiPlugin.kt（新增）

```kotlin
package app.aaps.plugins.control.httpapi

import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.core.interfaces.plugin.PluginDescription
import app.aaps.core.interfaces.plugin.PluginType
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.sharedPreferences.SP
import android.content.Context
import android.content.Intent

class HttpApiPlugin(
    private val aapsLogger: AAPSLogger,
    private val sp: SP,
    private val context: Context,
) : PluginBase {

    override val pluginDescription: PluginDescription = PluginDescription(
        pluginType = PluginType.GENERAL,
        module = app.aaps.core.interfaces.R.string.aaps,
        pluginName = app.aaps.core.interfaces.R.string.http_api_plugin_name,
        shortName = app.aaps.core.interfaces.R.string.http_api_plugin_name_short,
        preferencesId = R.xml.pref_httpapi,
        description = R.string.http_api_description
    )

    private var server: HttpApiServer? = null

    fun isEnabled(): Boolean = sp.getBoolean(R.string.key_httpapi_enabled, false)
    fun getPort(): Int = sp.getInt(R.string.key_httpapi_port, 8080)
    fun getToken(): String = sp.getString(R.string.key_httpapi_token, "")
    fun getAuthorizedPhones(): Set<String> = sp.getStringSet(R.string.key_httpapi_phones, emptySet())

    fun startServer() {
        if (server != null) return
        val port = getPort()
        server = HttpApiServer(port, aapsLogger, this, context)
        server?.start()
        aapsLogger.info(LTag.HTTPAPI, "HTTP API server started on port $port")
    }

    fun stopServer() {
        server?.stop()
        server = null
        aapsLogger.info(LTag.HTTPAPI, "HTTP API server stopped")
    }
}
```

### 3.6 HttpApiServer.kt（新增 - 核心 HTTP 服务器）

```kotlin
package app.aaps.plugins.control.httpapi

import android.content.Context
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.pump.Pump
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.queue.Callback
import app.aaps.core.interfaces.queue.Command
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.Response
import kotlinx.coroutines.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject

class HttpApiServer(
    private val port: Int,
    private val aapsLogger: AAPSLogger,
    private val plugin: HttpApiPlugin,
    private val context: Context,
) : NanoHTTPD(port) {

    companion object {
        const val MAX_WAIT_SECONDS = 120L
        const val MAX_BOLUS = 25.0
        const val MAX_CARBS = 250.0
    }

    // 通过 AndroidAPS 的依赖注入获取
    private val commandQueue: CommandQueue = ... // 从 MainApp 获取
    private val pump: Pump = ... // 从 MainApp 获取
    private val phoneAuth = PhoneAuthManager(plugin)

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: return jsonResponse(Response.Status.NOT_FOUND, """{"error":"Not found"}""")
        
        // 认证检查（/auth 端点除外）
        if (uri != "/auth") {
            val authResult = phoneAuth.authenticate(session)
            if (!authResult.authorized) {
                return jsonResponse(Response.Status.UNAUTHORIZED, """{"error":"${authResult.message}"}""")
            }
        }

        return try {
            when {
                uri == "/auth" && session.method == Method.POST -> handleAuth(session)
                uri == "/bolus" && session.method == Method.POST -> handleBolus(session)
                uri == "/carbs" && session.method == Method.POST -> handleCarbs(session)
                uri == "/treatment" && session.method == Method.POST -> handleTreatment(session)
                uri == "/status" && session.method == Method.GET -> handleStatus()
                uri == "/cgm" && session.method == Method.GET -> handleCGM(session)
                uri == "/treatments" && session.method == Method.GET -> handleTreatments(session)
                uri == "/ping" && session.method == Method.GET -> handlePing()
                else -> jsonResponse(Response.Status.NOT_FOUND, """{"error":"Unknown endpoint"}""")
            }
        } catch (e: Exception) {
            aapsLogger.error(LTag.HTTPAPI, "Error handling $uri: ${e.message}")
            jsonResponse(Response.Status.INTERNAL_ERROR, """{"error":"${e.message}"}""")
        }
    }

    /**
     * 手机号登录认证
     */
    private fun handleAuth(session: IHTTPSession): Response {
        val body = parseBody(session)
        val phone = body.optString("phone", "")
        
        if (phone.isBlank()) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"手机号不能为空"}""")
        }

        val token = phoneAuth.generateToken(phone)
        return jsonResponse(Response.Status.OK, """
            {"success":true,"data":{"token":"$token","phone":"$phone","expiresIn":86400}}
        """.trimIndent())
    }

    /**
     * 胰岛素输注 - 同步等待结果（最长120秒）
     */
    private fun handleBolus(session: IHTTPSession): Response {
        val body = parseBody(session)
        val amount = body.optDouble("insulin", -1.0)
        val phoneNumber = body.optString("phone", "")

        if (amount <= 0) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"胰岛素剂量必须大于0"}""")
        }
        if (amount > MAX_BOLUS) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"单次最大剂量为${MAX_BOLUS}U"}""")
        }

        aapsLogger.info(LTag.HTTPAPI, "Bolus request: ${amount}U from $phoneNumber")

        // 使用 CountDownLatch 同步等待泵执行结果
        val latch = CountDownLatch(1)
        var resultSuccess = false
        var resultAmount = 0.0
        var resultComment = ""

        // 在 UI 线程执行 bolus 命令
        runBlocking {
            withContext(Dispatchers.Main) {
                commandQueue.bolus(amount, object : Callback() {
                    override fun run() {
                        resultSuccess = this.result.success
                        resultAmount = this.result.sentBolusAmount
                        resultComment = this.result.comment ?: ""
                        latch.countDown()
                    }
                })
            }
        }

        // 等待结果，最长 120 秒
        val completed = latch.await(MAX_WAIT_SECONDS, TimeUnit.SECONDS)

        if (!completed) {
            return jsonResponse(Response.Status.GATEWAY_TIMEOUT, """
                {"success":false,"error":"输注超时（${MAX_WAIT_SECONDS}秒无响应）","timeout":true}
            """.trimIndent())
        }

        val resultJson = JSONObject().apply {
            put("success", resultSuccess)
            put("requestedAmount", amount)
            put("deliveredAmount", resultAmount)
            put("comment", resultComment)
            put("timestamp", System.currentTimeMillis())
            put("phone", phoneNumber)
        }

        val status = if (resultSuccess) Response.Status.OK else Response.Status.INTERNAL_ERROR
        return jsonResponse(status, """{"success":${resultSuccess},"data":$resultJson}""")
    }

    /**
     * 碳水记录 - 同步等待结果
     */
    private fun handleCarbs(session: IHTTPSession): Response {
        val body = parseBody(session)
        val carbs = body.optInt("carbs", -1)
        val phoneNumber = body.optString("phone", "")

        if (carbs <= 0) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"碳水值必须大于0"}""")
        }
        if (carbs > MAX_CARBS) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"单次最大碳水为${MAX_CARBS}g"}""")
        }

        aapsLogger.info(LTag.HTTPAPI, "Carbs request: ${carbs}g from $phoneNumber")

        val latch = CountDownLatch(1)
        var resultSuccess = false
        var resultComment = ""

        runBlocking {
            withContext(Dispatchers.Main) {
                commandQueue.carbs(carbs, object : Callback() {
                    override fun run() {
                        resultSuccess = this.result.success
                        resultComment = this.result.comment ?: ""
                        latch.countDown()
                    }
                })
            }
        }

        val completed = latch.await(MAX_WAIT_SECONDS, TimeUnit.SECONDS)
        if (!completed) {
            return jsonResponse(Response.Status.GATEWAY_TIMEOUT, """
                {"success":false,"error":"碳水记录超时","timeout":true}
            """.trimIndent())
        }

        return jsonResponse(Response.Status.OK, """
            {"success":$resultSuccess,"data":{"carbs":$carbs,"comment":"$resultComment","timestamp":${System.currentTimeMillis()}}}
        """.trimIndent())
    }

    /**
     * 混合输注（胰岛素 + 碳水）
     */
    private fun handleTreatment(session: IHTTPSession): Response {
        val body = parseBody(session)
        val insulin = body.optDouble("insulin", 0.0)
        val carbs = body.optInt("carbs", 0)
        val notes = body.optString("notes", "")
        val phoneNumber = body.optString("phone", "")

        if (insulin <= 0 && carbs <= 0) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"胰岛素和碳水不能同时为0"}""")
        }

        val results = JSONObject()
        
        // 先执行碳水
        if (carbs > 0) {
            val carbsLatch = CountDownLatch(1)
            var carbsSuccess = false
            runBlocking {
                withContext(Dispatchers.Main) {
                    commandQueue.carbs(carbs, object : Callback() {
                        override fun run() {
                            carbsSuccess = this.result.success
                            carbsLatch.countDown()
                        }
                    })
                }
            }
            carbsLatch.await(MAX_WAIT_SECONDS, TimeUnit.SECONDS)
            results.put("carbs", JSONObject().apply {
                put("success", carbsSuccess)
                put("amount", carbs)
            })
        }

        // 再执行胰岛素
        if (insulin > 0) {
            val bolusLatch = CountDownLatch(1)
            var bolusSuccess = false
            var bolusAmount = 0.0
            runBlocking {
                withContext(Dispatchers.Main) {
                    commandQueue.bolus(insulin, object : Callback() {
                        override fun run() {
                            bolusSuccess = this.result.success
                            bolusAmount = this.result.sentBolusAmount
                            bolusLatch.countDown()
                        }
                    })
                }
            }
            bolusLatch.await(MAX_WAIT_SECONDS, TimeUnit.SECONDS)
            results.put("insulin", JSONObject().apply {
                put("success", bolusSuccess)
                put("requestedAmount", insulin)
                put("deliveredAmount", bolusAmount)
            })
        }

        return jsonResponse(Response.Status.OK, """{"success":true,"data":$results}""")
    }

    /**
     * 获取泵状态
     */
    private fun handleStatus(): Response {
        val status = JSONObject().apply {
            put("reservoir", pump.reservoirLevel)
            put("battery", pump.batteryLevel)
            put("isSuspended", pump.isSuspended)
            put("isBolusInProgress", pump.isBolusInProgress)
            put("pumpType", pump.pumpDescription.pumpType)
        }
        return jsonResponse(Response.Status.OK, """{"success":true,"data":$status}""")
    }

    /**
     * 获取 CGM 数据（从 Nightscout 或本地数据库）
     */
    private fun handleCGM(session: IHTTPSession): Response {
        val params = session.parameters
        val count = (params["count"]?.firstOrNull() ?: "12").toInt()
        // 从 iobCobCalculator 或数据库获取 CGM 数据
        // ... 实现略，参考 NSClient 插件的数据获取方式
        return jsonResponse(Response.Status.OK, """{"success":true,"data":[]}""")
    }

    /**
     * 获取治疗历史
     */
    private fun handleTreatments(session: IHTTPSession): Response {
        val params = session.parameters
        val count = (params["count"]?.firstOrNull() ?: "20").toInt()
        // 从数据库获取治疗记录
        // ... 实现略
        return jsonResponse(Response.Status.OK, """{"success":true,"data":[]}""")
    }

    private fun handlePing(): Response {
        return jsonResponse(Response.Status.OK, """{"success":true,"data":{"status":"ok","service":"AndroidAPS HTTP API","version":"3.4"}}""")
    }

    private fun parseBody(session: IHTTPSession): JSONObject {
        val files = HashMap<String, String>()
        session.parseBody(files)
        val bodyStr = files["postData"] ?: "{}"
        return JSONObject(bodyStr)
    }

    private fun jsonResponse(status: Response.Status, json: String): Response {
        return newFixedLengthResponse(status, "application/json", json)
    }
}
```

### 3.7 BolusResultWaiter.kt（新增 - 同步等待机制）

```kotlin
package app.aaps.plugins.control.httpapi

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * 同步等待泵输注结果的机制
 * 使用 CountDownLatch 阻塞当前线程，直到收到结果或超时
 */
class BolusResultWaiter(private val timeoutSeconds: Long = 120) {

    data class BolusResult(
        val success: Boolean,
        val deliveredAmount: Double,
        val comment: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    private val latch = CountDownLatch(1)
    private var result: BolusResult? = null

    fun onResult(success: Boolean, deliveredAmount: Double, comment: String) {
        result = BolusResult(success, deliveredAmount, comment)
        latch.countDown()
    }

    /**
     * 阻塞等待结果
     * @return BolusResult 或 null（超时）
     */
    fun awaitResult(): BolusResult? {
        latch.await(timeoutSeconds, TimeUnit.SECONDS)
        return result
    }
}
```

### 3.8 PhoneAuthManager.kt（新增 - 手机号认证）

```kotlin
package app.aaps.plugins.control.httpapi

import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

class PhoneAuthManager(private val plugin: HttpApiPlugin) {

    data class AuthResult(val authorized: Boolean, val message: String, val phone: String = "")

    // Token -> Phone 映射（内存缓存）
    private val tokenMap = ConcurrentHashMap<String, TokenEntry>()

    data class TokenEntry(val phone: String, val expiresAt: Long)

    /**
     * 生成认证 Token
     * 简单实现：基于手机号 + 密钥生成 token
     * 生产环境建议使用 JWT 或接入短信验证码
     */
    fun generateToken(phone: String): String {
        val secret = plugin.getToken().ifBlank { "aaps-default-secret" }
        val raw = "$phone:$secret:${System.currentTimeMillis() / 86400000}"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
        
        // 存储 token，24小时过期
        tokenMap[token] = TokenEntry(phone, System.currentTimeMillis() + 86400000)
        return token
    }

    /**
     * 验证请求认证
     */
    fun authenticate(session: NanoHTTPD.IHTTPSession): AuthResult {
        val authHeader = session.headers["authorization"] ?: session.headers["x-auth-token"]
        
        if (authHeader.isNullOrBlank()) {
            return AuthResult(false, "缺少认证信息")
        }

        val token = authHeader.removePrefix("Bearer ").trim()
        val entry = tokenMap[token]
        
        if (entry == null) {
            return AuthResult(false, "无效的认证 Token")
        }

        if (entry.expiresAt < System.currentTimeMillis()) {
            tokenMap.remove(token)
            return AuthResult(false, "Token 已过期，请重新登录")
        }

        return AuthResult(true, "认证成功", entry.phone)
    }
}
```

### 3.9 HttpApiService.kt（新增 - 前台服务）

```kotlin
package app.aaps.plugins.control.httpapi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class HttpApiService : Service() {

    private var server: HttpApiServer? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val port = intent?.getIntExtra("port", 8080) ?: 8080
        // 启动 HTTP 服务器
        // ... 从 MainApp 获取依赖并启动
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AAPS HTTP API",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AAPS HTTP API 运行中")
            .setContentText("远程 API 服务已启动")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "aaps_httpapi"
        const val NOTIFICATION_ID = 10086
    }
}
```

---

## 四、关键修改说明

### 4.1 同步等待输注结果的实现原理

AndroidAPS 的 `CommandQueue.bolus()` 是异步的，通过 Callback 返回结果。
我们的方案使用 `CountDownLatch` 将异步转为同步：

```kotlin
// 1. 创建 CountDownLatch
val latch = CountDownLatch(1)

// 2. 在 UI 线程调用 bolus，传入 Callback
commandQueue.bolus(amount, object : Callback() {
    override fun run() {
        // 3. 泵执行完成后，Callback 被调用
        result = this.result
        latch.countDown()  // 释放锁
    }
})

// 4. 当前线程阻塞等待，最长 120 秒
latch.await(120, TimeUnit.SECONDS)

// 5. 返回结果给 HTTP 客户端
```

### 4.2 CommandQueue 关键接口（参考）

在 AndroidAPS 3.4 中，`CommandQueue` 接口定义了以下关键方法：

```kotlin
// core/interfaces/src/main/kotlin/app/aaps/core/interfaces/queue/CommandQueue.kt
interface CommandQueue {
    fun bolus(amount: Double, callback: Callback?, type: CommandType = CommandType.NORMAL_BOLUS)
    fun carbs(amount: Int, callback: Callback?)
    // ...
}
```

`Callback` 的 `result` 属性包含：
```kotlin
class CommandResult {
    var success: Boolean = false
    var sentBolusAmount: Double = 0.0
    var comment: String? = null
    // ...
}
```

### 4.3 依赖注入方式

在 AndroidAPS 3.4 中，获取 `CommandQueue` 和 `Pump` 的方式：

```kotlin
// 方式1：通过 MainApp（推荐）
val mainApp = context.applicationContext as MainApp
val commandQueue = mainApp.commandQueue
val pump = mainApp.pump

// 方式2：通过 Dagger 依赖注入（如果插件使用 DI）
@Inject lateinit var commandQueue: CommandQueue
@Inject lateinit var pump: Pump
```

---

## 五、编译和部署

### 5.1 编译步骤

```bash
# 1. 克隆 AndroidAPS 3.4 源码
git clone https://github.com/AndroidAPS/AndroidAPS.git
cd AndroidAPS
git checkout 3.4  # 或对应的 tag

# 2. 将上述新增文件放入对应目录
# 3. 修改 settings.gradle.kts、app/build.gradle.kts、AndroidManifest.xml
# 4. 编译
./gradlew assembleFullDebug  # 或 assembleFullRelease
```

### 5.2 安装到手机

```bash
adb install app/build/outputs/apk/full/debug/app-full-debug.apk
```

### 5.3 启用 HTTP API

1. 打开 AndroidAPS → 配置构建器（Config Builder）
2. 找到 "HTTP API" 插件，启用它
3. 进入 HTTP API 设置：
   - 开启 HTTP API 服务
   - 设置端口（默认 8080）
   - 设置认证密钥（Token）
4. 确保手机和 Web 端在同一网络（或通过端口转发/内网穿透可达）

---

## 六、安全注意事项

1. **认证**：所有 API 请求必须携带 Bearer Token
2. **剂量限制**：服务端硬限制最大 25U 胰岛素 / 250g 碳水
3. **网络隔离**：建议仅在局域网内使用，或通过 VPN/SSH 隧道访问
4. **日志审计**：所有远程命令记录到 AAPS 日志，含手机号和时间戳
5. **HTTPS**：生产环境建议添加 TLS 支持（可使用 NanoHTTPD 的 HTTPS 模式）
