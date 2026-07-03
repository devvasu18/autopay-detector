package com.autopaytracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import java.util.UUID
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

class SMSReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            val dbHelper = FinanceDatabaseHelper(context)
            val db = dbHelper.writableDatabase

            for (message in messages) {
                val smsId = UUID.randomUUID().toString()
                val address = message.originatingAddress ?: ""
                val body = message.messageBody ?: ""
                val date = message.timestampMillis

                try {
                    // Save raw SMS
                    val stmtSms = db.compileStatement(
                        "INSERT OR IGNORE INTO raw_sms (id, address, body, date, is_processed) VALUES (?, ?, ?, ?, 1)"
                    )
                    stmtSms.bindString(1, smsId)
                    stmtSms.bindString(2, address)
                    stmtSms.bindString(3, body)
                    stmtSms.bindLong(4, date)
                    stmtSms.executeInsert()

                    // Parse and save financial SMS
                    if (FinanceParser.isFinancialSMS(address, body)) {
                        val parsed = FinanceParser.parseFinancialSMS(smsId, address, body, date)
                        if (parsed != null) {
                            val stmtTx = db.compileStatement("""
                                INSERT OR REPLACE INTO transactions 
                                (sms_id, merchant, amount, date, payment_method, bank, type, category, confidence, status, raw_body)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """)
                            stmtTx.bindString(1, parsed.smsId)
                            stmtTx.bindString(2, parsed.merchant)
                            stmtTx.bindDouble(3, parsed.amount)
                            stmtTx.bindLong(4, parsed.date)
                            stmtTx.bindString(5, parsed.paymentMethod)
                            stmtTx.bindString(6, parsed.bank)
                            stmtTx.bindString(7, parsed.type)
                            stmtTx.bindString(8, parsed.category)
                            stmtTx.bindDouble(9, parsed.confidence)
                            stmtTx.bindString(10, parsed.status)
                            stmtTx.bindString(11, parsed.rawBody)
                            stmtTx.executeInsert()

                            if (parsed.isAutoPay) {
                                val existingFirst = FinanceParser.queryAutoPayFirstDetected(db, parsed.merchant)
                                if (existingFirst > 0) {
                                    val existingLast = FinanceParser.queryAutoPayLastPayment(db, parsed.merchant)
                                    val newFirst = if (parsed.date < existingFirst) parsed.date else existingFirst
                                    val newLast = if (parsed.date > existingLast) parsed.date else existingLast

                                    val stmtUpdate = db.compileStatement("""
                                        UPDATE autopay SET 
                                            amount = ?, frequency = ?, bank = ?, upi_id = ?, status = ?, 
                                            first_detected = ?, last_payment = ?, next_expected_payment = ?, 
                                            sms_id = ?, raw_body = ?
                                        WHERE merchant = ?
                                    """)
                                    stmtUpdate.bindDouble(1, parsed.amount)
                                    stmtUpdate.bindString(2, parsed.frequency)
                                    stmtUpdate.bindString(3, parsed.bank)
                                    stmtUpdate.bindString(4, parsed.upiId)
                                    stmtUpdate.bindString(5, parsed.autoPayStatus)
                                    stmtUpdate.bindLong(6, newFirst)
                                    stmtUpdate.bindLong(7, newLast)
                                    val nextPayment = newLast + (30L * 24L * 60L * 60L * 1000L)
                                    stmtUpdate.bindLong(8, nextPayment)
                                    stmtUpdate.bindString(9, parsed.smsId)
                                    stmtUpdate.bindString(10, parsed.rawBody)
                                    stmtUpdate.bindString(11, parsed.merchant)
                                    stmtUpdate.executeUpdateDelete()
                                } else {
                                    val stmtAuto = db.compileStatement("""
                                        INSERT INTO autopay 
                                        (merchant, amount, frequency, bank, upi_id, status, first_detected, last_payment, next_expected_payment, sms_id, raw_body)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """)
                                    stmtAuto.bindString(1, parsed.merchant)
                                    stmtAuto.bindDouble(2, parsed.amount)
                                    stmtAuto.bindString(3, parsed.frequency)
                                    stmtAuto.bindString(4, parsed.bank)
                                    stmtAuto.bindString(5, parsed.upiId)
                                    stmtAuto.bindString(6, parsed.autoPayStatus)
                                    stmtAuto.bindLong(7, parsed.date)
                                    stmtAuto.bindLong(8, parsed.date)
                                    val nextPayment = parsed.date + (30L * 24L * 60L * 60L * 1000L)
                                    stmtAuto.bindLong(9, nextPayment)
                                    stmtAuto.bindString(10, parsed.smsId)
                                    stmtAuto.bindString(11, parsed.rawBody)
                                    stmtAuto.executeInsert()
                                }
                            }

                            // Trigger real-time UI refresh with payload in React Native
                            val params = Arguments.createMap()
                            params.putString("type", parsed.type)
                            params.putDouble("amount", parsed.amount)
                            params.putString("merchant", parsed.merchant)
                            params.putString("category", parsed.category)
                            params.putBoolean("isAutoPay", parsed.isAutoPay)
                            FinanceCoreModule.instance?.sendEvent("onNewTransaction", params)
                        }
                    }
                } catch (e: Exception) {
                    Log.e("SMSReceiver", "Error processing incoming SMS", e)
                }
            }
        }
    }
}
