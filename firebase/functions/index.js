const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();
const db = admin.firestore();

// 5時間のミリ秒
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

// 定期実行 (毎分) して、ちょうど全回復したユーザーを検知
exports.checkTokenLimitsAndNotify = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - FIVE_HOURS_MS);
    // 1分前のバッファを持たせる (前回実行時から今回実行時の間に5時間が経過したか)
    const fiveHoursAndOneMinuteAgo = new Date(fiveHoursAgo.getTime() - 60000);

    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();

    for (const userDoc of usersSnapshot.docs) {
        const uid = userDoc.id;
        const configSnapshot = await db.collection('users').doc(uid).collection('config').doc('settings').get();
        if (!configSnapshot.exists) continue;
        
        const config = configSnapshot.data();
        const discordWebhookUrl = config.discord_webhook_url;
        
        if (!discordWebhookUrl) continue;

        // GeminiとClaudeごとにチェック
        for (const provider of ['gemini', 'claude']) {
            // 直近5時間以内のログをチェック
            const recentLogs = await db.collection('users').doc(uid).collection('usage_logs')
                .where('provider', '==', provider)
                .where('timestamp', '>', fiveHoursAgo)
                .limit(1)
                .get();
                
            if (!recentLogs.empty) {
                // まだ5時間以内に利用ログがあるため回復していない
                continue;
            }
            
            // 直近5時間にはないが、5時間〜5時間1分前の間（ちょうど今全回復した）にログがあるかチェック
            const recoveringLogs = await db.collection('users').doc(uid).collection('usage_logs')
                .where('provider', '==', provider)
                .where('timestamp', '<=', fiveHoursAgo)
                .where('timestamp', '>', fiveHoursAndOneMinuteAgo)
                .limit(1)
                .get();
                
            if (!recoveringLogs.empty) {
                // ちょうど全回復した瞬間
                await sendDiscordNotification(discordWebhookUrl, provider);
            }
        }
    }
});

async function sendDiscordNotification(webhookUrl, provider) {
    const providerName = provider === 'gemini' ? 'Gemini Advanced' : 'Claude Pro';
    try {
        await axios.post(webhookUrl, {
            content: `【全回復】${providerName} の制限枠が完全にリセット（消費0）されました！`
        });
        console.log(`Notification sent for ${providerName}`);
    } catch (error) {
        console.error('Failed to send Discord notification', error);
    }
}
