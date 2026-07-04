import { NativeModules } from 'react-native';

const { FinanceCoreModule } = NativeModules;

export interface Transaction {
  id: number;
  sms_id: string | null;
  merchant: string;
  amount: number;
  date: number; // timestamp
  payment_method: string;
  bank: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  confidence: number;
  status: string;
  raw_body: string;
}

export interface AutoPay {
  id: number;
  merchant: string;
  amount: number;
  frequency: string;
  bank: string;
  upi_id: string;
  status: 'Active' | 'Paused' | 'Cancelled' | 'Expired' | 'Missed';
  first_detected: number;
  last_payment: number;
  next_expected_payment: number;
  sms_id: string;
  raw_body: string;
}

export const db = {
  execute: async (query: string, params: any[] = []): Promise<any> => {
    if (!FinanceCoreModule) {
      console.warn('FinanceCoreModule is not available');
      return [];
    }
    return FinanceCoreModule.executeSql(query, params);
  },

  getTransactions: async (
    limit: number = 50,
    offset: number = 0,
    search: string = '',
    category: string = '',
    type: string = ''
  ): Promise<Transaction[]> => {
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params: any[] = [];

    if (search) {
      sql += ' AND (merchant LIKE ? OR raw_body LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (type && type !== 'All') {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.execute(sql, params);
  },

  getAutoPays: async (): Promise<AutoPay[]> => {
    return db.execute(
      `SELECT id, merchant, amount, frequency, bank, upi_id, status, 
              MIN(first_detected) as first_detected, 
              MAX(last_payment) as last_payment, 
              next_expected_payment, sms_id, raw_body 
       FROM autopay 
       GROUP BY merchant, amount 
       ORDER BY last_payment DESC`
    );
  },

  getStats: async (startDate?: number) => {
    // Healing migration for existing incorrect category entries
    try {
      await db.execute(`
        UPDATE transactions 
        SET category = 'Insurance' 
        WHERE category = 'Recharge' 
          AND (
            raw_body LIKE '%lic%' 
            OR raw_body LIKE '%insurance%' 
            OR (raw_body LIKE '%premium%' AND raw_body NOT LIKE '%spotify%' AND raw_body NOT LIKE '%youtube%' AND raw_body NOT LIKE '%netflix%' AND raw_body NOT LIKE '%prime%')
          )
      `);
    } catch (e) {
      console.warn('Healing category migration failed:', e);
    }

    // Retroactive cleanup of legacy incorrect transactions (operator receipts, statement alerts, discount ads)
    try {
      await db.execute(`
        DELETE FROM transactions 
        WHERE 
          (
            raw_body LIKE '%credited to your%airtel%'
            OR raw_body LIKE '%credited to your%jio%'
            OR raw_body LIKE '%credited to your%vi%'
            OR (raw_body LIKE '%recharge%' AND raw_body LIKE '%credited%' AND raw_body LIKE '%validity%')
            OR (raw_body LIKE '%recharge%' AND raw_body LIKE '%successful%' AND raw_body LIKE '%for your%')
          )
          OR 
          (
            (raw_body LIKE '%bill%' AND (raw_body LIKE '%generated%' OR raw_body LIKE '%has been generated%'))
            AND raw_body NOT LIKE '%debited%'
            AND raw_body NOT LIKE '%paid%'
            AND raw_body NOT LIKE '%spent%'
          )
          OR
          (
            (raw_body LIKE '%amount to be paid%' OR raw_body LIKE '%amount due%' OR raw_body LIKE '%due date:%' OR raw_body LIKE '%due date is%')
            AND raw_body NOT LIKE '%debited%'
            AND raw_body NOT LIKE '%paid%'
            AND raw_body NOT LIKE '%spent%'
          )
          OR
          (
            (raw_body LIKE '%enjoy%' AND raw_body LIKE '%off%')
            AND raw_body NOT LIKE '%debited%'
            AND raw_body NOT LIKE '%paid%'
            AND raw_body NOT LIKE '%spent%'
          )
          OR
          (
            (raw_body LIKE '%shop safely%' OR raw_body LIKE '%open now%')
            AND raw_body NOT LIKE '%debited%'
            AND raw_body NOT LIKE '%paid%'
            AND raw_body NOT LIKE '%spent%'
          )
          OR
          (
            (raw_body LIKE '%test drive%' OR raw_body LIKE '%attractive benefits%' OR raw_body LIKE '%deals you%miss%' OR raw_body LIKE '%emi/lakh%' OR raw_body LIKE '%on-road funding%')
            AND raw_body NOT LIKE '%debited%'
            AND raw_body NOT LIKE '%paid%'
            AND raw_body NOT LIKE '%spent%'
          )
      `);
    } catch (e) {
      console.warn('Retroactive clean-up migration failed:', e);
    }

    let dateCond = '';
    const params: any[] = [];
    if (startDate) {
      dateCond = ' AND date >= ?';
      params.push(startDate);
    }

    const incomeRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'CREDIT'" + dateCond,
      params
    );
    const expenseRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT'" + dateCond,
      params
    );
    const activeAutoPayRes = await db.execute(
      "SELECT COUNT(*) as count FROM autopay WHERE status = 'Active'"
    );
    const totalAutoPayRes = await db.execute(
      "SELECT COUNT(*) as count FROM autopay"
    );
    const largestExpenseRes = await db.execute(
      "SELECT merchant, amount, date FROM transactions WHERE type = 'DEBIT'" + dateCond + " ORDER BY amount DESC LIMIT 1",
      params
    );
    const recentTxRes = await db.execute(
      "SELECT * FROM transactions" + (startDate ? " WHERE date >= ?" : "") + " ORDER BY date DESC LIMIT 5",
      startDate ? [startDate] : []
    );

    const ottRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND category IN ('Subscription', 'OTT')" + dateCond,
      params
    );
    const autopayRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND sms_id IN (SELECT DISTINCT sms_id FROM autopay)" + dateCond,
      params
    );
    const bankRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND (payment_method = 'Bank Transfer' OR category = 'Loan / EMI')" + dateCond,
      params
    );
    const rechargeRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND category = 'Recharge'" + dateCond,
      params
    );

    const totalIncome = incomeRes[0]?.total || 0;
    const totalExpense = expenseRes[0]?.total || 0;
    const ottSpend = ottRes[0]?.total || 0;
    const autopaySpend = autopayRes[0]?.total || 0;
    const bankSpend = bankRes[0]?.total || 0;
    const rechargeSpend = rechargeRes[0]?.total || 0;

    return {
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
      activeAutoPays: activeAutoPayRes[0]?.count || 0,
      totalAutoPays: totalAutoPayRes[0]?.count || 0,
      largestExpense: largestExpenseRes[0] || null,
      recentTransactions: recentTxRes || [],
      ottSpend,
      autopaySpend,
      bankSpend,
      rechargeSpend,
    };
  },

  getCategorySpending: async (): Promise<{ category: string; amount: number }[]> => {
    return db.execute(
      "SELECT category, SUM(amount) as amount FROM transactions WHERE type = 'DEBIT' GROUP BY category ORDER BY amount DESC"
    );
  },

  getMonthlySpending: async (): Promise<{ month: string; amount: number }[]> => {
    // Format timestamp to month name or number
    // We group by year and month
    // In Android SQLite, strftime can be used if we store standard dates, but since we store epoch millis, we can format using strftime('%Y-%m', datetime(date / 1000, 'unixepoch'))
    return db.execute(
      "SELECT strftime('%m', datetime(date / 1000, 'unixepoch')) as month, SUM(amount) as amount FROM transactions WHERE type = 'DEBIT' GROUP BY month ORDER BY month ASC"
    );
  },

  getWeeklySpending: async (): Promise<{ day: string; amount: number }[]> => {
    return db.execute(
      "SELECT strftime('%w', datetime(date / 1000, 'unixepoch')) as day, SUM(amount) as amount FROM transactions WHERE type = 'DEBIT' AND date > ? GROUP BY day ORDER BY day ASC",
      [Date.now() - 7 * 24 * 60 * 60 * 1000] // last 7 days
    );
  },

  seedDummyData: async (): Promise<void> => {
    // Check if we already have data
    const txCount = await db.execute('SELECT COUNT(*) as count FROM transactions');
    if (txCount[0]?.count > 0) {
      console.log('Database already has records, skipping seed.');
      return;
    }

    console.log('Seeding database with rich financial dummy data...');
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // A list of dummy transactions to insert
    const dummyTxs = [
      {
        sms_id: 'dummy_1',
        merchant: 'Netflix',
        amount: 649.0,
        date: now - 1 * day,
        payment_method: 'UPI',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'OTT',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Your UPI AutoPay of Rs 649.00 to Netflix for subscription renewal was successful. Ref: 312345678901 - HDFC Bank',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_2',
        merchant: 'Swiggy',
        amount: 349.5,
        date: now - 1.5 * day,
        payment_method: 'UPI',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'Food',
        confidence: 0.98,
        status: 'Success',
        raw_body: 'Dear customer, Rs 349.50 spent at Swiggy on HDFC Bank Card ending 4321. Bal Rs 45,320.',
      },
      {
        sms_id: 'dummy_3',
        merchant: 'TCS Salary',
        amount: 85000.0,
        date: now - 3 * day,
        payment_method: 'Bank Transfer',
        bank: 'SBI',
        type: 'CREDIT',
        category: 'Salary',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Dear Customer, your A/c ending 9876 has been credited with Salary Rs 85,000.00 on 30-Jun-2026. - State Bank of India',
      },
      {
        sms_id: 'dummy_4',
        merchant: 'HDFC Home Loan',
        amount: 18500.0,
        date: now - 4 * day,
        payment_method: 'Bank Transfer',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'Loan / EMI',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Standing Instruction executed: Rs 18,500.00 debited from HDFC A/c 5432 towards Loan EMI. Ref: SI-100234',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_5',
        merchant: 'Amazon Prime',
        amount: 1499.0,
        date: now - 8 * day,
        payment_method: 'Card',
        bank: 'ICICI Bank',
        type: 'DEBIT',
        category: 'OTT',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Subscription renewed! Rs 1,499.00 debited on ICICI Credit Card ending 1234 towards Amazon Prime Annual Membership.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_6',
        merchant: 'HDFC Mutual Fund',
        amount: 5000.0,
        date: now - 10 * day,
        payment_method: 'UPI',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'Investment',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Mutual Fund SIP Success! Rs 5,000.00 debited from HDFC Bank Account via UPI Mandate to Groww SIP.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_7',
        merchant: 'Jio Prepaid',
        amount: 299.0,
        date: now - 12 * day,
        payment_method: 'UPI',
        bank: 'Paytm Bank',
        type: 'DEBIT',
        category: 'Recharge',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Mobile recharge successful: Rs 299.00 paid via UPI to Reliance Jio Infocomm on Paytm Bank.',
        is_autopay: false,
      },
      {
        sms_id: 'dummy_8',
        merchant: 'Zomato',
        amount: 520.0,
        date: now - 6 * day,
        payment_method: 'UPI',
        bank: 'Axis Bank',
        type: 'DEBIT',
        category: 'Food',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Sent Rs 520.00 to Zomato via UPI on Axis Bank app. Ref 342345678.',
      },
      {
        sms_id: 'dummy_9',
        merchant: 'BESCOM Bill',
        amount: 1850.0,
        date: now - 14 * day,
        payment_method: 'UPI',
        bank: 'SBI',
        type: 'DEBIT',
        category: 'Bill',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'AutoPay executed! Your BESCOM Electricity Bill of Rs 1,850.00 was successfully debited from SBI Account via BillDesk Mandate.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_10',
        merchant: 'Spotify Premium',
        amount: 119.0,
        date: now - 20 * day,
        payment_method: 'Card',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'OTT',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Automatic Payment of Rs 119.00 to Spotify was successful on HDFC Debit Card ending 6655.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_11',
        merchant: 'LIC Premium',
        amount: 4500.0,
        date: now - 25 * day,
        payment_method: 'Bank Transfer',
        bank: 'ICICI Bank',
        type: 'DEBIT',
        category: 'Insurance',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Standing instruction successful. Rs 4,500.00 auto debited to LIC of India from ICICI account 1099.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_12',
        merchant: 'Google One',
        amount: 130.0,
        date: now - 28 * day,
        payment_method: 'UPI',
        bank: 'Axis Bank',
        type: 'DEBIT',
        category: 'Subscription',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'UPI Autopay successful: Rs 130.00 debited to Google Play storage from Axis account. Ref 9087654.',
        is_autopay: true,
        autopay_status: 'Active',
      },
      {
        sms_id: 'dummy_13',
        merchant: 'Disney+ Hotstar',
        amount: 1499.0,
        date: now - 32 * day,
        payment_method: 'UPI',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'OTT',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'UPI Mandate cancelled: AutoPay subscription of Rs 1499.00 to Disney Hotstar has been revoked by customer.',
        is_autopay: true,
        autopay_status: 'Cancelled',
      },
      {
        sms_id: 'dummy_14',
        merchant: 'Cashback Refund',
        amount: 150.0,
        date: now - 5 * day,
        payment_method: 'UPI',
        bank: 'ICICI Bank',
        type: 'CREDIT',
        category: 'Cashback',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Cashback of Rs 150.00 credited to ICICI Bank A/c ending 1234 for Amazon pay shopping transaction.',
      },
      {
        sms_id: 'dummy_15',
        merchant: 'Uber Rides',
        amount: 430.0,
        date: now - 7 * day,
        payment_method: 'UPI',
        bank: 'HDFC Bank',
        type: 'DEBIT',
        category: 'Travel / Fuel',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Sent Rs 430.00 to Uber India via UPI from HDFC Bank account.',
      },
      {
        sms_id: 'dummy_16',
        merchant: 'Apple iCloud',
        amount: 75.0,
        date: now - 45 * day,
        payment_method: 'Card',
        bank: 'ICICI Bank',
        type: 'DEBIT',
        category: 'Subscription',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'Auto Renewal of iCloud 50GB plan was successful. Rs 75.00 charged on ICICI card ending 1234.',
        is_autopay: true,
        autopay_status: 'Expired',
      },
      {
        sms_id: 'dummy_17',
        merchant: 'Gold Gym',
        amount: 2500.0,
        date: now - 50 * day,
        payment_method: 'UPI',
        bank: 'SBI',
        type: 'DEBIT',
        category: 'Subscription',
        confidence: 0.95,
        status: 'Success',
        raw_body: 'UPI Autopay mandate active. Rs 2,500.00 debited from SBI account for Golds Gym monthly plan.',
        is_autopay: true,
        autopay_status: 'Paused',
      }
    ];

    // Begin a native transaction to seed the db
    await db.execute('BEGIN TRANSACTION');
    try {
      for (const tx of dummyTxs) {
        // Insert into raw_sms
        await db.execute(
          'INSERT OR IGNORE INTO raw_sms (id, address, body, date, is_processed) VALUES (?, ?, ?, ?, 1)',
          [tx.sms_id, tx.merchant.toUpperCase(), tx.raw_body, tx.date]
        );

        // Insert into transactions
        await db.execute(
          `INSERT OR REPLACE INTO transactions 
           (sms_id, merchant, amount, date, payment_method, bank, type, category, confidence, status, raw_body) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.sms_id,
            tx.merchant,
            tx.amount,
            tx.date,
            tx.payment_method,
            tx.bank,
            tx.type,
            tx.category,
            tx.confidence,
            tx.status,
            tx.raw_body,
          ]
        );

        // Insert into autopay if applicable
        if (tx.is_autopay) {
          const upiId = tx.raw_body.match(/([a-zA-Z0-9\.\-_]+@[a-zA-Z0-9]+)/)?.[1] || '';
          await db.execute(
            `INSERT OR REPLACE INTO autopay 
             (merchant, amount, frequency, bank, upi_id, status, first_detected, last_payment, next_expected_payment, sms_id, raw_body) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              tx.merchant,
              tx.amount,
              'Monthly',
              tx.bank,
              upiId,
              tx.autopay_status || 'Active',
              tx.date - 90 * day, // first detected 90 days ago
              tx.date, // last payment
              tx.date + 30 * day, // next expected payment
              tx.sms_id,
              tx.raw_body,
            ]
          );
        }
      }
      await db.execute('COMMIT');
      console.log('Database seeded successfully!');
    } catch (error) {
      await db.execute('ROLLBACK');
      console.error('Failed to seed database:', error);
    }
  },

  clearDatabase: async (): Promise<void> => {
    await db.execute('DELETE FROM raw_sms');
    await db.execute('DELETE FROM transactions');
    await db.execute('DELETE FROM autopay');
    console.log('Database cleared.');
  },

  getSetting: async (key: string, defaultValue: string): Promise<string> => {
    await db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
    const res = await db.execute('SELECT value FROM settings WHERE key = ?', [key]);
    return res[0]?.value ?? defaultValue;
  },

  setSetting: async (key: string, value: string): Promise<void> => {
    await db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
    await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
};
