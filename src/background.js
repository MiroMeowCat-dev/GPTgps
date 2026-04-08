if (typeof browser !== "undefined") {
    chrome.action = browser.browserAction
}
// Listen for a click on the browser action
chrome.action.onClicked.addListener(function(tab) {
    chrome.tabs.create({url: "pages/prompts.html"});
});

chrome.runtime.onMessage.addListener(function (message){
    if (message.type === 'b_continue_convo') {
        console.log('background received')
        chrome.tabs.create({url: 'https://chat.openai.com/chat', active: true}, function (my_tab){
            let sent = false;
            chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
                if (tab.id === my_tab.id && changeInfo.status === 'complete' && !sent) {
                    setTimeout(() => chrome.tabs.sendMessage(my_tab.id, {
                        type: 'c_continue_convo',
                        id: message.id,
                        convo: message.convo
                    }), 500)
                    sent = true;
                }
            });
        });
    }
})

function parseSegmentSummaryJSON(text) {
    const raw = typeof text === "string" ? text.trim() : "";
    if (!raw) {
        throw new Error("Empty AI response");
    }

    const candidates = [];
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
        candidates.push(fencedMatch[1].trim());
    }
    candidates.push(raw);

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidates.push(raw.slice(firstBrace, lastBrace + 1).trim());
    }

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        try {
            return JSON.parse(candidate);
        }
        catch (error) {}
    }

    throw new Error("Unable to parse AI response JSON");
}

function parseSegmentSummaryLoose(text) {
    const safe = String(text || "").trim();
    if (!safe) {
        return { title: "", summary: "" };
    }

    const flattened = safe.replace(/\r/g, "\n");
    const lines = flattened.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    let title = "";
    let summary = "";

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!title && /^title\s*[:\uFF1A]/i.test(line)) {
            title = line.replace(/^title\s*[:\uFF1A]\s*/i, "").trim();
            continue;
        }
        if (!summary && /^summary\s*[:\uFF1A]/i.test(line)) {
            summary = line.replace(/^summary\s*[:\uFF1A]\s*/i, "").trim();
            continue;
        }
    }

    if (!summary && lines.length >= 2) {
        summary = lines.slice(1).join(" ");
    }
    if (!title && lines.length >= 1) {
        title = lines[0]
            .replace(/^title\s*[:\uFF1A]\s*/i, "")
            .replace(/^summary\s*[:\uFF1A]\s*/i, "")
            .trim();
    }
    if (!summary) {
        summary = safe;
    }
    if (!title) {
        title = summary.split(/[\u3002.!?]/)[0].trim();
    }

    title = title.replace(/^[#*\-\s]+/, "").trim();
    summary = summary.replace(/^[#*\-\s]+/, "").trim();
    return {
        title: title.slice(0, 120),
        summary: summary.slice(0, 420)
    };
}

function extractMessageContentText(rawContent) {
    if (typeof rawContent === "string") {
        return rawContent;
    }

    if (Array.isArray(rawContent)) {
        const parts = [];
        for (let i = 0; i < rawContent.length; i += 1) {
            const item = rawContent[i];
            if (typeof item === "string") {
                if (item.trim()) {
                    parts.push(item);
                }
                continue;
            }
            if (!item || typeof item !== "object") {
                continue;
            }

            if (typeof item.text === "string" && item.text.trim()) {
                parts.push(item.text);
                continue;
            }
            if (item.text && typeof item.text === "object" && typeof item.text.value === "string" && item.text.value.trim()) {
                parts.push(item.text.value);
                continue;
            }
            if (typeof item.content === "string" && item.content.trim()) {
                parts.push(item.content);
                continue;
            }
            if (typeof item.value === "string" && item.value.trim()) {
                parts.push(item.value);
            }
        }
        return parts.join("\n").trim();
    }

    if (rawContent && typeof rawContent === "object") {
        if (typeof rawContent.text === "string") {
            return rawContent.text;
        }
        if (rawContent.text && typeof rawContent.text === "object" && typeof rawContent.text.value === "string") {
            return rawContent.text.value;
        }
    }

    return "";
}

function normalizeAiBaseUrl(rawBaseUrl) {
    const normalized = typeof rawBaseUrl === "string" ? rawBaseUrl.trim() : "";
    if (!normalized) {
        return "";
    }
    const candidate = normalized;
    let parsed;
    try {
        parsed = new URL(candidate);
    }
    catch (error) {
        return "";
    }

    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
        return "";
    }

    let normalizedHref = parsed.href.replace(/\/+$/, "");
    normalizedHref = normalizedHref
        .replace(/\/chat\/completions$/i, "")
        .replace(/\/text\/chatcompletion_v2$/i, "");
    const normalizedParsed = new URL(normalizedHref);
    const pathname = String(normalizedParsed.pathname || "");
    if (!pathname || pathname === "/") {
        return normalizedHref + "/v1";
    }

    return normalizedHref;
}

function normalizeSummaryLength(rawValue) {
    const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
    if (normalized === "short" || normalized === "medium" || normalized === "long") {
        return normalized;
    }
    return "medium";
}

function normalizeSummaryLanguage(rawValue) {
    const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
    if (normalized === "zh" || normalized === "en") {
        return normalized;
    }
    const locale = typeof navigator !== "undefined" && typeof navigator.language === "string"
        ? navigator.language.trim().toLowerCase()
        : "";
    return locale.startsWith("zh") ? "zh" : "en";
}

function sanitizeApiKey(rawValue) {
    let value = String(rawValue || "");
    value = value
        .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();
    if (value.includes(" ") || value.includes("\t")) {
        value = value.replace(/\s+/g, "");
    }
    return value;
}

function buildSummaryLengthInstruction(summaryLength) {
    if (summaryLength === "short") {
        return "Keep title under 8 words and summary under 24 words.";
    }
    if (summaryLength === "long") {
        return "Keep title under 14 words and summary under 90 words.";
    }
    return "Keep title under 10 words and summary under 50 words.";
}

function buildItemSummaryLengthInstruction(summaryLength) {
    if (summaryLength === "short") {
        return "Keep output under 18 words.";
    }
    if (summaryLength === "long") {
        return "Keep output under 55 words.";
    }
    return "Keep output under 32 words.";
}

function buildSummaryLanguageInstruction(summaryLanguage, jsonMode) {
    const normalized = normalizeSummaryLanguage(summaryLanguage);
    if (jsonMode) {
        if (normalized === "zh") {
            return "JSON keys must stay exactly title/summary (English keys). JSON values must be Simplified Chinese.";
        }
        return "JSON keys must stay exactly title/summary (English keys). JSON values must be English.";
    }
    if (normalized === "zh") {
        return "Use Simplified Chinese only.";
    }
    return "Use English only.";
}

function buildAiErrorHint(status, provider, baseUrl, model) {
    const providerText = provider || "provider";
    const providerId = normalizeProviderId(provider, baseUrl);
    if (status === 0) {
        if (providerId.includes("qwen_coding_plan")) {
            return `Network timeout/connection error. Try both coding endpoints and verify host permission: https://coding.dashscope.aliyuncs.com/v1 and https://coding-intl.dashscope.aliyuncs.com/v1.`;
        }
        return `Network timeout/connection error. Check host permission, endpoint reachability, and retry. (${baseUrl})`;
    }
    if (status === 400) {
        return `Request payload was rejected by ${providerText}. Verify model (${model || "n/a"}) and compatibility fields.`;
    }
    if (status === 401) {
        if (providerId.includes("qwen_coding_plan")) {
            return "Invalid key for Qwen Coding Plan. Verify sk-sp- key and coding endpoint (coding.dashscope.aliyuncs.com/v1).";
        }
        return `Invalid API key or provider mismatch for ${providerText}.`;
    }
    if (status === 403) {
        return `Permission denied for ${providerText} model ${model || ""}.`;
    }
    if (status === 404) {
        if (providerId.includes("minimax")) {
            return `Endpoint/model not found. Try ${baseUrl}/chat/completions or ${baseUrl}/text/chatcompletion_v2.`;
        }
        return `Endpoint or model not found. Check base URL (${baseUrl}) and model (${model || "n/a"}).`;
    }
    if (status === 429) {
        return "Rate limit reached. Retry later.";
    }
    if (status >= 500) {
        return `${providerText} service temporary failure. Retry later.`;
    }
    return "";
}

function sleepMs(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function containsOriginPermission(originPattern) {
    return new Promise((resolve) => {
        if (!originPattern || !chrome.permissions || !chrome.permissions.contains) {
            resolve(true);
            return;
        }
        chrome.permissions.contains({ origins: [originPattern] }, (granted) => {
            resolve(Boolean(granted));
        });
    });
}

function requestOriginPermission(originPattern) {
    return new Promise((resolve) => {
        if (!originPattern || !chrome.permissions || !chrome.permissions.request) {
            resolve(true);
            return;
        }
        chrome.permissions.request({ origins: [originPattern] }, (granted) => {
            resolve(Boolean(granted));
        });
    });
}

function isRetryableAiError(error) {
    const status = Number(error?.status) || 0;
    if (status === 429 || status >= 500) {
        return true;
    }
    if (status !== 0) {
        return false;
    }

    const message = String(error?.message || "").toLowerCase();
    if (!message) {
        return true;
    }
    return (
        message.includes("network") ||
        message.includes("failed to fetch") ||
        message.includes("timed out") ||
        message.includes("aborted")
    );
}

function normalizeProviderId(provider, baseUrl) {
    const normalized = String(provider || "").trim().toLowerCase();
    if (normalized) {
        return normalized;
    }
    try {
        const parsed = new URL(baseUrl || "");
        const host = String(parsed.hostname || "").toLowerCase();
        if (host.includes("minimax")) {
            return "minimax";
        }
        if (host.includes("dashscope")) {
            if (host.includes("coding")) {
                return "qwen_coding_plan";
            }
            return "qwen";
        }
    }
    catch (error) {}
    return "openai";
}

function providerMatches(providerId, keyword) {
    const normalizedProvider = String(providerId || "").trim().toLowerCase();
    const normalizedKeyword = String(keyword || "").trim().toLowerCase();
    if (!normalizedProvider || !normalizedKeyword) {
        return false;
    }
    return normalizedProvider === normalizedKeyword || normalizedProvider.includes(normalizedKeyword);
}

function buildRequestBodyCandidates(provider, baseUrl, model, messages, maxTokens, temperature) {
    const providerId = normalizeProviderId(provider, baseUrl || "");
    const safeMessages = Array.isArray(messages) ? messages : [];
    const canonicalBody = {
        model: model,
        messages: safeMessages
    };
    if (Number.isFinite(temperature)) {
        canonicalBody.temperature = temperature;
    }

    const tokenValue = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 0;
    const body = Object.assign({}, canonicalBody);
    if (tokenValue > 0) {
        if (providerMatches(providerId, "openai")) {
            body.max_completion_tokens = tokenValue;
        } else {
            body.max_tokens = tokenValue;
        }
    }
    if (providerMatches(providerId, "qwen")) {
        body.enable_thinking = false;
    }
    return [body];
}

function buildCompletionEndpointCandidates(baseUrl, provider) {
    const normalizedBase = normalizeAiBaseUrl(baseUrl || "");
    const providerId = normalizeProviderId(provider, normalizedBase);
    const candidates = [];
    if (providerId.includes("minimax")) {
        candidates.push(`${normalizedBase}/text/chatcompletion_v2`);
        candidates.push(`${normalizedBase}/chat/completions`);
    } else {
        candidates.push(`${normalizedBase}/chat/completions`);
    }
    const unique = [];
    const seen = new Set();
    for (let i = 0; i < candidates.length; i += 1) {
        const endpoint = candidates[i];
        if (!endpoint || seen.has(endpoint)) {
            continue;
        }
        seen.add(endpoint);
        unique.push(endpoint);
    }
    return unique;
}

function buildBaseUrlCandidates(baseUrl, provider) {
    const normalizedBase = normalizeAiBaseUrl(baseUrl || "");
    if (!normalizedBase) {
        return [];
    }

    const providerId = normalizeProviderId(provider, normalizedBase);
    const candidates = [normalizedBase];
    let parsed = null;
    try {
        parsed = new URL(normalizedBase);
    } catch (error) {
        parsed = null;
    }
    if (!parsed) {
        return candidates;
    }

    const protocol = String(parsed.protocol || "https:");
    const path = String(parsed.pathname || "/v1");
    function withHost(hostname) {
        return `${protocol}//${hostname}${path}`.replace(/\/+$/, "");
    }

    if (providerId.includes("qwen_coding_plan")) {
        candidates.push(withHost("coding.dashscope.aliyuncs.com"));
        candidates.push(withHost("coding-intl.dashscope.aliyuncs.com"));
    } else if (providerId.includes("qwen_intl")) {
        candidates.push(withHost("dashscope-intl.aliyuncs.com"));
        candidates.push(withHost("dashscope.aliyuncs.com"));
    } else if (providerId.includes("qwen_cn")) {
        candidates.push(withHost("dashscope.aliyuncs.com"));
        candidates.push(withHost("dashscope-intl.aliyuncs.com"));
    }

    const unique = [];
    const seen = new Set();
    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = normalizeAiBaseUrl(candidates[i] || "");
        if (!candidate || seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        unique.push(candidate);
    }
    return unique;
}

function extractChoiceText(choice) {
    if (!choice || typeof choice !== "object") {
        return "";
    }
    const message = choice.message || {};
    const primary = extractMessageContentText(message.content);
    if (primary) {
        return primary;
    }
    const reasoning = extractMessageContentText(message.reasoning_content);
    if (reasoning) {
        return reasoning;
    }
    if (typeof choice.text === "string" && choice.text.trim()) {
        return choice.text.trim();
    }
    return "";
}

function extractCompletionText(result) {
    const choiceContent = extractChoiceText(result?.choices?.[0]);
    if (choiceContent) {
        return choiceContent;
    }

    const topLevelCandidates = [
        result?.output_text,
        result?.reply,
        result?.text,
        result?.message,
        result?.content
    ];
    for (let i = 0; i < topLevelCandidates.length; i += 1) {
        const candidate = topLevelCandidates[i];
        const extracted = extractMessageContentText(candidate);
        if (extracted) {
            return extracted;
        }
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    return "";
}

async function requestAiListModels(config) {
    const apiKey = sanitizeApiKey(config.apiKey || "");
    const model = config.model || "";
    const baseUrl = normalizeAiBaseUrl(config.baseUrl || "");
    const provider = config.provider || "openai";
    const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 12000;
    if (!apiKey || !baseUrl) {
        return { ok: false, models: [], modelListed: null };
    }

    let timeoutHandle = null;
    try {
        const hasAbort = typeof AbortController !== "undefined";
        const controller = hasAbort ? new AbortController() : null;
        if (controller) {
            timeoutHandle = setTimeout(() => {
                controller.abort();
            }, timeoutMs);
        }
        const response = await fetch(`${baseUrl}/models`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            },
            signal: controller ? controller.signal : undefined
        });
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
        if (!response.ok) {
            return { ok: false, status: response.status, models: [], modelListed: null };
        }
        const payload = await response.json();
        const list = Array.isArray(payload?.data) ? payload.data : [];
        const modelIds = list
            .map((item) => (item && typeof item.id === "string" ? item.id.trim() : ""))
            .filter(Boolean);
        const modelListed = model ? modelIds.includes(model) : null;
        return {
            ok: true,
            status: 200,
            models: modelIds,
            modelListed
        };
    } catch (error) {
        return { ok: false, status: 0, models: [], modelListed: null };
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

async function requestAiChatCompletion(config, messages) {
    const apiKey = sanitizeApiKey(config.apiKey || "");
    const model = config.model || "gpt-4.1-mini";
    const baseUrl = normalizeAiBaseUrl(config.baseUrl || "");
    const provider = normalizeProviderId(config.provider || "openai", baseUrl);
    const requestedAttempts = Number(config.maxAttempts);
    const maxAttempts = Number.isFinite(requestedAttempts) && requestedAttempts >= 1
        ? Math.floor(requestedAttempts)
        : 1;
    const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 22000;
    const maxTokens = Number(config.maxTokens);
    const temperature = Number(config.temperature);

    if (!apiKey) {
        throw Object.assign(new Error("Missing apiKey"), { status: 0, provider, baseUrl, model });
    }
    if (!baseUrl) {
        throw Object.assign(new Error("Invalid baseUrl. Use an http(s) URL."), { status: 0, provider, baseUrl, model });
    }

    const baseUrlCandidates = buildBaseUrlCandidates(baseUrl, provider);
    const bodyCandidates = buildRequestBodyCandidates(provider, baseUrl, model, messages, maxTokens, temperature);
    const targets = [];
    for (let baseIndex = 0; baseIndex < baseUrlCandidates.length; baseIndex += 1) {
        const baseUrlCandidate = baseUrlCandidates[baseIndex];
        const endpointCandidates = buildCompletionEndpointCandidates(baseUrlCandidate, provider);
        for (let endpointIndex = 0; endpointIndex < endpointCandidates.length; endpointIndex += 1) {
            for (let bodyIndex = 0; bodyIndex < bodyCandidates.length; bodyIndex += 1) {
                targets.push({
                    endpoint: endpointCandidates[endpointIndex],
                    body: bodyCandidates[bodyIndex],
                    endpointIndex,
                    bodyIndex,
                    baseUrl: baseUrlCandidate
                });
            }
        }
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let attemptError = null;
        for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
            const target = targets[targetIndex];
            const endpoint = target.endpoint;
            const requestBody = target.body;
            const baseUrlUsed = target.baseUrl || baseUrl;
            let timeoutHandle = null;
            try {
                const hasAbort = typeof AbortController !== "undefined";
                const controller = hasAbort ? new AbortController() : null;
                if (controller) {
                    timeoutHandle = setTimeout(() => {
                        controller.abort();
                    }, timeoutMs);
                }

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller ? controller.signal : undefined
                });

                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    const shortError = (errorText || "").slice(0, 500);
                    const requestError = new Error(`${provider} request failed (${response.status}): ${shortError}`);
                    requestError.status = response.status;
                    requestError.provider = provider;
                    requestError.baseUrl = baseUrlUsed;
                    requestError.model = model;
                    requestError.endpoint = endpoint;
                    requestError.hint = buildAiErrorHint(response.status, provider, baseUrlUsed, model);
                    requestError.attempt = attempt;
                    const canTryAltTarget = (response.status === 400 || response.status === 404 || response.status === 405) && targetIndex < targets.length - 1;
                    if (canTryAltTarget) {
                        attemptError = requestError;
                        continue;
                    }
                    throw requestError;
                }

                const result = await response.json();
                const baseRespStatus = Number(result?.base_resp?.status_code);
                if (Number.isFinite(baseRespStatus) && baseRespStatus !== 0) {
                    const statusMsg = String(result?.base_resp?.status_msg || "Provider returned non-zero status_code");
                    const providerError = new Error(`${provider} request failed (${response.status}): ${statusMsg}`);
                    providerError.status = response.status || 400;
                    providerError.provider = provider;
                    providerError.baseUrl = baseUrlUsed;
                    providerError.model = model;
                    providerError.endpoint = endpoint;
                    providerError.hint = buildAiErrorHint(providerError.status, provider, baseUrlUsed, model);
                    providerError.attempt = attempt;
                    throw providerError;
                }
                const content = extractCompletionText(result);
                if (!content) {
                    const malformed = new Error("Invalid AI response payload");
                    malformed.status = 0;
                    malformed.provider = provider;
                    malformed.baseUrl = baseUrlUsed;
                    malformed.model = model;
                    malformed.endpoint = endpoint;
                    malformed.attempt = attempt;
                    throw malformed;
                }

                const resolvedModel = typeof result?.model === "string" && result.model.trim()
                    ? result.model.trim()
                    : model;
                return {
                    content,
                    model: resolvedModel,
                    provider,
                    baseUrl: baseUrlUsed,
                    endpoint,
                    attempt
                };
            } catch (error) {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                attemptError = error;
                if (!error || typeof error !== "object") {
                    break;
                }
                const status = Number(error.status) || 0;
                const canTryAltTarget = (status === 0 || status === 400 || status === 404 || status === 405) && targetIndex < targets.length - 1;
                if (canTryAltTarget) {
                    continue;
                }
                break;
            }
        }

        var normalized = attemptError;
        if (!normalized || typeof normalized !== "object") {
            normalized = new Error(String(attemptError || "Unknown AI request error"));
        }
        if (!normalized.status && normalized.name === "AbortError") {
            normalized = Object.assign(new Error(`Request timed out after ${timeoutMs}ms`), normalized);
        }

        if (typeof normalized.status !== "number") {
            normalized.status = 0;
        }
        if (!normalized.provider) {
            normalized.provider = provider;
        }
        if (!normalized.baseUrl) {
            normalized.baseUrl = baseUrl;
        }
        if (!normalized.model) {
            normalized.model = model;
        }
        if (!normalized.hint) {
            normalized.hint = buildAiErrorHint(normalized.status, provider, baseUrl, model);
        }
        normalized.attempt = attempt;
        lastError = normalized;

        if (attempt >= maxAttempts || !isRetryableAiError(normalized)) {
            throw normalized;
        }

        const jitter = Math.floor(Math.random() * 180);
        await sleepMs((450 * attempt) + jitter);
    }

    throw lastError || new Error("AI request failed");
}

function isTrustedAiSender(sender) {
    if (!sender || sender.id !== chrome.runtime.id) {
        return false;
    }
    const candidateUrls = [];
    if (sender.tab && sender.tab.url) {
        candidateUrls.push(String(sender.tab.url || ""));
    }
    if (sender.url) {
        candidateUrls.push(String(sender.url || ""));
    }
    if (sender.origin) {
        candidateUrls.push(String(sender.origin || ""));
    }

    if (!candidateUrls.length) {
        return true;
    }

    return candidateUrls.some((candidate) => {
        const url = String(candidate || "").toLowerCase();
        if (!url) {
            return false;
        }
        return (
            url.startsWith("https://chatgpt.com/") ||
            url.startsWith("https://chat.openai.com/") ||
            url.startsWith("https://gemini.google.com/") ||
            url.startsWith("https://chat.qwen.ai/") ||
            url.startsWith("https://qwen.ai/") ||
            url.startsWith("https://www.qwen.ai/") ||
            url.startsWith("https://tongyi.com/") ||
            url.startsWith("https://www.tongyi.com/") ||
            url.startsWith("https://qianwen.com/") ||
            url.startsWith("https://www.qianwen.com/") ||
            url.startsWith("https://doubao.com/") ||
            url.startsWith("https://www.doubao.com/") ||
            url.startsWith("https://claude.ai/") ||
            url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
        );
    });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== "gptgps_ai_ping") {
        return;
    }
    if (!isTrustedAiSender(sender)) {
        sendResponse({ ok: false, error: "Unauthorized sender" });
        return true;
    }
    sendResponse({ ok: true, alive: true, ts: Date.now() });
    return true;
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type !== "gptgps_ai_ensure_host_permission") {
        return;
    }
    if (!isTrustedAiSender(sender)) {
        sendResponse({ ok: false, reason: "Unauthorized sender." });
        return true;
    }

    (async () => {
        try {
            const payload = message.payload || {};
            const origin = typeof payload.origin === "string" ? payload.origin.trim() : "";
            const requestIfNeeded = Boolean(payload.requestIfNeeded);
            if (!origin) {
                sendResponse({ ok: false, reason: "Invalid host origin pattern." });
                return;
            }

            const granted = await containsOriginPermission(origin);
            if (granted) {
                sendResponse({ ok: true, origin, requested: false });
                return;
            }

            if (!requestIfNeeded) {
                sendResponse({ ok: false, reason: `Missing host permission for ${origin}`, origin });
                return;
            }

            const requested = await requestOriginPermission(origin);
            if (!requested) {
                sendResponse({ ok: false, reason: `Host permission was denied for ${origin}`, origin });
                return;
            }

            sendResponse({ ok: true, origin, requested: true });
        } catch (error) {
            sendResponse({
                ok: false,
                reason: error?.message ? String(error.message) : "Failed to handle host permission request."
            });
        }
    })();

    return true;
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type !== "gptgps_ai_segment_summary") {
        return;
    }
    if (!isTrustedAiSender(sender)) {
        sendResponse({ ok: false, error: "Unauthorized sender", status: 0 });
        return true;
    }

    (async () => {
        try {
            const payload = message.payload || {};
            const aiConfig = payload.aiConfig || {};
            const apiKey = payload.apiKey || aiConfig.apiKey || "";
            const provider = payload.provider || aiConfig.provider || "openai";
            const model = payload.model || aiConfig.model || "gpt-4.1-mini";
            const baseUrl = normalizeAiBaseUrl(payload.baseUrl || aiConfig.baseUrl || "");
            const summaryLength = normalizeSummaryLength(payload.summaryLength || aiConfig.summaryLength || "medium");
            const summaryLanguage = normalizeSummaryLanguage(payload.summaryLanguage || aiConfig.summaryLanguage || "");
            const requestConfig = payload.requestConfig && typeof payload.requestConfig === "object" ? payload.requestConfig : {};
            if (!baseUrl) {
                throw new Error("Invalid baseUrl. Use an http(s) URL.");
            }
            const prompts = Array.isArray(payload.prompts) ? payload.prompts : [];
            const segmentHint = payload.segmentHint;
            const contentSource = typeof payload.contentSource === "string" ? payload.contentSource.trim() : "";
            const pageTitle = typeof payload.pageTitle === "string" ? payload.pageTitle.trim() : "";
            const firstPrompt = typeof payload.firstPrompt === "string" ? payload.firstPrompt.trim() : "";
            const lastPrompt = typeof payload.lastPrompt === "string" ? payload.lastPrompt.trim() : "";

            if (!apiKey) {
                throw new Error("Missing apiKey");
            }
            if (prompts.length === 0) {
                throw new Error("Missing prompts");
            }

            const promptLines = prompts.map((item, index) => {
                if (typeof item === "string") {
                    return `${index + 1}. ${item}`;
                }
                try {
                    return `${index + 1}. ${JSON.stringify(item)}`;
                }
                catch (error) {
                    return `${index + 1}. ${String(item)}`;
                }
            });

            const userPrompt = [
                "Summarize the following segment content.",
                "Return JSON only with keys: title and summary.",
                "Both title and summary must be short text.",
                buildSummaryLengthInstruction(summaryLength),
                buildSummaryLanguageInstruction(summaryLanguage, true),
                pageTitle ? `Conversation title: ${pageTitle}` : "",
                firstPrompt ? `Segment first prompt: ${firstPrompt}` : "",
                lastPrompt ? `Segment last prompt: ${lastPrompt}` : "",
                contentSource ? `Content source mode: ${contentSource}` : "",
                segmentHint ? `Segment hint: ${segmentHint}` : "",
                "Content:",
                promptLines.join("\n")
            ].filter(Boolean).join("\n\n");
            const completion = await requestAiChatCompletion({
                apiKey,
                provider,
                model,
                baseUrl,
                maxAttempts: requestConfig.maxAttempts,
                timeoutMs: requestConfig.timeoutMs,
                maxTokens: requestConfig.maxTokens,
                temperature: requestConfig.temperature
            }, [
                {
                    role: "system",
                    content: "You are a concise assistant. Return JSON only: {\\\"title\\\":\\\"...\\\",\\\"summary\\\":\\\"...\\\"}. Keep keys as title/summary."
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]);
            const content = completion.content;

            let parsed = null;
            try {
                parsed = parseSegmentSummaryJSON(content);
            }
            catch (error) {
                parsed = parseSegmentSummaryLoose(content);
            }
            const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
            const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";

            if (!title && !summary) {
                throw new Error("AI response JSON must include title and summary");
            }
            const safeSummary = summary || title;
            const safeTitle = title || safeSummary.split(/[\u3002.!?]/)[0].trim().slice(0, 120);

            sendResponse({ok: true, title: safeTitle, summary: safeSummary});
        }
        catch (error) {
            const status = Number(error?.status) || 0;
            const provider = error?.provider || "";
            const baseUrl = error?.baseUrl || "";
            const model = error?.model || "";
            const hint = error?.hint || buildAiErrorHint(status, provider, baseUrl, model);
            sendResponse({
                ok: false,
                error: error?.message ? String(error.message) : "Unknown error",
                status: status,
                provider: provider,
                baseUrl: baseUrl,
                model: model,
                endpoint: error?.endpoint || "",
                hint: hint,
                retryAttempts: Number(error?.attempt) || 1
            });
        }
    })();

    return true;
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type !== "gptgps_ai_test_connection") {
        return;
    }
    if (!isTrustedAiSender(sender)) {
        sendResponse({ ok: false, error: "Unauthorized sender", status: 0 });
        return true;
    }

    (async () => {
        try {
            const payload = message.payload || {};
            const aiConfig = payload.aiConfig || {};
            const provider = aiConfig.provider || "openai";
            const model = aiConfig.model || "gpt-4.1-mini";
            const apiKey = aiConfig.apiKey || "";
            const baseUrl = aiConfig.baseUrl || "";
            const requestConfig = aiConfig.requestConfig && typeof aiConfig.requestConfig === "object"
                ? Object.assign({}, aiConfig.requestConfig)
                : {};
            if (!Number.isFinite(Number(requestConfig.maxAttempts))) {
                requestConfig.maxAttempts = 1;
            }
            if (!Number.isFinite(Number(requestConfig.timeoutMs))) {
                requestConfig.timeoutMs = 12000;
            }
            if (!Number.isFinite(Number(requestConfig.maxTokens))) {
                requestConfig.maxTokens = 24;
            }
            if (!Number.isFinite(Number(requestConfig.temperature))) {
                requestConfig.temperature = 0.2;
            }

            const modelsMeta = await requestAiListModels({
                apiKey,
                provider,
                model,
                baseUrl,
                timeoutMs: Math.min(12000, Number(requestConfig.timeoutMs) || 12000)
            });

            const completion = await requestAiChatCompletion({
                apiKey,
                provider,
                model,
                baseUrl,
                maxAttempts: requestConfig.maxAttempts,
                timeoutMs: requestConfig.timeoutMs,
                maxTokens: requestConfig.maxTokens,
                temperature: requestConfig.temperature
            }, [
                { role: "system", content: "Reply with OK only." },
                { role: "user", content: "Connectivity test" }
            ]);

            sendResponse({
                ok: true,
                provider: completion.provider,
                model: completion.model,
                baseUrl: completion.baseUrl,
                endpoint: completion.endpoint || "",
                modelListed: typeof modelsMeta.modelListed === "boolean" ? modelsMeta.modelListed : null,
                modelCount: Array.isArray(modelsMeta.models) ? modelsMeta.models.length : 0,
                modelsPreview: Array.isArray(modelsMeta.models) ? modelsMeta.models.slice(0, 8) : []
            });
        }
        catch (error) {
            const status = Number(error?.status) || 0;
            const provider = error?.provider || "";
            const baseUrl = error?.baseUrl || "";
            const model = error?.model || "";
            const hint = error?.hint || buildAiErrorHint(status, provider, baseUrl, model);
            sendResponse({
                ok: false,
                error: error?.message ? String(error.message) : "Unknown error",
                status: status,
                provider: provider,
                baseUrl: baseUrl,
                model: model,
                endpoint: error?.endpoint || "",
                hint: hint,
                retryAttempts: Number(error?.attempt) || 1
            });
        }
    })();

    return true;
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type !== "gptgps_ai_item_summary") {
        return;
    }
    if (!isTrustedAiSender(sender)) {
        sendResponse({ ok: false, error: "Unauthorized sender", status: 0 });
        return true;
    }

    (async () => {
        try {
            const payload = message.payload || {};
            const aiConfig = payload.aiConfig || {};
            const provider = aiConfig.provider || "openai";
            const model = aiConfig.model || "gpt-4.1-mini";
            const apiKey = aiConfig.apiKey || "";
            const baseUrl = normalizeAiBaseUrl(aiConfig.baseUrl || "");
            const summaryLength = normalizeSummaryLength(aiConfig.summaryLength || "medium");
            const summaryLanguage = normalizeSummaryLanguage(payload.summaryLanguage || aiConfig.summaryLanguage || "");
            const itemType = String(payload.type || "prompt");
            const content = String(payload.content || "").trim();
            const requestConfig = payload.requestConfig && typeof payload.requestConfig === "object" ? payload.requestConfig : {};

            if (!apiKey) {
                throw new Error("Missing apiKey");
            }
            if (!baseUrl) {
                throw new Error("Invalid baseUrl. Use an http(s) URL.");
            }
            if (!content) {
                throw new Error("Missing content");
            }

            const userPrompt = [
                `Summarize this ${itemType} in one concise line.`,
                "Return plain text only (no markdown, no bullets).",
                buildItemSummaryLengthInstruction(summaryLength),
                buildSummaryLanguageInstruction(summaryLanguage, false),
                "Content:",
                content
            ].join("\n\n");

            const completion = await requestAiChatCompletion({
                apiKey,
                provider,
                model,
                baseUrl,
                maxAttempts: requestConfig.maxAttempts,
                timeoutMs: requestConfig.timeoutMs,
                maxTokens: requestConfig.maxTokens,
                temperature: requestConfig.temperature
            }, [
                { role: "system", content: "You are concise. Return plain text only." },
                { role: "user", content: userPrompt }
            ]);

            let summary = String(completion.content || "").trim();
            if (summary.startsWith("{") && summary.endsWith("}")) {
                try {
                    const parsed = parseSegmentSummaryJSON(summary);
                    summary = String(parsed.summary || parsed.title || summary).trim();
                }
                catch (error) {}
            }
            if (!summary) {
                throw new Error("Empty AI item summary response");
            }
            sendResponse({
                ok: true,
                summary: summary.slice(0, 320)
            });
        }
        catch (error) {
            const status = Number(error?.status) || 0;
            const provider = error?.provider || "";
            const baseUrl = error?.baseUrl || "";
            const model = error?.model || "";
            const hint = error?.hint || buildAiErrorHint(status, provider, baseUrl, model);
            sendResponse({
                ok: false,
                error: error?.message ? String(error.message) : "Unknown error",
                status: status,
                provider: provider,
                baseUrl: baseUrl,
                model: model,
                endpoint: error?.endpoint || "",
                hint: hint,
                retryAttempts: Number(error?.attempt) || 1
            });
        }
    })();

    return true;
});

chrome.storage.local.get({autoDetectedLocale: false}, function (result){
    if (!result.autoDetectedLocale){
        let acceptedLanguages = ["en", "zh_CN"]
        chrome.i18n.getAcceptLanguages(function (languages){
            console.log(languages)
            for (let lang of languages){
                lang = lang.replace("-", "_")
                if (acceptedLanguages.includes(lang)){
                    chrome.storage.local.set({lang: lang})
                    chrome.storage.local.set({autoDetectedLocale: true})
                    break;
                }
                else if (acceptedLanguages.includes(lang.split("_")[0])){
                    chrome.storage.local.set({lang: lang.split("_")[0]})
                    chrome.storage.local.set({autoDetectedLocale: true})
                    break;
                }
            }
        })
    }
})
