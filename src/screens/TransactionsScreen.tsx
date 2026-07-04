import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  DeviceEventEmitter,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db, Transaction } from '../services/db';
import { MerchantLogo } from '../components/MerchantLogo';

export const TransactionsScreen: React.FC = () => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('NEWEST');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const categories = [
    'All',
    'Subscription',
    'Food',
    'Travel / Fuel',
    'Shopping',
    'Bill',
    'Recharge',
    'OTT',
    'Insurance',
    'Salary',
    'Cashback',
    'Refund',
    'Investment',
    'Loan / EMI',
    'Others',
  ];

  const fetchTransactions = useCallback(
    async (pageNum: number, isInitial: boolean = false) => {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const pageSize = 50;
        const offset = pageNum * pageSize;
        // In db.ts, getTransactions handles filters.
        // Let's modify sorting in JS or support sorting queries.
        // For simplicity, we query filtered data, and then apply sort in memory or query directly.
        // Let's fetch all filtered data and sort them, or write an adaptive SQL.
        // Let's implement sorting directly in the SQL query since we want production-readiness!
        // So let's write the query here or build it.
        // Wait, we can construct the query directly using db.execute.
        let sql = 'SELECT * FROM transactions WHERE 1=1';
        const params: any[] = [];

        if (search) {
          sql += ' AND (merchant LIKE ? OR raw_body LIKE ?)';
          params.push(`%${search}%`, `%${search}%`);
        }
        if (selectedCategory && selectedCategory !== 'All') {
          sql += ' AND category = ?';
          params.push(selectedCategory);
        }
        if (selectedType && selectedType !== 'All') {
          sql += ' AND type = ?';
          params.push(selectedType);
        }

        // Apply Sorting
        if (sortOrder === 'NEWEST') {
          sql += ' ORDER BY date DESC';
        } else if (sortOrder === 'OLDEST') {
          sql += ' ORDER BY date ASC';
        } else if (sortOrder === 'AMOUNT_DESC') {
          sql += ' ORDER BY amount DESC';
        } else if (sortOrder === 'AMOUNT_ASC') {
          sql += ' ORDER BY amount ASC';
        }

        sql += ` LIMIT ${pageSize} OFFSET ${offset}`;

        const data = await db.execute(sql, params);

        if (isInitial) {
          setTransactions(data);
          setHasMore(data.length === pageSize);
        } else {
          setTransactions((prev) => [...prev, ...data]);
          setHasMore(data.length === pageSize);
        }
      } catch (err) {
        console.warn('Failed to load transactions', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, selectedCategory, selectedType, sortOrder]
  );

  // Trigger initial fetch when filter choices or search query changes
  useEffect(() => {
    setPage(0);
    fetchTransactions(0, true);
  }, [search, selectedCategory, selectedType, sortOrder, fetchTransactions]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onNewTransaction', () => {
      setPage(0);
      fetchTransactions(0, true);
    });
    return () => {
      subscription.remove();
    };
  }, [fetchTransactions]);

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransactions(nextPage, false);
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })}`;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return 'N/A';
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'N/A';
    }
  };

  const toggleSort = () => {
    if (sortOrder === 'NEWEST') setSortOrder('AMOUNT_DESC');
    else if (sortOrder === 'AMOUNT_DESC') setSortOrder('AMOUNT_ASC');
    else if (sortOrder === 'AMOUNT_ASC') setSortOrder('OLDEST');
    else setSortOrder('NEWEST');
  };

  const renderTxItem = ({ item }: { item: Transaction }) => (
    <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.txIconContainer}>
        <MerchantLogo name={item.merchant} size={40} />
      </View>
      <View style={styles.txDetails}>
        <Text style={[styles.txMerchant, { color: colors.text }]} numberOfLines={1}>
          {item.merchant}
        </Text>
        <Text style={[styles.txSubText, { color: colors.textSecondary }]}>
          {formatDate(item.date)} • {formatTime(item.date)} • {item.bank}
        </Text>
      </View>
      <View style={styles.txAmountContainer}>
        <Text
          style={[
            styles.txAmount,
            { color: item.type === 'CREDIT' ? colors.textGreen : colors.text },
          ]}
        >
          {item.type === 'CREDIT' ? '+' : '-'}{formatCurrency(item.amount)}
        </Text>
        <Text style={[styles.txCategory, { color: colors.textSecondary }]}>
          {item.category}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Header */}
      <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[
            styles.searchInput,
            { backgroundColor: colors.surfaceVariant, color: colors.text },
          ]}
          placeholder="Search merchant, bank, keyword..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.sortButton, { borderColor: colors.border }]}
            onPress={toggleSort}
          >
            <Text style={[styles.sortButtonText, { color: colors.primary }]}>
              Sort: {sortOrder.replace('_', ' ')}
            </Text>
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
            {['All', 'CREDIT', 'DEBIT'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor:
                      selectedType === type ? colors.primary : colors.surfaceVariant,
                  },
                ]}
                onPress={() => setSelectedType(type)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    { color: selectedType === type ? '#FFF' : colors.text },
                  ]}
                >
                  {type === 'CREDIT' ? 'Credits' : type === 'DEBIT' ? 'Debits' : 'All Types'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Category Scrolling Filter */}
      <View style={styles.categoryFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                {
                  backgroundColor:
                    selectedCategory === cat ? colors.primaryContainer : colors.card,
                  borderColor: selectedCategory === cat ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: selectedCategory === cat ? colors.primary : colors.text },
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Transactions List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔎</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Transactions Found</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Try clearing search keywords or checking other category filters.
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTxItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 20,
    fontSize: 14,
    marginBottom: 10,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
  },
  sortButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  typeScroll: {
    flex: 1,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryFilterContainer: {
    paddingVertical: 10,
    paddingLeft: 20,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
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
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  txIconContainer: {
    marginRight: 16,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txDetails: {
    flex: 1,
  },
  txMerchant: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  txSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  txCategory: {
    fontSize: 11,
    marginTop: 2,
  },
});
