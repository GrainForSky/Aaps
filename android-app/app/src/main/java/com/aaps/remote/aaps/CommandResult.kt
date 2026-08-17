package com.aaps.remote.aaps

/**
 * Represents the result of a command execution
 */
data class CommandResult(
    val requestId: String,
    val type: CommandType,
    val requestedAmount: Double,
    var status: CommandStatus = CommandStatus.PENDING,
    var success: Boolean = false,
    var message: String? = null,
    var deliveredAmount: Double = 0.0,
    val createdAt: Long = System.currentTimeMillis(),
    var completedAt: Long? = null
) {
    fun complete(success: Boolean, message: String, delivered: Double) {
        this.status = if (success) CommandStatus.COMPLETED else CommandStatus.FAILED
        this.success = success
        this.message = message
        this.deliveredAmount = delivered
        this.completedAt = System.currentTimeMillis()
    }
}

enum class CommandStatus {
    PENDING,    // Command received, waiting for execution
    EXECUTING,  // Command is being executed
    COMPLETED,  // Command completed successfully
    FAILED,     // Command failed
    TIMEOUT     // Command timed out
}
