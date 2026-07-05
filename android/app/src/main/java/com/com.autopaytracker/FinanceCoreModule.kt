package com.autopaytracker

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.util.concurrent.Executors
import android.speech.tts.TextToSpeech
import android.os.PowerManager
import android.provider.Settings

class FinanceCoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val dbHelper = FinanceDatabaseHelper(reactContext)
    private val databaseExecutor = Executors.newSingleThreadExecutor()
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    init {
        instance = this
        reactApplicationContext.runOnUiQueueThread {
            tts = TextToSpeech(reactContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true
                }
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        instance = null
        reactApplicationContext.runOnUiQueueThread {
            tts?.shutdown()
        }
    }

    override fun getName(): String {
        return "FinanceCoreModule"
    }

    fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactApplicationContext.hasActiveCatalystInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun executeSql(query: String, params: ReadableArray, promise: Promise) {
        databaseExecutor.execute {
            var db: SQLiteDatabase? = null
            var cursor: Cursor? = null
            try {
                db = dbHelper.writableDatabase
                val sqlArgs = Array(params.size()) { "" }
                for (i in 0 until params.size()) {
                    when (params.getType(i)) {
                        ReadableType.Null -> sqlArgs[i] = ""
                        ReadableType.Boolean -> sqlArgs[i] = if (params.getBoolean(i)) "1" else "0"
                        ReadableType.Number -> {
                            val num = params.getDouble(i)
                            sqlArgs[i] = if (num == num.toInt().toDouble()) {
                                num.toInt().toString()
                            } else {
                                num.toString()
                            }
                        }
                        ReadableType.String -> sqlArgs[i] = params.getString(i) ?: ""
                        else -> sqlArgs[i] = ""
                    }
                }

                val trimmedQuery = query.trim().uppercase(Locale.US)
                if (trimmedQuery.startsWith("SELECT") || trimmedQuery.startsWith("PRAGMA")) {
                    cursor = db.rawQuery(query, sqlArgs)
                    val result = Arguments.createArray()
                    val columnCount = cursor.columnCount
                    val columnNames = cursor.columnNames

                    while (cursor.moveToNext()) {
                        val row = Arguments.createMap()
                        for (i in 0 until columnCount) {
                            val colName = columnNames[i]
                            when (cursor.getType(i)) {
                                Cursor.FIELD_TYPE_NULL -> row.putNull(colName)
                                Cursor.FIELD_TYPE_INTEGER -> row.putDouble(colName, cursor.getLong(i).toDouble())
                                Cursor.FIELD_TYPE_FLOAT -> row.putDouble(colName, cursor.getDouble(i))
                                Cursor.FIELD_TYPE_STRING -> row.putString(colName, cursor.getString(i))
                                Cursor.FIELD_TYPE_BLOB -> row.putString(colName, Base64.encodeToString(cursor.getBlob(i), Base64.DEFAULT))
                            }
                        }
                        result.pushMap(row)
                    }
                    promise.resolve(result)
                } else if (trimmedQuery.startsWith("INSERT") || trimmedQuery.startsWith("UPDATE") || trimmedQuery.startsWith("DELETE")) {
                    val statement = db.compileStatement(query)
                    for (i in 0 until params.size()) {
                        val index = i + 1
                        when (params.getType(i)) {
                            ReadableType.Null -> statement.bindNull(index)
                            ReadableType.Boolean -> statement.bindLong(index, if (params.getBoolean(i)) 1 else 0)
                            ReadableType.Number -> statement.bindDouble(index, params.getDouble(i))
                            ReadableType.String -> statement.bindString(index, params.getString(i))
                            else -> statement.bindNull(index)
                        }
                    }

                    if (trimmedQuery.startsWith("INSERT")) {
                        val id = statement.executeInsert()
                        val result = Arguments.createMap()
                        result.putDouble("insertId", id.toDouble())
                        result.putDouble("rowsAffected", 1.0)
                        promise.resolve(result)
                    } else {
                        val rows = statement.executeUpdateDelete()
                        val result = Arguments.createMap()
                        result.putDouble("rowsAffected", rows.toDouble())
                        promise.resolve(result)
                    }
                } else {
                    if (params.size() > 0) {
                        db.execSQL(query, sqlArgs)
                    } else {
                        db.execSQL(query)
                    }
                    val result = Arguments.createMap()
                    result.putDouble("rowsAffected", 0.0)
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                promise.reject("SQL_ERROR", e.message, e)
            } finally {
                cursor?.close()
            }
        }
    }

    @ReactMethod
    fun getInstalledFinancialApps(promise: Promise) {
        val apps = Arguments.createArray()
        val financialPackages = listOf(
            Pair("com.google.android.apps.nbu.paisa.user", "Google Pay"),
            Pair("com.phonepe.app", "PhonePe"),
            Pair("net.one97.paytm", "Paytm"),
            Pair("in.org.npci.upiapp", "BHIM UPI"),
            Pair("co.jupiter", "Jupiter"),
            Pair("com.dreamplug.androidapp", "CRED"),
            Pair("com.sbi.lotusintouch", "Yono SBI"),
            Pair("com.csg.imobile", "iMobile Pay"),
            Pair("com.msf.hdfc.payzapp", "HDFC PayZapp"),
            Pair("com.msf.kbank.mobile", "Kotak Mobile"),
            Pair("com.axis.mobile", "Axis Mobile")
        )

        val pm = reactApplicationContext.packageManager
        for (appInfo in financialPackages) {
            val packageName = appInfo.first
            val appName = appInfo.second
            try {
                pm.getPackageInfo(packageName, PackageManager.GET_ACTIVITIES)
                val appMap = Arguments.createMap()
                appMap.putString("packageName", packageName)
                appMap.putString("appName", appName)
                apps.pushMap(appMap)
            } catch (e: PackageManager.NameNotFoundException) {
                // Not installed, skip
            }
        }
        promise.resolve(apps)
    }

    @ReactMethod
    fun openFinancialApp(packageName: String, promise: Promise) {
        try {
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.reject("APP_NOT_FOUND", "Could not open app: $packageName")
            }
        } catch (e: Exception) {
            promise.reject("OPEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun syncSMS(promise: Promise) {
        databaseExecutor.execute {
            try {
                val db = dbHelper.writableDatabase

                var lastSyncedDate: Long = 0
                val cursorLast = db.rawQuery("SELECT MAX(date) FROM raw_sms", null)
                if (cursorLast.moveToFirst()) {
                    lastSyncedDate = cursorLast.getLong(0)
                }
                cursorLast.close()

                val uri = Uri.parse("content://sms/inbox")
                val projection = arrayOf("_id", "address", "body", "date")
                val selection = "date > ?"
                val selectionArgs = arrayOf(lastSyncedDate.toString())

                val cursor = reactApplicationContext.contentResolver.query(
                    uri,
                    projection,
                    selection,
                    selectionArgs,
                    "date ASC"
                )

                var processedCount = 0
                var parsedCount = 0

                cursor?.let {
                    val idCol = it.getColumnIndexOrThrow("_id")
                    val addressCol = it.getColumnIndexOrThrow("address")
                    val bodyCol = it.getColumnIndexOrThrow("body")
                    val dateCol = it.getColumnIndexOrThrow("date")

                    db.beginTransaction()
                    try {
                        while (it.moveToNext()) {
                            val smsId = it.getString(idCol)
                            val address = it.getString(addressCol)
                            val body = it.getString(bodyCol)
                            val date = it.getLong(dateCol)

                            val stmtSms = db.compileStatement(
                                "INSERT OR IGNORE INTO raw_sms (id, address, body, date, is_processed) VALUES (?, ?, ?, ?, 0)"
                            )
                            stmtSms.bindString(1, smsId)
                            stmtSms.bindString(2, address ?: "")
                            stmtSms.bindString(3, body ?: "")
                            stmtSms.bindLong(4, date)
                            stmtSms.executeInsert()

                            processedCount++

                            if (FinanceParser.isFinancialSMS(address, body)) {
                                val parsed = FinanceParser.parseFinancialSMS(smsId, address ?: "", body ?: "", date)
                                if (parsed != null) {
                                     if (!parsed.isSetupOrCancellation && parsed.status != "Scheduled") {
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
                                    parsedCount++
                                }
                            }

                            db.execSQL("UPDATE raw_sms SET is_processed = 1 WHERE id = ?", arrayOf(smsId))
                        }
                        db.setTransactionSuccessful()
                    } finally {
                        db.endTransaction()
                    }
                    it.close()
                }

                val res = Arguments.createMap()
                res.putInt("processedCount", processedCount)
                res.putInt("parsedCount", parsedCount)
                promise.resolve(res)
            } catch (e: Exception) {
                promise.reject("SYNC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun speak(text: String, languageCode: String, promise: Promise) {
        reactApplicationContext.runOnUiQueueThread {
            if (tts == null || !ttsReady) {
                tts = TextToSpeech(reactApplicationContext) { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        ttsReady = true
                        speakText(text, languageCode, promise)
                    } else {
                        promise.reject("TTS_INIT_FAILED", "TextToSpeech failed to initialize")
                    }
                }
            } else {
                speakText(text, languageCode, promise)
            }
        }
    }

    private fun speakText(text: String, languageCode: String, promise: Promise) {
        val locale = when (languageCode.lowercase(Locale.US)) {
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

        tts?.let { t ->
            t.setSpeechRate(0.8f)
            val result = t.setLanguage(locale)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                promise.reject("LANG_NOT_SUPPORTED", "Language $languageCode is not supported")
                return
            }
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "FinanceCoreModuleTTS")
            promise.resolve(true)
        } ?: run {
            promise.reject("TTS_NULL", "TextToSpeech is null")
        }
    }
    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        val packageName = reactApplicationContext.packageName
        promise.resolve(pm.isIgnoringBatteryOptimizations(packageName))
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        val packageName = reactApplicationContext.packageName
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            promise.resolve(true)
            return
        }
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REQUEST_FAILED", e.message, e)
        }
    }
    companion object {
        var instance: FinanceCoreModule? = null
    }
}
