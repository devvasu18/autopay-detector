package com.falconcoders.autopay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.UUID

class TestSMSReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "com.autopaytracker.TEST_SMS") {
            val sender = intent.getStringExtra("sender") ?: "HDFCBK"
            val body = intent.getStringExtra("body") ?: ""
            val date = System.currentTimeMillis()
            val smsId = UUID.randomUUID().toString()

            Log.d("TestSMSReceiver", "Received custom test SMS broadcast: sender=$sender, body=$body")

            try {
                val dbHelper = FinanceDatabaseHelper(context)
                val db = dbHelper.writableDatabase
                SMSReceiver.processSingleSMS(context, db, smsId, sender, body, date)
            } catch (e: Exception) {
                Log.e("TestSMSReceiver", "Error processing test SMS", e)
            }
        }
    }
}
