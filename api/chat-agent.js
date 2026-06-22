<!-- ============================================================
     LINCHPIN AI LIVE CHAT WIDGET
     Paste this block right before </body> in index.html,
     replacing the floating "Contact Us" button block.
============================================================ -->

<style>
  #lp-chat-bubble {
    position: fixed; bottom: 24px; right: 24px; z-index: 1000;
    background: #059669; color: #fff; width: 60px; height: 60px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4); cursor: pointer; transition: transform 0.2s;
    border: none; font-size: 24px;
  }
  #lp-chat-bubble:hover { transform: scale(1.08); }

  #lp-chat-window {
    position: fixed; bottom: 96px; right: 24px; z-index: 1000;
    width: 360px; max-width: 92vw; height: 520px; max-height: 75vh;
    background: #0a0a0a; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px; display: none; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }
  #lp-chat-window.open { display: flex; }

  #lp-chat-header {
    background: #111; padding: 14px 16px; display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  #lp-chat-header .dot { width:32px;height:32px;border-radius:50%;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;color:#34d399; }
  #lp-chat-header .info p { margin:0; }
  #lp-chat-header .title { font-size:14px; font-weight:600; color:#fff; }
  #lp-chat-header .status { font-size:11px; color:#a1a1aa; display:flex; align-items:center; gap:4px; }
  #lp-chat-header .status .led { width:6px;height:6px;border-radius:50%;background:#34d399; }
  #lp-chat-close { margin-left:auto; background:none; border:none; color:#a1a1aa; font-size:18px; cursor:pointer; }

  #lp-chat-msgs { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; font-size:14px; }
  .lp-bubble { max-width:80%; padding:9px 13px; border-radius:14px; line-height:1.5; white-space:pre-wrap; }
  .lp-bubble.bot { align-self:flex-start; background:rgba(255,255,255,0.07); color:#e4e4e7; }
  .lp-bubble.user { align-self:flex-end; background:#059669; color:#fff; }
  .lp-typing { align-self:flex-start; background:rgba(255,255,255,0.07); padding:9px 13px; border-radius:14px; color:#71717a; font-size:13px; }

  #lp-chat-inputrow { display:flex; gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.08); }
  #lp-chat-input { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:12px; padding:10px 14px; font-size:14px; outline:none; }
  #lp-chat-input:focus { border-color:#10b981; }
  #lp-chat-send { background:#059669; border:none; color:#fff; width:40px; height:40px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  #lp-chat-send:hover { background:#10b981; }
</style>

<button id="lp-chat-bubble" aria-label="Open live chat">
  <i class="fa-solid fa-comments"></i>
</button>

<div id="lp-chat-window">
  <div id="lp-chat-header">
    <div class="dot"><i class="fa-solid fa-shield-halved"></i></div>
    <div class="info">
      <p class="title">Linchpin Assistant</p>
      <p class="status"><span class="led"></span> Online</p>
    </div>
    <button id="lp-chat-close" aria-label="Close chat">✕</button>
  </div>
  <div id="lp-chat-msgs"></div>
  <div id="lp-chat-inputrow">
    <input id="lp-chat-input" type="text" placeholder="Type a message..." autocomplete="off">
    <button id="lp-chat-send" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
  </div>
</div>

<script>
(function () {
  const bubble   = document.getElementById('lp-chat-bubble');
  const win      = document.getElementById('lp-chat-window');
  const closeBtn = document.getElementById('lp-chat-close');
  const msgsEl   = document.getElementById('lp-chat-msgs');
  const input    = document.getElementById('lp-chat-input');
  const sendBtn  = document.getElementById('lp-chat-send');

  let history = []; // [{role:'user'|'assistant', content:'...'}]
  let conversationDone = false;
  let opened = false;

  function addBubble(role, text) {
    const div = document.createElement('div');
    div.className = 'lp-bubble ' + (role === 'user' ? 'user' : 'bot');
    div.textContent = text;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function setTyping(show) {
    let el = document.getElementById('lp-typing');
    if (show) {
      if (el) return;
      el = document.createElement('div');
      el.id = 'lp-typing';
      el.className = 'lp-typing';
      el.textContent = '...';
      msgsEl.appendChild(el);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } else if (el) {
      el.remove();
    }
  }

  async function sendToAgent() {
    setTyping(true);
    try {
      const res = await fetch('/api/chat-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      setTyping(false);

      if (data.error) {
        addBubble('assistant', "Sorry, I'm having trouble connecting right now. Please use the Contact page instead.");
        return;
      }

      addBubble('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });

      if (data.collected && data.collected.complete) {
        conversationDone = true;
        input.disabled = true;
        sendBtn.disabled = true;
        input.placeholder = 'Conversation complete';
      }
    } catch (err) {
      setTyping(false);
      addBubble('assistant', "Sorry, something went wrong. Please try the Contact page.");
    }
  }

  function handleSend() {
    const text = input.value.trim();
    if (!text || conversationDone) return;
    addBubble('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    sendToAgent();
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });

  bubble.addEventListener('click', () => {
    win.classList.toggle('open');
    if (!opened) {
      opened = true;
      // Kick off the conversation with an opening assistant message
      sendToAgentInitial();
    }
  });
  closeBtn.addEventListener('click', () => win.classList.remove('open'));

  async function sendToAgentInitial() {
    setTyping(true);
    try {
      const res = await fetch('/api/chat-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      });
      const data = await res.json();
      setTyping(false);
      addBubble('assistant', data.reply || "Hi! I'm the Linchpin Assistant. What brings you here today?");
      history.push({ role: 'user', content: 'Hello' });
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      setTyping(false);
      addBubble('assistant', "Hi! I'm the Linchpin Assistant. What brings you here today?");
    }
  }
})();
</script>
