let resyncInterval;
let signInInterval;

const resyncButt = document.getElementById("resync-icon");

function setResyncStatus(visible, text) {
    const statusWrap = document.getElementById("resync-status");
    const statusText = document.getElementById("resync-status-text");
    if (statusText && text) {
        statusText.textContent = text;
    }
    if (statusWrap) {
        statusWrap.classList.toggle("d-none", !visible);
    }
}

chrome.storage.local.get({v2_history: true}, function (result) {
    if (!result.v2_history) {
        animateResync();
    }
});

async function animateResync() {
    resyncButt.innerHTML = `<i class="fa-solid fa-spin fa-arrows-rotate"></i>&emsp; ${await translate("resyncing")}`;
    resyncButt.classList.add("disabled");
    setResyncStatus(true, "同步中");
    chrome.storage.local.get({offset: 0}, function (result) {
        checkOffsetThenResync(result.offset);
        resyncInterval = setInterval(updateResyncProgress, 4000);
    });
}

async function resetButton() {
    resyncButt.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i>&emsp; ${await translate("resync_all")}`;
    resyncButt.classList.remove("disabled");
    setResyncStatus(false, "已完成");
}

function updateResyncProgress() {
    chrome.storage.local.get({offset: 0}, async function (result) {
        let offset = result.offset;
        document.getElementById("resync-offset").innerHTML = offset;
        document.getElementById("resync-max").innerHTML = max ?? await translate("all_threads");
        setResyncStatus(true, `同步中 · 已处理 ${offset}`);
    });

    chrome.storage.local.get({v2_history: false}, function (result) {
        if (result.v2_history) {
            resetButton();
            clearInterval(resyncInterval);
            chrome.storage.local.set({alreadyResyncing: false});
        }
    });
}

function waitForSignIn() {
    chrome.storage.local.get({signedIn: false}, function (result) {
        if (result.signedIn === true) {
            chrome.storage.local.get({auth: null}, function (authResult) {
                myAuth = authResult.auth;
            });
            animateResync();
            chrome.storage.local.set({awaitingSignIn: false});
            clearInterval(signInInterval);
        }
    });
}

function resyncClick() {
    if (myAuth === undefined) {
        window.open("https://chat.openai.com/auth/login", "_blank");
        chrome.storage.local.set({awaitingSignIn: true});
        setResyncStatus(true, "等待登录");
        signInInterval = setInterval(waitForSignIn, 1000);
    }
    else if (!resyncButt.classList.contains("disabled")) {
        chrome.storage.local.set({v2_history: false});
        chrome.storage.local.set({offset: 0});
        animateResync();
    }
}

document.getElementById("resync-icon").addEventListener("click", resyncClick);
