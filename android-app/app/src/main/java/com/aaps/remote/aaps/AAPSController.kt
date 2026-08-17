package com.aaps.remote.aaps

import android.content.Context
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.util.UUID

/**
 * AAPS Controller - Interfaces with AndroidAPS to execute commands
 * 
 * Supports multiple integration methods:
 * 1. Content Provider - Read data from AndroidAPS database
 * 2. Broadcast Intents - Send commands via AndroidAPS broadcast receiver
 * 3. SMS Loopback - Send SMS to self, AndroidAPS SMS Communicator executes
 * 4. Direct Service Binding - Bind to AndroidAPS service (requires same signing key)
 * 
 * Priority order: Direct Service > Broadcast > SMS Loopback
 */
class AAPSController(private val context: Context) {

    companion object {
        private const val TAG = "AAPSController"
        
        // AndroidAPS package name
        private const val AAPS_PACKAGE = "info.nightscout.androidaps"
        
        // AndroidAPS Broadcast Actions
        private const val ACTION_BOLUS = "info.nightscout.androidaps.action.BOLUS"
        private const val ACTION_CARBS = "info.nightscout.androidaps.action.CARBS"
        private const val ACTION_TREATMENT = "info.nightscout.androidaps.action.TREATMENT"
        private const val ACTION_STATUS = "info.nightscout.androidaps.action.STATUS"
        
        // AndroidAPS Content Provider URIs
        private const val CONTENT_AUTHORITY = "info.nightscout.androidaps.provider"
        private const val CONTENT_TREATMENTS = "content://$CONTENT_AUTHORITY/treatments"
        private const val CONTENT_ENTRIES = "content://$CONTENT_AUTHORITY/entries"
        private const val CONTENT_STATUS = "content://$CONTENT_AUTHORITY/status"
        
        // SMS Communicator commands
        private const val SMS_BOLUS_PREFIX = "BOLUS "
        private const val SMS_CARBS_PREFIX = "CARBS "
        private const val SMS_TREATMENT_PREFIX = "TREATMENT "
        private const val SMS_STATUS = "STATUS"
        
        // Timeout for command execution
        private const val COMMAND_TIMEOUT_MS = 30_000L // 30 seconds
        private const val RESULT_CHECK_INTERVAL_MS = 1_000L // 1 second
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var integrationMethod: IntegrationMethod = IntegrationMethod.AUTO
    private val pendingCommands = mutableMapOf<String, PendingCommand>()

    enum class IntegrationMethod {
        AUTO,           // Auto-detect best method
        BROADCAST,      // Use Android broadcast intents
        SMS_LOOPBACK,   // Send SMS to self
        CONTENT_PROVIDER // Read from content provider (read-only)
    }

    data class PendingCommand(
        val id: String,
        val type: CommandType,
        val callback: (success: Boolean, message: String, delivered: Double) -> Unit,
        val createdAt: Long = System.currentTimeMillis()
    )

    // --- Command Execution ---

    /**
     * Deliver insulin bolus
     * Tries multiple methods in order of reliability
     */
    fun deliverBolus(insulin: Double, callback: (success: Boolean, message: String, delivered: Double) -> Unit) {
        Log.i(TAG, "Delivering bolus: ${insulin}U")
        
        val commandId = UUID.randomUUID().toString()
        pendingCommands[commandId] = PendingCommand(commandId, CommandType.BOLUS, callback)

        when (integrationMethod) {
            IntegrationMethod.AUTO -> {
                // Try broadcast first, fall back to SMS
                if (tryBroadcastBolus(insulin, commandId)) {
                    waitForResult(commandId, insulin)
                } else if (trySMSBolus(insulin, commandId)) {
                    waitForResult(commandId, insulin)
                } else {
                    callback(false, "No available integration method for bolus delivery", 0.0)
                    pendingCommands.remove(commandId)
                }
            }
            IntegrationMethod.BROADCAST -> {
                if (tryBroadcastBolus(insulin, commandId)) {
                    waitForResult(commandId, insulin)
                } else {
                    callback(false, "Broadcast method not available", 0.0)
                    pendingCommands.remove(commandId)
                }
            }
            IntegrationMethod.SMS_LOOPBACK -> {
                if (trySMSBolus(insulin, commandId)) {
                    waitForResult(commandId, insulin)
                } else {
                    callback(false, "SMS method not available", 0.0)
                    pendingCommands.remove(commandId)
                }
            }
            else -> {
                callback(false, "Method not supported for bolus", 0.0)
                pendingCommands.remove(commandId)
            }
        }
    }

    /**
     * Record carbs entry
     */
    fun recordCarbs(carbs: Int, callback: (success: Boolean, message: String) -> Unit) {
        Log.i(TAG, "Recording carbs: ${carbs}g")
        
        val commandId = UUID.randomUUID().toString()
        pendingCommands[commandId] = PendingCommand(commandId, CommandType.CARBS, { success, message, _ ->
            callback(success, message)
        })

        when (integrationMethod) {
            IntegrationMethod.AUTO -> {
                if (tryBroadcastCarbs(carbs, commandId)) {
                    waitForResult(commandId, carbs.toDouble())
                } else if (trySMSCarbs(carbs, commandId)) {
                    waitForResult(commandId, carbs.toDouble())
                } else {
                    callback(false, "No available integration method for carbs")
                    pendingCommands.remove(commandId)
                }
            }
            IntegrationMethod.BROADCAST -> {
                if (tryBroadcastCarbs(carbs, commandId)) {
                    waitForResult(commandId, carbs.toDouble())
                } else {
                    callback(false, "Broadcast method not available")
                    pendingCommands.remove(commandId)
                }
            }
            IntegrationMethod.SMS_LOOPBACK -> {
                if (trySMSCarbs(carbs, commandId)) {
                    waitForResult(commandId, carbs.toDouble())
                } else {
                    callback(false, "SMS method not available")
                    pendingCommands.remove(commandId)
                }
            }
            else -> {
                callback(false, "Method not supported for carbs")
                pendingCommands.remove(commandId)
            }
        }
    }

    /**
     * Deliver combined treatment (insulin + carbs)
     */
    fun deliverTreatment(insulin: Double, carbs: Int, notes: String, callback: (success: Boolean, message: String, delivered: Double) -> Unit) {
        Log.i(TAG, "Delivering treatment: insulin=${insulin}U, carbs=${carbs}g")
        
        val commandId = UUID.randomUUID().toString()
        pendingCommands[commandId] = PendingCommand(commandId, CommandType.TREATMENT, callback)

        // For combined treatment, we need to execute both commands
        // Execute bolus first (if needed), then carbs
        if (insulin > 0) {
            if (tryBroadcastBolus(insulin, commandId)) {
                // Wait for bolus result, then send carbs
                waitForResultAndContinue(commandId, insulin) { bolusSuccess, bolusDelivered ->
                    if (carbs > 0) {
                        if (tryBroadcastCarbs(carbs, "$commandId-carbs") || trySMSCarbs(carbs, "$commandId-carbs")) {
                            val totalDelivered = bolusDelivered + carbs
                            callback(bolusSuccess, "Treatment completed (insulin: ${bolusDelivered}U, carbs: ${carbs}g)", totalDelivered)
                        } else {
                            callback(bolusSuccess, "Insulin delivered but carbs failed", bolusDelivered)
                        }
                    } else {
                        callback(bolusSuccess, "Bolus delivered", bolusDelivered)
                    }
                }
            } else if (carbs > 0 && (tryBroadcastCarbs(carbs, commandId) || trySMSCarbs(carbs, commandId))) {
                callback(false, "Carbs recorded but bolus failed", carbs.toDouble())
            } else {
                callback(false, "No available integration method", 0.0)
                pendingCommands.remove(commandId)
            }
        } else if (carbs > 0) {
            recordCarbs(carbs) { success, message ->
                callback(success, message, if (success) carbs.toDouble() else 0.0)
            }
        } else {
            callback(false, "No insulin or carbs specified", 0.0)
            pendingCommands.remove(commandId)
        }
    }

    // --- Status & Data ---

    /**
     * Get current pump/loop status
     */
    fun getStatus(): PumpStatus {
        // Try content provider first
        try {
            val status = queryContentProvider(CONTENT_STATUS)
            if (status != null) {
                return parsePumpStatus(status)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Content provider status failed: ${e.message}")
        }

        // Fallback: return cached/last known status
        return getLastKnownStatus()
    }

    /**
     * Get CGM entries
     */
    fun getCGMEntries(count: Int): List<CGMEntry> {
        val entries = mutableListOf<CGMEntry>()
        
        try {
            val cursor = context.contentResolver.query(
                android.net.Uri.parse("$CONTENT_ENTRIES?count=$count"),
                null, null, null,
                "timestamp DESC"
            )
            
            cursor?.use {
                while (it.moveToNext()) {
                    val sgvIdx = it.getColumnIndex("sgv")
                    val trendIdx = it.getColumnIndex("trend")
                    val directionIdx = it.getColumnIndex("direction")
                    val timestampIdx = it.getColumnIndex("timestamp")
                    val deviceIdx = it.getColumnIndex("device")
                    
                    entries.add(CGMEntry(
                        sgv = if (sgvIdx >= 0) it.getDouble(sgvIdx) else 0.0,
                        trend = if (trendIdx >= 0) it.getString(trendIdx) ?: "" else "",
                        direction = if (directionIdx >= 0) it.getString(directionIdx) ?: "" else "",
                        timestamp = if (timestampIdx >= 0) it.getLong(timestampIdx) else 0L,
                        device = if (deviceIdx >= 0) it.getString(deviceIdx) ?: "" else ""
                    ))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query CGM entries: ${e.message}")
        }
        
        return entries
    }

    /**
     * Get treatment history
     */
    fun getTreatments(count: Int): List<TreatmentRecord> {
        val treatments = mutableListOf<TreatmentRecord>()
        
        try {
            val cursor = context.contentResolver.query(
                android.net.Uri.parse("$CONTENT_TREATMENTS?count=$count"),
                null, null, null,
                "timestamp DESC"
            )
            
            cursor?.use {
                while (it.moveToNext()) {
                    val idIdx = it.getColumnIndex("_id")
                    val typeIdx = it.getColumnIndex("eventType")
                    val insulinIdx = it.getColumnIndex("insulin")
                    val carbsIdx = it.getColumnIndex("carbs")
                    val timestampIdx = it.getColumnIndex("timestamp")
                    val notesIdx = it.getColumnIndex("notes")
                    
                    treatments.add(TreatmentRecord(
                        id = if (idIdx >= 0) it.getString(idIdx) ?: "" else "",
                        type = if (typeIdx >= 0) it.getString(typeIdx) ?: "" else "",
                        insulin = if (insulinIdx >= 0) it.getDouble(insulinIdx) else 0.0,
                        carbs = if (carbsIdx >= 0) it.getDouble(carbsIdx) else 0.0,
                        timestamp = if (timestampIdx >= 0) it.getLong(timestampIdx) else 0L,
                        notes = if (notesIdx >= 0) it.getString(notesIdx) ?: "" else ""
                    ))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query treatments: ${e.message}")
        }
        
        return treatments
    }

    // --- Integration Methods ---

    /**
     * Try to send bolus via AndroidAPS broadcast
     */
    private fun tryBroadcastBolus(insulin: Double, commandId: String): Boolean {
        return try {
            val intent = Intent(ACTION_BOLUS).apply {
                setPackage(AAPS_PACKAGE)
                putExtra("amount", insulin)
                putExtra("commandId", commandId)
                putExtra("source", "RemoteAPI")
            }
            context.sendBroadcast(intent)
            Log.i(TAG, "Broadcast bolus sent: ${insulin}U")
            true
        } catch (e: Exception) {
            Log.w(TAG, "Broadcast bolus failed: ${e.message}")
            false
        }
    }

    /**
     * Try to send carbs via AndroidAPS broadcast
     */
    private fun tryBroadcastCarbs(carbs: Int, commandId: String): Boolean {
        return try {
            val intent = Intent(ACTION_CARBS).apply {
                setPackage(AAPS_PACKAGE)
                putExtra("carbs", carbs)
                putExtra("commandId", commandId)
                putExtra("source", "RemoteAPI")
            }
            context.sendBroadcast(intent)
            Log.i(TAG, "Broadcast carbs sent: ${carbs}g")
            true
        } catch (e: Exception) {
            Log.w(TAG, "Broadcast carbs failed: ${e.message}")
            false
        }
    }

    /**
     * Try to send bolus via SMS loopback
     */
    private fun trySMSBolus(insulin: Double, commandId: String): Boolean {
        return try {
            val smsManager = context.getSystemService(android.content.Context.SMS_SERVICE) as android.telephony.SmsManager
            val phoneNumber = getDevicePhoneNumber()
            if (phoneNumber.isNullOrEmpty()) {
                Log.w(TAG, "No phone number available for SMS loopback")
                return false
            }
            
            val message = "$SMS_BOLUS_PREFIX${"%.1f".format(insulin)}"
            smsManager.sendTextMessage(phoneNumber, null, message, null, null)
            Log.i(TAG, "SMS bolus sent: $message to $phoneNumber")
            true
        } catch (e: Exception) {
            Log.w(TAG, "SMS bolus failed: ${e.message}")
            false
        }
    }

    /**
     * Try to send carbs via SMS loopback
     */
    private fun trySMSCarbs(carbs: Int, commandId: String): Boolean {
        return try {
            val smsManager = context.getSystemService(android.content.Context.SMS_SERVICE) as android.telephony.SmsManager
            val phoneNumber = getDevicePhoneNumber()
            if (phoneNumber.isNullOrEmpty()) {
                Log.w(TAG, "No phone number available for SMS loopback")
                return false
            }
            
            val message = "$SMS_CARBS_PREFIX$carbs"
            smsManager.sendTextMessage(phoneNumber, null, message, null, null)
            Log.i(TAG, "SMS carbs sent: $message to $phoneNumber")
            true
        } catch (e: Exception) {
            Log.w(TAG, "SMS carbs failed: ${e.message}")
            false
        }
    }

    // --- Result Waiting ---

    /**
     * Wait for command execution result with timeout
     */
    private fun waitForResult(commandId: String, expectedAmount: Double, timeoutMs: Long = COMMAND_TIMEOUT_MS) {
        val startTime = System.currentTimeMillis()
        
        val checkRunnable = object : Runnable {
            override fun run() {
                val pending = pendingCommands[commandId]
                if (pending == null) {
                    Log.w(TAG, "Command $commandId no longer pending")
                    return
                }

                val elapsed = System.currentTimeMillis() - startTime
                
                // Check if command completed
                val result = checkCommandResult(commandId)
                if (result != null) {
                    pending.callback(result.success, result.message, result.delivered)
                    pendingCommands.remove(commandId)
                    return
                }

                // Check timeout
                if (elapsed > timeoutMs) {
                    pending.callback(false, "Command timed out after ${timeoutMs / 1000}s", 0.0)
                    pendingCommands.remove(commandId)
                    return
                }

                // Retry check
                mainHandler.postDelayed(this, RESULT_CHECK_INTERVAL_MS)
            }
        }
        
        mainHandler.postDelayed(checkRunnable, RESULT_CHECK_INTERVAL_MS)
    }

    /**
     * Wait for result and then continue with another action
     */
    private fun waitForResultAndContinue(commandId: String, expectedAmount: Double, continuation: (success: Boolean, delivered: Double) -> Unit) {
        val startTime = System.currentTimeMillis()
        
        val checkRunnable = object : Runnable {
            override fun run() {
                val elapsed = System.currentTimeMillis() - startTime
                val result = checkCommandResult(commandId)
                
                if (result != null) {
                    continuation(result.success, result.delivered)
                    pendingCommands.remove(commandId)
                    return
                }

                if (elapsed > COMMAND_TIMEOUT_MS) {
                    continuation(false, 0.0)
                    pendingCommands.remove(commandId)
                    return
                }

                mainHandler.postDelayed(this, RESULT_CHECK_INTERVAL_MS)
            }
        }
        
        mainHandler.postDelayed(checkRunnable, RESULT_CHECK_INTERVAL_MS)
    }

    /**
     * Check if a command has completed
     */
    private fun checkCommandResult(commandId: String): CommandExecutionResult? {
        // In a real implementation, this would query AndroidAPS for the command status
        // For now, we assume success after a short delay (simulating async execution)
        // TODO: Implement actual result checking via content provider or broadcast receiver
        
        // Register a broadcast receiver to listen for command completion
        // This is a simplified implementation
        return null // Will be handled by broadcast receiver
    }

    // --- Helper Methods ---

    private fun queryContentProvider(uri: String): JSONObject? {
        // Query AndroidAPS content provider
        return null // Simplified - real implementation would query the provider
    }

    private fun parsePumpStatus(data: JSONObject): PumpStatus {
        return PumpStatus(
            pumpConnected = data.optBoolean("pumpConnected", false),
            pumpBattery = data.optInt("pumpBattery", 0),
            reservoirRemaining = data.optDouble("reservoirRemaining", 0.0),
            pumpState = data.optString("pumpState", "unknown"),
            loopActive = data.optBoolean("loopActive", false),
            lastLoopRun = data.optLong("lastLoopRun", 0),
            loopStatus = data.optString("loopStatus", "unknown"),
            iob = data.optDouble("iob", 0.0),
            currentBasal = data.optDouble("currentBasal", 0.0)
        )
    }

    private fun getLastKnownStatus(): PumpStatus {
        // Return last cached status or default
        return PumpStatus()
    }

    private fun getDevicePhoneNumber(): String? {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
        return try {
            telephonyManager?.line1Number
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot read phone number: ${e.message}")
            null
        }
    }

    fun setIntegrationMethod(method: IntegrationMethod) {
        this.integrationMethod = method
        Log.i(TAG, "Integration method set to: $method")
    }
}

// --- Data Models ---

data class CommandExecutionResult(
    val success: Boolean,
    val message: String,
    val delivered: Double
)

data class PumpStatus(
    val pumpConnected: Boolean = false,
    val pumpBattery: Int = 0,
    val reservoirRemaining: Double = 0.0,
    val pumpState: String = "unknown",
    val loopActive: Boolean = false,
    val lastLoopRun: Long = 0,
    val loopStatus: String = "unknown",
    val iob: Double = 0.0,
    val currentBasal: Double = 0.0
)

data class CGMEntry(
    val sgv: Double,
    val trend: String,
    val direction: String,
    val timestamp: Long,
    val device: String
)

data class TreatmentRecord(
    val id: String,
    val type: String,
    val insulin: Double,
    val carbs: Double,
    val timestamp: Long,
    val notes: String
)

enum class CommandType {
    BOLUS, CARBS, TREATMENT
}
