(function () {
  if (window.__cngNavSidebarLoaded) {
    return;
  }
  window.__cngNavSidebarLoaded = true;

  if (!window.chrome || !chrome.storage || !chrome.storage.local) {
    return;
  }

  function isSupportedChatPage() {
    var host = window.location.hostname;
    if (host !== 'chatgpt.com' && host !== 'chat.openai.com') {
      return false;
    }

    var path = window.location.pathname || '';
    if (path === '/' || path.startsWith('/c/') || path.startsWith('/chat') || path.startsWith('/g/')) {
      return true;
    }

    return false;
  }

  if (!isSupportedChatPage()) {
    return;
  }

  var SELECTOR_USER_PROMPT = '[data-message-author-role="user"]';
  var SELECTOR_ASSISTANT_PROMPT = '[data-message-author-role="assistant"]';
  var STORAGE_PREFIX = 'cng_nav_v1';
  var AI_CONFIG_STORAGE_KEY = 'cng_nav_ai_config_v1';
  var NAV_OPEN_BTN_POS_STORAGE_KEY = 'cng_nav_open_btn_pos_v1';
  var AI_SUMMARY_DEFAULT_MODEL = 'gpt-4.1-mini';
  var AI_SUMMARY_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
  var AI_SUMMARY_DEFAULT_PROVIDER = 'openai';
  var NAV_OPEN_DRAG_THRESHOLD = 6;
  var AI_PROVIDER_PRESETS = {
    openai: {
      label: 'OpenAI (ChatGPT)',
      shortLabel: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini'
    },
    qwen_cn: {
      label: 'Qwen (DashScope CN)',
      shortLabel: 'Qwen CN',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus'
    },
    qwen_intl: {
      label: 'Qwen (DashScope Intl)',
      shortLabel: 'Qwen Intl',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus'
    },
    qwen_us: {
      label: 'Qwen (DashScope US)',
      shortLabel: 'Qwen US',
      baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus'
    },
    qwen_coding_plan: {
      label: 'Qwen Coding Plan',
      shortLabel: 'Qwen Code',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      model: 'qwen3-coder-plus'
    },
    minimax: {
      label: 'MiniMax',
      shortLabel: 'MiniMax',
      baseUrl: 'https://api.minimax.io/v1',
      model: 'MiniMax-M2.5'
    },
    custom: {
      label: 'Custom OpenAI-compatible',
      shortLabel: 'Custom',
      baseUrl: '',
      model: ''
    }
  };
  var AI_PROVIDER_IDS = ['openai', 'qwen_cn', 'qwen_intl', 'qwen_us', 'qwen_coding_plan', 'minimax', 'custom'];
  var AI_SUMMARY_MAX_SEGMENT_PROMPTS = 20;
  var AI_SUMMARY_EDGE_PROMPTS = 4;
  var AI_SUMMARY_MAX_PROMPT_CHARS = 900;
  var AI_SUMMARY_MAX_TOTAL_CHARS = 12000;
  var AI_SUMMARY_LENGTH_DEFAULT = 'medium';
  var AI_SUMMARY_LENGTH_OPTIONS = ['short', 'medium', 'long'];
  var AI_SUMMARY_LANGUAGE_OPTIONS = ['zh', 'en'];
  var AI_ITEM_SUMMARY_MAX_ITEMS = 240;
  var AI_ITEM_SUMMARY_MAX_PROMPT_CHARS = 520;
  var PROMPT_DISPLAY_LIMIT_DEFAULT = 220;
  var MARKER_DISPLAY_LIMIT_DEFAULT = 220;
  var SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT = 180;
  var DISPLAY_LIMIT_MIN = 40;
  var DISPLAY_LIMIT_MAX = 1200;
  var MARKER_DEFAULT_COLOR = '#FACC15';
  var MAX_CONTEXT_LOCKS = 1500;
  var FALLBACK_SCROLL_UNIT = 220;
  var FALLBACK_MAX_REUSE_SCORE_SINGLE = 18;
  var FALLBACK_MAX_REUSE_SCORE_DUPLICATE = 6;
  var FALLBACK_MIN_SCORE_GAP_DUPLICATE = 1.4;
  var FALLBACK_CONTEXT_MATCH_BONUS = 8;
  var FALLBACK_CONTEXT_MISMATCH_PENALTY = 6;
  var FALLBACK_CONTEXT_BUCKET_BONUS = 2;
  var FALLBACK_SCROLL_BUCKET_SIZE = 1200;
  var TRANSITION_KEYWORDS = [
    'next',
    'new task',
    'instead',
    'switch',
    'another topic',
    'another one',
    'by the way',
    'meanwhile',
    '\u53e6\u5916',
    '\u63a5\u4e0b\u6765',
    '\u6362\u4e2a',
    '\u91cd\u65b0',
    '\u73b0\u5728',
    '\u7136\u540e',
    '\u518d\u6765',
    '\u987a\u4fbf'
  ];

  var STOP_WORDS = new Set([
    'the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'at', 'by', 'is', 'are', 'be',
    'this', 'that', 'it', 'as', 'from', 'can', 'could', 'would', 'should', 'we', 'you', 'i', 'our',
    'do', 'does', 'did', 'if', 'then', 'than', 'about', 'into', 'please', 'help', 'want', 'need',
    '\u6211', '\u4f60', '\u6211\u4eec', '\u4f60\u4eec', '\u7136\u540e', '\u73b0\u5728', '\u8fd9\u4e2a', '\u90a3\u4e2a', '\u4e00\u4e0b', '\u4e00\u4e2a', '\u53ef\u4ee5', '\u9700\u8981', '\u8bf7', '\u5e2e\u6211'
  ]);

  function detectDefaultSummaryLanguage() {
    var locale = String((navigator && navigator.language) || '').toLowerCase();
    return locale.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  var AI_SUMMARY_LANGUAGE_DEFAULT = detectDefaultSummaryLanguage();

  var state = {
    currentPath: window.location.pathname,
    conversationId: '',
    persistenceEnabled: false,
    prompts: [],
    promptCatalog: {},
    fallbackContextLocks: {},
    promptOrder: [],
    promptElements: new Map(),
    segments: [],
    pins: new Set(),
    notes: {},
    noteInputTimers: {},
    noteEditorOpen: new Set(),
    markers: {},
    markerOrder: [],
    markerSplitStarts: new Set(),
    manualSplitStarts: new Set(),
    customSegmentTitles: {},
    aiConfig: {
      enabled: false,
      apiKey: '',
      provider: AI_SUMMARY_DEFAULT_PROVIDER,
      model: AI_SUMMARY_DEFAULT_MODEL,
      baseUrl: AI_SUMMARY_DEFAULT_BASE_URL,
      summaryLength: AI_SUMMARY_LENGTH_DEFAULT,
      summaryLanguage: AI_SUMMARY_LANGUAGE_DEFAULT,
      itemSummaryEnabled: false,
      promptDisplayLimit: PROMPT_DISPLAY_LIMIT_DEFAULT,
      markerDisplayLimit: MARKER_DISPLAY_LIMIT_DEFAULT,
      segmentSummaryDisplayLimit: SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT
    },
    aiSegmentSummaries: {},
    aiSegmentErrors: {},
    aiPending: {},
    aiInFlight: {},
    aiQueueRunning: false,
    aiItemSummaries: {},
    aiItemErrors: {},
    aiItemPending: {},
    aiItemQueueRunning: false,
    query: '',
    pinnedOnly: false,
    activePromptId: '',
    activeEntryId: '',
    expandedSegments: new Set(),
    knownSegmentIds: new Set(),
    hidden: false,
    initialized: false,
    markerPlacement: {
      active: false,
      mode: 'idle',
      markerId: '',
      draftLabel: '',
      draftColor: MARKER_DEFAULT_COLOR
    },
    statNotice: '',
    noticeTimer: null,
    refreshTimer: null,
    saveTimer: null,
    navOpenBtnPos: null,
    navOpenBtnSuppressClick: false,
    sidebarScrollTop: 0,
    segmentScrollTops: {},
    segmentLayoutObserver: null,
    segmentLayoutResizeBound: false,
    segmentLayoutRaf: 0,
    isOffline: false,
    networkEventsBound: false,
    shortcutsBound: false,
    markerPlacementEventsBound: false,
    hoverPreviewBound: false,
    jumpDockBound: false,
    hoverPreviewTarget: null
  };

  function storageGet(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.get([key], function (result) {
        resolve(result[key] || null);
      });
    });
  }

  function storageSet(payload) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(payload, function () {
        resolve();
      });
    });
  }

  function storageKey(conversationId) {
    return STORAGE_PREFIX + ':' + conversationId;
  }

  function getAiProviderPreset(providerId) {
    var normalizedProvider = AI_PROVIDER_PRESETS[providerId] ? providerId : AI_SUMMARY_DEFAULT_PROVIDER;
    return AI_PROVIDER_PRESETS[normalizedProvider] || AI_PROVIDER_PRESETS[AI_SUMMARY_DEFAULT_PROVIDER];
  }

  function getAiProviderLabel(providerId, shortText) {
    var preset = getAiProviderPreset(providerId);
    return shortText ? preset.shortLabel : preset.label;
  }

  function inferAiProviderFromBaseUrl(rawBaseUrl) {
    var normalizedBaseUrl = normalizeAiBaseUrl(rawBaseUrl || '');
    if (!normalizedBaseUrl) {
      return '';
    }

    var parsed;
    try {
      parsed = new URL(normalizedBaseUrl);
    } catch (error) {
      return '';
    }

    var host = String(parsed.hostname || '').toLowerCase();
    if (host === 'api.openai.com') {
      return 'openai';
    }
    if (host === 'dashscope.aliyuncs.com') {
      return 'qwen_cn';
    }
    if (host === 'dashscope-intl.aliyuncs.com') {
      return 'qwen_intl';
    }
    if (host === 'dashscope-us.aliyuncs.com') {
      return 'qwen_us';
    }
    if (host === 'coding-intl.dashscope.aliyuncs.com') {
      return 'qwen_coding_plan';
    }
    if (host === 'coding.dashscope.aliyuncs.com') {
      return 'qwen_coding_plan';
    }
    if (host === 'api.minimax.io' || host === 'api.minimax.com' || host === 'api.minimaxi.com') {
      return 'minimax';
    }
    if (/\.dashscope\.aliyuncs\.com$/i.test(host)) {
      if (host.indexOf('coding') !== -1) {
        return 'qwen_coding_plan';
      }
      return 'qwen_intl';
    }

    return '';
  }

  function normalizeAiProvider(rawProvider, rawBaseUrl) {
    var providerInput = normalizeWhitespace(rawProvider || '').toLowerCase();
    var compactInput = providerInput.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    var aliasMap = {
      openai: 'openai',
      chatgpt: 'openai',
      qwen: 'qwen_cn',
      qwen_cn: 'qwen_cn',
      qwen_dashscope_cn: 'qwen_cn',
      dashscope: 'qwen_cn',
      dashscope_cn: 'qwen_cn',
      qwen_intl: 'qwen_intl',
      qwen_us: 'qwen_us',
      qwen_dashscope_intl: 'qwen_intl',
      qwen_dashscope_us: 'qwen_us',
      dashscope_intl: 'qwen_intl',
      dashscope_us: 'qwen_us',
      qwen_coding_plan: 'qwen_coding_plan',
      qwen_coding: 'qwen_coding_plan',
      qwen_code: 'qwen_coding_plan',
      minimax: 'minimax',
      minimax_coding_plan: 'minimax',
      minimax_code: 'minimax',
      codingplan: 'qwen_coding_plan',
      coding_plan: 'qwen_coding_plan',
      custom: 'custom',
      openai_compatible: 'custom'
    };
    var numberedMap = {
      '1': 'openai',
      '2': 'qwen_cn',
      '3': 'qwen_intl',
      '4': 'qwen_us',
      '5': 'qwen_coding_plan',
      '6': 'minimax',
      '7': 'custom',
      '8': 'custom'
    };

    if (numberedMap[providerInput]) {
      return numberedMap[providerInput];
    }
    if (aliasMap[providerInput]) {
      return aliasMap[providerInput];
    }
    if (aliasMap[compactInput]) {
      return aliasMap[compactInput];
    }

    var inferred = inferAiProviderFromBaseUrl(rawBaseUrl || '');
    if (inferred) {
      return inferred;
    }

    if (normalizeWhitespace(rawBaseUrl || '')) {
      return 'custom';
    }

    return AI_SUMMARY_DEFAULT_PROVIDER;
  }

  function buildAiProviderPromptText(currentProvider) {
    var current = normalizeAiProvider(currentProvider || AI_SUMMARY_DEFAULT_PROVIDER, '');
    var lines = ['AI provider preset (enter number or id):'];
    for (var i = 0; i < AI_PROVIDER_IDS.length; i += 1) {
      var providerId = AI_PROVIDER_IDS[i];
      lines.push((i + 1) + ') ' + getAiProviderLabel(providerId, false) + ' [' + providerId + ']');
    }
    lines.push('Current: ' + current);
    lines.push('Note: custom endpoint requires manifest host permission.');
    return lines.join('\n');
  }

  function normalizeAiBaseUrl(rawBaseUrl) {
    var normalized = normalizeWhitespace(rawBaseUrl || '');
    if (!normalized) {
      return '';
    }

    var parsed;
    try {
      parsed = new URL(normalized);
    } catch (error) {
      return '';
    }

    var protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return '';
    }

    var normalizedHref = parsed.href
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/text\/chatcompletion_v2$/i, '');
    var normalizedParsed;
    try {
      normalizedParsed = new URL(normalizedHref);
    } catch (error) {
      return '';
    }
    var pathname = String(normalizedParsed.pathname || '');
    if (!pathname || pathname === '/') {
      return normalizedHref + '/v1';
    }

    return normalizedHref;
  }

  function sanitizeApiKey(rawValue) {
    var value = String(rawValue || '');
    value = value
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .trim();
    if (value.indexOf(' ') !== -1 || value.indexOf('\t') !== -1) {
      value = value.replace(/\s+/g, '');
    }
    return value;
  }

  function normalizeSummaryLanguageValue(rawValue) {
    var normalized = normalizeWhitespace(rawValue || '').toLowerCase();
    if (normalized === 'zh' || normalized === 'en') {
      return normalized;
    }
    return AI_SUMMARY_LANGUAGE_DEFAULT;
  }

  function normalizeDisplayLimitValue(rawValue, fallback) {
    var safeFallback = clampNumber(Number(fallback), DISPLAY_LIMIT_MIN, DISPLAY_LIMIT_MAX, DISPLAY_LIMIT_MIN);
    var parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return Math.round(safeFallback);
    }
    return Math.round(clampNumber(parsed, DISPLAY_LIMIT_MIN, DISPLAY_LIMIT_MAX, safeFallback));
  }

  function buildHostPermissionOrigin(baseUrl) {
    var normalized = normalizeAiBaseUrl(baseUrl || '');
    if (!normalized) {
      return '';
    }
    var parsed;
    try {
      parsed = new URL(normalized);
    } catch (error) {
      return '';
    }
    if (!parsed.protocol || !parsed.host) {
      return '';
    }
    return parsed.protocol + '//' + parsed.host + '/*';
  }

  function hasHostPermission(originPattern) {
    return new Promise(function (resolve) {
      if (!originPattern || !chrome.permissions || !chrome.permissions.contains) {
        resolve(true);
        return;
      }
      chrome.permissions.contains({ origins: [originPattern] }, function (granted) {
        resolve(Boolean(granted));
      });
    });
  }

  function requestHostPermission(originPattern) {
    return new Promise(function (resolve) {
      if (!originPattern || !chrome.permissions || !chrome.permissions.request) {
        resolve(true);
        return;
      }
      chrome.permissions.request({ origins: [originPattern] }, function (granted) {
        resolve(Boolean(granted));
      });
    });
  }

  async function ensureAiHostPermission(baseUrl, requestIfNeeded) {
    var originPattern = buildHostPermissionOrigin(baseUrl);
    if (!originPattern) {
      return { ok: false, reason: 'Invalid AI base URL.' };
    }
    if (chrome.runtime && chrome.runtime.sendMessage) {
      try {
        var remote = await sendRuntimeMessage({
          type: 'gptgps_ai_ensure_host_permission',
          payload: {
            origin: originPattern,
            requestIfNeeded: Boolean(requestIfNeeded)
          }
        });
        if (remote && typeof remote.ok === 'boolean') {
          return remote;
        }
      } catch (error) {}
    }
    var granted = await hasHostPermission(originPattern);
    if (granted) {
      return { ok: true, origin: originPattern };
    }
    if (!requestIfNeeded) {
      return { ok: false, reason: 'Missing host permission for ' + originPattern };
    }
    var requested = await requestHostPermission(originPattern);
    if (!requested) {
      return { ok: false, reason: 'Host permission was denied for ' + originPattern };
    }
    return { ok: true, origin: originPattern };
  }

  function normalizeAiConfig(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var normalizedApiKey = sanitizeApiKey(source.apiKey || '');
    var rawBaseUrl = normalizeWhitespace(source.baseUrl || '');
    var provider = normalizeAiProvider(source.provider || '', rawBaseUrl);
    var providerPreset = getAiProviderPreset(provider);
    var defaultModel = providerPreset.model || AI_SUMMARY_DEFAULT_MODEL;
    var defaultBaseUrl = providerPreset.baseUrl || AI_SUMMARY_DEFAULT_BASE_URL;
    var model = normalizeWhitespace(source.model || '') || defaultModel;
    var baseUrl = rawBaseUrl ? normalizeAiBaseUrl(rawBaseUrl) : '';
    var summaryLengthRaw = normalizeWhitespace(source.summaryLength || '').toLowerCase();
    var summaryLength = AI_SUMMARY_LENGTH_OPTIONS.indexOf(summaryLengthRaw) !== -1
      ? summaryLengthRaw
      : AI_SUMMARY_LENGTH_DEFAULT;
    var summaryLanguage = normalizeSummaryLanguageValue(source.summaryLanguage || '');
    var itemSummaryEnabled = Boolean(source.itemSummaryEnabled);
    var promptDisplayLimit = normalizeDisplayLimitValue(source.promptDisplayLimit, PROMPT_DISPLAY_LIMIT_DEFAULT);
    var markerDisplayLimit = normalizeDisplayLimitValue(source.markerDisplayLimit, MARKER_DISPLAY_LIMIT_DEFAULT);
    var segmentSummaryDisplayLimit = normalizeDisplayLimitValue(
      source.segmentSummaryDisplayLimit,
      SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT
    );
    if (!baseUrl) {
      baseUrl = normalizeAiBaseUrl(defaultBaseUrl) || AI_SUMMARY_DEFAULT_BASE_URL;
    }
    return {
      enabled: Boolean(source.enabled) && Boolean(normalizedApiKey),
      apiKey: normalizedApiKey,
      provider: provider,
      model: model,
      baseUrl: baseUrl,
      summaryLength: summaryLength,
      summaryLanguage: summaryLanguage,
      itemSummaryEnabled: itemSummaryEnabled,
      promptDisplayLimit: promptDisplayLimit,
      markerDisplayLimit: markerDisplayLimit,
      segmentSummaryDisplayLimit: segmentSummaryDisplayLimit
    };
  }

  function buildAiConfigFingerprint(config) {
    var normalized = normalizeAiConfig(config || {});
    return [
      normalized.enabled ? '1' : '0',
      normalized.provider || '',
      normalized.model || '',
      normalized.baseUrl || '',
      normalized.summaryLength || AI_SUMMARY_LENGTH_DEFAULT,
      normalizeSummaryLanguageValue(normalized.summaryLanguage || ''),
      normalized.itemSummaryEnabled ? '1' : '0',
      normalized.apiKey ? textHash(normalized.apiKey) : ''
    ].join('|');
  }

  function normalizeAiSegmentSummaries(raw) {
    var normalized = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return normalized;
    }

    Object.keys(raw).forEach(function (key) {
      var item = raw[key];
      if (!item || typeof item !== 'object') {
        return;
      }

      var fingerprint = normalizeWhitespace(item.fingerprint || key);
      if (!fingerprint) {
        return;
      }

      var title = normalizeWhitespace(item.title || item.segmentTitle || item.aiTitle || '');
      var summary = normalizeWhitespace(item.summary || item.segmentSummary || item.text || item.aiSummary || '');
      if (!title && !summary) {
        return;
      }

      var updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
      var fallback = Boolean(item.fallback);
      normalized[fingerprint] = {
        fingerprint: fingerprint,
        title: title,
        summary: summary,
        fallback: fallback,
        updatedAt: updatedAt
      };
    });

    return normalized;
  }

  function normalizeAiItemSummaries(raw) {
    var normalized = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return normalized;
    }

    Object.keys(raw).forEach(function (entryId) {
      var item = raw[entryId];
      if (!item || typeof item !== 'object') {
        return;
      }

      var fingerprint = normalizeWhitespace(item.fingerprint || '');
      var summary = normalizeWhitespace(item.summary || item.text || '');
      if (!summary) {
        return;
      }

      normalized[entryId] = {
        fingerprint: fingerprint,
        summary: summary,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0
      };
    });

    return normalized;
  }

  function isAiSummaryEnabled() {
    return Boolean(state.aiConfig && state.aiConfig.enabled && normalizeWhitespace(state.aiConfig.apiKey || ''));
  }

  function isAiItemSummaryEnabled() {
    return isAiSummaryEnabled() && Boolean(state.aiConfig && state.aiConfig.itemSummaryEnabled);
  }

  function getCurrentAiItemFingerprint(entryId) {
    if (!entryId) {
      return '';
    }

    var marker = getMarkerById(entryId);
    if (marker) {
      var markerContent = buildAiItemContentFromMarker(marker);
      if (!markerContent) {
        return '';
      }
      return buildFallbackFingerprint('marker|' + entryId + '|' + markerContent);
    }

    var prompt = getPromptById(entryId);
    if (prompt) {
      var promptContent = buildAiItemContentFromPrompt(prompt);
      if (!promptContent) {
        return '';
      }
      return buildFallbackFingerprint('prompt|' + entryId + '|' + promptContent);
    }

    return '';
  }

  function getAiItemSummaryText(entryId) {
    if (!isAiItemSummaryEnabled() || !entryId) {
      return '';
    }
    if (state.aiItemPending && state.aiItemPending[entryId]) {
      return '';
    }
    if (state.aiItemErrors && state.aiItemErrors[entryId]) {
      return '';
    }
    var record = state.aiItemSummaries && state.aiItemSummaries[entryId];
    var summary = normalizeWhitespace(record && record.summary);
    if (!summary) {
      return '';
    }
    var expectedFingerprint = getCurrentAiItemFingerprint(entryId);
    if (expectedFingerprint && isAiItemSummaryRecordStale(record, expectedFingerprint)) {
      return '';
    }
    return summary;
  }

  function getPrimaryPromptDisplayText(prompt) {
    if (!prompt) {
      return '';
    }
    var aiSummaryText = getAiItemSummaryText(prompt.id);
    return aiSummaryText || normalizeWhitespace(prompt.text || '');
  }

  function getPrimaryMarkerDisplayText(marker) {
    if (!marker) {
      return '';
    }
    var aiSummaryText = getAiItemSummaryText(marker.id);
    return aiSummaryText || normalizeWhitespace(marker.label || 'Checkpoint');
  }

  function clearAiPending() {
    state.aiPending = {};
  }

  function clearAiInFlight() {
    state.aiInFlight = {};
  }

  function clearAiItemPending() {
    state.aiItemPending = {};
  }

  function getAiPendingCount() {
    return Object.keys(state.aiPending || {}).length;
  }

  function getAiInFlightCount() {
    return Object.keys(state.aiInFlight || {}).length;
  }

  function getAiItemPendingCount() {
    return Object.keys(state.aiItemPending || {}).length;
  }

  function enqueueAiPending(task) {
    if (!task || !task.fingerprint) {
      return;
    }

    if (!state.aiPending || typeof state.aiPending !== 'object' || Array.isArray(state.aiPending)) {
      state.aiPending = {};
    }

    var existing = state.aiPending[task.fingerprint];
    if (existing && existing.fingerprint) {
      state.aiPending[task.fingerprint] = Object.assign({}, existing, task, {
        force: Boolean(existing.force || task.force)
      });
      return;
    }

    state.aiPending[task.fingerprint] = task;
  }

  function enqueueAiItemPending(task) {
    if (!task || !task.entryId || !task.fingerprint) {
      return;
    }

    if (!state.aiItemPending || typeof state.aiItemPending !== 'object' || Array.isArray(state.aiItemPending)) {
      state.aiItemPending = {};
    }

    var existing = state.aiItemPending[task.entryId];
    if (existing && existing.entryId) {
      state.aiItemPending[task.entryId] = Object.assign({}, existing, task, {
        force: Boolean(existing.force || task.force)
      });
      return;
    }

    state.aiItemPending[task.entryId] = task;
  }

  function dequeueAiPending() {
    if (!state.aiPending || typeof state.aiPending !== 'object' || Array.isArray(state.aiPending)) {
      state.aiPending = {};
      return null;
    }

    var fingerprints = Object.keys(state.aiPending);
    if (!fingerprints.length) {
      return null;
    }

    var fingerprint = fingerprints[0];
    var task = state.aiPending[fingerprint];
    delete state.aiPending[fingerprint];

    if (task && task.fingerprint) {
      return task;
    }

    return findAiTaskByFingerprint(fingerprint);
  }

  function dequeueAiItemPending() {
    if (!state.aiItemPending || typeof state.aiItemPending !== 'object' || Array.isArray(state.aiItemPending)) {
      state.aiItemPending = {};
      return null;
    }

    var entryIds = Object.keys(state.aiItemPending);
    if (!entryIds.length) {
      return null;
    }

    var entryId = entryIds[0];
    var task = state.aiItemPending[entryId];
    delete state.aiItemPending[entryId];
    return task || null;
  }

  function updateAiButtonState() {
    var aiBtn = document.getElementById('cng-nav-ai');
    if (!aiBtn) {
      return;
    }

    var provider = normalizeAiProvider(state.aiConfig && state.aiConfig.provider, state.aiConfig && state.aiConfig.baseUrl);
    var providerShort = getAiProviderLabel(provider, true);
    if (isAiSummaryEnabled()) {
      aiBtn.textContent = 'AI On (' + providerShort + ')';
      aiBtn.title = 'AI summary enabled (' + providerShort + ', ' + (state.aiConfig.model || AI_SUMMARY_DEFAULT_MODEL) + ')';
    } else {
      aiBtn.textContent = 'AI Off';
      aiBtn.title = 'Configure AI summary (' + providerShort + ')';
    }
  }

  async function loadAiConfig() {
    var saved = await storageGet(AI_CONFIG_STORAGE_KEY);
    state.aiConfig = normalizeAiConfig(saved);
    updateAiButtonState();
  }

  function persistAiConfig() {
    var payload = {};
    payload[AI_CONFIG_STORAGE_KEY] = state.aiConfig;
    return storageSet(payload);
  }

  function normalizeNavOpenBtnPos(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    var x = Number(raw.x);
    var y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x: x, y: y };
  }

  function normalizeSegmentScrollTops(raw) {
    var normalized = {};
    if (!raw || typeof raw !== 'object') {
      return normalized;
    }
    Object.keys(raw).forEach(function (segmentId) {
      var value = Number(raw[segmentId]);
      if (!segmentId || !Number.isFinite(value) || value < 0) {
        return;
      }
      normalized[segmentId] = Math.floor(value);
    });
    return normalized;
  }

  function clampNavOpenBtnPos(pos, button) {
    if (!pos || !button) {
      return null;
    }

    var width = Math.max(48, button.offsetWidth || 72);
    var height = Math.max(32, button.offsetHeight || 34);
    var minX = 6;
    var minY = 6;
    var maxX = Math.max(minX, window.innerWidth - width - 6);
    var maxY = Math.max(minY, window.innerHeight - height - 6);

    var x = Math.min(maxX, Math.max(minX, Number(pos.x)));
    var y = Math.min(maxY, Math.max(minY, Number(pos.y)));
    return { x: x, y: y };
  }

  function applyNavOpenBtnPos(button, pos) {
    if (!button) {
      return;
    }

    var clamped = clampNavOpenBtnPos(pos, button);
    if (!clamped) {
      button.style.left = '';
      button.style.top = '';
      button.style.right = '';
      button.style.bottom = '';
      state.navOpenBtnPos = null;
      return;
    }

    button.style.left = clamped.x + 'px';
    button.style.top = clamped.y + 'px';
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    state.navOpenBtnPos = clamped;
  }

  async function loadNavOpenBtnPos() {
    var saved = await storageGet(NAV_OPEN_BTN_POS_STORAGE_KEY);
    state.navOpenBtnPos = normalizeNavOpenBtnPos(saved);
  }

  function persistNavOpenBtnPos() {
    var payload = {};
    payload[NAV_OPEN_BTN_POS_STORAGE_KEY] = state.navOpenBtnPos;
    return storageSet(payload);
  }

  function getStableConversationId() {
    function isLikelyConversationId(value) {
      return /^[A-Za-z0-9_-]{8,}$/.test(value || '');
    }

    var bridgedConversationId = document.getElementById('conversationID') && document.getElementById('conversationID').value;
    if (bridgedConversationId && isLikelyConversationId(bridgedConversationId)) {
      return bridgedConversationId;
    }

    var segments = window.location.pathname.split('/').filter(Boolean);

    // Priority path patterns: /c/<id> or /chat/<id> anywhere in the path.
    for (var i = 0; i < segments.length - 1; i += 1) {
      var marker = (segments[i] || '').toLowerCase();
      var nextSeg = segments[i + 1];
      if ((marker === 'c' || marker === 'chat') && isLikelyConversationId(nextSeg)) {
        return nextSeg;
      }
    }

    // Generic fallback: score path segments and choose the most conversation-like candidate.
    var blockedSegments = new Set([
      'c', 'chat', 'g', 'model', 'models', 'new', 'share', 'settings', 'account', 'prompt', 'prompts',
      'workspace', 'workspaces', 'projects', 'project', 'library', 'explore', 'api', 'auth', 'login'
    ]);

    var bestCandidate = null;
    var bestScore = -Number.POSITIVE_INFINITY;

    for (var idx = 0; idx < segments.length; idx += 1) {
      var seg = segments[idx];
      var lower = (seg || '').toLowerCase();
      if (!isLikelyConversationId(seg)) {
        continue;
      }
      if (blockedSegments.has(lower)) {
        continue;
      }

      var prev = idx > 0 ? (segments[idx - 1] || '').toLowerCase() : '';
      if (prev === 'g') {
        // Avoid treating GPT id in /g/<gpt-id> as conversation id.
        continue;
      }

      var score = 0;
      if (seg.length >= 28) {
        score += 4;
      } else if (seg.length >= 16) {
        score += 3;
      } else {
        score += 1;
      }

      if (/[-_]/.test(seg)) {
        score += 2;
      }
      if (/[a-z]/.test(seg) && /[0-9]/.test(seg)) {
        score += 2;
      }
      if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(seg)) {
        score += 3;
      }
      if (/^[0-9]+$/.test(seg)) {
        score -= 4;
      }
      if (prev === 'c' || prev === 'chat') {
        score += 6;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = seg;
      }
    }

    return bestCandidate || null;
  }

  async function loadConversationState() {
    state.conversationId = getStableConversationId();
    state.persistenceEnabled = Boolean(state.conversationId);

    if (!state.persistenceEnabled) {
      state.pins = new Set();
      state.notes = {};
      state.noteEditorOpen = new Set();
      state.noteInputTimers = {};
      state.markers = {};
      state.markerOrder = [];
      state.markerSplitStarts = new Set();
      state.manualSplitStarts = new Set();
      state.customSegmentTitles = {};
      state.promptCatalog = {};
      state.fallbackContextLocks = {};
      state.promptOrder = [];
      state.aiSegmentSummaries = {};
      state.aiSegmentErrors = {};
      state.aiItemSummaries = {};
      state.aiItemErrors = {};
      clearAiPending();
      clearAiInFlight();
      clearAiItemPending();
      state.expandedSegments = new Set();
      state.knownSegmentIds = new Set();
      state.sidebarScrollTop = 0;
      state.segmentScrollTops = {};
      state.pinnedOnly = false;
      state.initialized = true;
      return;
    }

    var saved = await storageGet(storageKey(state.conversationId));

    state.pins = new Set(saved && Array.isArray(saved.pins) ? saved.pins : []);
    state.notes = saved && saved.notes && typeof saved.notes === 'object' ? saved.notes : {};
    state.noteEditorOpen = new Set();
    state.markers = saved && saved.markers && typeof saved.markers === 'object' ? saved.markers : {};
    state.markerOrder = saved && Array.isArray(saved.markerOrder) ? saved.markerOrder : Object.keys(state.markers);
    state.markerSplitStarts = new Set(saved && Array.isArray(saved.markerSplitStarts) ? saved.markerSplitStarts : []);
    state.manualSplitStarts = new Set(saved && Array.isArray(saved.manualSplitStarts) ? saved.manualSplitStarts : []);
    state.customSegmentTitles = saved && saved.customSegmentTitles && typeof saved.customSegmentTitles === 'object' ? saved.customSegmentTitles : {};
    state.promptCatalog = saved && saved.promptCatalog && typeof saved.promptCatalog === 'object' ? saved.promptCatalog : {};
    state.fallbackContextLocks = saved && saved.fallbackContextLocks && typeof saved.fallbackContextLocks === 'object' ? saved.fallbackContextLocks : {};
    state.aiSegmentSummaries = normalizeAiSegmentSummaries(saved && saved.aiSegmentSummaries);
    state.aiSegmentErrors = {};
    state.aiItemSummaries = normalizeAiItemSummaries(saved && saved.aiItemSummaries);
    state.aiItemErrors = {};
    clearAiPending();
    clearAiInFlight();
    clearAiItemPending();

    if (saved && Array.isArray(saved.promptOrder)) {
      state.promptOrder = saved.promptOrder.filter(function (promptId) {
        return Boolean(state.promptCatalog[promptId]);
      });
    } else {
      state.promptOrder = Object.keys(state.promptCatalog);
    }

    if (saved && Array.isArray(saved.expandedSegments) && saved.expandedSegments.length) {
      state.expandedSegments = new Set(saved.expandedSegments);
    } else {
      state.expandedSegments = new Set();
    }
    state.knownSegmentIds = new Set(state.expandedSegments);
    state.pinnedOnly = Boolean(saved && saved.pinnedOnly);
    state.sidebarScrollTop = Math.max(0, Number((saved && saved.sidebarScrollTop) || 0) || 0);
    state.segmentScrollTops = normalizeSegmentScrollTops(saved && saved.segmentScrollTops);
    state.activeEntryId = normalizeWhitespace((saved && saved.activeEntryId) || '');
    sortMarkerOrderByPosition();

    state.initialized = true;
  }

  function persistConversationState() {
    if (!state.initialized || !state.persistenceEnabled || !state.conversationId) {
      return;
    }

    var conversationIdAtSchedule = state.conversationId;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (!state.persistenceEnabled || !state.conversationId) {
        return;
      }
      if (state.conversationId !== conversationIdAtSchedule) {
        return;
      }

      var payload = {
        pins: Array.from(state.pins),
        notes: state.notes,
        markers: state.markers,
        markerOrder: state.markerOrder,
        markerSplitStarts: Array.from(state.markerSplitStarts),
        manualSplitStarts: Array.from(state.manualSplitStarts),
        customSegmentTitles: state.customSegmentTitles,
        promptCatalog: state.promptCatalog,
        fallbackContextLocks: state.fallbackContextLocks,
        promptOrder: state.promptOrder,
        expandedSegments: Array.from(state.expandedSegments),
        sidebarScrollTop: Math.max(0, Number(state.sidebarScrollTop || 0) || 0),
        segmentScrollTops: normalizeSegmentScrollTops(state.segmentScrollTops),
        activeEntryId: normalizeWhitespace(state.activeEntryId || ''),
        aiSegmentSummaries: state.aiSegmentSummaries,
        aiItemSummaries: state.aiItemSummaries,
        pinnedOnly: state.pinnedOnly,
        updatedAt: Date.now()
      };

      var data = {};
      data[storageKey(conversationIdAtSchedule)] = payload;
      storageSet(data);
    }, 220);
  }

  function normalizeWhitespace(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isNetworkOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  function tokenize(text) {
    var cleaned = (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return [];
    }

    var rawParts = cleaned.split(' ');
    var tokens = [];

    for (var i = 0; i < rawParts.length; i += 1) {
      var part = rawParts[i];
      if (!part) {
        continue;
      }

      if (/^[\u4e00-\u9fff]{5,}$/.test(part)) {
        for (var j = 0; j < part.length - 1; j += 1) {
          tokens.push(part.slice(j, j + 2));
        }
        continue;
      }

      tokens.push(part);
    }

    return tokens;
  }

  function textHash(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function buildFallbackFingerprint(text) {
    var normalized = normalizeWhitespace(text || '');
    if (!normalized) {
      return '';
    }

    var prefix = normalized.slice(0, 180);
    var suffix = normalized.length > 180 ? normalized.slice(-90) : '';
    return textHash(prefix + '|' + suffix + '|l' + normalized.length);
  }

  function buildPromptHintHash(text) {
    var normalized = normalizeWhitespace(text || '');
    if (!normalized) {
      return 'none';
    }

    if (normalized.length <= 72) {
      return textHash(normalized);
    }

    return textHash(normalized.slice(0, 48) + '|' + normalized.slice(-24));
  }

  function buildFallbackContextKey(fingerprint, prevHintHash, nextHintHash) {
    return fingerprint + '|p' + (prevHintHash || 'none') + '|n' + (nextHintHash || 'none');
  }

  function buildFallbackContextBucketKey(contextKey, scrollTop, bucketSize) {
    var safeBucket = Math.max(1, bucketSize || 1);
    var bucket = Math.floor((scrollTop || 0) / safeBucket);
    return contextKey + '|b' + bucket;
  }

  function shouldUpdateContextLock(contextLocks, contextKey, lockHit, lowConfidenceContextReuse, reused) {
    if (!contextKey || !contextLocks) {
      return false;
    }

    var hasExistingLock = Object.prototype.hasOwnProperty.call(contextLocks, contextKey) && Boolean(contextLocks[contextKey]);
    if (lockHit) {
      return true;
    }

    if (lowConfidenceContextReuse) {
      return !hasExistingLock;
    }

    if (reused) {
      return true;
    }

    return !hasExistingLock;
  }
  function appendToIndex(map, key, promptId) {
    if (!key) {
      return;
    }
    var list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(promptId);
  }

  function buildFallbackCatalogIndex() {
    var index = {
      byFingerprint: new Map(),
      byContextKey: new Map(),
      byContextBucket: new Map()
    };

    for (var i = 0; i < state.promptOrder.length; i += 1) {
      var promptId = state.promptOrder[i];
      var stored = state.promptCatalog[promptId];
      if (!stored || !stored.text) {
        continue;
      }

      var isFallbackId = promptId.indexOf('fb-') === 0 || promptId.indexOf('idx-') === 0;
      var fingerprint = stored.fingerprint || (isFallbackId ? buildFallbackFingerprint(stored.text) : '');
      if (!fingerprint) {
        continue;
      }

      appendToIndex(index.byFingerprint, fingerprint, promptId);
      appendToIndex(index.byContextKey, stored.fallbackContextKey, promptId);
      appendToIndex(index.byContextBucket, stored.fallbackContextBucket, promptId);
    }

    return index;
  }

  function createFallbackPromptId(fingerprint, fallbackContext, seedCount) {
    var createdCount = (fallbackContext.newCounts.get(fingerprint) || 0) + 1;
    fallbackContext.newCounts.set(fingerprint, createdCount);

    var suffix = (seedCount || 0) + createdCount;
    var fallbackId = 'fb-' + fingerprint + '-' + suffix;
    while (state.promptCatalog[fallbackId] || fallbackContext.usedIds.has(fallbackId)) {
      suffix += 1;
      fallbackId = 'fb-' + fingerprint + '-' + suffix;
    }

    fallbackContext.usedIds.add(fallbackId);
    return fallbackId;
  }

  function scoreFallbackCandidate(stored, visibleOrder, contextMeta, fallbackContext) {
    var seenOrder = stored && typeof stored.lastSeenVisibleOrder === 'number' ? stored.lastSeenVisibleOrder : null;
    var seenScrollTop = stored && typeof stored.lastSeenScrollTop === 'number' ? stored.lastSeenScrollTop : null;
    var hasOrder = seenOrder !== null;
    var hasScroll = seenScrollTop !== null;
    var contextMatched = Boolean(stored && stored.fallbackContextKey && stored.fallbackContextKey === contextMeta.contextKey);
    var contextMismatch = Boolean(stored && stored.fallbackContextKey && stored.fallbackContextKey !== contextMeta.contextKey);
    var bucketMatched = Boolean(stored && stored.fallbackContextBucket && stored.fallbackContextBucket === contextMeta.contextBucket);

    var score = 0;
    if (hasOrder) {
      score += Math.abs(seenOrder - visibleOrder);
    } else {
      score += 24;
    }

    if (hasScroll) {
      score += Math.abs(seenScrollTop - fallbackContext.currentScrollTop) / fallbackContext.scrollUnit;
    } else {
      score += 24;
    }

    if (contextMatched) {
      score -= fallbackContext.contextMatchBonus;
    } else if (contextMismatch) {
      score += fallbackContext.contextMismatchPenalty;
    }

    if (bucketMatched) {
      score -= fallbackContext.contextBucketBonus;
    }

    return {
      score: score,
      hasOrder: hasOrder,
      hasScroll: hasScroll,
      contextMatched: contextMatched,
      bucketMatched: bucketMatched
    };
  }

  function resolveFallbackPromptId(fingerprint, visibleOrder, contextMeta, fallbackContext) {
    var candidates = fallbackContext.index.byFingerprint.get(fingerprint) || [];
    var contextCandidates = fallbackContext.index.byContextKey.get(contextMeta.contextKey) || [];
    var bestId = '';
    var bestScore = Number.POSITIVE_INFINITY;
    var secondBestScore = Number.POSITIVE_INFINITY;
    var bestMeta = null;

    var lockedId = contextMeta.contextKey && fallbackContext.contextLocks
      ? fallbackContext.contextLocks[contextMeta.contextKey]
      : '';
    if (lockedId && !fallbackContext.usedIds.has(lockedId)) {
      var lockedStored = state.promptCatalog[lockedId];
      if (lockedStored) {
        var lockFingerprintMatch = lockedStored.fingerprint === fingerprint;
        var lockContextMatch = lockedStored.fallbackContextKey === contextMeta.contextKey;
        var prevHintConflict = Boolean(
          lockedStored.prevHintHash && contextMeta.prevHintHash && lockedStored.prevHintHash !== contextMeta.prevHintHash
        );
        var nextHintConflict = Boolean(
          lockedStored.nextHintHash && contextMeta.nextHintHash && lockedStored.nextHintHash !== contextMeta.nextHintHash
        );
        if (lockFingerprintMatch && lockContextMatch && !prevHintConflict && !nextHintConflict) {
          fallbackContext.usedIds.add(lockedId);
          return {
            id: lockedId,
            reused: true,
            confidence: 0.9,
            lockHit: true,
            lowConfidenceContextReuse: false
          };
        }
      }
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var candidateId = candidates[i];
      if (fallbackContext.usedIds.has(candidateId)) {
        continue;
      }

      var stored = state.promptCatalog[candidateId];
      var scored = scoreFallbackCandidate(stored, visibleOrder, contextMeta, fallbackContext);
      var score = scored.score;

      if (score < bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestId = candidateId;
        bestMeta = scored;
      } else if (score < secondBestScore) {
        secondBestScore = score;
      }
    }

    if (bestId) {
      var lowConfidence = false;
      if (candidates.length > 1) {
        if (!bestMeta || (!bestMeta.hasOrder && !bestMeta.hasScroll)) {
          lowConfidence = true;
        }
        if (bestScore > fallbackContext.maxReuseScoreDuplicate) {
          lowConfidence = true;
        }
        if ((secondBestScore - bestScore) < fallbackContext.minScoreGapDuplicate) {
          lowConfidence = true;
        }
      } else if (bestScore > fallbackContext.maxReuseScoreSingle) {
        lowConfidence = true;
      }

      if (!lowConfidence) {
        fallbackContext.usedIds.add(bestId);
        var confidence = 1 / (1 + Math.max(0, bestScore));
        return {
          id: bestId,
          reused: true,
          confidence: confidence,
          lockHit: false,
          lowConfidenceContextReuse: false
        };
      }
    }

    // Low-confidence branch: prefer converging on an existing context key instead of splitting endlessly.
    var bestContextId = '';
    var bestContextScore = Number.POSITIVE_INFINITY;
    for (var j = 0; j < contextCandidates.length; j += 1) {
      var contextId = contextCandidates[j];
      if (fallbackContext.usedIds.has(contextId)) {
        continue;
      }

      var contextStored = state.promptCatalog[contextId];
      if (!contextStored || contextStored.fingerprint !== fingerprint) {
        continue;
      }

      var contextScored = scoreFallbackCandidate(contextStored, visibleOrder, contextMeta, fallbackContext);
      if (contextScored.score < bestContextScore) {
        bestContextScore = contextScored.score;
        bestContextId = contextId;
      }
    }

    if (bestContextId) {
      fallbackContext.usedIds.add(bestContextId);
      return {
        id: bestContextId,
        reused: true,
        confidence: Math.max(0.26, 1 / (1 + Math.max(0, bestContextScore))),
        lockHit: false,
        lowConfidenceContextReuse: true
      };
    }

    return {
      id: createFallbackPromptId(fingerprint, fallbackContext, candidates.length),
      reused: false,
      confidence: 0,
      lockHit: false,
      lowConfidenceContextReuse: false
    };
  }

  function promptIdFromNode(node, text, visibleOrder, fallbackContext, contextHints) {
    var messageHost = node.closest('[data-message-id]');
    var messageId = (messageHost && messageHost.getAttribute('data-message-id')) || node.getAttribute('data-message-id');
    if (messageId) {
      var stableMessageId = 'mid-' + String(messageId).replace(/[^a-zA-Z0-9_-]/g, '-');
      fallbackContext.usedIds.add(stableMessageId);
      return {
        id: stableMessageId,
        fingerprint: null,
        reused: true,
        confidence: 1,
        lockHit: false,
        lowConfidenceContextReuse: false,
        contextKey: '',
        contextBucket: '',
        prevHintHash: '',
        nextHintHash: ''
      };
    }

    var article = node.closest('article');
    var dataTestId = (article && article.getAttribute('data-testid')) || node.getAttribute('data-testid');

    if (dataTestId && !/^conversation-turn-\d+$/i.test(String(dataTestId))) {
      var stableId = 'dt-' + dataTestId.replace(/[^a-zA-Z0-9_-]/g, '-');
      fallbackContext.usedIds.add(stableId);
      return {
        id: stableId,
        fingerprint: null,
        reused: true,
        confidence: 1,
        lockHit: false,
        lowConfidenceContextReuse: false,
        contextKey: '',
        contextBucket: '',
        prevHintHash: '',
        nextHintHash: ''
      };
    }

    var fingerprint = buildFallbackFingerprint(text);
    var contextKey = buildFallbackContextKey(fingerprint, contextHints.prevHintHash, contextHints.nextHintHash);
    var contextBucket = buildFallbackContextBucketKey(contextKey, fallbackContext.currentScrollTop, fallbackContext.scrollBucketSize);
    var contextMeta = {
      contextKey: contextKey,
      contextBucket: contextBucket,
      prevHintHash: contextHints.prevHintHash,
      nextHintHash: contextHints.nextHintHash
    };
    var resolved = resolveFallbackPromptId(fingerprint, visibleOrder, contextMeta, fallbackContext);
    return {
      id: resolved.id,
      fingerprint: fingerprint,
      reused: resolved.reused,
      confidence: resolved.confidence,
      lockHit: resolved.lockHit,
      lowConfidenceContextReuse: resolved.lowConfidenceContextReuse,
      contextKey: contextKey,
      contextBucket: contextBucket,
      prevHintHash: contextHints.prevHintHash,
      nextHintHash: contextHints.nextHintHash
    };
  }

  function getPromptText(node) {
    var raw = node.innerText || node.textContent || '';
    return normalizeWhitespace(raw);
  }

  function getAssistantTextForUserNode(node) {
    function collectAssistantText(root) {
      if (!root || !root.querySelectorAll) {
        return '';
      }
      var assistantNodes = root.querySelectorAll(SELECTOR_ASSISTANT_PROMPT);
      if (!assistantNodes || !assistantNodes.length) {
        return '';
      }
      var texts = [];
      for (var idx = 0; idx < assistantNodes.length; idx += 1) {
        var text = getPromptText(assistantNodes[idx]);
        if (text) {
          texts.push(text);
        }
      }
      return normalizeWhitespace(texts.join('\n\n'));
    }

    if (!node || !node.closest) {
      return '';
    }

    var turnHost = node.closest('[data-testid^="conversation-turn"]');
    var textInTurn = collectAssistantText(turnHost);
    if (textInTurn) {
      return textInTurn;
    }

    var articleHost = node.closest('article');
    var textInArticle = collectAssistantText(articleHost);
    if (textInArticle) {
      return textInArticle;
    }

    var cursor = turnHost || articleHost || node.closest('.group.w-full') || node.parentElement;
    var hops = 0;
    while (cursor && hops < 3) {
      cursor = cursor.nextElementSibling;
      hops += 1;
      if (!cursor) {
        break;
      }
      var textInSibling = collectAssistantText(cursor);
      if (textInSibling) {
        return textInSibling;
      }
    }

    return '';
  }

  function jumpTargetFromNode(node) {
    return (
      node.closest('[data-testid^="conversation-turn"]') ||
      node.closest('.group.w-full') ||
      node.closest('article') ||
      node.closest(SELECTOR_USER_PROMPT) ||
      node
    );
  }

  function clampNumber(value, min, max, fallback) {
    var num = Number(value);
    if (!Number.isFinite(num)) {
      return typeof fallback === 'number' ? fallback : min;
    }
    if (num < min) {
      return min;
    }
    if (num > max) {
      return max;
    }
    return num;
  }

  function hasTransitionSignal(text) {
    var lower = (text || '').toLowerCase();

    for (var i = 0; i < TRANSITION_KEYWORDS.length; i += 1) {
      if (lower.indexOf(TRANSITION_KEYWORDS[i]) !== -1) {
        return true;
      }
    }

    if (/^(now|next|new|instead|\u53e6\u5916|\u63a5\u4e0b\u6765|\u6362\u4e2a|\u91cd\u65b0|\u73b0\u5728|\u7136\u540e|\u518d\u6765)/i.test((text || '').trim())) {
      return true;
    }

    return false;
  }

  function jaccardScore(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) {
      return 0;
    }

    var setA = new Set(tokensA);
    var setB = new Set(tokensB);
    var inter = 0;

    setA.forEach(function (token) {
      if (setB.has(token)) {
        inter += 1;
      }
    });

    var union = setA.size + setB.size - inter;
    if (!union) {
      return 0;
    }

    return inter / union;
  }

  function shouldSplitSegment(previousPrompt, currentPrompt) {
    if (!previousPrompt) {
      return true;
    }

    if (hasTransitionSignal(currentPrompt.text)) {
      return true;
    }

    var similarity = jaccardScore(previousPrompt.tokens, currentPrompt.tokens);
    if (similarity < 0.16) {
      return true;
    }

    var lengthDiff = Math.abs((previousPrompt.text || '').length - (currentPrompt.text || '').length);
    if (similarity < 0.24 && lengthDiff > 220) {
      return true;
    }

    return false;
  }

  function shortText(text, maxLength) {
    var safe = normalizeWhitespace(text || '');
    if (safe.length <= maxLength) {
      return safe;
    }

    return safe.slice(0, maxLength - 1) + '...';
  }

  function buildSegmentSummary(promptCount, firstPromptText, lastPromptText, keywords) {
    var count = Number(promptCount) || 0;
    var countLabel = count + ' ' + (count === 1 ? 'prompt' : 'prompts');
    var firstSnippet = shortText(firstPromptText || 'Untitled', 20);
    var parts = [countLabel, firstSnippet];

    if (keywords) {
      parts.push(shortText(keywords, 14));
    }

    return shortText(parts.join(' | '), 56);
  }

  function buildKeywordSummary(texts) {
    var freq = new Map();
    var allTokens = tokenize(texts.join(' '));

    for (var i = 0; i < allTokens.length; i += 1) {
      var token = allTokens[i];
      if (token.length < 2 || STOP_WORDS.has(token)) {
        continue;
      }

      var old = freq.get(token) || 0;
      freq.set(token, old + 1);
    }

    var ranked = Array.from(freq.entries())
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 4)
      .map(function (entry) {
        return entry[0];
      });

    if (!ranked.length) {
      return '';
    }

    return ranked.join(' / ');
  }

  function buildSegmentTitle(firstPromptText) {
    var normalized = normalizeWhitespace(firstPromptText || '');
    return shortText(normalized || 'Untitled', 34);
  }

  function buildSegmentFingerprint(segmentPrompts) {
    if (!Array.isArray(segmentPrompts) || !segmentPrompts.length) {
      return '';
    }

    var combined = segmentPrompts
      .map(function (prompt) {
        if (!prompt) {
          return '';
        }
        var promptText = normalizeWhitespace(prompt.text || '');
        var assistantText = normalizeWhitespace(prompt.assistantText || '');
        if (!promptText && !assistantText) {
          return '';
        }
        if (!assistantText) {
          return promptText;
        }
        return promptText + '\nAssistant: ' + assistantText;
      })
      .filter(Boolean)
      .join('\n\n');

    return buildFallbackFingerprint(combined);
  }

  function getPromptFingerprint(promptId, fallbackText) {
    var stored = promptId ? state.promptCatalog[promptId] : null;
    var existing = stored && typeof stored.fingerprint === 'string' ? normalizeWhitespace(stored.fingerprint) : '';
    if (existing) {
      return existing;
    }
    return buildFallbackFingerprint(fallbackText || '');
  }

  function getAiSummaryTitle(record) {
    if (!record || typeof record !== 'object') {
      return '';
    }
    return normalizeWhitespace(record.title || record.segmentTitle || record.aiTitle || '');
  }

  function getAiSummaryText(record) {
    if (!record || typeof record !== 'object') {
      return '';
    }
    return normalizeWhitespace(record.summary || record.segmentSummary || record.text || record.aiSummary || '');
  }

  function getAiSummaryRecordByFingerprint(fingerprint) {
    if (!fingerprint || !state.aiSegmentSummaries || typeof state.aiSegmentSummaries !== 'object') {
      return null;
    }

    var record = state.aiSegmentSummaries[fingerprint];
    if (!record || typeof record !== 'object') {
      return null;
    }

    return record;
  }

  function isAiSummaryRecordStale(record, fingerprint) {
    if (!record || typeof record !== 'object') {
      return true;
    }
    if (Boolean(record.fallback)) {
      return true;
    }

    var savedFingerprint = normalizeWhitespace(record.fingerprint || '');
    if (savedFingerprint && fingerprint && savedFingerprint !== fingerprint) {
      return true;
    }

    var title = getAiSummaryTitle(record);
    var summary = getAiSummaryText(record);
    if (!title && !summary) {
      return true;
    }

    return false;
  }

  function isAiItemSummaryRecordStale(record, fingerprint) {
    if (!record || typeof record !== 'object') {
      return true;
    }
    var summary = normalizeWhitespace(record.summary || '');
    if (!summary) {
      return true;
    }
    var savedFingerprint = normalizeWhitespace(record.fingerprint || '');
    if (fingerprint && savedFingerprint && fingerprint !== savedFingerprint) {
      return true;
    }
    return false;
  }

  function getSegmentAiRuntimeStatus(segment) {
    if (!segment || !segment.fingerprint || !isAiSummaryEnabled()) {
      return null;
    }
    var fingerprint = segment.fingerprint;
    if (state.aiInFlight && state.aiInFlight[fingerprint]) {
      return {
        code: 'running',
        className: 'cng-ai-state-running',
        label: 'AI generating'
      };
    }
    if (state.aiPending && state.aiPending[fingerprint]) {
      return {
        code: 'queued',
        className: 'cng-ai-state-queued',
        label: 'AI queued'
      };
    }
    var errorRecord = state.aiSegmentErrors && state.aiSegmentErrors[fingerprint];
    if (errorRecord) {
      var fallbackRecord = getAiSummaryRecordByFingerprint(fingerprint);
      if (fallbackRecord && fallbackRecord.fallback) {
        return {
          code: 'fallback',
          className: 'cng-ai-state-fallback',
          label: 'AI fallback'
        };
      }
      return {
        code: 'failed',
        className: 'cng-ai-state-failed',
        label: 'AI failed'
      };
    }
    var summaryRecord = getAiSummaryRecordByFingerprint(fingerprint);
    if (!isAiSummaryRecordStale(summaryRecord, fingerprint)) {
      return {
        code: 'done',
        className: 'cng-ai-state-done',
        label: 'AI ready'
      };
    }
    return {
      code: 'waiting',
      className: 'cng-ai-state-waiting',
      label: 'AI waiting'
    };
  }

  function getOrderedPromptsFromCatalog() {
    var ordered = [];

    for (var i = 0; i < state.promptOrder.length; i += 1) {
      var promptId = state.promptOrder[i];
      var stored = state.promptCatalog[promptId];
      if (!stored || !stored.text) {
        continue;
      }

      ordered.push({
        id: promptId,
        index: ordered.length,
        text: stored.text,
        assistantText: normalizeWhitespace(stored.assistantText || ''),
        tokens: Array.isArray(stored.tokens) ? stored.tokens : tokenize(stored.text)
      });
    }

    return ordered;
  }

  function mergePromptOrderWithVisible(visiblePromptIds) {
    if (!Array.isArray(visiblePromptIds) || !visiblePromptIds.length) {
      return false;
    }

    var dedupedVisible = [];
    var visibleSet = new Set();
    for (var i = 0; i < visiblePromptIds.length; i += 1) {
      var id = visiblePromptIds[i];
      if (!id || visibleSet.has(id) || !state.promptCatalog[id]) {
        continue;
      }
      visibleSet.add(id);
      dedupedVisible.push(id);
    }
    if (!dedupedVisible.length) {
      return false;
    }

    var oldOrder = Array.isArray(state.promptOrder) ? state.promptOrder.filter(function (id) {
      return Boolean(id) && Boolean(state.promptCatalog[id]);
    }) : [];
    var oldIndexMap = new Map();
    for (var j = 0; j < oldOrder.length; j += 1) {
      oldIndexMap.set(oldOrder[j], j);
    }

    var insertionIndex = oldOrder.length;
    for (var k = 0; k < dedupedVisible.length; k += 1) {
      var oldIndex = oldIndexMap.get(dedupedVisible[k]);
      if (typeof oldIndex === 'number' && oldIndex < insertionIndex) {
        insertionIndex = oldIndex;
      }
    }
    if (insertionIndex < 0) {
      insertionIndex = 0;
    }
    if (insertionIndex > oldOrder.length) {
      insertionIndex = oldOrder.length;
    }

    var stripped = oldOrder.filter(function (id) {
      return !visibleSet.has(id);
    });
    var nextOrder = stripped
      .slice(0, insertionIndex)
      .concat(dedupedVisible)
      .concat(stripped.slice(insertionIndex));

    var catalogIds = Object.keys(state.promptCatalog || {});
    var nextSet = new Set(nextOrder);
    for (var idx = 0; idx < catalogIds.length; idx += 1) {
      var catalogId = catalogIds[idx];
      if (!nextSet.has(catalogId)) {
        nextSet.add(catalogId);
        nextOrder.push(catalogId);
      }
    }

    var changed = nextOrder.length !== state.promptOrder.length;
    if (!changed) {
      for (var p = 0; p < nextOrder.length; p += 1) {
        if (nextOrder[p] !== state.promptOrder[p]) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      state.promptOrder = nextOrder;
    }

    return changed;
  }

  function pruneLegacyTurnPromptIdsWhenModernExists() {
    if (!Array.isArray(state.promptOrder) || !state.promptOrder.length) {
      return false;
    }
    var modernFingerprints = new Set();
    for (var i = 0; i < state.promptOrder.length; i += 1) {
      var id = state.promptOrder[i];
      if (!id || /^dt-conversation-turn-\d+$/i.test(id)) {
        continue;
      }
      var modernStored = state.promptCatalog[id];
      if (!modernStored || !modernStored.fingerprint) {
        continue;
      }
      modernFingerprints.add(modernStored.fingerprint);
    }
    if (!modernFingerprints.size) {
      return false;
    }

    var changed = false;
    var nextOrder = [];
    for (var j = 0; j < state.promptOrder.length; j += 1) {
      var promptId = state.promptOrder[j];
      if (!promptId) {
        continue;
      }
      var isLegacy = /^dt-conversation-turn-\d+$/i.test(promptId);
      var legacyStored = state.promptCatalog[promptId];
      var hasModernPeer = Boolean(
        isLegacy &&
        legacyStored &&
        legacyStored.fingerprint &&
        modernFingerprints.has(legacyStored.fingerprint)
      );
      if (!hasModernPeer) {
        nextOrder.push(promptId);
        continue;
      }

      delete state.promptCatalog[promptId];
      state.pins.delete(promptId);
      delete state.notes[promptId];
      delete state.aiItemSummaries[promptId];
      delete state.aiItemErrors[promptId];
      state.noteEditorOpen.delete(promptId);
      if (state.activePromptId === promptId) {
        state.activePromptId = '';
      }
      state.manualSplitStarts.delete(promptId);
      state.markerSplitStarts.delete(promptId);
      delete state.customSegmentTitles[promptId];
      changed = true;
    }

    if (changed) {
      state.promptOrder = nextOrder;
    }
    return changed;
  }

  function shouldTreatDomPromptsAsAuthoritative(parsedPrompts, dedupedVisiblePromptIds) {
    var parsedCount = Array.isArray(parsedPrompts) ? parsedPrompts.length : 0;
    var visibleCount = Array.isArray(dedupedVisiblePromptIds) ? dedupedVisiblePromptIds.length : 0;
    if (!parsedCount || !visibleCount) {
      return false;
    }

    var knownOrder = Array.isArray(state.promptOrder)
      ? state.promptOrder.filter(function (id) {
          return Boolean(id) && Boolean(state.promptCatalog[id]);
        })
      : [];
    var knownCount = knownOrder.length;
    if (!knownCount) {
      return true;
    }
    if (visibleCount >= knownCount) {
      return true;
    }

    var coverage = visibleCount / Math.max(1, knownCount);
    if (coverage >= 0.72) {
      return true;
    }
    if (knownCount <= 30 && coverage >= 0.55) {
      return true;
    }

    var firstKnownId = knownOrder[0];
    var lastKnownId = knownOrder[knownOrder.length - 1];
    var firstKnownText = normalizeWhitespace(firstKnownId && state.promptCatalog[firstKnownId] ? state.promptCatalog[firstKnownId].text : '');
    var lastKnownText = normalizeWhitespace(lastKnownId && state.promptCatalog[lastKnownId] ? state.promptCatalog[lastKnownId].text : '');
    var firstDomText = normalizeWhitespace(parsedPrompts[0] && parsedPrompts[0].text ? parsedPrompts[0].text : '');
    var lastDomText = normalizeWhitespace(parsedPrompts[parsedCount - 1] && parsedPrompts[parsedCount - 1].text ? parsedPrompts[parsedCount - 1].text : '');

    if (firstKnownText && lastKnownText && firstDomText && lastDomText) {
      if (firstKnownText === firstDomText && lastKnownText !== lastDomText && coverage >= 0.45) {
        return true;
      }
    }

    return false;
  }

  function prunePromptCatalogByDomSnapshot(parsedPrompts, visiblePromptIds) {
    if (!Array.isArray(visiblePromptIds) || !visiblePromptIds.length) {
      return false;
    }

    var dedupedVisible = [];
    var visibleSet = new Set();
    for (var i = 0; i < visiblePromptIds.length; i += 1) {
      var id = visiblePromptIds[i];
      if (!id || visibleSet.has(id) || !state.promptCatalog[id]) {
        continue;
      }
      visibleSet.add(id);
      dedupedVisible.push(id);
    }
    if (!dedupedVisible.length) {
      return false;
    }
    if (!shouldTreatDomPromptsAsAuthoritative(parsedPrompts, dedupedVisible)) {
      return false;
    }

    var oldOrder = Array.isArray(state.promptOrder)
      ? state.promptOrder.filter(function (id) {
          return Boolean(id) && Boolean(state.promptCatalog[id]);
        })
      : [];
    var oldSet = new Set(oldOrder);
    var removedIds = [];
    oldSet.forEach(function (id) {
      if (!visibleSet.has(id)) {
        removedIds.push(id);
      }
    });

    var nextCatalog = {};
    for (var j = 0; j < dedupedVisible.length; j += 1) {
      var keepId = dedupedVisible[j];
      if (state.promptCatalog[keepId]) {
        nextCatalog[keepId] = state.promptCatalog[keepId];
      }
    }

    var changed = removedIds.length > 0 || dedupedVisible.length !== oldOrder.length;
    if (!changed) {
      for (var orderIdx = 0; orderIdx < dedupedVisible.length; orderIdx += 1) {
        if (dedupedVisible[orderIdx] !== oldOrder[orderIdx]) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) {
      return false;
    }

    state.promptCatalog = nextCatalog;
    state.promptOrder = dedupedVisible;

    for (var removeIdx = 0; removeIdx < removedIds.length; removeIdx += 1) {
      var removedId = removedIds[removeIdx];
      state.pins.delete(removedId);
      state.manualSplitStarts.delete(removedId);
      state.markerSplitStarts.delete(removedId);
      state.noteEditorOpen.delete(removedId);
      delete state.notes[removedId];
      delete state.customSegmentTitles[removedId];
      delete state.aiItemSummaries[removedId];
      delete state.aiItemErrors[removedId];
      if (state.aiItemPending && state.aiItemPending[removedId]) {
        delete state.aiItemPending[removedId];
      }
      if (state.activePromptId === removedId) {
        state.activePromptId = '';
      }
      if (state.activeEntryId === removedId) {
        state.activeEntryId = '';
      }
    }

    Object.keys(state.fallbackContextLocks || {}).forEach(function (contextKey) {
      var lockedPromptId = state.fallbackContextLocks[contextKey];
      if (!visibleSet.has(lockedPromptId)) {
        delete state.fallbackContextLocks[contextKey];
      }
    });

    return true;
  }

  function buildSegments(prompts) {
    var segments = [];
    var promptById = new Map();
    var currentSegment = null;

    for (var i = 0; i < prompts.length; i += 1) {
      var prompt = prompts[i];
      if (!promptById.has(prompt.id)) {
        promptById.set(prompt.id, prompt);
      }
      var shouldStartSegment = i === 0 || (i > 0 && state.manualSplitStarts.has(prompt.id));
      if (shouldStartSegment) {
        currentSegment = {
          id: 'seg-' + prompt.id,
          startPromptId: prompt.id,
          order: segments.length + 1,
          promptIds: [],
          title: '',
          summary: '',
          fingerprint: ''
        };
        segments.push(currentSegment);
      }

      currentSegment.promptIds.push(prompt.id);
    }

    for (var j = 0; j < segments.length; j += 1) {
      var segment = segments[j];
      var segmentPrompts = segment.promptIds
        .map(function (promptId) {
          return promptById.get(promptId);
        })
        .filter(Boolean);

      var firstText = segmentPrompts.length ? segmentPrompts[0].text : '';
      var lastText = segmentPrompts.length ? segmentPrompts[segmentPrompts.length - 1].text : '';
      var summaryKeywords = buildKeywordSummary(
        segmentPrompts.map(function (item) {
          return item.text;
        })
      );

      var customTitle = state.customSegmentTitles[segment.startPromptId];
      var segmentFingerprint = buildSegmentFingerprint(segmentPrompts) || getPromptFingerprint(segment.startPromptId, firstText);
      var aiSummaryRecord = getAiSummaryRecordByFingerprint(segmentFingerprint);
      var aiTitle = getAiSummaryTitle(aiSummaryRecord);
      var aiSummaryText = getAiSummaryText(aiSummaryRecord);
      var localSummary = buildSegmentSummary(segmentPrompts.length, firstText, lastText, summaryKeywords);

      segment.fingerprint = segmentFingerprint;
      segment.title = customTitle || aiTitle || buildSegmentTitle(firstText);
      segment.summary = aiSummaryText || localSummary;
    }

    return segments;
  }

  function syncExpandedSegments(nextSegments) {
    var nextIds = new Set(
      nextSegments.map(function (segment) {
        return segment.id;
      })
    );

    var staleExpanded = [];
    state.expandedSegments.forEach(function (segmentId) {
      if (!nextIds.has(segmentId)) {
        staleExpanded.push(segmentId);
      }
    });
    for (var i = 0; i < staleExpanded.length; i += 1) {
      state.expandedSegments.delete(staleExpanded[i]);
    }

    var staleKnown = [];
    state.knownSegmentIds.forEach(function (segmentId) {
      if (!nextIds.has(segmentId)) {
        staleKnown.push(segmentId);
      }
    });
    for (var j = 0; j < staleKnown.length; j += 1) {
      state.knownSegmentIds.delete(staleKnown[j]);
    }

    var nextScrollTops = {};
    Object.keys(state.segmentScrollTops || {}).forEach(function (segmentId) {
      if (nextIds.has(segmentId)) {
        nextScrollTops[segmentId] = Math.max(0, Number(state.segmentScrollTops[segmentId]) || 0);
      }
    });
    state.segmentScrollTops = nextScrollTops;

    for (var k = 0; k < nextSegments.length; k += 1) {
      var segmentId = nextSegments[k].id;
      if (!state.knownSegmentIds.has(segmentId)) {
        state.knownSegmentIds.add(segmentId);
        state.expandedSegments.add(segmentId);
      }
    }
  }
  function cleanupAndTrimContextLocks(validPromptIds) {
    var changed = false;
    var staleLockKeys = [];
    Object.keys(state.fallbackContextLocks).forEach(function (contextKey) {
      var lockedPromptId = state.fallbackContextLocks[contextKey];
      if (!validPromptIds.has(lockedPromptId)) {
        staleLockKeys.push(contextKey);
        return;
      }
      var lockedPrompt = state.promptCatalog[lockedPromptId];
      if (!lockedPrompt || lockedPrompt.fallbackContextKey !== contextKey) {
        staleLockKeys.push(contextKey);
      }
    });
    for (var lockIdx = 0; lockIdx < staleLockKeys.length; lockIdx += 1) {
      delete state.fallbackContextLocks[staleLockKeys[lockIdx]];
    }
    if (staleLockKeys.length) {
      changed = true;
    }

    var allLockKeys = Object.keys(state.fallbackContextLocks);
    if (allLockKeys.length <= MAX_CONTEXT_LOCKS) {
      return changed;
    }

    var lockInfos = allLockKeys
      .map(function (contextKey) {
        var promptId = state.fallbackContextLocks[contextKey];
        var prompt = state.promptCatalog[promptId];
        var noteText = state.notes[promptId];
        var hasPin = state.pins.has(promptId);
        var hasNote = typeof noteText === 'string' && noteText.trim().length > 0;
        var hasManualSplit = state.manualSplitStarts.has(promptId);
        var hasCustomTitle = Boolean(state.customSegmentTitles[promptId]);
        var lowValue = !hasPin && !hasNote && !hasManualSplit && !hasCustomTitle;
        var lastSeenAt = prompt && typeof prompt.lastSeenAt === 'number' ? prompt.lastSeenAt : 0;

        return {
          contextKey: contextKey,
          lowValue: lowValue,
          lastSeenAt: lastSeenAt
        };
      })
      .sort(function (a, b) {
        return a.lastSeenAt - b.lastSeenAt;
      });

    var locksToRemove = allLockKeys.length - MAX_CONTEXT_LOCKS;
    var removedCount = 0;

    for (var lowIdx = 0; lowIdx < lockInfos.length && removedCount < locksToRemove; lowIdx += 1) {
      if (!lockInfos[lowIdx].lowValue) {
        continue;
      }
      delete state.fallbackContextLocks[lockInfos[lowIdx].contextKey];
      removedCount += 1;
    }

    for (var anyIdx = 0; anyIdx < lockInfos.length && removedCount < locksToRemove; anyIdx += 1) {
      var key = lockInfos[anyIdx].contextKey;
      if (!Object.prototype.hasOwnProperty.call(state.fallbackContextLocks, key)) {
        continue;
      }
      delete state.fallbackContextLocks[key];
      removedCount += 1;
    }

    if (removedCount > 0) {
      changed = true;
    }

    return changed;
  }

  function pruneMissingCatalogContextLocks() {
    var changed = false;
    Object.keys(state.fallbackContextLocks).forEach(function (contextKey) {
      var lockedPromptId = state.fallbackContextLocks[contextKey];
      var lockedPrompt = lockedPromptId ? state.promptCatalog[lockedPromptId] : null;
      if (!lockedPromptId || !lockedPrompt || lockedPrompt.fallbackContextKey !== contextKey) {
        delete state.fallbackContextLocks[contextKey];
        changed = true;
      }
    });
    return changed;
  }

  function getSummarySourceStrategy(summaryLength) {
    var normalizedLength = normalizeSummaryLengthValue(summaryLength);
    if (normalizedLength === 'short') {
      return {
        segmentMode: 'prompt_only',
        promptMode: 'prompt_only'
      };
    }
    if (normalizedLength === 'long') {
      return {
        segmentMode: 'full_turn',
        promptMode: 'prompt_with_answer'
      };
    }
    return {
      segmentMode: 'full_turn',
      promptMode: 'prompt_only'
    };
  }

  function buildSegmentPromptSourceLine(prompt, segmentMode) {
    if (!prompt) {
      return '';
    }
    var promptText = normalizeWhitespace(prompt.text || '');
    var assistantText = normalizeWhitespace(prompt.assistantText || '');
    if (!promptText && !assistantText) {
      return '';
    }
    if (segmentMode !== 'full_turn') {
      return promptText;
    }
    if (!assistantText) {
      return 'User: ' + promptText;
    }
    if (!promptText) {
      return 'Assistant: ' + assistantText;
    }
    return 'User: ' + promptText + '\nAssistant: ' + assistantText;
  }

  function buildAiTaskForSegment(segment) {
    if (!segment || !Array.isArray(segment.promptIds) || !segment.promptIds.length) {
      return null;
    }

    var sourceStrategy = getSummarySourceStrategy(state.aiConfig && state.aiConfig.summaryLength);
    var segmentPrompts = segment.promptIds
      .map(function (promptId) {
        return getPromptById(promptId);
      })
      .filter(Boolean);
    var promptTexts = segmentPrompts
      .map(function (prompt) {
        return buildSegmentPromptSourceLine(prompt, sourceStrategy.segmentMode);
      })
      .filter(Boolean);

    if (!promptTexts.length) {
      return null;
    }

    var firstText = segmentPrompts.length ? segmentPrompts[0].text : '';
    var lastText = segmentPrompts.length ? segmentPrompts[segmentPrompts.length - 1].text : '';
    var fingerprint = segment.fingerprint || getPromptFingerprint(segment.startPromptId, firstText);
    if (!fingerprint) {
      return null;
    }

    return {
      conversationId: state.conversationId || '',
      segmentId: segment.id,
      startPromptId: segment.startPromptId,
      fingerprint: fingerprint,
      promptCount: promptTexts.length,
      firstPrompt: firstText,
      lastPrompt: lastText,
      prompts: promptTexts,
      contentSource: sourceStrategy.segmentMode
    };
  }

  function findAiTaskByFingerprint(fingerprint) {
    if (!fingerprint) {
      return null;
    }

    for (var i = 0; i < state.segments.length; i += 1) {
      var task = buildAiTaskForSegment(state.segments[i]);
      if (task && task.fingerprint === fingerprint) {
        return task;
      }
    }

    return null;
  }

  function sendRuntimeMessageOnce(payload) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(payload, function (response) {
          var runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'runtime.sendMessage failed'));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function isRuntimeReceiverMissingError(error) {
    var message = normalizeWhitespace((error && error.message) || '').toLowerCase();
    if (!message) {
      return false;
    }
    return (
      message.indexOf('receiving end does not exist') !== -1 ||
      message.indexOf('could not establish connection') !== -1
    );
  }

  function sleepRuntimeRetry(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  async function sendRuntimeMessage(payload) {
    try {
      return await sendRuntimeMessageOnce(payload);
    } catch (firstError) {
      if (!isRuntimeReceiverMissingError(firstError)) {
        throw firstError;
      }

      await sleepRuntimeRetry(150);
      try {
        await sendRuntimeMessageOnce({ type: 'gptgps_ai_ping' });
      } catch (pingError) {}
      await sleepRuntimeRetry(120);

      try {
        return await sendRuntimeMessageOnce(payload);
      } catch (retryError) {
        if (isRuntimeReceiverMissingError(retryError)) {
          throw new Error('Extension background is not responding. Please reload GPTgps in chrome://extensions and retry.');
        }
        throw retryError;
      }
    }
  }

  function parseAiSummaryResponse(response) {
    if (!response) {
      return null;
    }

    if (typeof response === 'string') {
      var textOnly = normalizeWhitespace(response);
      return textOnly ? { title: '', summary: textOnly } : null;
    }

    var source = response;
    if (source && source.data && typeof source.data === 'object') {
      source = source.data;
    }
    if (source && source.result && typeof source.result === 'object') {
      source = source.result;
    }

    var title = normalizeWhitespace(source && (source.title || source.segmentTitle || source.aiTitle || ''));
    var summary = normalizeWhitespace(source && (source.summary || source.segmentSummary || source.text || source.aiSummary || source.output_text || ''));

    if (!title && !summary) {
      return null;
    }

    return {
      title: title,
      summary: summary
    };
  }

  function truncateTextForAiSummary(text, maxLength) {
    var safe = normalizeWhitespace(text || '');
    var limit = Math.max(10, Number(maxLength) || 0);
    if (safe.length <= limit) {
      return safe;
    }

    if (limit <= 20) {
      return safe.slice(0, Math.max(6, limit - 3)) + '...';
    }

    var bodyLimit = Math.max(12, limit - 7);
    var head = Math.max(6, Math.floor(bodyLimit * 0.68));
    var tail = Math.max(4, bodyLimit - head);
    return safe.slice(0, head) + ' [...] ' + safe.slice(safe.length - tail);
  }

  function pickEvenIndexes(startIndex, endIndex, count) {
    var picks = [];
    if (count <= 0 || endIndex < startIndex) {
      return picks;
    }

    var total = endIndex - startIndex + 1;
    if (count >= total) {
      for (var direct = startIndex; direct <= endIndex; direct += 1) {
        picks.push(direct);
      }
      return picks;
    }

    for (var i = 0; i < count; i += 1) {
      var ratio = count === 1 ? 0.5 : i / (count - 1);
      var mapped = Math.round(startIndex + ratio * (total - 1));
      if (mapped < startIndex) {
        mapped = startIndex;
      } else if (mapped > endIndex) {
        mapped = endIndex;
      }
      if (picks.indexOf(mapped) === -1) {
        picks.push(mapped);
      }
    }

    for (var fill = startIndex; picks.length < count && fill <= endIndex; fill += 1) {
      if (picks.indexOf(fill) === -1) {
        picks.push(fill);
      }
    }

    return picks.sort(function (a, b) {
      return a - b;
    });
  }

  function normalizeSummaryLengthValue(rawValue) {
    var normalized = normalizeWhitespace(rawValue || '').toLowerCase();
    if (AI_SUMMARY_LENGTH_OPTIONS.indexOf(normalized) !== -1) {
      return normalized;
    }
    return AI_SUMMARY_LENGTH_DEFAULT;
  }

  function getAiPromptBudget(summaryLength, compactMode) {
    var normalizedLength = normalizeSummaryLengthValue(summaryLength);
    var compact = Boolean(compactMode);
    if (normalizedLength === 'short') {
      return compact
        ? { perPromptChars: 120, maxTotalChars: 2800 }
        : { perPromptChars: 260, maxTotalChars: 5600 };
    }
    if (normalizedLength === 'long') {
      return compact
        ? { perPromptChars: 360, maxTotalChars: 9200 }
        : { perPromptChars: 760, maxTotalChars: 16000 };
    }
    return compact
      ? { perPromptChars: 220, maxTotalChars: 5200 }
      : { perPromptChars: 460, maxTotalChars: 9200 };
  }

  function buildAiRequestConfig(summaryLength, options) {
    var normalizedLength = normalizeSummaryLengthValue(summaryLength);
    var opts = options || {};
    var compact = Boolean(opts.compactMode);
    var itemMode = Boolean(opts.itemMode);
    var promptCount = Number(opts.promptCount) || 0;
    var provider = normalizeAiProvider(
      (opts.provider || '') || (state.aiConfig && state.aiConfig.provider) || '',
      ''
    );

    var config = {
      maxAttempts: 1,
      timeoutMs: compact ? 24000 : 52000,
      maxTokens: compact ? 220 : 360,
      temperature: compact ? 0.1 : 0.2
    };

    if (normalizedLength === 'short') {
      config.maxTokens = compact ? 120 : 220;
      config.timeoutMs = compact ? 18000 : 42000;
    } else if (normalizedLength === 'long') {
      config.maxTokens = compact ? 280 : 520;
      config.timeoutMs = compact ? 32000 : 72000;
    }

    if (itemMode) {
      config.maxAttempts = 1;
      config.timeoutMs = compact ? 16000 : 28000;
      if (normalizedLength === 'short') {
        config.maxTokens = compact ? 72 : 120;
      } else if (normalizedLength === 'long') {
        config.maxTokens = compact ? 140 : 220;
      } else {
        config.maxTokens = compact ? 100 : 170;
      }
      return config;
    }

    if (provider === 'qwen_coding_plan' || provider === 'minimax') {
      config.timeoutMs += compact ? 12000 : 22000;
      config.temperature = 0;
      if (config.maxTokens > (compact ? 200 : 320)) {
        config.maxTokens = compact ? 200 : 320;
      }
    } else if (provider === 'qwen_intl' || provider === 'qwen_us' || provider === 'qwen_cn') {
      config.timeoutMs += compact ? 6000 : 12000;
      config.temperature = 0.1;
    }

    if (promptCount > 30) {
      config.timeoutMs += compact ? 4000 : 9000;
    }
    if (promptCount > 70) {
      config.timeoutMs += compact ? 3000 : 6000;
      if (config.maxTokens > (compact ? 180 : 280)) {
        config.maxTokens = compact ? 180 : 280;
      }
    }

    return config;
  }

  function compressPromptsForAiSummary(promptTexts, summaryLength, options) {
    var opts = options || {};
    var budget = getAiPromptBudget(summaryLength, Boolean(opts.compactMode));
    var source = Array.isArray(promptTexts) ? promptTexts : [];
    var cleaned = source.map(function (text) {
      return normalizeWhitespace(text || '');
    }).filter(Boolean);

    if (!cleaned.length) {
      return {
        prompts: [],
        totalCount: 0,
        selectedCount: 0,
        droppedCount: 0,
        truncatedCount: 0
      };
    }
    var truncatedCount = 0;
    var selectedPrompts = cleaned.map(function (rawText) {
      var compact = truncateTextForAiSummary(rawText, budget.perPromptChars);
      if (compact.length < rawText.length) {
        truncatedCount += 1;
      }
      return compact;
    });

    var maxTotalChars = Math.max(4000, budget.maxTotalChars);
    var totalChars = selectedPrompts.join('\n').length;
    if (totalChars > maxTotalChars && selectedPrompts.length > 0) {
      var perPromptBudget = Math.max(8, Math.floor(maxTotalChars / selectedPrompts.length));
      var passCount = 0;
      while (totalChars > maxTotalChars && passCount < 6) {
        selectedPrompts = selectedPrompts.map(function (text) {
          var compactText = truncateTextForAiSummary(text, perPromptBudget);
          if (compactText.length < text.length) {
            truncatedCount += 1;
          }
          return compactText;
        });
        totalChars = selectedPrompts.join('\n').length;
        if (totalChars <= maxTotalChars) {
          break;
        }
        perPromptBudget = Math.max(6, perPromptBudget - 4);
        passCount += 1;
      }
    }

    return {
      prompts: selectedPrompts,
      totalCount: cleaned.length,
      selectedCount: selectedPrompts.length,
      droppedCount: 0,
      truncatedCount: truncatedCount
    };
  }

  function buildAiSegmentHint(task, compressionMeta) {
    var meta = compressionMeta || {};
    var kept = Number(meta.selectedCount) || 0;
    var total = Number(meta.totalCount) || kept;
    var parts = [
      'Segment has ' + total + ' prompt(s); summarize overall intent and outcomes.',
      'Input includes ' + kept + ' prompt(s) in original order.'
    ];

    if ((meta.droppedCount || 0) > 0) {
      parts.push('Some prompts were omitted due hard size limits.');
    }
    if ((meta.truncatedCount || 0) > 0) {
      parts.push('Some prompts were truncated.');
    }

    if (task && task.promptCount && task.promptCount > total) {
      parts.push('Original prompt count: ' + task.promptCount + '.');
    }
    if (task && task.contentSource === 'full_turn') {
      parts.push('Input source includes user prompts and assistant replies when available.');
    } else {
      parts.push('Input source includes user prompts only.');
    }

    return parts.join(' ');
  }

  function buildFallbackCompressedPrompts(promptTexts, summaryLength) {
    return compressPromptsForAiSummary(promptTexts, summaryLength, { compactMode: true });
  }

  function buildMinimalPromptsForAiSummary(promptTexts, summaryLength) {
    var source = Array.isArray(promptTexts) ? promptTexts : [];
    var cleaned = source.map(function (text) {
      return normalizeWhitespace(text || '');
    }).filter(Boolean);
    if (!cleaned.length) {
      return buildFallbackCompressedPrompts(promptTexts, summaryLength);
    }

    var targetCount = Math.min(8, Math.max(3, Math.ceil(cleaned.length / 18)));
    var pickIndexes = pickEvenIndexes(0, cleaned.length - 1, targetCount);
    if (!pickIndexes.length) {
      pickIndexes = [0];
    }

    var compactBudget = getAiPromptBudget(summaryLength, true);
    var perPromptLimit = Math.max(84, Math.floor(compactBudget.perPromptChars * 0.72));
    var selected = [];
    for (var i = 0; i < pickIndexes.length; i += 1) {
      var picked = cleaned[pickIndexes[i]];
      if (!picked) {
        continue;
      }
      selected.push(truncateTextForAiSummary(picked, perPromptLimit));
    }
    if (!selected.length) {
      selected.push(truncateTextForAiSummary(cleaned[0], perPromptLimit));
    }

    return {
      prompts: selected,
      totalCount: cleaned.length,
      selectedCount: selected.length,
      droppedCount: Math.max(0, cleaned.length - selected.length),
      truncatedCount: selected.length
    };
  }

  function getAiRetryCooldownMs(itemMode) {
    var summaryLength = normalizeSummaryLengthValue(state.aiConfig && state.aiConfig.summaryLength);
    if (itemMode) {
      if (summaryLength === 'short') {
        return 6000;
      }
      if (summaryLength === 'long') {
        return 14000;
      }
      return 9000;
    }
    if (summaryLength === 'short') {
      return 8000;
    }
    if (summaryLength === 'long') {
      return 16000;
    }
    return 11000;
  }

  function isAiRetryCoolingDown(errorRecord, itemMode) {
    if (!errorRecord || typeof errorRecord !== 'object') {
      return false;
    }
    var updatedAt = Number(errorRecord.updatedAt) || 0;
    if (!updatedAt) {
      return false;
    }
    return (Date.now() - updatedAt) < getAiRetryCooldownMs(itemMode);
  }

  function isTransientAiFailure(error) {
    var status = Number(error && error.status) || 0;
    if (status === 408 || status === 429 || status >= 500) {
      return true;
    }
    var text = String((error && error.message) || '').toLowerCase();
    if (!text) {
      return false;
    }
    return text.indexOf('timed out') !== -1 ||
      text.indexOf('failed to fetch') !== -1 ||
      text.indexOf('network') !== -1 ||
      text.indexOf('429') !== -1 ||
      text.indexOf('5xx') !== -1;
  }

  async function requestAiSummaryForSegment(task) {
    var summaryLength = normalizeSummaryLengthValue(state.aiConfig && state.aiConfig.summaryLength);
    var useCompactFirst = Boolean(task && task.promptCount > 8) || summaryLength === 'short';
    var compressed = compressPromptsForAiSummary(task && task.prompts, summaryLength, { compactMode: useCompactFirst });
    if (!compressed.prompts.length) {
      throw new Error('AI summary has no prompt content');
    }

    var requestConfig = buildAiRequestConfig(summaryLength, {
      compactMode: useCompactFirst,
      itemMode: false,
      promptCount: task && task.promptCount,
      provider: state.aiConfig && state.aiConfig.provider
    });

    var payload = {
      conversationId: task.conversationId,
      segmentId: task.segmentId,
      startPromptId: task.startPromptId,
      fingerprint: task.fingerprint,
      promptCount: task.promptCount,
      firstPrompt: truncateTextForAiSummary(task.firstPrompt, AI_SUMMARY_MAX_PROMPT_CHARS),
      lastPrompt: truncateTextForAiSummary(task.lastPrompt, AI_SUMMARY_MAX_PROMPT_CHARS),
      pageTitle: shortText(document.title || '', 160),
      prompts: compressed.prompts,
      segmentHint: buildAiSegmentHint(task, compressed),
      contentSource: task.contentSource || 'prompt_only',
      aiConfig: {
        enabled: true,
        apiKey: state.aiConfig.apiKey,
        provider: state.aiConfig.provider,
        model: state.aiConfig.model,
        baseUrl: state.aiConfig.baseUrl,
        summaryLength: summaryLength,
        summaryLanguage: normalizeSummaryLanguageValue(state.aiConfig && state.aiConfig.summaryLanguage)
      },
      requestConfig: requestConfig
    };

    var response = await sendRuntimeMessage({
      type: 'gptgps_ai_segment_summary',
      payload: payload
    });
    if (!useCompactFirst && response && response.ok === false && isTransientAiFailure({ message: response.error || response.message, status: response.status })) {
      var fallbackCompressed = buildFallbackCompressedPrompts(task && task.prompts, summaryLength);
      if (fallbackCompressed.prompts.length > 0) {
        var fallbackPayload = Object.assign({}, payload, {
          prompts: fallbackCompressed.prompts,
          segmentHint: buildAiSegmentHint(task, fallbackCompressed) + ' Compact retry mode enabled for stability.',
          requestConfig: buildAiRequestConfig(summaryLength, {
            compactMode: true,
            itemMode: false,
            promptCount: task && task.promptCount,
            provider: state.aiConfig && state.aiConfig.provider
          })
        });
        response = await sendRuntimeMessage({
          type: 'gptgps_ai_segment_summary',
          payload: fallbackPayload
        });
      }
    }
    if (response && response.ok === false) {
      var errorMessage = normalizeWhitespace(response.error || response.message || 'AI summary request failed');
      var wrappedError = new Error(errorMessage);
      wrappedError.ai = response;
      throw wrappedError;
    }

    var parsed = parseAiSummaryResponse(response);
    if (!parsed) {
      throw new Error('AI summary returned empty content');
    }

    return parsed;
  }

  function buildAiItemContentFromPrompt(prompt) {
    if (!prompt) {
      return '';
    }
    var strategy = getSummarySourceStrategy(state.aiConfig && state.aiConfig.summaryLength);
    var promptText = normalizeWhitespace(prompt.text || '');
    if (!promptText) {
      return '';
    }
    if (strategy.promptMode !== 'prompt_with_answer') {
      return truncateTextForAiSummary(promptText, AI_ITEM_SUMMARY_MAX_PROMPT_CHARS);
    }

    var assistantText = normalizeWhitespace(prompt.assistantText || '');
    if (!assistantText) {
      return truncateTextForAiSummary(promptText, AI_ITEM_SUMMARY_MAX_PROMPT_CHARS);
    }

    var promptPart = truncateTextForAiSummary(promptText, Math.max(220, Math.floor(AI_ITEM_SUMMARY_MAX_PROMPT_CHARS * 0.85)));
    var answerPart = truncateTextForAiSummary(assistantText, Math.max(220, AI_ITEM_SUMMARY_MAX_PROMPT_CHARS));
    return 'Prompt: ' + promptPart + '\nAssistant: ' + answerPart;
  }

  function buildAiItemContentFromMarker(marker) {
    if (!marker) {
      return '';
    }
    var anchorPrompt = getPromptById(marker.anchorPromptId);
    if (!anchorPrompt) {
      return '';
    }
    var anchorIndex = anchorPrompt.index;
    var prevPrompt = anchorIndex > 0 ? state.prompts[anchorIndex - 1] : null;
    var nextPrompt = anchorIndex < state.prompts.length - 1 ? state.prompts[anchorIndex + 1] : null;
    var lines = [];
    lines.push('Marker: ' + (marker.label || 'Checkpoint'));
    if (prevPrompt && prevPrompt.text) {
      lines.push('Previous prompt: ' + truncateTextForAiSummary(prevPrompt.text, 260));
    }
    lines.push('Anchor prompt: ' + truncateTextForAiSummary(anchorPrompt.text, 300));
    if (nextPrompt && nextPrompt.text) {
      lines.push('Next prompt: ' + truncateTextForAiSummary(nextPrompt.text, 260));
    }
    if (getSummarySourceStrategy(state.aiConfig && state.aiConfig.summaryLength).promptMode === 'prompt_with_answer') {
      var anchorAssistant = normalizeWhitespace(anchorPrompt.assistantText || '');
      if (anchorAssistant) {
        lines.push('Anchor answer: ' + truncateTextForAiSummary(anchorAssistant, 280));
      }
    }
    return lines.join('\n');
  }

  function buildAiItemTaskFromTimelineItem(timelineItem) {
    if (!timelineItem) {
      return null;
    }
    var entryId = timelineItem.id;
    if (!entryId) {
      return null;
    }

    var isMarker = timelineItem.type === 'marker';
    var content = isMarker
      ? buildAiItemContentFromMarker(timelineItem.marker)
      : buildAiItemContentFromPrompt(timelineItem.prompt);
    if (!content) {
      return null;
    }

    var fingerprint = buildFallbackFingerprint((isMarker ? 'marker' : 'prompt') + '|' + entryId + '|' + content);
    if (!fingerprint) {
      return null;
    }

    return {
      conversationId: state.conversationId || '',
      entryId: entryId,
      type: isMarker ? 'marker' : 'prompt',
      fingerprint: fingerprint,
      content: content
    };
  }

  function collectAiItemTasks() {
    var tasks = [];
    for (var i = 0; i < state.segments.length; i += 1) {
      var segment = state.segments[i];
      var prompts = segment.promptIds.map(function (promptId) {
        return getPromptById(promptId);
      }).filter(Boolean);
      var timelineItems = buildSegmentTimelineItems(segment, prompts, '', false);
      for (var j = 0; j < timelineItems.length; j += 1) {
        var task = buildAiItemTaskFromTimelineItem(timelineItems[j]);
        if (!task) {
          continue;
        }
        tasks.push(task);
        if (tasks.length >= AI_ITEM_SUMMARY_MAX_ITEMS) {
          return tasks;
        }
      }
    }
    return tasks;
  }

  async function requestAiSummaryForItem(task) {
    var summaryLength = normalizeSummaryLengthValue(state.aiConfig && state.aiConfig.summaryLength);
    var payload = {
      entryId: task.entryId,
      type: task.type,
      content: task.content,
      aiConfig: {
        enabled: true,
        apiKey: state.aiConfig.apiKey,
        provider: state.aiConfig.provider,
        model: state.aiConfig.model,
        baseUrl: state.aiConfig.baseUrl,
        summaryLength: summaryLength,
        summaryLanguage: normalizeSummaryLanguageValue(state.aiConfig && state.aiConfig.summaryLanguage)
      },
      requestConfig: buildAiRequestConfig(summaryLength, { compactMode: false, itemMode: true })
    };
    var response = await sendRuntimeMessage({
      type: 'gptgps_ai_item_summary',
      payload: payload
    });

    if (response && response.ok === false && isTransientAiFailure({ message: response.error || response.message, status: response.status })) {
      var compactBudget = getAiPromptBudget(summaryLength, true);
      var compactPayload = Object.assign({}, payload, {
        content: truncateTextForAiSummary(task.content || '', Math.max(140, compactBudget.perPromptChars)),
        requestConfig: buildAiRequestConfig(summaryLength, {
          compactMode: true,
          itemMode: true,
          provider: state.aiConfig && state.aiConfig.provider
        })
      });
      response = await sendRuntimeMessage({
        type: 'gptgps_ai_item_summary',
        payload: compactPayload
      });
    }

    if (response && response.ok === false) {
      var errorMessage = normalizeWhitespace(response.error || response.message || 'AI item summary request failed');
      var wrappedError = new Error(errorMessage);
      wrappedError.ai = response;
      throw wrappedError;
    }

    var summary = normalizeWhitespace(response && (response.summary || response.text || ''));
    if (!summary) {
      throw new Error('AI item summary returned empty content');
    }
    return summary;
  }

  function buildAiDiagnosticMessage(error, provider) {
    var fallbackProvider = getAiProviderLabel(provider || (state.aiConfig && state.aiConfig.provider), true);
    if (!error) {
      return {
        message: 'AI summary failed',
        hint: '',
        status: 0
      };
    }

    var detail = error.ai || {};
    var status = Number(detail.status) || 0;
    var retryAttempts = Number(detail.retryAttempts) || 0;
    var endpoint = normalizeWhitespace(detail.endpoint || '');
    var baseError = normalizeWhitespace((error && error.message) || detail.error || 'AI summary failed');
    var hint = normalizeWhitespace(detail.hint || '');

    if (!hint && status === 401) {
      hint = 'Check API key and provider. Current provider: ' + fallbackProvider + '.';
    } else if (!hint && status === 403) {
      hint = 'Permission denied for this provider/model.';
    } else if (!hint && status === 404) {
      hint = 'Endpoint/model not found. Verify base URL and model.';
    } else if (!hint && status === 429) {
      hint = 'Rate limit reached. Retry in a few seconds.';
    } else if (!hint && status >= 500) {
      hint = 'Provider service error. Retry later.';
    }

    return {
      message: baseError,
      hint: (hint ? (hint + (retryAttempts > 1 ? (' (retried ' + retryAttempts + 'x)') : '')) : (retryAttempts > 1 ? ('Retried ' + retryAttempts + 'x.' ) : '')) +
        (endpoint ? (' | endpoint: ' + shortText(endpoint, 64)) : ''),
      status: status
    };
  }

  function buildLocalFallbackSummaryResult(task) {
    if (!task || !task.fingerprint) {
      return null;
    }
    var prompts = Array.isArray(task.prompts) ? task.prompts : [];
    var cleaned = prompts
      .map(function (text) {
        return normalizeWhitespace(text || '');
      })
      .filter(Boolean);
    var firstText = normalizeWhitespace((cleaned[0] || task.firstPrompt || ''));
    var lastText = normalizeWhitespace((cleaned.length ? cleaned[cleaned.length - 1] : task.lastPrompt) || firstText);
    var promptCount = Number(task.promptCount) || cleaned.length || 0;
    if (!firstText && !lastText) {
      return null;
    }
    var keywords = buildKeywordSummary(cleaned);
    var fallbackTitle = '';
    if (keywords) {
      fallbackTitle = shortText('Summary: ' + keywords.replace(/\s*\/\s*/g, ' | '), 68);
    }
    if (!fallbackTitle) {
      fallbackTitle = buildSegmentTitle(firstText || lastText);
    }
    return {
      title: fallbackTitle,
      summary: buildSegmentSummary(promptCount, firstText, lastText, keywords)
    };
  }

  async function runAiSummaryQueue() {
    if (state.aiQueueRunning) {
      return;
    }

    state.aiQueueRunning = true;
    try {
      while (getAiPendingCount()) {
        if (!isAiSummaryEnabled()) {
          clearAiPending();
          clearAiInFlight();
          break;
        }

        var task = dequeueAiPending();
        if (!task || !task.fingerprint) {
          continue;
        }

        if (task.conversationId && task.conversationId !== (state.conversationId || '')) {
          continue;
        }

        var latestTask = findAiTaskByFingerprint(task.fingerprint);
        if (latestTask) {
          task = Object.assign({}, latestTask, { force: Boolean(task.force || latestTask.force) });
        }

        var existing = getAiSummaryRecordByFingerprint(task.fingerprint);
        if (!Boolean(task.force) && !isAiSummaryRecordStale(existing, task.fingerprint)) {
          continue;
        }

        state.aiInFlight[task.fingerprint] = {
          fingerprint: task.fingerprint,
          segmentId: task.segmentId || '',
          startedAt: Date.now()
        };
        render(true);

        try {
          var result = await requestAiSummaryForSegment(task);
          if (task.conversationId !== (state.conversationId || '')) {
            continue;
          }

          state.aiSegmentSummaries[task.fingerprint] = {
            fingerprint: task.fingerprint,
            title: result.title || '',
            summary: result.summary || '',
            updatedAt: Date.now()
          };
          delete state.aiSegmentErrors[task.fingerprint];

          state.segments = buildSegments(state.prompts);
          syncExpandedSegments(state.segments);
          persistConversationState();
          render(true);
        } catch (error) {
          var diag = buildAiDiagnosticMessage(error, state.aiConfig && state.aiConfig.provider);
          var localFallback = buildLocalFallbackSummaryResult(task);
          var transientFailure = isTransientAiFailure({ message: diag.message, status: diag.status });
          if (localFallback && transientFailure) {
            state.aiSegmentSummaries[task.fingerprint] = {
              fingerprint: task.fingerprint,
              title: localFallback.title || '',
              summary: localFallback.summary || '',
              fallback: true,
              updatedAt: Date.now()
            };
            state.aiSegmentErrors[task.fingerprint] = {
              message: diag.message,
              hint: diag.hint,
              status: diag.status,
              updatedAt: Date.now()
            };
          } else {
            state.aiSegmentErrors[task.fingerprint] = {
              message: diag.message,
              hint: diag.hint,
              status: diag.status,
              updatedAt: Date.now()
            };
          }
          state.segments = buildSegments(state.prompts);
          syncExpandedSegments(state.segments);
          persistConversationState();
          var message = shortText(diag.message, 56);
          var hint = diag.hint ? shortText(diag.hint, 56) : '';
          if (localFallback && transientFailure) {
            setStatNotice('AI timeout: used local summary fallback', 2600);
          } else {
            setStatNotice('AI summary failed: ' + message + (hint ? ' | ' + hint : ''), 3600);
          }
          render(true);
        } finally {
          if (task && task.fingerprint && state.aiInFlight && state.aiInFlight[task.fingerprint]) {
            delete state.aiInFlight[task.fingerprint];
          }
        }
      }
    } finally {
      state.aiQueueRunning = false;
      clearAiInFlight();
      if (getAiPendingCount() && isAiSummaryEnabled()) {
        runAiSummaryQueue();
      }
    }
  }

  async function runAiItemSummaryQueue() {
    if (state.aiItemQueueRunning) {
      return;
    }

    state.aiItemQueueRunning = true;
    var updated = false;
    var hasErrorUpdate = false;
    try {
      while (getAiItemPendingCount()) {
        if (!isAiItemSummaryEnabled()) {
          clearAiItemPending();
          break;
        }
        if (state.aiQueueRunning) {
          await sleep(280);
          continue;
        }

        var task = dequeueAiItemPending();
        if (!task || !task.entryId || !task.fingerprint) {
          continue;
        }
        if (task.conversationId && task.conversationId !== (state.conversationId || '')) {
          continue;
        }

        var record = state.aiItemSummaries[task.entryId];
        if (!Boolean(task.force) && !isAiItemSummaryRecordStale(record, task.fingerprint)) {
          continue;
        }

        try {
          var summaryText = await requestAiSummaryForItem(task);
          if (task.conversationId !== (state.conversationId || '')) {
            continue;
          }
          state.aiItemSummaries[task.entryId] = {
            fingerprint: task.fingerprint,
            summary: summaryText,
            updatedAt: Date.now()
          };
          delete state.aiItemErrors[task.entryId];
          updated = true;
        } catch (error) {
          var diag = buildAiDiagnosticMessage(error, state.aiConfig && state.aiConfig.provider);
          state.aiItemErrors[task.entryId] = {
            message: diag.message,
            hint: diag.hint,
            status: diag.status,
            updatedAt: Date.now()
          };
          hasErrorUpdate = true;
        }
      }
    } finally {
      state.aiItemQueueRunning = false;
      if (updated || hasErrorUpdate) {
        if (updated) {
          persistConversationState();
        }
        render(true);
      }
      if (getAiItemPendingCount() && isAiItemSummaryEnabled()) {
        runAiItemSummaryQueue();
      }
    }
  }

  function scheduleAiSummaries() {
    if (!state.initialized || !state.segments.length) {
      return;
    }

    if (!isAiSummaryEnabled()) {
      clearAiPending();
      clearAiInFlight();
      clearAiItemPending();
      if (Object.keys(state.aiSegmentErrors).length || Object.keys(state.aiItemErrors).length) {
        state.aiSegmentErrors = {};
        state.aiItemErrors = {};
        render(true);
      }
      return;
    }

    for (var i = 0; i < state.segments.length; i += 1) {
      var task = buildAiTaskForSegment(state.segments[i]);
      if (!task || !task.fingerprint) {
        continue;
      }

      var saved = getAiSummaryRecordByFingerprint(task.fingerprint);
      if (isAiSummaryRecordStale(saved, task.fingerprint)) {
        if (isAiRetryCoolingDown(state.aiSegmentErrors[task.fingerprint], false)) {
          continue;
        }
        task.force = false;
        enqueueAiPending(task);
      }
    }

    if (!state.aiQueueRunning && getAiPendingCount()) {
      runAiSummaryQueue();
    }

    if (!isAiItemSummaryEnabled()) {
      clearAiItemPending();
      if (Object.keys(state.aiItemErrors).length) {
        state.aiItemErrors = {};
      }
      return;
    }

    var itemTasks = collectAiItemTasks();
    for (var itemIdx = 0; itemIdx < itemTasks.length; itemIdx += 1) {
      var itemTask = itemTasks[itemIdx];
      var itemRecord = state.aiItemSummaries[itemTask.entryId];
      if (isAiItemSummaryRecordStale(itemRecord, itemTask.fingerprint)) {
        if (isAiRetryCoolingDown(state.aiItemErrors[itemTask.entryId], true)) {
          continue;
        }
        itemTask.force = false;
        enqueueAiItemPending(itemTask);
      }
    }
    if (!state.aiItemQueueRunning && getAiItemPendingCount()) {
      runAiItemSummaryQueue();
    }
  }

  function regenerateSegmentSummary(segmentId) {
    if (!segmentId || !isAiSummaryEnabled()) {
      setStatNotice('Enable AI summary first', 1800);
      return;
    }

    for (var i = 0; i < state.segments.length; i += 1) {
      var segment = state.segments[i];
      if (segment.id !== segmentId) {
        continue;
      }
      if (segment.startPromptId && state.customSegmentTitles[segment.startPromptId]) {
        delete state.customSegmentTitles[segment.startPromptId];
      }
      var task = buildAiTaskForSegment(segment);
      if (!task || !task.fingerprint) {
        continue;
      }
      task.force = true;
      enqueueAiPending(task);
      delete state.aiSegmentErrors[task.fingerprint];
      setStatNotice('Regenerating summary...', 1400);
      if (!state.aiQueueRunning) {
        runAiSummaryQueue();
      }
      return;
    }
  }

  function closeAiConfigPanel() {
    var overlay = document.getElementById('cng-ai-config-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function getAiConfigPanelFields(root) {
    if (!root) {
      return null;
    }

    var providerEl = root.querySelector('[data-field="provider"]');
    var apiKeyEl = root.querySelector('[data-field="apiKey"]');
    var modelEl = root.querySelector('[data-field="model"]');
    var baseUrlEl = root.querySelector('[data-field="baseUrl"]');
    var summaryLengthEl = root.querySelector('[data-field="summaryLength"]');
    var summaryLanguageEl = root.querySelector('[data-field="summaryLanguage"]');
    var itemSummaryEl = root.querySelector('[data-field="itemSummaryEnabled"]');
    var promptDisplayLimitEl = root.querySelector('[data-field="promptDisplayLimit"]');
    var markerDisplayLimitEl = root.querySelector('[data-field="markerDisplayLimit"]');
    var segmentSummaryDisplayLimitEl = root.querySelector('[data-field="segmentSummaryDisplayLimit"]');
    var effectiveEl = root.querySelector('[data-role="effective"]');
    var statusEl = root.querySelector('[data-role="status"]');

    if (
      !providerEl ||
      !apiKeyEl ||
      !modelEl ||
      !baseUrlEl ||
      !summaryLengthEl ||
      !summaryLanguageEl ||
      !itemSummaryEl ||
      !promptDisplayLimitEl ||
      !markerDisplayLimitEl ||
      !segmentSummaryDisplayLimitEl ||
      !effectiveEl ||
      !statusEl
    ) {
      return null;
    }

    return {
      providerEl: providerEl,
      apiKeyEl: apiKeyEl,
      modelEl: modelEl,
      baseUrlEl: baseUrlEl,
      summaryLengthEl: summaryLengthEl,
      summaryLanguageEl: summaryLanguageEl,
      itemSummaryEl: itemSummaryEl,
      promptDisplayLimitEl: promptDisplayLimitEl,
      markerDisplayLimitEl: markerDisplayLimitEl,
      segmentSummaryDisplayLimitEl: segmentSummaryDisplayLimitEl,
      effectiveEl: effectiveEl,
      statusEl: statusEl
    };
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildAiEffectiveLabel(config, testedModel) {
    var aiConfig = normalizeAiConfig(config || state.aiConfig || {});
    var provider = getAiProviderLabel(aiConfig.provider, true);
    var model = normalizeWhitespace(testedModel || aiConfig.model || '');
    var baseUrl = normalizeWhitespace(aiConfig.baseUrl || '');
    var languageLabel = normalizeSummaryLanguageValue(aiConfig.summaryLanguage || '') === 'zh' ? '\u4e2d\u6587' : 'English';
    return provider + ' | model ' + model + ' | ' + languageLabel + ' | ' + shortText(baseUrl, 68);
  }

  function syncAiPanelEffectiveLabel(root, testedModel) {
    var fields = getAiConfigPanelFields(root);
    if (!fields) {
      return;
    }
    var built = buildAiConfigFromPanel(root);
    var config = built && built.ok ? built.config : {
      provider: fields.providerEl.value,
      model: fields.modelEl.value,
      baseUrl: fields.baseUrlEl.value,
      summaryLength: fields.summaryLengthEl.value,
      summaryLanguage: fields.summaryLanguageEl.value,
      itemSummaryEnabled: Boolean(fields.itemSummaryEl.checked),
      promptDisplayLimit: fields.promptDisplayLimitEl.value,
      markerDisplayLimit: fields.markerDisplayLimitEl.value,
      segmentSummaryDisplayLimit: fields.segmentSummaryDisplayLimitEl.value
    };
    fields.effectiveEl.textContent = buildAiEffectiveLabel(config, testedModel);
  }

  function buildAiConfigFromPanel(root) {
    var fields = getAiConfigPanelFields(root);
    if (!fields) {
      return null;
    }
    var inputApiKey = sanitizeApiKey(fields.apiKeyEl.value || '');
    var savedApiKey = sanitizeApiKey((state.aiConfig && state.aiConfig.apiKey) || '');
    var normalizedApiKey = inputApiKey || savedApiKey;

    var provider = normalizeAiProvider(fields.providerEl.value || '', '');
    var providerPreset = getAiProviderPreset(provider);
    var modelText = normalizeWhitespace(fields.modelEl.value || '');
    var baseUrlText = normalizeWhitespace(fields.baseUrlEl.value || '');
    var summaryLengthRaw = normalizeWhitespace(fields.summaryLengthEl.value || '').toLowerCase();
    var summaryLength = AI_SUMMARY_LENGTH_OPTIONS.indexOf(summaryLengthRaw) !== -1
      ? summaryLengthRaw
      : AI_SUMMARY_LENGTH_DEFAULT;
    var summaryLanguage = normalizeSummaryLanguageValue(fields.summaryLanguageEl.value || '');
    var itemSummaryEnabled = Boolean(fields.itemSummaryEl.checked);
    var promptDisplayLimit = normalizeDisplayLimitValue(fields.promptDisplayLimitEl.value, PROMPT_DISPLAY_LIMIT_DEFAULT);
    var markerDisplayLimit = normalizeDisplayLimitValue(fields.markerDisplayLimitEl.value, MARKER_DISPLAY_LIMIT_DEFAULT);
    var segmentSummaryDisplayLimit = normalizeDisplayLimitValue(
      fields.segmentSummaryDisplayLimitEl.value,
      SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT
    );
    var normalizedBaseUrl = normalizeAiBaseUrl(baseUrlText);

    if (!normalizedBaseUrl) {
      return {
        ok: false,
        error: 'Invalid base URL. Please use http(s).'
      };
    }

    return {
      ok: true,
      config: normalizeAiConfig({
        enabled: Boolean(normalizedApiKey),
        apiKey: normalizedApiKey,
        provider: provider,
        model: modelText || providerPreset.model || AI_SUMMARY_DEFAULT_MODEL,
        baseUrl: normalizedBaseUrl,
        summaryLength: summaryLength,
        summaryLanguage: summaryLanguage,
        itemSummaryEnabled: itemSummaryEnabled,
        promptDisplayLimit: promptDisplayLimit,
        markerDisplayLimit: markerDisplayLimit,
        segmentSummaryDisplayLimit: segmentSummaryDisplayLimit
      }),
      usedSavedApiKey: Boolean(!inputApiKey && savedApiKey),
      inputApiKeyLength: inputApiKey.length
    };
  }

  function getAiConfigSoftWarnings(config) {
    var safe = normalizeAiConfig(config || {});
    var warnings = [];
    var apiKey = normalizeWhitespace(safe.apiKey || '');
    var model = normalizeWhitespace(safe.model || '').toLowerCase();

    if (safe.provider === 'qwen_coding_plan' && apiKey && apiKey.indexOf('sk-sp-') !== 0) {
      warnings.push('Qwen Coding Plan usually requires a Coding key starting with sk-sp-.');
    }
    if (
      safe.provider === 'qwen_coding_plan' &&
      safe.baseUrl &&
      safe.baseUrl.indexOf('coding.dashscope.aliyuncs.com') === -1
    ) {
      warnings.push('Qwen Coding Plan official endpoint is usually https://coding.dashscope.aliyuncs.com/v1.');
    }
    if (safe.provider === 'openai' && apiKey && apiKey.indexOf('sk-') !== 0) {
      warnings.push('OpenAI key usually starts with sk-.');
    }
    if (safe.provider === 'minimax' && model && model.indexOf('minimax') === -1) {
      warnings.push('MiniMax provider is selected, but model name does not look like a MiniMax model.');
    }
    if (safe.provider === 'qwen_coding_plan') {
      warnings.push('Coding Plan keys are optimized for coding-assistant scenarios; if unstable, switch to Qwen DashScope CN/Intl.');
    }

    return warnings;
  }

  function syncAiPanelByProvider(root, forceOverwrite) {
    var fields = getAiConfigPanelFields(root);
    if (!fields) {
      return;
    }

    var provider = normalizeAiProvider(fields.providerEl.value || '', '');
    var preset = getAiProviderPreset(provider);
    var shouldOverwrite = Boolean(forceOverwrite) || provider !== 'custom';

    if (shouldOverwrite) {
      fields.modelEl.value = preset.model || AI_SUMMARY_DEFAULT_MODEL;
      fields.baseUrlEl.value = normalizeAiBaseUrl(preset.baseUrl || AI_SUMMARY_DEFAULT_BASE_URL) || AI_SUMMARY_DEFAULT_BASE_URL;
    }
    syncAiPanelEffectiveLabel(root, '');
  }

  async function testAiConfigPanel(root) {
    var fields = getAiConfigPanelFields(root);
    if (!fields) {
      return;
    }

    var built = buildAiConfigFromPanel(root);
    if (!built || !built.ok) {
      fields.statusEl.textContent = built && built.error ? built.error : 'Invalid AI config.';
      fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
      return;
    }

    var candidate = built.config;
    var softWarnings = getAiConfigSoftWarnings(candidate);
    if (!candidate.apiKey) {
      var rawKey = String(fields.apiKeyEl.value || '');
      var cleanedKey = sanitizeApiKey(rawKey);
      fields.statusEl.textContent = 'API key is empty after cleanup (raw ' + rawKey.length + ' chars, cleaned ' + cleanedKey.length + ').';
      fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
      return;
    }
    var permissionResult = await ensureAiHostPermission(candidate.baseUrl, true);
    if (!permissionResult.ok) {
      fields.statusEl.textContent = permissionResult.reason || 'Missing host permission.';
      fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
      return;
    }

    fields.statusEl.textContent = built.usedSavedApiKey ? 'Testing connection with saved key...' : 'Testing connection...';
    fields.statusEl.className = 'cng-ai-modal-status';

    try {
      var response = await sendRuntimeMessage({
        type: 'gptgps_ai_test_connection',
        payload: {
          aiConfig: candidate
        }
      });

      if (!response || response.ok === false) {
        var errorText = normalizeWhitespace(response && (response.error || response.message || 'Connection test failed'));
        var hintText = normalizeWhitespace(response && response.hint);
        fields.statusEl.textContent = hintText ? (errorText + ' | ' + hintText) : errorText;
        fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
        return;
      }

      var activeModel = normalizeWhitespace(response.model || candidate.model);
      var info = 'Connected: ' + getAiProviderLabel(candidate.provider, true) + ' | model ' + activeModel;
      if (response && response.endpoint) {
        info += ' | ' + shortText(response.endpoint, 44);
      }
      if (response && response.modelListed === false) {
        info += ' | warning: model not found in /models';
      }
      if (softWarnings.length) {
        info += ' | note: ' + softWarnings[0];
      }
      info += ' | Test passed only. Click Save to enable summaries.';
      fields.statusEl.textContent = info;
      fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-ok';
      syncAiPanelEffectiveLabel(root, activeModel);
    } catch (error) {
      fields.statusEl.textContent = normalizeWhitespace((error && error.message) || 'Connection test failed');
      fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
    }
  }

  async function configureAi() {
    closeAiConfigPanel();

    var current = state.aiConfig || normalizeAiConfig({});
    var overlay = document.createElement('div');
    overlay.id = 'cng-ai-config-overlay';
    overlay.className = 'cng-ai-modal-overlay';

    var options = AI_PROVIDER_IDS.map(function (providerId) {
      var selected = providerId === current.provider ? ' selected' : '';
      return '<option value="' + providerId + '"' + selected + '>' + getAiProviderLabel(providerId, false) + '</option>';
    }).join('');

    var summaryLengthOptions = AI_SUMMARY_LENGTH_OPTIONS.map(function (value) {
      var selected = value === (current.summaryLength || AI_SUMMARY_LENGTH_DEFAULT) ? ' selected' : '';
      var label = value.charAt(0).toUpperCase() + value.slice(1);
      return '<option value="' + value + '"' + selected + '>' + label + '</option>';
    }).join('');
    var languageOptions = [
      { value: 'zh', label: '\u4e2d\u6587' },
      { value: 'en', label: 'English' }
    ].map(function (item) {
      var selected = item.value === normalizeSummaryLanguageValue(current.summaryLanguage || '') ? ' selected' : '';
      return '<option value="' + item.value + '"' + selected + '>' + item.label + '</option>';
    }).join('');

    var apiKeyPlaceholder = current.apiKey
      ? 'Saved key is hidden. Leave blank to keep current key.'
      : 'sk-...';
    overlay.innerHTML =
      '<div class="cng-ai-modal" role="dialog" aria-modal="true">' +
      '<div class="cng-ai-modal-header">' +
      '<div class="cng-ai-modal-title">AI Summary Settings</div>' +
      '<button type="button" class="cng-ai-modal-close" data-action="close-ai-modal">X</button>' +
      '</div>' +
      '<div class="cng-ai-modal-grid">' +
      '<label>Provider</label><select data-field="provider">' + options + '</select>' +
      '<label>API Key</label><input data-field="apiKey" type="password" autocomplete="off" value="" placeholder="' + escapeHtml(apiKeyPlaceholder) + '" />' +
      '<label>Model</label><input data-field="model" type="text" value="' + escapeHtml(current.model || '') + '" />' +
      '<label>Base URL</label><input data-field="baseUrl" type="text" value="' + escapeHtml(current.baseUrl || '') + '" />' +
      '<label>Summary Length</label><select data-field="summaryLength">' + summaryLengthOptions + '</select>' +
      '<label>Summary Language</label><select data-field="summaryLanguage">' + languageOptions + '</select>' +
      '<label>Prompt/Mark AI</label><label class="cng-ai-checkbox"><input data-field="itemSummaryEnabled" type="checkbox"' + (current.itemSummaryEnabled ? ' checked' : '') + ' />Summarize each prompt/marker</label>' +
      '<label>Prompt Max Chars</label><input data-field="promptDisplayLimit" type="number" min="' + DISPLAY_LIMIT_MIN + '" max="' + DISPLAY_LIMIT_MAX + '" step="1" value="' + String(normalizeDisplayLimitValue(current.promptDisplayLimit, PROMPT_DISPLAY_LIMIT_DEFAULT)) + '" />' +
      '<label>Marker Max Chars</label><input data-field="markerDisplayLimit" type="number" min="' + DISPLAY_LIMIT_MIN + '" max="' + DISPLAY_LIMIT_MAX + '" step="1" value="' + String(normalizeDisplayLimitValue(current.markerDisplayLimit, MARKER_DISPLAY_LIMIT_DEFAULT)) + '" />' +
      '<label>Segment Sum Chars</label><input data-field="segmentSummaryDisplayLimit" type="number" min="' + DISPLAY_LIMIT_MIN + '" max="' + DISPLAY_LIMIT_MAX + '" step="1" value="' + String(normalizeDisplayLimitValue(current.segmentSummaryDisplayLimit, SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT)) + '" />' +
      '<label>Effective</label><div class="cng-ai-modal-effective" data-role="effective"></div>' +
      '</div>' +
      '<div class="cng-ai-modal-status" data-role="status">Current: ' + escapeHtml(getAiProviderLabel(current.provider, true)) + ' | model ' + escapeHtml(current.model || '') + '</div>' +
      '<div class="cng-ai-modal-actions">' +
      '<button type="button" data-action="test-ai">Test</button>' +
      '<button type="button" data-action="disable-ai">Disable</button>' +
      '<button type="button" data-action="save-ai" class="cng-ai-primary">Save</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var fields = getAiConfigPanelFields(overlay);
    if (!fields) {
      closeAiConfigPanel();
      return;
    }

    fields.providerEl.addEventListener('change', function () {
      syncAiPanelByProvider(overlay, true);
    });
    fields.modelEl.addEventListener('input', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.baseUrlEl.addEventListener('input', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.summaryLengthEl.addEventListener('change', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.summaryLanguageEl.addEventListener('change', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.itemSummaryEl.addEventListener('change', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.promptDisplayLimitEl.addEventListener('input', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.markerDisplayLimitEl.addEventListener('input', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    fields.segmentSummaryDisplayLimitEl.addEventListener('input', function () {
      syncAiPanelEffectiveLabel(overlay, '');
    });
    syncAiPanelEffectiveLabel(overlay, '');

    overlay.addEventListener('click', async function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) {
        return;
      }

      var action = target.getAttribute('data-action');
      if (!action) {
        if (target === overlay) {
          closeAiConfigPanel();
        }
        return;
      }

      if (action === 'close-ai-modal') {
        closeAiConfigPanel();
        return;
      }

      if (action === 'test-ai') {
        await testAiConfigPanel(overlay);
        return;
      }

      if (action === 'disable-ai') {
        var providerId = normalizeAiProvider(fields.providerEl.value || '', fields.baseUrlEl.value || '');
        var preset = getAiProviderPreset(providerId);
        var modelValue = normalizeWhitespace(fields.modelEl.value || '') || preset.model || AI_SUMMARY_DEFAULT_MODEL;
        var baseUrlValue = normalizeAiBaseUrl(fields.baseUrlEl.value || '') || normalizeAiBaseUrl(preset.baseUrl || '') || AI_SUMMARY_DEFAULT_BASE_URL;
        var summaryLengthRaw = normalizeWhitespace(fields.summaryLengthEl.value || '').toLowerCase();
        var summaryLengthValue = AI_SUMMARY_LENGTH_OPTIONS.indexOf(summaryLengthRaw) !== -1
          ? summaryLengthRaw
          : AI_SUMMARY_LENGTH_DEFAULT;
        var summaryLanguageValue = normalizeSummaryLanguageValue(fields.summaryLanguageEl.value || '');
        var itemSummaryEnabledValue = Boolean(fields.itemSummaryEl.checked);
        var promptDisplayLimitValue = normalizeDisplayLimitValue(fields.promptDisplayLimitEl.value, PROMPT_DISPLAY_LIMIT_DEFAULT);
        var markerDisplayLimitValue = normalizeDisplayLimitValue(fields.markerDisplayLimitEl.value, MARKER_DISPLAY_LIMIT_DEFAULT);
        var segmentSummaryDisplayLimitValue = normalizeDisplayLimitValue(
          fields.segmentSummaryDisplayLimitEl.value,
          SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT
        );
        state.aiConfig = normalizeAiConfig({
          enabled: false,
          apiKey: '',
          provider: providerId,
          model: modelValue,
          baseUrl: baseUrlValue,
          summaryLength: summaryLengthValue,
          summaryLanguage: summaryLanguageValue,
          itemSummaryEnabled: itemSummaryEnabledValue,
          promptDisplayLimit: promptDisplayLimitValue,
          markerDisplayLimit: markerDisplayLimitValue,
          segmentSummaryDisplayLimit: segmentSummaryDisplayLimitValue
        });
        clearAiPending();
        clearAiInFlight();
        clearAiItemPending();
        state.aiItemErrors = {};
        await persistAiConfig();
        updateAiButtonState();
        render(true);
        setStatNotice('AI summary disabled', 1800);
        scheduleAiSummaries();
        closeAiConfigPanel();
        return;
      }

      if (action === 'save-ai') {
        var built = buildAiConfigFromPanel(overlay);
        if (!built || !built.ok) {
          fields.statusEl.textContent = built && built.error ? built.error : 'Invalid AI config.';
          fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
          return;
        }
        if (built.config && built.config.enabled) {
          var savePermission = await ensureAiHostPermission(built.config.baseUrl, true);
          if (!savePermission.ok) {
            fields.statusEl.textContent = savePermission.reason || 'Missing host permission.';
            fields.statusEl.className = 'cng-ai-modal-status cng-ai-modal-status-error';
            return;
          }
        }

        var previousFingerprint = buildAiConfigFingerprint(state.aiConfig);
        state.aiConfig = normalizeAiConfig(built.config);
        var currentFingerprint = buildAiConfigFingerprint(state.aiConfig);
        var aiConfigChanged = previousFingerprint !== currentFingerprint;
        var saveWarnings = getAiConfigSoftWarnings(state.aiConfig);

        if (state.aiConfig.enabled && aiConfigChanged) {
          clearAiPending();
          clearAiInFlight();
          clearAiItemPending();
          state.aiSegmentSummaries = {};
          state.aiSegmentErrors = {};
          state.aiItemSummaries = {};
          state.aiItemErrors = {};
        }

        await persistAiConfig();
        updateAiButtonState();
        render(true);
        if (state.aiConfig.enabled) {
          if (aiConfigChanged) {
            var regenNotice = 'AI config updated: regenerating summaries...';
            if (saveWarnings.length) {
              regenNotice += ' | ' + shortText(saveWarnings[0], 68);
            }
            setStatNotice(regenNotice, 3200);
          } else {
            var enabledNotice = 'AI summary enabled (' + getAiProviderLabel(state.aiConfig.provider, true) + ')';
            if (saveWarnings.length) {
              enabledNotice += ' | ' + shortText(saveWarnings[0], 68);
            }
            setStatNotice(enabledNotice, 2800);
          }
        } else {
          setStatNotice('API key empty: AI summary disabled', 2200);
          clearAiPending();
          clearAiInFlight();
          clearAiItemPending();
          state.aiSegmentErrors = {};
          state.aiItemErrors = {};
        }
        scheduleAiSummaries();
        closeAiConfigPanel();
      }
    });
  }

  function refreshPromptsFromDom(options) {
    var forceRender = Boolean(options && options.forceRender);
    var suppressRender = Boolean(options && options.suppressRender);
    var userNodes = Array.from(document.querySelectorAll(SELECTOR_USER_PROMPT));
    var elements = new Map();
    var parsedPrompts = [];

    for (var n = 0; n < userNodes.length; n += 1) {
      var parsedText = getPromptText(userNodes[n]);
      if (!parsedText) {
        continue;
      }

      parsedPrompts.push({
        node: userNodes[n],
        text: parsedText,
        assistantText: getAssistantTextForUserNode(userNodes[n]),
        hintHash: buildPromptHintHash(parsedText)
      });
    }

    var prePrunedLocks = pruneMissingCatalogContextLocks();
    var scrollContainer = getChatScrollContainer();
    var currentScrollTop =
      scrollContainer && typeof scrollContainer.scrollTop === 'number'
        ? scrollContainer.scrollTop
        : document.scrollingElement && typeof document.scrollingElement.scrollTop === 'number'
          ? document.scrollingElement.scrollTop
          : 0;
    var fallbackContext = {
      index: buildFallbackCatalogIndex(),
      usedIds: new Set(),
      newCounts: new Map(),
      contextLocks: state.fallbackContextLocks,
      currentScrollTop: currentScrollTop,
      scrollUnit: FALLBACK_SCROLL_UNIT,
      maxReuseScoreSingle: FALLBACK_MAX_REUSE_SCORE_SINGLE,
      maxReuseScoreDuplicate: FALLBACK_MAX_REUSE_SCORE_DUPLICATE,
      minScoreGapDuplicate: FALLBACK_MIN_SCORE_GAP_DUPLICATE,
      contextMatchBonus: FALLBACK_CONTEXT_MATCH_BONUS,
      contextMismatchPenalty: FALLBACK_CONTEXT_MISMATCH_PENALTY,
      contextBucketBonus: FALLBACK_CONTEXT_BUCKET_BONUS,
      scrollBucketSize: FALLBACK_SCROLL_BUCKET_SIZE
    };
    var catalogChanged = false;
    var visiblePromptIds = [];

    for (var i = 0; i < parsedPrompts.length; i += 1) {
      var node = parsedPrompts[i].node;
      var text = parsedPrompts[i].text;
      var assistantText = parsedPrompts[i].assistantText || '';
      var prevHintHash = i > 0 ? parsedPrompts[i - 1].hintHash : 'start';
      var nextHintHash = i < parsedPrompts.length - 1 ? parsedPrompts[i + 1].hintHash : 'end';

      var now = Date.now();
      var resolved = promptIdFromNode(node, text, i, fallbackContext, {
        prevHintHash: prevHintHash,
        nextHintHash: nextHintHash
      });
      var id = resolved.id;
      var fingerprint = resolved.fingerprint;
      var tokens = tokenize(text);
      var reusedFallback = Boolean(fingerprint) && Boolean(resolved.reused);
      var reuseConfidence = typeof resolved.confidence === 'number' ? resolved.confidence : 0;
      var lockHit = Boolean(resolved.lockHit);
      var lowConfidenceContextReuse = Boolean(resolved.lowConfidenceContextReuse);
      var existing = state.promptCatalog[id];
      if (existing && fingerprint && existing.fingerprint && existing.fingerprint !== fingerprint) {
        id = createFallbackPromptId(fingerprint, fallbackContext, 0);
        existing = state.promptCatalog[id];
        reusedFallback = false;
        lockHit = false;
        lowConfidenceContextReuse = false;
      }

      if (reusedFallback && !lockHit && existing && existing.text !== text && reuseConfidence < 0.55) {
        id = createFallbackPromptId(fingerprint, fallbackContext, 0);
        existing = state.promptCatalog[id];
        reusedFallback = false;
        lockHit = false;
        lowConfidenceContextReuse = false;
      }


      if (!existing) {
        state.promptCatalog[id] = {
          text: text,
          assistantText: assistantText,
          tokens: tokens,
          fingerprint: fingerprint || '',
          fallbackContextKey: resolved.contextKey || '',
          fallbackContextBucket: resolved.contextBucket || '',
          prevHintHash: resolved.prevHintHash || '',
          nextHintHash: resolved.nextHintHash || '',
          firstSeenAt: now,
          lastSeenAt: now,
          lastSeenVisibleOrder: i,
          lastSeenScrollTop: currentScrollTop
        };
        state.promptOrder.push(id);
        catalogChanged = true;
      } else {
        if (existing.text !== text || !Array.isArray(existing.tokens)) {
          if (reusedFallback && (lockHit || reuseConfidence < 0.55)) {
            id = createFallbackPromptId(fingerprint, fallbackContext, 0);
            state.promptCatalog[id] = {
              text: text,
              assistantText: assistantText,
              tokens: tokens,
              fingerprint: fingerprint || '',
              fallbackContextKey: resolved.contextKey || '',
              fallbackContextBucket: resolved.contextBucket || '',
              prevHintHash: resolved.prevHintHash || '',
              nextHintHash: resolved.nextHintHash || '',
              firstSeenAt: now,
              lastSeenAt: now,
              lastSeenVisibleOrder: i,
              lastSeenScrollTop: currentScrollTop
            };
            state.promptOrder.push(id);
            catalogChanged = true;
            reusedFallback = false;
            lowConfidenceContextReuse = false;
            if (
              fingerprint &&
              resolved.contextKey &&
              id &&
              shouldUpdateContextLock(
                state.fallbackContextLocks,
                resolved.contextKey,
                lockHit,
                lowConfidenceContextReuse,
                reusedFallback
              )
            ) {
              state.fallbackContextLocks[resolved.contextKey] = id;
            }
            var fallbackJumpTarget = jumpTargetFromNode(node);
            if (fallbackJumpTarget && fallbackJumpTarget.setAttribute) {
              fallbackJumpTarget.setAttribute('data-cng-prompt-id', id);
            }
            elements.set(id, fallbackJumpTarget);
            visiblePromptIds.push(id);
            continue;
          }
          existing.text = text;
          existing.tokens = tokens;
          catalogChanged = true;
        }
        if ((existing.assistantText || '') !== assistantText) {
          existing.assistantText = assistantText;
          catalogChanged = true;
        }
        if (fingerprint && existing.fingerprint !== fingerprint) {
          existing.fingerprint = fingerprint;
          catalogChanged = true;
        }
        if (resolved.contextKey && existing.fallbackContextKey !== resolved.contextKey) {
          existing.fallbackContextKey = resolved.contextKey;
          catalogChanged = true;
        }
        if (resolved.contextBucket && existing.fallbackContextBucket !== resolved.contextBucket) {
          existing.fallbackContextBucket = resolved.contextBucket;
          catalogChanged = true;
        }
        if (resolved.prevHintHash && existing.prevHintHash !== resolved.prevHintHash) {
          existing.prevHintHash = resolved.prevHintHash;
          catalogChanged = true;
        }
        if (resolved.nextHintHash && existing.nextHintHash !== resolved.nextHintHash) {
          existing.nextHintHash = resolved.nextHintHash;
          catalogChanged = true;
        }
        existing.lastSeenAt = now;
        existing.lastSeenVisibleOrder = i;
        existing.lastSeenScrollTop = currentScrollTop;
      }

      if (
        fingerprint &&
        resolved.contextKey &&
        id &&
        shouldUpdateContextLock(
          state.fallbackContextLocks,
          resolved.contextKey,
          lockHit,
          lowConfidenceContextReuse,
          reusedFallback
        )
      ) {
        state.fallbackContextLocks[resolved.contextKey] = id;
      }

      var jumpTarget = jumpTargetFromNode(node);
      if (jumpTarget && jumpTarget.setAttribute) {
        jumpTarget.setAttribute('data-cng-prompt-id', id);
      }
      elements.set(id, jumpTarget);
      visiblePromptIds.push(id);
    }

    if (mergePromptOrderWithVisible(visiblePromptIds)) {
      catalogChanged = true;
    }
    if (prunePromptCatalogByDomSnapshot(parsedPrompts, visiblePromptIds)) {
      catalogChanged = true;
      visiblePromptIds = state.promptOrder.slice();
    }
    if (pruneLegacyTurnPromptIdsWhenModernExists()) {
      catalogChanged = true;
    }

    state.promptElements = elements;
    if (syncMarkerAnchorsFromOffsets()) {
      catalogChanged = true;
    }

    var dataChanged = false;
    if (prePrunedLocks) {
      dataChanged = true;
    }
    if (catalogChanged || !state.prompts.length) {
      state.prompts = getOrderedPromptsFromCatalog();
      dataChanged = true;
    }

    var validPromptIds = new Set(
      state.prompts.map(function (prompt) {
        return prompt.id;
      })
    );

    if (catalogChanged) {
      var staleSplits = [];
      state.manualSplitStarts.forEach(function (promptId) {
        if (!validPromptIds.has(promptId)) {
          staleSplits.push(promptId);
        }
      });
      for (var j = 0; j < staleSplits.length; j += 1) {
        state.manualSplitStarts.delete(staleSplits[j]);
        state.markerSplitStarts.delete(staleSplits[j]);
      }
      if (staleSplits.length) {
        dataChanged = true;
      }

      var staleTitleIds = [];
      Object.keys(state.customSegmentTitles).forEach(function (promptId) {
        if (!validPromptIds.has(promptId)) {
          staleTitleIds.push(promptId);
        }
      });
      for (var k = 0; k < staleTitleIds.length; k += 1) {
        delete state.customSegmentTitles[staleTitleIds[k]];
      }
      if (staleTitleIds.length) {
        dataChanged = true;
      }
    }

    if (cleanupAndTrimContextLocks(validPromptIds)) {
      dataChanged = true;
    }

    if (pruneStaleMarkers()) {
      dataChanged = true;
    }
    if (pruneMarkerSplitStarts()) {
      dataChanged = true;
    }

    var validEntryIds = new Set(validPromptIds);
    for (var markerIdx = 0; markerIdx < state.markerOrder.length; markerIdx += 1) {
      validEntryIds.add(state.markerOrder[markerIdx]);
    }

    if (state.activeEntryId && !validEntryIds.has(state.activeEntryId)) {
      state.activeEntryId = '';
      dataChanged = true;
    }

    var stalePins = [];
    state.pins.forEach(function (entryId) {
      if (!validEntryIds.has(entryId)) {
        stalePins.push(entryId);
      }
    });
    for (var pinIdx = 0; pinIdx < stalePins.length; pinIdx += 1) {
      state.pins.delete(stalePins[pinIdx]);
    }
    if (stalePins.length) {
      dataChanged = true;
    }

    Object.keys(state.notes).forEach(function (entryId) {
      if (!validEntryIds.has(entryId)) {
        delete state.notes[entryId];
        state.noteEditorOpen.delete(entryId);
        delete state.aiItemSummaries[entryId];
        delete state.aiItemErrors[entryId];
        dataChanged = true;
      }
    });

    if (state.prompts.length > 0 && state.manualSplitStarts.has(state.prompts[0].id)) {
      state.manualSplitStarts.delete(state.prompts[0].id);
      state.markerSplitStarts.delete(state.prompts[0].id);
      dataChanged = true;
    }

    if (catalogChanged || !state.segments.length) {
      state.segments = buildSegments(state.prompts);
      syncExpandedSegments(state.segments);
      dataChanged = true;
    }

    var previousActivePromptId = state.activePromptId;
    var nextActivePromptId = getActivePromptId(elements);
    var activeChanged = nextActivePromptId !== state.activePromptId;
    if (activeChanged) {
      state.activePromptId = nextActivePromptId;
      if (nextActivePromptId && (!state.activeEntryId || state.activeEntryId === previousActivePromptId)) {
        state.activeEntryId = nextActivePromptId;
      }
    }

    if (!suppressRender) {
      if (forceRender || dataChanged) {
        render(forceRender);
      } else if (activeChanged) {
        syncActivePromptHighlight();
      }

      syncInlineMarkersInChatBody();
      scheduleAiSummaries();
    }

    if (dataChanged) {
      persistConversationState();
    }
  }
  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(function () {
      refreshPromptsFromDom();
    }, 360);
  }

  function syncNetworkState(options) {
    var opts = options || {};
    var wasOffline = state.isOffline;
    var offline = isNetworkOffline();
    state.isOffline = offline;

    if (opts.silent || wasOffline === offline) {
      return;
    }

    if (offline) {
      setStatNotice('Offline: using cached messages only', 2200);
      return;
    }

    setStatNotice('Back online. Refreshing navigator...', 1400);
    scheduleRefresh();
  }

  function bindNetworkEvents() {
    if (state.networkEventsBound) {
      return;
    }

    state.networkEventsBound = true;
    syncNetworkState({ silent: true });
    window.addEventListener('offline', function () {
      syncNetworkState();
    });
    window.addEventListener('online', function () {
      syncNetworkState();
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isScrollableElement(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    var style = window.getComputedStyle(element);
    var overflowY = style.overflowY || '';
    var scrollableY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    return scrollableY && element.scrollHeight > element.clientHeight + 4;
  }

  function getScrollableAncestor(element) {
    var current = element;
    while (current && current !== document.body) {
      if (isScrollableElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getChatScrollContainer() {
    var fromPrompt = null;
    state.promptElements.forEach(function (element) {
      if (!fromPrompt && element) {
        fromPrompt = element;
      }
    });

    var container = getScrollableAncestor(fromPrompt);
    if (container) {
      return container;
    }

    var fallbackSelectors = [
      'main [class*="overflow"][class*="auto"]',
      'main [class*="overflow-y"]',
      'main'
    ];
    for (var i = 0; i < fallbackSelectors.length; i += 1) {
      var candidate = document.querySelector(fallbackSelectors[i]);
      if (!candidate) {
        continue;
      }
      if (isScrollableElement(candidate)) {
        return candidate;
      }
      var nested = candidate.querySelector('div');
      if (isScrollableElement(nested)) {
        return nested;
      }
    }

    if (isScrollableElement(document.scrollingElement)) {
      return document.scrollingElement;
    }

    return null;
  }

  function getVisiblePromptIndexRange() {
    var min = Number.POSITIVE_INFINITY;
    var max = -1;
    var count = 0;

    for (var i = 0; i < state.prompts.length; i += 1) {
      var prompt = state.prompts[i];
      if (!state.promptElements.has(prompt.id)) {
        continue;
      }
      count += 1;
      if (prompt.index < min) {
        min = prompt.index;
      }
      if (prompt.index > max) {
        max = prompt.index;
      }
    }

    if (!count) {
      return { count: 0, min: -1, max: -1 };
    }
    return { count: count, min: min, max: max };
  }

  function getActivePromptId(elements) {
    if (!elements || !elements.size) {
      return '';
    }

    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportHeight) {
      return '';
    }

    var targetY = Math.max(36, viewportHeight * 0.32);
    var bestPromptId = '';
    var bestDistance = Number.POSITIVE_INFINITY;

    elements.forEach(function (element, promptId) {
      if (!element || !element.getBoundingClientRect) {
        return;
      }

      var rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportHeight) {
        return;
      }

      var anchorY = rect.top + Math.min(Math.max(rect.height * 0.35, 8), 42);
      var distance = Math.abs(anchorY - targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPromptId = promptId;
      }
    });

    if (bestPromptId) {
      return bestPromptId;
    }

    var fallbackId = '';
    var fallbackTop = -Number.POSITIVE_INFINITY;
    elements.forEach(function (candidateElement, promptId) {
      if (!candidateElement || !candidateElement.getBoundingClientRect) {
        return;
      }
      var candidateRect = candidateElement.getBoundingClientRect();
      if (candidateRect.top <= targetY && candidateRect.top > fallbackTop) {
        fallbackTop = candidateRect.top;
        fallbackId = promptId;
      }
    });

    return fallbackId;
  }

  function syncActivePromptHighlight() {
    var container = document.getElementById('cng-nav-content');
    if (!container) {
      return;
    }

    var items = container.querySelectorAll('.cng-prompt-item');
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var entryId = item.getAttribute('data-entry-id');
      var promptId = item.getAttribute('data-prompt-id');
      var isActiveEntry = Boolean(state.activeEntryId && entryId && state.activeEntryId === entryId);
      var isActivePrompt = Boolean(!isActiveEntry && state.activePromptId && promptId && promptId === state.activePromptId);
      if (isActiveEntry || isActivePrompt) {
        item.classList.add('cng-prompt-item-active');
      } else {
        item.classList.remove('cng-prompt-item-active');
      }
    }
    syncJumpDock(state.query || '', state.pinnedOnly);
  }
  function getScrollDirection(targetIndex, visibleRange, previousDirection) {
    if (targetIndex < 0) {
      return previousDirection || 1;
    }

    if (!visibleRange.count) {
      return targetIndex > 0 ? 1 : -1;
    }

    if (targetIndex < visibleRange.min) {
      return -1;
    }
    if (targetIndex > visibleRange.max) {
      return 1;
    }

    if (previousDirection) {
      return previousDirection;
    }
    return 1;
  }

  function setStatNotice(message, durationMs) {
    state.statNotice = message || '';
    render(true);
    clearTimeout(state.noticeTimer);
    if (!message) {
      return;
    }

    state.noticeTimer = setTimeout(function () {
      state.statNotice = '';
      render(true);
    }, durationMs || 1800);
  }

  async function tryLoadPromptElementByScroll(promptId, targetIndex, expectedPromptText) {
    var container = getChatScrollContainer();
    if (!container) {
      return null;
    }

    var maxAttempts = state.isOffline ? 18 : 28;
    var step = Math.max(260, Math.floor(container.clientHeight * 0.8));
    var direction = 1;

    for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
      refreshPromptsFromDom({ suppressRender: true });
      var found = state.promptElements.get(promptId);
      if (found && (!expectedPromptText || isLikelyMatchingPromptTarget(found, expectedPromptText))) {
        return found;
      }

      var visibleRange = getVisiblePromptIndexRange();
      direction = getScrollDirection(targetIndex, visibleRange, direction);

      var beforeTop = container.scrollTop;
      var nextTop;
      if (direction < 0) {
        nextTop = Math.max(0, beforeTop - step);
      } else {
        nextTop = Math.min(container.scrollHeight - container.clientHeight, beforeTop + step);
      }

      if (nextTop === beforeTop) {
        direction = direction * -1;
        if (direction < 0) {
          nextTop = Math.max(0, beforeTop - step);
        } else {
          nextTop = Math.min(container.scrollHeight - container.clientHeight, beforeTop + step);
        }
      }

      if (nextTop === beforeTop) {
        break;
      }

      container.scrollTop = nextTop;
      await sleep(130);
      refreshPromptsFromDom({ suppressRender: true });
      found = state.promptElements.get(promptId);
      if (found && (!expectedPromptText || isLikelyMatchingPromptTarget(found, expectedPromptText))) {
        return found;
      }
    }

    return null;
  }

  function applyJumpHighlight(element) {
    if (!element || !element.classList) {
      return;
    }

    element.classList.add('cng-nav-highlight');
    setTimeout(function () {
      element.classList.remove('cng-nav-highlight');
    }, 1300);
  }

  function getUserPromptTextFromTarget(target) {
    if (!target) {
      return '';
    }
    var promptNode = null;
    if (target.matches && target.matches(SELECTOR_USER_PROMPT)) {
      promptNode = target;
    } else if (target.querySelector) {
      promptNode = target.querySelector(SELECTOR_USER_PROMPT);
    }
    if (!promptNode) {
      promptNode = target;
    }
    return normalizeWhitespace((promptNode.innerText || promptNode.textContent || ''));
  }

  function isLikelyMatchingPromptTarget(target, expectedPromptText) {
    var expected = normalizeWhitespace(expectedPromptText || '');
    if (!expected) {
      return true;
    }
    var actual = getUserPromptTextFromTarget(target);
    if (!actual) {
      return false;
    }
    if (actual === expected) {
      return true;
    }
    var expectedHead = expected.slice(0, 84);
    var actualHead = actual.slice(0, 84);
    if (expectedHead && actual.indexOf(expectedHead) === 0) {
      return true;
    }
    if (actualHead && expected.indexOf(actualHead) === 0) {
      return true;
    }
    return false;
  }

  function scorePromptTextMatch(actualText, expectedText) {
    var actual = normalizeWhitespace(actualText || '');
    var expected = normalizeWhitespace(expectedText || '');
    if (!actual || !expected) {
      return 0;
    }
    if (actual === expected) {
      return 10000;
    }

    var score = 0;
    var expectedHead = expected.slice(0, 120);
    var actualHead = actual.slice(0, 120);
    if (expectedHead && actual.indexOf(expectedHead) === 0) {
      score += 9000;
    }
    if (actualHead && expected.indexOf(actualHead) === 0) {
      score += 6500;
    }

    var expectedShort = expected.slice(0, 42);
    if (expectedShort && actual.indexOf(expectedShort) !== -1) {
      score += 2800;
    }
    var actualShort = actual.slice(0, 42);
    if (actualShort && expected.indexOf(actualShort) !== -1) {
      score += 1800;
    }

    score -= Math.abs(actual.length - expected.length) * 0.02;
    return score;
  }

  function findBestVisiblePromptTargetByText(expectedPromptText) {
    var expected = normalizeWhitespace(expectedPromptText || '');
    if (!expected) {
      return null;
    }
    var candidates = Array.from(document.querySelectorAll(SELECTOR_USER_PROMPT));
    if (!candidates.length) {
      return null;
    }

    var viewportHeight = Number(window.innerHeight || 0);
    var bestNode = null;
    var bestScore = Number.NEGATIVE_INFINITY;
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (!candidate) {
        continue;
      }
      var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
      if (rect && viewportHeight > 0 && (rect.bottom < -120 || rect.top > viewportHeight + 120)) {
        continue;
      }
      var text = getPromptText(candidate);
      if (!text) {
        continue;
      }
      var score = scorePromptTextMatch(text, expected);
      if (rect && viewportHeight > 0 && rect.bottom > 0 && rect.top < viewportHeight) {
        score += 120;
      }
      if (score > bestScore) {
        bestScore = score;
        bestNode = candidate;
      }
    }

    if (!bestNode || bestScore < 800) {
      return null;
    }
    return jumpTargetFromNode(bestNode);
  }

  function scrollPromptToAnchor(target, anchorRatio) {
    if (!target || !target.getBoundingClientRect) {
      return false;
    }

    var ratio = normalizeMarkerAnchorRatio(anchorRatio);
    var targetRect = target.getBoundingClientRect();
    if (!targetRect || targetRect.height <= 1) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return false;
    }

    var container = getChatScrollContainer();
    var containerRect = container && container.getBoundingClientRect ? container.getBoundingClientRect() : null;
    var viewportTop = containerRect && Number.isFinite(containerRect.top) ? containerRect.top : 0;
    var viewportHeight = container && typeof container.clientHeight === 'number' && container.clientHeight > 0
      ? container.clientHeight
      : Number(window.innerHeight || 0);
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      viewportHeight = Number(window.innerHeight || 0) || targetRect.height;
    }

    var targetPointY = targetRect.top + (targetRect.height * ratio);
    var desiredPointY = viewportTop + (viewportHeight / 2);
    var deltaY = targetPointY - desiredPointY;
    if (!Number.isFinite(deltaY)) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return false;
    }

    if (container && typeof container.scrollTop === 'number') {
      var maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      var nextTop = clampNumber(container.scrollTop + deltaY, 0, maxScrollTop, container.scrollTop);
      if (nextTop === container.scrollTop) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return false;
      }
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: nextTop, behavior: 'smooth' });
      } else {
        container.scrollTop = nextTop;
      }
      return true;
    }

    if (typeof window.scrollBy === 'function') {
      window.scrollBy({ top: deltaY, behavior: 'smooth' });
      return true;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    return false;
  }

  async function jumpToPrompt(promptId, anchorRatio) {
    state.activeEntryId = promptId || '';
    persistConversationState();
    syncJumpDock(state.query || '', state.pinnedOnly);
    var targetAnchorRatio = arguments.length > 1 ? normalizeMarkerAnchorRatio(anchorRatio) : 0.5;
    var targetPrompt = getPromptById(promptId);
    var expectedPromptText = targetPrompt ? targetPrompt.text : '';
    var target = state.promptElements.get(promptId);
    if (!target) {
      refreshPromptsFromDom();
      target = state.promptElements.get(promptId);
    }

    if (!target) {
      var targetIndex = targetPrompt ? targetPrompt.index : state.promptOrder.indexOf(promptId);
      target = await tryLoadPromptElementByScroll(promptId, targetIndex, expectedPromptText);
    }

    if (!target || !target.scrollIntoView) {
      setStatNotice(state.isOffline ? 'Offline: target prompt is not in current page cache' : 'Prompt not loaded yet', 2000);
      return;
    }

    scrollPromptToAnchor(target, targetAnchorRatio);
    applyJumpHighlight(target);
    setStatNotice('', 0);
  }

  function jumpToMarker(markerId) {
    state.activeEntryId = markerId || '';
    persistConversationState();
    syncJumpDock(state.query || '', state.pinnedOnly);
    var marker = getMarkerById(markerId);
    if (!marker) {
      return;
    }

    var offset = getMarkerAnchorOffset(marker);
    var container = getChatScrollContainer();
    if (container && Number.isFinite(offset) && typeof container.scrollTop === 'number') {
      var maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      var targetTop = clampNumber(offset - container.clientHeight / 2, 0, maxTop, container.scrollTop);
      try {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } catch (error) {
        container.scrollTop = targetTop;
      }
      setStatNotice('', 0);
      return;
    }

    if (marker.anchorPromptId) {
      jumpToPrompt(marker.anchorPromptId, marker.anchorRatio);
    }
  }

  function getPromptById(promptId) {
    for (var i = 0; i < state.prompts.length; i += 1) {
      if (state.prompts[i].id === promptId) {
        return state.prompts[i];
      }
    }
    return null;
  }

  function getPromptIndexById(promptId) {
    var prompt = getPromptById(promptId);
    return prompt && typeof prompt.index === 'number' ? prompt.index : Number.MAX_SAFE_INTEGER;
  }

  function getMarkerViewportMidPoint() {
    var scrollContainer = getChatScrollContainer();
    if (scrollContainer && scrollContainer.getBoundingClientRect) {
      var containerRect = scrollContainer.getBoundingClientRect();
      if (containerRect && containerRect.width > 10 && containerRect.height > 10) {
        return {
          x: containerRect.left + containerRect.width / 2,
          y: containerRect.top + containerRect.height / 2
        };
      }
    }

    var main = document.querySelector('main');
    if (main && main.getBoundingClientRect) {
      var rect = main.getBoundingClientRect();
      if (rect && rect.width > 10 && rect.height > 10) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
  }

  function resolveViewportMidlineMarkerAnchor() {
    var midPoint = getMarkerViewportMidPoint();
    if (!midPoint || !Number.isFinite(midPoint.y) || !Number.isFinite(midPoint.x)) {
      return null;
    }
    var directDrop = resolveMarkerDropTarget(midPoint.x, midPoint.y);
    if (directDrop && directDrop.promptId) {
      return directDrop;
    }

    var viewportHeight = Number(window.innerHeight || 0);
    var midY = midPoint.y;
    var bestPromptId = '';
    var bestRatio = 0.5;
    var bestDistance = Number.POSITIVE_INFINITY;

    state.promptElements.forEach(function (node, promptId) {
      if (!node || !node.getBoundingClientRect || !promptId) {
        return;
      }
      var rect = node.getBoundingClientRect();
      if (!rect || rect.height <= 1) {
        return;
      }

      var centerY = rect.top + rect.height / 2;
      var distance = Math.abs(centerY - midY);
      var intersectsViewport = rect.bottom > 0 && rect.top < viewportHeight;

      if (intersectsViewport && midY >= rect.top && midY <= rect.bottom) {
        distance = Math.max(0, distance - 2000);
      } else if (!intersectsViewport) {
        distance += 1200;
      }

      if (distance >= bestDistance) {
        return;
      }
      bestDistance = distance;
      bestPromptId = promptId;
      bestRatio = normalizeMarkerAnchorRatio((midY - rect.top) / rect.height);
    });

    if (!bestPromptId) {
      return null;
    }

    return {
      promptId: bestPromptId,
      ratio: bestRatio
    };
  }

  function normalizeMarkerAnchorRatio(rawRatio) {
    return clampNumber(rawRatio, 0, 0.98, 0.5);
  }

  function normalizeMarkerAnchorOffset(rawOffset) {
    var offset = Number(rawOffset);
    if (!Number.isFinite(offset) || offset < 0) {
      return null;
    }
    return Math.max(0, offset);
  }

  function normalizeMarkerColor(rawColor) {
    var color = normalizeWhitespace(rawColor || '').toUpperCase();
    if (!color) {
      return MARKER_DEFAULT_COLOR;
    }
    if (/^#[0-9A-F]{3}$/.test(color)) {
      return '#' + color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3);
    }
    if (/^#[0-9A-F]{6}$/.test(color)) {
      return color;
    }
    return MARKER_DEFAULT_COLOR;
  }

  function parseHexColor(hexColor) {
    var normalized = normalizeMarkerColor(hexColor);
    var match = normalized.match(/^#([0-9A-F]{6})$/i);
    if (!match) {
      return { r: 250, g: 204, b: 21 };
    }
    var value = match[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function markerVisualStyle(colorHex, strong) {
    var rgb = parseHexColor(colorHex);
    var alphaBase = strong ? 0.28 : 0.2;
    var textR = Math.min(255, rgb.r + 26);
    var textG = Math.min(255, rgb.g + 26);
    var textB = Math.min(255, rgb.b + 26);
    return {
      border: 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.88)',
      background: 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alphaBase + ')',
      text: 'rgb(' + textR + ', ' + textG + ', ' + textB + ')'
    };
  }

  function ensureMarkerShape(marker) {
    if (!marker || typeof marker !== 'object') {
      return null;
    }
    marker.label = shortText(normalizeWhitespace(marker.label || 'Checkpoint') || 'Checkpoint', 56);
    marker.anchorRatio = normalizeMarkerAnchorRatio(marker.anchorRatio);
    marker.color = normalizeMarkerColor(marker.color || MARKER_DEFAULT_COLOR);
    marker.anchorOffset = normalizeMarkerAnchorOffset(marker.anchorOffset);
    return marker;
  }

  function estimateMarkerOffsetFromAnchor(marker) {
    var safeMarker = ensureMarkerShape(marker);
    if (!safeMarker || !safeMarker.anchorPromptId) {
      return null;
    }
    var container = getChatScrollContainer();
    var anchor = state.promptElements.get(safeMarker.anchorPromptId);
    if (!container || !anchor || !container.getBoundingClientRect || !anchor.getBoundingClientRect) {
      return null;
    }
    var containerRect = container.getBoundingClientRect();
    var anchorRect = anchor.getBoundingClientRect();
    if (!containerRect || !anchorRect || anchorRect.height <= 0) {
      return null;
    }
    return Math.max(
      0,
      (container.scrollTop || 0) +
      (anchorRect.top - containerRect.top) +
      (normalizeMarkerAnchorRatio(safeMarker.anchorRatio) * anchorRect.height)
    );
  }

  function getMarkerAnchorOffset(marker) {
    var safeMarker = ensureMarkerShape(marker);
    if (!safeMarker) {
      return null;
    }
    if (Number.isFinite(safeMarker.anchorOffset)) {
      return Math.max(0, safeMarker.anchorOffset);
    }
    var estimated = estimateMarkerOffsetFromAnchor(safeMarker);
    if (!Number.isFinite(estimated)) {
      return null;
    }
    safeMarker.anchorOffset = estimated;
    return estimated;
  }

  function resolveMarkerPromptAnchorAtOffset(anchorOffset) {
    var targetOffset = normalizeMarkerAnchorOffset(anchorOffset);
    if (!Number.isFinite(targetOffset)) {
      return null;
    }
    var container = getChatScrollContainer();
    if (!container || !container.getBoundingClientRect) {
      return null;
    }
    var containerRect = container.getBoundingClientRect();
    if (!containerRect) {
      return null;
    }

    var best = null;
    var bestScore = Number.POSITIVE_INFINITY;
    state.promptElements.forEach(function (node, promptId) {
      if (!node || !promptId || !node.getBoundingClientRect || !getPromptById(promptId)) {
        return;
      }
      var rect = node.getBoundingClientRect();
      if (!rect || rect.height <= 1) {
        return;
      }
      var topOffset = (container.scrollTop || 0) + (rect.top - containerRect.top);
      var bottomOffset = topOffset + rect.height;
      var edgeDistance = 0;
      if (targetOffset < topOffset) {
        edgeDistance = topOffset - targetOffset;
      } else if (targetOffset > bottomOffset) {
        edgeDistance = targetOffset - bottomOffset;
      }
      var centerOffset = topOffset + rect.height / 2;
      var centerDistance = Math.abs(centerOffset - targetOffset);
      var score = edgeDistance * 1000 + centerDistance;
      if (score >= bestScore) {
        return;
      }
      bestScore = score;
      best = {
        promptId: promptId,
        ratio: normalizeMarkerAnchorRatio((targetOffset - topOffset) / rect.height)
      };
    });

    if (best) {
      return best;
    }
    if (state.activePromptId && getPromptById(state.activePromptId)) {
      return { promptId: state.activePromptId, ratio: 0.5 };
    }
    if (state.prompts.length) {
      return { promptId: state.prompts[0].id, ratio: 0.5 };
    }
    return null;
  }

  function syncMarkerAnchorsFromOffsets() {
    var changed = false;
    for (var i = 0; i < state.markerOrder.length; i += 1) {
      var marker = getMarkerById(state.markerOrder[i]);
      if (!marker) {
        continue;
      }
      var offset = getMarkerAnchorOffset(marker);
      if (!Number.isFinite(offset)) {
        continue;
      }
      var nextAnchor = resolveMarkerPromptAnchorAtOffset(offset);
      if (!nextAnchor || !nextAnchor.promptId) {
        continue;
      }
      if (marker.anchorPromptId !== nextAnchor.promptId || Math.abs(marker.anchorRatio - nextAnchor.ratio) > 0.001) {
        marker.anchorPromptId = nextAnchor.promptId;
        marker.anchorRatio = nextAnchor.ratio;
        changed = true;
      }
    }
    if (changed) {
      sortMarkerOrderByPosition();
    }
    return changed;
  }

  function markerSortScore(marker) {
    var safeMarker = ensureMarkerShape(marker);
    if (!safeMarker) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (Number.isFinite(safeMarker.anchorOffset)) {
      var resolved = resolveMarkerPromptAnchorAtOffset(safeMarker.anchorOffset);
      if (resolved && resolved.promptId) {
        safeMarker.anchorPromptId = resolved.promptId;
        safeMarker.anchorRatio = normalizeMarkerAnchorRatio(resolved.ratio);
        return getPromptIndexById(safeMarker.anchorPromptId) + normalizeMarkerAnchorRatio(safeMarker.anchorRatio);
      }
    }
    return getPromptIndexById(safeMarker.anchorPromptId) + normalizeMarkerAnchorRatio(safeMarker.anchorRatio);
  }

  function sortMarkerOrderByPosition() {
    state.markerOrder.sort(function (a, b) {
      var markerA = getMarkerById(a);
      var markerB = getMarkerById(b);
      var scoreA = markerSortScore(markerA);
      var scoreB = markerSortScore(markerB);
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      var createdA = markerA && typeof markerA.createdAt === 'number' ? markerA.createdAt : 0;
      var createdB = markerB && typeof markerB.createdAt === 'number' ? markerB.createdAt : 0;
      return createdA - createdB;
    });
  }

  function createMarkerId() {
    return 'mk-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1679616).toString(36);
  }

  function getMarkerById(markerId) {
    if (!markerId || !state.markers || typeof state.markers !== 'object') {
      return null;
    }
    var marker = state.markers[markerId];
    if (!marker || typeof marker !== 'object') {
      return null;
    }
    return ensureMarkerShape(marker);
  }

  function getMarkersForPrompt(promptId) {
    if (!promptId) {
      return [];
    }
    var list = [];
    for (var i = 0; i < state.markerOrder.length; i += 1) {
      var markerId = state.markerOrder[i];
      var marker = getMarkerById(markerId);
      if (!marker || marker.anchorPromptId !== promptId) {
        continue;
      }
      list.push(marker);
    }
    return list.sort(function (a, b) {
      return markerSortScore(a) - markerSortScore(b);
    });
  }

  function hasPinnedMarkerForPrompt(promptId) {
    var markers = getMarkersForPrompt(promptId);
    for (var i = 0; i < markers.length; i += 1) {
      if (state.pins.has(markers[i].id)) {
        return true;
      }
    }
    return false;
  }

  function hasMatchedMarkerForPrompt(promptId, queryLower, pinnedOnly) {
    var markers = getMarkersForPrompt(promptId);
    for (var i = 0; i < markers.length; i += 1) {
      var marker = markers[i];
      if (pinnedOnly && !state.pins.has(marker.id)) {
        continue;
      }
      if (!queryLower) {
        return true;
      }
      var markerText = [
        getPrimaryMarkerDisplayText(marker),
        marker.label || '',
        state.notes[marker.id] || ''
      ].join(' ');
      if (markerText.toLowerCase().indexOf(queryLower) !== -1) {
        return true;
      }
    }
    return false;
  }

  function getChatBodyRect() {
    var container = getChatScrollContainer();
    if (container && container.getBoundingClientRect) {
      var rect = container.getBoundingClientRect();
      if (rect && rect.width > 12 && rect.height > 12) {
        return rect;
      }
    }
    var main = document.querySelector('main');
    if (main && main.getBoundingClientRect) {
      var mainRect = main.getBoundingClientRect();
      if (mainRect && mainRect.width > 12 && mainRect.height > 12) {
        return mainRect;
      }
    }
    return null;
  }

  function isPointInsideChatBody(clientX, clientY) {
    var rect = getChatBodyRect();
    if (!rect) {
      return false;
    }
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function getMarkerPlacementHintEl() {
    var hint = document.getElementById('cng-marker-placement-hint');
    if (hint) {
      return hint;
    }
    hint = document.createElement('div');
    hint.id = 'cng-marker-placement-hint';
    hint.className = 'cng-marker-placement-hint';
    hint.innerHTML = '<div class="cng-marker-placement-line"></div><div class="cng-marker-placement-dot"></div>';
    document.body.appendChild(hint);
    return hint;
  }

  function hideMarkerPlacementHint() {
    var hint = document.getElementById('cng-marker-placement-hint');
    if (!hint) {
      return;
    }
    hint.classList.remove('cng-marker-placement-hint-active');
  }

  function showMarkerPlacementHint(clientY) {
    var rect = getChatBodyRect();
    if (!rect) {
      hideMarkerPlacementHint();
      return;
    }
    var clampedY = clampNumber(clientY, rect.top, rect.bottom, rect.top + rect.height / 2);
    var hint = getMarkerPlacementHintEl();
    hint.style.left = Math.max(0, Math.round(rect.left + 8)) + 'px';
    hint.style.width = Math.max(48, Math.round(rect.width - 16)) + 'px';
    hint.style.top = Math.round(clampedY) + 'px';
    hint.classList.add('cng-marker-placement-hint-active');
  }

  function resetMarkerPlacementState() {
    state.markerPlacement.active = false;
    state.markerPlacement.mode = 'idle';
    state.markerPlacement.markerId = '';
    state.markerPlacement.draftLabel = '';
    state.markerPlacement.draftColor = MARKER_DEFAULT_COLOR;
  }

  function stopMarkerPlacementMode() {
    resetMarkerPlacementState();
    hideMarkerPlacementHint();
  }

  function beginMarkerPlacementMode(mode, options) {
    var opts = options || {};
    state.markerPlacement.active = true;
    state.markerPlacement.mode = mode === 'move' ? 'move' : 'create';
    state.markerPlacement.markerId = normalizeWhitespace(opts.markerId || '');
    state.markerPlacement.draftLabel = shortText(normalizeWhitespace(opts.label || 'Checkpoint') || 'Checkpoint', 56);
    state.markerPlacement.draftColor = normalizeMarkerColor(opts.color || MARKER_DEFAULT_COLOR);

    var midPoint = getMarkerViewportMidPoint();
    showMarkerPlacementHint(midPoint ? midPoint.y : window.innerHeight / 2);
    setStatNotice('Click chat body to place marker (Esc to cancel)', 2800);
  }

  function createMarkerAtAnchor(anchorPromptId, anchorRatio, label, color, anchorOffset) {
    var anchorPrompt = getPromptById(anchorPromptId);
    if (!anchorPrompt) {
      return null;
    }

    var normalizedOffset = normalizeMarkerAnchorOffset(anchorOffset);
    if (!Number.isFinite(normalizedOffset)) {
      normalizedOffset = estimateMarkerOffsetFromAnchor({
        anchorPromptId: anchorPrompt.id,
        anchorRatio: normalizeMarkerAnchorRatio(anchorRatio)
      });
    }

    var markerId = createMarkerId();
    state.markers[markerId] = {
      id: markerId,
      anchorPromptId: anchorPrompt.id,
      label: shortText(normalizeWhitespace(label || 'Checkpoint') || 'Checkpoint', 56),
      color: normalizeMarkerColor(color || MARKER_DEFAULT_COLOR),
      anchorRatio: normalizeMarkerAnchorRatio(anchorRatio),
      anchorOffset: normalizeMarkerAnchorOffset(normalizedOffset),
      createdAt: Date.now()
    };
    state.markerOrder.push(markerId);
    sortMarkerOrderByPosition();
    return markerId;
  }

  function applyMarkerDrop(markerDrop) {
    if (!state.markerPlacement.active || !markerDrop || !markerDrop.promptId) {
      return false;
    }
    var targetPrompt = getPromptById(markerDrop.promptId);
    if (!targetPrompt) {
      return false;
    }
    var targetRatio = normalizeMarkerAnchorRatio(markerDrop.ratio);
    var targetOffset = normalizeMarkerAnchorOffset(markerDrop.offset);
    if (state.markerPlacement.mode === 'move') {
      var marker = getMarkerById(state.markerPlacement.markerId);
      if (!marker) {
        return false;
      }
      marker.anchorPromptId = targetPrompt.id;
      marker.anchorRatio = targetRatio;
      marker.anchorOffset = Number.isFinite(targetOffset)
        ? targetOffset
        : estimateMarkerOffsetFromAnchor(marker);
      sortMarkerOrderByPosition();
      persistConversationState();
      refreshPromptsFromDom({ forceRender: true });
      setStatNotice('Marker moved', 1200);
      return true;
    }

    var created = createMarkerAtAnchor(
      targetPrompt.id,
      targetRatio,
      state.markerPlacement.draftLabel || 'Checkpoint',
      state.markerPlacement.draftColor || MARKER_DEFAULT_COLOR,
      targetOffset
    );
    if (!created) {
      return false;
    }
    persistConversationState();
    refreshPromptsFromDom({ forceRender: true });
    setStatNotice('Marker added', 1200);
    return true;
  }

  function addMarkerByPlacement() {
    refreshPromptsFromDom({ suppressRender: true });
    if (!state.prompts.length) {
      return;
    }

    var labelDefault = 'Checkpoint #' + (state.markerOrder.length + 1);
    var labelInput = window.prompt('Marker title', labelDefault);
    if (labelInput === null) {
      return;
    }
    var colorInput = window.prompt('Marker color (hex, e.g. #FACC15)', MARKER_DEFAULT_COLOR);
    if (colorInput === null) {
      return;
    }
    beginMarkerPlacementMode('create', {
      label: normalizeWhitespace(labelInput || '') || labelDefault,
      color: normalizeMarkerColor(colorInput || MARKER_DEFAULT_COLOR)
    });
  }

  function moveMarkerByPlacement(markerId) {
    var marker = getMarkerById(markerId);
    if (!marker) {
      return;
    }
    beginMarkerPlacementMode('move', {
      markerId: marker.id,
      label: marker.label || 'Checkpoint',
      color: marker.color || MARKER_DEFAULT_COLOR
    });
  }

  function renameMarker(markerId) {
    var marker = getMarkerById(markerId);
    if (!marker) {
      return;
    }
    var nextLabel = window.prompt('Rename marker', marker.label || 'Checkpoint');
    if (nextLabel === null) {
      return;
    }
    marker.label = shortText(normalizeWhitespace(nextLabel || '') || 'Checkpoint', 56);
    persistConversationState();
    refreshPromptsFromDom({ forceRender: true });
  }

  function recolorMarker(markerId) {
    var marker = getMarkerById(markerId);
    if (!marker) {
      return;
    }
    var colorInput = window.prompt('Marker color (hex, e.g. #FACC15)', marker.color || MARKER_DEFAULT_COLOR);
    if (colorInput === null) {
      return;
    }
    marker.color = normalizeMarkerColor(colorInput || MARKER_DEFAULT_COLOR);
    persistConversationState();
    refreshPromptsFromDom({ forceRender: true });
  }

  function removeMarker(markerId) {
    var marker = getMarkerById(markerId);
    if (!marker) {
      return;
    }
    delete state.markers[markerId];
    state.markerOrder = state.markerOrder.filter(function (id) {
      return id !== markerId;
    });
    state.pins.delete(markerId);
    delete state.notes[markerId];
    delete state.aiItemSummaries[markerId];
    delete state.aiItemErrors[markerId];
    state.noteEditorOpen.delete(markerId);
    persistConversationState();
    refreshPromptsFromDom({ forceRender: true });
    setStatNotice('Marker removed', 1200);
  }

  function pruneStaleMarkers() {
    var validPromptIds = new Set(state.prompts.map(function (prompt) {
      return prompt.id;
    }));
    var changed = false;
    var nextOrder = [];
    for (var i = 0; i < state.markerOrder.length; i += 1) {
      var markerId = state.markerOrder[i];
      var marker = getMarkerById(markerId);
      if (!marker || !validPromptIds.has(marker.anchorPromptId)) {
        if (markerId) {
          delete state.markers[markerId];
          delete state.notes[markerId];
          delete state.aiItemSummaries[markerId];
          delete state.aiItemErrors[markerId];
          state.noteEditorOpen.delete(markerId);
        }
        changed = true;
        continue;
      }
      nextOrder.push(markerId);
    }
    if (nextOrder.length !== state.markerOrder.length) {
      changed = true;
    }
    state.markerOrder = nextOrder;
    sortMarkerOrderByPosition();
    return changed;
  }

  function pruneMarkerSplitStarts() {
    var changed = false;
    var markerAnchors = new Set();
    for (var i = 0; i < state.markerOrder.length; i += 1) {
      var marker = getMarkerById(state.markerOrder[i]);
      if (marker && marker.anchorPromptId) {
        markerAnchors.add(marker.anchorPromptId);
      }
    }

    var stale = [];
    state.markerSplitStarts.forEach(function (promptId) {
      if (!state.manualSplitStarts.has(promptId) || !markerAnchors.has(promptId)) {
        stale.push(promptId);
      }
    });
    for (var j = 0; j < stale.length; j += 1) {
      state.markerSplitStarts.delete(stale[j]);
    }
    if (stale.length) {
      changed = true;
    }
    return changed;
  }

  function buildSegmentTimelineItems(segment, visiblePrompts, queryLower, pinnedOnly) {
    var timeline = [];
    for (var i = 0; i < visiblePrompts.length; i += 1) {
      var prompt = visiblePrompts[i];
      var markers = getMarkersForPrompt(prompt.id);
      for (var j = 0; j < markers.length; j += 1) {
        var marker = markers[j];
        var markerText = [
          getPrimaryMarkerDisplayText(marker),
          marker.label || '',
          state.notes[marker.id] || ''
        ].join(' ');
        var markerMatched = !queryLower || markerText.toLowerCase().indexOf(queryLower) !== -1;
        if (pinnedOnly && !state.pins.has(marker.id)) {
          markerMatched = false;
        }
        if (markerMatched) {
          timeline.push({
            type: 'marker',
            id: marker.id,
            marker: marker,
            anchorPrompt: prompt,
            sortScore: markerSortScore(marker)
          });
        }
      }

      if (!pinnedOnly || state.pins.has(prompt.id)) {
        timeline.push({
          type: 'prompt',
          id: prompt.id,
          prompt: prompt,
          sortScore: prompt.index + 0.5
        });
      }
    }
    return timeline.sort(function (a, b) {
      if (a.sortScore !== b.sortScore) {
        return a.sortScore - b.sortScore;
      }
      if (a.type !== b.type) {
        return a.type === 'marker' ? -1 : 1;
      }
      if (a.type === 'marker' && b.type === 'marker') {
        var markerA = a.marker || getMarkerById(a.id);
        var markerB = b.marker || getMarkerById(b.id);
        var createdA = markerA && typeof markerA.createdAt === 'number' ? markerA.createdAt : 0;
        var createdB = markerB && typeof markerB.createdAt === 'number' ? markerB.createdAt : 0;
        if (createdA !== createdB) {
          return createdA - createdB;
        }
      }
      if (a.type === 'prompt' && b.type === 'prompt') {
        var idxA = a.prompt && typeof a.prompt.index === 'number' ? a.prompt.index : Number.MAX_SAFE_INTEGER;
        var idxB = b.prompt && typeof b.prompt.index === 'number' ? b.prompt.index : Number.MAX_SAFE_INTEGER;
        if (idxA !== idxB) {
          return idxA - idxB;
        }
      }
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function resolveMarkerDropTarget(clientX, clientY) {
    var container = getChatScrollContainer();
    var containerRect = container && container.getBoundingClientRect ? container.getBoundingClientRect() : null;
    var containerScrollTop = container && typeof container.scrollTop === 'number' ? container.scrollTop : 0;
    var contentHeight = container
      ? Math.max(Number(container.scrollHeight) || 0, Number(container.clientHeight) || 0)
      : 0;
    var offset = null;
    if (containerRect) {
      var rawOffset = containerScrollTop + (clientY - containerRect.top);
      offset = clampNumber(rawOffset, 0, Math.max(0, contentHeight), Math.max(0, rawOffset));
    }

    function normalizePromptAnchorId(rawId) {
      var id = normalizeWhitespace(rawId || '');
      if (!id) {
        return '';
      }
      return getPromptById(id) ? id : '';
    }

    function addCandidate(candidates, seenPromptIds, promptId, node) {
      var normalizedPromptId = normalizePromptAnchorId(promptId);
      if (!normalizedPromptId || seenPromptIds.has(normalizedPromptId) || !node || !node.getBoundingClientRect) {
        return;
      }
      var rect = node.getBoundingClientRect();
      if (!rect || rect.height <= 0 || rect.width <= 0) {
        return;
      }
      seenPromptIds.add(normalizedPromptId);
      candidates.push({
        promptId: normalizedPromptId,
        element: node,
        rect: rect
      });
    }

    var hit = document.elementFromPoint(clientX, clientY);
    var promptElement = hit && hit.closest ? hit.closest('[data-cng-prompt-id]') : null;
    var promptId = normalizePromptAnchorId(promptElement ? promptElement.getAttribute('data-cng-prompt-id') : '');
    var rect = promptElement && promptElement.getBoundingClientRect ? promptElement.getBoundingClientRect() : null;

    if (!promptId || !rect || rect.height <= 0) {
      var candidates = [];
      var seenPromptIds = new Set();

      var attrNodes = document.querySelectorAll('[data-cng-prompt-id]');
      for (var nodeIdx = 0; nodeIdx < attrNodes.length; nodeIdx += 1) {
        var node = attrNodes[nodeIdx];
        addCandidate(candidates, seenPromptIds, node && node.getAttribute ? node.getAttribute('data-cng-prompt-id') : '', node);
      }

      state.promptElements.forEach(function (node, id) {
        addCandidate(candidates, seenPromptIds, id, node);
      });

      var bestCandidate = null;
      var bestScore = Number.POSITIVE_INFINITY;
      for (var i = 0; i < candidates.length; i += 1) {
        var candidate = candidates[i];
        var candidateRect = candidate.rect;
        var edgeDistance = 0;
        if (clientY < candidateRect.top) {
          edgeDistance = candidateRect.top - clientY;
        } else if (clientY > candidateRect.bottom) {
          edgeDistance = clientY - candidateRect.bottom;
        }
        var centerY = candidateRect.top + candidateRect.height / 2;
        var centerDistance = Math.abs(centerY - clientY);
        var score = edgeDistance * 1000 + centerDistance;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        promptId = bestCandidate.promptId;
        promptElement = bestCandidate.element;
        rect = bestCandidate.rect;
      }
    }

    var ratio = 0.5;
    if (promptId && promptElement && rect && rect.height > 0) {
      if (rect.height > 1) {
        ratio = normalizeMarkerAnchorRatio((clientY - rect.top) / rect.height);
      }
      return {
        promptId: promptId,
        ratio: ratio,
        offset: normalizeMarkerAnchorOffset(offset)
      };
    }

    var anchorFromOffset = resolveMarkerPromptAnchorAtOffset(offset);
    if (!anchorFromOffset || !anchorFromOffset.promptId) {
      return null;
    }
    return {
      promptId: anchorFromOffset.promptId,
      ratio: normalizeMarkerAnchorRatio(anchorFromOffset.ratio),
      offset: normalizeMarkerAnchorOffset(offset)
    };
  }

  function bindInlineMarkerDrag(badge, markerId) {
    if (!badge || badge.__cngMarkerDragBound) {
      return;
    }
    badge.__cngMarkerDragBound = true;

    var drag = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      moved: false,
      lastClientX: 0,
      lastClientY: 0,
      autoScrollRaf: 0,
      lastPromptRefreshAt: 0
    };

    function stopAutoScrollLoop() {
      if (drag.autoScrollRaf) {
        cancelAnimationFrame(drag.autoScrollRaf);
      }
      drag.autoScrollRaf = 0;
    }

    function getAutoScrollDelta() {
      var container = getChatScrollContainer();
      if (!container || !container.getBoundingClientRect) {
        return 0;
      }
      var rect = container.getBoundingClientRect();
      if (!rect || rect.height < 80) {
        return 0;
      }
      var edge = Math.max(48, Math.min(120, Math.floor(rect.height * 0.16)));
      var topEdge = rect.top + edge;
      var bottomEdge = rect.bottom - edge;
      var clientY = Number(drag.lastClientY);
      if (!Number.isFinite(clientY)) {
        return 0;
      }

      var delta = 0;
      if (clientY < topEdge) {
        delta = -Math.max(6, Math.min(36, Math.round((topEdge - clientY) * 0.32)));
      } else if (clientY > bottomEdge) {
        delta = Math.max(6, Math.min(36, Math.round((clientY - bottomEdge) * 0.32)));
      }
      return delta;
    }

    function runAutoScrollLoop() {
      if (!drag.active) {
        stopAutoScrollLoop();
        return;
      }
      var container = getChatScrollContainer();
      if (!container || typeof container.scrollTop !== 'number') {
        drag.autoScrollRaf = requestAnimationFrame(runAutoScrollLoop);
        return;
      }

      var delta = getAutoScrollDelta();
      if (delta !== 0) {
        var maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        var nextTop = clampNumber(container.scrollTop + delta, 0, maxTop, container.scrollTop);
        if (nextTop !== container.scrollTop) {
          container.scrollTop = nextTop;
          var now = Date.now();
          if ((now - drag.lastPromptRefreshAt) > 150) {
            drag.lastPromptRefreshAt = now;
            refreshPromptsFromDom({ suppressRender: true });
          }
        }
      }
      drag.autoScrollRaf = requestAnimationFrame(runAutoScrollLoop);
    }

    function startAutoScrollLoop() {
      if (drag.autoScrollRaf) {
        return;
      }
      drag.autoScrollRaf = requestAnimationFrame(runAutoScrollLoop);
    }

    function finishDrag(event) {
      if (!drag.active) {
        return;
      }
      drag.active = false;
      stopAutoScrollLoop();
      if (badge.releasePointerCapture && drag.pointerId !== null && badge.hasPointerCapture && badge.hasPointerCapture(drag.pointerId)) {
        badge.releasePointerCapture(drag.pointerId);
      }
      badge.classList.remove('cng-inline-marker-dragging');
      badge.style.transform = '';
      if (!drag.moved || !event) {
        drag.pointerId = null;
        return;
      }

      var marker = getMarkerById(markerId);
      if (!marker) {
        drag.pointerId = null;
        return;
      }

      refreshPromptsFromDom({ suppressRender: true });
      var dropClientX = event && Number.isFinite(event.clientX) ? event.clientX : drag.lastClientX;
      var dropClientY = event && Number.isFinite(event.clientY) ? event.clientY : drag.lastClientY;
      var drop = resolveMarkerDropTarget(dropClientX, dropClientY);
      if (!drop || !drop.promptId) {
        drag.pointerId = null;
        return;
      }

      marker.anchorPromptId = drop.promptId;
      marker.anchorRatio = drop.ratio;
      marker.anchorOffset = normalizeMarkerAnchorOffset(drop.offset);
      sortMarkerOrderByPosition();
      persistConversationState();
      refreshPromptsFromDom({ forceRender: true });
      setStatNotice('Marker moved', 900);
      drag.pointerId = null;
    }

    badge.addEventListener('pointerdown', function (event) {
      if (!event || event.button !== 0) {
        return;
      }
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      drag.moved = false;
      drag.lastPromptRefreshAt = Date.now();
      badge.classList.add('cng-inline-marker-dragging');
      if (badge.setPointerCapture) {
        badge.setPointerCapture(event.pointerId);
      }
      startAutoScrollLoop();
      event.preventDefault();
      event.stopPropagation();
    });

    badge.addEventListener('pointermove', function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      var dx = event.clientX - drag.startX;
      var dy = event.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        drag.moved = true;
      }
      if (drag.moved) {
        badge.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      }
      event.preventDefault();
      event.stopPropagation();
    });

    badge.addEventListener('pointerup', function (event) {
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      finishDrag(event);
      event.preventDefault();
      event.stopPropagation();
    });

    badge.addEventListener('pointercancel', function (event) {
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      finishDrag(null);
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function getInlineMarkerLayer() {
    var container = getChatScrollContainer();
    if (!container || !container.appendChild || !container.getBoundingClientRect) {
      return null;
    }

    var layer = document.getElementById('cng-inline-marker-layer');
    if (layer && layer.parentNode !== container && layer.parentNode) {
      layer.parentNode.removeChild(layer);
      layer = null;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'cng-inline-marker-layer';
      container.appendChild(layer);
    }

    var containerStyle = window.getComputedStyle(container);
    if (containerStyle && containerStyle.position === 'static') {
      container.style.position = 'relative';
    }
    layer.style.height = Math.max(container.scrollHeight, container.clientHeight) + 'px';
    layer.style.width = Math.max(container.scrollWidth, container.clientWidth) + 'px';
    return {
      layer: layer,
      container: container
    };
  }

  function syncInlineMarkersInChatBody() {
    var layerInfo = getInlineMarkerLayer();
    if (!layerInfo || !layerInfo.layer || !layerInfo.container) {
      return;
    }

    var layer = layerInfo.layer;
    var container = layerInfo.container;
    var oldBadges = layer.querySelectorAll('.cng-inline-marker');
    for (var i = 0; i < oldBadges.length; i += 1) {
      if (oldBadges[i] && oldBadges[i].parentNode) {
        oldBadges[i].parentNode.removeChild(oldBadges[i]);
      }
    }

    var bodyRect = getChatBodyRect();
    var containerRect = container.getBoundingClientRect();
    if (!bodyRect || !containerRect || bodyRect.width <= 1) {
      return;
    }

    var markerLeft = (bodyRect.left - containerRect.left) + (container.scrollLeft || 0) + 8;
    var markerMaxWidth = Math.max(120, Math.min(360, bodyRect.width - 20));

    for (var j = 0; j < state.markerOrder.length; j += 1) {
      var markerId = state.markerOrder[j];
      var marker = getMarkerById(markerId);
      if (!marker) {
        continue;
      }
      var markerTop = getMarkerAnchorOffset(marker);
      if (!Number.isFinite(markerTop)) {
        continue;
      }

      var anchor = state.promptElements.get(marker.anchorPromptId);
      if (anchor && anchor.setAttribute) {
        anchor.setAttribute('data-cng-prompt-id', marker.anchorPromptId);
      }

      var visual = markerVisualStyle(marker.color, false);
      var badge = document.createElement('div');
      badge.className = 'cng-inline-marker';
      badge.setAttribute('data-cng-marker-id', marker.id);
      badge.style.left = Math.round(markerLeft) + 'px';
      badge.style.top = Math.round(markerTop) + 'px';
      badge.style.maxWidth = Math.round(markerMaxWidth) + 'px';
      badge.style.borderColor = visual.border;
      badge.style.background = visual.background;
      badge.style.color = visual.text;
      badge.textContent = 'Checkpoint: ' + (marker.label || 'Marker');
      badge.title = 'Drag to move this checkpoint';
      bindInlineMarkerDrag(badge, marker.id);
      layer.appendChild(badge);
    }
  }

  function segmentVisiblePrompts(segment, query, pinnedOnly) {
    var queryLower = query.toLowerCase();

    var segmentMetaMatched = Boolean(queryLower) && (
      ((segment.title || '').toLowerCase().indexOf(queryLower) !== -1) ||
      ((segment.summary || '').toLowerCase().indexOf(queryLower) !== -1)
    );

    var list = segment.promptIds
      .map(function (promptId) {
        return getPromptById(promptId);
      })
      .filter(Boolean)
      .filter(function (prompt) {
        if (pinnedOnly && !state.pins.has(prompt.id) && !hasPinnedMarkerForPrompt(prompt.id)) {
          return false;
        }

        if (!queryLower) {
          return true;
        }

        if (segmentMetaMatched) {
          return true;
        }

        if (hasMatchedMarkerForPrompt(prompt.id, queryLower, pinnedOnly)) {
          return true;
        }

        var noteText = state.notes[prompt.id] || '';
        var packed = (getPrimaryPromptDisplayText(prompt) + ' ' + noteText).toLowerCase();
        return packed.indexOf(queryLower) !== -1;
      })
      .sort(function (a, b) {
        return a.index - b.index;
      });

    return list;
  }

  function createElement(tag, className) {
    var el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    return el;
  }

  function applyLimitedText(element, fullText, rawLimit) {
    if (!element) {
      return '';
    }
    var normalized = normalizeWhitespace(fullText || '');
    var limit = normalizeDisplayLimitValue(rawLimit, PROMPT_DISPLAY_LIMIT_DEFAULT);
    var rendered = shortText(normalized, limit);
    element.textContent = rendered;
    if (normalized && rendered !== normalized) {
      element.setAttribute('data-cng-fulltext', normalized);
    } else {
      element.removeAttribute('data-cng-fulltext');
    }
    return rendered;
  }

  function getHoverPreviewElement() {
    var preview = document.getElementById('cng-hover-preview');
    if (preview) {
      return preview;
    }
    preview = document.createElement('div');
    preview.id = 'cng-hover-preview';
    preview.className = 'cng-hover-preview cng-hidden';
    document.body.appendChild(preview);
    return preview;
  }

  function hideHoverPreview() {
    var preview = document.getElementById('cng-hover-preview');
    if (preview) {
      preview.classList.add('cng-hidden');
    }
    state.hoverPreviewTarget = null;
  }

  function positionHoverPreview(preview, clientX, clientY) {
    if (!preview) {
      return;
    }
    var viewportW = Number(window.innerWidth || 0);
    var viewportH = Number(window.innerHeight || 0);
    var margin = 12;
    var left = Number(clientX || 0) + 14;
    var top = Number(clientY || 0) + 16;

    var width = preview.offsetWidth || 0;
    var height = preview.offsetHeight || 0;
    if (viewportW > 0 && left + width + margin > viewportW) {
      left = Math.max(margin, viewportW - width - margin);
    }
    if (viewportH > 0 && top + height + margin > viewportH) {
      top = Math.max(margin, Number(clientY || 0) - height - 14);
    }

    preview.style.left = Math.round(left) + 'px';
    preview.style.top = Math.round(top) + 'px';
  }

  function showHoverPreview(target, clientX, clientY) {
    if (!target) {
      hideHoverPreview();
      return;
    }
    var fullText = normalizeWhitespace(target.getAttribute('data-cng-fulltext') || '');
    if (!fullText) {
      hideHoverPreview();
      return;
    }
    var preview = getHoverPreviewElement();
    preview.textContent = fullText;
    preview.classList.remove('cng-hidden');
    state.hoverPreviewTarget = target;
    positionHoverPreview(preview, clientX, clientY);
  }

  function bindHoverPreviewEvents() {
    if (state.hoverPreviewBound) {
      return;
    }
    state.hoverPreviewBound = true;

    document.addEventListener('mouseover', function (event) {
      var target = event && event.target && event.target.closest
        ? event.target.closest('[data-cng-fulltext]')
        : null;
      if (!target) {
        hideHoverPreview();
        return;
      }
      showHoverPreview(target, event.clientX, event.clientY);
    }, true);

    document.addEventListener('mousemove', function (event) {
      if (!state.hoverPreviewTarget) {
        return;
      }
      var preview = document.getElementById('cng-hover-preview');
      if (!preview || preview.classList.contains('cng-hidden')) {
        return;
      }
      positionHoverPreview(preview, event.clientX, event.clientY);
    }, true);

    document.addEventListener('mouseout', function (event) {
      var active = state.hoverPreviewTarget;
      if (!active) {
        return;
      }
      var from = event && event.target;
      if (!from || (from !== active && !(active.contains && active.contains(from)))) {
        return;
      }
      var to = event.relatedTarget;
      if (to && (to === active || (active.contains && active.contains(to)))) {
        return;
      }
      hideHoverPreview();
    }, true);

    document.addEventListener('scroll', function () {
      hideHoverPreview();
    }, true);
  }

  function getJumpDockRoot() {
    var dock = document.getElementById('cng-jump-dock');
    if (dock) {
      return dock;
    }
    dock = document.createElement('div');
    dock.id = 'cng-jump-dock';
    dock.className = 'cng-jump-dock cng-hidden';
    document.body.appendChild(dock);
    return dock;
  }

  function getJumpDockGroups(query, pinnedOnly) {
    var queryText = normalizeWhitespace(query || '');
    var queryLower = queryText.toLowerCase();
    var forceVisible = Boolean(queryText) || Boolean(pinnedOnly);
    var groups = [];
    for (var i = 0; i < state.segments.length; i += 1) {
      var segment = state.segments[i];
      var shouldInclude = Boolean(segment) && (state.expandedSegments.has(segment.id) || forceVisible);
      if (!shouldInclude) {
        continue;
      }
      var visiblePrompts = segmentVisiblePrompts(segment, queryText, pinnedOnly);
      if (!visiblePrompts.length) {
        continue;
      }
      var timelineItems = buildSegmentTimelineItems(segment, visiblePrompts, queryLower, pinnedOnly);
      if (!timelineItems.length) {
        continue;
      }
      groups.push({
        segment: segment,
        timelineItems: timelineItems
      });
    }
    return groups;
  }

  function getJumpDockEntryLabel(timelineItem) {
    if (!timelineItem) {
      return '';
    }
    if (timelineItem.type === 'marker') {
      var marker = timelineItem.marker || getMarkerById(timelineItem.id);
      if (!marker) {
        return 'Marker';
      }
      return '[M] ' + (getPrimaryMarkerDisplayText(marker) || marker.label || 'Checkpoint');
    }
    var prompt = timelineItem.prompt || getPromptById(timelineItem.id);
    if (!prompt) {
      return 'Prompt';
    }
    return '#' + (prompt.index + 1) + ' ' + (getPrimaryPromptDisplayText(prompt) || prompt.text || 'Prompt');
  }

  function isJumpDockEntryActive(timelineItem) {
    if (!timelineItem) {
      return false;
    }
    if (state.activeEntryId && state.activeEntryId === timelineItem.id) {
      return true;
    }
    if (timelineItem.type === 'prompt') {
      var prompt = timelineItem.prompt || getPromptById(timelineItem.id);
      return Boolean(prompt && state.activePromptId && prompt.id === state.activePromptId);
    }
    return false;
  }

  function syncJumpDock(query, pinnedOnly) {
    var dock = getJumpDockRoot();
    if (!dock) {
      return;
    }
    var groups = getJumpDockGroups(query, pinnedOnly);
    dock.innerHTML = '';
    if (!groups.length) {
      dock.classList.add('cng-hidden');
      return;
    }

    var fragment = document.createDocumentFragment();
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var groupWrap = createElement('div', 'cng-jump-group');
      groupWrap.setAttribute('data-segment-id', group.segment.id);

      for (var j = 0; j < group.timelineItems.length; j += 1) {
        var timelineItem = group.timelineItems[j];
        var entryId = timelineItem.id;
        var isMarker = timelineItem.type === 'marker';
        var isPinned = state.pins.has(entryId);
        var dotClass = 'cng-jump-dot';
        if (isMarker && isPinned) {
          dotClass += ' cng-jump-dot-mark-pin';
        } else if (isMarker) {
          dotClass += ' cng-jump-dot-mark';
        } else if (isPinned) {
          dotClass += ' cng-jump-dot-pin';
        } else {
          dotClass += ' cng-jump-dot-neutral';
        }
        if (isJumpDockEntryActive(timelineItem)) {
          dotClass += ' cng-jump-dot-active';
        }

        var dot = createElement('button', dotClass);
        dot.type = 'button';
        dot.setAttribute('data-entry-type', isMarker ? 'marker' : 'prompt');
        dot.setAttribute('data-entry-id', entryId);
        dot.setAttribute('aria-label', getJumpDockEntryLabel(timelineItem));
        dot.title = shortText(getJumpDockEntryLabel(timelineItem), 110);
        groupWrap.appendChild(dot);
      }

      fragment.appendChild(groupWrap);
    }

    dock.appendChild(fragment);
    dock.classList.remove('cng-hidden');
  }

  function bindJumpDockEvents() {
    if (state.jumpDockBound) {
      return;
    }
    state.jumpDockBound = true;
    document.addEventListener('click', function (event) {
      var target = event && event.target && event.target.closest
        ? event.target.closest('#cng-jump-dock .cng-jump-dot')
        : null;
      if (!target) {
        return;
      }
      var entryType = target.getAttribute('data-entry-type');
      var entryId = target.getAttribute('data-entry-id');
      if (!entryId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (entryType === 'marker') {
        jumpToMarker(entryId);
      } else {
        jumpToPrompt(entryId);
      }
    }, true);

  }

  function captureSidebarScrollState(container) {
    if (!container) {
      return;
    }
    state.sidebarScrollTop = container.scrollTop || 0;
    var segmentScrollTops = {};
    var wraps = container.querySelectorAll('.cng-segment-prompts[data-segment-id]');
    for (var i = 0; i < wraps.length; i += 1) {
      var wrap = wraps[i];
      if (!wrap) {
        continue;
      }
      var segmentId = normalizeWhitespace(wrap.getAttribute('data-segment-id') || '');
      if (!segmentId) {
        continue;
      }
      segmentScrollTops[segmentId] = Math.max(0, Number(wrap.scrollTop || 0) || 0);
    }
    if (wraps.length) {
      state.segmentScrollTops = segmentScrollTops;
    }
  }

  function restoreSegmentScrollState(container) {
    if (!container) {
      return;
    }
    var wraps = container.querySelectorAll('.cng-segment-prompts[data-segment-id]');
    for (var i = 0; i < wraps.length; i += 1) {
      var wrap = wraps[i];
      if (!wrap || typeof wrap.scrollTop !== 'number') {
        continue;
      }
      var segmentId = normalizeWhitespace(wrap.getAttribute('data-segment-id') || '');
      if (!segmentId) {
        continue;
      }
      var savedTop = Number(state.segmentScrollTops && state.segmentScrollTops[segmentId]);
      if (!Number.isFinite(savedTop) || savedTop < 0) {
        continue;
      }
      var maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      wrap.scrollTop = clampNumber(savedTop, 0, maxTop, 0);
    }
  }

  function restoreSidebarScrollState(container) {
    if (!container) {
      return;
    }
    if (typeof state.sidebarScrollTop === 'number') {
      container.scrollTop = state.sidebarScrollTop;
    }
    restoreSegmentScrollState(container);
  }

  function onSidebarContainerScroll(event) {
    var target = event && event.target;
    if (!target || target.id !== 'cng-nav-content') {
      return;
    }
    state.sidebarScrollTop = Math.max(0, Number(target.scrollTop || 0) || 0);
    persistConversationState();
  }

  function onSegmentPromptsScroll(event) {
    var target = event && event.target;
    if (!target || !target.getAttribute || !target.classList || !target.classList.contains('cng-segment-prompts')) {
      return;
    }
    var segmentId = normalizeWhitespace(target.getAttribute('data-segment-id') || '');
    if (!segmentId) {
      return;
    }
    state.segmentScrollTops[segmentId] = Math.max(0, Number(target.scrollTop || 0) || 0);
    persistConversationState();
  }

  function syncSegmentPromptLayout(container) {
    if (!container || !container.querySelectorAll) {
      return;
    }

    var segmentNodes = container.querySelectorAll('.cng-segment');
    if (!segmentNodes || !segmentNodes.length) {
      return;
    }

    for (var i = 0; i < segmentNodes.length; i += 1) {
      var resetSegment = segmentNodes[i];
      if (!resetSegment || !resetSegment.querySelector) {
        continue;
      }
      resetSegment.classList.remove('cng-segment-fill');
      var resetWrap = resetSegment.querySelector('.cng-segment-prompts');
      if (resetWrap) {
        resetWrap.style.maxHeight = '';
        resetWrap.style.minHeight = '';
      }
    }

    if (segmentNodes.length !== 1) {
      return;
    }

    var singleSegment = segmentNodes[0];
    if (!singleSegment || !singleSegment.querySelector) {
      return;
    }

    var promptsWrap = singleSegment.querySelector('.cng-segment-prompts:not(.cng-hidden)');
    if (!promptsWrap) {
      return;
    }

    var containerHeight = Number(container.clientHeight || 0);
    if (!containerHeight) {
      return;
    }

    var occupiedHeight = 0;
    for (var childIdx = 0; childIdx < singleSegment.children.length; childIdx += 1) {
      var child = singleSegment.children[childIdx];
      if (!child || child === promptsWrap) {
        continue;
      }
      occupiedHeight += Number(child.offsetHeight || 0);
    }

    var availableHeight = Math.max(220, Math.floor(containerHeight - occupiedHeight - 14));
    var minFillHeight = Math.max(140, Math.floor(containerHeight * 0.3));
    promptsWrap.style.maxHeight = availableHeight + 'px';
    promptsWrap.style.minHeight = Math.min(availableHeight, minFillHeight) + 'px';
    singleSegment.classList.add('cng-segment-fill');
  }

  function requestSegmentLayoutSync() {
    if (state.segmentLayoutRaf && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(state.segmentLayoutRaf);
      state.segmentLayoutRaf = 0;
    }

    var raf = window.requestAnimationFrame || function (callback) {
      return setTimeout(callback, 16);
    };
    state.segmentLayoutRaf = raf(function () {
      state.segmentLayoutRaf = 0;
      var container = document.getElementById('cng-nav-content');
      syncSegmentPromptLayout(container);
      restoreSegmentScrollState(container);
    });
  }

  function bindSegmentLayoutObserver(panel) {
    if (state.segmentLayoutObserver || state.segmentLayoutResizeBound) {
      return;
    }
    var container = document.getElementById('cng-nav-content');
    if (!panel || !container) {
      return;
    }

    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(function () {
        requestSegmentLayoutSync();
      });
      observer.observe(panel);
      observer.observe(container);
      state.segmentLayoutObserver = observer;
      return;
    }

    window.addEventListener('resize', requestSegmentLayoutSync);
    state.segmentLayoutResizeBound = true;
  }

  function toggleNoteEditor(entryId) {
    if (!entryId) {
      return;
    }
    if (state.noteEditorOpen.has(entryId)) {
      state.noteEditorOpen.delete(entryId);
    } else {
      state.noteEditorOpen.add(entryId);
    }
    render(true);
  }

  function render(force) {
    var searchInput = document.getElementById('cng-nav-search');
    var pinnedOnlyInput = document.getElementById('cng-nav-pinned-only');
    var container = document.getElementById('cng-nav-content');
    var statEl = document.getElementById('cng-nav-stat');

    if (!searchInput || !container || !statEl) {
      return;
    }

    if (pinnedOnlyInput) {
      pinnedOnlyInput.checked = Boolean(state.pinnedOnly);
    }

    captureSidebarScrollState(container);
    container.innerHTML = '';
    hideHoverPreview();

    if (!state.initialized) {
      statEl.textContent = state.statNotice || 'Loading navigator...';
      syncJumpDock('', state.pinnedOnly);
      return;
    }

    if (!state.prompts.length) {
      statEl.textContent = state.statNotice || 'No user prompts found in this page yet.';
      var empty = createElement('div', 'cng-empty');
      empty.textContent = 'Start a chat and your prompts will appear here.';
      container.appendChild(empty);
      syncJumpDock('', state.pinnedOnly);
      return;
    }

    var query = normalizeWhitespace(state.query || '');
    var queryLower = query.toLowerCase();
    var promptDisplayLimit = normalizeDisplayLimitValue(
      state.aiConfig && state.aiConfig.promptDisplayLimit,
      PROMPT_DISPLAY_LIMIT_DEFAULT
    );
    var markerDisplayLimit = normalizeDisplayLimitValue(
      state.aiConfig && state.aiConfig.markerDisplayLimit,
      MARKER_DISPLAY_LIMIT_DEFAULT
    );
    var segmentSummaryDisplayLimit = normalizeDisplayLimitValue(
      state.aiConfig && state.aiConfig.segmentSummaryDisplayLimit,
      SEGMENT_SUMMARY_DISPLAY_LIMIT_DEFAULT
    );
    var totalVisible = 0;
    var containerFragment = document.createDocumentFragment();
    var isFiltering = Boolean(queryLower) || Boolean(state.pinnedOnly);

    for (var i = 0; i < state.segments.length; i += 1) {
      var segment = state.segments[i];
      var isOpen = state.expandedSegments.has(segment.id);
      var shouldRenderItems = isOpen || isFiltering;
      var visiblePrompts = shouldRenderItems ? segmentVisiblePrompts(segment, query, state.pinnedOnly) : [];

      if (shouldRenderItems && !visiblePrompts.length) {
        continue;
      }

      var timelineItems = shouldRenderItems
        ? buildSegmentTimelineItems(segment, visiblePrompts, queryLower, state.pinnedOnly)
        : [];
      if (shouldRenderItems && !timelineItems.length) {
        continue;
      }

      totalVisible += shouldRenderItems ? timelineItems.length : segment.promptIds.length;

      var segmentBox = createElement('section', 'cng-segment');
      segmentBox.setAttribute('data-segment-id', segment.id);

      var headerBtn = createElement('button', 'cng-segment-header');
      headerBtn.type = 'button';
      headerBtn.setAttribute('data-segment-id', segment.id);

      var title = createElement('div', 'cng-segment-title');
      title.setAttribute('data-segment-id', segment.id);
      title.textContent = segment.title;
      var summaryText = normalizeWhitespace(segment.summary || '');
      var summaryPending = false;
      var hasAiQueue = Boolean(
        isAiSummaryEnabled() &&
        segment.fingerprint &&
        ((state.aiPending && state.aiPending[segment.fingerprint]) || (state.aiInFlight && state.aiInFlight[segment.fingerprint]))
      );
      if (!summaryText && hasAiQueue) {
        summaryText = state.aiInFlight && state.aiInFlight[segment.fingerprint] ? 'AI generating...' : 'AI queued...';
        summaryPending = true;
      }
      var summaryEl = null;
      if (summaryText) {
        summaryEl = createElement('div', 'cng-segment-summary');
        if (summaryPending) {
          summaryEl.className += ' cng-segment-summary-pending';
        }
        applyLimitedText(summaryEl, summaryText, summaryPending ? Math.min(96, segmentSummaryDisplayLimit) : segmentSummaryDisplayLimit);
      }

      var metaRow = createElement('div', 'cng-segment-meta');
      var metaInfo = createElement('div', 'cng-segment-meta-info');
      var promptCount = createElement('div', 'cng-segment-count');
      promptCount.textContent = segment.promptIds.length + ' prompt' + (segment.promptIds.length > 1 ? 's' : '');
      metaInfo.appendChild(promptCount);

      var aiSegmentStatus = getSegmentAiRuntimeStatus(segment);
      if (aiSegmentStatus && aiSegmentStatus.label) {
        var aiStatusEl = createElement('div', 'cng-segment-ai-status ' + aiSegmentStatus.className);
        aiStatusEl.textContent = aiSegmentStatus.label;
        metaInfo.appendChild(aiStatusEl);
      }

      var headerActions = createElement('div', 'cng-segment-actions');

      var renameBtn = createElement('button', 'cng-segment-rename');
      renameBtn.type = 'button';
      renameBtn.setAttribute('data-action', 'rename-segment');
      renameBtn.setAttribute('data-start-prompt-id', segment.startPromptId);
      renameBtn.textContent = 'Rename';

      var regenBtn = createElement('button', 'cng-segment-regen');
      regenBtn.type = 'button';
      regenBtn.setAttribute('data-action', 'regen-segment');
      regenBtn.setAttribute('data-segment-id', segment.id);
      regenBtn.textContent = 'Regen';

      var markBtn = createElement('button', 'cng-segment-regen');
      markBtn.type = 'button';
      markBtn.setAttribute('data-action', 'add-segment-marker');
      markBtn.setAttribute('data-segment-id', segment.id);
      markBtn.textContent = 'Mark';

      var caret = createElement('div', 'cng-segment-caret');
      caret.setAttribute('data-segment-id', segment.id);
      caret.textContent = shouldRenderItems ? 'v' : '>';

      headerBtn.appendChild(title);
      if (summaryEl) {
        headerBtn.appendChild(summaryEl);
      }
      headerActions.appendChild(renameBtn);
      headerActions.appendChild(regenBtn);
      headerActions.appendChild(markBtn);
      headerActions.appendChild(caret);
      metaRow.appendChild(metaInfo);
      metaRow.appendChild(headerActions);
      headerBtn.appendChild(metaRow);
      segmentBox.appendChild(headerBtn);

      var errorRecord = segment.fingerprint ? state.aiSegmentErrors[segment.fingerprint] : null;
      if (errorRecord && typeof errorRecord === 'object') {
        var errorWrap = createElement('div', 'cng-segment-error');
        var errorText = createElement('div', 'cng-segment-error-text');
        var baseError = normalizeWhitespace(errorRecord.message || 'AI summary failed');
        var hintError = normalizeWhitespace(errorRecord.hint || '');
        errorText.textContent = 'AI error: ' + shortText(baseError + (hintError ? (' | ' + hintError) : ''), 132);
        var retryBtn = createElement('button', 'cng-segment-retry');
        retryBtn.type = 'button';
        retryBtn.setAttribute('data-action', 'retry-segment');
        retryBtn.setAttribute('data-segment-id', segment.id);
        retryBtn.textContent = 'Retry';
        errorWrap.appendChild(errorText);
        errorWrap.appendChild(retryBtn);
        segmentBox.appendChild(errorWrap);
      }

      var promptsWrap = createElement('div', 'cng-segment-prompts' + (shouldRenderItems ? '' : ' cng-hidden'));
      promptsWrap.setAttribute('data-segment-id', segment.id);
      promptsWrap.addEventListener('scroll', onSegmentPromptsScroll, { passive: true });
      if (shouldRenderItems) {
        var promptsFragment = document.createDocumentFragment();

        for (var j = 0; j < timelineItems.length; j += 1) {
          var timelineItem = timelineItems[j];
          var entryId = timelineItem.id;
          var isMarker = timelineItem.type === 'marker';
          var isPinned = state.pins.has(entryId);
          var itemClass = 'cng-prompt-item' + (isPinned ? ' cng-prompt-item-pinned' : '');
          if (isMarker) {
            itemClass += ' cng-marker-item';
          }

          var prompt = isMarker ? timelineItem.anchorPrompt : timelineItem.prompt;
          var isActiveEntry = Boolean(state.activeEntryId && state.activeEntryId === entryId);
          if (isActiveEntry || (!isMarker && state.activePromptId && state.activePromptId === prompt.id)) {
            itemClass += ' cng-prompt-item-active';
          }

          var item = createElement('article', itemClass);
          item.setAttribute('data-entry-id', entryId);
          if (isMarker) {
            item.setAttribute('data-marker-id', entryId);
            item.setAttribute('data-anchor-prompt-id', prompt.id);
          } else {
            item.setAttribute('data-prompt-id', prompt.id);
          }

          var actionRow = createElement('div', 'cng-prompt-actions-row');
          var actionGroup = createElement('div', 'cng-prompt-actions');
          var pinBtn = createElement('button', 'cng-pin-btn');
          pinBtn.type = 'button';
          pinBtn.setAttribute('data-action', 'pin');
          pinBtn.setAttribute('data-entry-id', entryId);
          if (isPinned) {
            pinBtn.classList.add('cng-pin-btn-active');
          }
          pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';

          var splitBtn = createElement('button', 'cng-split-btn');
          splitBtn.type = 'button';
          splitBtn.setAttribute('data-action', 'split');
          splitBtn.setAttribute('data-prompt-id', prompt.id);
          if (prompt.index === 0) {
            splitBtn.disabled = true;
            splitBtn.textContent = 'Split Here';
          } else {
            splitBtn.textContent = state.manualSplitStarts.has(prompt.id) ? 'Clear Split' : 'Split Here';
          }

          actionGroup.appendChild(pinBtn);
          actionGroup.appendChild(splitBtn);

          if (isMarker) {
            var renameMarkerBtn = createElement('button', 'cng-split-btn');
            renameMarkerBtn.type = 'button';
            renameMarkerBtn.setAttribute('data-action', 'rename-marker');
            renameMarkerBtn.setAttribute('data-marker-id', entryId);
            renameMarkerBtn.textContent = 'Rename';
            actionGroup.appendChild(renameMarkerBtn);

            var moveMarkerBtn = createElement('button', 'cng-split-btn');
            moveMarkerBtn.type = 'button';
            moveMarkerBtn.setAttribute('data-action', 'move-marker');
            moveMarkerBtn.setAttribute('data-marker-id', entryId);
            moveMarkerBtn.textContent = 'Move';
            actionGroup.appendChild(moveMarkerBtn);

            var deleteMarkerBtn = createElement('button', 'cng-split-btn');
            deleteMarkerBtn.type = 'button';
            deleteMarkerBtn.setAttribute('data-action', 'delete-marker');
            deleteMarkerBtn.setAttribute('data-marker-id', entryId);
            deleteMarkerBtn.textContent = 'Delete';
            actionGroup.appendChild(deleteMarkerBtn);

            var colorMarkerBtn = createElement('button', 'cng-split-btn');
            colorMarkerBtn.type = 'button';
            colorMarkerBtn.setAttribute('data-action', 'color-marker');
            colorMarkerBtn.setAttribute('data-marker-id', entryId);
            colorMarkerBtn.textContent = 'Color';
            actionGroup.appendChild(colorMarkerBtn);
          }

          var noteToggleBtn = createElement('button', 'cng-split-btn');
          noteToggleBtn.type = 'button';
          noteToggleBtn.setAttribute('data-action', 'toggle-note');
          noteToggleBtn.setAttribute('data-entry-id', entryId);
          var noteOpen = state.noteEditorOpen.has(entryId) || Boolean(state.notes[entryId]);
          noteToggleBtn.textContent = noteOpen ? 'Hide Note' : 'Note';
          actionGroup.appendChild(noteToggleBtn);

          actionRow.appendChild(actionGroup);

          var contentBtn = createElement('button', 'cng-item-content-btn');
          contentBtn.type = 'button';
          if (isMarker) {
            var marker = timelineItem.marker;
            contentBtn.setAttribute('data-action', 'jump-marker');
            contentBtn.setAttribute('data-marker-id', marker.id);
            contentBtn.setAttribute('data-prompt-id', prompt.id);
            var markerPrefix = isPinned ? '[PIN] [M] ' : '[M] ';
            var markerPrimaryText = getPrimaryMarkerDisplayText(marker);
            applyLimitedText(contentBtn, markerPrefix + (markerPrimaryText || marker.label || 'Checkpoint'), markerDisplayLimit);
          } else {
            contentBtn.setAttribute('data-action', 'jump');
            contentBtn.setAttribute('data-prompt-id', prompt.id);
            var pinPrefix = isPinned ? '[PIN] ' : '';
            var promptPrimaryText = getPrimaryPromptDisplayText(prompt);
            applyLimitedText(contentBtn, '#' + (prompt.index + 1) + ' ' + pinPrefix + (promptPrimaryText || prompt.text), promptDisplayLimit);
          }

          if (isMarker) {
            var markerStyle = markerVisualStyle(timelineItem.marker.color, true);
            item.style.borderColor = markerStyle.border;
            item.style.background = markerStyle.background;
            contentBtn.style.color = markerStyle.text;
          }

          var noteInput = createElement('input', 'cng-note-input');
          noteInput.type = 'text';
          noteInput.placeholder = isMarker ? 'Marker note...' : 'Add note...';
          noteInput.value = state.notes[entryId] || '';
          noteInput.setAttribute('data-action', 'note');
          noteInput.setAttribute('data-entry-id', entryId);
          if (!noteOpen) {
            noteInput.classList.add('cng-hidden');
          }

          item.appendChild(actionRow);
          item.appendChild(contentBtn);
          item.appendChild(noteInput);
          promptsFragment.appendChild(item);
        }
        promptsWrap.appendChild(promptsFragment);
      }

      segmentBox.appendChild(promptsWrap);
      containerFragment.appendChild(segmentBox);
    }

    if (!totalVisible) {
      statEl.textContent = state.statNotice || 'No results for current search.';
      var noResults = createElement('div', 'cng-empty');
      noResults.textContent = 'Try another keyword.';
      container.appendChild(noResults);
      syncJumpDock(query, state.pinnedOnly);
      return;
    }

    container.appendChild(containerFragment);
    restoreSidebarScrollState(container);
    requestSegmentLayoutSync();

    var pinnedCount = 0;
    state.pins.forEach(function () {
      pinnedCount += 1;
    });

    var statText =
      totalVisible +
      ' item' +
      (totalVisible > 1 ? 's' : '') +
      ' | ' +
      state.segments.length +
      ' segment' +
      (state.segments.length > 1 ? 's' : '') +
      ' | ' +
      pinnedCount +
      ' pinned' +
      (state.pinnedOnly ? ' | pinned-only' : '');

    if (isAiSummaryEnabled()) {
      var queuedCount = getAiPendingCount();
      var runningCount = getAiInFlightCount();
      var failedCount = Object.keys(state.aiSegmentErrors || {}).length;
      if (queuedCount || runningCount || failedCount) {
        statText += ' | AI q:' + queuedCount + ' run:' + runningCount + ' fail:' + failedCount;
      }
    }

    statEl.textContent = state.statNotice || statText;
    syncJumpDock(query, state.pinnedOnly);
  }
  function togglePin(promptId) {
    if (!promptId) {
      return;
    }

    if (state.pins.has(promptId)) {
      state.pins.delete(promptId);
    } else {
      state.pins.add(promptId);
    }

    persistConversationState();
    render(true);
  }

  function updateNote(promptId, value) {
    if (!promptId) {
      return;
    }

    var normalized = normalizeWhitespace(value || '');
    var previous = normalizeWhitespace(state.notes[promptId] || '');
    if (previous === normalized) {
      return;
    }

    if (normalized) {
      state.notes[promptId] = normalized;
    } else {
      delete state.notes[promptId];
    }

    persistConversationState();
    if (state.query) {
      render(true);
    }
  }

  function scheduleNoteUpdate(entryId, value) {
    if (!entryId) {
      return;
    }

    var existingTimer = state.noteInputTimers[entryId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    state.noteInputTimers[entryId] = setTimeout(function () {
      delete state.noteInputTimers[entryId];
      updateNote(entryId, value);
    }, 220);
  }

  function toggleManualSplit(promptId) {
    var prompt = getPromptById(promptId);
    if (!prompt || prompt.index === 0) {
      return;
    }

    if (state.manualSplitStarts.has(promptId)) {
      state.manualSplitStarts.delete(promptId);
      state.markerSplitStarts.delete(promptId);
    } else {
      state.manualSplitStarts.add(promptId);
      state.markerSplitStarts.delete(promptId);
    }

    state.segments = buildSegments(state.prompts);
    syncExpandedSegments(state.segments);
    persistConversationState();
    render(true);
    scheduleAiSummaries();
  }

  function renameSegment(startPromptId) {
    if (!startPromptId) {
      return;
    }

    var segment = null;
    for (var i = 0; i < state.segments.length; i += 1) {
      if (state.segments[i].startPromptId === startPromptId) {
        segment = state.segments[i];
        break;
      }
    }

    var currentTitle = state.customSegmentTitles[startPromptId] || (segment ? segment.title : '');
    var renamed = window.prompt('Rename segment', currentTitle);
    if (renamed === null) {
      return;
    }

    var normalized = normalizeWhitespace(renamed);
    if (normalized) {
      state.customSegmentTitles[startPromptId] = normalized;
    } else {
      delete state.customSegmentTitles[startPromptId];
    }

    state.segments = buildSegments(state.prompts);
    syncExpandedSegments(state.segments);
    persistConversationState();
    render(true);
    scheduleAiSummaries();
  }

  function toggleSegment(segmentId) {
    if (!segmentId) {
      return;
    }

    if (state.expandedSegments.has(segmentId)) {
      state.expandedSegments.delete(segmentId);
    } else {
      state.expandedSegments.add(segmentId);
    }

    persistConversationState();
    render(true);
  }

  function canScrollElementInDirection(element, deltaY) {
    if (!element || typeof element.scrollTop !== 'number') {
      return false;
    }

    var maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (maxScrollTop <= 0) {
      return false;
    }

    if (deltaY > 0) {
      return element.scrollTop < maxScrollTop - 1;
    }

    if (deltaY < 0) {
      return element.scrollTop > 1;
    }

    return false;
  }

  function applyWheelScroll(element, deltaY) {
    if (!element || !deltaY) {
      return false;
    }

    var before = element.scrollTop;
    element.scrollTop = before + deltaY;
    return element.scrollTop !== before;
  }

  function scrollSidebarByWheelDelta(deltaY, wheelTarget) {
    var result = {
      moved: false,
      hasScrollable: false
    };
    var normalizedDelta = Number(deltaY || 0);
    if (!normalizedDelta || state.hidden) {
      return result;
    }

    var container = document.getElementById('cng-nav-content');
    if (!container) {
      return result;
    }

    var promptsWrap = wheelTarget && wheelTarget.closest ? wheelTarget.closest('.cng-segment-prompts') : null;
    if (!promptsWrap && wheelTarget && wheelTarget.closest) {
      var segmentRoot = wheelTarget.closest('.cng-segment');
      if (segmentRoot && segmentRoot.querySelector) {
        promptsWrap = segmentRoot.querySelector('.cng-segment-prompts:not(.cng-hidden)');
      }
    }
    var candidates = [];
    if (promptsWrap) {
      candidates.push(promptsWrap);
    }
    candidates.push(container);

    var remaining = normalizedDelta;
    for (var i = 0; i < candidates.length; i += 1) {
      var node = candidates[i];
      if (!node || typeof node.scrollTop !== 'number') {
        continue;
      }
      var maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      if (maxScrollTop <= 0) {
        continue;
      }
      result.hasScrollable = true;

      var before = node.scrollTop;
      node.scrollTop = before + remaining;
      var consumed = node.scrollTop - before;
      if (consumed !== 0) {
        result.moved = true;
        remaining -= consumed;
      }
      if (Math.abs(remaining) < 0.5) {
        break;
      }
    }

    return result;
  }

  function onSidebarWheel(event) {
    if (!event) {
      return;
    }

    var rawTarget = event.target || null;
    var target = rawTarget && rawTarget.nodeType === 1
      ? rawTarget
      : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
    if (!target || !target.closest) {
      return;
    }

    var deltaY = Number(event.deltaY || 0);
    if (!deltaY) {
      return;
    }

    var scrollResult = scrollSidebarByWheelDelta(deltaY, target);
    if (scrollResult.moved || scrollResult.hasScrollable) {
      event.preventDefault();
    }
  }

  function bindMarkerPlacementEvents() {
    if (state.markerPlacementEventsBound) {
      return;
    }
    state.markerPlacementEventsBound = true;

    document.addEventListener('pointermove', function (event) {
      if (!state.markerPlacement.active || !event) {
        return;
      }
      var x = Number(event.clientX);
      var y = Number(event.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      if (!isPointInsideChatBody(x, y)) {
        return;
      }
      showMarkerPlacementHint(y);
    }, true);

    document.addEventListener('pointerdown', function (event) {
      if (!state.markerPlacement.active || !event || event.button !== 0) {
        return;
      }
      var target = event.target;
      if (target && target.closest && target.closest('#cng-nav-root, #cng-nav-open, #cng-ai-config-overlay')) {
        return;
      }
      var clientX = Number(event.clientX);
      var clientY = Number(event.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }
      if (!isPointInsideChatBody(clientX, clientY)) {
        return;
      }
      refreshPromptsFromDom({ suppressRender: true });
      var drop = resolveMarkerDropTarget(clientX, clientY);
      if (!drop || !drop.promptId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      var applied = applyMarkerDrop(drop);
      if (applied) {
        stopMarkerPlacementMode();
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (!state.markerPlacement.active || !event) {
        return;
      }
      if ((event.key || '') !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stopMarkerPlacementMode();
      setStatNotice('Marker placement cancelled', 1000);
    }, true);
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function bindKeyboardShortcuts() {
    if (state.shortcutsBound) {
      return;
    }
    state.shortcutsBound = true;

    document.addEventListener('keydown', function (event) {
      if (!event || event.defaultPrevented || event.isComposing) {
        return;
      }
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      var key = (event.key || '').toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        if (state.hidden) {
          togglePanelVisibility(false);
        }
        var search = document.getElementById('cng-nav-search');
        if (search && search.focus) {
          search.focus();
          if (search.select) {
            search.select();
          }
        }
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        togglePanelVisibility(!state.hidden);
      }
    });
  }

  function bindNavOpenBtnDrag(openBtn) {
    if (!openBtn || openBtn.__cngDragBound) {
      return;
    }

    openBtn.__cngDragBound = true;
    var drag = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      moved: false
    };

    function finishDrag() {
      if (!drag.active) {
        return;
      }
      if (openBtn.releasePointerCapture && drag.pointerId !== null && openBtn.hasPointerCapture && openBtn.hasPointerCapture(drag.pointerId)) {
        openBtn.releasePointerCapture(drag.pointerId);
      }
      drag.active = false;
      drag.pointerId = null;
      openBtn.classList.remove('cng-open-dragging');
      if (drag.moved) {
        state.navOpenBtnSuppressClick = true;
        persistNavOpenBtnPos();
        setTimeout(function () {
          state.navOpenBtnSuppressClick = false;
        }, 0);
      }
      drag.moved = false;
    }

    openBtn.addEventListener('pointerdown', function (event) {
      if (!event || event.button !== 0) {
        return;
      }

      var rect = openBtn.getBoundingClientRect();
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.originX = rect.left;
      drag.originY = rect.top;
      drag.moved = false;
      openBtn.classList.add('cng-open-dragging');
      if (openBtn.setPointerCapture) {
        openBtn.setPointerCapture(event.pointerId);
      }
    });

    openBtn.addEventListener('pointermove', function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }

      var dx = event.clientX - drag.startX;
      var dy = event.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > NAV_OPEN_DRAG_THRESHOLD || Math.abs(dy) > NAV_OPEN_DRAG_THRESHOLD)) {
        drag.moved = true;
      }

      if (!drag.moved) {
        return;
      }

      applyNavOpenBtnPos(openBtn, { x: drag.originX + dx, y: drag.originY + dy });
      event.preventDefault();
    });

    openBtn.addEventListener('pointerup', function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }

      finishDrag();
    });

    openBtn.addEventListener('pointercancel', function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      finishDrag();
    });

    window.addEventListener('resize', function () {
      if (!state.navOpenBtnPos) {
        return;
      }
      applyNavOpenBtnPos(openBtn, state.navOpenBtnPos);
    });
  }

  function togglePanelVisibility(hidden) {
    state.hidden = hidden;
    var panel = document.getElementById('cng-nav-root');
    var openBtn = document.getElementById('cng-nav-open');

    if (!panel || !openBtn) {
      return;
    }

    if (hidden) {
      panel.classList.add('cng-hidden');
      openBtn.classList.remove('cng-hidden');
      applyNavOpenBtnPos(openBtn, state.navOpenBtnPos);
    } else {
      panel.classList.remove('cng-hidden');
      openBtn.classList.add('cng-hidden');
    }
  }

  function onSidebarClick(event) {
    var target = event.target;
    if (!target) {
      return;
    }

    var actionTarget = target.closest('[data-action]');
    if (actionTarget) {
      var action = actionTarget.getAttribute('data-action');
      if (action === 'jump') {
        var jumpId = actionTarget.getAttribute('data-prompt-id');
        jumpToPrompt(jumpId);
        return;
      }

      if (action === 'jump-marker') {
        var markerId = actionTarget.getAttribute('data-marker-id');
        jumpToMarker(markerId);
        return;
      }

      if (action === 'pin') {
        var pinId = actionTarget.getAttribute('data-entry-id') || actionTarget.getAttribute('data-prompt-id');
        togglePin(pinId);
        return;
      }

      if (action === 'split') {
        var splitId = actionTarget.getAttribute('data-prompt-id');
        toggleManualSplit(splitId);
        return;
      }

      if (action === 'rename-segment') {
        var startPromptId = actionTarget.getAttribute('data-start-prompt-id');
        renameSegment(startPromptId);
        return;
      }

      if (action === 'regen-segment' || action === 'retry-segment') {
        var segmentId = actionTarget.getAttribute('data-segment-id');
        regenerateSegmentSummary(segmentId);
        return;
      }

      if (action === 'add-segment-marker') {
        addMarkerByPlacement();
        return;
      }

      if (action === 'move-marker') {
        var markerIdToMove = actionTarget.getAttribute('data-marker-id');
        moveMarkerByPlacement(markerIdToMove);
        return;
      }

      if (action === 'rename-marker') {
        var markerIdToRename = actionTarget.getAttribute('data-marker-id');
        renameMarker(markerIdToRename);
        return;
      }

      if (action === 'delete-marker') {
        var markerIdToDelete = actionTarget.getAttribute('data-marker-id');
        removeMarker(markerIdToDelete);
        return;
      }

      if (action === 'color-marker') {
        var markerIdToColor = actionTarget.getAttribute('data-marker-id');
        recolorMarker(markerIdToColor);
        return;
      }

      if (action === 'toggle-note') {
        var entryId = actionTarget.getAttribute('data-entry-id') || actionTarget.getAttribute('data-prompt-id');
        toggleNoteEditor(entryId);
        return;
      }

      if (action === 'configure-ai') {
        configureAi().catch(function (error) {
          var message = shortText((error && error.message) || 'AI config failed', 64);
          setStatNotice('AI config failed: ' + message, 2200);
        });
        return;
      }
    }

    var segmentHeader = target.closest('.cng-segment-header');
    if (segmentHeader) {
      toggleSegment(segmentHeader.getAttribute('data-segment-id'));
    }
  }

  function onSidebarInput(event) {
    var target = event.target;
    if (!target) {
      return;
    }

    if (target.id === 'cng-nav-search') {
      state.query = target.value || '';
      render(true);
      return;
    }

    if (target.id === 'cng-nav-pinned-only') {
      state.pinnedOnly = Boolean(target.checked);
      persistConversationState();
      render(true);
      return;
    }

    if (target.getAttribute('data-action') === 'note') {
      var entryId = target.getAttribute('data-entry-id') || target.getAttribute('data-prompt-id');
      scheduleNoteUpdate(entryId, target.value || '');
    }
  }

  function buildSidebarDom() {
    if (document.getElementById('cng-nav-root')) {
      return;
    }

    var panel = document.createElement('aside');
    panel.id = 'cng-nav-root';
    panel.innerHTML =
      '<div class="cng-nav-header">' +
      '<div class="cng-nav-title">GPTgps</div>' +
      '<div class="cng-nav-header-actions">' +
      '<button type="button" id="cng-nav-ai" class="cng-nav-icon-btn" data-action="configure-ai">AI Off</button>' +
      '<button type="button" id="cng-nav-hide" class="cng-nav-icon-btn">Hide</button>' +
      '</div>' +
      '</div>' +
      '<input id="cng-nav-search" class="cng-nav-search" type="text" placeholder="Search prompt/note..." />' +
      '<div class="cng-nav-filters"><label class="cng-nav-checkbox"><input id="cng-nav-pinned-only" type="checkbox" />Pinned only</label></div>' +
      '<div id="cng-nav-stat" class="cng-nav-stat"></div>' +
      '<div id="cng-nav-content" class="cng-nav-content"></div>';

    var openBtn = document.createElement('button');
    openBtn.id = 'cng-nav-open';
    openBtn.className = 'cng-hidden';
    openBtn.type = 'button';
    openBtn.textContent = 'GPTgps';
    openBtn.title = 'Click to open. Drag to move.';

    document.body.appendChild(panel);
    document.body.appendChild(openBtn);

    panel.addEventListener('click', onSidebarClick);
    panel.addEventListener('input', onSidebarInput);
    panel.addEventListener('wheel', onSidebarWheel, { passive: false, capture: true });
    panel.addEventListener('scroll', onSidebarContainerScroll, true);
    bindMarkerPlacementEvents();
    bindHoverPreviewEvents();
    bindJumpDockEvents();
    bindSegmentLayoutObserver(panel);

    var hideBtn = document.getElementById('cng-nav-hide');
    var aiBtn = document.getElementById('cng-nav-ai');
    var search = document.getElementById('cng-nav-search');
    var pinnedOnly = document.getElementById('cng-nav-pinned-only');

    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        togglePanelVisibility(true);
      });
    }

    bindNavOpenBtnDrag(openBtn);
    applyNavOpenBtnPos(openBtn, state.navOpenBtnPos);
    openBtn.addEventListener('click', function (event) {
      if (state.navOpenBtnSuppressClick) {
        state.navOpenBtnSuppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      togglePanelVisibility(false);
    });

    if (search) {
      search.value = state.query;
    }
    if (pinnedOnly) {
      pinnedOnly.checked = state.pinnedOnly;
    }
    if (aiBtn) {
      updateAiButtonState();
    }
  }

  function injectStyles() {
    if (document.getElementById('cng-nav-style')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'cng-nav-style';
    style.textContent =
      '#cng-nav-root {' +
      'position: fixed;' +
      'top: 14px;' +
      'right: 14px;' +
      'width: min(320px, calc(100vw - 28px));' +
      'height: calc(100vh - 28px);' +
      'height: calc(100dvh - 28px);' +
      'min-width: 280px;' +
      'min-height: 320px;' +
      'max-height: calc(100vh - 20px);' +
      'max-height: calc(100dvh - 20px);' +
      'max-width: calc(100vw - 20px);' +
      'resize: both;' +
      'overflow: hidden;' +


      'display: flex;' +
      'flex-direction: column;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'border-radius: 12px;' +
      'background: rgba(15, 23, 42, 0.96);' +
      'color: #e2e8f0;' +
      'backdrop-filter: blur(8px);' +
      'box-shadow: 0 10px 25px rgba(2, 6, 23, 0.45);' +
      'z-index: 2147483000;' +
      'font-family: "Segoe UI", "SF Pro Text", sans-serif;' +
      '}' +
      '#cng-nav-root * { box-sizing: border-box; }' +
      '#cng-nav-root.cng-hidden { display: none; }' +
      '.cng-nav-header {' +
      'display: flex;' +
      'justify-content: space-between;' +
      'align-items: center;' +
      'padding: 10px 12px 8px;' +
      'border-bottom: 1px solid rgba(148, 163, 184, 0.24);' +
      '}' +
      '.cng-nav-title { font-size: 14px; font-weight: 600; letter-spacing: 0.02em; }' +
      '.cng-nav-header-actions { display: inline-flex; align-items: center; gap: 6px; }' +
      '.cng-nav-icon-btn {' +
      'border: 1px solid rgba(148, 163, 184, 0.4);' +
      'background: rgba(30, 41, 59, 0.9);' +
      'color: #e2e8f0;' +
      'border-radius: 8px;' +
      'font-size: 12px;' +
      'padding: 4px 8px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-nav-search {' +
      'margin: 10px 12px 8px;' +
      'padding: 8px 10px;' +
      'border: 1px solid rgba(148, 163, 184, 0.36);' +
      'background: rgba(30, 41, 59, 0.8);' +
      'color: #e2e8f0;' +
      'border-radius: 8px;' +
      'font-size: 12px;' +
      'outline: none;' +
      '}' +
      '.cng-nav-search:focus { border-color: #38bdf8; }' +
      '.cng-nav-filters {' +
      'padding: 0 12px 8px;' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: flex-end;' +
      '}' +
      '.cng-nav-checkbox {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 6px;' +
      'font-size: 11px;' +
      'color: #cbd5e1;' +
      'user-select: none;' +
      '}' +
      '.cng-nav-checkbox input {' +
      'accent-color: #38bdf8;' +
      '}' +
      '.cng-nav-stat {' +
      'padding: 0 12px 8px;' +
      'font-size: 11px;' +
      'color: #94a3b8;' +
      '}' +
      '.cng-nav-content {' +
      'flex: 1 1 auto;' +
      'min-height: 0;' +
      'overflow-y: auto;' +
      'overflow-x: hidden;' +
      'overscroll-behavior: contain;' +
      'scrollbar-gutter: stable;' +
      'padding: 0 10px 10px;' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 8px;' +
      '}' +
      '.cng-empty {' +
      'font-size: 12px;' +
      'padding: 10px;' +
      'border-radius: 10px;' +
      'background: rgba(15, 23, 42, 0.7);' +
      'border: 1px dashed rgba(148, 163, 184, 0.4);' +
      'color: #cbd5e1;' +
      '}' +
      '.cng-segment {' +
      'border: 1px solid rgba(148, 163, 184, 0.22);' +
      'border-radius: 10px;' +
      'overflow: hidden;' +
      'background: rgba(15, 23, 42, 0.65);' +
      '}' +
      '.cng-segment-header {' +
      'width: 100%;' +
      'padding: 8px 10px;' +
      'display: flex;' +
      'flex-direction: column;' +
      'text-align: left;' +
      'gap: 6px;' +
      'border: 0;' +
      'background: rgba(30, 41, 59, 0.85);' +
      'cursor: pointer;' +
      'color: #e2e8f0;' +
      '}' +
      '.cng-segment-meta {' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: space-between;' +
      'gap: 8px;' +
      '}' +
      '.cng-segment-meta-info {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 6px;' +
      'min-width: 0;' +
      '}' +
      '.cng-segment-count {' +
      'font-size: 11px;' +
      'color: #94a3b8;' +
      'white-space: nowrap;' +
      '}' +
      '.cng-segment-ai-status {' +
      'font-size: 10px;' +
      'line-height: 1.2;' +
      'padding: 2px 6px;' +
      'border-radius: 999px;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'white-space: nowrap;' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-queued {' +
      'color: #bfdbfe;' +
      'border-color: rgba(147, 197, 253, 0.65);' +
      'background: rgba(30, 64, 175, 0.28);' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-running {' +
      'color: #67e8f9;' +
      'border-color: rgba(103, 232, 249, 0.75);' +
      'background: rgba(8, 47, 73, 0.38);' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-done {' +
      'color: #86efac;' +
      'border-color: rgba(134, 239, 172, 0.7);' +
      'background: rgba(20, 83, 45, 0.32);' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-failed {' +
      'color: #fecaca;' +
      'border-color: rgba(248, 113, 113, 0.72);' +
      'background: rgba(127, 29, 29, 0.34);' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-fallback {' +
      'color: #fcd34d;' +
      'border-color: rgba(250, 204, 21, 0.7);' +
      'background: rgba(120, 53, 15, 0.32);' +
      '}' +
      '.cng-segment-ai-status.cng-ai-state-waiting {' +
      'color: #cbd5e1;' +
      'border-color: rgba(148, 163, 184, 0.5);' +
      'background: rgba(30, 41, 59, 0.38);' +
      '}' +
      '.cng-segment-actions {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 6px;' +
      '}' +
      '.cng-segment-caret {' +
      'font-size: 12px;' +
      'color: #94a3b8;' +
      'min-width: 12px;' +
      'text-align: center;' +
      '}' +
      '.cng-segment-rename {' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.92);' +
      'color: #cbd5e1;' +
      'font-size: 10px;' +
      'border-radius: 8px;' +
      'padding: 2px 7px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-segment-regen {' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.92);' +
      'color: #cbd5e1;' +
      'font-size: 10px;' +
      'border-radius: 8px;' +
      'padding: 2px 7px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-segment-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.cng-segment-summary { margin-top: 4px; font-size: 11px; line-height: 1.3; color: #cbd5e1; text-align: left; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; opacity: 0.95; }' +
      '.cng-segment-summary.cng-segment-summary-pending { color: #94a3b8; font-style: italic; }' +
      '.cng-segment-error {' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: space-between;' +
      'gap: 8px;' +
      'padding: 6px 10px;' +
      'border-top: 1px solid rgba(239, 68, 68, 0.3);' +
      'background: rgba(127, 29, 29, 0.18);' +
      '}' +
      '.cng-segment-error-text { font-size: 11px; color: #fca5a5; line-height: 1.3; }' +
      '.cng-segment-retry {' +
      'border: 1px solid rgba(248, 113, 113, 0.6);' +
      'background: rgba(127, 29, 29, 0.4);' +
      'color: #fecaca;' +
      'font-size: 10px;' +
      'padding: 2px 8px;' +
      'border-radius: 8px;' +
      'cursor: pointer;' +
      'white-space: nowrap;' +
      '}' +
      '.cng-segment-prompts {' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 8px;' +
      'padding: 8px;' +
      'max-height: min(46vh, 420px);' +
      'overflow-y: auto;' +
      'overflow-x: hidden;' +
      'overscroll-behavior: contain;' +
      'scrollbar-gutter: stable;' +
      '}' +
      '.cng-segment-prompts.cng-hidden { display: none; }' +
      '.cng-prompt-item {' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 6px;' +
      'background: rgba(30, 41, 59, 0.7);' +
      'border: 1px solid rgba(148, 163, 184, 0.25);' +
      'border-radius: 8px;' +
      'padding: 8px;' +
      '}' +
      '.cng-marker-item {' +
      'border-color: rgba(250, 204, 21, 0.55);' +
      'background: rgba(120, 53, 15, 0.24);' +
      '}' +
      '.cng-prompt-item-pinned { border-color: rgba(14, 165, 233, 0.98); box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.55), 0 0 0 1px rgba(56, 189, 248, 0.25); background: rgba(14, 116, 144, 0.22); }' +
      '.cng-marker-item.cng-prompt-item-pinned { border-color: rgba(251, 191, 36, 0.95); box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.5), 0 0 0 1px rgba(250, 204, 21, 0.2); background: rgba(120, 53, 15, 0.34); }' +
      '.cng-prompt-item-active {' +
      'border-color: rgba(103, 232, 249, 0.95);' +
      'box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.45);' +
      '}' +
      '.cng-prompt-item-active .cng-item-content-btn { color: #67e8f9; }' +
      '.cng-prompt-actions-row {' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: flex-end;' +
      'width: 100%;' +
      'gap: 8px;' +
      '}' +
      '.cng-item-content-btn {' +
      'border: 0;' +
      'background: transparent;' +
      'padding: 0;' +
      'margin: 0;' +
      'text-align: left;' +
      'font-size: 12px;' +
      'line-height: 1.35;' +
      'color: #e2e8f0;' +
      'cursor: pointer;' +
      'width: 100%;' +
      'word-break: break-word;' +
      '}' +
      '.cng-item-content-btn:hover { color: #67e8f9; }' +
      '.cng-prompt-actions {' +
      'display: flex;' +
      'gap: 6px;' +
      'align-items: center;' +
      'flex-wrap: wrap;' +
      'justify-content: flex-end;' +
      '}' +
      '.cng-pin-btn, .cng-split-btn {' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.95);' +
      'color: #e2e8f0;' +
      'font-size: 11px;' +
      'line-height: 1.25;' +
      'border-radius: 8px;' +
      'padding: 3px 8px;' +
      'cursor: pointer;' +
      'height: fit-content;' +
      'white-space: nowrap;' +
      'min-width: 58px;' +
      'text-align: center;' +
      '}' +
      '.cng-pin-btn-active {' +
      'border-color: rgba(56, 189, 248, 0.95);' +
      'background: rgba(8, 47, 73, 0.9);' +
      'color: #7dd3fc;' +
      'font-weight: 600;' +
      '}' +
      '.cng-split-btn:disabled {' +
      'opacity: 0.45;' +
      'cursor: not-allowed;' +
      '}' +
      '.cng-note-input {' +
      'width: 100%;' +
      'border: 1px solid rgba(148, 163, 184, 0.36);' +
      'background: rgba(15, 23, 42, 0.92);' +
      'color: #cbd5e1;' +
      'font-size: 11px;' +
      'padding: 6px 7px;' +
      'border-radius: 6px;' +
      'outline: none;' +
      '}' +
      '.cng-note-input:focus { border-color: #38bdf8; }' +
      '.cng-note-input.cng-hidden { display: none; }' +
      '.cng-item-ai-summary {' +
      'font-size: 11px;' +
      'line-height: 1.3;' +
      'color: #93c5fd;' +
      '}' +
      '.cng-item-ai-summary.cng-item-ai-summary-pending {' +
      'color: #94a3b8;' +
      'font-style: italic;' +
      '}' +
      '.cng-item-ai-summary.cng-item-ai-summary-error {' +
      'color: #fda4af;' +
      '}' +
      '.cng-hover-preview {' +
      'position: fixed;' +
      'z-index: 2147483590;' +
      'max-width: min(460px, calc(100vw - 24px));' +
      'padding: 8px 10px;' +
      'border-radius: 8px;' +
      'border: 1px solid rgba(148, 163, 184, 0.48);' +
      'background: rgba(15, 23, 42, 0.97);' +
      'color: #e2e8f0;' +
      'font-size: 11px;' +
      'line-height: 1.35;' +
      'white-space: normal;' +
      'word-break: break-word;' +
      'box-shadow: 0 8px 20px rgba(2, 6, 23, 0.5);' +
      'pointer-events: none;' +
      '}' +
      '.cng-hover-preview.cng-hidden { display: none; }' +
      '.cng-jump-dock {' +
      'position: fixed;' +
      'right: 8px;' +
      'top: 50%;' +
      'transform: translateY(-50%);' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 10px;' +
      'z-index: 2147482520;' +
      'pointer-events: none;' +
      '}' +
      '.cng-jump-dock.cng-hidden { display: none; }' +
      '.cng-jump-group {' +
      'display: inline-flex;' +
      'flex-direction: column;' +
      'align-items: center;' +
      'gap: 6px;' +
      'padding: 8px 7px;' +
      'border-radius: 999px;' +
      'background: rgba(125, 211, 252, 0.2);' +
      'border: 1px solid rgba(148, 163, 184, 0.42);' +
      'box-shadow: 0 6px 16px rgba(2, 6, 23, 0.34);' +
      'backdrop-filter: blur(5px);' +
      'pointer-events: auto;' +
      '}' +
      '.cng-jump-dot {' +
      'width: 10px;' +
      'height: 10px;' +
      'border-radius: 999px;' +
      'border: 1px solid transparent;' +
      'padding: 0;' +
      'margin: 0;' +
      'cursor: pointer;' +
      'transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;' +
      '}' +
      '.cng-jump-dot-neutral { background: #7f95ad; }' +
      '.cng-jump-dot-pin { background: #22d3ee; }' +
      '.cng-jump-dot-mark { background: #facc15; }' +
      '.cng-jump-dot-mark-pin { background: #f59e0b; }' +
      '.cng-jump-dot:hover {' +
      'transform: scale(1.22);' +
      'box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.2), 0 0 8px rgba(56, 189, 248, 0.45);' +
      '}' +
      '.cng-jump-dot:active { transform: scale(0.92); }' +
      '.cng-jump-dot-active {' +
      'border-color: rgba(241, 245, 249, 0.95);' +
      'box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.95), 0 0 0 4px rgba(125, 211, 252, 0.45);' +
      '}' +
      '.cng-marker-placement-hint {' +
      'position: fixed;' +
      'display: none;' +
      'pointer-events: none;' +
      'z-index: 2147483550;' +
      'height: 0;' +
      '}' +
      '.cng-marker-placement-hint.cng-marker-placement-hint-active { display: block; }' +
      '.cng-marker-placement-line {' +
      'position: absolute;' +
      'left: 0;' +
      'right: 0;' +
      'height: 0;' +
      'border-top: 1px dashed rgba(56, 189, 248, 0.92);' +
      '}' +
      '.cng-marker-placement-dot {' +
      'position: absolute;' +
      'left: 0;' +
      'top: -4px;' +
      'width: 8px;' +
      'height: 8px;' +
      'border-radius: 50%;' +
      'background: rgba(56, 189, 248, 0.95);' +
      'box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.9);' +
      '}' +
      '#cng-inline-marker-layer {' +
      'position: absolute;' +
      'left: 0;' +
      'top: 0;' +
      'right: 0;' +
      'pointer-events: none;' +
      'z-index: 4;' +
      'overflow: visible;' +
      '}' +
      '.cng-inline-marker {' +
      'position: absolute;' +
      'z-index: 3;' +
      'padding: 3px 8px;' +
      'border-radius: 7px;' +
      'border: 1px solid rgba(250, 204, 21, 0.75);' +
      'background: rgba(113, 63, 18, 0.28);' +
      'color: #fde68a;' +
      'font-size: 11px;' +
      'line-height: 1.2;' +
      'cursor: grab;' +
      'pointer-events: auto;' +
      'user-select: none;' +
      'touch-action: none;' +
      'transform: translateY(-50%);' +
      'white-space: nowrap;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      '}' +
      '.cng-inline-marker.cng-inline-marker-dragging { cursor: grabbing; opacity: 0.85; }' +
      '#cng-nav-open {' +
      'position: fixed;' +
      'right: 14px;' +
      'bottom: 14px;' +
      'z-index: 2147483000;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.98);' +
      'color: #e2e8f0;' +
      'font-size: 12px;' +
      'padding: 8px 10px;' +
      'border-radius: 999px;' +
      'cursor: grab;' +
      'user-select: none;' +
      'touch-action: none;' +
      '}' +
      '#cng-nav-open.cng-hidden { display: none; }' +
      '#cng-nav-open.cng-open-dragging { cursor: grabbing; }' +
      '.cng-ai-modal-overlay {' +
      'position: fixed;' +
      'inset: 0;' +
      'background: rgba(2, 6, 23, 0.55);' +
      'z-index: 2147483600;' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'padding: 14px;' +
      '}' +
      '.cng-ai-modal {' +
      'width: min(520px, calc(100vw - 28px));' +
      'max-height: calc(100vh - 28px);' +
      'overflow: auto;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.98);' +
      'border-radius: 12px;' +
      'padding: 12px;' +
      'color: #e2e8f0;' +
      '}' +
      '.cng-ai-modal-header {' +
      'display: flex;' +
      'justify-content: space-between;' +
      'align-items: center;' +
      'margin-bottom: 10px;' +
      '}' +
      '.cng-ai-modal-title { font-size: 14px; font-weight: 600; }' +
      '.cng-ai-modal-close {' +
      'border: 1px solid rgba(148, 163, 184, 0.4);' +
      'background: rgba(30, 41, 59, 0.85);' +
      'color: #e2e8f0;' +
      'border-radius: 8px;' +
      'font-size: 11px;' +
      'padding: 2px 8px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-ai-modal-grid {' +
      'display: grid;' +
      'grid-template-columns: 128px 1fr;' +
      'gap: 8px 10px;' +
      'align-items: center;' +
      '}' +
      '.cng-ai-modal-grid label { font-size: 11px; color: #cbd5e1; }' +
      '.cng-ai-modal-grid input:not([type="checkbox"]), .cng-ai-modal-grid select {' +
      'width: 100%;' +
      'border: 1px solid rgba(148, 163, 184, 0.38);' +
      'background: rgba(30, 41, 59, 0.9);' +
      'color: #e2e8f0;' +
      'border-radius: 8px;' +
      'padding: 7px 8px;' +
      'font-size: 12px;' +
      'outline: none;' +
      '}' +
      '.cng-ai-modal-grid input:not([type="checkbox"]):focus, .cng-ai-modal-grid select:focus { border-color: #38bdf8; }' +
      '.cng-ai-checkbox {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 6px;' +
      'font-size: 11px;' +
      'color: #cbd5e1;' +
      '}' +
      '.cng-ai-checkbox input { accent-color: #38bdf8; }' +
      '.cng-ai-modal-effective {' +
      'font-size: 11px;' +
      'line-height: 1.35;' +
      'color: #7dd3fc;' +
      'padding: 6px 8px;' +
      'border: 1px solid rgba(56, 189, 248, 0.4);' +
      'border-radius: 8px;' +
      'background: rgba(8, 47, 73, 0.35);' +
      'min-height: 30px;' +
      'word-break: break-word;' +
      '}' +
      '.cng-ai-modal-status {' +
      'margin-top: 10px;' +
      'font-size: 11px;' +
      'color: #94a3b8;' +
      'line-height: 1.35;' +
      '}' +
      '.cng-ai-modal-status-ok { color: #67e8f9; }' +
      '.cng-ai-modal-status-error { color: #fda4af; }' +
      '.cng-ai-modal-actions {' +
      'display: flex;' +
      'justify-content: flex-end;' +
      'gap: 8px;' +
      'margin-top: 12px;' +
      '}' +
      '.cng-ai-modal-actions button {' +
      'border: 1px solid rgba(148, 163, 184, 0.4);' +
      'background: rgba(30, 41, 59, 0.9);' +
      'color: #e2e8f0;' +
      'border-radius: 8px;' +
      'font-size: 12px;' +
      'padding: 6px 10px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-ai-modal-actions .cng-ai-primary {' +
      'border-color: rgba(56, 189, 248, 0.85);' +
      'background: rgba(12, 74, 110, 0.9);' +
      'color: #dbeafe;' +
      '}' +
      '.cng-nav-highlight {' +
      'outline: 2px solid rgba(56, 189, 248, 0.95) !important;' +
      'outline-offset: 3px;' +
      'transition: outline-color 0.3s ease;' +
      '}' +
      '@media (max-width: 1100px) {' +
      '#cng-nav-root { width: min(90vw, 332px); top: 8px; right: 8px; height: calc(100vh - 16px); height: calc(100dvh - 16px); min-width: 248px; min-height: 280px; max-height: calc(100vh - 12px); max-height: calc(100dvh - 12px); max-width: calc(100vw - 12px); }' +
      '#cng-nav-open { right: 8px; bottom: 8px; }' +
      '#cng-jump-dock { right: 4px; }' +
      '}';

    document.head.appendChild(style);
  }

  async function onPathChanged() {
    stopMarkerPlacementMode();
    hideHoverPreview();
    Object.keys(state.noteInputTimers).forEach(function (entryId) {
      clearTimeout(state.noteInputTimers[entryId]);
    });
    state.noteInputTimers = {};

    state.currentPath = window.location.pathname;
    state.query = '';
    state.pinnedOnly = false;
    state.activePromptId = '';
    state.activeEntryId = '';
    state.prompts = [];
    state.promptCatalog = {};
    state.fallbackContextLocks = {};
    state.promptOrder = [];
    state.promptElements = new Map();
    state.segments = [];
    state.pins = new Set();
    state.notes = {};
    state.noteEditorOpen = new Set();
    state.noteInputTimers = {};
    state.markers = {};
    state.markerOrder = [];
    state.markerSplitStarts = new Set();
    state.manualSplitStarts = new Set();
    state.customSegmentTitles = {};
    state.aiSegmentSummaries = {};
    state.aiSegmentErrors = {};
    state.aiItemSummaries = {};
    state.aiItemErrors = {};
    clearAiPending();
    clearAiInFlight();
    clearAiItemPending();
    state.sidebarScrollTop = 0;
    state.segmentScrollTops = {};
    state.expandedSegments = new Set();
    state.knownSegmentIds = new Set();
    state.persistenceEnabled = false;
    state.conversationId = '';
    state.initialized = false;

    clearTimeout(state.saveTimer);
    clearTimeout(state.refreshTimer);

    var searchInput = document.getElementById('cng-nav-search');
    if (searchInput) {
      searchInput.value = '';
    }

    render();
    await loadConversationState();
    refreshPromptsFromDom();
  }

  function startObservers() {
    function isUserPromptRelatedNode(node) {
      if (!node) {
        return false;
      }

      var element = node.nodeType === 1 ? node : node.parentElement;
      if (!element) {
        return false;
      }

      if (element.matches && element.matches(SELECTOR_USER_PROMPT)) {
        return true;
      }
      if (element.closest && element.closest(SELECTOR_USER_PROMPT)) {
        return true;
      }
      if (element.querySelector && element.querySelector(SELECTOR_USER_PROMPT)) {
        return true;
      }

      return false;
    }

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];
        if (!mutation) {
          continue;
        }

        if (mutation.type === 'characterData') {
          if (isUserPromptRelatedNode(mutation.target)) {
            scheduleRefresh();
            return;
          }
          continue;
        }

        if (mutation.type !== 'childList') {
          continue;
        }

        if (isUserPromptRelatedNode(mutation.target)) {
          scheduleRefresh();
          return;
        }

        for (var addIdx = 0; addIdx < mutation.addedNodes.length; addIdx += 1) {
          if (isUserPromptRelatedNode(mutation.addedNodes[addIdx])) {
            scheduleRefresh();
            return;
          }
        }

        for (var removeIdx = 0; removeIdx < mutation.removedNodes.length; removeIdx += 1) {
          if (isUserPromptRelatedNode(mutation.removedNodes[removeIdx])) {
            scheduleRefresh();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    setInterval(function () {
      if (window.location.pathname !== state.currentPath) {
        onPathChanged();
        return;
      }

      // keep list fresh while ChatGPT virtualized list updates.
      scheduleRefresh();
    }, 2200);
  }

  async function bootstrap() {
    injectStyles();
    await loadAiConfig();
    await loadNavOpenBtnPos();
    buildSidebarDom();
    bindNetworkEvents();
    syncNetworkState({ silent: true });
    bindKeyboardShortcuts();
    await loadConversationState();
    refreshPromptsFromDom();
    startObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
