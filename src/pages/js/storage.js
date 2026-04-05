const NAV_STORAGE_PREFIX = "cng_nav_v1:";

function downloadBlobAsFile(blob, fileName) {
    const anchor = document.createElement("a");
    const url = window.URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}

function encodeStringAsBlob(string) {
    return new Blob([new TextEncoder().encode(string)], {
        type: "application/json;charset=utf-8"
    });
}

function exportFiles(includeHistory = true, includeSettings = true) {
    chrome.storage.local.get(["threads", "settings"], function (result) {
        const data = {};
        let suffix = "";

        if (includeHistory) {
            data.threads = Array.isArray(result.threads) ? result.threads : [];
            suffix += "-History";
        }

        if (includeSettings) {
            data.settings = result.settings || {};
            suffix += "-Settings";
        }

        const fileName = `GPTgps-Archive${suffix}_${new Date().toISOString()}.json`;
        downloadBlobAsFile(encodeStringAsBlob(JSON.stringify(data)), fileName);
    });
}

function importThreads(data) {
    chrome.storage.local.get({threads: []}, function (result) {
        const existing = Array.isArray(result.threads) ? result.threads : [];
        const incoming = Array.isArray(data.threads) ? data.threads : [];

        for (let i = 0; i < incoming.length; i += 1) {
            const thread = incoming[i];
            if (!thread || typeof thread !== "object") {
                continue;
            }

            if (!thread.id) {
                thread.id = generateUUID();
            }

            if (getObjectById(thread.id, existing) !== null) {
                continue;
            }

            existing.push(thread);
        }

        chrome.storage.local.set({threads: existing});
    });
}

function importSettings(data) {
    if (data && data.settings && typeof data.settings === "object") {
        chrome.storage.local.set({settings: data.settings});
    }
}

function animateButton(node) {
    if (!node) {
        return;
    }
    const original = node.innerHTML;
    node.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    setTimeout(() => {
        node.innerHTML = original;
    }, 900);
}

function importAny() {
    const input = document.getElementById("import-any");
    const file = input && input.files ? input.files[0] : null;
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            let data = JSON.parse(event.target.result);
            if (Array.isArray(data)) {
                data = {threads: data};
            }
            importThreads(data);
            importSettings(data);
            animateButton(document.getElementById("import-label"));
            hydrateStorageStats();
        } catch (error) {
            console.error("Failed to import archive", error);
        }
    };
    reader.readAsText(file);
}

function showDeleteHistory() {
    document.getElementById("confirm-history").classList.remove("d-none");
}

function deleteHistory() {
    chrome.storage.local.set({threads: []}, function () {
        document.getElementById("confirm-history").classList.add("d-none");
        animateButton(document.getElementById("delete-history"));
        hydrateStorageStats();
    });
}

function countBookmarks(threads) {
    return threads.filter((thread) => Boolean(thread && thread.favorite)).length;
}

function countNavSessions(allStorage) {
    return Object.keys(allStorage).filter((key) => key.indexOf(NAV_STORAGE_PREFIX) === 0).length;
}

function setStat(name, value) {
    const node = document.querySelector(`[data-stat="${name}"]`);
    if (node) {
        node.textContent = String(value);
    }
}

function hydrateStorageStats() {
    chrome.storage.local.get(null, function (result) {
        const threads = Array.isArray(result.threads) ? result.threads : [];
        setStat("threads", threads.length);
        setStat("bookmarks", countBookmarks(threads));
        setStat("nav-sessions", countNavSessions(result));
        setStat("settings", result.settings ? "已读取" : "默认");
    });
}

document.getElementById("export-all").addEventListener("click", () => exportFiles(true, true));
document.getElementById("export-history").addEventListener("click", () => exportFiles(true, false));
document.getElementById("export-settings").addEventListener("click", () => exportFiles(false, true));
document.getElementById("import-any").addEventListener("change", importAny);
document.getElementById("delete-history").addEventListener("click", showDeleteHistory);
document.getElementById("confirm-history").addEventListener("click", deleteHistory);

hydrateStorageStats();
