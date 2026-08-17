package com.aaps.remote.aaps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Broadcast receiver for AndroidAPS command execution results
 * 
 * Listens for broadcasts from AndroidAPS when a command completes:
 * - Bolus delivery result (success/failure, actual amount delivered)
 * - Carbs entry result
 * - Treatment result
 */
class CommandResultReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CommandResultReceiver"
        
        // Action for command results from AndroidAPS
        const val ACTION_COMMAND_RESULT = "info.nightscout.androidaps.action.COMMAND_RESULT"
        
        // Intent extras
        const val EXTRA_COMMAND_ID = "commandId"
        const val EXTRA_SUCCESS = "success"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_DELIVERED = "delivered"
        const val EXTRA_TYPE = "type"
    }

    // Callback registry - maps commandId to callback
    private val callbacks = mutableMapOf<String, (CommandExecutionResult) -> Unit>()

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_COMMAND_RESULT) return

        val commandId = intent.getStringExtra(EXTRA_COMMAND_ID) ?: return
        val success = intent.getBooleanExtra(EXTRA_SUCCESS, false)
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: ""
        val delivered = intent.getDoubleExtra(EXTRA_DELIVERED, 0.0)
        val type = intent.getStringExtra(EXTRA_TYPE) ?: "unknown"

        Log.i(TAG, "Command result received: id=$commandId, type=$type, success=$success, delivered=$delivered")

        val result = CommandExecutionResult(success, message, delivered)
        
        // Notify registered callback
        callbacks[commandId]?.invoke(result)
        callbacks.remove(commandId)
    }

    fun registerCallback(commandId: String, callback: (CommandExecutionResult) -> Unit) {
        callbacks[commandId] = callback
    }

    fun unregisterCallback(commandId: String) {
        callbacks.remove(commandId)
    }
}
