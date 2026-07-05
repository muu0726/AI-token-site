"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import ProgressBar from '@/components/ProgressBar';
import Countdown from '@/components/Countdown';

// API Pricing per 1,000,000 tokens (USD)
const PRICING: Record<string, { input: number, output: number }> = {
  gemini: { input: 3.50, output: 10.50 }, // Gemini 1.5 Pro standard rate
  claude: { input: 3.00, output: 15.00 }, // Claude 3.5 Sonnet rate
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  
  // 5-hour rolling state (Web UI)
  const [geminiUsed, setGeminiUsed] = useState(0);
  const [claudeUsed, setClaudeUsed] = useState(0);
  const [geminiMax, setGeminiMax] = useState(50);
  const [claudeMax, setClaudeMax] = useState(45);
  const [geminiRecovery, setGeminiRecovery] = useState<Date | null>(null);
  const [claudeRecovery, setClaudeRecovery] = useState<Date | null>(null);
  
  // Monthly API state (IDE/Terminal)
  const [apiStats, setApiStats] = useState({
    gemini: { prompt: 0, completion: 0, cost: 0 },
    claude: { prompt: 0, completion: 0, cost: 0 },
  });

  const [discordWebhook, setDiscordWebhook] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        router.push('/');
      } else {
        setUser(currentUser);
        fetchConfig(currentUser.uid);
      }
    });
    return () => unsubscribeAuth();
  }, [router]);

  const fetchConfig = async (uid: string) => {
    try {
      const configDoc = await getDoc(doc(db, `users/${uid}/config/settings`));
      if (configDoc.exists()) {
        const data = configDoc.data();
        if (data.gemini_max_limit) setGeminiMax(data.gemini_max_limit);
        if (data.claude_max_limit) setClaudeMax(data.claude_max_limit);
        if (data.discord_webhook_url) setDiscordWebhook(data.discord_webhook_url);
      }
    } catch (e) {
      console.error("Error fetching config", e);
    }
  };

  const saveConfig = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, `users/${user.uid}/config/settings`), {
        discord_webhook_url: discordWebhook,
        gemini_max_limit: geminiMax,
        claude_max_limit: claudeMax
      }, { merge: true });
      alert('設定を保存しました。');
    } catch (e) {
      console.error("Error saving config", e);
      alert('保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Listen to 5-hour rolling limits (Web usage)
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const webQ = query(
      collection(db, `users/${user.uid}/usage_logs`),
      where('timestamp', '>', fiveHoursAgo)
    );

    const unsubWeb = onSnapshot(webQ, (snapshot) => {
      let gUsed = 0;
      let cUsed = 0;
      let oldestGemini: Date | null = null;
      let oldestClaude: Date | null = null;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const ts = data.timestamp.toDate();

        if (data.provider === 'gemini') {
          gUsed += 1;
          if (!oldestGemini || ts < oldestGemini) oldestGemini = ts;
        } else if (data.provider === 'claude') {
          cUsed += 1;
          if (!oldestClaude || ts < oldestClaude) oldestClaude = ts;
        }
      });

      setGeminiUsed(gUsed);
      setClaudeUsed(cUsed);
      setGeminiRecovery(oldestGemini ? new Date((oldestGemini as Date).getTime() + 5 * 60 * 60 * 1000) : null);
      setClaudeRecovery(oldestClaude ? new Date((oldestClaude as Date).getTime() + 5 * 60 * 60 * 1000) : null);
    });

    // Listen to Monthly API usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const apiQ = query(
      collection(db, `users/${user.uid}/api_usage_logs`),
      where('timestamp', '>', startOfMonth)
    );

    const unsubApi = onSnapshot(apiQ, (snapshot) => {
      const stats = {
        gemini: { prompt: 0, completion: 0, cost: 0 },
        claude: { prompt: 0, completion: 0, cost: 0 },
      };

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const provider = data.provider as 'gemini' | 'claude';
        const pTokens = data.prompt_tokens || 0;
        const cTokens = data.completion_tokens || 0;

        if (stats[provider]) {
          stats[provider].prompt += pTokens;
          stats[provider].completion += cTokens;
        }
      });

      // Calculate costs
      stats.gemini.cost = (stats.gemini.prompt / 1000000) * PRICING.gemini.input + (stats.gemini.completion / 1000000) * PRICING.gemini.output;
      stats.claude.cost = (stats.claude.prompt / 1000000) * PRICING.claude.input + (stats.claude.completion / 1000000) * PRICING.claude.output;

      setApiStats(stats);
    });

    return () => {
      unsubWeb();
      unsubApi();
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
      <header className="flex justify-between items-center mb-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          AI 利用状況ダッシュボード
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400 hidden sm:inline">{user.email}</span>
          <button 
            onClick={() => auth.signOut()}
            className="text-sm px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Monthly API Volume Section */}
      <section className="max-w-4xl mx-auto mb-12">
        <h2 className="text-xl font-semibold mb-6 text-gray-200">ターミナル / IDE 利用量（月間累計）</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Gemini API Card */}
          <div className="bg-gradient-to-br from-blue-900/40 to-black p-6 rounded-2xl border border-blue-500/20 relative overflow-hidden group hover:border-blue-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg className="w-24 h-24 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <h3 className="text-lg font-medium text-blue-400 mb-2">Gemini (Antigravity IDE等)</h3>
            <div className="text-4xl font-bold text-white mb-2">
              {((apiStats.gemini.prompt + apiStats.gemini.completion) / 1000).toFixed(1)}k <span className="text-lg text-gray-400 font-normal">Tokens</span>
            </div>
            <div className="space-y-2 text-sm text-gray-300 mt-6">
              <div className="flex justify-between">
                <span>入力トークン:</span>
                <span className="font-mono">{apiStats.gemini.prompt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>出力トークン:</span>
                <span className="font-mono">{apiStats.gemini.completion.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Claude API Card */}
          <div className="bg-gradient-to-br from-orange-900/40 to-black p-6 rounded-2xl border border-orange-500/20 relative overflow-hidden group hover:border-orange-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <svg className="w-24 h-24 text-orange-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3 className="text-lg font-medium text-orange-400 mb-2">Claude (Claude Code等)</h3>
            <div className="text-4xl font-bold text-white mb-2">
              {((apiStats.claude.prompt + apiStats.claude.completion) / 1000).toFixed(1)}k <span className="text-lg text-gray-400 font-normal">Tokens</span>
            </div>
            <div className="space-y-2 text-sm text-gray-300 mt-6">
              <div className="flex justify-between">
                <span>入力トークン:</span>
                <span className="font-mono">{apiStats.claude.prompt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>出力トークン:</span>
                <span className="font-mono">{apiStats.claude.completion.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Web UI 5-Hour Limits Section */}
      <section className="max-w-4xl mx-auto mb-12">
        <h2 className="text-xl font-semibold mb-6 text-gray-200">Web UI（5時間制限枠）</h2>
        <div className="flex flex-col md:flex-row gap-8 justify-center">
          <div className="flex-1 flex flex-col items-center">
            <ProgressBar provider="Gemini" used={geminiUsed} max={geminiMax} />
            <Countdown targetDate={geminiRecovery} />
          </div>
          <div className="flex-1 flex flex-col items-center">
            <ProgressBar provider="Claude" used={claudeUsed} max={claudeMax} />
            <Countdown targetDate={claudeRecovery} />
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto bg-white/5 p-6 rounded-2xl border border-white/10 mb-8">
        <h2 className="text-xl font-semibold mb-2 text-gray-200">あなたの設定用 UID</h2>
        <p className="text-sm text-gray-400 mb-4">
          以下のUIDを、拡張機能の <code>config.js</code> やプロキシの <code>.env</code> にコピペして設定してください。
        </p>
        <div className="flex items-center gap-4 bg-black/50 p-3 rounded-lg border border-gray-700">
          <code className="text-emerald-400 font-mono text-sm flex-1">{user.uid}</code>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(user.uid);
              alert('UIDをコピーしました');
            }}
            className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors"
          >
            コピー
          </button>
        </div>
      </section>

      <section className="max-w-4xl mx-auto bg-white/5 p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">設定</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Discord Webhook URL</label>
            <input 
              type="text" 
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Gemini 上限 (5時間)</label>
              <input 
                type="number" 
                value={geminiMax}
                onChange={(e) => setGeminiMax(Number(e.target.value))}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Claude 上限 (5時間)</label>
              <input 
                type="number" 
                value={claudeMax}
                onChange={(e) => setClaudeMax(Number(e.target.value))}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button 
            onClick={saveConfig}
            disabled={isSaving}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg self-start transition-colors disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '設定を保存'}
          </button>
        </div>
      </section>
    </div>
  );
}
