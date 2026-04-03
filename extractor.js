import React, { useState } from 'react';
import { TextInput, Button, View, Text } from 'react-native';
import sharedStyles, { THEME } from './sharedStyles';

const cleanNumber = (s) => {
  if (!s) return '';
  return s.replace(/[₹Rs\. ,]/g, '').trim();
};

const extractTransaction = (message) => {
  if (!message) return null;
  const raw = message.trim();

  // Amount & currency: supports formats like "Rs. 1,250.00", "₹1250", "USD 12.50"
  const amountRegex = /(Rs\.?|₹|USD|EUR|GBP|INR|Rs|INR)?\s?([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i;
  const aMatch = raw.match(amountRegex);
  let amount = '';
  let currency = '';
  if (aMatch) {
    currency = (aMatch[1] || '').replace('.', '').trim();
    amount = cleanNumber(aMatch[2]);
  }

  // Merchant: common phrases 'at X', 'towards X', 'purchase at X', 'POS purchase at X'
  let merchant = '';
  const merchantPatterns = [
    /(?:POS purchase at|purchase at|at|towards|to|via)\s+([A-Za-z0-9&'\-\.\s]{2,80})(?=\.|,| on | Avl| Avl Bal|$)/i,
  ];
  for (let p of merchantPatterns) {
    const m = raw.match(p);
    if (m && m[1]) {
      merchant = m[1].trim();
      break;
    }
  }

  // Date patterns
  const dateMatch = raw.match(/(\d{2}[\-/]\d{2}[\-/]\d{4})|(\d{4}-\d{2}-\d{2})|(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/);
  const date = dateMatch ? dateMatch[0] : '';

  // debit/credit
  const type = /debited|spent|withdrawn|purchase|paid/i.test(raw) ? 'debit' : (/credited|refunded|received|cashback/i.test(raw) ? 'credit' : 'debit');

  if (!amount && !merchant && !date) return null;

  return { raw, amount, currency, merchant, date, type };
};

export default function TransactionExtractor({ onExtract }) {
  const [message, setMessage] = useState('');
  const [extracted, setExtracted] = useState(null);

  const handleExtract = () => {
    const tx = extractTransaction(message);
    setExtracted(tx);
    if (tx) {
      // don't auto-add — allow user to confirm/edit
    }
  };

  const handleAdd = () => {
    if (extracted) {
      onExtract(extracted);
      setMessage('');
      setExtracted(null);
    }
  };

  return (
    <View style={[sharedStyles.card, { marginVertical: 6 }]}> 
      <Text style={sharedStyles.sectionTitle}>Paste Transaction Message</Text>

      <TextInput
        placeholder="Paste SMS/email text here"
        value={message}
        onChangeText={setMessage}
        style={{ borderWidth: 1, padding: 8, marginVertical: 8, borderRadius: 8, borderColor: '#e6e6ee' }}
        multiline
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Button title="Extract" onPress={handleExtract} color={THEME ? '#0057D9' : '#0057D9'} />
        <Button title="Clear" onPress={() => { setMessage(''); setExtracted(null); }} color="#888" />
      </View>

      {extracted ? (
        <View>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Extracted (edit if needed)</Text>

          <Text style={{ fontSize: 12, color: '#666' }}>Amount</Text>
          <TextInput value={extracted.amount} onChangeText={v => setExtracted({ ...extracted, amount: v })} style={{ borderWidth: 1, borderColor: '#e6e6ee', borderRadius: 8, padding: 8, marginBottom: 8 }} />

          <Text style={{ fontSize: 12, color: '#666' }}>Currency</Text>
          <TextInput value={extracted.currency} onChangeText={v => setExtracted({ ...extracted, currency: v })} style={{ borderWidth: 1, borderColor: '#e6e6ee', borderRadius: 8, padding: 8, marginBottom: 8 }} />

          <Text style={{ fontSize: 12, color: '#666' }}>Merchant</Text>
          <TextInput value={extracted.merchant} onChangeText={v => setExtracted({ ...extracted, merchant: v })} style={{ borderWidth: 1, borderColor: '#e6e6ee', borderRadius: 8, padding: 8, marginBottom: 8 }} />

          <Text style={{ fontSize: 12, color: '#666' }}>Date</Text>
          <TextInput value={extracted.date} onChangeText={v => setExtracted({ ...extracted, date: v })} style={{ borderWidth: 1, borderColor: '#e6e6ee', borderRadius: 8, padding: 8, marginBottom: 8 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button title="Add Transaction" onPress={handleAdd} color={'#0057D9'} />
            <Button title="Cancel" onPress={() => setExtracted(null)} color="#888" />
          </View>
        </View>
      ) : (
        <Text style={{ marginTop: 8, color: '#666' }}>Tip: paste messages like "Rs. 1,250.00 has been debited..."</Text>
      )}
    </View>
  );
}