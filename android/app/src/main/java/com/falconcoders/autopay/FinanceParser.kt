package com.falconcoders.autopay

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
    private val nachPattern = Pattern.compile("\\bnach\\b")
    private val achPattern = Pattern.compile("\\bach\\b")
    private val ecsPattern = Pattern.compile("\\becs\\b")

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
            "Loan / EMI" -> b.contains("disbursed") || b.contains("disbursment") || b.contains("credited")
            "Insurance" -> b.contains("claim") && (b.contains("credited") || b.contains("received") || b.contains("paid"))
            "Investment" -> b.contains("dividend") || b.contains("redemption") || b.contains("redeemed") || 
                            b.contains("interest") || b.contains("maturity") || b.contains("proceeds")
            "Subscription", "OTT", "Recharge", "Bill", "Shopping" -> b.contains("refund") || b.contains("credited back") || b.contains("reversal") || b.contains("credited") || (b.contains("received") && b.contains("credit card"))
            else -> false
        }
    }

    private fun validateCredit(body: String): Boolean {
        val b = body.lowercase(Locale.US)
        val hasCreditWords = b.contains("credited") || b.contains("received") || b.contains("deposited") || 
                b.contains("refund") || b.contains("dividend") || b.contains("disbursed") || b.contains("reversal")
                
        val hasAccountRef = b.contains("a/c") || b.contains("acct") || b.contains("account") || 
                b.contains("card") || b.contains("ending") || b.contains("no:") || b.contains("xx") ||
                b.contains("to your bank") || b.contains("in your bank") ||
                b.contains("fastag") || b.contains("prepaid") || b.contains("mobile") ||
                Regex("[a-z]{2,}\\*{4,}\\d{3,}").containsMatchIn(b) // masked PF/EPF account e.g. BGBNG******0646
                
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
        if (!hasLetter && !b.startsWith("test:") && !b.startsWith("soundbox:")) return false

        // 1. OTP / Verification code check
        if (b.contains("otp") || b.contains("one time password") || b.contains("one-time password") || 
            b.contains("verification code") || b.contains("secret code") || b.contains("verification pin")
        ) {
            return false
        }

        // Block failed / declined / returned transaction messages (no actual money transferred)
        if (b.contains("failed") || b.contains("declined") || b.contains("rejected") || b.contains("rejection") || b.contains("not debited") || b.contains("not credited") || b.contains("returned") || b.contains("insufficient") || b.contains("missed payment") || b.contains("delayed payment charges") || b.contains("blocking of funds") || b.contains("blocking of fund") || b.contains("welcome to airtel postpaid") || b.contains("plan charges: rs.") || b.contains("has been cancelled") || b.contains("has been revoked") || b.contains("successfully revoked") || b.contains("has been deactivated") || b.contains("successfully deactivated")) {
            return false
        }

        // Block UPI collect requests / request money messages (not actual transactions)
        if (b.contains("has requested money") || b.contains("requested money")) {
            return false
        }

        // Block AutoPay setup, creation, and registration messages (no money debited yet)
        val isSetupOnly = (
            b.contains("created") || 
            b.contains("registered") || 
            b.contains("setup") ||
            b.contains("mandate set") ||
            b.contains("mandate configured")
        ) && !b.contains("revoked") && !b.contains("cancelled") && !b.contains("cancel") && 
          !b.contains("deactivated") && !b.contains("stopped") &&
          !b.contains("debited") && !b.contains("spent") && !b.contains("paid") && 
          !b.contains("successfully processed") && !b.contains("processed successfully")

        if (isSetupOnly) {
            return false
        }

        // Block mandate revocation notifications (money was NOT debited — just mandate cancelled)
        val isRevocationOnly = (b.contains("revoked") || b.contains("mandate revoked") || b.contains("autopay revoked")) &&
            !b.contains("debited") && !b.contains("spent") && !b.contains("paid") && !b.contains("credited")
        if (isRevocationOnly) {
            return false
        }

        // Block wallet/app top-up credit confirmations from merchant senders (e.g. Milkbasket)
        if (b.contains("top-up") && b.contains("credited") && b.contains("new balance")) {
            return false
        }

        // Block scheduled reminder messages (future auto-debit warnings)
        val isScheduledReminder = 
            b.contains("will be deducted") || 
            b.contains("will be debited") || 
            b.contains("to be debited") || 
            b.contains("is due by") || 
            b.contains("scheduled for debit") ||
            (b.contains("scheduled for") && b.contains("nach"))

        if (isScheduledReminder) {
            return false
        }

        if (b.contains("waiver")) {
            return false
        }

        // 1a. Block ledger updates/entries from merchant tools (avoid double-counting)
        if (b.contains("ledger") && (b.contains("debited your ledger") || b.contains("credited your ledger") || b.contains("your ledger") || b.contains("ledger with"))) {
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
        // Block welcome/adjustment/receipt carrier notifications to prevent duplicate accounting or false positives
        if (b.contains("off your bill") || b.contains("validity left") || b.contains("updated against") || b.contains("payment is updated")) {
            return false
        }

        if (b.contains("sim change") || b.contains("sim card") || b.contains("carrier charge") || b.contains("retailer will charge")) {
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
        if (b.contains("invoice") && (b.contains("raised") || b.contains("generated") || b.contains("is raised") || b.contains("has been raised")) &&
            !b.contains("paid") && !b.contains("successful") && !b.contains("debited") && !b.contains("credited")
        ) {
            return false
        }
        // 5. Credit card / loan bill due reminders — two-factor check to avoid false positives
        //    Factor A: a "something is due" signal
        //    Factor B: a call-to-action OR "ignore if paid" signal (unique to reminders, not confirmations)
        //    Both must be present, with no real debit/credit evidence
        val hasDueSignal = b.contains("is due on") || b.contains("due on") || b.contains("overdue") ||
            b.contains("total due") || b.contains("min due") ||
            b.contains("stmt alert") || b.contains("statement alert") ||
            b.contains("amount due") || b.contains("minimum amount due") ||
            b.contains("payable by") || b.contains("payment due") ||
            b.contains("amount to be paid") || b.contains("due date:") ||
            b.contains("invoice") || b.contains("is raised") || b.contains("raised") ||
            b.contains("fees due") || b.contains("fee due") || b.contains("dues") || b.contains("reminder") || b.contains("remind") ||
            b.contains("outstanding") || b.contains("unpaid") || b.contains("isn't paid") || b.contains("settle") ||
            b.contains("suspended") || b.contains("disconnected") || b.contains("disconnect") ||
            b.contains("due for") || b.contains("is due")
        val hasReminderCta = b.contains("ignore if paid") || b.contains("if already paid") ||
            b.contains("pay now") || b.contains("pay immediately") ||
            b.contains("click") && (b.contains("to pay") || b.contains("pay.billdesk") || b.contains("icici.co")) ||
            b.contains("maintain sufficient") || b.contains("ensure sufficient") ||
            b.contains("delayed") || b.contains("minimum due") || b.startsWith("pay ")
        val hasActualTxEvidence = b.contains("debited") || b.contains("credited") ||
            b.contains("spent") || b.contains("transferred") || b.contains("withdrawn")
        if (hasDueSignal && hasReminderCta && !hasActualTxEvidence) {
            return false
        }

        val currencyPattern = Pattern.compile("(?:rs\\.?|inr|₹|usd)\\s*\\d", Pattern.CASE_INSENSITIVE)
        val hasAmount = currencyPattern.matcher(b).find()
        val hasFinKeywords = b.contains("debited") || b.contains("credited") || b.contains("spent") || paidPattern.matcher(b).find() ||
                b.contains("payment") || b.contains("withdrawn") || b.contains("deposited") || b.contains("mandate") ||
                b.contains("autopay") || b.contains("standing instruction") || emiPattern.matcher(b).find() || sipPattern.matcher(b).find() ||
                chargePattern.matcher(b).find() || rechargePattern.matcher(b).find() || b.contains("renewed") || b.contains("debit") || b.contains("received") ||
                b.contains("auto pay") || b.contains("auto-debit") || b.contains("recurring") || b.contains("disbursed") || b.contains("refund") ||
                // Sent/transferred UPI messages: "Sent Rs.X" style
                b.contains("sent rs") || b.contains("sent inr") || b.contains("sent ₹") ||
                b.contains("transferred rs") || b.contains("transferred inr")

        return hasAmount && hasFinKeywords
    }

    fun parseFinancialSMS(smsId: String, sender: String, body: String, date: Long): ParsedSMS? {
        var cleanBody = body
        if (body.startsWith("test:", ignoreCase = true)) {
            cleanBody = body.substring(5).trim()
        } else if (body.startsWith("soundbox:", ignoreCase = true)) {
            cleanBody = body.substring(9).trim()
        }

        if (isPromotional(cleanBody)) return null
        
        val b = cleanBody.lowercase(Locale.US)
        val s = sender.uppercase(Locale.US)

        var amount = 0.0
        val amountPatterns = listOf(
            // Foreign currency transactions: "USD 39.00 spent..." — must run first to avoid INR avl limit being picked up
            Pattern.compile("(?:usd|eur|gbp|sgd|aed|aud|cad|jpy)\\s*([\\d,]+(?:\\.\\d{1,2})?)"),
            // EPF: grab "Contribution of Rs. X" before the generic Rs. pattern picks up the balance
            Pattern.compile("contribution\\s+of\\s+(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)"),
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
            // Wallets / Payment Gateways
            "APAY" to "Amazon Pay",
            "AMAZONPAY" to "Amazon Pay",
            "JUSPAY" to "Juspay",
            "PAYTM" to "Paytm",
            
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
            "FEDERAL" to "Federal Bank",
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
        if (b.contains("contribution") && (b.contains("epf") || b.contains("provident fund") ||
            b.contains("passbook") || b.contains("due month") || b.contains("uan") || b.contains("epfo"))) {
            // EPF / EPFO contribution confirmation
            category = "Investment"
        } else if (b.contains("refund") || b.contains("reversal") || (b.contains("credited") && !b.contains("debited") && (b.contains("amazon") || b.contains("flipkart") || b.contains("myntra") || b.contains("milkbasket")))) {
            category = "Refund"
        } else if (b.contains("netflix") || b.contains("spotify") || b.contains("amazon prime") || 
            b.contains("youtube premium") || b.contains("disney") || b.contains("hotstar") || 
            b.contains("sony liv") || b.contains("sonyliv") || b.contains("zee5") || b.contains("jiocinema") || b.contains("jio cinema") || b.contains("tataplay") ||
            b.contains("xstream") || b.contains("airtelxstream")) {
            category = "OTT"
        } else if (b.contains("apple") || b.contains("google play") || b.contains("subscription") || b.contains("prime membership")) {
            category = "Subscription"
        } else if ((emiPattern.matcher(b).find() && !b.contains("convert to emi") && !b.contains("convert this txn to emi") && !b.contains("convert this transaction to emi")) || b.contains("loan") || b.contains("housing finance") || b.contains("car loan")) {
            category = "Loan / EMI"
        } else if (sipPattern.matcher(b).find() || b.contains("mutual fund") || b.contains("groww") || 
            b.contains("zerodha") || b.contains("upstox") || b.contains("investment")) {
            category = "Investment"
        } else if (b.contains("electricity") || b.contains("power") || b.contains("bescom") || 
            b.contains("water bill") || b.contains("gas bill") || b.contains("utility bill") ||
            b.contains("amazonaws") || b.contains("amazonawsesc") || b.contains("awsesc") ||
            b.contains("fixedline") || b.contains("broadband") ||
            (b.contains("amazon pay") && b.contains("bill"))) {
            category = "Bill"
        } else if (b.contains("insurance") || b.contains("premium") || licPattern.matcher(b).find() ||
            b.contains("max life") || b.contains("maxlife") || b.contains("hdfc life") ||
            b.contains("sbi life") || b.contains("bajaj allianz") || b.contains("star health") ||
            b.contains("new india") || b.contains("national insurance") || b.contains("oriental insurance")) {
            category = "Insurance"
        } else if (b.contains("toll") || b.contains("fastag") || Pattern.compile("\\bplaza\\b", Pattern.CASE_INSENSITIVE).matcher(b).find()) {
            category = "Toll / FASTag"
        } else if (b.contains("recharge") || b.contains("mobile recharge") || b.contains("jio") || 
            b.contains("airtel") || b.contains("vi prepaid") ||
            (b.contains("amazon pay") && b.contains("recharge"))) {
            category = "Recharge"
        } else if (b.contains("cashback")) {
            category = "Cashback"
        } else if (b.contains("interest")) {
            category = "Interest"
        } else if (b.contains("swiggy") || b.contains("zomato") || b.contains("restaurant") || b.contains("food") || b.contains("milkbasket")) {
            category = "Food"
        } else if (b.contains("fuel") || b.contains("petrol") || b.contains("diesel")) {
            category = "Fuel"
        } else if (b.contains("irctc") || b.contains("travel") || Pattern.compile("\\b(?:uber|ola|flight|train|cab)s?\\b", Pattern.CASE_INSENSITIVE).matcher(b).find()) {
            category = "Travel"
        } else if (b.contains("amazon") || b.contains("flipkart") || b.contains("myntra") || b.contains("shopping")) {
            category = "Shopping"
        } else if (b.contains("cheque") || b.contains("chq") || b.contains("check no") || b.contains("cleared")) {
            category = "Bank Transfer"
        } else if (b.contains("imps") || b.contains("neft") || b.contains("rtgs")) {
            category = "Bank Transfer"
        } else if ((b.contains("sent rs") || b.contains("sent inr") || b.contains("sent ₹") ||
            b.contains("transferred rs") || b.contains("transferred inr")) &&
            (b.contains("upi") || (b.contains("from") && b.contains("to")))) {
            category = "Bank Transfer"
        } else if (b.contains("debited") && b.contains("credited")) {
            category = "Bank Transfer"
        } else if ((b.contains("credited") || b.contains("received")) && b.contains("from")) {
            category = "Bank Transfer"
        } else if (b.contains("payment") && (b.contains("received") || b.contains("towards") || b.contains("thank you")) && b.contains("credit card")) {
            category = "Bill"
        } else if (!b.contains("credited") && !b.contains("received") && (achPattern.matcher(b).find() || nachPattern.matcher(b).find()) && bankKeywords.keys.any { b.contains(it.lowercase(Locale.US)) }) {
            category = "Loan / EMI"
        }

        var merchant = "Unknown Merchant"
        val merchantPatterns = listOf(
            // UPI request money: "[Merchant] has requested money..."
            Pattern.compile("(?:^|\\n)([a-zA-Z0-9\\s\\.\\*\\&\\-]{2,40}?)\\s+(?:and\\s+)?has\\s+requested\\s+money", Pattern.CASE_INSENSITIVE),
            // Multiline "To [Merchant]" pattern — highest priority (e.g. HDFC UPI sent messages)
            Pattern.compile("(?:^|\\n)to\\s+([a-zA-Z][a-zA-Z0-9\\s\\.\\*\\&\\-]{2,29}?)\\s*(?=\\n|\$)", Pattern.MULTILINE),
            // Credit card international spend: "USD X spent using Bank Card on DATE on MERCHANT."
            Pattern.compile("spent.{5,60}?\\bon\\s+([a-zA-Z][a-zA-Z0-9\\s\\.\\*\\&\\-\\,\\_]{2,29}?)\\s*(?:\\.|avl|if not|\$)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:created towards|towards|mandate towards|payment towards)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-\\,]{3,50}?)\\s*\\b(?:for|from|is|was|has|on|ref|via|any|umn)\\b"),
            Pattern.compile("(?:subscription to|payment for|payment to|mandate to)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-\\,]{3,50}?)\\s*\\b(?:is|was|has|on|ref|via|any)\\b"),
            // Jar mandate: "For Jar mandate"
            Pattern.compile("for\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{2,20}?)\\s+mandate", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:processed payment of|payment of|paid for|processed for|for)\\s+(?:(?:rs\\.?|inr|₹)\\s*[\\d,.]+\\s+(?:for|to)\\s+(?:merchant\\s+)?)?([a-zA-Z0-9\\s\\.\\*\\&\\_\\-]{2,30}?)\\s*(?:,|\\bas\\b|\\bon\\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([a-zA-Z0-9\\s\\.\\*\\&\\-]{2,20}?)\\s+(?:top-up|topup)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("at\\s+([a-zA-Z0-9\\s\\.\\*\\&\\_\\,]{3,30}?)(?:\\s*\\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\\b|\$)"),
            Pattern.compile("(?:sent to|paid to)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\_\\,]{3,30}?)(?:\\s*\\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\\b|\$)"),
            Pattern.compile("spent\\s+on\\s+([a-zA-Z0-9\\s\\.\\*\\&\\_\\,]{3,30}?)(?:\\s*\\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\\b|\$)"),
            Pattern.compile("(?:for your|your)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s+(?:order|membership|subscription|purchase|booking)"),
            Pattern.compile("info:\\s*([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("debited\\s+at\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("transfer to\\s+([a-zA-Z0-9\\s\\.\\*]{3,20})"),
            Pattern.compile("InfoACH\\*([a-zA-Z0-9\\s\\.\\*\\&\\-]{2,20}?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("InfoBIL\\*(?:INFT\\*)?([a-zA-Z0-9\\s\\.\\*\\&\\-]{2,20}?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:info|ref)\\s+(?:neft|imps|rtgs|upi)[-/\\*\\s]+[a-zA-Z0-9]{8,25}[-/\\*\\s]+([a-zA-Z0-9\\s\\*\\&\\-]{2,30}?)(?:\\.|\\b(?:on|at|is|was|has|available|bal|balance|ref|if|revised)\\b|$)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:raised by|mandate raised by)\\s+([a-zA-Z0-9\\s\\.\\*\\&\\-\\,]{3,50}?)\\s*\\b(?:on|from|is|was|has|via|ref|\\$)\\b"),
            Pattern.compile("([a-zA-Z0-9\\s\\.\\*\\&\\-]{3,30}?)\\s+(?:refund|reversal)\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:from vpa|vpa)\\s+([a-zA-Z0-9\\.\\-_]{3,30}?)(?:@|\\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:transfer from|received from|credited from|sent from|from)\\s*:?\\s*([a-zA-Z0-9\\s\\.\\*\\&\\-\\/]{3,30}?)\\s*\\b(?:upi|ref|rrn|txn|on|at|is|was|has|to|balance|avbl|limit|total|bal|cr|dr)\\b"),
            // P2P UPI: "PRAHALAD SINGH credited" — name appears before "credited"
            Pattern.compile("([a-zA-Z][a-zA-Z0-9\\s]{2,28}?)\\s+credited\\b", Pattern.CASE_INSENSITIVE)
        )

        for (pattern in merchantPatterns) {
            val matcher = pattern.matcher(b)
            if (matcher.find()) {
                val tempMerchant = matcher.group(1)?.trim() ?: "Unknown Merchant"
                var cleanedMerchant = tempMerchant.split(" txn ")[0].split(" ref ")[0].split(" date ")[0].trim()
                while (cleanedMerchant.isNotEmpty() && (cleanedMerchant.endsWith(".") || cleanedMerchant.endsWith(",") || cleanedMerchant.endsWith("*") || cleanedMerchant.endsWith("-"))) {
                    cleanedMerchant = cleanedMerchant.substring(0, cleanedMerchant.length - 1).trim()
                }
                val lowerM = cleanedMerchant.lowercase(Locale.US)
                if (cleanedMerchant.all { it.isDigit() }) {
                    continue
                }
                if ((lowerM.startsWith("rs ") || lowerM.startsWith("rs.") || lowerM.startsWith("inr ") || lowerM.startsWith("₹") || lowerM.startsWith("usd ")) && cleanedMerchant.any { it.isDigit() }) {
                    continue
                }
                if (lowerM.contains("a/c") || lowerM.contains("acct") || lowerM.contains("account") || 
                    lowerM.contains("card") || lowerM.contains("ending") || lowerM.contains("bank") || 
                    lowerM.contains("no:") || lowerM.length < 3 ||
                    lowerM == "will be" || lowerM == "and will be" || lowerM == "to be" || lowerM == "has been" ||
                    lowerM.contains("contact") || lowerM.contains("support") || lowerM.contains("customer") || 
                    lowerM.contains("please") || lowerM.contains("request") || lowerM.contains("initiate") || 
                    lowerM.contains("eligible") || lowerM.contains("claim")) {
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

        // Fix 5: Detect EPFO / PF contribution sender — set merchant explicitly
        if (merchant == "Unknown Merchant") {
            if (s.contains("EPFO") || s.contains("EPFOHO") || s.contains("PFMSGR") ||
                (b.contains("contribution") && b.contains("due month")) ||
                (b.contains("passbook") && b.contains("contribution"))) {
                merchant = "EPFO"
            }
        }

        // Fix Cheque: extract cheque number as merchant identifier
        if (merchant == "Unknown Merchant" && (b.contains("cheque") || b.contains("chq"))) {
            val chequeNoPattern = Pattern.compile("(?:cheque|chq)\\s+no\\.?\\s*(\\d+)", Pattern.CASE_INSENSITIVE)
            val chequeNoMatcher = chequeNoPattern.matcher(b)
            merchant = if (chequeNoMatcher.find()) {
                "Cheque No. ${chequeNoMatcher.group(1)}"
            } else {
                "$bank Cheque"
            }
        }

        // Fix: Extract trailing "Team [CompanyName]" as merchant (e.g. insurance/fintech confirmation SMSes)
        if (merchant == "Unknown Merchant") {
            val teamPattern = Pattern.compile("team\\s+([a-zA-Z][a-zA-Z0-9\\s]{2,30}?)\\s*$", Pattern.MULTILINE or Pattern.CASE_INSENSITIVE)
            val teamMatcher = teamPattern.matcher(b)
            if (teamMatcher.find()) {
                val teamName = teamMatcher.group(1)?.trim() ?: ""
                if (teamName.length >= 3) {
                    merchant = teamName.split(" ").joinToString(" ") { w ->
                        if (w.isNotEmpty()) w[0].uppercaseChar() + w.substring(1) else ""
                    }
                }
            }
        }

        val commonMerchants = listOf(
            "netflix", "spotify", "amazon prime", "amazon", "youtube", "google play", "google one", "google cloud", "google",
            "apple", "swiggy", "zomato", "uber", "ola", "flipkart", "myntra", "groww", "zerodha",
            "lic", "airtel", "jio", "vi", "tataplay", "fastag", "scapia", "jar", "milkbasket",
            "act fibernet", "smytten", "jvvnl", "national pension", "lenskart", "cred_fastag"
        )

        val merchantLower = merchant.lowercase(Locale.US)
        val matchedCommon = commonMerchants.find { m -> 
            merchantLower == m || (merchantLower.contains("unknown") && 
                Pattern.compile("\\b" + Pattern.quote(m) + "\\b", Pattern.CASE_INSENSITIVE).matcher(b).find())
        }

        if (matchedCommon != null) {
            merchant = when (matchedCommon) {
                "amazon prime" -> "Amazon Prime"
                "google play" -> "Google Play"
                "google one" -> "Google One"
                "google cloud" -> "Google Cloud"
                "tataplay" -> "Tata Play"
                "fastag" -> "FASTag"
                "cred_fastag" -> "CRED FASTag"
                "act fibernet" -> "ACT Fibernet"
                "jvvnl" -> "JVVNL"
                "smytten" -> "Smytten"
                "national pension" -> "National Pension System"
                "lenskart" -> "Lenskart"
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

        // Loan/EMI with no extractable merchant — fall back to the lending bank
        if (merchant == "Unknown Merchant" && category == "Loan / EMI" && bank != "Unknown Bank") {
            merchant = bank
        }

        // Credit Card payments with no extractable merchant — fall back to "[Bank] Credit Card"
        if (merchant == "Unknown Merchant" && (category == "Bill" || category == "Refund" || category == "Cashback") && b.contains("credit card")) {
            merchant = if (bank != "Unknown Bank") "$bank Credit Card" else "Credit Card"
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
            val isCreditCategory = category == "Refund" || category == "Interest"
            val hasCreditKeywords = b.contains("credited") || b.contains("received") || b.contains("deposited") || b.contains("refund")
            
            val hasMisleadingCreditWords = (b.contains("credit card") || b.contains("credit limit") || 
                    b.contains("credit score") || b.contains("credit report") || b.contains("credit line") || 
                    b.contains("credit available") || b.contains("credit eligibility") || b.contains("credit facility") || 
                    b.contains("credit offer") || b.contains("credit approval")) &&
                    !b.contains("refund") && !b.contains("reversal") && !b.contains("credited to") && !b.contains("waiver") && !b.contains("credited back")
                    
            if ((isCreditCategory || hasCreditKeywords) && !hasMisleadingCreditWords) {
                type = "CREDIT"
            }
        }

        // Fix 4: EPF contributions are salary deductions — always DEBIT even though message says "received"
        if (b.contains("contribution") && b.contains("due month") && type == "CREDIT") {
            type = "DEBIT"
        }

        // Fix: P2P UPI transfer — "Acct debited; [PERSON] credited" means money went OUT (DEBIT)
        // The "credited" refers to the recipient, not the sender's account
        if (b.contains("debited") && b.contains("credited") && type == "CREDIT") {
            type = "DEBIT"
        }

        if (type == "CREDIT" && !validateCredit(body)) {
            val hasDebitKeywords = b.contains("debited") || b.contains("spent") || b.contains("paid") || b.contains("transferred") || b.contains("withdrawn")
            if (hasDebitKeywords) {
                type = "DEBIT"
            } else {
                return null
            }
        }

        var isAutoPay = b.contains("autopay") || b.contains("auto pay") || b.contains("mandate") || 
            b.contains("standing instruction") || b.contains("standing instr") || b.contains("recurring") || 
            b.contains("auto debit") || b.contains("auto-debit") || b.contains("debit instruction") || 
            Pattern.compile("\\bsi\\b").matcher(b).find() || // \bsi\b = Standing Instruction (word boundary avoids 'visit', 'services' etc.)
            nachPattern.matcher(b).find() || achPattern.matcher(b).find() || ecsPattern.matcher(b).find() || 
            b.contains("renewal successful") || b.contains("subscription renewed") || b.contains("renewed successfully")

        if (isAutoPay && b.contains("register") && (b.contains("to enable") || b.contains("enable auto-debit") || b.contains("enable autopay") || b.contains("activate auto-debit"))) {
            isAutoPay = false
        }

        if (type == "CREDIT") {
            isAutoPay = false
        }

        var finalCategory = category
        if (isAutoPay && (finalCategory == "Others" || finalCategory == "Bank Transfer")) {
            finalCategory = "Subscription"
        }

        if ((finalCategory == "Others" || finalCategory == "Bank Transfer") && isHumanName(merchant)) {
            finalCategory = "Peoples"
        }

        var autoPayStatus = "Active"
        if (b.contains("cancel") || b.contains("revoked") || b.contains("deactivated") || b.contains("stopped")) {
            autoPayStatus = "Cancelled"
        } else if (b.contains("failed") || b.contains("declined") || b.contains("missed") || b.contains("rejection") || b.contains("not debited") || b.contains("returned") || b.contains("insufficient")) {
            autoPayStatus = "Missed"
        }

        var paymentMethod = "UPI"
        if (b.contains("cheque") || b.contains("chq") || b.contains("check no")) {
            paymentMethod = "Cheque"
        } else if (b.contains("wallet") || b.contains("apay balance") || b.contains("amazon pay balance") || b.contains("paytm balance")) {
            paymentMethod = "Wallet"
        } else if (b.contains("card") || b.contains("credit card") || b.contains("debit card") || b.contains("visa") || b.contains("mastercard") || b.contains("rupay")) {
            paymentMethod = "Card"
        } else if (nachPattern.matcher(b).find() || achPattern.matcher(b).find() || b.contains("netbanking") || b.contains("neft") || b.contains("imps") || b.contains("rtgs") || ecsPattern.matcher(b).find()) {
            paymentMethod = if (nachPattern.matcher(b).find() || achPattern.matcher(b).find()) "NACH" else "Bank Transfer"
        } else if (b.contains("bank account") || b.contains("registered account") || b.contains("auto debit") || b.contains("auto-debit") || b.contains("a/c")) {
            if (!b.contains("upi") && !b.contains("vpa") && !b.contains("@")) {
                paymentMethod = "Bank Transfer"
            }
        } else if (!b.contains("upi") && !b.contains("@") &&
            (category == "Insurance" || category == "Investment" || category == "Loan / EMI")) {
            // No UPI evidence — don't assume UPI for non-transactional confirmation messages
            paymentMethod = "Unknown"
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
            status = when {
                b.contains("failed") || b.contains("declined") || b.contains("rejected") || b.contains("rejection") || b.contains("not debited") || b.contains("not credited") || b.contains("returned") || b.contains("insufficient") -> "Failed"
                b.contains("scheduled for debit") || b.contains("will be debited") || b.contains("will be deducted") || b.contains("to be debited") || b.contains("is due by") ||
                b.contains("maintain sufficient") || b.contains("ensure sufficient") ||
                b.contains("scheduled for") && b.contains("nach") -> "Scheduled"
                else -> "Success"
            },
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

    private fun isHumanName(name: String): Boolean {
        if (name.isEmpty() || name == "Unknown Merchant") return false
        
        var clean = name.trim().lowercase(Locale.US)
        
        // Remove common honorifics/titles
        clean = clean.replace(Regex("^(mr|mrs|ms|dr|prof|mx)\\.?\\s+"), "")
        
        // Must contain only letters and spaces
        if (!clean.matches(Regex("^[a-zA-Z\\s]+$"))) return false
        
        // Must be 2 or 3 words
        val words = clean.trim().split(Regex("\\s+"))
        if (words.size < 2 || words.size > 3) return false
        
        // Check if any word is too short
        if (words.any { it.length < 2 }) return false
        
        // List of non-human merchant/business indicators
        val businessKeywords = listOf(
            "ltd", "limited", "pvt", "private", "corp", "corporation", "solutions", "technology", "technologies", 
            "service", "services", "store", "stores", "shop", "shops", "retail", "food", "foods", "caterer", "caterers", 
            "communication", "communications", "telecom", "digital", "venture", "ventures", "enterprise", "enterprises", 
            "agency", "agencies", "travel", "travels", "academy", "school", "college", "university", "hospital", 
            "lab", "labs", "diagnostics", "clinic", "pharmacy", "associate", "associates", "foundation", "trust", 
            "club", "association", "bank", "cooperative", "bazaar", "mart", "supermarket", "pay", "payment", "payments",
            "billing", "recharge", "broadband", "optical", "gas", "electricity", "power", "water",
            "restaurant", "hotel", "cafe", "dhaba", "sweet", "sweets", "bakery", "dairy", "dairies", "milk", "filling",
            "petrol", "pump", "oil", "desk", "gateway", "billdes", "billdesk", "distribution", "distributors",
            "marketing", "media", "entertainment", "fintech", "insurance", "investment", "mutual", "fund", "funds",
            "salary", "bonus", "reimbursement", "dividend", "interest", "refund"
        )
        
        if (businessKeywords.any { clean.contains(it) }) return false
        
        // Also verify it doesn't match any of our common merchants
        val commonMerchants = listOf(
            "netflix", "spotify", "amazon prime", "amazon", "youtube", "google play", "google one", "google cloud", "google",
            "apple", "swiggy", "zomato", "uber", "ola", "flipkart", "myntra", "groww", "zerodha",
            "lic", "airtel", "jio", "vi", "tataplay", "fastag", "scapia", "jar", "milkbasket",
            "act fibernet", "smytten", "jvvnl", "national pension", "lenskart", "cred_fastag", "irctc"
        )
        
        if (commonMerchants.any { clean.contains(it) }) return false
        
        return true
    }
}
