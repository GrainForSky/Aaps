package com.aaps.remote.util

import fi.iki.elonen.NanoHTTPD

/**
 * Token-based authentication for API requests
 */
class TokenAuth(private val expectedToken: String?) {

    /**
     * Authenticate a request using Bearer token
     * Returns true if authenticated or if no token is configured
     */
    fun authenticate(session: NanoHTTPD.IHTTPSession): Boolean {
        // If no token configured, allow all requests (not recommended for production)
        if (expectedToken.isNullOrEmpty()) {
            return true
        }

        // Get Authorization header
        val authHeader = session.headers["authorization"] ?: session.headers["Authorization"]
        
        if (authHeader == null) {
            // Also check query parameter as fallback
            val tokenParam = session.parameters["token"]?.firstOrNull()
            return tokenParam == expectedToken
        }

        // Parse Bearer token
        if (authHeader.startsWith("Bearer ", ignoreCase = true)) {
            val token = authHeader.substring(7).trim()
            return token == expectedToken
        }

        return false
    }
}
