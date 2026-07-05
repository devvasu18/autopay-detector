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

    // Retroactive cleanup of requested money notifications
    try {
      await db.execute(`
        DELETE FROM transactions 
        WHERE raw_body LIKE '%requested money%'
      `);
    } catch (e) {
      console.warn('Requested money cleanup failed:', e);
    }

    // Retroactive cleanup of scheduled reminder transactions (which are not completed debits)
    try {
      await db.execute(`
        DELETE FROM transactions 
        WHERE status = 'Scheduled'
      `);
    } catch (e) {
      console.warn('Scheduled transactions cleanup failed:', e);
    }

    let dateCond = '';
    const params: any[] = [];
    if (startDate) {
      dateCond = ' AND date >= ?';
      params.push(startDate);
    }

    const incomeRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'CREDIT' AND status != 'Failed'" + dateCond,
      params
    );
    const expenseRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND status != 'Failed'" + dateCond,
      params
    );
    const activeAutoPayRes = await db.execute(
      "SELECT COUNT(*) as count FROM autopay WHERE status = 'Active'"
    );
    const totalAutoPayRes = await db.execute(
      "SELECT COUNT(*) as count FROM autopay"
    );
    const largestExpenseRes = await db.execute(
      "SELECT merchant, amount, date FROM transactions WHERE type = 'DEBIT' AND status != 'Failed'" + dateCond + " ORDER BY amount DESC LIMIT 1",
      params
    );
    const recentTxRes = await db.execute(
      "SELECT * FROM transactions" + (startDate ? " WHERE date >= ?" : "") + " ORDER BY date DESC LIMIT 5",
      startDate ? [startDate] : []
    );

    const ottRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND status != 'Failed' AND category = 'OTT'" + dateCond,
      params
    );
    const autopayRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND status != 'Failed' AND sms_id IN (SELECT DISTINCT sms_id FROM autopay)" + dateCond,
      params
    );
    const bankRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND status != 'Failed' AND (payment_method = 'Bank Transfer' OR category = 'Loan / EMI')" + dateCond,
      params
    );
    const rechargeRes = await db.execute(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'DEBIT' AND status != 'Failed' AND category = 'Recharge'" + dateCond,
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
    // No-op: Dummy data seeding is disabled.
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
