const NAV_STORAGE_PREFIX = "cng_nav_v1:";
const AI_CONFIG_STORAGE_KEY = "cng_nav_ai_config_v1";

function formatHistoryNote(threads) {
    if (!Array.isArray(threads) || !threads.length) {
        return "历史归档尚未同步，首次使用时会逐步建立本地索引。";
    }

    const newest = threads
        .map((thread) => Number(thread?.create_time || 0))
        .filter((value) => value > 0)
        .sort((a, b) => b - a)[0];

    if (!newest) {
        return `已归档 ${threads.length} 条历史线程。`;
    }

    const date = new Date(newest * 1000);
    if (Number.isNaN(date.getTime())) {
        return `已归档 ${threads.length} 条历史线程。`;
    }

    return `已归档 ${threads.length} 条历史线程，最近一条记录于 ${date.toLocaleDateString("zh-CN")}。`;
}

function countBookmarks(threads) {
    if (!Array.isArray(threads)) {
        return 0;
    }
    return threads.filter((thread) => Boolean(thread && thread.favorite)).length;
}

function countNavSessions(allStorage) {
    return Object.keys(allStorage).filter((key) => key.indexOf(NAV_STORAGE_PREFIX) === 0).length;
}

function readAiStatus(allStorage) {
    const config = allStorage[AI_CONFIG_STORAGE_KEY];
    if (!config || typeof config !== "object") {
        return "未启用";
    }
    if (!config.enabled) {
        return "已关闭";
    }
    if (config.provider) {
        return `已启用 · ${String(config.provider)}`;
    }
    return "已启用";
}

function updateStat(selector, value) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = String(value);
    }
}

function hydrateHome() {
    chrome.storage.local.get(null, (allStorage) => {
        const threads = Array.isArray(allStorage.threads) ? allStorage.threads : [];
        updateStat('[data-stat="thread-count"]', threads.length);
        updateStat('[data-stat="bookmark-count"]', countBookmarks(threads));
        updateStat('[data-stat="nav-sessions"]', countNavSessions(allStorage));
        updateStat('[data-stat="ai-status"]', readAiStatus(allStorage));
        updateStat('[data-stat="history-note"]', formatHistoryNote(threads));
    });
}

function bootMotion() {
    window.requestAnimationFrame(() => {
        document.body.classList.add("is-ready");
    });
}

function setYear() {
    const yearNode = document.getElementById("current-year");
    if (yearNode) {
        yearNode.textContent = String(new Date().getFullYear());
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setYear();
    hydrateHome();
    bootMotion();
});
