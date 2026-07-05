// Minimal content script to detect prompt submission clicks
document.addEventListener('click', (event) => {
  const target = event.target;
  
  // Logic to detect if a "Send" button was clicked
  // Note: Actual selectors will depend on the current DOM structure of claude.ai and gemini.google.com
  const isClaudeSend = window.location.hostname.includes('claude.ai') && 
                       (target.closest('button[aria-label="Send Message"]') || target.closest('button[data-testid="send-button"]'));
                       
  const isGeminiSend = window.location.hostname.includes('gemini.google.com') && 
                       (target.closest('button[aria-label="Send message"]') || target.closest('.send-button'));

  if (isClaudeSend) {
    chrome.runtime.sendMessage({ type: "PROMPT_SENT", provider: "claude" });
  } else if (isGeminiSend) {
    chrome.runtime.sendMessage({ type: "PROMPT_SENT", provider: "gemini" });
  }
});

// Also detect Enter key on textareas
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    const target = event.target;
    if (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true' || target.closest('div[contenteditable="true"]')) {
        if (window.location.hostname.includes('claude.ai')) {
            chrome.runtime.sendMessage({ type: "PROMPT_SENT", provider: "claude" });
        } else if (window.location.hostname.includes('gemini.google.com')) {
            chrome.runtime.sendMessage({ type: "PROMPT_SENT", provider: "gemini" });
        }
    }
  }
});
