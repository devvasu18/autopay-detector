package com.autopaytracker

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

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
