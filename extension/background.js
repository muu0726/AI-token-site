importScripts('config.js');

// Background script to handle Firebase logging

async function logUsageToFirebase(provider, uid) {
  // Use Firebase REST API for simplicity in Chrome Extension Background Worker
  const projectId = CONFIG.FIREBASE_PROJECT_ID; 

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/usage_logs`;
  
  const payload = {
    fields: {
      provider: { stringValue: provider },
      source: { stringValue: "browser" },
      tokens_used: { integerValue: 1 },
      timestamp: { timestampValue: new Date().toISOString() }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // "Authorization": `Bearer ${userToken}` // Requires valid auth token
      },
      body: JSON.stringify(payload)
    });
    console.log("Logged usage for", provider, await response.json());
  } catch (error) {
    console.error("Failed to log usage", error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROMPT_SENT") {
    // In actual implementation, retrieve the configured UID from chrome.storage.local
    chrome.storage.local.get(['uid'], (result) => {
      const uid = result.uid || CONFIG.USER_UID; // Use configured UID
      if (uid) {
        logUsageToFirebase(message.provider, uid);
      } else {
        console.warn("User not logged in to AI Token Tracker");
      }
    });
  }
});
