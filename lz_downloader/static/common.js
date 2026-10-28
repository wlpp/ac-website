/* 公共组件：悬浮按钮组（下载进度/打开目录）、下载进度弹窗、按需轮询 */
const LzCommon = (() => {
  // 当前页面上下文中的视频id（详情页设置后，打开目录/跳转用）
  let videoContext = null;
  let modalOpen = false;
  let polling = false;
  let progressCb = null; // 页面注册的进度回调 (prog, active)

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

  // ---------- 注入悬浮按钮与弹窗 ----------
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="fab-group">
      <button class="fab fab-folder" id="fabFolder" title="打开本地目录">📁<span class="badge" id="fabFolderBadge"></span></button>
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
    `<link rel="stylesheet" href="/static/common.css">`);

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
  document.getElementById("fabFolder").addEventListener("click", () => openFolder());

  async function openFolder(vid) {
    const id = vid !== undefined ? vid : videoContext;
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { video_id: id } : {})
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "打开失败"); }
    } catch (e) { alert("打开本地目录失败: " + e.message); }
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
          (p.cover ? '<img src="' + imgProxy(p.cover) + '" onerror="LzCommon.imgError(this)">' : "") + '</div>' +
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
  async function tick() {
    let prog;
    try {
      prog = await (await fetch("/api/progress")).json();
    } catch (e) {
      setTimeout(tick, 3000); // 请求异常稍后重试
      return;
    }
    // 活动任务：有正在下载的集或队列中还有任务（部分下载但空闲的不算）
    const active = Object.values(prog).some(p => !!p.current || p.queue_len > 0);
    // 角标：正在下载/排队 或 存在失败集数的视频数
    const activeCount = Object.values(prog).filter(p =>
      !!p.current || p.queue_len > 0 || p.failed.length).length;
    fabBadge.style.display = activeCount ? "block" : "none";
    fabBadge.textContent = activeCount;

    if (modalOpen) renderModal(prog);
    if (progressCb) progressCb(prog, active);

    if (modalOpen || active) setTimeout(tick, 1500);
    else polling = false;
  }

  function ensurePolling() {
    if (!polling) { polling = true; tick(); }
  }

  // 页面加载即探测一次：有活动任务则持续轮询刷新角标，否则停止（避免空闲时一直请求）
  ensurePolling();

  return {
    imgProxy, imgError, fmtSize, openFolder, ensurePolling,
    onProgress(cb) { progressCb = cb; },
    setVideoContext(vid) { videoContext = vid; },
  };
})();
