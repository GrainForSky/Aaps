package com.aaps.remote.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.aaps.remote.api.RemoteAPIServer

/**
 * Foreground service that keeps the HTTP API server running
 */
class RemoteAPIService : Service() {

    companion object {
        private const val TAG = "RemoteAPIService"
        private const val CHANNEL_ID = "aaps_remote_api"
        private const val NOTIFICATION_ID = 1001
        
        const val EXTRA_PORT = "port"
        const val EXTRA_TOKEN = "token"
        const val DEFAULT_PORT = 8080

        fun start(context: Context, port: Int = DEFAULT_PORT, token: String? = null) {
            val intent = Intent(context, RemoteAPIService::class.java).apply {
                putExtra(EXTRA_PORT, port)
                putExtra(EXTRA_TOKEN, token)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, RemoteAPIService::class.java))
        }
    }

    private var server: RemoteAPIServer? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val port = intent?.getIntExtra(EXTRA_PORT, DEFAULT_PORT) ?: DEFAULT_PORT
        val token = intent?.getStringExtra(EXTRA_TOKEN)

        // Start foreground notification
        val notification = buildNotification(port)
        startForeground(NOTIFICATION_ID, notification)

        // Start HTTP server
        try {
            server = RemoteAPIServer(applicationContext, port, token)
            Log.i(TAG, "Remote API server started on port $port")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server: ${e.message}")
            stopSelf()
        }

        return START_STICKY // Restart if killed
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        Log.i(TAG, "Remote API server stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AAPS Remote API",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the AAPS Remote API server running"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(port: Int): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("AAPS Remote API")
            .setContentText("HTTP server running on port $port")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setOngoing(true)
            .build()
    }
}
