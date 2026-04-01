(function () {
  const AUTH_KEY = "galactic_tours_auth";
  const USER_LOGIN_KEY = "galactic_tours_login";
  const USER_NAME_KEY = "galactic_tours_user_name";
  const USER_ROLE_KEY = "galactic_tours_role";
  const API_BASE_STORAGE_KEY = "galactic_tours_api_base";

  if (window.__galacticNotificationsInitialized) return;
  window.__galacticNotificationsInitialized = true;

  function getApiBase() {
    const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (!stored) {
      return "https://galactic-tours-demo-backend-production.up.railway.app";
    }
    return stored.replace(/\/+$/, "");
  }

  const API_BASE = getApiBase();

  function buildApiUrl(path) {
    if (!path.startsWith("/")) {
      return `${API_BASE}/${path}`;
    }
    return `${API_BASE}${path}`;
  }

  function isAuthorized() {
    return localStorage.getItem(AUTH_KEY) === "true";
  }

  function getCurrentLogin() {
    return localStorage.getItem(USER_LOGIN_KEY) || "";
  }

  function getCurrentName() {
    return localStorage.getItem(USER_NAME_KEY) || getCurrentLogin() || "Сотрудник";
  }

  function getCurrentRole() {
    return localStorage.getItem(USER_ROLE_KEY) || "employee";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatBadgeCount(count) {
    if (count > 99) return "99+";
    return String(count);
  }

  function formatDateTime(value) {
    if (!value) return "";
    return String(value).replace("T", " ");
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
    }

    return data;
  }

  const state = {
    items: [],
    unreadCount: 0,
    isOpen: false,
    isLoading: false
  };

  let root = null;
  let bellButton = null;
  let badge = null;
  let overlay = null;
  let panel = null;
  let list = null;
  let unreadLabel = null;
  let emptyState = null;
  let loadingState = null;
  let notice = null;
  let readAllBtn = null;

  function ensureStyles() {
    if (document.getElementById("galactic-notifications-styles")) return;

    const style = document.createElement("style");
    style.id = "galactic-notifications-styles";
    style.textContent = `
      .gt-notify-bell {
        position: relative;
        border-radius: 999px;
        font-size: 14px;
        cursor: pointer;
        transition: 0.18s ease;
        font-family: inherit;
        border: 1px solid rgba(180, 204, 232, 0.12);
        background: rgba(255,255,255,0.03);
        color: #f4f7fb;
        padding: 12px 16px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .gt-notify-bell:hover {
        background: rgba(255,255,255,0.06);
      }

      .gt-notify-bell-badge {
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        border-radius: 999px;
        background: #edf5fc;
        color: #10243d;
        font-size: 12px;
        font-weight: 700;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .gt-notify-bell-badge.show {
        display: inline-flex;
      }

      .gt-notify-overlay {
        position: fixed;
        inset: 0;
        background: rgba(4, 10, 18, 0.54);
        backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition: 0.22s ease;
        z-index: 2000;
      }

      .gt-notify-overlay.show {
        opacity: 1;
        pointer-events: auto;
      }

      .gt-notify-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: min(520px, 100vw);
        height: 100vh;
        background: linear-gradient(180deg, rgba(14,26,43,0.98), rgba(11,22,38,0.98));
        border-left: 1px solid rgba(180, 204, 232, 0.12);
        box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
        transform: translateX(100%);
        transition: transform 0.24s ease;
        z-index: 2001;
        display: grid;
        grid-template-rows: auto auto 1fr;
      }

      .gt-notify-panel.show {
        transform: translateX(0);
      }

      .gt-notify-head {
        padding: 22px 22px 16px;
        border-bottom: 1px solid rgba(180, 204, 232, 0.08);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .gt-notify-head-copy {
        display: grid;
        gap: 6px;
      }

      .gt-notify-kicker {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #a9b8cd;
      }

      .gt-notify-title {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        color: #f4f7fb;
      }

      .gt-notify-sub {
        color: #a9b8cd;
        font-size: 14px;
        line-height: 1.7;
      }

      .gt-notify-close {
        border-radius: 999px;
        border: 1px solid rgba(180, 204, 232, 0.12);
        background: rgba(255,255,255,0.03);
        color: #f4f7fb;
        padding: 10px 14px;
        cursor: pointer;
      }

      .gt-notify-toolbar {
        padding: 14px 22px;
        border-bottom: 1px solid rgba(180, 204, 232, 0.08);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      .gt-notify-unread {
        color: #a9b8cd;
        font-size: 14px;
      }

      .gt-notify-btn {
        border-radius: 999px;
        font-size: 14px;
        cursor: pointer;
        transition: 0.18s ease;
        font-family: inherit;
        border: 1px solid rgba(180, 204, 232, 0.12);
        background: rgba(255,255,255,0.03);
        color: #f4f7fb;
        padding: 10px 14px;
      }

      .gt-notify-btn:hover {
        background: rgba(255,255,255,0.06);
      }

      .gt-notify-body {
        overflow-y: auto;
        padding: 18px 22px 22px;
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .gt-notify-item {
        padding: 16px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.03);
        display: grid;
        gap: 12px;
      }

      .gt-notify-item.unread {
        background: rgba(255,255,255,0.055);
        border-color: rgba(223, 234, 247, 0.12);
      }

      .gt-notify-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }

      .gt-notify-type {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        font-size: 12px;
        color: #a9b8cd;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
      }

      .gt-notify-time {
        font-size: 12px;
        color: #a9b8cd;
        text-align: right;
      }

      .gt-notify-item-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.45;
        color: #f4f7fb;
      }

      .gt-notify-item-message {
        color: #a9b8cd;
        font-size: 14px;
        line-height: 1.75;
      }

      .gt-notify-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .gt-notify-empty,
      .gt-notify-loading,
      .gt-notify-notice {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.03);
        color: #a9b8cd;
        font-size: 14px;
        line-height: 1.7;
      }

      .gt-notify-notice.error {
        color: #ffd9d9;
        background: rgba(239, 176, 176, 0.08);
        border-color: rgba(239, 176, 176, 0.16);
      }

      @media (max-width: 640px) {
        .gt-notify-panel {
          width: 100vw;
        }

        .gt-notify-head,
        .gt-notify-toolbar,
        .gt-notify-body {
          padding-left: 16px;
          padding-right: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getTypeLabel(type) {
    if (type === "news") return "📰 Новость";
    if (type === "onboarding") return "🚀 Адаптация";
    return "🔔 Система";
  }

  function renderBadge() {
    if (!badge) return;
    const count = state.unreadCount || 0;
    badge.textContent = formatBadgeCount(count);
    badge.classList.toggle("show", count > 0);
  }

  function renderToolbar() {
    if (!unreadLabel || !readAllBtn) return;
    unreadLabel.textContent = state.unreadCount > 0
      ? `Непрочитанных: ${state.unreadCount > 99 ? "99+" : state.unreadCount}`
      : "Все уведомления прочитаны";

    readAllBtn.disabled = state.unreadCount === 0;
    readAllBtn.style.opacity = state.unreadCount === 0 ? "0.55" : "1";
    readAllBtn.style.cursor = state.unreadCount === 0 ? "default" : "pointer";
  }

  function renderList() {
    if (!list || !emptyState || !loadingState || !notice) return;

    loadingState.style.display = state.isLoading ? "block" : "none";
    emptyState.style.display = !state.isLoading && state.items.length === 0 ? "block" : "none";

    const existingItems = list.querySelectorAll(".gt-notify-item");
    existingItems.forEach(node => node.remove());

    if (state.isLoading || !state.items.length) return;

    state.items.forEach(item => {
      const card = document.createElement("div");
      card.className = `gt-notify-item ${item.is_read ? "" : "unread"}`;

      const openButton = item.link
        ? `<button class="gt-notify-btn" data-open-link="${escapeHtml(item.link)}">Открыть</button>`
        : "";

      const readButton = item.is_read
        ? ""
        : `<button class="gt-notify-btn" data-read-id="${item.id}">Отметить прочитанным</button>`;

      card.innerHTML = `
        <div class="gt-notify-top">
          <div class="gt-notify-type">${getTypeLabel(item.type)}</div>
          <div class="gt-notify-time">${escapeHtml(formatDateTime(item.created_at))}</div>
        </div>

        <div class="gt-notify-item-title">${escapeHtml(item.title)}</div>
        <div class="gt-notify-item-message">${escapeHtml(item.message || "")}</div>

        <div class="gt-notify-actions">
          ${openButton}
          ${readButton}
        </div>
      `;

      list.appendChild(card);
    });
  }

  function renderAll() {
    renderBadge();
    renderToolbar();
    renderList();
  }

  function setNotice(message, isError = false) {
    if (!notice) return;
    if (!message) {
      notice.style.display = "none";
      notice.textContent = "";
      notice.className = "gt-notify-notice";
      return;
    }

    notice.style.display = "block";
    notice.textContent = message;
    notice.className = `gt-notify-notice ${isError ? "error" : ""}`.trim();
  }

  function openPanel() {
    state.isOpen = true;
    if (overlay) overlay.classList.add("show");
    if (panel) panel.classList.add("show");
    loadNotifications();
  }

  function closePanel() {
    state.isOpen = false;
    if (overlay) overlay.classList.remove("show");
    if (panel) panel.classList.remove("show");
  }

  async function loadUnreadCount() {
    const login = getCurrentLogin();
    if (!login) return;

    try {
      const data = await fetchJson(
        buildApiUrl(`/api/notifications/unread-count?user_login=${encodeURIComponent(login)}`)
      );
      state.unreadCount = Number(data?.unread_count || 0);
      renderBadge();
      renderToolbar();
    } catch (error) {
      console.error(error);
    }
  }

  async function loadNotifications() {
    const login = getCurrentLogin();
    if (!login) return;

    state.isLoading = true;
    setNotice("");
    renderAll();

    try {
      const data = await fetchJson(buildApiUrl("/api/notifications"), {
        method: "POST",
        body: JSON.stringify({
          user_login: login,
          limit: 50
        })
      });

      state.items = Array.isArray(data?.items) ? data.items : [];
      state.unreadCount = state.items.filter(item => !item.is_read).length;
      state.isLoading = false;
      renderAll();
    } catch (error) {
      console.error(error);
      state.items = [];
      state.isLoading = false;
      setNotice(error.message || "Не удалось загрузить уведомления.", true);
      renderAll();
    }
  }

  async function markOneAsRead(id) {
    const login = getCurrentLogin();
    if (!login) return;

    try {
      const data = await fetchJson(buildApiUrl(`/api/notifications/${id}/read`), {
        method: "POST",
        body: JSON.stringify({
          user_login: login
        })
      });

      state.items = state.items.map(item => {
        if (item.id === id) {
          return {
            ...item,
            is_read: true
          };
        }
        return item;
      });

      state.unreadCount = Number(data?.unread_count || 0);
      renderAll();
    } catch (error) {
      console.error(error);
      setNotice(error.message || "Не удалось отметить уведомление прочитанным.", true);
    }
  }

  async function markAllAsRead() {
    const login = getCurrentLogin();
    if (!login || state.unreadCount === 0) return;

    try {
      const data = await fetchJson(buildApiUrl("/api/notifications/read-all"), {
        method: "POST",
        body: JSON.stringify({
          user_login: login
        })
      });

      state.items = state.items.map(item => ({
        ...item,
        is_read: true
      }));

      state.unreadCount = Number(data?.unread_count || 0);
      renderAll();
    } catch (error) {
      console.error(error);
      setNotice(error.message || "Не удалось отметить все уведомления прочитанными.", true);
    }
  }

  function openNotificationLink(link) {
    if (!link) return;
    window.location.href = link;
  }

  function bindListActions() {
    if (!list) return;

    list.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const readId = target.getAttribute("data-read-id");
      if (readId) {
        markOneAsRead(Number(readId));
        return;
      }

      const link = target.getAttribute("data-open-link");
      if (link) {
        openNotificationLink(link);
      }
    });
  }

  function createUi() {
    ensureStyles();

    const topbarRight = document.querySelector(".topbar-right");
    if (!topbarRight) return false;

    root = document.createElement("div");

    bellButton = document.createElement("button");
    bellButton.className = "gt-notify-bell";
    bellButton.type = "button";
    bellButton.innerHTML = `
      <span>🔔</span>
      <span>Уведомления</span>
      <span class="gt-notify-bell-badge"></span>
    `;
    badge = bellButton.querySelector(".gt-notify-bell-badge");

    overlay = document.createElement("div");
    overlay.className = "gt-notify-overlay";

    panel = document.createElement("aside");
    panel.className = "gt-notify-panel";
    panel.innerHTML = `
      <div class="gt-notify-head">
        <div class="gt-notify-head-copy">
          <div class="gt-notify-kicker">Workspace · Notifications</div>
          <h3 class="gt-notify-title">Уведомления</h3>
          <div class="gt-notify-sub">Новые новости, системные события и важные изменения внутри платформы.</div>
        </div>
        <button class="gt-notify-close" type="button">Закрыть</button>
      </div>

      <div class="gt-notify-toolbar">
        <div class="gt-notify-unread">Непрочитанных: 0</div>
        <button class="gt-notify-btn" type="button">Прочитать все</button>
      </div>

      <div class="gt-notify-body">
        <div class="gt-notify-notice" style="display:none;"></div>
        <div class="gt-notify-loading">Загружаем уведомления...</div>
        <div class="gt-notify-empty" style="display:none;">У вас пока нет уведомлений.</div>
        <div class="gt-notify-list"></div>
      </div>
    `;

    unreadLabel = panel.querySelector(".gt-notify-unread");
    readAllBtn = panel.querySelector(".gt-notify-btn");
    list = panel.querySelector(".gt-notify-list");
    emptyState = panel.querySelector(".gt-notify-empty");
    loadingState = panel.querySelector(".gt-notify-loading");
    notice = panel.querySelector(".gt-notify-notice");

    topbarRight.insertBefore(bellButton, topbarRight.firstChild);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    bellButton.addEventListener("click", function () {
      if (state.isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    });

    overlay.addEventListener("click", closePanel);

    panel.querySelector(".gt-notify-close").addEventListener("click", closePanel);
    readAllBtn.addEventListener("click", markAllAsRead);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.isOpen) {
        closePanel();
      }
    });

    bindListActions();
    renderAll();
    return true;
  }

  function bootstrap() {
    if (!isAuthorized()) return;
    const ok = createUi();
    if (!ok) return;

    loadUnreadCount();
    setInterval(loadUnreadCount, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
