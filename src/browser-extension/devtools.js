console.log("[tri-devtools] devtools_page loaded, creating panel...");
// 把"已加载"标记写到 storage,便于从 popup 验证
try {
    chrome.storage.local.set({ tri_devtools_loaded_at: Date.now() });
} catch (e) {
    console.warn("[tri-devtools] storage.set failed:", e);
}

// 创建面板。Firefox 比 Chrome 严格,传 null 图标可能静默失败,所以
// 给一个真实存在的 SVG 图标路径。同时把创建结果写到 storage,popup
// 能直接显示"面板创建成功/失败",不用打开 Browser Toolbox 看 log。
try {
    const result = chrome.devtools.panels.create("Tri", "icon-16.png", "panel.html");

    const handleResult = (p) => {
        console.log("[tri-devtools] panel created:", p);
        chrome.storage.local.set({
            tri_panel_status: "ok",
            tri_panel_status_at: Date.now(),
        });
    };
    const handleError = (err) => {
        console.error("[tri-devtools] panel creation failed:", err);
        chrome.storage.local.set({
            tri_panel_status: "error",
            tri_panel_error: String(err),
            tri_panel_status_at: Date.now(),
        });
    };

    if (result && typeof result.then === "function") {
        // Firefox: 返回 Promise
        result.then(handleResult, handleError);
    } else if (result && typeof result.onShown === "object") {
        // Chrome: 返回 Panel 对象
        handleResult(result);
    } else {
        // 某些 Chrome 版本返回 undefined,但面板其实创建成功了
        console.log("[tri-devtools] panel create returned (no promise):", result);
        chrome.storage.local.set({
            tri_panel_status: "ok-no-promise",
            tri_panel_status_at: Date.now(),
        });
    }
} catch (e) {
    console.error("[tri-devtools] error:", e);
    chrome.storage.local.set({
        tri_panel_status: "throw",
        tri_panel_error: String(e),
        tri_panel_status_at: Date.now(),
    });
}
