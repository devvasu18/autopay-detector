package com.falconcoders.autopay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

class TTSService : Service(), TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var textToSpeak: String = ""
    private var localeToUse: Locale = Locale.US
    private var isInitialized = false
    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        private const val CHANNEL_ID = "TTS_SERVICE_CHANNEL"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "TTSService"

        fun start(context: Context, text: String, locale: Locale) {
            val intent = Intent(context, TTSService::class.java).apply {
                putExtra("TEXT", text)
                putExtra("LOCALE", locale)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        textToSpeak = intent?.getStringExtra("TEXT") ?: ""
        @Suppress("DEPRECATION")
        localeToUse = (intent?.getSerializableExtra("LOCALE") as? Locale) ?: Locale.US

        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                notification, 
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Acquire wake lock to keep CPU awake while speaking
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (wakeLock == null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AutopayTracker:TTSServiceWakeLock")
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(5 * 60 * 1000L /* 5 minutes max per speak trigger */)
                Log.d(TAG, "WakeLock acquired")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire WakeLock", e)
        }

        if (tts == null) {
            try {
                tts = TextToSpeech(applicationContext, this)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize TTS", e)
            }
        } else if (isInitialized && textToSpeak.isNotEmpty()) {
            speak()
        }

        // Return START_STICKY to ensure OS automatically restarts the service if killed
        return START_STICKY
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isInitialized = true
            if (textToSpeak.isNotEmpty()) {
                speak()
            }
        } else {
            Log.e(TAG, "TTS Initialization failed: $status")
        }
    }

    private fun speak() {
        val currentTts = tts
        if (currentTts == null) {
            return
        }

        try {
            currentTts.setSpeechRate(0.8f)
            val result = currentTts.setLanguage(localeToUse)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e(TAG, "Language $localeToUse is missing or not supported")
                return
            }

            currentTts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    Log.d(TAG, "Speech started")
                }

                override fun onDone(utteranceId: String?) {
                    Log.d(TAG, "Speech completed")
                    releaseWakeLock() // Release cpu wake lock when speech finishes
                }

                override fun onError(utteranceId: String?) {
                    Log.e(TAG, "Utterance progress error: $utteranceId")
                    releaseWakeLock()
                }
            })

            val params = android.os.Bundle()
            currentTts.speak(textToSpeak, TextToSpeech.QUEUE_FLUSH, params, "TTSServiceSpeech")
        } catch (e: Exception) {
            Log.e(TAG, "Error during speak setup", e)
            releaseWakeLock()
        }
    }

    private fun createNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("Soundbox Service Active")
            .setContentText("Listening for transaction notifications...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Voice Reader Background Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Used to speak transaction details in background"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun stopService() {
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
        } catch (e: Exception) {
            Log.e(TAG, "Error during TTS shutdown", e)
        }
        stopForeground(true)
        releaseWakeLock()
        stopSelf()
    }

    override fun onDestroy() {
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
        } catch (e: Exception) {
            Log.e(TAG, "Error during onDestroy TTS shutdown", e)
        }
        releaseWakeLock()
        super.onDestroy()
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "WakeLock released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing WakeLock", e)
        } finally {
            wakeLock = null
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}
