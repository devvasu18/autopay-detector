const fs = require('fs');
const path = require('path');
const readline = require('readline');

const emiPattern = /\bemi\b/i;
const sipPattern = /\bsip\b/i;
const chargePattern = /\bcharge(s|d)?\b/i;
const rechargePattern = /\brecharge(d)?\b/i;
const paidPattern = /\bpaid\b/i;
const licPattern = /\blic\b/i;

function isPromotional(body) {
    const b = body.toLowerCase();
    const promotionalKeywords = [
        "offer", "eligible", "pre-approved", "preapproved", "apply now", "instant loan",
        "cashback up to", "reward points", "click here", "click to", "apply here",
        "limited time", "buy now", "shop now", "upgrade", "exclusive", "lucky draw",
        "win cash", "congratulations", "congrats", "won rs", "pre-approved loan",
        "loan offer", "sanctioned", "credit eligibility", "credit limit increased",
        "bonus", "voucher", "coupon", "promo", "sale", "discount", "free", "win", 
        "claim your", "credit report", "credit score", "credit line", "credit facility",
        "credit offer", "credit approval", "credit limit"
    ];
    
    let hasPromoKeyword = false;
    for (const kw of promotionalKeywords) {
        if (b.includes(kw)) {
            hasPromoKeyword = true;
            break;
        }
    }
    
    if (b.includes("http") || b.includes("https") || b.includes("www")) {
        hasPromoKeyword = true;
    }

    if (hasPromoKeyword) {
        const hasTxEvidence = b.includes("debited") || b.includes("credited") || b.includes("spent") || 
                b.includes("paid") || b.includes("transferred") || b.includes("withdrawn") || 
                b.includes("deposited") || b.includes("disbursed") || b.includes("auto debit") || 
                b.includes("auto pay") || b.includes("auto-debit") || b.includes("successful") || 
                b.includes("success");
        return !hasTxEvidence;
    }
    return false;
}

function hasCreditProof(category, body) {
    const b = body.toLowerCase();
    switch (category) {
        case "Loan / EMI": return b.includes("disbursed") || b.includes("disbursment") || b.includes("credited");
        case "Insurance": return b.includes("claim") && (b.includes("credited") || b.includes("received") || b.includes("paid"));
        case "Investment": return b.includes("dividend") || b.includes("redemption") || b.includes("redeemed") || 
                        b.includes("interest") || b.includes("maturity") || b.includes("proceeds");
        case "Subscription":
        case "OTT":
        case "Recharge":
        case "Bill":
        case "Shopping": return b.includes("refund") || b.includes("credited back") || b.includes("reversal") || b.includes("credited") || (b.includes("received") && b.includes("credit card"));
        default: return false;
    }
}

function validateCredit(body) {
    const b = body.toLowerCase();
    const hasCreditWords = b.includes("credited") || b.includes("received") || b.includes("deposited") || 
            b.includes("refund") || b.includes("dividend") || b.includes("disbursed") || b.includes("reversal");
            
    const hasAccountRef = b.includes("a/c") || b.includes("acct") || b.includes("account") || 
            b.includes("card") || b.includes("ending") || b.includes("no:") || b.includes("xx") ||
            b.includes("to your bank") || b.includes("in your bank") ||
            b.includes("fastag") || b.includes("prepaid") || b.includes("mobile") ||
            /[a-z]{2,}\*{4,}\d{3,}/.test(b);
            
    const hasSuccessIndicator = b.includes("success") || b.includes("successful") || b.includes("credited") || 
            b.includes("received") || b.includes("done") || b.includes("processed") || b.includes("completed") || b.includes("disbursed");
            
    return hasCreditWords && hasAccountRef && hasSuccessIndicator;
}

function isFinancialSMS(sender, body) {
    if (!sender || !body) return false;
    if (isPromotional(body)) return false;
    
    const s = sender.toUpperCase();
    const b = body.toLowerCase();

    if (!/[A-Z]/.test(s)) return false;

    if (b.includes("otp") || b.includes("one time password") || b.includes("one-time password") || 
        b.includes("verification code") || b.includes("secret code") || b.includes("verification pin")
    ) {
        return false;
    }

    // Block failed / declined / returned transaction messages (no actual money transferred)
    if (b.includes("failed") || b.includes("declined") || b.includes("rejected") || b.includes("rejection") || b.includes("not debited") || b.includes("not credited") || b.includes("returned") || b.includes("insufficient") || b.includes("missed payment") || b.includes("delayed payment charges") || b.includes("blocking of funds") || b.includes("blocking of fund") || b.includes("welcome to airtel postpaid") || b.includes("plan charges: rs.") || b.includes("has been cancelled") || b.includes("has been revoked") || b.includes("successfully revoked") || b.includes("has been deactivated") || b.includes("successfully deactivated")) {
        return false;
    }

    // Block UPI collect requests / request money messages (not actual transactions)
    if (b.includes("has requested money") || b.includes("requested money")) {
        return false;
    }

    // Block AutoPay setup, creation, and registration messages (no money debited yet)
    const isSetupOnly = (
        b.includes("created") || 
        b.includes("registered") || 
        b.includes("setup") ||
        b.includes("mandate set") ||
        b.includes("mandate configured")
    ) && !b.includes("revoked") && !b.includes("cancelled") && !b.includes("cancel") && 
      !b.includes("deactivated") && !b.includes("stopped") &&
      !b.includes("debited") && !b.includes("spent") && !b.includes("paid") && 
      !b.includes("successfully processed") && !b.includes("processed successfully");

    if (isSetupOnly) {
        return false;
    }

    // Block mandate revocation notifications (money was NOT debited — just mandate cancelled)
    const isRevocationOnly = (b.includes("revoked") || b.includes("mandate revoked") || b.includes("autopay revoked")) &&
        !b.includes("debited") && !b.includes("spent") && !b.includes("paid") && !b.includes("credited");
    if (isRevocationOnly) {
        return false;
    }

    // Block wallet/app top-up credit confirmations from merchant senders (e.g. Milkbasket)
    // The actual bank debit SMS is captured separately — this is just a wallet notification
    if (b.includes("top-up") && b.includes("credited") && b.includes("new balance")) {
        return false;
    }

    // Block scheduled reminder messages (future auto-debit warnings)
    const isScheduledReminder = 
        b.includes("will be deducted") || 
        b.includes("will be debited") || 
        b.includes("to be debited") || 
        b.includes("is due by") || 
        b.includes("scheduled for debit") ||
        (b.includes("scheduled for") && b.includes("nach"));

    if (isScheduledReminder) {
        return false;
    }

    if (b.includes("waiver")) {
        return false;
    }

    // Block ledger updates/entries from merchant tools (avoid double-counting)
    if (b.includes("ledger") && (b.includes("debited your ledger") || b.includes("credited your ledger") || b.includes("your ledger") || b.includes("ledger with"))) {
        return false;
    }

    if (b.includes("credited to your") && (b.includes("airtel") || b.includes("jio") || b.includes("vi ") || b.includes("mobile") || b.includes("number"))) {
        return false;
    }
    if (b.includes("recharge") && (b.includes("credited") || b.includes("successful") || b.includes("success")) && 
        (b.includes("validity has been extended") || b.includes("for your mobile") || b.includes("for your airtel") || b.includes("for your jio"))
    ) {
        return false;
    }
    
    // Block welcome/adjustment/receipt carrier notifications to prevent duplicate accounting or false positives
    if (b.includes("off your bill") || b.includes("validity left") || b.includes("updated against") || b.includes("payment is updated")) {
        return false;
    }
    
    // Block SIM change/carrier warnings
    if (b.includes("sim change") || b.includes("sim card") || b.includes("carrier charge") || b.includes("retailer will charge")) {
        return false;
    }

    if (b.includes("data is consumed") || b.includes("data consumed") || 
        b.includes("high speed data") || b.includes("data limit") || 
        b.includes("daily data") || b.includes("speed data limit")
    ) {
        return false;
    }

    if (b.includes("bill") && (b.includes("generated") || b.includes("has been generated") || b.includes("is generated"))) {
        return false;
    }

    // Block non-payment Invoice alerts
    if (b.includes("invoice") && (b.includes("raised") || b.includes("generated") || b.includes("is raised") || b.includes("has been raised")) &&
        !b.includes("paid") && !b.includes("successful") && !b.includes("debited") && !b.includes("credited")
    ) {
        return false;
    }
    
    const hasDueSignal = b.includes("is due on") || b.includes("due on") || b.includes("overdue") ||
        b.includes("total due") || b.includes("min due") ||
        b.includes("stmt alert") || b.includes("statement alert") ||
        b.includes("amount due") || b.includes("minimum amount due") ||
        b.includes("payable by") || b.includes("payment due") ||
        b.includes("amount to be paid") || b.includes("due date:") ||
        b.includes("invoice") || b.includes("is raised") || b.includes("raised") ||
        b.includes("fees due") || b.includes("fee due") || b.includes("dues") || b.includes("reminder") || b.includes("remind") ||
        b.includes("outstanding") || b.includes("unpaid") || b.includes("isn't paid") || b.includes("settle") ||
        b.includes("suspended") || b.includes("disconnected") || b.includes("disconnect") ||
        b.includes("due for") || b.includes("is due");
    const hasReminderCta = b.includes("ignore if paid") || b.includes("if already paid") ||
        b.includes("pay now") || b.includes("pay immediately") ||
        (b.includes("click") && (b.includes("to pay") || b.includes("pay.billdesk") || b.includes("icici.co"))) ||
        b.includes("maintain sufficient") || b.includes("ensure sufficient") ||
        b.includes("delayed") || b.includes("minimum due") || b.startsWith("pay ");
    const hasActualTxEvidence = b.includes("debited") || b.includes("credited") ||
        b.includes("spent") || b.includes("transferred") || b.includes("withdrawn");
    if (hasDueSignal && hasReminderCta && !hasActualTxEvidence) {
        return false;
    }

    const currencyPattern = /(?:rs\.?|inr|₹|usd)\s*\d/i;
    const hasAmount = currencyPattern.test(b);
    
    const hasFinKeywords = b.includes("debited") || b.includes("credited") || b.includes("spent") || paidPattern.test(b) ||
            b.includes("payment") || b.includes("withdrawn") || b.includes("deposited") || b.includes("mandate") ||
            b.includes("autopay") || b.includes("standing instruction") || emiPattern.test(b) || sipPattern.test(b) ||
            chargePattern.test(b) || rechargePattern.test(b) || b.includes("renewed") || b.includes("debit") || b.includes("received") ||
            b.includes("auto pay") || b.includes("auto-debit") || b.includes("recurring") || b.includes("disbursed") || b.includes("refund") ||
            b.includes("sent rs") || b.includes("sent inr") || b.includes("sent ₹") ||
            b.includes("transferred rs") || b.includes("transferred inr");

    return hasAmount && hasFinKeywords;
}

const bankKeywords = {
    "APAY": "Amazon Pay", "AMAZONPAY": "Amazon Pay", "JUSPAY": "Juspay", "PAYTM": "Paytm",
    "HDFC": "HDFC Bank", "ICICI": "ICICI Bank", "AXIS": "Axis Bank", "KOTAK": "Kotak Mahindra Bank",
    "INDUS": "IndusInd Bank", "YESBK": "Yes Bank", "YESB": "Yes Bank", "RBL": "RBL Bank",
    "FEDBK": "Federal Bank", "FBL": "Federal Bank", "FEDERAL": "Federal Bank", "IDFC": "IDFC FIRST Bank",
    "BANDHAN": "Bandhan Bank", "BDHN": "Bandhan Bank", "KVB": "Karur Vysya Bank",
    "KTK": "Karnataka Bank", "SIB": "South Indian Bank", "TMB": "Tamilnad Mercantile Bank",
    "JKB": "J&K Bank", "CUB": "City Union Bank", "DCB": "DCB Bank", "CSB": "CSB Bank", "DBS": "DBS Bank",
    "SBI": "SBI", "PNB": "Punjab National Bank", "BARODA": "Bank of Baroda", "BOB": "Bank of Baroda",
    "CANARA": "Canara Bank", "CNRB": "Canara Bank", "UNION": "Union Bank of India",
    "UBIN": "Union Bank of India", "BOI": "Bank of India", "UCO": "UCO Bank",
    "CENTBK": "Central Bank of India", "CBI": "Central Bank of India",
    "MAHABK": "Bank of Maharashtra", "BOM": "Bank of Maharashtra", "PSB": "Punjab & Sind Bank",
    "IDBI": "IDBI Bank", "INDIANB": "Indian Bank", "INDN": "Indian Bank", "IDN": "Indian Bank",
    "IOB": "Indian Overseas Bank", "AUFBL": "AU Small Finance Bank", "AUBANK": "AU Small Finance Bank",
    "EQUITAS": "Equitas Small Finance Bank",
    "UJJIVAN": "Ujjivan Small Finance Bank", "ESAF": "ESAF Small Finance Bank",
    "SURYODAY": "Suryoday Small Finance Bank", "FINCARE": "Fincare Small Finance Bank",
    "JANA": "Jana Small Finance Bank", "UTKARSH": "Utkarsh Small Finance Bank",
    "CAPITAL": "Capital Small Finance Bank", "PAYTM": "Paytm Payments Bank",
    "PYTM": "Paytm Payments Bank", "AIRTEL": "Airtel Payments Bank", "APBL": "Airtel Payments Bank",
    "JIO": "Jio Payments Bank", "JPBL": "Jio Payments Bank", "NSDL": "NSDL Payments Bank",
    "IPPB": "India Post Payments Bank", "HSBC": "HSBC Bank", "CITI": "Citi Bank",
    "AMEX": "American Express", "SCB": "Standard Chartered", "STANCHAR": "Standard Chartered",
    "BARCLAYS": "Barclays", "MUFG": "MUFG Bank", "JUPITER": "Jupiter", "FIMONEY": "Fi Money",
    "ONECARD": "OneCard", "SLICE": "slice", "UNI": "Uni Card"
};

const sortedBankKeys = Object.keys(bankKeywords).sort((a, b) => b.length - a.length);

const amountPatterns = [
    /(?:usd|eur|gbp|sgd|aed|aud|cad|jpy)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /contribution\s+of\s+(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /spent\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /debited\s+with\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /credited\s+with\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
];

const merchantPatterns = [
    // UPI request money: "[Merchant] has requested money..."
    /(?:^|\n)([a-zA-Z0-9\s\.\*\&\-]{2,40}?)\s+(?:and\s+)?has\s+requested\s+money/i,
    /(?:^|\n)to\s+([a-zA-Z][a-zA-Z0-9\s\.\*\&\-]{2,29}?)\s*(?=\n|$)/,
    /spent.{5,60}?on\s+([a-zA-Z][a-zA-Z0-9\s\.\*\&\-\,_]{2,29}?)\s*(?:\.|avl|if not|$)/i,
    /(?:created towards|towards|mandate towards|payment towards)\s+([a-zA-Z0-9\s\.\*\&\-\,]{3,50}?)\s*\b(?:for|from|is|was|has|on|ref|via|any|umn)\b/i,
    /(?:subscription to|payment for|payment to|mandate to)\s+([a-zA-Z0-9\s\.\*\&\-\,]{3,50}?)\s*\b(?:is|was|has|on|ref|via|any)\b/i,
    /for\s+([a-zA-Z0-9\s\.\*\&\-]{2,20}?)\s+mandate/i,
    /(?:processed payment of|payment of|paid for|processed for|for)\s+(?:(?:rs\.?|inr|₹)\s*[\d,.]+\s+(?:for|to)\s+(?:merchant\s+)?)?([a-zA-Z0-9\s\.\*\&\_-]{2,30}?)\s*(?:,|\bas\b|\bon\b)/i,
    /([a-zA-Z0-9\s\.\*\&\-]{2,20}?)\s+(?:top-up|topup)/i,
    /at\s+([a-zA-Z0-9\s\.\*\&\_,]{3,30}?)(?:\s*\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\b|$)/i,
    /(?:sent to|paid to)\s+([a-zA-Z0-9\s\.\*\&\_,]{3,30}?)(?:\s*\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\b|$)/i,
    /spent\s+on\s+([a-zA-Z0-9\s\.\*\&\_,]{3,30}?)(?:\s*\b(?:on|via|using|from|for|balance|ref|rrn|vpa|avl)\b|$)/i,
    /(?:for your|your)\s+([a-zA-Z0-9\s\.\*\&\-]{3,30}?)\s+(?:order|membership|subscription|purchase|booking)/i,
    /info:\s*([a-zA-Z0-9\s\.\*]{3,20})/i,
    /debited\s+at\s+([a-zA-Z0-9\s\.\*]{3,20})/i,
    /transfer to\s+([a-zA-Z0-9\s\.\*]{3,20})/i,
    /InfoACH\*([a-zA-Z0-9\s\.\*\&\-]{2,20}?)/i,
    /InfoBIL\*(?:INFT\*)?([a-zA-Z0-9\s\.\*\&\-]{2,20}?)/i,
    /(?:info|ref)\s+(?:neft|imps|rtgs|upi)[-/\*\s]+[a-zA-Z0-9]{8,25}[-/\*\s]+([a-zA-Z0-9\s\*\&\-]{2,30}?)(?:\.|\b(?:on|at|is|was|has|available|bal|balance|ref|if|revised)\b|$)/i,
    /(?:raised by|mandate raised by)\s+([a-zA-Z0-9\s\.\*\&\-\,]{3,50}?)\s*\b(?:on|from|is|was|has|via|ref|\$)\b/i,
    /([a-zA-Z0-9\s\.\*\&\-]{3,30}?)\s+(?:refund|reversal)\b/i,
    /(?:from vpa|vpa)\s+([a-zA-Z0-9\.\-_]{3,30}?)(?:@|\b)/i,
    /(?:transfer from|received from|credited from|sent from|from)\s*:?\s*([a-zA-Z0-9\s\.\*\&\-\/]{3,30}?)\s*\b(?:upi|ref|rrn|txn|on|at|is|was|has|to|balance|avbl|limit|total|bal|cr|dr)\b/i,
    /([a-zA-Z][a-zA-Z0-9\s]{2,28}?)\s+credited\b/i
];

function titleCase(str) {
    return str.split(' ').map(w => w ? w[0].toUpperCase() + w.substring(1).toLowerCase() : '').join(' ');
}

function parseFinancialSMS(sender, body, date) {
    if (isPromotional(body)) return null;
    
    const b = body.toLowerCase();
    const s = sender.toUpperCase();

    let amount = 0.0;
    for (const pattern of amountPatterns) {
        const match = b.match(pattern);
        if (match) {
            const amtStr = match[1].replace(/,/g, '');
            amount = parseFloat(amtStr) || 0.0;
            if (amount > 0) break;
        }
    }
    if (amount === 0.0) return null;

    let bank = "Unknown Bank";
    for (const key of sortedBankKeys) {
        if (s.includes(key)) {
            bank = bankKeywords[key];
            break;
        }
    }
    if (bank === "Unknown Bank") {
        let bodyForBankCheck = b;
        const upiPatternForBank = /[a-zA-Z0-9\.\-_]+@[a-zA-Z0-9\-_]+/g;
        bodyForBankCheck = bodyForBankCheck.replace(upiPatternForBank, "");
        for (const key of sortedBankKeys) {
            if (bodyForBankCheck.includes(key.toLowerCase())) {
                bank = bankKeywords[key];
                break;
            }
        }
    }

    let category = "Others";
    if (b.includes("contribution") && (b.includes("epf") || b.includes("provident fund") ||
        b.includes("passbook") || b.includes("due month") || b.includes("uan") || b.includes("epfo"))) {
        category = "Investment";
    } else if (b.includes("refund") || b.includes("reversal") || (b.includes("credited") && !b.includes("debited") && (b.includes("amazon") || b.includes("flipkart") || b.includes("myntra") || b.includes("milkbasket")))) {
        category = "Refund";
    } else if (b.includes("netflix") || b.includes("spotify") || b.includes("amazon prime") || 
        b.includes("youtube premium") || b.includes("disney") || b.includes("hotstar") || 
        b.includes("sony liv") || b.includes("sonyliv") || b.includes("zee5") || b.includes("jiocinema") || b.includes("jio cinema") || b.includes("tataplay") ||
        b.includes("xstream") || b.includes("airtelxstream")) {
        category = "OTT";
    } else if (b.includes("apple") || b.includes("google play") || b.includes("subscription") || b.includes("prime membership")) {
        category = "Subscription";
    } else if ((emiPattern.test(b) && !b.includes("convert to emi") && !b.includes("convert this txn to emi") && !b.includes("convert this transaction to emi")) || b.includes("loan") || b.includes("housing finance") || b.includes("car loan")) {
        category = "Loan / EMI";
    } else if (sipPattern.test(b) || b.includes("mutual fund") || b.includes("groww") || 
        b.includes("zerodha") || b.includes("upstox") || b.includes("investment")) {
        category = "Investment";
    } else if (b.includes("electricity") || b.includes("power") || b.includes("bescom") || 
        b.includes("water bill") || b.includes("gas bill") || b.includes("utility bill") ||
        b.includes("amazonaws") || b.includes("amazonawsesc") || b.includes("awsesc") ||
        b.includes("fixedline") || b.includes("broadband") ||
        (b.includes("amazon pay") && b.includes("bill"))) {
        category = "Bill";
    } else if (b.includes("insurance") || b.includes("premium") || licPattern.test(b) ||
        b.includes("max life") || b.includes("maxlife") || b.includes("hdfc life") ||
        b.includes("sbi life") || b.includes("bajaj allianz") || b.includes("star health") ||
        b.includes("new india") || b.includes("national insurance") || b.includes("oriental insurance")) {
        category = "Insurance";
    } else if (b.includes("toll") || b.includes("fastag") || /\bplaza\b/i.test(b)) {
        category = "Toll / FASTag";
    } else if (b.includes("recharge") || b.includes("mobile recharge") || b.includes("jio") || 
        b.includes("airtel") || b.includes("vi prepaid") ||
        (b.includes("amazon pay") && b.includes("recharge"))) {
        category = "Recharge";
    } else if (b.includes("cashback")) {
        category = "Cashback";
    } else if (b.includes("interest")) {
        category = "Interest";
    } else if (b.includes("swiggy") || b.includes("zomato") || b.includes("restaurant") || b.includes("food") || b.includes("milkbasket")) {
        category = "Food";
    } else if (b.includes("fuel") || b.includes("petrol") || b.includes("diesel")) {
        category = "Fuel";
    } else if (b.includes("irctc") || b.includes("travel") || /\b(?:uber|ola|flight|train|cab)s?\b/i.test(b)) {
        category = "Travel";
    } else if (b.includes("amazon") || b.includes("flipkart") || b.includes("myntra") || b.includes("shopping")) {
        category = "Shopping";
    } else if (b.includes("cheque") || b.includes("chq") || b.includes("check no") || b.includes("cleared")) {
        category = "Bank Transfer";
    } else if (b.includes("imps") || b.includes("neft") || b.includes("rtgs")) {
        category = "Bank Transfer";
    } else if ((b.includes("sent rs") || b.includes("sent inr") || b.includes("sent ₹") ||
        b.includes("transferred rs") || b.includes("transferred inr")) &&
        (b.includes("upi") || (b.includes("from") && b.includes("to")))) {
        category = "Bank Transfer";
    } else if (b.includes("debited") && b.includes("credited")) {
        category = "Bank Transfer";
    } else if ((b.includes("credited") || b.includes("received")) && b.includes("from")) {
        category = "Bank Transfer";
    } else if (b.includes("payment") && (b.includes("received") || b.includes("towards") || b.includes("thank you")) && b.includes("credit card")) {
        category = "Bill";
    } else if (!b.includes("credited") && !b.includes("received") && (/\bach\b/i.test(b) || /\bnach\b/i.test(b)) && Object.keys(bankKeywords).some(k => b.includes(k.toLowerCase()))) {
        category = "Loan / EMI";
    }

    let merchant = "Unknown Merchant";
    for (const pattern of merchantPatterns) {
        const match = b.match(pattern);
        if (match) {
            const tempMerchant = match[1] ? match[1].trim() : "Unknown Merchant";
            let cleanedMerchant = tempMerchant.split(" txn ")[0].split(" ref ")[0].split(" date ")[0].trim();
            while (cleanedMerchant && (cleanedMerchant.endsWith(".") || cleanedMerchant.endsWith(",") || cleanedMerchant.endsWith("*") || cleanedMerchant.endsWith("-"))) {
                cleanedMerchant = cleanedMerchant.substring(0, cleanedMerchant.length - 1).trim();
            }
            if (/^\d+$/.test(cleanedMerchant)) {
                continue; // Ignore fully numeric codes
            }
            const lowerM = cleanedMerchant.toLowerCase();
            if ((lowerM.startsWith("rs ") || lowerM.startsWith("rs.") || lowerM.startsWith("inr ") || lowerM.startsWith("₹") || lowerM.startsWith("usd ")) && /\d/.test(cleanedMerchant)) {
                continue;
            }
            if (lowerM.includes("a/c") || lowerM.includes("acct") || lowerM.includes("account") || 
                lowerM.includes("card") || lowerM.includes("ending") || lowerM.includes("bank") || 
                lowerM.includes("no:") || lowerM.length < 3 ||
                lowerM === "will be" || lowerM === "and will be" || lowerM === "to be" || lowerM === "has been" ||
                lowerM.includes("contact") || lowerM.includes("support") || lowerM.includes("customer") || 
                lowerM.includes("please") || lowerM.includes("request") || lowerM.includes("initiate") || 
                lowerM.includes("eligible") || lowerM.includes("claim")) {
                continue;
            }
            merchant = cleanedMerchant;
            break;
        }
    }

    if (merchant === "Unknown Merchant" && b.includes("atm")) {
        const atmPattern = /atm\*([a-zA-Z0-9\-_]+)\*/;
        const atmMatcher = b.match(atmPattern);
        if (atmMatcher) {
            merchant = "ATM " + (atmMatcher[1] ? atmMatcher[1].toUpperCase() : "");
        } else {
            merchant = "ATM Withdrawal";
        }
    }

    if (merchant === "Unknown Merchant") {
        if (s.includes("EPFO") || s.includes("EPFOHO") || s.includes("PFMSGR") ||
            (b.includes("contribution") && b.includes("due month")) ||
            (b.includes("passbook") && b.includes("contribution"))) {
            merchant = "EPFO";
        }
    }

    if (merchant === "Unknown Merchant" && (b.includes("cheque") || b.includes("chq"))) {
        const chequeNoPattern = /(?:cheque|chq)\s+no\.?\s*(\d+)/i;
        const chequeNoMatcher = b.match(chequeNoPattern);
        merchant = chequeNoMatcher ? `Cheque No. ${chequeNoMatcher[1]}` : `${bank} Cheque`;
    }

    if (merchant === "Unknown Merchant") {
        const teamPattern = /team\s+([a-zA-Z][a-zA-Z0-9\s]{2,30}?)\s*$/i;
        const teamMatcher = b.match(teamPattern);
        if (teamMatcher) {
            const teamName = teamMatcher[1] ? teamMatcher[1].trim() : "";
            if (teamName.length >= 3) {
                merchant = titleCase(teamName);
            }
        }
    }

    const commonMerchants = [
        "netflix", "spotify", "amazon prime", "amazon", "youtube", "google play", "google one", "google cloud", "google",
        "apple", "swiggy", "zomato", "uber", "ola", "flipkart", "myntra", "groww", "zerodha",
        "lic", "airtel", "jio", "vi", "tataplay", "fastag", "scapia", "jar", "milkbasket",
        "act fibernet", "smytten", "jvvnl", "national pension", "lenskart", "cred_fastag"
    ];

    const merchantLower = merchant.toLowerCase();
    const matchedCommon = commonMerchants.find(m => 
        merchantLower === m || (merchantLower.includes("unknown") && new RegExp("\\b" + m.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\b", "i").test(b))
    );

    if (matchedCommon) {
        switch (matchedCommon) {
            case "amazon prime": merchant = "Amazon Prime"; break;
            case "google play": merchant = "Google Play"; break;
            case "google one": merchant = "Google One"; break;
            case "google cloud": merchant = "Google Cloud"; break;
            case "tataplay": merchant = "Tata Play"; break;
            case "fastag": merchant = "FASTag"; break;
            case "cred_fastag": merchant = "CRED FASTag"; break;
            case "milkbasket": merchant = "Milkbasket"; break;
            case "act fibernet": merchant = "ACT Fibernet"; break;
            case "jvvnl": merchant = "JVVNL"; break;
            case "smytten": merchant = "Smytten"; break;
            case "national pension": merchant = "National Pension System"; break;
            case "lenskart": merchant = "Lenskart"; break;
            default: merchant = titleCase(matchedCommon);
        }
    } else if (merchant !== "Unknown Merchant") {
        merchant = titleCase(merchant);
    }

    if (merchant === "Unknown Merchant" && category === "Loan / EMI" && bank !== "Unknown Bank") {
        merchant = bank;
    }

    if (merchant === "Unknown Merchant" && (category === "Bill" || category === "Refund" || category === "Cashback") && b.includes("credit card")) {
        merchant = bank !== "Unknown Bank" ? `${bank} Credit Card` : "Credit Card";
    }

    const debitOnlyCategories = ["Insurance", "Investment", "Loan / EMI", "Bill", "Subscription", "Shopping", "Recharge", "OTT"];
    const isDebitOnlyCategory = debitOnlyCategories.includes(category);

    let type = "DEBIT";
    if (isDebitOnlyCategory) {
        if (hasCreditProof(category, body) && (b.includes("credited") || b.includes("received") || b.includes("deposited") || b.includes("disbursed") || b.includes("refund"))) {
            type = "CREDIT";
        }
    } else {
        const isCreditCategory = category === "Refund" || category === "Interest";
        const hasCreditKeywords = b.includes("credited") || b.includes("received") || b.includes("deposited") || b.includes("refund");
        
        const hasMisleadingCreditWords = (b.includes("credit card") || b.includes("credit limit") || 
                b.includes("credit score") || b.includes("credit report") || b.includes("credit line") || 
                b.includes("credit available") || b.includes("credit eligibility") || b.includes("credit facility") || 
                b.includes("credit offer") || b.includes("credit approval")) &&
                !b.includes("refund") && !b.includes("reversal") && !b.includes("credited to") && !b.includes("waiver") && !b.includes("credited back");
                
        if ((isCreditCategory || hasCreditKeywords) && !hasMisleadingCreditWords) {
            type = "CREDIT";
        }
    }

    if (b.includes("contribution") && b.includes("due month") && type === "CREDIT") {
        type = "DEBIT";
    }

    if (b.includes("debited") && b.includes("credited") && type === "CREDIT") {
        type = "DEBIT";
    }

    if (type === "CREDIT" && !validateCredit(body)) {
        const hasDebitKeywords = b.includes("debited") || b.includes("spent") || b.includes("paid") || b.includes("transferred") || b.includes("withdrawn");
        if (hasDebitKeywords) {
            type = "DEBIT";
        } else {
            return null;
        }
    }

    let isAutoPay = b.includes("autopay") || b.includes("auto pay") || b.includes("mandate") || 
        b.includes("standing instruction") || b.includes("standing instr") || b.includes("recurring") || 
        b.includes("auto debit") || b.includes("auto-debit") || b.includes("debit instruction") || 
        /\bsi\b/i.test(b) || 
        /\bnach\b/i.test(b) || /\bach\b/i.test(b) || /\becs\b/i.test(b) || 
        b.includes("renewal successful") || b.includes("subscription renewed") || b.includes("renewed successfully");

    if (isAutoPay && b.includes("register") && (b.includes("to enable") || b.includes("enable auto-debit") || b.includes("enable autopay") || b.includes("activate auto-debit"))) {
        isAutoPay = false;
    }

    if (type === "CREDIT") {
        isAutoPay = false;
    }

    let finalCategory = category;
    if (isAutoPay && (finalCategory === "Others" || finalCategory === "Bank Transfer")) {
        finalCategory = "Subscription";
    }

    let paymentMethod = "UPI";
    if (b.includes("cheque") || b.includes("chq") || b.includes("check no")) {
        paymentMethod = "Cheque";
    } else if (b.includes("wallet") || b.includes("apay balance") || b.includes("amazon pay balance") || b.includes("paytm balance")) {
        paymentMethod = "Wallet";
    } else if (b.includes("card") || b.includes("credit card") || b.includes("debit card") || b.includes("visa") || b.includes("mastercard") || b.includes("rupay")) {
        paymentMethod = "Card";
    } else if (/\bnach\b/i.test(b) || /\bach\b/i.test(b) || b.includes("netbanking") || b.includes("neft") || b.includes("imps") || b.includes("rtgs") || /\becs\b/i.test(b)) {
        paymentMethod = (/\bnach\b/i.test(b) || /\bach\b/i.test(b)) ? "NACH" : "Bank Transfer";
    } else if (b.includes("bank account") || b.includes("registered account") || b.includes("auto debit") || b.includes("auto-debit") || b.includes("a/c")) {
        if (!b.includes("upi") && !b.includes("vpa") && !b.includes("@")) {
            paymentMethod = "Bank Transfer";
        }
    } else if (!b.includes("upi") && !b.includes("@") &&
        (category === "Insurance" || category === "Investment" || category === "Loan / EMI")) {
        paymentMethod = "Unknown";
    }

    const isSetupOrCancellation = isAutoPay && (
        b.includes("created") || 
        b.includes("cancelled") || 
        b.includes("cancel") || 
        b.includes("registered") || 
        b.includes("revoked") || 
        b.includes("deactivated") || 
        b.includes("stopped")
    ) && !b.includes("debited") && !b.includes("paid") && !b.includes("spent");

    let status = "Success";
    if (b.includes("failed") || b.includes("declined") || b.includes("rejected") || b.includes("rejection") || b.includes("not debited") || b.includes("not credited") || b.includes("returned") || b.includes("insufficient")) {
        status = "Failed";
    } else if (b.includes("scheduled for debit") || b.includes("will be debited") || b.includes("will be deducted") || b.includes("to be debited") || b.includes("is due by") ||
        b.includes("maintain sufficient") || b.includes("ensure sufficient") ||
        (b.includes("scheduled for") && b.includes("nach"))) {
        status = "Scheduled";
    }

    return {
        amount,
        bank,
        category: finalCategory,
        merchant,
        type,
        isAutoPay,
        paymentMethod,
        isSetupOrCancellation,
        status
    };
}

function unescapeXml(text) {
    return text.replace(/&quot;/g, '"')
               .replace(/&apos;/g, "'")
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&#10;/g, '\n')
               .replace(/&#13;/g, '\r')
               .replace(/&amp;/g, '&');
}

function escapeCsv(text) {
    const clean = text.replace(/"/g, '""');
    return `"${clean}"`;
}

// Bulk scan starts here:
const xmlFilePath = "C:\\Users\\admin\\Downloads\\sms-20260704182832.xml";
const csvFilePath = path.join(__dirname, 'sms_analysis_report.csv');

if (!fs.existsSync(xmlFilePath)) {
    console.error("XML file not found at " + xmlFilePath);
    process.exit(1);
}

const writeStream = fs.createWriteStream(csvFilePath);
writeStream.write("Sender,Body,IsFinancial,ParsedAmount,ParsedBank,ParsedMerchant,ParsedCategory,ParsedType,IsAutoPay,PaymentMethod,Status,IsSetupOrCancellation\n");

const rl = readline.createInterface({
    input: fs.createReadStream(xmlFilePath),
    crlfDelay: Infinity
});

let totalCount = 0;
let financialCount = 0;
let unknownMerchantCount = 0;
let othersCategoryCount = 0;

rl.on('line', (line) => {
    if (line.trim().startsWith('<sms ')) {
        totalCount++;
        const addressMatch = line.match(/address="([^"]*)"/);
        const bodyMatch = line.match(/body="([^"]*)"/);

        if (addressMatch && bodyMatch) {
            const sender = addressMatch[1];
            const body = unescapeXml(bodyMatch[1]);

            if (isFinancialSMS(sender, body)) {
                financialCount++;
                const parsed = parseFinancialSMS(sender, body, Date.now());
                if (parsed) {
                    if (parsed.merchant === "Unknown Merchant") {
                        unknownMerchantCount++;
                    }
                    if (parsed.category === "Others") {
                        othersCategoryCount++;
                    }

                    writeStream.write([
                        escapeCsv(sender),
                        escapeCsv(body),
                        "true",
                        parsed.amount,
                        escapeCsv(parsed.bank),
                        escapeCsv(parsed.merchant),
                        escapeCsv(parsed.category),
                        parsed.type,
                        parsed.isAutoPay,
                        parsed.paymentMethod,
                        parsed.status,
                        parsed.isSetupOrCancellation
                    ].join(',') + '\n');
                } else {
                    writeStream.write([
                        escapeCsv(sender),
                        escapeCsv(body),
                        "true",
                        "0.0",
                        "Unknown Bank",
                        "Failed to Parse",
                        "Others",
                        "DEBIT",
                        "false",
                        "Unknown",
                        "Success",
                        "false"
                    ].join(',') + '\n');
                }
            }
        }
    }
});

rl.on('close', () => {
    writeStream.end();
    console.log("=== PROCESS COMPLETE ===");
    console.log("Total Messages in XML: " + totalCount);
    console.log("Financial Messages Found: " + financialCount);
    console.log("  - Unknown Merchant: " + unknownMerchantCount);
    console.log("  - 'Others' Category: " + othersCategoryCount);
    console.log("CSV Report saved to: " + csvFilePath);
});

module.exports = { isFinancialSMS, parseFinancialSMS };
