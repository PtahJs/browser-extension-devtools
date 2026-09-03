// popup.js — 诊断扩展是否真正加载,devtools_page 是否执行,面板是否创建
const extLoadedEl = document.getElementById("ext-loaded");
const dtLoadedEl = document.getElementById("dt-loaded");
const openBtn = document.getElementById("open-panel");

// 扩展上下文里 chrome 一定存在,到这里就说明扩展加载成功
extLoadedEl.textContent = "✓ 是";
extLoadedEl.className = "ok";

chrome.storage.local.get(
    ["tri_devtools_loaded_at", "tri_panel_status", "tri_panel_error", "tri_panel_status_at"],
    (data) => {
        const ts = data.tri_devtools_loaded_at;
        if (ts) {
            dtLoadedEl.textContent = "✓ 是 (" + new Date(ts).toLocaleTimeString() + ")";
            dtLoadedEl.className = "ok";
        } else {
            dtLoadedEl.textContent = "✗ 否";
            dtLoadedEl.className = "err";
            return;
        }

        // 加一行面板创建状态
        const panelRow = document.createElement("div");
        panelRow.className = "row";
        const status = data.tri_panel_status;
        let statusText = "检测中...";
        let statusCls = "muted";
        if (status === "ok" || status === "ok-no-promise") {
            statusText = "✓ 成功";
            statusCls = "ok";
        } else if (status === "error" || status === "throw") {
            statusText = "✗ 失败: " + (data.tri_panel_error || "未知");
            statusCls = "err";
        } else if (!status) {
            statusText = "✗ 未创建(devtools_page 跑过但 panels.create 没执行)";
            statusCls = "err";
        }
        const label = document.createTextNode("面板创建: ");
        const span = document.createElement("span");
        span.className = statusCls;
        span.textContent = statusText;
        panelRow.appendChild(label);
        panelRow.appendChild(span);
        dtLoadedEl.parentElement.appendChild(panelRow);


    }
);

openBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
});
