const SETTINGS_DEFAULTS = {
    buttons: true,
    auto_send: true,
    auto_delete: false,
    disable_history: false,
    page_theme_mode: "auto",
    page_theme_provider: "openai"
};

const SUPPORTED_SETTINGS_LANGS = new Set(["en", "zh_CN"]);

const LANGUAGE_LABEL_KEYS = {
    en: "settings_language_option_en",
    zh_CN: "settings_language_option_zh_cn"
};

const PROVIDER_LABEL_KEYS = {
    openai: "settings_theme_provider_openai",
    gemini: "settings_theme_provider_gemini",
    qwen: "settings_theme_provider_qwen",
    doubao: "settings_theme_provider_doubao",
    claude: "settings_theme_provider_claude"
};

function storageGet(defaults) {
    return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function storageSet(payload) {
    return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function getToggle(id) {
    return document.getElementById(id);
}

async function t(key) {
    const result = await settingsTranslate(key);
    return result || key;
}

function normalizeSettingsLanguage(lang) {
    if (lang === "zh_TW") {
        return "zh_CN";
    }
    if (SUPPORTED_SETTINGS_LANGS.has(lang)) {
        return lang;
    }
    return "en";
}

async function getStoredSettings() {
    const result = await storageGet({ settings: SETTINGS_DEFAULTS, lang: "en" });
    return {
        settings: Object.assign({}, SETTINGS_DEFAULTS, result.settings || {}),
        lang: normalizeSettingsLanguage(result.lang || "en")
    };
}

async function updateSettings(nextValues) {
    const current = await storageGet({ settings: SETTINGS_DEFAULTS });
    const settings = Object.assign({}, SETTINGS_DEFAULTS, current.settings || {}, nextValues);
    await storageSet({ settings: settings });
    return settings;
}

function closeAllPickers() {
    document.querySelectorAll(".picker").forEach((picker) => {
        picker.classList.remove("is-open");
        const trigger = picker.querySelector(".picker-trigger");
        const menu = picker.querySelector(".picker-menu");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
        if (menu) {
            menu.hidden = true;
        }
    });
}

function openPicker(picker) {
    closeAllPickers();
    picker.classList.add("is-open");
    const trigger = picker.querySelector(".picker-trigger");
    const menu = picker.querySelector(".picker-menu");
    if (trigger) {
        trigger.setAttribute("aria-expanded", "true");
    }
    if (menu) {
        menu.hidden = false;
    }
}

function attachPickerBehavior(pickerId, triggerId) {
    const picker = document.getElementById(pickerId);
    const trigger = document.getElementById(triggerId);

    if (!picker || !trigger) {
        return;
    }

    trigger.addEventListener("click", function () {
        if (picker.classList.contains("is-open")) {
            closeAllPickers();
            return;
        }
        openPicker(picker);
    });
}

async function renderLanguageState(lang) {
    const valueLabel = await t(LANGUAGE_LABEL_KEYS[lang] || LANGUAGE_LABEL_KEYS.en);
    document.getElementById("languagePickerValue").textContent = valueLabel;
    document.getElementById("languageStatusText").textContent = valueLabel;

    document.querySelectorAll('[data-picker="language"]').forEach((option) => {
        const isSelected = option.dataset.value === lang;
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
}

async function buildThemeStatusText(mode, provider, resolvedProvider) {
    const providerKey = PROVIDER_LABEL_KEYS[resolvedProvider] || PROVIDER_LABEL_KEYS.openai;
    const providerLabel = await t(providerKey);
    if (mode === "locked") {
        return {
            pickerValue: await t(`settings_theme_option_${provider}`),
            statusText: `${await t("settings_theme_locked_status")} ${providerLabel}`,
            hintText: `${await t("settings_theme_hint_locked")} ${providerLabel}.`
        };
    }

    return {
        pickerValue: await t("settings_theme_option_auto"),
        statusText: `${await t("settings_theme_following_status")} ${providerLabel}`,
        hintText: `${await t("settings_theme_hint_auto")} ${providerLabel}.`
    };
}

async function renderThemeState(settings, resolvedProvider) {
    const mode = settings.page_theme_mode || "auto";
    const provider = settings.page_theme_provider || "openai";
    const status = await buildThemeStatusText(mode, provider, resolvedProvider || provider);
    document.getElementById("themePickerValue").textContent = status.pickerValue;
    document.getElementById("themeStatusText").textContent = status.statusText;
    document.getElementById("themeControlHint").textContent = status.hintText;

    document.querySelectorAll('[data-picker="theme"]').forEach((option) => {
        const optionMode = option.dataset.mode;
        const optionProvider = option.dataset.provider;
        const isSelected = optionMode === mode && (optionMode === "auto" || optionProvider === provider);
        option.classList.toggle("is-selected", isSelected);
        option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
}

async function refreshThemeUi() {
    const resolved = await window.GPTGPSPageTheme.syncPageTheme();
    await renderThemeState(resolved.settings, resolved.provider);
}

async function loadSettings() {
    const stored = await getStoredSettings();
    const settings = stored.settings;
    getToggle("exportButtonsToggle").checked = settings.buttons;
    getToggle("autoDeleteToggle").checked = settings.auto_delete;
    getToggle("autoSendToggle").checked = settings.auto_send;
    getToggle("disable-history").checked = settings.disable_history;

    await renderLanguageState(stored.lang);
    await refreshThemeUi();
}

async function updateToggles() {
    await updateSettings({
        buttons: getToggle("exportButtonsToggle").checked,
        auto_send: getToggle("autoSendToggle").checked,
        auto_delete: getToggle("autoDeleteToggle").checked,
        disable_history: getToggle("disable-history").checked
    });
}

async function changeLanguage(lang) {
    await storageSet({ lang: normalizeSettingsLanguage(lang) });
    location.reload();
}

async function changeTheme(mode, provider) {
    await updateSettings({
        page_theme_mode: mode,
        page_theme_provider: provider
    });
    await window.GPTGPSPageTheme.savePageThemePreference(mode, provider);
    const current = await getStoredSettings();
    const bodyProvider = document.body.dataset.pageThemeProvider || provider;
    await renderThemeState(current.settings, bodyProvider);
}

function bindGlobalEvents() {
    document.querySelectorAll(".setting-toggle").forEach((toggle) => {
        toggle.addEventListener("change", updateToggles);
    });

    document.querySelectorAll('[data-picker="language"]').forEach((option) => {
        option.addEventListener("click", async function () {
            closeAllPickers();
            await changeLanguage(option.dataset.value);
        });
    });

    document.querySelectorAll('[data-picker="theme"]').forEach((option) => {
        option.addEventListener("click", async function () {
            closeAllPickers();
            await changeTheme(option.dataset.mode, option.dataset.provider || "openai");
        });
    });

    document.addEventListener("click", function (event) {
        if (!event.target.closest(".picker")) {
            closeAllPickers();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeAllPickers();
        }
    });

    window.addEventListener("focus", refreshThemeUi);
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) {
            refreshThemeUi();
        }
    });

    window.addEventListener("gptgps:page-theme-change", function (event) {
        const provider = event.detail && event.detail.provider ? event.detail.provider : "openai";
        getStoredSettings().then((stored) => renderThemeState(stored.settings, provider));
    });
}

async function initializeSettingsPage() {
    const stored = await getStoredSettings();
    if (stored.lang !== ((await storageGet({ lang: "en" })).lang || "en")) {
        await storageSet({ lang: stored.lang });
    }
    await loadSettingsTranslations(stored.lang);
    attachPickerBehavior("languagePicker", "languagePickerButton");
    attachPickerBehavior("themePicker", "themePickerButton");
    bindGlobalEvents();
    await loadSettings();
    document.getElementById("cover").style.display = "none";
}

initializeSettingsPage();
