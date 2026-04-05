const main = document.getElementById("thread-list");
const searchInput = document.getElementById("thread-search");
const viewAllButton = document.getElementById("view-all");
const viewBookmarksButton = document.getElementById("view-bookmarks");

const NAV_STORAGE_PREFIX = "cng_nav_v1:";
const NAV_META_KEY = "gptgps_thread_meta_v1";

let threads_g = [];
let currentView = "all";
let currentSearch = "";

function storageGet(defaults) {
    return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function storageGetAll() {
    return new Promise((resolve) => chrome.storage.local.get(null, resolve));
}

function storageSet(payload) {
    return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function storageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function normalizeThreads(rawThreads) {
    if (!Array.isArray(rawThreads)) {
        return [];
    }
    return rawThreads.filter(Boolean);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function plainText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    const text = typeof value === "string" ? value : String(value);
    if (typeof htmlToPlainText === "function") {
        return htmlToPlainText(text).trim();
    }
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
    return plainText(value).replace(/\s+/g, " ").trim();
}

function highlightText(value, searchTerm) {
    const safe = escapeHtml(value);
    const term = String(searchTerm || "").trim();
    if (!term) {
        return safe;
    }
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(escapedTerm, "gi"), "<span class=\"highlight\">$&</span>");
}

function sliceString(str, num) {
    const safe = String(str || "");
    if (safe.length > num) {
        return `${safe.slice(0, num)}...`;
    }
    return safe;
}

function getThreadDateValue(thread) {
    const value = Number(thread && thread.create_time);
    return Number.isFinite(value) ? value : 0;
}

function sortThreads(threads) {
    return normalizeThreads(threads).slice().sort((a, b) => getThreadDateValue(b) - getThreadDateValue(a));
}

function countBookmarks(threads) {
    return normalizeThreads(threads).filter((thread) => Boolean(thread.favorite)).length;
}

function formatDate(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return "未知日期";
    }
    return new Date(timestampMs).toLocaleDateString("zh-CN");
}

function formatTime(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return "未知时间";
    }
    return new Date(timestampMs).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getLatestDateLabel(threads) {
    const sorted = sortThreads(threads);
    if (!sorted.length || !getThreadDateValue(sorted[0])) {
        return "尚未记录";
    }
    return new Date(getThreadDateValue(sorted[0]) * 1000).toLocaleDateString("zh-CN");
}

function setStat(name, value) {
    const node = document.querySelector(`[data-stat="${name}"]`);
    if (node) {
        node.textContent = String(value);
    }
}

function getThreadTitle(thread) {
    const fallback = Array.isArray(thread.convo) && thread.convo.length ? thread.convo[0] : "未命名会话";
    const rawTitle = thread.title || fallback;
    return sliceString(rawTitle, 72);
}

function buildSubtitle(thread, searchTerm) {
    const convo = Array.isArray(thread.convo) ? thread.convo : [];
    if (!convo.length) {
        return "还没有可显示的会话内容。";
    }
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        for (let i = 0; i < convo.length; i += 1) {
            const message = String(convo[i] || "");
            if (message.toLowerCase().includes(lower)) {
                return sliceString(message, 160);
            }
        }
    }
    return sliceString(convo[1] || convo[0], 160);
}

function searchThreads(threads, searchTerm) {
    const term = String(searchTerm || "").trim().toLowerCase();
    if (!term) {
        return normalizeThreads(threads);
    }
    return normalizeThreads(threads).filter((thread) => {
        const title = String(thread.title || "").toLowerCase();
        const convo = Array.isArray(thread.convo) ? thread.convo : [];
        return title.includes(term) || convo.some((message) => String(message || "").toLowerCase().includes(term));
    });
}

function getVisibleThreads() {
    let filtered = sortThreads(threads_g);
    if (currentView === "bookmarks") {
        filtered = filtered.filter((thread) => Boolean(thread.favorite));
    }
    if (currentSearch) {
        filtered = searchThreads(filtered, currentSearch);
    }
    return filtered;
}

function updateHeaderSummary(visibleThreads) {
    const listTitle = document.getElementById("list-title");
    const listSummary = document.getElementById("list-summary");

    if (listTitle) {
        listTitle.textContent = currentView === "bookmarks" ? "已收藏线索" : "全部历史线索";
    }

    if (listSummary) {
        if (!threads_g.length) {
            listSummary.textContent = "本地还没有可显示的归档数据。";
            return;
        }

        if (currentView === "bookmarks") {
            listSummary.textContent = currentSearch
                ? `当前展示 ${visibleThreads.length} 条收藏结果。`
                : `当前展示 ${visibleThreads.length} 条已收藏线索。`;
            return;
        }

        listSummary.textContent = currentSearch
            ? `当前搜索命中 ${visibleThreads.length} 条线索。`
            : "按最近更新时间倒序展示本地归档。";
    }
}

function updateStats(visibleThreads) {
    setStat("total", threads_g.length);
    setStat("visible", visibleThreads.length);
    setStat("bookmarked", countBookmarks(threads_g));
    setStat("latest", getLatestDateLabel(threads_g));
}

function createEmptyState() {
    const empty = document.createElement("article");
    empty.className = "empty-state";

    const title = document.createElement("h3");
    title.textContent = currentSearch ? "没有找到匹配结果" : "还没有可显示的历史线索";

    const copy = document.createElement("p");
    copy.className = "empty-copy";
    copy.textContent = currentSearch
        ? "可以换一个关键词，或切换到“全部线索 / 仅看收藏”重新查看。"
        : "当聊天页保存了导航归档后，这里会自动显示可搜索的会话记录。";

    empty.appendChild(title);
    empty.appendChild(copy);
    return empty;
}

function deriveProviderLabel(provider) {
    if (provider === "gemini") {
        return "Gemini";
    }
    if (provider === "qwen") {
        return "Qwen";
    }
    if (provider === "doubao") {
        return "豆包";
    }
    if (provider === "claude") {
        return "Claude";
    }
    return "ChatGPT";
}

function buildNavigatorMessages(snapshot) {
    const promptCatalog = snapshot && snapshot.promptCatalog && typeof snapshot.promptCatalog === "object"
        ? snapshot.promptCatalog
        : {};
    const promptOrder = Array.isArray(snapshot && snapshot.promptOrder) && snapshot.promptOrder.length
        ? snapshot.promptOrder
        : Object.keys(promptCatalog);
    const messages = [];

    promptOrder.forEach((promptId) => {
        const prompt = promptCatalog[promptId];
        if (!prompt) {
            return;
        }

        const userText = normalizeText(prompt.text || "");
        const assistantText = normalizeText(prompt.assistantText || "");

        if (userText) {
            messages.push(userText);
        }
        if (assistantText) {
            messages.push(assistantText);
        }
    });

    if (!messages.length) {
        const summaries = snapshot && snapshot.aiSegmentSummaries && typeof snapshot.aiSegmentSummaries === "object"
            ? Object.values(snapshot.aiSegmentSummaries)
            : [];
        summaries.forEach((record) => {
            const summary = normalizeText(record && (record.summary || record.title) || "");
            if (summary) {
                messages.push(summary);
            }
        });
    }

    return messages;
}

function buildNavigatorTitle(snapshot, conversationId, metaEntry) {
    if (metaEntry && metaEntry.title) {
        return metaEntry.title;
    }

    const messages = buildNavigatorMessages(snapshot);
    if (messages.length) {
        return sliceString(messages[0], 72);
    }

    const pageTitle = normalizeText(snapshot && snapshot.pageTitle);
    if (pageTitle) {
        return sliceString(pageTitle, 72);
    }

    const provider = deriveProviderLabel(snapshot && snapshot.provider);
    return `${provider} 会话 ${String(conversationId || "").slice(0, 8)}`;
}

function buildNavigatorThread(conversationId, snapshot, metaEntry) {
    if (!snapshot || typeof snapshot !== "object") {
        return null;
    }

    const updatedAtMs = Number(snapshot.updatedAt) || Date.now();
    const convo = buildNavigatorMessages(snapshot);

    return {
        id: `nav:${conversationId}`,
        conversationId: conversationId,
        storageKey: `${NAV_STORAGE_PREFIX}${conversationId}`,
        title: buildNavigatorTitle(snapshot, conversationId, metaEntry),
        convo: convo,
        favorite: Boolean(metaEntry && metaEntry.favorite),
        create_time: Math.floor(updatedAtMs / 1000),
        date: formatDate(updatedAtMs),
        time: formatTime(updatedAtMs),
        provider: snapshot.provider || "",
        pageUrl: snapshot.pageUrl || "",
        snapshot: snapshot,
        source_type: "navigator"
    };
}

function normalizeLegacyThread(thread) {
    const copy = Object.assign({}, thread || {});
    const timestampMs = Number(copy.create_time) ? Number(copy.create_time) * 1000 : Date.now();
    copy.id = String(copy.id || "");
    copy.title = copy.title || "";
    copy.convo = Array.isArray(copy.convo) ? copy.convo.map((item) => normalizeText(item)) : [];
    copy.favorite = Boolean(copy.favorite);
    copy.date = copy.date || formatDate(timestampMs);
    copy.time = copy.time || formatTime(timestampMs);
    copy.source_type = "legacy";
    return copy;
}

function expungeDuplicates(threads) {
    const uniqueThreads = {};
    normalizeThreads(threads).forEach((thread) => {
        if (thread.id && !uniqueThreads[thread.id]) {
            uniqueThreads[thread.id] = thread;
        }
    });
    return Object.values(uniqueThreads);
}

async function loadAllThreadsFromStorage() {
    const result = await storageGetAll();
    const meta = result && result[NAV_META_KEY] && typeof result[NAV_META_KEY] === "object" ? result[NAV_META_KEY] : {};
    const legacyThreads = sortThreads(expungeDuplicates(result.threads || []).map(normalizeLegacyThread));
    const navigatorThreads = Object.keys(result || {})
        .filter((key) => key.startsWith(NAV_STORAGE_PREFIX))
        .map((key) => buildNavigatorThread(key.slice(NAV_STORAGE_PREFIX.length), result[key], meta[key.slice(NAV_STORAGE_PREFIX.length)]))
        .filter(Boolean);

    return sortThreads(legacyThreads.concat(navigatorThreads));
}

function findThreadById(threadId) {
    return threads_g.find((thread) => thread && thread.id === threadId) || null;
}

function renderThreads() {
    const visibleThreads = getVisibleThreads();
    updateHeaderSummary(visibleThreads);
    updateStats(visibleThreads);

    main.innerHTML = "";

    if (!visibleThreads.length) {
        main.appendChild(createEmptyState());
        return;
    }

    const fragment = document.createDocumentFragment();
    const template = document.getElementById("thread-card-template");

    visibleThreads.forEach((thread) => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".thread-card");
        const titleNode = clone.querySelector(".title-text");
        const subtitleNode = clone.querySelector(".subtitle");
        const bookmarkButton = clone.querySelector(".bookmark");

        card.dataset.threadId = thread.id;
        titleNode.innerHTML = highlightText(getThreadTitle(thread), currentSearch);
        subtitleNode.innerHTML = highlightText(buildSubtitle(thread, currentSearch), currentSearch);
        clone.querySelector(".meta-date").textContent = thread.date || "未知日期";
        clone.querySelector(".meta-time").textContent = thread.time || "未知时间";
        clone.querySelector(".meta-count").textContent = `${Array.isArray(thread.convo) ? thread.convo.length : 0} 条消息`;

        if (thread.favorite) {
            bookmarkButton.classList.add("is-bookmarked");
            bookmarkButton.textContent = "已收藏";
        }

        fragment.appendChild(clone);
    });

    main.appendChild(fragment);
}

async function refreshFromStorage() {
    threads_g = await loadAllThreadsFromStorage();
    renderThreads();
}

async function persistLegacyThreads() {
    const legacyThreads = threads_g
        .filter((thread) => thread && thread.source_type !== "navigator")
        .map((thread) => {
            const copy = Object.assign({}, thread);
            delete copy.source_type;
            return copy;
        });
    await storageSet({ threads: legacyThreads });
}

async function updateNavigatorMeta(conversationId, nextValues) {
    const result = await storageGet({ [NAV_META_KEY]: {} });
    const meta = result[NAV_META_KEY] && typeof result[NAV_META_KEY] === "object" ? result[NAV_META_KEY] : {};
    meta[conversationId] = Object.assign({}, meta[conversationId] || {}, nextValues);
    await storageSet({ [NAV_META_KEY]: meta });
}

async function removeNavigatorMeta(conversationId) {
    const result = await storageGet({ [NAV_META_KEY]: {} });
    const meta = result[NAV_META_KEY] && typeof result[NAV_META_KEY] === "object" ? result[NAV_META_KEY] : {};
    if (meta[conversationId]) {
        delete meta[conversationId];
        await storageSet({ [NAV_META_KEY]: meta });
    }
}

async function deleteThreadById(threadId) {
    const thread = findThreadById(threadId);
    if (!thread) {
        return;
    }

    if (thread.source_type === "navigator") {
        await storageRemove(thread.storageKey);
        await removeNavigatorMeta(thread.conversationId);
    } else {
        threads_g = threads_g.filter((item) => item && item.id !== threadId);
        await persistLegacyThreads();
    }

    await refreshFromStorage();
}

function updateBookmarkState(button, saved) {
    button.classList.toggle("is-bookmarked", saved);
    button.textContent = saved ? "已收藏" : "收藏";
}

async function toggleBookmark(threadId, button) {
    const thread = findThreadById(threadId);
    if (!thread) {
        return;
    }

    const nextFavorite = !thread.favorite;
    thread.favorite = nextFavorite;

    if (thread.source_type === "navigator") {
        await updateNavigatorMeta(thread.conversationId, { favorite: nextFavorite });
    } else {
        await persistLegacyThreads();
    }

    updateBookmarkState(button, nextFavorite);
    await refreshFromStorage();
}

function encodeStringAsBlob(string) {
    const bytes = new TextEncoder().encode(string);
    return new Blob([bytes], { type: "application/json;charset=utf-8" });
}

const downloadBlobAsFile = (function () {
    const anchor = document.createElement("a");
    document.body.appendChild(anchor);
    anchor.style.display = "none";
    return function (blob, fileName) {
        const url = window.URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        window.URL.revokeObjectURL(url);
    };
})();

function exportThread(threadId) {
    const thread = findThreadById(threadId);
    if (!thread) {
        return;
    }

    const payload = thread.source_type === "navigator"
        ? {
            app: "GPTgps",
            version: 1,
            provider: thread.provider || "openai",
            conversationId: thread.conversationId || "",
            pageUrl: thread.pageUrl || "",
            exportedAt: new Date().toISOString(),
            state: thread.snapshot || {}
        }
        : thread;

    const blob = encodeStringAsBlob(JSON.stringify(payload, null, 2));
    downloadBlobAsFile(blob, `gptgps-thread-${threadId.replace(/[^a-zA-Z0-9._-]+/g, "-")}.json`);
}

async function toggleThreadTitleEditable(threadId, card) {
    const thread = findThreadById(threadId);
    if (!thread) {
        return;
    }

    const titleText = card.querySelector(".title-text");
    const icon = card.querySelector(".edit-title-button i");

    if (titleText.contentEditable === "inherit") {
        titleText.innerHTML = escapeHtml(thread.title || getThreadTitle(thread));
        titleText.classList.add("editable");
        titleText.contentEditable = "true";
        titleText.focus();
        icon.classList.remove("fa-pen-to-square");
        icon.classList.add("fa-floppy-disk-pen");
        return;
    }

    const nextTitle = titleText.innerText.trim() || getThreadTitle(thread);
    thread.title = nextTitle;
    titleText.classList.remove("editable");
    titleText.contentEditable = "inherit";
    icon.classList.remove("fa-floppy-disk-pen");
    icon.classList.add("fa-pen-to-square");

    if (thread.source_type === "navigator") {
        await updateNavigatorMeta(thread.conversationId, { title: nextTitle });
    } else {
        await persistLegacyThreads();
    }

    await refreshFromStorage();
}

function buildProviderConversationUrl(provider, conversationId) {
    if (!provider || !conversationId) {
        return "";
    }
    if (provider === "openai") {
        return `https://chatgpt.com/c/${conversationId}`;
    }
    if (provider === "claude") {
        return `https://claude.ai/chat/${conversationId}`;
    }
    if (provider === "gemini") {
        return "https://gemini.google.com/app";
    }
    if (provider === "qwen") {
        return "https://chat.qwen.ai/";
    }
    if (provider === "doubao") {
        return "https://www.doubao.com/chat/";
    }
    return "";
}

function continueThread(threadId) {
    const thread = findThreadById(threadId);
    if (!thread) {
        return;
    }

    if (thread.source_type === "navigator") {
        const targetUrl = thread.pageUrl || buildProviderConversationUrl(thread.provider, thread.conversationId);
        if (targetUrl) {
            window.open(targetUrl, "_blank");
            return;
        }
        openThread(threadId);
        return;
    }

    if (thread.hasOwnProperty("unified_id") && thread.unified_id === true) {
        window.open(`https://chatgpt.com/c/${thread.id}`, "_blank");
        return;
    }

    const convo = [];
    const threadConvo = Array.isArray(thread.convo) ? thread.convo : [];
    for (let i = 0; i < threadConvo.length; i += 1) {
        const user = i % 2 === 0 ? "Me" : "ChatGPT";
        convo.push({ [user]: plainText(threadConvo[i]) });
    }
    chrome.runtime.sendMessage({ convo: convo, type: "b_continue_convo" });
}

function openThread(threadId) {
    window.open(`thread.html?thread=${encodeURIComponent(threadId)}`, "_blank");
}

function handleSearch() {
    currentSearch = searchInput.value.trim();
    renderThreads();
}

function setView(view) {
    currentView = view;
    viewAllButton.classList.toggle("is-active", view === "all");
    viewBookmarksButton.classList.toggle("is-active", view === "bookmarks");
    renderThreads();
}

function bindEvents() {
    searchInput.addEventListener("input", handleSearch);
    viewAllButton.addEventListener("click", () => setView("all"));
    viewBookmarksButton.addEventListener("click", () => setView("bookmarks"));

    main.addEventListener("click", (event) => {
        const card = event.target.closest(".thread-card");
        if (!card) {
            return;
        }

        const threadId = card.dataset.threadId;
        if (!threadId) {
            return;
        }

        if (event.target.closest(".edit-title-button")) {
            toggleThreadTitleEditable(threadId, card);
            return;
        }

        if (event.target.closest(".bookmark")) {
            toggleBookmark(threadId, card.querySelector(".bookmark"));
            return;
        }

        if (event.target.closest(".export")) {
            exportThread(threadId);
            return;
        }

        if (event.target.closest(".continue")) {
            continueThread(threadId);
            return;
        }

        if (event.target.closest(".delete")) {
            deleteThreadById(threadId);
            return;
        }

        if (event.target.closest(".title-text") && card.querySelector(".title-text").contentEditable === "true") {
            return;
        }

        openThread(threadId);
    });

    main.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }
        const title = event.target.closest(".title-text");
        if (!title) {
            return;
        }
        event.preventDefault();
        const card = title.closest(".thread-card");
        if (!card) {
            return;
        }
        toggleThreadTitleEditable(card.dataset.threadId, card);
    });
}

async function boot() {
    bindEvents();
    await refreshFromStorage();
}

boot();
