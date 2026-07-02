import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  DeviceEventEmitter,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db } from '../services/db';

const { width } = Dimensions.get('window');

interface CategorySpend {
  category: string;
  amount: number;
}

interface MonthlySpend {
  month: string;
  amount: number;
}

export const AnalyticsScreen: React.FC = () => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [categoryData, setCategoryData] = useState<CategorySpend[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlySpend[]>([]);
  const [overview, setOverview] = useState({
    income: 0,
    expense: 0,
    savings: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const catSpend = await db.getCategorySpending();
      setCategoryData(catSpend);

      // Fetch monthly spending from DB
      const monthSpend = await db.getMonthlySpending();
      setMonthlyData(monthSpend);

      // Fetch basic overview totals
      const stats = await db.getStats();
      setOverview({
        income: stats.totalIncome,
        expense: stats.totalExpense,
        savings: stats.netSavings,
      });
    } catch (err) {
      console.warn('Failed to load analytics data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const subscription = DeviceEventEmitter.addListener('onNewTransaction', () => {
      loadData();
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  const getMonthName = (monthStr: string) => {
    const monthNum = parseInt(monthStr, 10);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    if (monthNum >= 1 && monthNum <= 12) {
      return months[monthNum - 1];
    }
    return monthStr;
  };

  // Calculations for Category
  const totalCategoryExpense = categoryData.reduce((acc, curr) => acc + curr.amount, 0);

  // Calculations for Monthly chart scaling
  const maxMonthlySpend = monthlyData.reduce((max, curr) => (curr.amount > max ? curr.amount : max), 0) || 1;

  // Income vs Expense progress bar
  const totalFlow = overview.income + overview.expense;
  const incomePct = totalFlow > 0 ? (overview.income / totalFlow) * 100 : 50;
  const expensePct = totalFlow > 0 ? (overview.expense / totalFlow) * 100 : 50;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Analytics & Insights</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Visual breakdown of your financial SMS records
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : overview.income === 0 && overview.expense === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Analytics Available</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Scan financial SMS or seed mock data inside the Profile tab to view spend charts.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Income vs Expense Balance Gauge */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Income vs Expense Flow</Text>
            <View style={styles.ratioLabels}>
              <Text style={[styles.ratioText, { color: colors.textGreen }]}>
                Income: {formatCurrency(overview.income)}
              </Text>
              <Text style={[styles.ratioText, { color: colors.textRed }]}>
                Expense: {formatCurrency(overview.expense)}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${incomePct}%`, backgroundColor: colors.textGreen },
                ]}
              />
              <View
                style={[
                  styles.progressFill,
                  { width: `${expensePct}%`, backgroundColor: colors.textRed },
                ]}
              />
            </View>

            <Text style={[styles.savingsNote, { color: colors.text }]}>
              Net Monthly Savings Rate:{' '}
              <Text style={{ color: overview.savings >= 0 ? colors.textGreen : colors.textRed, fontWeight: 'bold' }}>
                {overview.income > 0
                  ? `${Math.round((overview.savings / overview.income) * 100)}%`
                  : '0%'}
              </Text>
            </Text>
          </View>

          {/* Monthly Spending Vertical Bar Chart */}
          {monthlyData.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 20 }]}>
                Monthly Spending Trend
              </Text>
              <View style={styles.chartContainer}>
                <View style={styles.chartYAxis}>
                  <Text style={[styles.yAxisText, { color: colors.textSecondary }]}>
                    {formatCurrency(maxMonthlySpend)}
                  </Text>
                  <Text style={[styles.yAxisText, { color: colors.textSecondary }]}>
                    {formatCurrency(maxMonthlySpend / 2)}
                  </Text>
                  <Text style={[styles.yAxisText, { color: colors.textSecondary }]}>₹0</Text>
                </View>
                <View style={styles.barArea}>
                  {monthlyData.map((data, index) => {
                    const heightPct = (data.amount / maxMonthlySpend) * 100;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: `${heightPct}%`,
                                backgroundColor: colors.primary,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>
                          {getMonthName(data.month)}
                        </Text>
                        <Text style={[styles.barValueText, { color: colors.textSecondary }]}>
                          {formatCurrency(data.amount)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Category Spend breakdown */}
          {categoryData.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 30 }]}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 15 }]}>
                Category Spend Breakdown
              </Text>
              {categoryData.map((cat, index) => {
                const percentage = totalCategoryExpense > 0 ? (cat.amount / totalCategoryExpense) * 100 : 0;
                return (
                  <View key={index} style={styles.categoryRow}>
                    <View style={styles.categoryMeta}>
                      <Text style={[styles.categoryName, { color: colors.text }]}>{cat.category}</Text>
                      <Text style={[styles.categoryAmt, { color: colors.text }]}>
                        {formatCurrency(cat.amount)} ({Math.round(percentage)}%)
                      </Text>
                    </View>
                    <View style={[styles.categoryTrack, { backgroundColor: colors.surfaceVariant }]}>
                      <View
                        style={[
                          styles.categoryFill,
                          {
                            width: `${percentage}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  ratioLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  ratioText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#EAEAEA',
  },
  progressFill: {
    height: '100%',
  },
  savingsNote: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  chartContainer: {
    flexDirection: 'row',
    height: 200,
  },
  chartYAxis: {
    width: 60,
    justifyContent: 'space-between',
    paddingVertical: 10,
    height: 160,
  },
  yAxisText: {
    fontSize: 9,
    fontWeight: '600',
  },
  barArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barColumn: {
    alignItems: 'center',
    width: 45,
  },
  barTrack: {
    height: 140,
    width: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  barValueText: {
    fontSize: 8,
    marginTop: 2,
    fontWeight: '600',
  },
  categoryRow: {
    marginBottom: 16,
  },
  categoryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryAmt: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  categoryTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryFill: {
    height: '100%',
    borderRadius: 4,
  },
});
