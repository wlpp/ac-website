/* 公共组件：悬浮按钮组（剧集列表/播放器/下载进度）、下载进度弹窗、按需轮询 */
const HgCommon = (() => {
  let modalOpen = false;
  let polling = false;
  let holdUntil = 0;     // 保活窗口：刚发起下载时后端还没建好任务状态，先持续轮询一段时间
  let progressCb = null; // 页面注册的进度回调 (prog, active)
  let lastProg = null;   // 上一轮进度快照，用于检测新完成的集并弹出提示

  // ---------- 工具 ----------
  function imgProxy(url) { return "/api/image?url=" + encodeURIComponent(url); }
  // 图片加载失败时重试一次，仍失败则降低透明度占位
  function imgError(img) {
    if (!img.dataset.retried) {
      img.dataset.retried = "1";
      img.src = img.src + "&r=" + Date.now();
    } else {
      img.style.opacity = "0.15";
      img.onerror = null;
    }
  }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.round(b / 1024) + "KB"; }

  // ---------- 注入悬浮按钮与下载进度弹窗 ----------
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="fab-group">
      <button class="fab fab-library" id="fabLibrary" title="剧集列表（已下载）">🎞</button>
      <button class="fab fab-player" id="fabPlayer" title="本地播放器">▶</button>
      <button class="fab fab-download" id="fabDownload" title="下载进度">⬇<span class="badge" id="fabBadge"></span></button>
    </div>
    <div class="modal-mask" id="modalMask">
      <div class="modal">
        <div class="modal-head"><h3>下载进度</h3><button class="modal-pause" id="modalPause" title="暂停下载">⏸</button><button class="modal-close" id="modalClose">✕</button></div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.insertAdjacentHTML("beforeend",
    `<link rel="stylesheet" href="/static/common.css?v=20261029">`);

  // ---------- 消息提示（下载完成） ----------
  const toastBox = document.createElement("div");
  toastBox.className = "hg-toasts";
  document.body.appendChild(toastBox);

  function toast(text) {
    const el = document.createElement("div");
    el.className = "hg-toast";
    el.textContent = text;
    toastBox.appendChild(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  const fabBadge = document.getElementById("fabBadge");
  const mask = document.getElementById("modalMask");
  const pauseBtn = document.getElementById("modalPause");
  let pausedState = false; // 全局暂停状态（与后端同步）

  function setPauseBtn(p) {
    pausedState = p;
    pauseBtn.textContent = p ? "▶" : "⏸";
    pauseBtn.title = p ? "恢复下载" : "暂停下载";
    pauseBtn.classList.toggle("paused", p);
  }

  pauseBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/pause", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !pausedState })
      });
      setPauseBtn((await res.json()).paused);
    } catch (e) { alert("操作失败: " + e.message); }
  });

  async function openModal() {
    modalOpen = true;
    mask.classList.add("show");
    ensurePolling();
    try { setPauseBtn((await (await fetch("/api/pause")).json()).paused); } catch (e) {}
  }
  function closeModal() {
    modalOpen = false;
    mask.classList.remove("show");
  }
  mask.addEventListener("click", e => { if (e.target === mask) closeModal(); });
  document.getElementById("modalClose").addEventListener("click", closeModal);

  document.getElementById("fabDownload").addEventListener("click", openModal);

  // ---------- 本地剧集（剧集列表页使用） ----------
  // 在资源管理器中打开某一部剧的本地目录
  async function openLibFolder(folder) {
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder })
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || "打开失败"); }
    } catch (e) { alert("打开本地目录失败: " + e.message); }
  }

  // 剧集列表/播放器为独立页面：按钮直接跳转（各自页面自身不再显示对应按钮）
  const path = location.pathname.replace(/\/+$/, "");
  const fabLibrary = document.getElementById("fabLibrary");
  if (path === "/library") {
    fabLibrary.style.display = "none";
  } else {
    fabLibrary.addEventListener("click", () => { location.href = "/library"; });
  }
  const fabPlayer = document.getElementById("fabPlayer");
  if (path === "/player") {
    fabPlayer.style.display = "none";
  } else {
    fabPlayer.addEventListener("click", () => { location.href = "/player"; });
  }

  // ---------- 渲染 ----------
  function epChip(ep, cls, text) {
    return '<span class="chip ' + cls + '">第' + ep + '集' + (text ? " " + text : "") + '</span>';
  }

  function renderModal(prog) {
    const body = document.getElementById("modalBody");
    const vids = Object.entries(prog);
    if (!vids.length) {
      body.innerHTML = '<div class="modal-empty">暂无下载任务<br><br>到详情页点击集数或"下载全部"开始下载</div>';
      return;
    }
    setPauseBtn(!!vids[0][1].paused);  // 与后端同步暂停按钮状态
    body.innerHTML = vids.map(([vid, p]) => {
      const done = p.overall >= 100;
      let cur = "";
      if (done && !p.failed.length) {
        cur = '<div class="task-cur" style="color:#6ee7a0">✓ 全部下载完成</div>';
      } else if (p.paused) {
        cur = p.current
          ? '<div class="task-cur paused">⏸ 已暂停 · 第' + p.current.ep + '集 ' + Math.round(p.current.progress) + '%</div>'
          : '<div class="task-cur paused">⏸ 已暂停（恢复后继续排队下载）</div>';
      } else if (p.current) {
        cur = '<div class="task-cur">正在下载 第' + p.current.ep + '集 <span class="pct">' +
              Math.round(p.current.progress) + '%</span>（分片 ' + p.current.seg_done + '/' + p.current.seg_total +
              '，' + fmtSize(p.current.bytes) + '）</div>';
      } else if (!done && p.queue_len > 0) {
        cur = '<div class="task-cur">排队下载中...</div>';
      }
      const chips = [];
      Object.keys(p.episodes).map(Number).sort((a, b) => a - b).forEach(ep => {
        const e = p.episodes[ep];
        if (e.status === "completed") chips.push(epChip(ep, "done", "✓"));
        else if (e.status === "failed") chips.push(epChip(ep, "fail", "失败"));
        else if (e.status === "downloading") chips.push(epChip(ep, "wait", Math.round(e.progress) + "%"));
        else if (e.status === "pending") chips.push(epChip(ep, "wait", "排队"));
      });
      const failTxt = p.failed.length ? ' · <span style="color:#ff7a7a">失败' + p.failed.length + '集</span>' : "";
      return '<div class="task' + (done ? " task-done" : "") + '">' +
        '<div class="task-cover" onclick="window.open(\'/detail/' + vid + '\', \'_blank\')">' +
          (p.cover ? '<img src="' + imgProxy(p.cover) + '" onerror="HgCommon.imgError(this)">' : "") + '</div>' +
        '<div class="task-info">' +
          '<div class="task-title" onclick="window.open(\'/detail/' + vid + '\', \'_blank\')">' + p.title + '</div>' +
          '<div class="task-bar"><div style="width:' + p.overall + '%"></div></div>' +
          '<div class="task-row"><span>已完成 ' + p.completed + ' / ' + p.total_eps + ' 集' + failTxt + '</span>' +
            '<span>' + Math.round(p.overall) + '%</span></div>' +
          cur +
          (chips.length ? '<div class="ep-chips">' + chips.join("") + '</div>' : "") +
        '</div>' +
      '</div>';
    }).join("");
  }

  // ---------- 按需轮询（有活动任务或弹窗打开时才持续请求） ----------
  // 对比上一轮快照，发现新完成的集就弹出提示（首轮只建立基线，避免把历史已完成误报为新完成）
  function notifyCompleted(prog) {
    if (lastProg) {
      for (const vid in prog) {
        const p = prog[vid], prev = lastProg[vid];
        if (!prev) continue;  // 本轮新出现的视频：其已完成集可能来自历史文件
        const done = Object.keys(p.episodes).filter(ep =>
          p.episodes[ep].status === "completed" &&
          !(prev.episodes[ep] && prev.episodes[ep].status === "completed")
        ).map(Number).sort((a, b) => a - b);
        if (!done.length) continue;
        if (p.overall >= 100) toast("《" + p.title + "》全部下载完成");
        else done.forEach(ep => toast("《" + p.title + "》第" + ep + "集下载完成"));
      }
    }
    lastProg = prog;
  }

  async function tick() {
    let prog;
    try {
      prog = await (await fetch("/api/progress")).json();
    } catch (e) {
      setTimeout(tick, 3000); // 请求异常稍后重试
      return;
    }
    notifyCompleted(prog);
    // 活动任务：有正在下载的集或队列中还有任务（部分下载但空闲的不算）
    const active = Object.values(prog).some(p => !!p.current || p.queue_len > 0);
    // 角标：正在下载/排队 或 存在失败集数的视频数
    const activeCount = Object.values(prog).filter(p =>
      !!p.current || p.queue_len > 0 || p.failed.length).length;
    fabBadge.style.display = activeCount ? "block" : "none";
    fabBadge.textContent = activeCount;

    if (modalOpen) renderModal(prog);
    if (progressCb) progressCb(prog, active);

    if (modalOpen || active || Date.now() < holdUntil) setTimeout(tick, 1500);
    else polling = false;
  }

  function ensurePolling() {
    // 留 20s 保活：服务端要先抓元数据才会建立任务状态，这段时间快照里看不到下载中
    holdUntil = Date.now() + 20000;
    if (!polling) { polling = true; tick(); }
  }

  // 页面加载即探测一次：有活动任务则持续轮询刷新角标，否则停止（避免空闲时一直请求）
  ensurePolling();

  return {
    imgProxy, imgError, fmtSize, ensurePolling, openLibFolder,
    onProgress(cb) { progressCb = cb; },
  };
})();
