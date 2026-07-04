package com.autopaytracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import java.util.UUID
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.database.sqlite.SQLiteDatabase
import java.util.Locale

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
                            if (!parsed.isSetupOrCancellation) {
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
                            }

                            if (parsed.isAutoPay) {
                                val existingFirst = FinanceParser.queryAutoPayFirstDetected(db, parsed.merchant, parsed.amount)
                                if (existingFirst > 0) {
                                    val existingLast = FinanceParser.queryAutoPayLastPayment(db, parsed.merchant, parsed.amount)
                                    val newFirst = if (parsed.date < existingFirst) parsed.date else existingFirst
                                    val newLast = if (parsed.date > existingLast) parsed.date else existingLast

                                    val stmtUpdate = db.compileStatement("""
                                        UPDATE autopay SET 
                                            frequency = ?, bank = ?, upi_id = ?, status = ?, 
                                            first_detected = ?, last_payment = ?, next_expected_payment = ?, 
                                            sms_id = ?, raw_body = ?
                                        WHERE merchant = ? AND amount = ?
                                    """)
                                    stmtUpdate.bindString(1, parsed.frequency)
                                    stmtUpdate.bindString(2, parsed.bank)
                                    stmtUpdate.bindString(3, parsed.upiId)
                                    stmtUpdate.bindString(4, parsed.autoPayStatus)
                                    stmtUpdate.bindLong(5, newFirst)
                                    stmtUpdate.bindLong(6, newLast)
                                    val nextPayment = newLast + (30L * 24L * 60L * 60L * 1000L)
                                    stmtUpdate.bindLong(7, nextPayment)
                                    stmtUpdate.bindString(8, parsed.smsId)
                                    stmtUpdate.bindString(9, parsed.rawBody)
                                    stmtUpdate.bindString(10, parsed.merchant)
                                    stmtUpdate.bindDouble(11, parsed.amount)
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
                            speakTransactionInBackground(context, db, parsed)
                        }
                    }
                } catch (e: Exception) {
                    Log.e("SMSReceiver", "Error processing incoming SMS", e)
                }
            }
        }
    }

    private fun querySetting(db: SQLiteDatabase, key: String, defaultValue: String): String {
        var value = defaultValue
        try {
            db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
            val cursor = db.rawQuery("SELECT value FROM settings WHERE key = ?", arrayOf(key))
            if (cursor.moveToFirst()) {
                value = cursor.getString(0) ?: defaultValue
            }
            cursor.close()
        } catch (e: Exception) {
            Log.e("SMSReceiver", "Error querying setting $key", e)
        }
        return value
    }

    private fun speakTransactionInBackground(context: Context, db: SQLiteDatabase, tx: FinanceParser.ParsedSMS) {
        val voiceCredit = querySetting(db, "voice_credit", "true") == "true"
        val voiceDebit = querySetting(db, "voice_debit", "true") == "true"
        val voiceUpcoming = querySetting(db, "voice_upcoming", "true") == "true"
        val voiceLang = querySetting(db, "voice_language", "en")

        val isCancelled = tx.isSetupOrCancellation && tx.autoPayStatus == "Cancelled"
        val isCreated = tx.isSetupOrCancellation && tx.autoPayStatus == "Active"

        var shouldSpeak = false
        var isUpcoming = tx.isAutoPay && tx.type == "DEBIT" && !tx.isSetupOrCancellation

        if (tx.isSetupOrCancellation) {
            if (voiceUpcoming) {
                shouldSpeak = true
            }
        } else if (tx.type == "CREDIT" && voiceCredit) {
            shouldSpeak = true
        } else if (tx.type == "DEBIT") {
            if (tx.isAutoPay && voiceUpcoming) {
                shouldSpeak = true
                isUpcoming = true
            } else if (voiceDebit) {
                shouldSpeak = true
            }
        }

        if (!shouldSpeak) return

        val amount = tx.amount.toInt()
        val merchant = tx.merchant
        var text = ""

        if (isCancelled || isCreated) {
            text = if (voiceLang == "hi") {
                if (isCancelled) "${merchant} के लिए ऑटोपे रद्द कर दिया गया है"
                else "${merchant} के लिए ${amount} रुपये का ऑटोपे सक्रिय हो गया है"
            } else {
                if (isCancelled) "Autopay for ${merchant} has been cancelled"
                else "Autopay for ${merchant} of rupees ${amount} has been created"
            }
        } else {
            when (voiceLang) {
                "hi" -> {
                    text = if (isUpcoming) {
                    "याद दिलाएं: $merchant के लिए $amount रुपये का आगामी भुगतान"
                } else if (tx.type == "CREDIT") {
                    "$merchant से $amount रुपये प्राप्त हुए"
                } else {
                    "$merchant को $amount रुपये का भुगतान किया गया"
                }
            }
            "kn" -> {
                text = if (isUpcoming) {
                    "ನೆನಪೋಲೆ: $merchant ಗಾಗಿ $amount ರೂಪಾಯಿ ಮುಂಬರುವ ಪಾವತಿ"
                } else if (tx.type == "CREDIT") {
                    "$merchant ನಿಂದ $amount ರೂಪಾಯಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ"
                } else {
                    "$merchant ಗೆ $amount ರೂಪಾಯಿ ಪಾವತಿಸಲಾಗಿದೆ"
                }
            }
            "ta" -> {
                text = if (isUpcoming) {
                    "நினைவூட்டல்: $merchant க்கான $amount ரூபாய் வரவிருக்கும் கட்டணம்"
                } else if (tx.type == "CREDIT") {
                    "$merchant இடமிருந்து $amount ரூபாய் பெறப்பட்டது"
                } else {
                    "$merchant க்கு $amount ரூபாய் செலுத்தப்பட்டது"
                }
            }
            "te" -> {
                text = if (isUpcoming) {
                    "రిమైండర్: $merchant కోసం $amount రూపాయల రాబోయే చెల్లింపు"
                } else if (tx.type == "CREDIT") {
                    "$merchant నుండి $amount రూపాయలు స్వీకరించబడింది"
                } else {
                    "$merchant కి $amount రూపాయలు చెల్లించబడింది"
                }
            }
            "mr" -> {
                text = if (isUpcoming) {
                    "स्मरणपत्र: $merchant साठी $amount रुपयांचे आगामी पेमेंट"
                } else if (tx.type == "CREDIT") {
                    "$merchant कडून $amount रुपये प्राप्त झाले"
                } else {
                    "$merchant ला $amount रुपयांचे पेमेंट केले"
                }
            }
            "gu" -> {
                text = if (isUpcoming) {
                    "રિમાઇન્ડર: $merchant માટે $amount રૂપિયાની આગામી ચુકવણી"
                } else if (tx.type == "CREDIT") {
                    "$merchant તરફથી $amount રૂપિયા મળ્યા"
                } else {
                    "$merchant ને $amount રૂપિયા ચૂકવવામાં આવ્યા"
                }
            }
            "bn" -> {
                text = if (isUpcoming) {
                    "রিমাইন্ডার: $merchant এর জন্য $amount টাকার আসন্ন পেমেন্ট"
                } else if (tx.type == "CREDIT") {
                    "$merchant থেকে $amount টাকা পাওয়া গেছে"
                } else {
                    "$merchant কে $amount টাকা প্রদান করা হয়েছে"
                }
            }
            "ml" -> {
                text = if (isUpcoming) {
                    "ഓർമ്മപ്പെടുത്തൽ: $merchant ലേക്കുള്ള $amount രൂപയുടെ വരാനിരിക്കുന്ന പേയ്‌മെന്റ്"
                } else if (tx.type == "CREDIT") {
                    "$merchant ൽ നിന്ന് $amount രൂപ ലഭിച്ചു"
                } else {
                    "$merchant ലേക്ക് $amount രൂപ അടച്ചു"
                }
            }
            "pa" -> {
                text = if (isUpcoming) {
                    "ਯਾਦ ਦਿਵਾਓ: $merchant ਲਈ $amount ਰੁਪਏ ਦਾ ਆਉਣ ਵਾਲਾ ਭੁਗਤਾਨ"
                } else if (tx.type == "CREDIT") {
                    "$merchant ਤੋਂ $amount ਰੁਪਏ ਪ੍ਰਾਪਤ ਹੋਏ"
                } else {
                    "$merchant ਨੂੰ $amount ਰੁਪਏ ਦਾ ਭੁਗਤਾਨ ਕੀਤਾ ਗਿਆ"
                }
            }
            else -> { // en
                text = if (isUpcoming) {
                    "Reminder: Upcoming payment of rupees $amount for $merchant"
                } else if (tx.type == "CREDIT") {
                    "Received rupees $amount from $merchant"
                } else {
                    "Paid rupees $amount to $merchant"
                }
            }
        }
    }

        val locale = when (voiceLang) {
            "hi" -> Locale("hi", "IN")
            "kn" -> Locale("kn", "IN")
            "ta" -> Locale("ta", "IN")
            "te" -> Locale("te", "IN")
            "mr" -> Locale("mr", "IN")
            "gu" -> Locale("gu", "IN")
            "bn" -> Locale("bn", "IN")
            "ml" -> Locale("ml", "IN")
            "pa" -> Locale("pa", "IN")
            else -> Locale.US
        }

        var pendingResult: BroadcastReceiver.PendingResult? = null
        try {
            pendingResult = goAsync()
            val player = SMSReceiverTTSPlayer(context, text, locale, pendingResult)
            player.start()
        } catch (e: Exception) {
            Log.e("SMSReceiver", "Error playing background TTS", e)
            pendingResult?.finish()
        }
    }
}

private class SMSReceiverTTSPlayer(
    private val context: Context,
    private val text: String,
    private val locale: Locale,
    private val pendingResult: BroadcastReceiver.PendingResult?
) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null

    fun start() {
        try {
            tts = TextToSpeech(context.applicationContext, this)
        } catch (e: Exception) {
            Log.e("SMSReceiverTTSPlayer", "Failed to create TextToSpeech instance", e)
            cleanup()
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val currentTts = tts
            if (currentTts != null) {
                speakWithTts(currentTts)
            } else {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    tts?.let { speakWithTts(it) } ?: cleanup()
                }
            }
        } else {
            Log.e("SMSReceiverTTSPlayer", "TTS initialization failed with status $status")
            cleanup()
        }
    }

    private fun speakWithTts(t: TextToSpeech) {
        try {
            t.setSpeechRate(0.8f)
            val result = t.setLanguage(locale)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e("SMSReceiverTTSPlayer", "Language $locale is missing or not supported")
                cleanup()
                return
            }
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    cleanup()
                }
                override fun onError(utteranceId: String?) {
                    Log.e("SMSReceiverTTSPlayer", "Utterance progress error: $utteranceId")
                    cleanup()
                }
            })
            val params = android.os.Bundle()
            t.speak(text, TextToSpeech.QUEUE_FLUSH, params, "SMSReceiverTTS")
        } catch (e: Exception) {
            Log.e("SMSReceiverTTSPlayer", "Error during speak setup", e)
            cleanup()
        }
    }

    private fun cleanup() {
        try {
            tts?.shutdown()
        } catch (e: Exception) {
            Log.e("SMSReceiverTTSPlayer", "Error during TTS shutdown", e)
        }
        pendingResult?.finish()
    }
}
