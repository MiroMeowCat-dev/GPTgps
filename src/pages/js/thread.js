const url = new URL(window.location.href);
const threadRef = url.searchParams.get("thread") || "";

const NAV_STORAGE_PREFIX = "cng_nav_v1:";
const NAV_THREAD_PREFIX = "nav:";

const h_template = document.querySelector("#human");
const b_template = document.querySelector("#bot");
const main = document.querySelector("#main");

let branch_state;
let convo = [];
let renderItems = [];
let thread;

function storageGet(defaults) {
    return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) {
        node.textContent = value;
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safePlainText(value) {
    if (!value) {
        return "";
    }
    if (typeof value !== "string") {
        return String(value);
    }
    if (typeof htmlToPlainText === "function") {
        return htmlToPlainText(value).trim();
    }
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
    return safePlainText(value).replace(/\s+/g, " ").trim();
}

function formatDate(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return "-";
    }
    return new Date(timestampMs).toLocaleDateString("zh-CN");
}

function formatTime(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return "-";
    }
    return new Date(timestampMs).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
    });
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

function getThreadTitleText() {
    if (thread && thread.title) {
        return thread.title;
    }
    if (renderItems.length) {
        const firstLine = normalizeText(renderItems[0].text);
        if (firstLine) {
            return firstLine.slice(0, 72);
        }
    }
    if (Array.isArray(convo) && convo.length) {
        const firstLine = normalizeText(convo[0]);
        if (firstLine) {
            return firstLine.slice(0, 72);
        }
    }
    return "未命名线索";
}

function updateThreadHeader() {
    const title = getThreadTitleText();
    const messageCount = Array.isArray(renderItems) && renderItems.length
        ? renderItems.length
        : Array.isArray(convo) ? convo.length : 0;
    const source = thread && thread.source_type === "navigator"
        ? `${deriveProviderLabel(thread.provider)} 导航归档`
        : thread && thread.unified_id === true
            ? "ChatGPT 同步线索"
            : "本地归档线索";

    let summary = "查看完整会话、分支切换和代码块复制能力。";

    if (Array.isArray(renderItems) && renderItems.length > 1) {
        const preview = normalizeText(renderItems[1].text || renderItems[0].text);
        if (preview) {
            summary = preview.slice(0, 140);
        }
    } else if (Array.isArray(convo) && convo.length > 1) {
        const preview = normalizeText(convo[1] || convo[0]);
        if (preview) {
            summary = preview.slice(0, 140);
        }
    }

    document.title = `${title} · GPTgps`;
    setText("thread-title", title);
    setText("thread-summary", summary);
    setText("thread-message-count", String(messageCount));
    setText("thread-date", thread && thread.date ? thread.date : "-");
    setText("thread-time", thread && thread.time ? thread.time : "-");
    setText("thread-source", source);
}

function renderEmptyState(message) {
    main.innerHTML = `<div class="thread-empty">${escapeHtml(message)}</div>`;
    const continueButton = document.getElementById("continue");
    if (continueButton) {
        continueButton.disabled = true;
    }
}

function getCopyBarMarkup() {
    return "<div class=\"p-2 copy float-right\"><i class=\"fa-regular clipboard fa-clipboard\"></i> &nbsp; Copy code</div>";
}

function renderAssistantMessage(rawMessage) {
    const message = String(rawMessage || "");
    const oldBar = "<div class=\"flex items-center relative text-gray-200 bg-gray-800 px-4 py-2 text-xs font-sans\"><button class=\"flex ml-auto gap-2\"><svg stroke=\"currentColor\" fill=\"none\" stroke-width=\"2\" viewBox=\"0 0 24 24\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"h-4 w-4\" height=\"1em\" width=\"1em\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"></path><rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\" ry=\"1\"></rect></svg>Copy code</button></div>";

    if (!thread || !thread.mkdwn) {
        return message.replaceAll(oldBar, getCopyBarMarkup()).replaceAll("<div class=\"p-4\">", "<div>");
    }

    const options = {
        backslashEscapesHTMLTags: true,
        tables: true,
        simplifiedAutoLink: true
    };
    const converter = new showdown.Converter(options);
    const sanitized = message.replace(/```([\s\S]*?)```|<([^>]+)>/g, (match, codeBlock, lessThan) => {
        if (codeBlock) {
            return match;
        }
        return `&lt;${lessThan}>`;
    });
    const codeBlockRegex = /```(?:\w+)?(?<!\\)\n[\s\S]*?\n```/g;

    return converter.makeHtml(sanitized.replace(codeBlockRegex, (match) => {
        let language = match.match(/```(\w+)/);
        language = language ? language[1] : null;
        const cleanedMatch = match.replace(/```(\w+)/, "```");
        const code = cleanedMatch.slice(4, -3);
        const highlightedCode = hljs.highlightAuto(code, language ? [language] : undefined).value;
        return `<pre>${getCopyBarMarkup()}<code class="!whitespace-pre p-3 hljs ${language || ""}">${highlightedCode}</code></pre>`;
    }));
}

function copy_setup() {
    const clipboardBars = document.querySelectorAll(".copy");
    const codeElements = document.querySelectorAll("pre code");

    clipboardBars.forEach((clipboardBar, index) => {
        clipboardBar.addEventListener("click", async () => {
            const previousMarkup = clipboardBar.outerHTML;
            clipboardBar.innerHTML = `<icon class="fa-regular fa-check"></icon> &nbsp; ${await translate("copied")}`;
            setTimeout(() => {
                clipboardBar.outerHTML = previousMarkup;
                copy_setup();
            }, 2000);

            const codeElement = codeElements[index];
            if (!codeElement) {
                return;
            }
            await navigator.clipboard.writeText(codeElement.textContent || "");
        });
    });
}

function decorateCodeBlocks() {
    hljs.highlightAll();
    const blocks = document.querySelectorAll("pre code.hljs");
    Array.prototype.forEach.call(blocks, function (block) {
        const language = block.result && block.result.language ? block.result.language : block.className.split(" ").pop();
        let copyBar;
        if (block.parentElement.tagName === "DIV") {
            copyBar = block.parentElement.parentElement.querySelector(".copy");
        } else {
            copyBar = block.parentElement.querySelector(".copy");
        }
        if (copyBar && language && !copyBar.querySelector(".copy-language")) {
            copyBar.insertAdjacentHTML("afterbegin", `<span class="copy-language" style="margin-right:auto">${language}</span>`);
        }
    });
    copy_setup();
}

function appendHumanMessage(container, message) {
    const temp = h_template.content.cloneNode(true);
    temp.querySelector(".text").innerHTML = `<p>${escapeHtml(String(message || ""))}</p>`;
    container.appendChild(temp);
}

function appendAssistantMessage(container, message) {
    const temp = b_template.content.cloneNode(true);
    temp.querySelector(".text").innerHTML = renderAssistantMessage(message);
    container.appendChild(temp);
}

function loadThreadMessages(items) {
    main.innerHTML = "";
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item) {
            continue;
        }
        if (item.role === "assistant") {
            appendAssistantMessage(main, item.text);
        } else {
            appendHumanMessage(main, item.text);
        }
    }
    decorateCodeBlocks();
}

function buildLegacyRenderItems(messages) {
    const items = [];
    for (let i = 0; i < messages.length; i += 1) {
        items.push({
            role: i % 2 === 0 ? "user" : "assistant",
            text: messages[i]
        });
    }
    return items;
}

function buildNavigatorRenderItems(snapshot) {
    const promptCatalog = snapshot && snapshot.promptCatalog && typeof snapshot.promptCatalog === "object"
        ? snapshot.promptCatalog
        : {};
    const promptOrder = Array.isArray(snapshot && snapshot.promptOrder) && snapshot.promptOrder.length
        ? snapshot.promptOrder
        : Object.keys(promptCatalog);
    const items = [];

    promptOrder.forEach((promptId) => {
        const prompt = promptCatalog[promptId];
        if (!prompt) {
            return;
        }

        const userText = normalizeText(prompt.text || "");
        const assistantText = normalizeText(prompt.assistantText || "");

        if (userText) {
            items.push({ role: "user", text: userText });
        }
        if (assistantText) {
            items.push({ role: "assistant", text: assistantText });
        }
    });

    if (!items.length) {
        const summaries = snapshot && snapshot.aiSegmentSummaries && typeof snapshot.aiSegmentSummaries === "object"
            ? Object.values(snapshot.aiSegmentSummaries)
            : [];
        summaries.forEach((record) => {
            const summary = normalizeText(record && (record.summary || record.title) || "");
            if (summary) {
                items.push({ role: "assistant", text: summary });
            }
        });
    }

    return items;
}

function buildNavigatorThread(conversationId, snapshot) {
    const updatedAtMs = Number(snapshot && snapshot.updatedAt) || Date.now();
    const items = buildNavigatorRenderItems(snapshot || {});
    const firstMessage = items.length ? normalizeText(items[0].text) : "";
    const fallbackTitle = firstMessage || normalizeText(snapshot && snapshot.pageTitle) || "未命名会话";

    return {
        id: `${NAV_THREAD_PREFIX}${conversationId}`,
        conversationId: conversationId,
        title: fallbackTitle.slice(0, 72),
        provider: snapshot && snapshot.provider ? snapshot.provider : "",
        pageUrl: snapshot && snapshot.pageUrl ? snapshot.pageUrl : "",
        snapshot: snapshot,
        source_type: "navigator",
        date: formatDate(updatedAtMs),
        time: formatTime(updatedAtMs),
        create_time: Math.floor(updatedAtMs / 1000),
        renderItems: items
    };
}

async function loadLegacyThread(threadId) {
    const result = await storageGet({ threads: [] });
    return getObjectById(threadId, result.threads);
}

async function loadNavigatorThread(conversationId) {
    const storageKey = `${NAV_STORAGE_PREFIX}${conversationId}`;
    const result = await storageGet({ [storageKey]: null });
    const snapshot = result[storageKey];
    if (!snapshot) {
        return null;
    }
    return buildNavigatorThread(conversationId, snapshot);
}

async function resolveThread() {
    if (!threadRef) {
        return null;
    }

    if (threadRef.startsWith(NAV_THREAD_PREFIX)) {
        return loadNavigatorThread(threadRef.slice(NAV_THREAD_PREFIX.length));
    }

    const legacy = await loadLegacyThread(threadRef);
    if (legacy) {
        return legacy;
    }

    return loadNavigatorThread(threadRef);
}

async function load_branched_thread() {
    main.innerHTML = "";

    const fake_convo = branch_state.getCurrentData();
    let current_leaf = branch_state;

    if (fake_convo[0] === null || fake_convo[0] === undefined) {
        fake_convo.shift();
    }

    for (let i = 0; i < fake_convo.length; i += 1) {
        const human = i % 2 === 0;
        let current_leaf_index;
        let leaves_length = 0;
        let data_parent_leaf = current_leaf;

        if (current_leaf) {
            leaves_length = current_leaf.getNumberOfLeaves();
            current_leaf_index = current_leaf.getCurrentLeafIndex();
            current_leaf = current_leaf.getCurrentLeaf();
        }

        let temp = human ? h_template.content.cloneNode(true) : b_template.content.cloneNode(true);

        if (leaves_length > 1) {
            const branchSelectorElement = temp.querySelector(".branch");

            const buttonLeft = document.createElement("button");
            buttonLeft.onclick = () => {
                data_parent_leaf.decrementCurrentLeafIndex();
                load_branched_thread();
            };
            buttonLeft.innerHTML = "<i class=\"fa-regular fa-angle-left\"></i>";
            branchSelectorElement.appendChild(buttonLeft);
            if (current_leaf_index <= 0) {
                buttonLeft.disabled = true;
            }

            const branchText = document.createElement("span");
            branchText.classList.add("flex-grow");
            branchText.classList.add("flex-shrink-0");
            branchText.innerHTML = `${current_leaf_index + 1} / ${leaves_length}`;
            branchSelectorElement.appendChild(branchText);

            const buttonRight = document.createElement("button");
            buttonRight.onclick = () => {
                data_parent_leaf.incrementCurrentLeafIndex();
                load_branched_thread();
            };
            buttonRight.innerHTML = "<i class=\"fa-regular fa-angle-right\"></i>";
            branchSelectorElement.appendChild(buttonRight);
            if (current_leaf_index >= leaves_length - 1) {
                buttonRight.disabled = true;
            }
        }

        if (fake_convo[i] === undefined) {
            temp.querySelector(".text").innerHTML = `<div class="blue-info-box">${await translate("no_data")}</div>`;
            main.appendChild(temp);
            continue;
        }

        if (human) {
            temp.querySelector(".text").innerHTML = `<p>${escapeHtml(String(fake_convo[i] || ""))}</p>`;
        } else {
            temp.querySelector(".text").innerHTML = renderAssistantMessage(fake_convo[i]);
        }
        main.appendChild(temp);
    }

    decorateCodeBlocks();
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

function continue_thread() {
    if (!thread) {
        return;
    }

    if (thread.source_type === "navigator") {
        const targetUrl = thread.pageUrl || buildProviderConversationUrl(thread.provider, thread.conversationId);
        if (targetUrl) {
            window.open(targetUrl, "_blank");
        }
        return;
    }

    if (thread.hasOwnProperty("unified_id") && thread.unified_id === true) {
        window.open(`https://chatgpt.com/c/${threadRef}`, "_blank");
        return;
    }

    const c = [];
    for (let i = 0; i < convo.length; i += 1) {
        const user = i % 2 === 0 ? "Me" : "ChatGPT";
        c.push({ [user]: htmlToPlainText(convo[i]) });
    }
    chrome.runtime.sendMessage({ convo: c, type: "b_continue_convo" });
}

async function boot() {
    thread = await resolveThread();

    if (!thread) {
        convo = [];
        renderItems = [];
        updateThreadHeader();
        renderEmptyState("没有找到对应的线索归档。你可以回到历史页重新选择，或先在聊天页生成新的导航归档。");
        return;
    }

    if (thread.source_type === "navigator") {
        convo = [];
        renderItems = Array.isArray(thread.renderItems) ? thread.renderItems : [];
        updateThreadHeader();
        if (!renderItems.length) {
            renderEmptyState("这个归档里还没有可显示的会话内容。");
            return;
        }
        loadThreadMessages(renderItems);
        return;
    }

    convo = Array.isArray(thread.convo) ? thread.convo : [];
    renderItems = buildLegacyRenderItems(convo);
    updateThreadHeader();

    if (!thread.branch_state) {
        loadThreadMessages(renderItems);
        return;
    }

    branch_state = new TreeNode();
    branch_state.fromJSON(thread.branch_state);
    load_branched_thread();
}

document.querySelector("#continue").addEventListener("click", continue_thread);
boot();
