const PAGE_THEME_DEFAULTS = {
    page_theme_mode: "auto",
    page_theme_provider: "openai"
};

const PAGE_THEME_PROVIDERS = {
    openai: {
        key: "openai",
        labelKey: "settings_theme_provider_openai"
    },
    gemini: {
        key: "gemini",
        labelKey: "settings_theme_provider_gemini"
    },
    qwen: {
        key: "qwen",
        labelKey: "settings_theme_provider_qwen"
    },
    doubao: {
        key: "doubao",
        labelKey: "settings_theme_provider_doubao"
    },
    claude: {
        key: "claude",
        labelKey: "settings_theme_provider_claude"
    }
};

function pageThemeStorageGet(defaults) {
    return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function pageThemeStorageSet(payload) {
    return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function detectPageThemeProvider(rawUrl) {
    if (!rawUrl) {
        return "";
    }

    try {
        const parsed = new URL(rawUrl);
        const host = String(parsed.hostname || "").toLowerCase();

        if (host === "chatgpt.com" || host === "chat.openai.com") {
            return "openai";
        }
        if (host === "gemini.google.com") {
            return "gemini";
        }
        if (
            host === "chat.qwen.ai" ||
            host === "qwen.ai" ||
            host === "www.qwen.ai" ||
            host === "tongyi.com" ||
            host === "www.tongyi.com" ||
            host === "qianwen.com" ||
            host === "www.qianwen.com"
        ) {
            return "qwen";
        }
        if (host === "doubao.com" || host === "www.doubao.com") {
            return "doubao";
        }
        if (host === "claude.ai") {
            return "claude";
        }
    } catch (error) {
        console.warn("Unable to detect provider from URL:", error);
    }

    return "";
}

function queryActiveTabProvider() {
    return new Promise((resolve) => {
        if (!chrome.tabs || !chrome.tabs.query) {
            resolve("");
            return;
        }

        chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
            const activeUrl = tabs && tabs[0] ? tabs[0].url : "";
            resolve(detectPageThemeProvider(activeUrl));
        });
    });
}

async function getStoredThemeContext() {
    const result = await pageThemeStorageGet({
        settings: PAGE_THEME_DEFAULTS,
        page_theme_last_provider: "openai"
    });

    return {
        settings: Object.assign({}, PAGE_THEME_DEFAULTS, result.settings || {}),
        lastProvider: result.page_theme_last_provider || "openai"
    };
}

function applyPageTheme(provider, source) {
    const resolvedProvider = PAGE_THEME_PROVIDERS[provider] ? provider : "openai";
    const resolvedSource = source || "default";
    document.body.dataset.pageThemeProvider = resolvedProvider;
    document.body.dataset.pageThemeSource = resolvedSource;
    document.documentElement.dataset.pageThemeProvider = resolvedProvider;
    window.dispatchEvent(
        new CustomEvent("gptgps:page-theme-change", {
            detail: {
                provider: resolvedProvider,
                source: resolvedSource
            }
        })
    );
}

async function resolvePageTheme() {
    const context = await getStoredThemeContext();
    const settings = context.settings;
    if (settings.page_theme_mode === "locked" && PAGE_THEME_PROVIDERS[settings.page_theme_provider]) {
        return {
            provider: settings.page_theme_provider,
            source: "locked",
            settings: settings
        };
    }

    const activeProvider = await queryActiveTabProvider();
    if (activeProvider) {
        await pageThemeStorageSet({ page_theme_last_provider: activeProvider });
        return {
            provider: activeProvider,
            source: "active",
            settings: settings
        };
    }

    if (PAGE_THEME_PROVIDERS[context.lastProvider]) {
        return {
            provider: context.lastProvider,
            source: "recent",
            settings: settings
        };
    }

    return {
        provider: "openai",
        source: "default",
        settings: settings
    };
}

async function syncPageTheme() {
    const resolved = await resolvePageTheme();
    applyPageTheme(resolved.provider, resolved.source);
    return resolved;
}

async function savePageThemePreference(mode, provider) {
    const context = await getStoredThemeContext();
    const nextSettings = Object.assign({}, context.settings, {
        page_theme_mode: mode === "locked" ? "locked" : "auto",
        page_theme_provider: PAGE_THEME_PROVIDERS[provider] ? provider : "openai"
    });
    await pageThemeStorageSet({ settings: nextSettings });
    return syncPageTheme();
}

window.GPTGPSPageTheme = {
    PAGE_THEME_DEFAULTS,
    PAGE_THEME_PROVIDERS,
    detectPageThemeProvider,
    getStoredThemeContext,
    syncPageTheme,
    savePageThemePreference,
    applyPageTheme
};
