package com.autopaytracker

import android.database.sqlite.SQLiteDatabase
import java.util.*
import java.util.regex.Pattern

object FinanceParser {

    private val emiPattern = Pattern.compile("\\bemi\\b")
    private val sipPattern = Pattern.compile("\\bsip\\b")
    private val chargePattern = Pattern.compile("\\bcharge(s|d)?\\b")
    private val rechargePattern = Pattern.compile("\\brecharge(d)?\\b")
    private val paidPattern = Pattern.compile("\\bpaid\\b")
    private val licPattern = Pattern.compile("\\blic\\b")

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

    fun isFinancialSMS(sender: String?, body: String?): Boolean {
        if (sender == null || body == null) return false
        val s = sender.uppercase(Locale.US)
        val b = body.lowercase(Locale.US)

        val hasLetter = s.any { it.isLetter() }
        if (!hasLetter) return false

        // 1. OTP / Verification code check
        if (b.contains("otp") || b.contains("one time password") || b.contains("one-time password") || 
            b.contains("verification code") || b.contains("secret code") || b.contains("verification pin")
        ) {
            return false
        }

        // 2. Telecom Operator Recharge Confirmation Receipts (Double counting blocker)
        if (b.contains("credited to your") && (b.contains("airtel") || b.contains("jio") || b.contains("vi ") || b.contains("mobile") || b.contains("number"))) {
            return false
        }
        if (b.contains("recharge") && (b.contains("credited") || b.contains("successful") || b.contains("success")) && 
            (b.contains("validity has been extended") || b.contains("for your mobile") || b.contains("for your airtel") || b.contains("for your jio"))
        ) {
            return false
        }

        // 3. Bill generated / Invoice Alerts (liability reminders, not transactions)
        if (b.contains("bill") && (b.contains("generated") || b.contains("has been generated") || b.contains("is generated"))) {
            return false
        }
        if ((b.contains("amount to be paid") || b.contains("amount due") || b.contains("payment due") || b.contains("due date:")) &&
            !b.contains("debited") && !b.contains("paid") && !b.contains("spent")
        ) {
            return false
        }

        // 4. Promotional/Discount Ads
        if (b.contains("enjoy") && b.contains("off")) {
            return false
        }
        if (b.contains("shop safely") || b.contains("open now") || b.contains("get up to") || b.contains("save up to") || b.contains("discount of")) {
            return false
        }
        if (b.contains("test drive") || b.contains("book your test") || b.contains("deals you") || b.contains("attractive benefits") || b.contains("on-road funding")) {
            return false
        }
        if (b.contains("emi/lakh") || b.contains("emi/") || b.contains("emi starting") || b.contains("book your")) {
            return false
        }

        val isPromotional = b.contains("offer") || b.contains("pre-approved") || b.contains("pre approved") || 
                b.contains("avail now") || b.contains("apply now") || b.contains("click to") || 
                b.contains("congratulations") || b.contains("congrats") || b.contains("won rs") || 
                b.contains("win cash") || b.contains("eligible") || b.contains("instantly") ||
                b.contains("discount") || b.contains("click") || b.contains("upgrade") || 
                b.contains("unlimited data") || b.contains("unlimited call") || b.contains("validity") || 
                b.contains("recharge now") || b.contains("recharge here") || b.contains("recharge karein") || 
                b.contains("dial *") || b.contains("open a") || b.contains("pack") || b.contains("get now") || 
                b.contains("get 100") || b.contains("corporate plans") || b.contains("data is consumed") ||
                b.contains("data consumed")

        val hasTxConfirm = b.contains("debited") || b.contains("credited") || b.contains("spent") || 
                paidPattern.matcher(b).find() || b.contains("withdrawn") || b.contains("deposited") || 
                b.contains("received") || b.contains("transferred") || b.contains("successful") || 
                b.contains("success")

        if (isPromotional && !hasTxConfirm) {
            return false
        }

        val hasAmount = b.contains("rs") || b.contains("rs.") || b.contains("inr") || b.contains("₹") || b.contains("usd")
        val hasFinKeywords = b.contains("debited") || b.contains("credited") || b.contains("spent") || paidPattern.matcher(b).find() ||
                b.contains("payment") || b.contains("withdrawn") || b.contains("deposited") || b.contains("mandate") ||
                b.contains("autopay") || b.contains("standing instruction") || emiPattern.matcher(b).find() || sipPattern.matcher(b).find() ||
                chargePattern.matcher(b).find() || rechargePattern.matcher(b).find() || b.contains("renewed") || b.contains("debit") || b.contains("received") ||
                b.contains("auto pay") || b.contains("auto-debit") || b.contains("recurring")

        return hasAmount && hasFinKeywords
    }

    fun parseFinancialSMS(smsId: String, sender: String, body: String, date: Long): ParsedSMS? {
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
        } else if (b.contains("insurance") || b.contains("premium") || licPattern.matcher(b).find()) {
            category = "Insurance"
        } else if (b.contains("recharge") || b.contains("mobile recharge") || b.contains("jio") || 
            b.contains("airtel") || b.contains("vi prepaid")) {
            category = "Recharge"
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

    fun queryAutoPayFirstDetected(db: SQLiteDatabase, merchant: String, amount: Double): Long {
        var firstDetected: Long = 0
        val cursor = db.rawQuery("SELECT first_detected FROM autopay WHERE merchant = ? AND amount = ?", arrayOf(merchant, amount.toString()))
        if (cursor.moveToFirst()) {
            firstDetected = cursor.getLong(0)
        }
        cursor.close()
        return firstDetected
    }

    fun queryAutoPayLastPayment(db: SQLiteDatabase, merchant: String, amount: Double): Long {
        var lastPayment: Long = 0
        val cursor = db.rawQuery("SELECT last_payment FROM autopay WHERE merchant = ? AND amount = ?", arrayOf(merchant, amount.toString()))
        if (cursor.moveToFirst()) {
            lastPayment = cursor.getLong(0)
        }
        cursor.close()
        return lastPayment
    }
}
