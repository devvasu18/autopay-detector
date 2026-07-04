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
        val autoPayStatus: String,
        val isSetupOrCancellation: Boolean
    )

    private fun isPromotional(body: String): Boolean {
        val b = body.lowercase(Locale.US)
        val promotionalKeywords = listOf(
            "offer", "eligible", "pre-approved", "preapproved", "apply now", "instant loan",
            "cashback up to", "reward points", "click here", "click to", "apply here",
            "limited time", "buy now", "shop now", "upgrade", "exclusive", "lucky draw",
            "win cash", "congratulations", "congrats", "won rs", "pre-approved loan",
            "loan offer", "sanctioned", "credit eligibility", "credit limit increased",
            "bonus", "voucher", "coupon", "promo", "sale", "discount", "free", "win", 
            "claim your", "credit report", "credit score", "credit line", "credit facility",
            "credit offer", "credit approval", "credit limit"
        )
        
        var hasPromoKeyword = false
        for (kw in promotionalKeywords) {
            if (b.contains(kw)) {
                hasPromoKeyword = true
                break
            }
        }
        
        if (b.contains("http") || b.contains("https") || b.contains("www")) {
            hasPromoKeyword = true
        }

        if (hasPromoKeyword) {
            val hasTxEvidence = b.contains("debited") || b.contains("credited") || b.contains("spent") || 
                    b.contains("paid") || b.contains("transferred") || b.contains("withdrawn") || 
                    b.contains("deposited") || b.contains("disbursed") || b.contains("auto debit") || 
                    b.contains("auto pay") || b.contains("auto-debit") || b.contains("successful") || 
                    b.contains("success")
            return !hasTxEvidence
        }
        return false
    }

    private fun hasCreditProof(category: String, body: String): Boolean {
        val b = body.lowercase(Locale.US)
        return when (category) {
            "Loan / EMI" -> b.contains("disbursed") || b.contains("disbursment")
            "Insurance" -> b.contains("claim") && (b.contains("credited") || b.contains("received") || b.contains("paid"))
            "Investment" -> b.contains("dividend") || b.contains("redemption") || b.contains("redeemed") || 
                            b.contains("interest") || b.contains("maturity") || b.contains("proceeds")
            "Subscription", "OTT", "Recharge", "Bill", "Shopping" -> b.contains("refund") || b.contains("credited back") || b.contains("reversal")
            else -> false
        }
    }

    private fun validateCredit(body: String): Boolean {
        val b = body.lowercase(Locale.US)
        val hasCreditWords = b.contains("credited") || b.contains("received") || b.contains("deposited") || 
                b.contains("refund") || b.contains("dividend") || b.contains("disbursed") || b.contains("reversal")
                
        val hasAccountRef = b.contains("a/c") || b.contains("acct") || b.contains("account") || 
                b.contains("card") || b.contains("ending") || b.contains("no:") || b.contains("xx") ||
                b.contains("to your bank") || b.contains("in your bank")
                
        val hasSuccessIndicator = b.contains("success") || b.contains("successful") || b.contains("credited") || 
                b.contains("received") || b.contains("done") || b.contains("processed") || b.contains("completed") || b.contains("disbursed")
                
        return hasCreditWords && hasAccountRef && hasSuccessIndicator
    }

    fun isFinancialSMS(sender: String?, body: String?): Boolean {
        if (sender == null || body == null) return false
        if (isPromotional(body)) return false
        
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

        // 3. Telecom Carrier Data Consumption/Usage Warning Alerts (not transactions)
        if (b.contains("data is consumed") || b.contains("data consumed") || 
            b.contains("high speed data") || b.contains("data limit") || 
            b.contains("daily data") || b.contains("speed data limit")
        ) {
            return false
        }

        // 4. Bill generated / Invoice Alerts (liability reminders, not transactions)
        if (b.contains("bill") && (b.contains("generated") || b.contains("has been generated") || b.contains("is generated"))) {
            return false
        }
        if ((b.contains("amount to be paid") || b.contains("amount due") || b.contains("payment due") || b.contains("due date:")) &&
            !b.contains("debited") && !b.contains("paid") && !b.contains("spent")
        ) {
            return false
        }

        val hasAmount = b.contains("rs") || b.contains("rs.") || b.contains("inr") || b.contains("₹") || b.contains("usd")
        val hasFinKeywords = b.contains("debited") || b.contains("credited") || b.contains("spent") || paidPattern.matcher(b).find() ||
                b.contains("payment") || b.contains("withdrawn") || b.contains("deposited") || b.contains("mandate") ||
                b.contains("autopay") || b.contains("standing instruction") || emiPattern.matcher(b).find() || sipPattern.matcher(b).find() ||
                chargePattern.matcher(b).find() || rechargePattern.matcher(b).find() || b.contains("renewed") || b.contains("debit") || b.contains("received") ||
                b.contains("auto pay") || b.contains("auto-debit") || b.contains("recurring") || b.contains("disbursed") || b.contains("refund")

        return hasAmount && hasFinKeywords
    }

    fun parseFinancialSMS(smsId: String, sender: String, body: String, date: Long): ParsedSMS? {
        if (isPromotional(body)) return null
        
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

        var bank = "Unknown Bank"
        val bankKeywords = mapOf(
            // Private Sector Banks
            "HDFC" to "HDFC Bank",
            "ICICI" to "ICICI Bank",
            "AXIS" to "Axis Bank",
            "KOTAK" to "Kotak Mahindra Bank",
            "INDUS" to "IndusInd Bank",
            "YESBK" to "Yes Bank",
            "YESB" to "Yes Bank",
            "RBL" to "RBL Bank",
            "FEDBK" to "Federal Bank",
            "FBL" to "Federal Bank",
            "IDFC" to "IDFC FIRST Bank",
            "BANDHAN" to "Bandhan Bank",
            "BDHN" to "Bandhan Bank",
            "KVB" to "Karur Vysya Bank",
            "KTK" to "Karnataka Bank",
            "SIB" to "South Indian Bank",
            "TMB" to "Tamilnad Mercantile Bank",
            "JKB" to "J&K Bank",
            "CUB" to "City Union Bank",
            "DCB" to "DCB Bank",
            "CSB" to "CSB Bank",
            "DBS" to "DBS Bank",

            // Public Sector Banks
            "SBI" to "SBI",
            "PNB" to "Punjab National Bank",
            "BARODA" to "Bank of Baroda",
            "BOB" to "Bank of Baroda",
            "CANARA" to "Canara Bank",
            "CNRB" to "Canara Bank",
            "UNION" to "Union Bank of India",
            "UBIN" to "Union Bank of India",
            "BOI" to "Bank of India",
            "UCO" to "UCO Bank",
            "CENTBK" to "Central Bank of India",
            "CBI" to "Central Bank of India",
            "MAHABK" to "Bank of Maharashtra",
            "BOM" to "Bank of Maharashtra",
            "PSB" to "Punjab & Sind Bank",
            "IDBI" to "IDBI Bank",
            "INDIANB" to "Indian Bank",
            "INDN" to "Indian Bank",
            "IDN" to "Indian Bank",
            "IOB" to "Indian Overseas Bank",

            // Small Finance Banks
            "AUFBL" to "AU Small Finance Bank",
            "AUBANK" to "AU Small Finance Bank",
            "AU" to "AU Small Finance Bank",
            "EQUITAS" to "Equitas Small Finance Bank",
            "UJJIVAN" to "Ujjivan Small Finance Bank",
            "ESAF" to "ESAF Small Finance Bank",
            "SURYODAY" to "Suryoday Small Finance Bank",
            "FINCARE" to "Fincare Small Finance Bank",
            "JANA" to "Jana Small Finance Bank",
            "UTKARSH" to "Utkarsh Small Finance Bank",
            "CAPITAL" to "Capital Small Finance Bank",

            // Payments Banks
            "PAYTM" to "Paytm Payments Bank",
            "PYTM" to "Paytm Payments Bank",
            "AIRTEL" to "Airtel Payments Bank",
            "APBL" to "Airtel Payments Bank",
            "JIO" to "Jio Payments Bank",
            "JPBL" to "Jio Payments Bank",
            "NSDL" to "NSDL Payments Bank",
            "IPPB" to "India Post Payments Bank",

            // Foreign & Major Global Banks
            "HSBC" to "HSBC Bank",
            "CITI" to "Citi Bank",
            "AMEX" to "American Express",
            "SCB" to "Standard Chartered",
            "STANCHAR" to "Standard Chartered",
            "BARCLAYS" to "Barclays",
            "MUFG" to "MUFG Bank",

            // Neo-banks / Fintech Card platforms
            "JUPITER" to "Jupiter",
            "FIMONEY" to "Fi Money",
            "ONECARD" to "OneCard",
            "SLICE" to "slice",
            "UNI" to "Uni Card"
        )
        // Sort keys by length in descending order to avoid prefix overlap issues (e.g. matching UNI instead of UNION)
        val sortedBankKeys = bankKeywords.keys.sortedByDescending { it.length }

        // First try to match bank in the sender
        for (key in sortedBankKeys) {
            if (s.contains(key)) {
                bank = bankKeywords[key] ?: "Unknown Bank"
                break
            }
        }
        // If not found in sender, check body (excluding UPI IDs)
        if (bank == "Unknown Bank") {
            var bodyForBankCheck = b
            val upiPatternForBank = Pattern.compile("[a-zA-Z0-9\\.\\-_]+@[a-zA-Z0-9\\-_]+")
            val upiMatcherForBank = upiPatternForBank.matcher(b)
            if (upiMatcherForBank.find()) {
                bodyForBankCheck = upiMatcherForBank.replaceAll("")
            }
            for (key in sortedBankKeys) {
                if (bodyForBankCheck.contains(key.lowercase(Locale.US))) {
                    bank = bankKeywords[key] ?: "Unknown Bank"
                    break
                }
            }
        }

        var category = "Others"
        if (b.contains("salary")) {
            category = "Salary"
        } else if (b.contains("netflix") || b.contains("spotify") || b.contains("amazon prime") || 
            b.contains("youtube premium") || b.contains("disney") || b.contains("hotstar") || 
            b.contains("sony liv") || b.contains("sonyliv") || b.contains("zee5") || b.contains("jiocinema") || b.contains("jio cinema") || b.contains("tataplay")) {
            category = "OTT"
        } else if (b.contains("apple") || b.contains("google play") || b.contains("subscription") || b.contains("prime membership")) {
            category = "Subscription"
        } else if (emiPattern.matcher(b).find() || b.contains("loan") || b.contains("housing finance") || b.contains("car loan")) {
            category = "Loan / EMI"
        } else if (sipPattern.matcher(b).find() || b.contains("mutual fund") || b.contains("groww") || 
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
            Pattern.compile("(?:created towards|towards|mandate towards|payment towards)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s*(?:for|from|is|was|has|on|ref|via|any|umn)"),
            Pattern.compile("(?:subscription to|payment for|payment to)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s*(?:is|was|has|on|ref|via|any)"),
            Pattern.compile("(?:sent to|paid to|spent on|at)\\s+([a-zA-Z0-9\\s\\.\\*\\&]{3,20}?)\\s*(?:on|via|using|from|for|balance|ref|rrn|vpa)"),
            Pattern.compile("(?:for your|your)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s+(?:order|membership|subscription|purchase|booking)"),
            Pattern.compile("info:\\s*([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("debited\\s+at\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("transfer to\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("(?:transfer from|received from|credited from|sent from|from)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s*\\b(?:upi|ref|rrn|txn|on|at|is|was|has|to|balance|avbl|limit)\\b")
        )

        for (pattern in merchantPatterns) {
            val matcher = pattern.matcher(b)
            if (matcher.find()) {
                val tempMerchant = matcher.group(1)?.trim() ?: "Unknown Merchant"
                var cleanedMerchant = tempMerchant.split(" txn ")[0].split(" ref ")[0].split(" date ")[0].trim()
                if (cleanedMerchant.endsWith(".")) {
                    cleanedMerchant = cleanedMerchant.substring(0, cleanedMerchant.length - 1).trim()
                }
                val lowerM = cleanedMerchant.lowercase(Locale.US)
                if (lowerM.contains("a/c") || lowerM.contains("acct") || lowerM.contains("account") || 
                    lowerM.contains("card") || lowerM.contains("ending") || lowerM.contains("bank") || 
                    lowerM.contains("no:") || lowerM.length < 3) {
                    continue
                }
                merchant = cleanedMerchant
                break
            }
        }

        if (merchant == "Unknown Merchant" && b.contains("atm")) {
            val atmPattern = Pattern.compile("atm\\*([a-zA-Z0-9\\-_]+)\\*")
            val atmMatcher = atmPattern.matcher(b)
            if (atmMatcher.find()) {
                merchant = "ATM " + (atmMatcher.group(1)?.uppercase(Locale.US) ?: "")
            } else {
                merchant = "ATM Withdrawal"
            }
        }

        val commonMerchants = listOf(
            "netflix", "spotify", "amazon prime", "amazon", "youtube", "google play", "google one", "google cloud", "google",
            "apple", "swiggy", "zomato", "uber", "ola", "flipkart", "myntra", "groww", "zerodha",
            "lic", "airtel", "jio", "vi", "tataplay", "fastag"
        )

        val merchantLower = merchant.lowercase(Locale.US)
        val matchedCommon = commonMerchants.find { m -> 
            merchantLower == m || (merchantLower.contains("unknown") && b.contains(m)) 
        }

        if (matchedCommon != null) {
            merchant = when (matchedCommon) {
                "amazon prime" -> "Amazon Prime"
                "google play" -> "Google Play"
                "google one" -> "Google One"
                "google cloud" -> "Google Cloud"
                "tataplay" -> "Tata Play"
                "fastag" -> "FASTag"
                else -> matchedCommon.substring(0, 1).uppercase(Locale.US) + matchedCommon.substring(1)
            }
        } else if (merchant != "Unknown Merchant") {
            merchant = merchant.split(" ").map { word ->
                if (word.isNotEmpty()) {
                    word.substring(0, 1).uppercase(Locale.US) + word.substring(1)
                } else {
                    ""
                }
            }.joinToString(" ")
        }

        val debitOnlyCategories = listOf(
            "Insurance", "Investment", "Loan / EMI", "Bill", "Subscription", "Shopping", "Recharge", "OTT"
        )
        val isDebitOnlyCategory = debitOnlyCategories.contains(category)

        var type = "DEBIT"
        if (isDebitOnlyCategory) {
            if (hasCreditProof(category, body) && (b.contains("credited") || b.contains("received") || b.contains("deposited") || b.contains("disbursed") || b.contains("refund"))) {
                type = "CREDIT"
            }
        } else {
            val isCreditCategory = category == "Salary" || category == "Cashback" || category == "Refund" || category == "Interest"
            val hasCreditKeywords = b.contains("credited") || b.contains("received") || b.contains("deposited") || b.contains("refund")
            
            val hasMisleadingCreditWords = b.contains("credit card") || b.contains("credit limit") || 
                    b.contains("credit score") || b.contains("credit report") || b.contains("credit line") || 
                    b.contains("credit available") || b.contains("credit eligibility") || b.contains("credit facility") || 
                    b.contains("credit offer") || b.contains("credit approval")
                    
            if ((isCreditCategory || hasCreditKeywords) && !hasMisleadingCreditWords) {
                type = "CREDIT"
            }
        }

        if (type == "CREDIT" && !validateCredit(body)) {
            val hasDebitKeywords = b.contains("debited") || b.contains("spent") || b.contains("paid") || b.contains("transferred") || b.contains("withdrawn")
            if (hasDebitKeywords) {
                type = "DEBIT"
            } else {
                return null
            }
        }

        val isAutoPay = b.contains("autopay") || b.contains("auto pay") || b.contains("mandate") || 
            b.contains("standing instruction") || b.contains("standing instr") || b.contains("recurring") || 
            b.contains("auto debit") || b.contains("auto-debit") || b.contains("debit instruction") || 
            b.contains("si") || b.contains("nach") || b.contains("ach") || b.contains("ecs") || 
            b.contains("renewal successful") || b.contains("subscription renewed") || b.contains("renewed successfully")

        var finalCategory = category
        if (isAutoPay && finalCategory == "Others") {
            finalCategory = "Subscription"
        }

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

        val isSetupOrCancellation = isAutoPay && (
            b.contains("created") || 
            b.contains("cancelled") || 
            b.contains("cancel") || 
            b.contains("registered") || 
            b.contains("revoked") || 
            b.contains("deactivated") || 
            b.contains("stopped")
        ) && !b.contains("debited") && !b.contains("paid") && !b.contains("spent")

        return ParsedSMS(
            smsId = smsId,
            merchant = merchant,
            amount = amount,
            date = date,
            paymentMethod = paymentMethod,
            bank = bank,
            type = type,
            category = finalCategory,
            confidence = if (finalCategory == "Others" && merchant == "Unknown Merchant") 0.6 else 0.95,
            status = if (b.contains("failed") || b.contains("declined")) "Failed" else "Success",
            rawBody = body,
            isAutoPay = isAutoPay,
            frequency = "Monthly",
            upiId = upiId,
            autoPayStatus = autoPayStatus,
            isSetupOrCancellation = isSetupOrCancellation
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
