// PtahJs DevTools — DevTools panel
// 通过 chrome.devtools.inspectedWindow.eval 在被检页面上下文里调
// window.__TRI_DEVTOOLS__.getSnapshot() (由 apps/tri-3d-vms/src/stores/
// engine.js 在 dev 或 runtime 开关下挂载),把 Map 快照拉到面板渲染。
//
// 与 Vite 插件方案不同:不依赖 dev server,可在生产部署上直接使用。
// Chrome 和 Firefox 都支持 chrome.devtools.inspectedWindow.eval(回调式)。

const els = {
  status: document.getElementById("status"),
  size: document.getElementById("size"),
  latency: document.getElementById("latency"),
  pageUrl: document.getElementById("page-url"),
  auto: document.getElementById("auto"),
  interval: document.getElementById("interval"),
  refresh: document.getElementById("refresh"),
  filter: document.getElementById("filter"),
  matchCount: document.getElementById("match-count"),
  table: document.querySelector("#table tbody"),
  empty: document.getElementById("empty"),
  detail: document.getElementById("detail"),
  // Entities tab
  entitiesFilter: document.getElementById("entities-filter"),
  entitiesCount: document.getElementById("entities-count"),
  entitiesTable: document.querySelector("#entities-table tbody"),
  entitiesEmpty: document.getElementById("entities-empty"),
  entitiesDetail: document.getElementById("entities-detail"),
  // Systems tab
  systemsTable: document.querySelector("#systems-table tbody"),
  systemsEmpty: document.getElementById("systems-empty"),
  // Scenes tab
  scenesTable: document.querySelector("#scenes-table tbody"),
  scenesEmpty: document.getElementById("scenes-empty"),
  // Renderer tab
  rendererView: document.getElementById("renderer-view"),
  rendererEmpty: document.getElementById("renderer-empty"),
};

// 上下文检测:DevTools 面板里 chrome.devtools.inspectedWindow 存在;
// 普通扩展 tab / popup 里没有,降级为静态诊断页。
const inDevToolsContext =
  typeof chrome !== "undefined" &&
  chrome.devtools &&
  chrome.devtools.inspectedWindow;

if (!inDevToolsContext) {
  // 非面板上下文(比如通过工具栏按钮"在新标签页打开"),给出诊断信息
  document.querySelector(".tabs").style.display = "none";
  document.querySelector("main").innerHTML =
    '<div style="padding:20px;color:#f48771;font-family:Consolas,monospace;">' +
    '<h3 style="margin:0 0 10px;color:#f0c674;">不在 DevTools 面板上下文</h3>' +
    '<p>当前页面是扩展自身页,chrome.devtools.inspectedWindow 不可用。</p>' +
    '<p>要查看 store 数据,请:</p>' +
    '<ol style="padding-left:20px;">' +
    '<li>在应用页面(普通 http(s) 网页,不是 about: 页)按 F12 打开 DevTools</li>' +
    '<li>DevTools 顶部 tab 栏最右侧 » 下拉里找 "PtahJs DevTools"</li>' +
    '<li>如果 Firefox 没显示该 tab,见 popup 的诊断说明</li>' +
    '</ol>' +
    '<p style="margin-top:12px;color:#888;">devtools_page 是否已执行: ' +
    '<span id="dt-status">检测中...</span></p>' +
    '</div>';
  // 顺便把 storage 里的状态显示出来
  try {
    chrome.storage.local.get("tri_devtools_loaded_at", (data) => {
      const el = document.getElementById("dt-status");
      const ts = data.tri_devtools_loaded_at;
      if (el) {
        el.textContent = ts
          ? "✓ 已执行(" + new Date(ts).toLocaleTimeString() + ")"
          : "✗ 未执行(在普通网页按 F12 触发)";
      }
    });
  } catch (e) { }
} else {
  initPanel();
}

function setHTMLSafe(el, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  el.replaceChildren(...parsed.body.childNodes);
}

function setRowsSafe(tbody, rowsHtml) {
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${rowsHtml}</tbody></table>`,
    "text/html"
  );
  const parsed = doc.querySelector("tbody");
  tbody.replaceChildren(...parsed.childNodes);
}

function initPanel() {
  let lastSnapshot = null;
  let lastById = new Map();
  let selectedId = null;
  let timer = null;
  let activeTab = "scenes";
  let lastEcs = null;
  let lastRenderer = null;
  let selectedEntityId = null;

  // ---- 与被测页面通信 -----------------------------------------------------
  // 把 getSnapshot 的调用包在 IIFE + try/catch 里,任何异常都通过结构化
  // 返回值传回面板,避免 isException 路径丢失上下文。
  function makeExpr(method) {
    return (
      "(function(){try{var b=window.__TRI_DEVTOOLS__;if(!b||typeof b." +
      method + " !== 'function')return {__bridge:false};return {__bridge:true,snap:b." +
      method + "()};}catch(e){return {__bridge:true,__error:String(e)};}})()"
    );
  }
  const SNAPSHOT_EXPR = makeExpr("getSnapshot");
  const ECS_EXPR = makeExpr("getEcsSnapshot");
  const RENDERER_EXPR = makeExpr("getRendererSnapshot");

  function takeEval(expr) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      try {
        chrome.devtools.inspectedWindow.eval(expr, (result, isException) => {
          const dt = Math.round(performance.now() - t0);
          if (isException) {
            resolve({ ok: false, error: "eval exception", dt });
            return;
          }
          if (!result) {
            resolve({ ok: false, error: "no result", dt });
            return;
          }
          if (result.__error) {
            resolve({ ok: false, error: result.__error, dt });
            return;
          }
          if (!result.__bridge) {
            resolve({ ok: false, error: "bridge not found", dt });
            return;
          }
          resolve({ ok: true, snap: result.snap, dt });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e), dt: Math.round(performance.now() - t0) });
      }
    });
  }

  // ---- 渲染 --------------------------------------------------------------
  function renderTable(snap, filterText) {
    if (!snap) {
      els.table.innerHTML = "";
      els.empty.style.display = "block";
      els.empty.textContent = "暂无快照。";
      els.matchCount.textContent = "";
      return;
    }
    const entries = snap.entries || [];
    const f = filterText.trim().toLowerCase();
    const filtered = f
      ? entries.filter((e) => {
        if (String(e.id).toLowerCase().includes(f)) return true;
        const json = safeStringify(e.data).toLowerCase();
        return json.includes(f);
      })
      : entries;
    els.matchCount.textContent = f
      ? filtered.length + " / " + entries.length + " 匹配"
      : entries.length + " 项";

    const newIds = new Set(entries.map((e) => e.id));
    const rows = [];
    for (const e of filtered) {
      const prev = lastById.get(e.id);
      const cur = safeStringify(e.data);
      const changed = prev !== cur;
      const cls = prev === undefined ? "added" : changed ? "changed" : "";
      rows.push(
        '<tr data-id="' + escapeHtml(e.id) + '" class="' + cls + '">' +
        '<td class="col-id">' + escapeHtml(e.id) + '</td>' +
        '<td class="col-diff">' + (changed ? "●" : "") + '</td>' +
        '</tr>'
      );
    }
    if (lastSnapshot) {
      for (const id of lastById.keys()) {
        if (!newIds.has(id) && (!f || id.toLowerCase().includes(f))) {
          rows.push(
            '<tr class="removed"><td class="col-id">' + escapeHtml(id) + '</td>' +
            '<td class="col-diff"></td></tr>'
          );
        }
      }
    }
    setRowsSafe(els.table, rows.join(""));
    els.empty.style.display = rows.length ? "none" : "block";
    if (!rows.length) els.empty.textContent = snap.ready ? "无匹配项" : "等待快照...";
    if (selectedId) {
      if (newIds.has(selectedId)) {
        for (const tr of els.table.querySelectorAll("tr[data-id]")) {
          if (tr.dataset.id === selectedId) {
            tr.classList.add("selected");
            break;
          }
        }
      } else {
        selectedId = null;
        renderDetail(null, snap);
      }
    }
    lastById = new Map(entries.map((e) => [e.id, safeStringify(e.data)]));
    lastSnapshot = snap;
  }

  function renderDetail(id, snap) {
    const entry = snap?.entries?.find((e) => e.id === id);
    if (!entry) {
      els.detail.innerHTML = '<div class="detail-empty">点击左侧某行查看完整数据</div>';
      return;
    }
    setHTMLSafe(els.detail, highlightJson(entry.data));
  }

  function highlightJson(value) {
    let json;
    try { json = JSON.stringify(value, null, 2); } catch (e) {
      return '<pre class="json-view json-error">[unserializable: ' + escapeHtml(String(e)) + ']</pre>';
    }
    if (json.length > 100000) json = json.slice(0, 100000) + "\n... [truncated]";

    const tokenRegex = /"(?:[^"\\]|\\.)*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;
    let result = "";
    let lastIndex = 0;
    let m;
    while ((m = tokenRegex.exec(json)) !== null) {
      result += escapeHtml(json.slice(lastIndex, m.index));
      const tok = m[0];
      let cls;
      if (tok.startsWith('"')) {
        cls = /"\s*:\s*$/.test(tok) ? "j-key" : "j-str";
      } else if (tok === "true" || tok === "false") {
        cls = "j-bool";
      } else if (tok === "null") {
        cls = "j-null";
      } else {
        cls = "j-num";
      }
      result += '<span class="' + cls + '">' + escapeHtml(tok) + '</span>';
      lastIndex = m.index + tok.length;
    }
    result += escapeHtml(json.slice(lastIndex));
    return '<pre class="json-view">' + result + '</pre>';
  }

  function safeStringify(v) {
    try { return JSON.stringify(v); } catch { return "[unserializable]"; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- 主循环 -----------------------------------------------------------
  // 按当前 activeTab 只请求该 tab 的 snapshot,避免不必要的 eval 开销。
  async function refresh() {
    if (activeTab === "entities" || activeTab === "systems" || activeTab === "scenes") {
      await refreshEcs();
      return;
    }
    if (activeTab === "renderer") {
      await refreshRenderer();
      return;
    }
    await refreshStore();
  }

  async function refreshStore() {
    const { ok, snap, error, dt } = await takeEval(SNAPSHOT_EXPR);
    els.latency.textContent = dt + " ms";
    if (!ok || !snap) {
      els.status.textContent = "未连接";
      els.status.className = "badge badge--err";
      els.size.textContent = "store size: -";
      els.pageUrl.textContent = "";
      els.table.innerHTML = "";
      els.matchCount.textContent = "";
      els.empty.style.display = "block";
      const msg =
        error === "bridge not found"
          ? "未检测到 window.__TRI_DEVTOOLS__ 桥。请确认:① 正在 dev 构建或已通过 localStorage/URL 参数开启;② 当前被检 tab 是应用页面,不是 chrome:// 或 about: 特权页。"
          : "读取快照失败:" + (error || "未知错误");
      els.empty.textContent = msg;
      return;
    }
    els.status.textContent = snap.ready ? "已连接" : "引擎未就绪";
    els.status.className = "badge badge--" + (snap.ready ? "ok" : "idle");
    els.size.textContent = "store size: " + snap.size;
    chrome.devtools.inspectedWindow.eval("location.href", (url) => {
      if (typeof url === "string") els.pageUrl.textContent = url;
    });
    renderTable(snap, els.filter.value);
    if (selectedId) renderDetail(selectedId, snap);
  }

  async function refreshEcs() {
    const { ok, snap, error, dt } = await takeEval(ECS_EXPR);
    els.latency.textContent = dt + " ms";
    if (!ok || !snap) {
      els.status.textContent = "未连接";
      els.status.className = "badge badge--err";
      els.size.textContent = "ecs: -";
      els.pageUrl.textContent = "";
      const msg =
        error === "bridge not found"
          ? "未检测到 window.__TRI_DEVTOOLS__ 桥。请确认:① 正在 dev 构建或已通过 localStorage/URL 参数开启;② bridge 版本 ≥ 2(ECS 快照需要 @ptahjs/tri 最新版)。"
          : "读取 ECS 快照失败:" + (error || "未知错误");
      if (activeTab === "entities") {
        els.entitiesTable.innerHTML = "";
        els.entitiesCount.textContent = "";
        els.entitiesEmpty.style.display = "block";
        els.entitiesEmpty.textContent = msg;
      } else if (activeTab === "systems") {
        els.systemsTable.innerHTML = "";
        els.systemsEmpty.style.display = "block";
        els.systemsEmpty.textContent = msg;
      } else {
        els.scenesTable.innerHTML = "";
        els.scenesEmpty.style.display = "block";
        els.scenesEmpty.textContent = msg;
      }
      return;
    }
    els.status.textContent = snap.ready ? "已连接" : "引擎未就绪";
    els.status.className = "badge badge--" + (snap.ready ? "ok" : "idle");
    els.size.textContent =
      "entities: " + snap.entities.length + " / systems: " + snap.systems.length +
      (snap.activeScene ? " / scene: " + snap.activeScene : "");
    chrome.devtools.inspectedWindow.eval("location.href", (url) => {
      if (typeof url === "string") els.pageUrl.textContent = url;
    });
    lastEcs = snap;
    if (activeTab === "entities") renderEntitiesTable(snap, els.entitiesFilter.value);
    else if (activeTab === "systems") renderSystemsTable(snap);
    else renderScenesTable(snap);
  }

  async function refreshRenderer() {
    const { ok, snap, error, dt } = await takeEval(RENDERER_EXPR);
    els.latency.textContent = dt + " ms";
    if (!ok || !snap) {
      els.status.textContent = "未连接";
      els.status.className = "badge badge--err";
      els.size.textContent = "renderer: -";
      els.pageUrl.textContent = "";
      els.rendererView.style.display = "none";
      els.rendererEmpty.style.display = "block";
      els.rendererEmpty.textContent =
        error === "bridge not found"
          ? "未检测到 window.__TRI_DEVTOOLS__ 桥。请确认:① 正在 dev 构建或已通过 localStorage/URL 参数开启;② bridge 版本 ≥ 2;③ RendererPlugin 已安装。"
          : "读取 renderer 快照失败:" + (error || "未知错误");
      return;
    }
    els.status.textContent = snap.ready ? "已连接" : "renderer 未就绪";
    els.status.className = "badge badge--" + (snap.ready ? "ok" : "idle");
    els.size.textContent = snap.size
      ? "canvas: " + snap.size.width + "×" + snap.size.height
      : "renderer: -";
    chrome.devtools.inspectedWindow.eval("location.href", (url) => {
      if (typeof url === "string") els.pageUrl.textContent = url;
    });
    lastRenderer = snap;
    if (snap.ready) {
      els.rendererEmpty.style.display = "none";
      els.rendererView.style.display = "block";
      setHTMLSafe(els.rendererView, highlightJson(snap.info));
    } else {
      els.rendererView.style.display = "none";
      els.rendererEmpty.style.display = "block";
      els.rendererEmpty.textContent = "renderer 未就绪(RendererPlugin 未安装或未初始化)";
    }
  }

  // ---- Entities tab 渲染 -----------------------------------------------
  function renderEntitiesTable(snap, filterText) {
    if (!snap) {
      els.entitiesTable.innerHTML = "";
      els.entitiesEmpty.style.display = "block";
      els.entitiesEmpty.textContent = "等待 ECS 快照...";
      els.entitiesCount.textContent = "";
      return;
    }
    const f = filterText.trim().toLowerCase();
    const filtered = f
      ? snap.entities.filter((e) => {
        if (String(e.id).toLowerCase().includes(f)) return true;
        if (e.sceneName && e.sceneName.toLowerCase().includes(f)) return true;
        if (e.components.some((c) => c.type.toLowerCase().includes(f))) return true;
        if (e.matchedSystems.some((s) => s.toLowerCase().includes(f))) return true;
        return false;
      })
      : snap.entities;
    els.entitiesCount.textContent = filtered.length + " / " + snap.entities.length + " 实体";

    const rows = [];
    for (const e of filtered) {
      const compNames = e.components.map((c) => c.type).join(", ");
      const sysNames = e.matchedSystems.join(", ");
      rows.push(
        '<tr data-id="' + escapeHtml(e.id) + '">' +
        '<td class="col-id">' + escapeHtml(e.id) + '</td>' +
        '<td>' + escapeHtml(e.sceneName || "—") + '</td>' +
        '<td class="comma-list">' + escapeHtml(compNames || "—") + '</td>' +
        '<td class="comma-list">' + escapeHtml(sysNames || "—") + '</td>' +
        '</tr>'
      );
    }
    setRowsSafe(els.entitiesTable, rows.join(""));
    els.entitiesEmpty.style.display = rows.length ? "none" : "block";
    els.entitiesEmpty.textContent = rows.length ? "" : (f ? "无匹配项" : "暂无实体");
    if (selectedEntityId) {
      let found = false;
      for (const tr of els.entitiesTable.querySelectorAll("tr[data-id]")) {
        if (tr.dataset.id === selectedEntityId) {
          tr.classList.add("selected");
          found = true;
          break;
        }
      }
      if (!found) {
        selectedEntityId = null;
        renderEntitiesDetail(null, snap);
      } else {
        renderEntitiesDetail(selectedEntityId, snap);
      }
    }
  }

  function renderEntitiesDetail(id, snap) {
    if (!id || !snap) {
      els.entitiesDetail.innerHTML = '<div class="detail-empty">点击左侧某行查看完整组件数据</div>';
      return;
    }
    const entity = snap.entities.find((e) => e.id === id);
    if (!entity) {
      els.entitiesDetail.innerHTML = '<div class="detail-empty">实体已不存在</div>';
      return;
    }
    const parts = [
      '<div style="margin-bottom:8px;color:#f0c674;">Entity: ' + escapeHtml(entity.id) + '</div>'
    ];
    if (entity.sceneName) parts.push('<div style="color:#9cdcfe;">scene: ' + escapeHtml(entity.sceneName) + '</div>');
    if (entity.parentId) parts.push('<div style="color:#9cdcfe;">parent: ' + escapeHtml(entity.parentId) + '</div>');
    if (entity.matchedSystems.length) {
      parts.push('<div style="color:#9bd89b;">systems: ' + escapeHtml(entity.matchedSystems.join(", ")) + '</div>');
    }
    parts.push('<div style="color:#888;margin:8px 0 4px;">components:</div>');
    for (const c of entity.components) {
      parts.push('<div style="color:#f0c674;margin-top:8px;">' + escapeHtml(c.type) + '</div>');
      parts.push(highlightJson(c.data));
    }
    setHTMLSafe(els.entitiesDetail, parts.join(""));
  }

  // ---- Systems tab 渲染 ------------------------------------------------
  function renderSystemsTable(snap) {
    if (!snap) {
      els.systemsTable.innerHTML = "";
      els.systemsEmpty.style.display = "block";
      els.systemsEmpty.textContent = "等待 ECS 快照...";
      return;
    }
    const rows = [];
    for (const s of snap.systems) {
      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td>' + s.matchedCount + '</td>' +
        '<td class="' + (s.hasUpdateScene ? "tag-yes" : "tag-no") + '">' + (s.hasUpdateScene ? "✓" : "—") + '</td>' +
        '<td class="' + (s.hasUpdateEntity ? "tag-yes" : "tag-no") + '">' + (s.hasUpdateEntity ? "✓" : "—") + '</td>' +
        '<td class="comma-list">' + escapeHtml(s.requiredComponents.join(", ") || "—") + '</td>' +
        '</tr>'
      );
    }
    setRowsSafe(els.systemsTable, rows.join(""));
    els.systemsEmpty.style.display = rows.length ? "none" : "block";
    els.systemsEmpty.textContent = rows.length ? "" : "暂无系统";
  }

  // ---- Scenes tab 渲染 ------------------------------------------------
  // 数据来自 getEcsSnapshot().scenes(场景索引 + 实体数)和 activeScene。
  // 不含 SceneManager 完整状态;若场景在 ECS 索引里没实体,这里看不到。
  function renderScenesTable(snap) {
    if (!snap) {
      els.scenesTable.innerHTML = "";
      els.scenesEmpty.style.display = "block";
      els.scenesEmpty.textContent = "等待 ECS 快照...";
      return;
    }
    const rows = [];
    for (const s of snap.scenes) {
      const isActive = s.name === snap.activeScene;
      rows.push(
        '<tr class="' + (isActive ? "scene-active" : "") + '">' +
        '<td>' + escapeHtml(s.name || "(unnamed)") + '</td>' +
        '<td>' + s.entityCount + '</td>' +
        '<td>' + (isActive ? "激活" : "—") + '</td>' +
        '</tr>'
      );
    }
    setRowsSafe(els.scenesTable, rows.join(""));
    els.scenesEmpty.style.display = rows.length ? "none" : "block";
    els.scenesEmpty.textContent = rows.length
      ? ""
      : (snap.activeScene
        ? '无索引场景(激活场景 "' + snap.activeScene + '" 无实体)'
        : "暂无场景(ECS 未索引任何 SceneComponent)");
  }

  function startTimer() {
    stopTimer();
    if (!els.auto.checked) return;
    const ms = parseInt(els.interval.value, 10);
    timer = setInterval(refresh, ms);
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ---- 事件 ------------------------------------------------------------
  els.refresh.addEventListener("click", refresh);
  els.auto.addEventListener("change", startTimer);
  els.interval.addEventListener("change", startTimer);
  els.filter.addEventListener("input", () => {
    if (lastSnapshot) renderTable(lastSnapshot, els.filter.value);
  });
  els.entitiesFilter.addEventListener("input", () => {
    if (lastEcs) renderEntitiesTable(lastEcs, els.entitiesFilter.value);
  });
  els.table.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || tr.classList.contains("removed")) return;
    document.querySelectorAll("#table tr.selected").forEach((r) => r.classList.remove("selected"));
    tr.classList.add("selected");
    selectedId = tr.dataset.id;
    if (lastSnapshot) renderDetail(selectedId, lastSnapshot);
  });
  els.entitiesTable.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    document.querySelectorAll("#entities-table tr.selected").forEach((r) => r.classList.remove("selected"));
    tr.classList.add("selected");
    selectedEntityId = tr.dataset.id;
    if (lastEcs) renderEntitiesDetail(selectedEntityId, lastEcs);
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.tab;
      if (name === activeTab) return;
      activeTab = name;
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("tab--active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("tab-panel--active", p.dataset.panel === name));
      refresh();
    });
  });

  if (chrome.devtools?.network?.onNavigated) {
    chrome.devtools.network.onNavigated.addListener(() => {
      lastSnapshot = null;
      lastById = new Map();
      selectedId = null;
      lastEcs = null;
      selectedEntityId = null;
      lastRenderer = null;
      setTimeout(refresh, 300);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else startTimer();
  });

  refresh().then(startTimer);
}
