import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, PermissionsAndroid,
  Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { extractTransaction } from './extractor';
import { getResponse } from './finize';
import SmsAndroid from 'react-native-get-sms-android';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [tab, setTab] = useState('chat'); // 'chat' or 'transactions'
  const flatListRef = useRef(null);

  // Request SMS permission and read messages
  const readSMS = async () => {
    setSmsLoading(true);
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        { title: 'SMS Permission', message: 'Palfin needs to read your SMS to extract transactions' }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        alert('SMS permission denied');
        setSmsLoading(false);
        return;
      }

      SmsAndroid.list(
        JSON.stringify({ box: 'inbox', maxCount: 200 }),
        (fail) => { console.log('SMS read failed:', fail); setSmsLoading(false); },
        (count, smsList) => {
          const messages = JSON.parse(smsList);
          const extracted = [];
          messages.forEach(msg => {
            const tx = extractTransaction(msg.body);
            if (tx) extracted.push({ ...tx, id: msg._id || Math.random().toString() });
          });
          setTransactions(prev => [...prev, ...extracted]);
          setSmsLoading(false);
          alert(Found ${extracted.length} transactions!);
        }
      );
    } catch (e) {
      console.error(e);
      setSmsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { from: 'user', text: input };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setInput('');
    setLoading(true);

    try {
      const { response } = await getResponse(input, transactions, null, newHistory, null);
      setChatHistory(prev => [...prev, { from: 'finize', text: response }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { from: 'finize', text: 'Something went wrong. Try again.' }]);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Palfin</Text>
        <TouchableOpacity style={styles.smsBtn} onPress={readSMS}>
          {smsLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.smsBtnText}>Read SMS</Text>}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'chat' && styles.activeTab]} onPress={() => setTab('chat')}>
          <Text style={[styles.tabText, tab === 'chat' && styles.activeTabText]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'transactions' && styles.activeTab]} onPress={() => setTab('transactions')}>
          <Text style={[styles.tabText, tab === 'transactions' && styles.activeTabText]}>
            Transactions ({transactions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, i) => i.toString()}
            style={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.from === 'user' ? styles.userBubble : styles.botBubble]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Ask Finize anything about your finances...</Text>
            }
          />
          {loading && <ActivityIndicator style={{ marginBottom: 8 }} color="#0057D9" />}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Finize..."
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <FlatList
          data={transactions}
          keyExtractor={(item, i) => item.id || i.toString()}
          style={{ flex: 1, padding: 12 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No transactions yet. Tap "Read SMS" to extract.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.txCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.txMerchant}>{item.merchant || 'Unknown'}</Text>
                <Text style={[styles.txAmount, { color: item.type === 'credit' ? '#00b386' : '#e53935' }]}>
                  {item.type === 'credit' ? '+' : '-'}₹{item.amount}
                </Text>
              </View>
              <Text style={styles.txDate}>{item.date || 'No date'}</Text>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { backgroundColor: '#0057D9', padding: 16, paddingTop: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  smsBtn: { backgroundColor: '#ffffff33', padding: 8, borderRadius: 8 },
  smsBtnText: { color: '#fff', fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e6e6ee' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#0057D9' },
  tabText: { color: '#888', fontWeight: '500' },
  activeTabText: { color: '#0057D9' },
  chatList: { flex: 1, padding: 12 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  userBubble: { backgroundColor: '#0057D9', alignSelf: 'flex-end' },
  botBubble: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e6e6ee' },
  bubbleText: { color: '#222', fontSize: 14 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e6e6ee' },
  textInput: { flex: 1, borderWidth: 1, borderColor: '#e6e6ee', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 },
  sendBtn: { backgroundColor: '#0057D9', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '600' },
  txCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e6e6ee' },
  txMerchant: { fontWeight: '600', fontSize: 15, color: '#222' },
  txAmount: { fontWeight: '700', fontSize: 15 },
  txDate: { color: '#aaa', fontSize: 12, marginTop: 4 },
});