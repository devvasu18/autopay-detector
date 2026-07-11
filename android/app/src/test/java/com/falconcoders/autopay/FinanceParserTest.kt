package com.falconcoders.autopay

import org.junit.Test
import org.junit.Assert.*
import java.io.File
import java.io.PrintWriter
import java.util.Locale
import java.util.regex.Pattern

class FinanceParserTest {

    @Test
    fun testParserRules() {
        val parser = FinanceParser
        val testMessages = listOf(
            Pair("AXPNBSMSS", "Your UPI-Mandate for Rs.15000.00 is successfully created towards Google Cloud from A/c No: XX0403. UMN ID: d8f2c7ed9a804e83a83ec57ba51346e2@okaxis-PNB"),
            Pair("VK-HDFCBK", "Rs 500 spent on credit card ending 1234."),
            Pair("VK-HDFCBK", "Your credit card bill is due."),
            Pair("VK-HDFCBK", "You are eligible for a loan of Rs. 5,00,000."),
            Pair("AD-AUBANK", "Dear Customer, A/c XX0987 has been debited with Rs 1,000.00 at Swiggy. Ref 123456."),
            Pair("VK-UNIONB", "Rs 2500 debited from Union Bank A/c XX3456 towards premium payment."),
            Pair("AX-YESBNK", "Loan disbursed to your account: Rs 50,000. Ref: LOAN-100234."),
            Pair("Teachmint", "Dear Student, This is a reminder from The Global Academy for fees due of INR 41500.0, excluding fines. Pay online through Teachmint: https://tmtfi.com/r/?id=uFJ... . Ignore if already paid"),
            Pair("VM-ICICIT", "Last day to pay JVVNL bill of Rs 72.0 for 211584044399. To pay visit icici.co/ICICIT/k/DUvfEetn4ZV . Ignore if paid-ICICI Bank."),
            Pair("ICICI", "Dear Customer, Acct XX898 is credited with Rs 4024.00 on 01-Jul-26 from Mr MAHESH SHARM. UPI:309556758051-ICICI Bank."),
            Pair("THE DHARMARTH MEDICAL FOU", "From THE DHARMARTH MEDICAL FOU\n\nDear Customer\n\nWe have Debited your ledger with Rs.4024.00\n\nAny query  me9.in/wpid-88280-R1lW\n\nRegards\n\nPowered by Marg Erp"),
            Pair("HDFCBK", "Credit Alert!\nRs.35000.00 credited to HDFC Bank A/c XX9400 on 09-06-26 from VPA namrtaupadhyayjsh@okicici (UPI 652658799667)"),
            Pair("HDFCBK", "Credit Alert!\nRs.200.00 credited to HDFC Bank A/c XX9400 on 02-07-26 from VPA sanjayyoungmoney@okaxis (UPI 654977357466)"),
            Pair("HDFCBK", "Credit Alert!\nRs.50000.00 credited to HDFC Bank A/c XX9400 on 15-06-26 from VPA yaidasani@okicici (UPI 616663319756)"),
            Pair("HDFCBK", "Sent Rs.15000.00\nFrom HDFC Bank A/C *9400\nTo YOGESH AIDASANI\nOn 22/05/26\nRef 123508769352\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808"),
            Pair("ICICIB", "Reversal of Rs 48.09 credited to ICICI Bank Credit Card XX5008 on 15-SEP-25. Revised total due Rs 0, minimum due Rs .00"),
            Pair("ICICIB", "IRCTC Eticketing refund of Rs 2,305.36 credited to ICICI Bank Credit Card XX5008 on 18-MAR-25. Revised total due Rs 99,469.82, minimum due Rs .00"),
            Pair("ICICIB", "Reversal of Rs 32.45 credited to ICICI Bank Credit Card XX5008 on 29-DEC-25. Revised total due Rs 0, minimum due Rs .00"),
            Pair("HDFCBK", "Credit Alert!\nRs.10000.00 credited to HDFC Bank A/c XX9400 on 10-05-26 from VPA 7002702501@ybl (UPI 965107568219)"),
            Pair("ICICIB", "ICICI Bank Account XX898 is credited with Rs 24,000.00 on 07-May-26 by Account linked to mobile number XXXXX09141. IMPS Ref. no. 612721812220."),
            Pair("ICICIB", "ICICI Bank Account XX898 credited:Rs. 5,170.50 on 19-Jan-26. Info NEFT-CITIN26606857447-H M HE. Available Balance is Rs. 14,594.36.")
        )

        println("=== STARTING PARSER TEST SUITE ===")
        for ((sender, body) in testMessages) {
            val isFin = parser.isFinancialSMS(sender, body)
            println("Sender: $sender")
            println("Body: $body")
            println("Is Financial: $isFin")
            if (isFin) {
                val parsed = parser.parseFinancialSMS("test_id", sender, body, System.currentTimeMillis())
                assertNotNull("Parsed result should not be null for $sender", parsed)
                parsed?.let {
                    println("  Parsed Merchant: ${it.merchant}")
                    println("  Parsed Amount: ${it.amount}")
                    println("  Parsed Bank: ${it.bank}")
                    println("  Parsed Type: ${it.type}")
                    println("  Parsed Category: ${it.category}")
                }
            }
            println("-".repeat(50))
        }

        assertFalse("Teachmint student fee reminder should be ignored", parser.isFinancialSMS("Teachmint", "Dear Student, This is a reminder from The Global Academy for fees due of INR 41500.0, excluding fines. Pay online through Teachmint: https://tmtfi.com/r/?id=uFJ... . Ignore if already paid"))
        assertFalse("JVVNL bill reminder should be ignored", parser.isFinancialSMS("VM-ICICIT", "Last day to pay JVVNL bill of Rs 72.0 for 211584044399. To pay visit icici.co/ICICIT/k/DUvfEetn4ZV . Ignore if paid-ICICI Bank."))
        assertFalse("Marg ERP ledger debit should be ignored", parser.isFinancialSMS("THE DHARMARTH MEDICAL FOU", "From THE DHARMARTH MEDICAL FOU\n\nDear Customer\n\nWe have Debited your ledger with Rs.4024.00\n\nAny query  me9.in/wpid-88280-R1lW\n\nRegards\n\nPowered by Marg Erp"))
        assertTrue("Mahesh Sharm bank credit should be financial", parser.isFinancialSMS("ICICI", "Dear Customer, Acct XX898 is credited with Rs 4024.00 on 01-Jul-26 from Mr MAHESH SHARM. UPI:309556758051-ICICI Bank."))
        
        val hdfcUpiCredit = parser.parseFinancialSMS("test_id", "HDFCBK", "Credit Alert!\nRs.35000.00 credited to HDFC Bank A/c XX9400 on 09-06-26 from VPA namrtaupadhyayjsh@okicici (UPI 652658799667)", System.currentTimeMillis())
        assertNotNull(hdfcUpiCredit)
        hdfcUpiCredit?.let {
            assertEquals("Namrtaupadhyayjsh", it.merchant)
            assertEquals(35000.0, it.amount, 0.0)
            assertEquals("HDFC Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("UPI", it.paymentMethod)
        }

        val hdfcUpiCredit2 = parser.parseFinancialSMS("test_id", "HDFCBK", "Credit Alert!\nRs.200.00 credited to HDFC Bank A/c XX9400 on 02-07-26 from VPA sanjayyoungmoney@okaxis (UPI 654977357466)", System.currentTimeMillis())
        assertNotNull(hdfcUpiCredit2)
        hdfcUpiCredit2?.let {
            assertEquals("Sanjayyoungmoney", it.merchant)
            assertEquals(200.0, it.amount, 0.0)
            assertEquals("HDFC Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("UPI", it.paymentMethod)
        }

        val hdfcUpiCredit3 = parser.parseFinancialSMS("test_id", "HDFCBK", "Credit Alert!\nRs.50000.00 credited to HDFC Bank A/c XX9400 on 15-06-26 from VPA yaidasani@okicici (UPI 616663319756)", System.currentTimeMillis())
        assertNotNull(hdfcUpiCredit3)
        hdfcUpiCredit3?.let {
            assertEquals("Yaidasani", it.merchant)
            assertEquals(50000.0, it.amount, 0.0)
            assertEquals("HDFC Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("UPI", it.paymentMethod)
        }

        val hdfcUpiDebit = parser.parseFinancialSMS("test_id", "HDFCBK", "Sent Rs.15000.00\nFrom HDFC Bank A/C *9400\nTo YOGESH AIDASANI\nOn 22/05/26\nRef 123508769352\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808", System.currentTimeMillis())
        assertNotNull(hdfcUpiDebit)
        hdfcUpiDebit?.let {
            assertEquals("Yogesh Aidasani", it.merchant)
            assertEquals(15000.0, it.amount, 0.0)
            assertEquals("HDFC Bank", it.bank)
            assertEquals("DEBIT", it.type)
            assertEquals("UPI", it.paymentMethod)
        }

        val iciciReversal = parser.parseFinancialSMS("test_id", "ICICIB", "Reversal of Rs 48.09 credited to ICICI Bank Credit Card XX5008 on 15-SEP-25. Revised total due Rs 0, minimum due Rs .00", System.currentTimeMillis())
        assertNotNull(iciciReversal)
        iciciReversal?.let {
            assertEquals("ICICI Bank Credit Card", it.merchant)
            assertEquals(48.09, it.amount, 0.0)
            assertEquals("ICICI Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("Card", it.paymentMethod)
            assertEquals("Refund", it.category)
        }

        val irctcRefund = parser.parseFinancialSMS("test_id", "ICICIB", "IRCTC Eticketing refund of Rs 2,305.36 credited to ICICI Bank Credit Card XX5008 on 18-MAR-25. Revised total due Rs 99,469.82, minimum due Rs .00", System.currentTimeMillis())
        assertNotNull(irctcRefund)
        irctcRefund?.let {
            assertEquals("Irctc Eticketing", it.merchant)
            assertEquals(2305.36, it.amount, 0.0)
            assertEquals("ICICI Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("Card", it.paymentMethod)
            assertEquals("Refund", it.category)
        }

        val iciciReversal2 = parser.parseFinancialSMS("test_id", "ICICIB", "Reversal of Rs 32.45 credited to ICICI Bank Credit Card XX5008 on 29-DEC-25. Revised total due Rs 0, minimum due Rs .00", System.currentTimeMillis())
        assertNotNull(iciciReversal2)
        iciciReversal2?.let {
            assertEquals("ICICI Bank Credit Card", it.merchant)
            assertEquals(32.45, it.amount, 0.0)
            assertEquals("ICICI Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("Card", it.paymentMethod)
            assertEquals("Refund", it.category)
        }

        val hdfcPhoneVpa = parser.parseFinancialSMS("test_id", "HDFCBK", "Credit Alert!\nRs.10000.00 credited to HDFC Bank A/c XX9400 on 10-05-26 from VPA 7002702501@ybl (UPI 965107568219)", System.currentTimeMillis())
        assertNotNull(hdfcPhoneVpa)
        hdfcPhoneVpa?.let {
            assertEquals("Unknown Merchant", it.merchant) // Numeric VPA prefix should be ignored
            assertEquals(10000.0, it.amount, 0.0)
            assertEquals("HDFC Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("UPI", it.paymentMethod)
        }

        val iciciImpsCredit = parser.parseFinancialSMS("test_id", "ICICIB", "ICICI Bank Account XX898 is credited with Rs 24,000.00 on 07-May-26 by Account linked to mobile number XXXXX09141. IMPS Ref. no. 612721812220.", System.currentTimeMillis())
        assertNotNull(iciciImpsCredit)
        iciciImpsCredit?.let {
            assertEquals("Unknown Merchant", it.merchant)
            assertEquals(24000.0, it.amount, 0.0)
            assertEquals("ICICI Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("Bank Transfer", it.paymentMethod)
            assertEquals("Bank Transfer", it.category)
        }

        val iciciNeftCredit = parser.parseFinancialSMS("test_id", "ICICIB", "ICICI Bank Account XX898 credited:Rs. 5,170.50 on 19-Jan-26. Info NEFT-CITIN26606857447-H M HE. Available Balance is Rs. 14,594.36.", System.currentTimeMillis())
        assertNotNull(iciciNeftCredit)
        iciciNeftCredit?.let {
            assertEquals("H M He", it.merchant)
            assertEquals(5170.50, it.amount, 0.0)
            assertEquals("ICICI Bank", it.bank)
            assertEquals("CREDIT", it.type)
            assertEquals("Bank Transfer", it.paymentMethod)
            assertEquals("Bank Transfer", it.category)
        }

        // Test Setup-only AutoPay creation messages (should be completely ignored)
        val setupSms = "Your AutoPay mandate with ASPRESENTED is successfully created towards Story TV from 23-Feb-26 to 23-Feb-46 for Rs 399.00, RRN 605491852399-ICICI Bank."
        assertFalse(parser.isFinancialSMS("AX-ICICIT-S", setupSms))

        val mandateSetSms = "Mandate Set\nRs.1.00\nFor THEDHARMARTHSEWASANSTHASU\nFrom HDFC Bank A/c x9400\nUMN: 52c9871710647a4ee0634bcee10aa17b@ok"
        assertFalse(parser.isFinancialSMS("AD-HDFCBK-S", mandateSetSms))

        // Test standing instruction "processed payment of ... to Merchant" pattern
        val siSms = "We have successfully processed payment of INR 1196.72 to Merchant MAX LIFE, as per Standing Instruction Xjpr8LiZj3 on 13/03/2026 for ICICI Bank Credit Card 7017."
        assertTrue(parser.isFinancialSMS("JX-ICICIT-T", siSms))
        val parsedSi = parser.parseFinancialSMS("test_id", "JX-ICICIT-T", siSms, System.currentTimeMillis())
        assertNotNull(parsedSi)
        parsedSi?.let {
            assertEquals("Max Life", it.merchant)
            assertEquals(1196.72, it.amount, 0.0)
            assertTrue(it.isAutoPay)
        }

        // Test ACH/NACH Credit Override (CREDIT should never be isAutoPay)
        val achCreditSms = "ICICI Bank Account XX898 credited:Rs. 2.00 on 27-Mar-26. Info ACH*IOCL*29705990. Available Balance is Rs. 61,431.09."
        assertTrue(parser.isFinancialSMS("AD-ICICIT-S", achCreditSms))
        val parsedAchCredit = parser.parseFinancialSMS("test_id", "AD-ICICIT-S", achCreditSms, System.currentTimeMillis())
        assertNotNull(parsedAchCredit)
        parsedAchCredit?.let {
            assertEquals("ICICI Bank", it.merchant)
            assertEquals("CREDIT", it.type)
            assertFalse(it.isAutoPay)
        }
    }

    @Test
    fun analyzeSmsBackup() {
        val xmlFile = File("C:\\Users\\admin\\Downloads\\sms-20260704182832.xml")
        if (!xmlFile.exists()) {
            println("XML File does not exist: ${xmlFile.absolutePath}")
            return
        }

        val csvFile = File("c:\\vasu\\autopay detector\\sms_analysis_report.csv")
        val writer = PrintWriter(csvFile)
        
        // Write CSV Header
        writer.println("Sender,Body,IsFinancial,ParsedAmount,ParsedBank,ParsedMerchant,ParsedCategory,ParsedType,IsAutoPay,PaymentMethod,Status,IsSetupOrCancellation")

        val addressPattern = Pattern.compile("address=\"([^\"]*)\"")
        val bodyPattern = Pattern.compile("body=\"([^\"]*)\"")

        var totalCount = 0
        var financialCount = 0
        var unknownMerchantCount = 0
        var othersCategoryCount = 0

        println("Processing XML file: ${xmlFile.absolutePath}")

        xmlFile.useLines { lines ->
            for (line in lines) {
                if (line.trim().startsWith("<sms ")) {
                    totalCount++
                    val addressMatcher = addressPattern.matcher(line)
                    val bodyMatcher = bodyPattern.matcher(line)
                    
                    if (addressMatcher.find() && bodyMatcher.find()) {
                        val sender = addressMatcher.group(1) ?: ""
                        val rawBody = bodyMatcher.group(1) ?: ""
                        val body = unescapeXml(rawBody)

                        val isFin = FinanceParser.isFinancialSMS(sender, body)
                        if (isFin) {
                            financialCount++
                            val parsed = FinanceParser.parseFinancialSMS("id_$totalCount", sender, body, System.currentTimeMillis())
                            if (parsed != null) {
                                val amt = parsed.amount
                                val bankName = parsed.bank
                                val merch = parsed.merchant
                                val cat = parsed.category
                                val typeStr = parsed.type
                                val autoPay = parsed.isAutoPay
                                val payMethod = parsed.paymentMethod
                                val statusStr = parsed.status
                                val setupCancel = parsed.isSetupOrCancellation

                                if (merch == "Unknown Merchant") {
                                    unknownMerchantCount++
                                }
                                if (cat == "Others") {
                                    othersCategoryCount++
                                }

                                writer.println("${escapeCsv(sender)},${escapeCsv(body)},true,$amt,${escapeCsv(bankName)},${escapeCsv(merch)},${escapeCsv(cat)},$typeStr,$autoPay,$payMethod,$statusStr,$setupCancel")
                            } else {
                                writer.println("${escapeCsv(sender)},${escapeCsv(body)},true,0.0,Unknown Bank,Failed to Parse,Others,DEBIT,false,Unknown,Success,false")
                            }
                        }
                    }
                }
            }
        }

        writer.close()
        println("=== PROCESS COMPLETE ===")
        println("Total Messages in XML: $totalCount")
        println("Financial Messages Found: $financialCount")
        println("  - Unknown Merchant: $unknownMerchantCount")
        println("  - 'Others' Category: $othersCategoryCount")
        println("CSV Report saved to: ${csvFile.absolutePath}")
    }

    private fun unescapeXml(text: String): String {
        return text.replace("&amp;", "&")
                   .replace("&quot;", "\"")
                   .replace("&apos;", "'")
                   .replace("&lt;", "<")
                   .replace("&gt;", ">")
    }

    private fun escapeCsv(text: String): String {
        val clean = text.replace("\"", "\"\"")
        return "\"$clean\""
    }
}
