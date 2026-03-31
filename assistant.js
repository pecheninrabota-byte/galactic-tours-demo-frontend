const API_BASE = "https://galactic-tours-demo-backend-production.up.railway.app/api";
const MESSAGE_API_URL = `${API_BASE}/message`;

const AUTH_KEY = "galactic_tours_auth";
const USER_LOGIN_KEY = "galactic_tours_login";
const SESSION_KEY = "galactic_tours_session_id";
const USER_NAME_KEY = "galactic_tours_user_name";

const SESSION_ID = localStorage.getItem(SESSION_KEY) || `demo_${Date.now()}`;
localStorage.setItem(SESSION_KEY, SESSION_ID);

let assistantBotStarted = false;

function getStoredUserName() {
  return localStorage.getItem(USER_NAME_KEY) || "";
}

function setStoredUserName(name) {
  if (name && name.trim()) {
    localStorage.setItem(USER_NAME_KEY, name.trim());
  }
}

function ensureAssistantRoot() {
  if (document.getElementById("assistantLauncher")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <style>
      .assistant-launcher {
        position: fixed;
        right: 24px;
        bottom: 24px;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 1px solid rgba(180, 204, 232, 0.18);
        background: linear-gradient(180deg, rgba(20,35,57,0.96), rgba(15,27,44,0.96));
        color: #f4f7fb;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
        cursor: pointer;
        font-size: 26px;
        z-index: 9999;
      }

      .assistant-overlay {
        position: fixed;
        right: 24px;
        bottom: 100px;
        width: min(420px, calc(100vw - 32px));
        height: min(680px, calc(100vh - 140px));
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(14,26,43,0.98), rgba(11,22,38,0.98));
        border: 1px solid rgba(180, 204, 232, 0.12);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.32);
        overflow: hidden;
        display: none;
        z-index: 9998;
      }

      .assistant-overlay.open {
        display: flex;
        flex-direction: column;
      }

      .assistant-overlay-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .assistant-overlay-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .assistant-overlay-avatar {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03));
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 20px;
      }

      .assistant-overlay-name {
        font-size: 16px;
        font-weight: 700;
        color: #f4f7fb;
      }

      .assistant-overlay-sub {
        font-size: 13px;
        color: #a9b8cd;
        margin-top: 3px;
      }

      .assistant-overlay-close {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: #f4f7fb;
        cursor: pointer;
        font-size: 18px;
      }

      .assistant-overlay-chat {
        flex: 1;
        overflow-y: auto;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
      }

      .assistant-overlay-chat::-webkit-scrollbar {
        width: 8px;
      }

      .assistant-overlay-chat::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 999px;
      }

      .assistant-message {
        max-width: 82%;
        padding: 14px 16px;
        border-radius: 18px;
        line-height: 1.6;
        white-space: pre-line;
        font-size: 15px;
        color: #f4f7fb;
      }

      .assistant-message.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #6f93c8, #5a7eb7);
        color: #f9fcff;
        border-bottom-right-radius: 8px;
      }

      .assistant-message.bot {
        align-self: flex-start;
        background: rgba(35, 51, 80, 0.95);
        border: 1px solid rgba(255,255,255,0.05);
        border-bottom-left-radius: 8px;
      }

      .assistant-message.system {
        align-self: flex-start;
        background: rgba(77, 53, 53, 0.78);
        border: 1px solid rgba(255,255,255,0.05);
      }

      .assistant-overlay-replies {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 0 18px 14px;
      }

      .assistant-reply-btn {
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(145, 177, 220, 0.24);
        color: #f4f7fb;
        cursor: pointer;
        font-size: 14px;
      }

      .assistant-overlay-input {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        padding: 0 18px 18px;
      }

      .assistant-input {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        color: #f4f7fb;
        border-radius: 18px;
        padding: 15px 16px;
        outline: none;
        font-size: 15px;
      }

      .assistant-send {
        border: none;
        border-radius: 18px;
        padding: 15px 18px;
        min-width: 110px;
        cursor: pointer;
        background: #edf5fc;
        color: #10243d;
        font-weight: 700;
        font-size: 14px;
      }

      @media (max-width: 640px) {
        .assistant-launcher {
          right: 16px;
          bottom: 16px;
        }

        .assistant-overlay {
          right: 16px;
          bottom: 88px;
          width: calc(100vw - 32px);
          height: calc(100vh - 120px);
        }

        .assistant-overlay-input {
          grid-template-columns: 1fr;
        }

        .assistant-send {
          width: 100%;
        }
      }
    </style>

    <button id="assistantLauncher" class="assistant-launcher" type="button">💬</button>

    <div id="assistantOverlay" class="assistant-overlay">
      <div class="assistant-overlay-top">
        <div class="assistant-overlay-left">
          <div class="assistant-overlay-avatar">🤖</div>
          <div>
            <div class="assistant-overlay-name">Добрыня</div>
            <div class="assistant-overlay-sub">Galactic Tours HR Assistant</div>
          </div>
        </div>
        <button id="assistantClose" class="assistant-overlay-close" type="button">×</button>
      </div>

      <div id="assistantChat" class="assistant-overlay-chat"></div>
      <div id="assistantReplies" class="assistant-overlay-replies"></div>

      <div class="assistant-overlay-input">
        <input id="assistantInput" class="assistant-input" placeholder="Напиши вопрос..." />
        <button id="assistantSend" class="assistant-send" type="button">Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById("assistantLauncher").addEventListener("click", openAssistant);
  document.getElementById("assistantClose").addEventListener("click", closeAssistant);
  document.getElementById("assistantSend").addEventListener("click", sendAssistantMessage);
  document.getElementById("assistantInput").addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      sendAssistantMessage();
    }
  });
}

function openAssistant() {
  document.getElementById("assistantOverlay").classList.add("open");
  startAssistantBot();
}

function closeAssistant() {
  document.getElementById("assistantOverlay").classList.remove("open");
}

function addAssistantMessage(text, type) {
  const chat = document.getElementById("assistantChat");
  const msg = document.createElement("div");
  msg.className = `assistant-message ${type}`;
  msg.innerText = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function clearAssistantReplies() {
  document.getElementById("assistantReplies").innerHTML = "";
}

function renderAssistantReplies(replies) {
  clearAssistantReplies();

  if (!replies || !Array.isArray(replies) || !replies.length) return;

  const container = document.getElementById("assistantReplies");
  replies.forEach(reply => {
    const btn = document.createElement("button");
    btn.className = "assistant-reply-btn";
    btn.type = "button";
    btn.innerText = reply;
    btn.addEventListener("click", function() {
      callAssistant(reply, true);
    });
    container.appendChild(btn);
  });
}

async function callAssistant(text, showUserMessage = true) {
  if (showUserMessage) {
    addAssistantMessage(text, "user");
  }

  clearAssistantReplies();

  try {
    const res = await fetch(MESSAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: SESSION_ID,
        text: text
      })
    });

    if (!res.ok) {
      addAssistantMessage("Ошибка сервера: " + res.status, "system");
      return;
    }

    const data = await res.json();

    if (!data.reply) {
      addAssistantMessage("Ответ пустой", "system");
      return;
    }

    const waitNameState = data.state === "wait_name";
    const savedName = getStoredUserName();

    if (!waitNameState && showUserMessage && !savedName && text !== "__start__") {
      setStoredUserName(text);
    }

    addAssistantMessage(data.reply, "bot");
    renderAssistantReplies(data.quick_replies);
  } catch (error) {
    addAssistantMessage("Ошибка подключения: " + error.message, "system");
    console.error(error);
  }
}

async function startAssistantBot() {
  if (assistantBotStarted) return;
  assistantBotStarted = true;
  await callAssistant("__start__", false);
}

async function sendAssistantMessage() {
  const input = document.getElementById("assistantInput");
  const text = input.value.trim();

  if (!text) return;

  await callAssistant(text, true);
  input.value = "";
  input.focus();
}

window.addEventListener("load", function() {
  ensureAssistantRoot();
});
window.openAssistant = openAssistant;
window.closeAssistant = closeAssistant;
window.callAssistant = callAssistant;
window.addAssistantMessage = addAssistantMessage;
