package com.aaps.remote.api

import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.aaps.remote.aaps.AAPSController
import com.aaps.remote.aaps.CommandResult
import com.aaps.remote.util.TokenAuth
import com.aaps.remote.model.CommandType
import java.io.IOException

/**
 * HTTP API Server for AndroidAPS Remote Control
 * 
 * Endpoints:
 * - POST /bolus       - Deliver insulin bolus
 * - POST /carbs       - Record carbs
 * - POST /treatment   - Combined treatment (insulin + carbs)
 * - GET  /status      - Get pump/loop status
 * - GET  /cgm         - Get CGM readings
 * - GET  /treatments  - Get treatment history
 * - GET  /ping        - Health check
 * - GET  /result/:id  - Get command execution result
 */
class RemoteAPIServer(
    private val context: Context,
    private val port: Int = 8080,
    private val authToken: String?
) : NanoHTTPD(port) {

    private val aapsController = AAPSController(context)
    private val tokenAuth = TokenAuth(authToken)
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Store recent command results for confirmation
    private val commandResults = mutableMapOf<String, CommandResult>()
    private val maxResults = 100

    init {
        start(SOCKET_READ_TIMEOUT, false)
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        
        // Log request
        log("Request: $method $uri")

        // Health check - no auth required
        if (uri == "/ping" && method == Method.GET) {
            return jsonResponse(200, """{"status":"ok","service":"AAPS Remote API","version":"1.0.0"}""")
        }

        // Authenticate all other requests
        if (!tokenAuth.authenticate(session)) {
            return jsonResponse(401, """{"error":"Unauthorized","message":"Invalid or missing auth token"}""")
        }

        return try {
            when {
                // Command endpoints
                uri == "/bolus" && method == Method.POST -> handleBolus(session)
                uri == "/carbs" && method == Method.POST -> handleCarbs(session)
                uri == "/treatment" && method == Method.POST -> handleTreatment(session)
                
                // Data endpoints
                uri == "/status" && method == Method.GET -> handleStatus()
                uri == "/cgm" && method == Method.GET -> handleCGM(session)
                uri == "/treatments" && method == Method.GET -> handleTreatments(session)
                uri.startsWith("/result/") && method == Method.GET -> handleResult(uri)
                
                else -> jsonResponse(404, """{"error":"Not Found","message":"Endpoint not found"}""")
            }
        } catch (e: Exception) {
            log("Error handling request: ${e.message}")
            jsonResponse(500, """{"error":"Internal Error","message":"${e.message?.replace("\"", "'")}"}""")
        }
    }

    /**
     * Handle insulin bolus command
     * POST /bolus
     * Body: { "insulin": 2.5, "id": "optional-request-id" }
     */
    private fun handleBolus(session: IHTTPSession): Response {
        val body = parseBody(session)
        val insulin = body.optDouble("insulin", -1.0)
        val requestId = body.optString("id", generateRequestId())

        // Validate
        if (insulin <= 0) {
            return jsonResponse(400, """{"error":"Invalid Parameter","message":"insulin must be > 0"}""")
        }
        if (insulin > 25.0) {
            return jsonResponse(400, """{"error":"Safety Limit","message":"Maximum single bolus is 25U"}""")
        }

        // Execute command asynchronously
        val result = CommandResult(requestId, CommandType.BOLUS, insulin)
        commandResults[requestId] = result
        trimResults()

        executeCommandAsync(requestId) {
            aapsController.deliverBolus(insulin) { success, message, actualDelivered ->
                result.complete(success, message, actualDelivered)
            }
        }

        return jsonResponse(202, JSONObject().apply {
            put("status", "accepted")
            put("requestId", requestId)
            put("type", "bolus")
            put("insulin", insulin)
            put("message", "Command queued for execution")
            put("resultUrl", "/result/$requestId")
        }.toString())
    }

    /**
     * Handle carbs command
     * POST /carbs
     * Body: { "carbs": 30, "id": "optional-request-id" }
     */
    private fun handleCarbs(session: IHTTPSession): Response {
        val body = parseBody(session)
        val carbs = body.optInt("carbs", -1)
        val requestId = body.optString("id", generateRequestId())

        if (carbs <= 0) {
            return jsonResponse(400, """{"error":"Invalid Parameter","message":"carbs must be > 0"}""")
        }
        if (carbs > 250) {
            return jsonResponse(400, """{"error":"Safety Limit","message":"Maximum single carbs entry is 250g"}""")
        }

        val result = CommandResult(requestId, CommandType.CARBS, carbs.toDouble())
        commandResults[requestId] = result
        trimResults()

        executeCommandAsync(requestId) {
            aapsController.recordCarbs(carbs) { success, message ->
                result.complete(success, message, carbs.toDouble())
            }
        }

        return jsonResponse(202, JSONObject().apply {
            put("status", "accepted")
            put("requestId", requestId)
            put("type", "carbs")
            put("carbs", carbs)
            put("message", "Command queued for execution")
            put("resultUrl", "/result/$requestId")
        }.toString())
    }

    /**
     * Handle combined treatment
     * POST /treatment
     * Body: { "insulin": 2.5, "carbs": 30, "notes": "optional" }
     */
    private fun handleTreatment(session: IHTTPSession): Response {
        val body = parseBody(session)
        val insulin = body.optDouble("insulin", 0.0)
        val carbs = body.optInt("carbs", 0)
        val notes = body.optString("notes", "")
        val requestId = body.optString("id", generateRequestId())

        if (insulin <= 0 && carbs <= 0) {
            return jsonResponse(400, """{"error":"Invalid Parameter","message":"At least one of insulin or carbs must be > 0"}""")
        }
        if (insulin > 25.0) {
            return jsonResponse(400, """{"error":"Safety Limit","message":"Maximum single bolus is 25U"}""")
        }
        if (carbs > 250) {
            return jsonResponse(400, """{"error":"Safety Limit","message":"Maximum single carbs entry is 250g"}""")
        }

        val result = CommandResult(requestId, CommandType.TREATMENT, insulin + carbs)
        commandResults[requestId] = result
        trimResults()

        executeCommandAsync(requestId) {
            aapsController.deliverTreatment(insulin, carbs, notes) { success, message, actualDelivered ->
                result.complete(success, message, actualDelivered)
            }
        }

        return jsonResponse(202, JSONObject().apply {
            put("status", "accepted")
            put("requestId", requestId)
            put("type", "treatment")
            put("insulin", insulin)
            put("carbs", carbs)
            put("message", "Command queued for execution")
            put("resultUrl", "/result/$requestId")
        }.toString())
    }

    /**
     * Get pump/loop status
     * GET /status
     */
    private fun handleStatus(): Response {
        val status = aapsController.getStatus()
        return jsonResponse(200, JSONObject().apply {
            put("status", "ok")
            put("pump", JSONObject().apply {
                put("connected", status.pumpConnected)
                put("battery", status.pumpBattery)
                put("reservoir", status.reservoirRemaining)
                put("state", status.pumpState)
            })
            put("loop", JSONObject().apply {
                put("active", status.loopActive)
                put("lastRun", status.lastLoopRun)
                put("status", status.loopStatus)
            })
            put("iob", status.iob)
            put("currentBasal", status.currentBasal)
            put("timestamp", System.currentTimeMillis())
        }.toString())
    }

    /**
     * Get CGM readings
     * GET /cgm?count=12
     */
    private fun handleCGM(session: IHTTPSession): Response {
        val params = session.parameters
        val count = params["count"]?.firstOrNull()?.toIntOrNull() ?: 12
        val entries = aapsController.getCGMEntries(count)
        
        return jsonResponse(200, JSONObject().apply {
            put("status", "ok")
            put("count", entries.size)
            put("entries", entries.map { entry ->
                JSONObject().apply {
                    put("sgv", entry.sgv)
                    put("trend", entry.trend)
                    put("direction", entry.direction)
                    put("timestamp", entry.timestamp)
                    put("device", entry.device)
                }
            })
        }.toString())
    }

    /**
     * Get treatment history
     * GET /treatments?count=20
     */
    private fun handleTreatments(session: IHTTPSession): Response {
        val params = session.parameters
        val count = params["count"]?.firstOrNull()?.toIntOrNull() ?: 20
        val treatments = aapsController.getTreatments(count)
        
        return jsonResponse(200, JSONObject().apply {
            put("status", "ok")
            put("count", treatments.size)
            put("treatments", treatments.map { t ->
                JSONObject().apply {
                    put("id", t.id)
                    put("type", t.type)
                    put("insulin", t.insulin)
                    put("carbs", t.carbs)
                    put("timestamp", t.timestamp)
                    put("notes", t.notes)
                }
            })
        }.toString())
    }

    /**
     * Get command execution result
     * GET /result/:id
     */
    private fun handleResult(uri: String): Response {
        val requestId = uri.removePrefix("/result/")
        val result = commandResults[requestId]
        
        if (result == null) {
            return jsonResponse(404, """{"error":"Not Found","message":"Request ID not found"}""")
        }

        return jsonResponse(200, JSONObject().apply {
            put("requestId", result.requestId)
            put("type", result.type.name.lowercase())
            put("status", result.status.name.lowercase())
            put("requestedAmount", result.requestedAmount)
            put("deliveredAmount", result.deliveredAmount)
            put("success", result.success)
            put("message", result.message ?: "")
            put("createdAt", result.createdAt)
            result.completedAt?.let { put("completedAt", it) }
        }.toString())
    }

    // --- Helper methods ---

    private fun parseBody(session: IHTTPSession): JSONObject {
        val bodyMap = HashMap<String, String>()
        session.parseBody(bodyMap)
        val bodyString = bodyMap["postData"] ?: "{}"
        return try {
            JSONObject(bodyString)
        } catch (e: Exception) {
            JSONObject()
        }
    }

    private fun jsonResponse(status: Int, json: String): Response {
        return newFixedLengthResponse(status, "application/json", json)
    }

    private fun executeCommandAsync(requestId: String, command: () -> Unit) {
        mainHandler.post {
            try {
                command()
            } catch (e: Exception) {
                commandResults[requestId]?.complete(false, "Execution error: ${e.message}", 0.0)
            }
        }
    }

    private fun generateRequestId(): String {
        return "req_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }

    private fun trimResults() {
        if (commandResults.size > maxResults) {
            val sorted = commandResults.entries.sortedBy { it.value.createdAt }
            val toRemove = sorted.take(commandResults.size - maxResults).map { it.key }
            toRemove.forEach { commandResults.remove(it) }
        }
    }

    private fun log(message: String) {
        android.util.Log.d("AAPSRemoteAPI", message)
    }

    fun stop() {
        super.stop()
    }
}
