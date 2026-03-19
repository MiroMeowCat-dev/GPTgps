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
  var STORAGE_PREFIX = 'cng_nav_v1';
  var MAX_CONTEXT_LOCKS = 1500;
  var FALLBACK_SCROLL_UNIT = 220;
  var FALLBACK_MAX_REUSE_SCORE_SINGLE = 18;
  var FALLBACK_MAX_REUSE_SCORE_DUPLICATE = 6;
  var FALLBACK_MIN_SCORE_GAP_DUPLICATE = 1.4;
  var FALLBACK_MIN_REUSE_CONFIDENCE_WRITE = 0.18;
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
    manualSplitStarts: new Set(),
    customSegmentTitles: {},
    query: '',
    pinnedOnly: false,
    activePromptId: '',
    expandedSegments: new Set(),
    knownSegmentIds: new Set(),
    hidden: false,
    initialized: false,
    statNotice: '',
    noticeTimer: null,
    refreshTimer: null,
    saveTimer: null,
    shortcutsBound: false
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
      state.manualSplitStarts = new Set();
      state.customSegmentTitles = {};
      state.promptCatalog = {};
      state.fallbackContextLocks = {};
      state.promptOrder = [];
      state.expandedSegments = new Set();
      state.knownSegmentIds = new Set();
      state.pinnedOnly = false;
      state.initialized = true;
      return;
    }

    var saved = await storageGet(storageKey(state.conversationId));

    state.pins = new Set(saved && Array.isArray(saved.pins) ? saved.pins : []);
    state.notes = saved && saved.notes && typeof saved.notes === 'object' ? saved.notes : {};
    state.manualSplitStarts = new Set(saved && Array.isArray(saved.manualSplitStarts) ? saved.manualSplitStarts : []);
    state.customSegmentTitles = saved && saved.customSegmentTitles && typeof saved.customSegmentTitles === 'object' ? saved.customSegmentTitles : {};
    state.promptCatalog = saved && saved.promptCatalog && typeof saved.promptCatalog === 'object' ? saved.promptCatalog : {};
    state.fallbackContextLocks = saved && saved.fallbackContextLocks && typeof saved.fallbackContextLocks === 'object' ? saved.fallbackContextLocks : {};

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
        manualSplitStarts: Array.from(state.manualSplitStarts),
        customSegmentTitles: state.customSegmentTitles,
        promptCatalog: state.promptCatalog,
        fallbackContextLocks: state.fallbackContextLocks,
        promptOrder: state.promptOrder,
        expandedSegments: Array.from(state.expandedSegments),
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

  function shouldUpdateContextLock(contextLocks, contextKey, contextLocked, reused, confidence, minReuseConfidence) {
    if (!contextKey || !contextLocks) {
      return false;
    }

    var hasExistingLock = Object.prototype.hasOwnProperty.call(contextLocks, contextKey) && Boolean(contextLocks[contextKey]);
    if (!hasExistingLock) {
      return true;
    }

    if (contextLocked) {
      return true;
    }

    var safeConfidence = typeof confidence === 'number' ? confidence : 0;
    var threshold = typeof minReuseConfidence === 'number' ? minReuseConfidence : 0;
    return Boolean(reused) && safeConfidence >= threshold;
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
          return { id: lockedId, reused: true, confidence: 0.9, contextLocked: true };
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
        return { id: bestId, reused: true, confidence: confidence, contextLocked: false };
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
        contextLocked: true
      };
    }

    return {
      id: createFallbackPromptId(fingerprint, fallbackContext, candidates.length),
      reused: false,
      confidence: 0,
      contextLocked: false
    };
  }

  function promptIdFromNode(node, text, visibleOrder, fallbackContext, contextHints) {
    var article = node.closest('article');
    var dataTestId = (article && article.getAttribute('data-testid')) || node.getAttribute('data-testid');

    if (dataTestId) {
      var stableId = 'dt-' + dataTestId.replace(/[^a-zA-Z0-9_-]/g, '-');
      fallbackContext.usedIds.add(stableId);
      return {
        id: stableId,
        fingerprint: null,
        reused: true,
        confidence: 1,
        contextLocked: false,
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
      contextLocked: resolved.contextLocked,
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

  function jumpTargetFromNode(node) {
    return (
      node.closest('article') ||
      node.closest('[data-testid^="conversation-turn"]') ||
      node.closest('.group.w-full') ||
      node
    );
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

  function buildSegmentTitle(order, firstPromptText) {
    var firstSentence = normalizeWhitespace((firstPromptText || '').split(/[.!?\n]/)[0]);
    var clipped = shortText(firstSentence || 'Untitled', 42);
    return 'Segment ' + order + ': ' + clipped;
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
        tokens: Array.isArray(stored.tokens) ? stored.tokens : tokenize(stored.text)
      });
    }

    return ordered;
  }

  function buildSegments(prompts) {
    var segments = [];
    var promptById = new Map();
    var previous = null;
    var currentSegment = null;

    for (var i = 0; i < prompts.length; i += 1) {
      var prompt = prompts[i];
      if (!promptById.has(prompt.id)) {
        promptById.set(prompt.id, prompt);
      }
      var manualSplit = i > 0 && state.manualSplitStarts.has(prompt.id);

      if (!previous || manualSplit || shouldSplitSegment(previous, prompt)) {
        currentSegment = {
          id: 'seg-' + prompt.id,
          startPromptId: prompt.id,
          order: segments.length + 1,
          promptIds: [],
          title: '',
          summary: ''
        };
        segments.push(currentSegment);
      }

      currentSegment.promptIds.push(prompt.id);
      previous = prompt;
    }

    for (var j = 0; j < segments.length; j += 1) {
      var segment = segments[j];
      var segmentPrompts = segment.promptIds
        .map(function (promptId) {
          return promptById.get(promptId);
        })
        .filter(Boolean);

      var firstText = segmentPrompts.length ? segmentPrompts[0].text : '';
      var summaryKeywords = buildKeywordSummary(
        segmentPrompts.map(function (item) {
          return item.text;
        })
      );

      var customTitle = state.customSegmentTitles[segment.startPromptId];
      segment.title = customTitle || buildSegmentTitle(segment.order, firstText);
      segment.summary = segmentPrompts.length + ' prompts' + (summaryKeywords ? ' | ' + summaryKeywords : '');
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
        hintHash: buildPromptHintHash(parsedText)
      });
    }

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
      minReuseConfidenceWrite: FALLBACK_MIN_REUSE_CONFIDENCE_WRITE,
      contextMatchBonus: FALLBACK_CONTEXT_MATCH_BONUS,
      contextMismatchPenalty: FALLBACK_CONTEXT_MISMATCH_PENALTY,
      contextBucketBonus: FALLBACK_CONTEXT_BUCKET_BONUS,
      scrollBucketSize: FALLBACK_SCROLL_BUCKET_SIZE
    };
    var catalogChanged = false;

    for (var i = 0; i < parsedPrompts.length; i += 1) {
      var node = parsedPrompts[i].node;
      var text = parsedPrompts[i].text;
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
      var contextLocked = Boolean(resolved.contextLocked);

      if (reusedFallback && !contextLocked && reuseConfidence < fallbackContext.minReuseConfidenceWrite) {
        id = createFallbackPromptId(fingerprint, fallbackContext, 0);
        reusedFallback = false;
        contextLocked = false;
      }

      var existing = state.promptCatalog[id];
      if (existing && fingerprint && existing.fingerprint && existing.fingerprint !== fingerprint) {
        id = createFallbackPromptId(fingerprint, fallbackContext, 0);
        existing = state.promptCatalog[id];
        reusedFallback = false;
        contextLocked = false;
      }

      if (reusedFallback && !contextLocked && existing && existing.text !== text && reuseConfidence < 0.55) {
        id = createFallbackPromptId(fingerprint, fallbackContext, 0);
        existing = state.promptCatalog[id];
        reusedFallback = false;
        contextLocked = false;
      }

      if (
        fingerprint &&
        resolved.contextKey &&
        id &&
        shouldUpdateContextLock(
          state.fallbackContextLocks,
          resolved.contextKey,
          contextLocked,
          resolved.reused,
          reuseConfidence,
          fallbackContext.minReuseConfidenceWrite
        )
      ) {
        state.fallbackContextLocks[resolved.contextKey] = id;
      }

      if (!existing) {
        state.promptCatalog[id] = {
          text: text,
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
          if (reusedFallback && (contextLocked || reuseConfidence < 0.55)) {
            id = createFallbackPromptId(fingerprint, fallbackContext, 0);
            state.promptCatalog[id] = {
              text: text,
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
            if (
              fingerprint &&
              resolved.contextKey &&
              id &&
              shouldUpdateContextLock(
                state.fallbackContextLocks,
                resolved.contextKey,
                contextLocked,
                resolved.reused,
                reuseConfidence,
                fallbackContext.minReuseConfidenceWrite
              )
            ) {
              state.fallbackContextLocks[resolved.contextKey] = id;
            }
            elements.set(id, jumpTargetFromNode(node));
            continue;
          }
          existing.text = text;
          existing.tokens = tokens;
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

      elements.set(id, jumpTargetFromNode(node));
    }

    state.promptElements = elements;

    var dataChanged = false;
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

    if (state.prompts.length > 0 && state.manualSplitStarts.has(state.prompts[0].id)) {
      state.manualSplitStarts.delete(state.prompts[0].id);
      dataChanged = true;
    }

    if (catalogChanged || !state.segments.length) {
      state.segments = buildSegments(state.prompts);
      syncExpandedSegments(state.segments);
      dataChanged = true;
    }

    var nextActivePromptId = getActivePromptId(elements);
    var activeChanged = nextActivePromptId !== state.activePromptId;
    if (activeChanged) {
      state.activePromptId = nextActivePromptId;
    }

    if (!suppressRender) {
      if (forceRender || dataChanged) {
        render(forceRender);
      } else if (activeChanged) {
        syncActivePromptHighlight();
      }
    }

    if (dataChanged) {
      persistConversationState();
    }
  }
  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(function () {
      refreshPromptsFromDom();
    }, 180);
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
      var promptId = item.getAttribute('data-prompt-id');
      if (state.activePromptId && promptId === state.activePromptId) {
        item.classList.add('cng-prompt-item-active');
      } else {
        item.classList.remove('cng-prompt-item-active');
      }
    }
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

  async function tryLoadPromptElementByScroll(promptId, targetIndex) {
    var container = getChatScrollContainer();
    if (!container) {
      return null;
    }

    var maxAttempts = 28;
    var step = Math.max(260, Math.floor(container.clientHeight * 0.8));
    var direction = 1;

    for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
      refreshPromptsFromDom({ suppressRender: true });
      var found = state.promptElements.get(promptId);
      if (found) {
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
      if (found) {
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

  async function jumpToPrompt(promptId) {
    var target = state.promptElements.get(promptId);
    if (!target) {
      refreshPromptsFromDom();
      target = state.promptElements.get(promptId);
    }

    if (!target) {
      var targetPrompt = getPromptById(promptId);
      var targetIndex = targetPrompt ? targetPrompt.index : state.promptOrder.indexOf(promptId);
      target = await tryLoadPromptElementByScroll(promptId, targetIndex);
    }

    if (!target || !target.scrollIntoView) {
      setStatNotice('Prompt not loaded yet', 2000);
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    applyJumpHighlight(target);
    setStatNotice('', 0);
  }

  function getPromptById(promptId) {
    for (var i = 0; i < state.prompts.length; i += 1) {
      if (state.prompts[i].id === promptId) {
        return state.prompts[i];
      }
    }
    return null;
  }

  function segmentVisiblePrompts(segment, query, pinnedOnly) {
    var queryLower = query.toLowerCase();

    var list = segment.promptIds
      .map(function (promptId) {
        return getPromptById(promptId);
      })
      .filter(Boolean)
      .filter(function (prompt) {
        if (pinnedOnly && !state.pins.has(prompt.id)) {
          return false;
        }

        if (!queryLower) {
          return true;
        }

        var noteText = state.notes[prompt.id] || '';
        var packed = (prompt.text + ' ' + noteText).toLowerCase();
        return packed.indexOf(queryLower) !== -1;
      })
      .sort(function (a, b) {
        var pinA = state.pins.has(a.id) ? 1 : 0;
        var pinB = state.pins.has(b.id) ? 1 : 0;
        if (pinA !== pinB) {
          return pinB - pinA;
        }
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

    container.innerHTML = '';

    if (!state.initialized) {
      statEl.textContent = state.statNotice || 'Loading navigator...';
      return;
    }

    if (!state.prompts.length) {
      statEl.textContent = state.statNotice || 'No user prompts found in this page yet.';
      var empty = createElement('div', 'cng-empty');
      empty.textContent = 'Start a chat and your prompts will appear here.';
      container.appendChild(empty);
      return;
    }

    var query = normalizeWhitespace(state.query || '');
    var totalVisible = 0;

    for (var i = 0; i < state.segments.length; i += 1) {
      var segment = state.segments[i];
      var visiblePrompts = segmentVisiblePrompts(segment, query, state.pinnedOnly);

      if (!visiblePrompts.length) {
        continue;
      }

      totalVisible += visiblePrompts.length;

      var segmentBox = createElement('section', 'cng-segment');

      var headerBtn = createElement('button', 'cng-segment-header');
      headerBtn.type = 'button';
      headerBtn.setAttribute('data-segment-id', segment.id);

      var title = createElement('div', 'cng-segment-title');
      title.setAttribute('data-segment-id', segment.id);
      title.textContent = segment.title;

      var summary = createElement('div', 'cng-segment-summary');
      summary.setAttribute('data-segment-id', segment.id);
      summary.textContent = segment.summary;

      var renameBtn = createElement('button', 'cng-segment-rename');
      renameBtn.type = 'button';
      renameBtn.setAttribute('data-action', 'rename-segment');
      renameBtn.setAttribute('data-start-prompt-id', segment.startPromptId);
      renameBtn.textContent = 'Rename';

      var caret = createElement('div', 'cng-segment-caret');
      caret.setAttribute('data-segment-id', segment.id);
      caret.textContent = state.expandedSegments.has(segment.id) ? 'v' : '>';

      headerBtn.appendChild(title);
      headerBtn.appendChild(summary);
      headerBtn.appendChild(renameBtn);
      headerBtn.appendChild(caret);
      segmentBox.appendChild(headerBtn);

      var isOpen = state.expandedSegments.has(segment.id);
      var promptsWrap = createElement('div', 'cng-segment-prompts' + (isOpen ? '' : ' cng-hidden'));

      for (var j = 0; j < visiblePrompts.length; j += 1) {
        var prompt = visiblePrompts[j];
        var itemClass = 'cng-prompt-item' + (state.pins.has(prompt.id) ? ' cng-prompt-item-pinned' : '');
        if (state.activePromptId && state.activePromptId === prompt.id) {
          itemClass += ' cng-prompt-item-active';
        }

        var item = createElement('article', itemClass);
        item.setAttribute('data-prompt-id', prompt.id);

        var topRow = createElement('div', 'cng-prompt-top');

        var jumpBtn = createElement('button', 'cng-jump-btn');
        jumpBtn.type = 'button';
        jumpBtn.setAttribute('data-action', 'jump');
        jumpBtn.setAttribute('data-prompt-id', prompt.id);
        jumpBtn.textContent = '#' + (prompt.index + 1) + ' ' + shortText(prompt.text, 72);

        var actionGroup = createElement('div', 'cng-prompt-actions');

        var pinBtn = createElement('button', 'cng-pin-btn');
        pinBtn.type = 'button';
        pinBtn.setAttribute('data-action', 'pin');
        pinBtn.setAttribute('data-prompt-id', prompt.id);
        pinBtn.textContent = state.pins.has(prompt.id) ? 'Unpin' : 'Pin';

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

        topRow.appendChild(jumpBtn);
        topRow.appendChild(actionGroup);

        var noteInput = createElement('input', 'cng-note-input');
        noteInput.type = 'text';
        noteInput.placeholder = 'Add note...';
        noteInput.value = state.notes[prompt.id] || '';
        noteInput.setAttribute('data-action', 'note');
        noteInput.setAttribute('data-prompt-id', prompt.id);

        item.appendChild(topRow);
        item.appendChild(noteInput);
        promptsWrap.appendChild(item);
      }

      segmentBox.appendChild(promptsWrap);
      container.appendChild(segmentBox);
    }

    if (!totalVisible) {
      statEl.textContent = state.statNotice || 'No results for current search.';
      var noResults = createElement('div', 'cng-empty');
      noResults.textContent = 'Try another keyword.';
      container.appendChild(noResults);
      return;
    }

    var pinnedCount = 0;
    state.pins.forEach(function () {
      pinnedCount += 1;
    });

    var statText =
      totalVisible +
      ' prompt' +
      (totalVisible > 1 ? 's' : '') +
      ' | ' +
      state.segments.length +
      ' segment' +
      (state.segments.length > 1 ? 's' : '') +
      ' | ' +
      pinnedCount +
      ' pinned' +
      (state.pinnedOnly ? ' | pinned-only' : '');

    statEl.textContent = state.statNotice || statText;
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
    if (normalized) {
      state.notes[promptId] = normalized;
    } else {
      delete state.notes[promptId];
    }

    persistConversationState();
    render(true);
  }

  function toggleManualSplit(promptId) {
    var prompt = getPromptById(promptId);
    if (!prompt || prompt.index === 0) {
      return;
    }

    if (state.manualSplitStarts.has(promptId)) {
      state.manualSplitStarts.delete(promptId);
    } else {
      state.manualSplitStarts.add(promptId);
    }

    state.segments = buildSegments(state.prompts);
    syncExpandedSegments(state.segments);
    persistConversationState();
    render(true);
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

      if (action === 'pin') {
        var pinId = actionTarget.getAttribute('data-prompt-id');
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
    }

    var segmentTarget = target.closest('[data-segment-id]');
    if (segmentTarget) {
      toggleSegment(segmentTarget.getAttribute('data-segment-id'));
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
      var promptId = target.getAttribute('data-prompt-id');
      updateNote(promptId, target.value || '');
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
      '<div class="cng-nav-title">Prompt Navigator</div>' +
      '<button type="button" id="cng-nav-hide" class="cng-nav-icon-btn">Hide</button>' +
      '</div>' +
      '<input id=\"cng-nav-search\" class=\"cng-nav-search\" type=\"text\" placeholder=\"Search prompt/note...\" />' +
      '<div class=\"cng-nav-filters\"><label class=\"cng-nav-checkbox\"><input id=\"cng-nav-pinned-only\" type=\"checkbox\" />Pinned only</label></div>' +
      '<div id=\"cng-nav-stat\" class=\"cng-nav-stat\"></div>' +
      '<div id="cng-nav-content" class="cng-nav-content"></div>';

    var openBtn = document.createElement('button');
    openBtn.id = 'cng-nav-open';
    openBtn.className = 'cng-hidden';
    openBtn.type = 'button';
    openBtn.textContent = 'Navigator';

    document.body.appendChild(panel);
    document.body.appendChild(openBtn);

    panel.addEventListener('click', onSidebarClick);
    panel.addEventListener('input', onSidebarInput);

    var hideBtn = document.getElementById('cng-nav-hide');
    var search = document.getElementById('cng-nav-search');
    var pinnedOnly = document.getElementById('cng-nav-pinned-only');

    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        togglePanelVisibility(true);
      });
    }

    openBtn.addEventListener('click', function () {
      togglePanelVisibility(false);
    });

    if (search) {
      search.value = state.query;
    }
    if (pinnedOnly) {
      pinnedOnly.checked = state.pinnedOnly;
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
      'top: 12px;' +
      'right: 12px;' +
      'width: 340px;' +
      'max-height: calc(100vh - 24px);' +
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
      'overflow: auto;' +
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
      'display: grid;' +
      'grid-template-columns: 1fr;' +
      'text-align: left;' +
      'gap: 2px;' +
      'border: 0;' +
      'background: rgba(30, 41, 59, 0.85);' +
      'cursor: pointer;' +
      'color: #e2e8f0;' +
      'position: relative;' +
      '}' +
      '.cng-segment-caret {' +
      'position: absolute;' +
      'right: 10px;' +
      'top: 8px;' +
      'font-size: 12px;' +
      'color: #94a3b8;' +
      '}' +
      '.cng-segment-rename {' +
      'position: absolute;' +
      'right: 30px;' +
      'top: 5px;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.92);' +
      'color: #cbd5e1;' +
      'font-size: 10px;' +
      'border-radius: 999px;' +
      'padding: 1px 6px;' +
      'cursor: pointer;' +
      '}' +
      '.cng-segment-title { font-size: 12px; font-weight: 600; padding-right: 92px; }' +
      '.cng-segment-summary { font-size: 11px; color: #94a3b8; padding-right: 92px; }' +
      '.cng-segment-prompts {' +
      'display: flex;' +
      'flex-direction: column;' +
      'gap: 8px;' +
      'padding: 8px;' +
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
      '.cng-prompt-item-pinned { border-color: rgba(56, 189, 248, 0.9); }' +
      '.cng-prompt-item-active {' +
      'border-color: rgba(103, 232, 249, 0.95);' +
      'box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.45);' +
      '}' +
      '.cng-prompt-item-active .cng-jump-btn { color: #67e8f9; }' +
      '.cng-prompt-top {' +
      'display: grid;' +
      'grid-template-columns: 1fr auto;' +
      'gap: 8px;' +
      'align-items: start;' +
      '}' +
      '.cng-jump-btn {' +
      'border: 0;' +
      'background: transparent;' +
      'padding: 0;' +
      'margin: 0;' +
      'text-align: left;' +
      'font-size: 12px;' +
      'line-height: 1.35;' +
      'color: #e2e8f0;' +
      'cursor: pointer;' +
      '}' +
      '.cng-jump-btn:hover { color: #67e8f9; }' +
      '.cng-prompt-actions {' +
      'display: flex;' +
      'gap: 6px;' +
      'align-items: center;' +
      '}' +
      '.cng-pin-btn, .cng-split-btn {' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.95);' +
      'color: #e2e8f0;' +
      'font-size: 11px;' +
      'border-radius: 999px;' +
      'padding: 2px 8px;' +
      'cursor: pointer;' +
      'height: fit-content;' +
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
      '#cng-nav-open {' +
      'position: fixed;' +
      'right: 12px;' +
      'bottom: 14px;' +
      'z-index: 2147483000;' +
      'border: 1px solid rgba(148, 163, 184, 0.45);' +
      'background: rgba(15, 23, 42, 0.98);' +
      'color: #e2e8f0;' +
      'font-size: 12px;' +
      'padding: 8px 10px;' +
      'border-radius: 999px;' +
      'cursor: pointer;' +
      '}' +
      '#cng-nav-open.cng-hidden { display: none; }' +
      '.cng-nav-highlight {' +
      'outline: 2px solid rgba(56, 189, 248, 0.95) !important;' +
      'outline-offset: 3px;' +
      'transition: outline-color 0.3s ease;' +
      '}' +
      '@media (max-width: 1100px) {' +
      '#cng-nav-root { width: min(88vw, 340px); top: 8px; right: 8px; max-height: calc(100vh - 16px); }' +
      '#cng-nav-open { right: 8px; bottom: 8px; }' +
      '}';

    document.head.appendChild(style);
  }

  async function onPathChanged() {
    state.currentPath = window.location.pathname;
    state.query = '';
    state.pinnedOnly = false;
    state.activePromptId = '';
    state.prompts = [];
      state.promptCatalog = {};
      state.fallbackContextLocks = {};
      state.promptOrder = [];
    state.promptElements = new Map();
    state.segments = [];
    state.pins = new Set();
    state.notes = {};
    state.manualSplitStarts = new Set();
    state.customSegmentTitles = {};
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
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          scheduleRefresh();
          return;
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
    }, 1200);
  }

  async function bootstrap() {
    injectStyles();
    buildSidebarDom();
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

































































