let settingsMessagesCache = {};

function settingsLocalizationPath(lang) {
    return `/_locales/${lang}/settings-page.json`;
}

async function fetchSettingsTranslations(lang) {
    if (settingsMessagesCache[lang]) {
        return settingsMessagesCache[lang];
    }

    try {
        const response = await fetch(settingsLocalizationPath(lang));
        const json = await response.json();
        settingsMessagesCache[lang] = json;
        return json;
    } catch (error) {
        if (lang !== "en") {
            return fetchSettingsTranslations("en");
        }
        throw error;
    }
}

function applySettingsTranslation(element, translations) {
    if (element.hasAttribute("data-i18n")) {
        const key = element.getAttribute("data-i18n");
        if (translations[key] && translations[key].message) {
            element.innerHTML = translations[key].message;
        }
    }

    if (element.hasAttribute("data-i18n-placeholder")) {
        const key = element.getAttribute("data-i18n-placeholder");
        if (translations[key] && translations[key].message) {
            element.setAttribute("placeholder", translations[key].message);
        }
    }

    if (element.hasAttribute("data-i18n-title")) {
        const key = element.getAttribute("data-i18n-title");
        if (translations[key] && translations[key].message) {
            element.setAttribute("title", translations[key].message);
        }
    }
}

async function loadSettingsTranslations(lang) {
    const translations = await fetchSettingsTranslations(lang);
    document.documentElement.lang = lang === "zh_CN" ? "zh-CN" : lang === "zh_TW" ? "zh-TW" : lang;

    document.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title]").forEach((element) => {
        applySettingsTranslation(element, translations);
    });
}

async function settingsTranslate(key, lang) {
    let targetLang = lang;
    if (!targetLang) {
        const stored = await new Promise((resolve) => chrome.storage.local.get({ lang: "en" }, resolve));
        targetLang = stored.lang || "en";
    }

    const translations = await fetchSettingsTranslations(targetLang);
    return translations[key] && translations[key].message ? translations[key].message : "";
}

window.loadSettingsTranslations = loadSettingsTranslations;
window.settingsTranslate = settingsTranslate;
