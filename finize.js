// Finize service that calls Gemini for personalised, spending-aware advice.
// Keeps a local conversation log and falls back to a heuristic policy
// if the API key isn't configured or the call fails.

const logs = [];

const GEMINI_API_KEY = "AIzaSyANMT_4tNZ7cakK9U5_yYdJNxNhHZFC-3k";

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

function simpleFallbackPolicy(message, transactions = []) {
  const msg = (message || '').toLowerCase();

  // If user asks about saving or budget
  if (/(save|saving|budget|spend less|help me save)/i.test(msg)) {
    const total = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);
    if (total > 10000)
      return `I see your spending this period is ₹${Math.round(
        total
      )} — consider setting a strict weekly budget and pausing non-essential subscriptions for 30 days.`;
    if (total > 5000)
      return You're spending moderately; pick one category (like eating out or shopping) and cap it next month. Even a 10–15% cut can free up savings.;
    return Nice work keeping your overall spending lower. Try automating a fixed savings amount every month so it "gets spent" into your savings before you can use it.;
  }

  // If user asks about a transaction or merchant
  if (/starbucks|coffee|cafe|restaurant/i.test(msg)) {
    return That looks like dining/coffee spend. Swap just one weekly café visit for home-brewed coffee and you could redirect ~₹500–₹800 a month into savings.;
  }

  // Default friendly response
  return I'm Finize, your financial coach. Ask me how to reduce spending, build a budget, or how a specific transaction affects your goals.;
}

function formatTransactionsContext(transactions = []) {
  if (!Array.isArray(transactions) || !transactions.length) {
    return 'No detailed transaction data was provided.';
  }

  const total = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);
  const recent = transactions.slice(-10).map((t, idx) => {
    const amt = Number(t.amount || 0);
    const desc = t.description || t.merchant || t.category || 'Transaction';
    const date = t.date || t.created_at || '';
    const category = t.category || '';
    return `${idx + 1}. ${desc} — ₹${amt.toFixed(2)}${
      category ? ` [${category}]` : ''
    }${date ? ` on ${date}` : ''}`;
  });

  return [
    Total spending in the current period (approx): ₹${total.toFixed(2)}.,
    Recent transactions (most recent last, up to 10):,
    ...recent,
  ].join('\n');
}

function formatFinancialSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 'No additional budget/savings snapshot is available.';

  const lines = [];

  if (typeof snapshot.monthlySpend === 'number') {
    lines.push(Current monthly spend (from dashboard): ₹${snapshot.monthlySpend.toFixed(2)}.);
  }
  if (typeof snapshot.budget === 'number') {
    lines.push(Approximate monthly budget: ₹${snapshot.budget.toFixed(2)}.);
  }
  if (typeof snapshot.budgetProgress === 'number') {
    lines.push(Budget progress: about ${snapshot.budgetProgress}% of the budget used.);
  }
  if (typeof snapshot.savings === 'number') {
    lines.push(Estimated savings balance: ₹${snapshot.savings.toFixed(2)}.);
  }
  if (snapshot.level) {
    lines.push(Gamification level: ${snapshot.level}.);
  }
  if (typeof snapshot.streak === 'number') {
    lines.push(Tracking streak: ${snapshot.streak} days.);
  }
  if (typeof snapshot.points === 'number') {
    lines.push(Reward points: ${snapshot.points}.);
  }

  if (!lines.length) return 'No additional budget/savings snapshot is available.';

  return lines.join('\n');
}

function buildGeminiPayload(message, transactions, user, history = [], snapshot = null) {
  const userId = (user && (user.email || user.id)) || 'anonymous';
  const txContext = formatTransactionsContext(transactions);
  const snapshotText = formatFinancialSnapshot(snapshot);

  const systemInstruction = `
You are Finize, a friendly, behaviourally-informed personal finance coach for an Indian user.
- Focus on *how the user spends money* and give concrete, rupee-denominated suggestions.
- Use the transaction context when available, but do *not* invent exact balances that are not in the data.
- Help the user "spend" their money more intentionally: re-allocate wasteful expenditure into savings, goals, or debt repayment.
- Keep answers short, practical, and conversational. Never mention that you are an AI model.

User identifier: ${userId}

Transaction context:
${txContext}

Financial snapshot (from app-level metrics):
${snapshotText}
`.trim();

  const historyContents = Array.isArray(history)
    ? history.map((m) => {
        const role = m.from === 'finize' ? 'model' : 'user';
        return {
          role,
          parts: [{ text: String(m.text || '') }],
        };
      })
    : [];

  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: systemInstruction }],
      },
      ...historyContents,
      {
        role: 'user',
        parts: [{ text: String(message || '') }],
      },
    ],
  };
}

async function callGemini(message, transactions, user, history = [], snapshot = null) {
  if (!GEMINI_API_KEY) {
    return {
      text: simpleFallbackPolicy(message, transactions),
      usedFallback: true,
    };
  }

  const payload = buildGeminiPayload(message, transactions, user, history, snapshot);
  const url = https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY};

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Surface rate-limit / quota issues separately so the UI can show a clear message
      if (res.status === 429) {
        throw new Error('Gemini error: 429 (rate limit or quota exceeded)');
      }
      throw new Error(Gemini error: ${res.status});
    }

    const data = await res.json();
    const text =
      (data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        Array.isArray(data.candidates[0].content.parts) &&
        data.candidates[0].content.parts
          .map((p) => p.text || '')
          .join(' ')
          .trim()) ||
      simpleFallbackPolicy(message, transactions);

    return { text, usedFallback: false };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn('Gemini call failed, using fallback:', msg);

    // If it’s clearly a quota / rate-limit issue, return an explicit message
    if (msg.includes('429')) {
      return {
        text:
          'I’m temporarily unable to reach my Gemini brain because the API quota or rate limit was hit. ' +
          'Please wait a bit and try again, or update your Gemini key / quota settings.',
        usedFallback: true,
      };
    }

    return {
      text: simpleFallbackPolicy(message, transactions),
      usedFallback: true,
    };
  }
}

export async function getResponse(message, transactions = [], user = null, history = [], snapshot = null) {
  const { text } = await callGemini(message, transactions, user, history, snapshot);
  const entry = {
    ts: Date.now(),
    user: user ? user.email || user.id || 'anon' : 'anon',
    message,
    response: text,
  };
  logs.push(entry);
  return { response: text, entry };
}

export function getLogs() {
  return logs.slice();
}

export function clearLogs() {
  logs.length = 0;
}

// Mock training endpoint — in real world this would train an RL model using logs
export async function trainMock() {
  // pretend to run training
  return { status: 'ok', trainedOn: logs.length };
}