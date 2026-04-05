(function () {
    function hideCover() {
        var cover = document.getElementById("cover");
        if (cover) {
            cover.style.display = "none";
        }
    }

    function initFaqPage() {
        if (window.GPTGPSPageTheme && typeof window.GPTGPSPageTheme.syncPageTheme === "function") {
            window.GPTGPSPageTheme.syncPageTheme().finally(hideCover);
            return;
        }

        hideCover();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFaqPage);
    } else {
        initFaqPage();
    }

    window.addEventListener("error", hideCover);
})();
