package com.aaps.remote

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.aaps.remote.service.RemoteAPIService

/**
 * Main Activity - Simple UI to start/stop the Remote API server
 */
class MainActivity : AppCompatActivity() {

    private lateinit var etPort: EditText
    private lateinit var etToken: EditText
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button
    private lateinit var tvStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Simple programmatic layout
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        tvStatus = TextView(this).apply {
            text = "Server Status: Stopped"
            textSize = 18f
        }

        etPort = EditText(this).apply {
            hint = "Port (default: 8080)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText("8080")
        }

        etToken = EditText(this).apply {
            hint = "Auth Token (optional)"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }

        btnStart = Button(this).apply {
            text = "Start Server"
            setOnClickListener { startServer() }
        }

        btnStop = Button(this).apply {
            text = "Stop Server"
            isEnabled = false
            setOnClickListener { stopServer() }
        }

        val infoText = TextView(this).apply {
            text = """
                AAPS Remote API Server
                
                Endpoints:
                • POST /bolus - Deliver insulin
                • POST /carbs - Record carbs  
                • POST /treatment - Combined treatment
                • GET /status - Pump status
                • GET /cgm - CGM readings
                • GET /treatments - Treatment history
                • GET /result/:id - Command result
                • GET /ping - Health check
                
                Authentication: Bearer token in header
            """.trimIndent()
            textSize = 12f
            setPadding(0, 32, 0, 0)
        }

        layout.addView(tvStatus)
        layout.addView(etPort)
        layout.addView(etToken)
        layout.addView(btnStart)
        layout.addView(btnStop)
        layout.addView(infoText)

        setContentView(layout)
    }

    private fun startServer() {
        val port = etPort.text.toString().toIntOrNull() ?: 8080
        val token = etToken.text.toString().ifBlank { null }

        RemoteAPIService.start(this, port, token)
        
        tvStatus.text = "Server Status: Running on port $port"
        btnStart.isEnabled = false
        btnStop.isEnabled = true
        
        Toast.makeText(this, "Server started on port $port", Toast.LENGTH_SHORT).show()
    }

    private fun stopServer() {
        RemoteAPIService.stop(this)
        
        tvStatus.text = "Server Status: Stopped"
        btnStart.isEnabled = true
        btnStop.isEnabled = false
        
        Toast.makeText(this, "Server stopped", Toast.LENGTH_SHORT).show()
    }
}
