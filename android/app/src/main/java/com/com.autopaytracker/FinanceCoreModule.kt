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
import java.util.*
import java.util.concurrent.Executors
import java.util.regex.Pattern

class FinanceCoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val dbHelper = FinanceDatabaseHelper(reactContext)
    private val databaseExecutor = Executors.newSingleThreadExecutor()

    override fun getName(): String {
        return "FinanceCoreModule"
    }

    class FinanceDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS raw_sms (
                    id TEXT PRIMARY KEY,
                    address TEXT,
                    body TEXT,
                    date INTEGER,
                    is_processed INTEGER DEFAULT 0
                )
            """)
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sms_id TEXT UNIQUE,
                    merchant TEXT,
                    amount REAL,
                    date INTEGER,
                    payment_method TEXT,
                    bank TEXT,
                    type TEXT,
                    category TEXT,
                    confidence REAL,
                    status TEXT,
                    raw_body TEXT
                )
            """)
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS autopay (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    merchant TEXT,
                    amount REAL,
                    frequency TEXT,
                    bank TEXT,
                    upi_id TEXT,
                    status TEXT,
                    first_detected INTEGER,
                    last_payment INTEGER,
                    next_expected_payment INTEGER,
                    sms_id TEXT UNIQUE,
                    raw_body TEXT
                )
            """)
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            db.execSQL("DROP TABLE IF EXISTS raw_sms")
            db.execSQL("DROP TABLE IF EXISTS transactions")
            db.execSQL("DROP TABLE IF EXISTS autopay")
            onCreate(db)
        }

        companion object {
            const val DATABASE_NAME = "finance_tracker.db"
            const val DATABASE_VERSION = 1
        }
    }

    class ParsedSMS(
        val smsId: String,
        val merchant: String,
        val amount: Double,
        val date: Long,
        val paymentMethod: String,
        val bank: String,
        val type: String, // CREDIT or DEBIT
        val category: String,
        val confidence: Double,
        val status: String,
        val rawBody: String,
        val isAutoPay: Boolean,
        val frequency: String,
        val upiId: String,
        val autoPayStatus: String
    )

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

                            if (isFinancialSMS(address, body)) {
                                val parsed = parseFinancialSMS(smsId, address, body, date)
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
                                        val stmtAuto = db.compileStatement("""
                                            INSERT OR REPLACE INTO autopay 
                                            (merchant, amount, frequency, bank, upi_id, status, first_detected, last_payment, next_expected_payment, sms_id, raw_body)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """)
                                        stmtAuto.bindString(1, parsed.merchant)
                                        stmtAuto.bindDouble(2, parsed.amount)
                                        stmtAuto.bindString(3, parsed.frequency)
                                        stmtAuto.bindString(4, parsed.bank)
                                        stmtAuto.bindString(5, parsed.upiId)
                                        stmtAuto.bindString(6, parsed.autoPayStatus)
                                        val existingFirst = queryAutoPayFirstDetected(db, parsed.merchant)
                                        stmtAuto.bindLong(7, if (existingFirst > 0) existingFirst else parsed.date)
                                        stmtAuto.bindLong(8, parsed.date)
                                        val nextPayment = parsed.date + (30L * 24L * 60L * 60L * 1000L)
                                        stmtAuto.bindLong(9, nextPayment)
                                        stmtAuto.bindString(10, parsed.smsId)
                                        stmtAuto.bindString(11, parsed.rawBody)
                                        stmtAuto.executeInsert()
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

    private fun isFinancialSMS(sender: String?, body: String?): Boolean {
        if (sender == null || body == null) return false
        val s = sender.uppercase(Locale.US)
        val b = body.lowercase(Locale.US)

        val hasLetter = s.any { it.isLetter() }
        if (!hasLetter) return false

        if (b.contains("otp") || b.contains("one time password") || b.contains("one-time password") || 
            b.contains("verification code") || b.contains("secret code") || b.contains("verification pin")
        ) {
            return false
        }

        if (b.contains("apply now") || b.contains("click to") || b.contains("congratulations") || 
            b.contains("won rs") || (b.contains("cashback up to") && b.contains("link") && !b.contains("credited"))
        ) {
            if (b.contains("offer") || b.contains("pre-approved") || b.contains("discount") || b.contains("win cash")) {
                return false
            }
        }

        val hasAmount = b.contains("rs") || b.contains("rs.") || b.contains("inr") || b.contains("₹") || b.contains("usd")
        val hasFinKeywords = b.contains("debited") || b.contains("credited") || b.contains("spent") || b.contains("paid") ||
                b.contains("payment") || b.contains("withdrawn") || b.contains("deposited") || b.contains("mandate") ||
                b.contains("autopay") || b.contains("standing instruction") || b.contains("emi") || b.contains("sip") ||
                b.contains("charge") || b.contains("renewed") || b.contains("debit") || b.contains("received") ||
                b.contains("auto pay") || b.contains("auto-debit") || b.contains("recurring")

        return hasAmount && hasFinKeywords
    }

    private fun parseFinancialSMS(smsId: String, sender: String, body: String, date: Long): ParsedSMS? {
        val b = body.lowercase(Locale.US)
        val s = sender.uppercase(Locale.US)

        var amount = 0.0
        val amountPatterns = listOf(
            Pattern.compile("(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)"),
            Pattern.compile("spent\\s+(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)"),
            Pattern.compile("debited\\s+with\\s+(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)"),
            Pattern.compile("credited\\s+with\\s+(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)")
        )

        for (pattern in amountPatterns) {
            val matcher = pattern.matcher(b)
            if (matcher.find()) {
                val amtStr = matcher.group(1)?.replace(",", "")
                try {
                    amount = amtStr?.toDouble() ?: 0.0
                    if (amount > 0) break
                } catch (e: Exception) {}
            }
        }
        if (amount == 0.0) return null

        var type = "DEBIT"
        if (b.contains("credited") || b.contains("received") || b.contains("deposited") || 
            b.contains("refund") || b.contains("cashback") || b.contains("salary") || b.contains("interest")) {
            type = "CREDIT"
        }

        var bank = "Unknown Bank"
        val bankKeywords = mapOf(
            "HDFC" to "HDFC Bank",
            "SBI" to "SBI",
            "ICICI" to "ICICI Bank",
            "AXIS" to "Axis Bank",
            "PAYTM" to "Paytm Bank",
            "PHONEPE" to "PhonePe",
            "PNB" to "Punjab National Bank",
            "BOI" to "Bank of India",
            "KOTAK" to "Kotak Bank",
            "INDUS" to "IndusInd Bank",
            "CANARA" to "Canara Bank",
            "UNION" to "Union Bank",
            "HSBC" to "HSBC",
            "CITI" to "Citi Bank",
            "AMEX" to "American Express",
            "RBL" to "RBL Bank",
            "YESBK" to "Yes Bank",
            "FBL" to "Federal Bank",
            "JUPITER" to "Jupiter"
        )
        for ((key, value) in bankKeywords) {
            if (s.contains(key) || b.contains(key.lowercase(Locale.US))) {
                bank = value
                break
            }
        }

        var category = "Others"
        if (b.contains("salary")) {
            category = "Salary"
        } else if (b.contains("netflix") || b.contains("spotify") || b.contains("amazon prime") || 
            b.contains("youtube premium") || b.contains("disney") || b.contains("hotstar") || 
            b.contains("apple") || b.contains("google play") || b.contains("subscription") || b.contains("prime membership")) {
            category = "Subscription"
        } else if (b.contains("emi") || b.contains("loan") || b.contains("housing finance") || b.contains("car loan")) {
            category = "Loan / EMI"
        } else if (b.contains("sip") || b.contains("mutual fund") || b.contains("groww") || 
            b.contains("zerodha") || b.contains("upstox") || b.contains("investment")) {
            category = "Investment"
        } else if (b.contains("electricity") || b.contains("power") || b.contains("bescom") || 
            b.contains("water bill") || b.contains("gas bill") || b.contains("utility bill")) {
            category = "Bill"
        } else if (b.contains("recharge") || b.contains("mobile recharge") || b.contains("jio") || 
            b.contains("airtel") || b.contains("vi prepaid")) {
            category = "Recharge"
        } else if (b.contains("insurance") || b.contains("premium") || b.contains("lic")) {
            category = "Insurance"
        } else if (b.contains("refund")) {
            category = "Refund"
        } else if (b.contains("cashback")) {
            category = "Cashback"
        } else if (b.contains("interest")) {
            category = "Interest"
        } else if (b.contains("swiggy") || b.contains("zomato") || b.contains("restaurant") || b.contains("food")) {
            category = "Food"
        } else if (b.contains("uber") || b.contains("ola") || b.contains("irctc") || b.contains("travel") || b.contains("fuel") || b.contains("petrol")) {
            category = "Travel / Fuel"
        } else if (b.contains("amazon") || b.contains("flipkart") || b.contains("myntra") || b.contains("shopping")) {
            category = "Shopping"
        }

        var merchant = "Unknown Merchant"
        val merchantPatterns = listOf(
            Pattern.compile("(?:sent to|paid to|spent on|at)\\s+([a-zA-Z0-9\\s\\.\\*\\&]{3,20})\\s*(?:on|via|using|from|for|balance|ref|rrn|vpa)"),
            Pattern.compile("info:\\s*([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("debited\\s+at\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("transfer to\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})")
        )

        for (pattern in merchantPatterns) {
            val matcher = pattern.matcher(b)
            if (matcher.find()) {
                merchant = matcher.group(1)?.trim() ?: "Unknown Merchant"
                merchant = merchant.split(" txn ")[0].split(" ref ")[0].split(" date ")[0].trim()
                break
            }
        }

        if (merchant == "Unknown Merchant" || merchant.lowercase(Locale.US).contains("unknown")) {
            val commonMerchants = listOf(
                "netflix", "spotify", "amazon prime", "amazon", "youtube", "google play", "google one",
                "apple", "swiggy", "zomato", "uber", "ola", "flipkart", "myntra", "groww", "zerodha",
                "lic", "airtel", "jio", "vi", "tataplay", "fastag"
            )
            for (m in commonMerchants) {
                if (b.contains(m)) {
                    merchant = m.substring(0, 1).uppercase(Locale.US) + m.substring(1)
                    break
                }
            }
        }

        val isAutoPay = b.contains("autopay") || b.contains("auto pay") || b.contains("mandate") || 
            b.contains("standing instruction") || b.contains("standing instr") || b.contains("recurring") || 
            b.contains("auto debit") || b.contains("auto-debit") || b.contains("debit instruction") || 
            b.contains("si") || b.contains("nach") || b.contains("ach") || b.contains("ecs") || 
            b.contains("renewal successful") || b.contains("subscription renewed") || b.contains("renewed successfully")

        var autoPayStatus = "Active"
        if (b.contains("cancel") || b.contains("revoked") || b.contains("deactivated") || b.contains("stopped")) {
            autoPayStatus = "Cancelled"
        } else if (b.contains("failed") || b.contains("declined") || b.contains("missed")) {
            autoPayStatus = "Missed"
        }

        var paymentMethod = "UPI"
        if (b.contains("card") || b.contains("credit card") || b.contains("debit card") || b.contains("visa") || b.contains("mastercard") || b.contains("rupay")) {
            paymentMethod = "Card"
        } else if (b.contains("netbanking") || b.contains("neft") || b.contains("imps") || b.contains("rtgs") || b.contains("ecs")) {
            paymentMethod = "Bank Transfer"
        }

        var upiId = ""
        val upiPattern = Pattern.compile("([a-zA-Z0-9\\.\\-_]+@[a-zA-Z0-9]+)")
        val upiMatcher = upiPattern.matcher(b)
        if (upiMatcher.find()) {
            upiId = upiMatcher.group(1) ?: ""
        }

        return ParsedSMS(
            smsId = smsId,
            merchant = merchant,
            amount = amount,
            date = date,
            paymentMethod = paymentMethod,
            bank = bank,
            type = type,
            category = category,
            confidence = if (category == "Others" && merchant == "Unknown Merchant") 0.6 else 0.95,
            status = if (b.contains("failed") || b.contains("declined")) "Failed" else "Success",
            rawBody = body,
            isAutoPay = isAutoPay,
            frequency = "Monthly",
            upiId = upiId,
            autoPayStatus = autoPayStatus
        )
    }

    private fun queryAutoPayFirstDetected(db: SQLiteDatabase, merchant: String): Long {
        var firstDetected: Long = 0
        val cursor = db.rawQuery("SELECT first_detected FROM autopay WHERE merchant = ?", arrayOf(merchant))
        if (cursor.moveToFirst()) {
            firstDetected = cursor.getLong(0)
        }
        cursor.close()
        return firstDetected
    }
}
