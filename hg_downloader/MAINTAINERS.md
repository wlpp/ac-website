# 黄果短剧下载器 · 维护记录

> 建档：2026-10-27（基于当时代码静态通读，无运行期改动）
> 用途：新会话/新接手时**先读本文件**，再读 `app.py`，即可恢复上下文。
> 一句话定位：抓取 `huangguoai.com` 的短剧元数据，服务端解密图片、代理转发、HLS 分片下载并转封装 MP4，配一个可局域网访问的可视化下载 Web UI。

---

## 一、快速上手

```powershell
# 依赖已装在项目根目录的 .venv（Python 3.13）
& e:/myWork/project/ac-website/.venv/Scripts/python.exe app.py
```

前置条件：

1. **本机代理必须运行在 `http://localhost:7890`**（代码里所有上游请求都走它，硬编码，见 `app.py` L47）。
2. `tools/ffmpeg.exe` 存在（用于 TS→MP4 无损转封装）；缺失时不报错，只是不转封装。
3. 首次启动会自动创建 `E:\download\短剧`。

访问：电脑 `http://127.0.0.1:8765`；局域网手机 `http://<本机局域网IP>:8765`（docstring 里示例为 192.168.2.15，换网络后需自行确认 IP）。

---

## 二、目录与文件职责

```
hg_downloader/                 # 项目根目录（2026-10-27 由 crawler/hg_downloader 迁入）
├── app.py                 # 全部后端（FastAPI + 爬虫 + 下载器 + 转封装），单文件约 771 行
├── 启动下载器.bat          # 一键启动：端口占用检测、打印局域网地址、切换到脚本所在目录后运行 app.py；也可放到桌面运行（自动回退到项目路径）
├── MAINTAINERS.md         # 本文件
├── server.log             # 运行日志（uvicorn + print 输出），最新一次 2026-10-14
├── static/
│   ├── index.html         # 主页：频道/板块切换、列表、搜索、分页
│   ├── detail.html        # 详情页：封面/简介、选集下载、进度、播放弹窗
│   ├── common.js          # 公共：悬浮按钮、下载进度弹窗、按需轮询、图片代理工具
│   ├── common.css         # 公共样式：FAB、弹窗、进度条、移动端适配
│   └── mpegts.js          # 本地引入的 mpegts.js（TS 流网页播放回退方案），约 210KB
├── tools/
│   ├── ffmpeg.exe         # 实际调用，约 100MB
│   └── ffprobe.exe        # 预留，代码中未引用
└── __pycache__/           # 忽略
```

注意：本项目原先位于 `crawler/` 下（整个 `crawler/` 被根 `.gitignore` 第 1 行忽略），所以没有 git 版本历史；移到根目录后 git 会将其视为未跟踪文件。提交时注意 `tools/ffmpeg.exe`、`tools/ffprobe.exe` 各约 100MB，建议把 `tools/` 单独加入 `.gitignore`，避免误提交。

`app.py` 依赖：`fastapi`/`uvicorn`、`aiohttp`、`aiofiles`、`beautifulsoup4`、`pycryptodome`（无 requirements.txt）。

---

## 三、数据流总览

```
huangguoai.com
   │  ① 列表：JSON API（热播）/ SSR 页面（最新更新 & 搜索）
   │  ② 详情：/video/{id}/ 页面内嵌 script#videoInitialData (JSON)
   │  ③ 播放：m3u8 → AES-128 key/iv → ts 分片（图床图片另走 AES 解密）
   ▼
FastAPI (app.py :8765)
   ├─ /api/list /api/search /api/video   → 元数据给前端
   ├─ /api/image                         → 图片代理 + AES 解密
   ├─ /api/download → asyncio.Queue → 单 worker → 16 并发分片 → 顺序写文件
   │                                     → ffmpeg -c copy 转封装为真 MP4
   ├─ /api/progress → 内存状态 + 磁盘文件核对
   └─ /api/stream (Range) / /api/play    → 网页播放 / 本地播放器
   ▼
E:\download\短剧\{清洗后的标题}\第NN集.mp4
```

---

## 四、配置项速查（`app.py` L27–67）

| 变量 | 值 | 影响 / 改时注意 |
|---|---|---|
| `base_url` | `https://huangguoai.com` | 站点换域名只改这里（API/搜索/播放页路径都基于它） |
| `CHANNELS` | `duanju` / `manju` / `mogai` | 前端频道按钮与后端校验共用，增删需同步 `index.html` 的 `mainNav` 与 `pageByChSort` |
| `search_url` | `{base}/search/video/` | 搜索页 SSR |
| `SAVE_DIR` | `E:\download\短剧` | 硬编码绝对路径，换盘/换用户目录改这里 |
| `FFMPEG` | `tools/ffmpeg.exe` | 缺失则跳过转封装 |
| `PORT` | `8765` | 与 docstring、日志、可能的防火墙规则一致 |
| `CONCURRENT_DOWNLOADS` | 16 | 单集内分片并发信号量 |
| `BATCH_SIZE` | 32 | 每批 gather 的分片数；批次间才响应暂停/限速 |
| `SEGMENT_TIMEOUT` | 30s | 单请求超时（元数据/分片/图片共用） |
| `MAX_RETRIES` | 3 | 分片与文本请求重试次数，退避 1s、2s |
| `EP_DELAY` | (3,7) | **声明了但代码中未使用**（死配置），如需每集间限速要在 `_worker` 里显式 sleep |
| `BATCH_DELAY` | (0,0.2) | 每批分片后的随机等待 |
| `PAGE_DELAY` | (1,2.5) | 仅用于 `_ensure_m3u8` 解析完播放页后 |
| `proxy` | `http://localhost:7890` | 所有上游请求（含图片）都走它，无代理即全面失败 |
| `USER_AGENTS` | 6 条 | `rand_headers()` 随机取 |
| `IMG_HOSTS` / `IMG_HOST_RE` | 白名单 + `^pic\.[a-z0-9]+\.cn$` | 图床轮换时若新域名不匹配该正则，`/api/image` 会 400 |
| `IMG_AES_KEY/IV` | 由站点配置的下划线数字串 ASCII 转换 | 站点换 key 后图片全变花屏/502（`decrypt_image` 无 unpad，用 NoPadding） |

---

## 五、上游站点契约（最易碎的部分）

改动/排障时优先确认这些选择器与字段是否仍存在：

| 用途 | 请求 | 解析点 |
|---|---|---|
| 分类热播 | `GET /api/videos/category/ai-{ch}?sort=hot_window&size=21&page=N` | JSON `data.items[]`、`data.pagination` |
| 最新更新 | `GET /ai-{ch}/` 或 `/ai-{ch}/{page}/`（SSR） | `.hg-card-grid[data-channel-panel="latest"]`，`data-panel-total`；总页数 `(total+20)//21` |
| 搜索 | `GET /search/video/{quote(q)}/` | 卡片列表 |
| 卡片字段 | 同上两处共用 `parse_drama_cards` | `.hg-drama-card[data-track-id]`、`data-track-title`、`img[data-src]`、`__score`、`__episode`、`__desc`、`.hg-tag`（会剔除 `.sr-only` 子节点） |
| 详情/播放页 | `GET /video/{id}/`、`/video/{id}/ep-{n}/` | `script#videoInitialData` 的 JSON：`title/description/coverSrc/posterSrc/tags/ep/epPlaySrcs/videoSrc`；集数取 `[data-web-play-ep-grid] a[data-ep-id]` 的最大值 |
| m3u8 | `data.epPlaySrcs[str(ep)]`，回退 `data.videoSrc` | `#EXT-X-KEY URI/IV`、`#EXT-X-MEDIA-SEQUENCE`、非 `#` 行即 ts 地址 |

已知细节：
- `sort=latest` **不能用 JSON API**（排序/集合与网页不一致），所以走 SSR 页面并自行算页数。
- 单集直下时不会先初始化 state，worker 开工时才补；因此刚入队、尚未被取出的单集在进度弹窗里可能短暂不显示。
- m3u8 地址缓存 10 分钟（`m3u8_cache`，`time.time()` 判断），用于规避 `auth_key` 过期；超时后重新抓页面。

---

## 六、后端函数地图（`app.py`）

| 行号 | 函数 | 职责 |
|---|---|---|
| L70 | `decrypt_image` | 图床 AES-128-CBC NoPadding 解密 |
| L76 | `rand_headers` | 随机 UA + Referer |
| L80 | `sanitize_filename` | 去 `\/:*?"<>|`，生成目录/文件名 |
| L89 | `DownloadManager` | 全局单例 `manager`（L467） |
| L107/L122 | `fetch_text` / `fetch_bytes` | 带重试/超时/代理的请求 |
| L138 | `parse_initial_data` | 取 `#videoInitialData` JSON + soup |
| L145 | `get_video_meta` | 标题/简介/封面/tags/总集数 |
| L161 | `resolve_title` | 目录名（内存缓存） |
| L170/L178 | `init_state` / `ep_state` | 初始化视频/集状态 |
| L188 | `enqueue` | 入队去重：只认 `queued` 集合 + `downloading` 状态（**不要**加 pending 判断，会死锁） |
| L206 | `set_paused` | 全局暂停开关（`resume_event`） |
| L215 | `_worker` | 单 worker 顺序取任务，异常标记 failed |
| L231 | `_ensure_m3u8` | 按需取播放页、填充整部集地址缓存 |
| L250 | `parse_m3u8` | key/IV/media-sequence/ts 列表 |
| L270 | `decrypt_segment` | AES-CBC + 尽力 unpad（失败按 16 字节截断） |
| L279 | `_download_one` | 单集主流程（见下） |
| L355 | `_is_ts` | 首字节 `0x47` 判定 TS |
| L364 | `ensure_remux` | 无损转封装 + 原子替换，全局锁，失败保留原文件 |
| L397 | `remux_all` | 启动时扫描历史 TS 文件（跳过 10 分钟内修改的活跃文件） |
| L412 | `sync_deleted_files` | 磁盘文件被删 → 清内存记录；整部清空则移除视频记录 |
| L432 | `progress_snapshot` | 汇总进度；对未记录但磁盘存在的集按已完成计 |
| L497 | `parse_drama_cards` | 卡片解析（搜索/最新共用） |
| L522 | `fetch_latest_page` | 最新更新 SSR 抓取 |
| L767 | `__main__` | Windows 下切换 SelectorEventLoopPolicy（子进程相关），`0.0.0.0:8765` 监听 |

### 单集下载流程（`_download_one`）

1. 抓详情 → `init_state` → 计算 `save_dir/title`、`第NN集.mp4`。
2. 文件已存在 → 直接标 `completed` 跳过（不做大小/完整性校验）。
3. `_ensure_m3u8` 取 m3u8 → 拉 m3u8 文本 → 解析 key/iv/分片，补全相对地址。
4. 有 key 先下 key；`seg_total` 写入状态。
5. 按 `BATCH_SIZE` 分批、`Semaphore(16)` 并发下载，`gather` 保证顺序；每个分片按 `IV = base_iv` 或 `media_sequence + index`（16 字节大端）解密，**顺序写入**同一文件并累加 `bytes/seg_done/progress`。
6. 每批结束 `sleep(BATCH_DELAY)`；每批开始前 `await resume_event.wait()`（暂停只在批次边界生效）。
7. 标 `completed` → `ensure_remux`（TS→MP4，`-c copy -movflags +faststart`）。

失败处理：整集失败只在 `_worker` 标 `failed` + 记 error，**不自动重试整集**；前端点失败集可重新入队（但状态要等 worker 开始才变 `downloading`）。

---

## 七、HTTP API 一览

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/` | – | `static/index.html` |
| GET | `/detail/{video_id}` | – | `static/detail.html`（前端再调 `/api/video`） |
| GET | `/library` | – | `static/library.html`（我的剧集页） |
| GET | `/player` | – | `static/player.html`（本地播放器页） |
| GET | `/api/list` | `page`,`sort=hot_window\|latest`,`ch` | 非法值回退 `duanju`/`hot_window` |
| GET | `/api/search` | `q` | 空词返回空列表 |
| GET | `/api/video/{id}` | – | 详情 + 每集本地状态（含磁盘存在性） |
| POST | `/api/download/{id}` | body `{ep}` 或 `{}` | 返回 `{queued, skipped}` |
| GET | `/api/progress` | – | 全量进度快照（含 `paused/queue_len/current/failed`） |
| GET/POST | `/api/pause` | body `{paused}` | 全局暂停 |
| GET | `/api/library` | – | 扫描 `SAVE_DIR`，返回 `{items:[{folder,episodes,count,size,mtime}],count,total_size}` |
| GET | `/api/favorites` | – | 收藏的剧集目录名 `{folders:[...]}`（存 `favorites.json`，PC/手机共用） |
| POST | `/api/favorites` | body `{folder, favorite}` | 收藏/取消收藏，返回最新 `{folders}`；`favorite:false` 用于删除本地目录时同步清收藏 |
| GET | `/api/library/episodes` | `folder` | 卡片展开：反查 `video_id` + 全部集数 + 本机已下载集；目录名非法 400、不存在 404 |
| POST | `/api/library/delete` | body `{folder}` | 删除整部剧本地目录（`shutil.rmtree`）；有下载中/排队任务返回 409 |
| POST | `/api/library/play` | body `{folder, ep}` | 转封装后用系统播放器打开 |
| GET | `/api/library/stream` | `folder`,`ep`,`Range` | 同上，网页流播放 |
| POST | `/api/open-folder` | body `{video_id?}` / `{folder?}` | `os.startfile` 打开根目录、某剧目录或指定剧集目录 |
| POST | `/api/play` | body `{video_id, ep}` | 必要时先转封装，再 `os.startfile` 调系统播放器 |
| GET | `/api/stream/{id}/{ep}` | `Range` 头 | 206/416/200；按首字节返回 `video/mp2t` 或 `video/mp4` |
| GET | `/api/image` | `url` | 域名白名单校验 → 代理 → 嗅探文件头 → 解密 → 正确 Content-Type |
| GET | `/favicon.ico` | – | 204 |

> 本地目录名校验统一走 `_safe_save_subdir()`：拒绝 `.`/`..`、`/\:*?"<>|`，并 `resolve()` 后校验仍在 `SAVE_DIR` 下，防路径穿越。

---

## 八、前端结构

### `index.html`
- 频道导航（短剧/漫剧/魔改）与板块（当前热播/最新更新）分离；`pageByChSort[频道][板块]` 分别记住页码。
- 搜索时隐藏板块与分页，展示搜索结果；清空搜索框回到列表。
- 卡片点击 `window.open('/detail/{id}', '_blank')`；图片走 `HgCommon.imgProxy`，失败重试一次后降透明度占位。
- 所有内容用字符串拼接 `innerHTML`（无转义，标题来自上游站点）。

### `detail.html`
- `videoId` 从 `location.pathname.split('/')[2]` 取。
- 渲染封面/标题/集数/tags/简介 + 集按钮网格；`ep-fill` 宽度表示进度。
- 点击已下载集：`isMobile` 判断用户代理 —— 电脑调 `/api/play`，手机开内嵌 `<video>` 播放 `/api/stream`；若视频报错且支持 MSE，回退 `mpegts.js`（iOS 不支持 MSE，只能依赖服务端已转封装）。
- `HgCommon.onProgress` 合并服务端进度：无记录但本地显示 completed 的集会重置为 idle（文件被删）。
- "下载全部"提交后立即把 idle/failed 标 pending，交给轮询接管。

### `common.js`
- 注入悬浮按钮（剧集列表 / 本地播放器 / 下载进度）与下载进度弹窗，并追加 `common.css` 引用。
- 剧集列表/播放器为独立页面：`fabLibrary` → `/library`、`fabPlayer` → `/player`（各自页面自身隐藏对应按钮）。
- **按需轮询**：`tick()` 每 1.5s 拉 `/api/progress`；条件为弹窗打开 **或** 存在 `current` / `queue_len>0`；否则 `polling=false` 停止（空闲不再打扰后端）。请求异常时 3s 后重试且不会停。
- 角标计数 = 有活动任务或有失败集数的视频数。
- 暂停按钮与后端同步；弹窗内展示每部剧的封面、总体进度、当前集分片进度、集状态 chips。
- 对外导出：`imgProxy / imgError / fmtSize / ensurePolling / openLibFolder / onProgress`。
- 下载完成提示：`tick()` 内对比上一轮快照 `lastProg`，新变为 `completed` 的集弹 toast（`《剧名》第N集下载完成`，整部完成则 `.hg-toasts` 提示"全部下载完成"）；首轮只建基线，避免把历史已完成误报为新完成。

### `library.html`（我的剧集，`/library`）
- 两个可折叠分区：「已下载剧集」和「收藏剧集」，点分区标题（`.sect-head`）折叠/展开，折叠状态存 `localStorage["hg_lib_sects"]`（`{sectDl:false,...}`，`false` 表示折叠），刷新后保持。
- 卡片网格（`align-items: start`，卡片按内容自适应高度，展开不影响同排其他卡片）。
- 卡片显示标题 + 集数/大小/时间；右上角 ☆/★ 收藏（`POST /api/favorites`，收藏后星标点亮并出现在收藏分区）、📁 打开该剧目录、🗑 删除整部剧本地目录（`confirm` 后调 `/api/library/delete`，同时移出收藏）。
- 收藏存在后端 `favorites.json`（`APP_DIR` 下），因此电脑和手机看到同一份收藏；收藏只记录目录名，渲染时与 `/api/library` 结果取交集（本地已删的剧不会出现在收藏区）。
- 两个分区**互斥**：已收藏的剧不再出现在「已下载剧集」里（`renderDownloaded` 过滤 `state.favs`），取消收藏后回到已下载分区；全部被收藏时已下载区显示提示。`syncFavUI()` 在收藏/取消后同时重建两个分区。
- 点击卡片展开：先展示已下载集（绿色），同时请求 `/api/library/episodes` 补齐全量集数 —— 已下载亮起、未下载置灰；点击置灰集调 `/api/download/{vid}` 加入队列，状态文字由 `onProgress` 轮询更新（排队 → 百分比 → 完成/失败）。
- 点击**已下载**的绿色集数：跳转 `/player?folder=<剧名>&ep=<集数>` 直接播放；置灰/失败的集仍是加入下载（行为不变）。
- 「前往详情页」使用展开时拿到的 `video_id` 跳 `/detail/{id}`（电脑新标签，手机当前页）。
- 加载失败时提示可点击重试。

### `player.html`（本地播放器，`/player`）
- 桌面：左视频 + 右剧集列表（`grid-template-columns: minmax(0,1fr) 320px`）。
- **移动端（≤860px）沉浸式播放**：`.playlist` 隐藏（已下载剧集只在 PC 显示），视频占满剩余高度；底部不再有控制条，「剧集」按钮（`#btnEps`）与标题同一行（`.stage-bar`，右侧对齐），底部留 `env(safe-area-inset-bottom)`。窄屏占位文案改为"请从「我的剧集」点击已下载的集数进入播放"。
- 移动端播放页**隐藏悬浮按钮组**（`body .fab-group { display:none }`，写在 `player.html` 自身的 `@media` 里，用 `body` 提升优先级压过 `common.js` 后注入的 `common.css`），避免 ⬇/🎞 圆钮遮挡「下一集」和视频原生控件；其它页面不受影响。
- 整页固定高度（`100dvh` + `overflow: hidden`），只有剧集列表内部滚动，不会出现页面滚动条；视频用 `position:absolute; inset:0; object-fit:contain` 填充播放区，等比留黑边，不会溢出/拉伸。
- **直接在视频画面上左右滑动快进/快退**（不使用独立进度条）：`#videoBox` 上监听 `touchstart/touchmove/touchend`，水平位移 > 14px 且大于竖直位移才进入滑动状态；比例按"划过整个宽度 ≈ 整集时长"（`dx / boxWidth * duration`），滑动时中间浮层 `.seek-hint` 显示"快进 N 秒"与目标时间，松手（`touchend`）才真正 `video.currentTime = target`；`touchmove` 为 `{passive:false}` 并 `preventDefault()` 占住手势，避免拖动原生进度条/页面滚动；`touchcancel` 放弃本次调节。
- 「剧集」弹框（移动端）：点标题行右侧 `#btnEps` 打开底部面板 `.eps-mask/.eps-panel`，`#epsGrid` 列出**当前这部剧已下载的全部集数**，当前集高亮 `.cur` 并 `scrollIntoView` 居中；点某一集直接 `play()` 切集并关闭弹框，点遮罩空白处关闭；未选集时按钮禁用。
- 一集播完自动顺延下一集（`ended` → `stepEp(1)`，仅在已下载集范围内）。
- 支持 `GET /player?folder=<剧名>&ep=<集数>` 直接起播（剧集页点已下载集数即走这个入口）。
- 数据直接用 `/api/library`（本地目录扫描），只播放已下载的集；点击剧名展开集数 chips，点击集数播放 `GET /api/library/stream?folder=&ep=`（后端先 `ensure_remux`，MP4 + Range 支持拖动）。
- `<video controls playsinline webkit-playsinline x5-playsinline>`，移动端内联播放不劫持全屏；`waiting` 时状态栏提示"缓冲中"（首次播放可能要等转封装）。

---

## 九、已知问题与风险（按优先级）

**P0（会直接导致功能不可用）**
1. 代理硬编码 `localhost:7890`：代理没开，列表/搜索/下载/图片全部失败（前端只看到"加载失败"）。建议改成读环境变量。
2. 上游 DOM/JSON 契约变更：`#videoInitialData`、`.hg-drama-card`、`.hg-card-grid[data-channel-panel="latest"]` 任一改名即解析失败；报错信息里会直接说"未找到…"。
3. 图床 AES key/IV 写死 & 域名白名单：站点轮换 key/图床会导致图片 502/花屏。更新 `IMG_AES_KEY/IV` 与 `IMG_HOSTS/IMG_HOST_RE`。
4. 内存状态不持久化：重启后 `state` 为空，进度弹窗看不到历史任务（详情页/磁盘文件仍在，靠"文件存在即 completed"兜底）。也意味着**无断点续传队列**：退出时排队/进行中的集会丢失（已写文件仍保留，下次重新入队会跳过已存在文件）。
5. 平台绑定 Windows：`os.startfile`、`WindowsSelectorEventLoopPolicy`、`E:\` 路径。

**P1（体验/稳定性）**
6. `EP_DELAY` 未被使用，实际没有"每集间隔限速"，高频全集下载更易触发风控；如需要应在 `_worker` 的 `_download_one` 前后加 sleep。
7. 每集都重新请求一次 `/video/{id}/`（`get_video_meta`），全集下载时请求量翻倍，建议按 video_id 缓存 meta。
8. 单 worker 串行下集：并发只在单集内部，多部剧同时下载会排队；`queue_len` 只是队列长度。
9. 暂停只在"批次边界"和"开始新集前"生效，当前批次最多 32 个分片会先跑完。
10. 失败集不自动重试，也没有失败原因展示在详情页（仅进度弹窗有 chips、接口返回 error 字段未渲染）。
11. 转封装使用全局锁，播放接口 `/api/stream`、`/api/play` 会等待正在进行的转封装（最长 600s），首次播放历史大文件可能久等。
12. `sync_deleted_files` 被每次 `/api/progress` 调用（1.5s 一次），对每部剧每个 completed 集做磁盘 stat；任务多时轮询开销上升。
13. `get_video_meta`/`resolve_title` 抓取失败会让详情页 502（无本地兜底缓存）。
14. 图片不缓存（`Cache-Control: no-cache` 且每次渲染都请求代理），列表页滚动/刷新会反复打上游；图床 auth_key 过期时旧 URL 会失效，只能刷新页面重新取列表。

**P2（代码质量/噪音）**
15. `@app.on_event("startup")` 已废弃，日志有 DeprecationWarning，可改 lifespan。
16. 前端 `innerHTML` 拼接未做 HTML 转义（上游标题含 `<`/`&` 会破版；本机自用风险低）。
17. `sanitize_filename` 未处理 Windows 保留名（CON/PRN/NUL）与结尾点/空格；不同视频标题清洗后同名会共用一个目录。
18. `/api/download` 单集不校验 ep 范围，越界集会入队但进度快照（只遍历 1..total）看不到。
19. 无鉴权，监听 `0.0.0.0`，同一局域网任何人可操作（含打开本机目录）。
20. `tools/ffprobe.exe` 未被使用；`server.log` 无轮转；Chrome 的 `.well-known/appspecific/com.chrome.devtools.json` 404 属正常噪音。

---

## 十、故障排查表

| 症状 | 优先怀疑 | 处理 |
|---|---|---|
| 列表/搜索"加载失败"、502 | 7890 代理未启动 / 站点改版 | 先开代理，看 `server.log` 的 `请求失败 ...` |
| 图片全灰、`/api/image` 400 | 图床新域名不在白名单 | 补 `IMG_HOSTS` 或调宽正则 |
| 图片 502"解密失败" | AES key/IV 变了 / 返回非图片 | 对比站点前端 `crypto-worker.js` 的配置更新常量 |
| 下载卡在排队 | 全局暂停 / 队列在跑别的集 | 进度弹窗看暂停按钮与"排队下载中"，`log` 有"取出任务" |
| 下载频繁失败 | 代理抖动 / auth_key 过期 / 风控 | 看 error 文本；降并发；重试会重新取 m3u8 |
| 下载完成但无法播放 | 转封装失败 / 无 ffmpeg | 查日志"转封装失败"；确认 `tools/ffmpeg.exe`；`_is_ts` 看首字节 |
| 手机打不开页面 | 防火墙 / IP 变了 / 未监听 0.0.0.0 | 确认局域网 IP、放行 8765 入站 |
| 启动报端口占用 | 已有实例 | `netstat -ano | findstr 8765` 后结束进程，或改 `PORT` |
| 下载记录刷新后消失 | 服务重启（内存态丢失）/ 文件被手动删 | 属当前设计；重新点击下载会自动跳过已存在文件 |

---

## 十一、二次开发指引（需求 → 改哪里）

| 需求 | 改动点 |
|---|---|
| 换保存目录 / 按频道分目录 | `SAVE_DIR`；若要分频道，`_download_one` 与所有拼 `save_dir` 的地方（`sync_deleted_files`、`progress_snapshot`、`api_video`、`api_play`、`api_stream`）需统一封装为一个函数，避免漏改 |
| 代理改为可配置 | L47 改读 `os.environ`，并把 5 处 `proxy=proxy` 收敛为统一 helper |
| 加频道 | `CHANNELS` + `index.html` 的 `mainNav` + `pageByChSort` + 卡片解析无需改（同一套 class） |
| 并发/限速调整 | `CONCURRENT_DOWNLOADS`、`BATCH_SIZE`、`BATCH_DELAY`；真正加集间隔要在 `_worker` 用回 `EP_DELAY` |
| 多 worker 并发下集 | `_worker` 改为启动 N 个协程；注意 `remux_lock`、写文件、`queued` 去重均已按集隔离，可安全并行 |
| 断点续传 / 重启恢复 | 需把 `state` 落盘（如 `state.json`）或在启动时扫描 `SAVE_DIR` 重建；注意与 `sync_deleted_files` 的语义一致 |
| 自动重试失败集 | 在 `_worker` 的 except 里按次数重新 `self.jobs.put_nowait((vid, ep))`，并限制总次数避免风暴 |
| 元数据缓存 | 给 `get_video_meta` 加 `meta_cache[video_id] = (meta, ts)`，TTL 与 `m3u8_cache` 类似 |
| 换语/换 UI | 仅改 `static/*.html` 内联 style 与 `common.css`；交互逻辑在 `common.js` 与页面脚本 |
| 支持非 Windows | 用 `subprocess` 的 `xdg-open`/`open` 替换 `os.startfile`，去掉事件循环策略，路径改 `Path.home()` |
| 加新接口 | 在 `app.py` FastAPI 路由区追加，沿用 `manager.fetch_text` 以获得重试/代理/随机 UA |

调试小技巧：
- 直接 `curl http://127.0.0.1:8765/api/progress` 看内存状态与 `queue_len`。
- 想验证某集 m3u8：在 Python 里 `manager.parse_initial_data` 后打印 `epPlaySrcs`。
- 判断文件是 TS 还是 MP4：读首字节 `0x47` vs `ftyp`（代码已有 `_is_ts`，可直接复用）。

---

## 十二、给后续 AI 会话的接手提示

1. 先读本文件"配置项""已知问题""二次开发指引"三节，再按需读 `app.py` 对应函数（行号已在第六节）。
2. 涉及下载逻辑时**不要**改 `enqueue` 的去重条件（`queued` 集合 + `downloading` 判定），历史注释说明过：用 pending 判定会导致任务永不入队。
3. 改路径相关逻辑时必须同步所有拼 `SAVE_DIR / sanitize_filename(title)` 的位置（共 5 处）。
4. 前端进度依赖 `/api/progress` 的字段：`completed/failed/paused/overall/current/episodes/queue_len`，改后端返回结构要同步 `common.js` 与 `detail.html`。
5. 没有测试、没有 requirements、`crawler/` 未纳入 git；任何"验证"只能靠启动服务 + 浏览器/日志，或直接请求接口。

---

## 十三、变更记录

| 日期 | 类型 | 内容 | 涉及文件 |
|---|---|---|---|
| 2026-10-27 | 建档 | 通读代码生成维护记录；确认当前实现：单 worker、16 并发分片、10 分钟 m3u8 缓存、图片 AES 解密、TS→MP4 转封装、按需轮询、全局暂停；记录 `EP_DELAY` 未使用、代理与保存路径硬编码、状态不持久化等风险 | `MAINTAINERS.md` |
| 2026-10-27 | 迁移 | 整个目录由 `crawler/hg_downloader` 移至项目根目录 `hg_downloader/`。代码用 `APP_DIR = Path(__file__).parent` 定位 static/tools，路径无需改动；启动命令与端口不变 | `MAINTAINERS.md` |
| 2026-10-27 | 修复 | `启动下载器.bat` 的 `cd` 目标由旧路径改为 `%~dp0`（脚本自身目录），解决迁移后"系统找不到指定的路径"、python 在桌面找 `app.py` 的问题；后续再搬目录也不会失效 | `启动下载器.bat`、`MAINTAINERS.md` |
| 2026-10-28 | 增强 | 支持把 bat 放到桌面运行：先在脚本所在目录找 `app.py`，找不到则回退到 `e:\myWork\project\ac-website\hg_downloader`。桌面已放一份副本 `C:\Users\wlpp\Desktop\启动下载器.bat`；**项目再搬家时需同步修改两处副本里的回退路径** | `启动下载器.bat`、`MAINTAINERS.md` |
| 2026-10-28 | 功能 | 新增「我的剧集」独立页面 `/library`（替代原弹框）：卡片展示标题/集数/大小/时间，🗑 删除整部剧本地目录（下载中 409 拒绝），点击卡片展开集数与「前往详情页」。后端新增 `/api/library`、`/api/library/episodes`、`/api/library/delete`、`/api/library/play`、`/api/library/stream`，`/api/open-folder` 支持 `{folder}`；并抽出 `_safe_save_subdir()` 防路径穿越 | `app.py`、`static/library.html`、`static/common.js`、`static/common.css` |
| 2026-10-28 | 调整 | 卡片集数改为全量展示：展开时拉 `/api/library/episodes`（反查 video_id + 总集数 + 已下载集），已下载亮起、未下载置灰、点击置灰加入下载队列并由 `onProgress` 更新排队/百分比/失败状态；移除集数点击播放。网格加 `align-items: start` 修复展开卡片拉伸同排卡片 | `static/library.html`、`static/common.js` |
| 2026-10-28 | 增强 | 下载完成消息提示：轮询时对比上一轮进度快照，新完成的集弹出 toast（单集完成/整部完成两种文案），3.2s 自动消失；首轮只建基线防止误报历史完成 | `static/common.js`、`static/common.css` |
| 2026-10-29 | 修复 | 下载完成不弹提示：`_download_one` 先抓元数据才 `init_state`，发起下载后的首轮快照里看不到任务 → `active=false` 导致轮询停止、再没机会检测完成。`ensurePolling()` 增加 20s 保活窗口（`holdUntil`），等状态建立后由 `active` 接管；三个页面静态资源加 `?v=` 版本号避免旧缓存 | `static/common.js`、`static/*.html` |
| 2026-10-29 | 功能 | 新增本地播放器页 `/player`：右侧/下方列出已下载剧集，点集数用 `<video>` 播放 `/api/library/stream`（Range 拖动、自动下一集、移动端内联播放）；悬浮按钮组新增 ▶（`fabPlayer`）。后端新增 `GET /player` 路由 | `app.py`、`static/player.html`、`static/common.js`、`static/common.css` |
| 2026-10-29 | 优化 | 播放器移动端：新增底部控制条（上一集/下一集 + 时间）、`scrubbing` 防回写；移动端隐藏 `.playlist`（已下载剧集只在 PC 显示）改为沉浸式播放。剧集页 `.ep-chip` 已下载的点击跳 `/player?folder=&ep=`，置灰/失败仍加入下载。移除悬浮按钮 📁（`fabFolder`/`openFolder`/`setVideoContext`）。**同日改为在视频画面上左右滑动快进/快退**（`dx/boxWidth*duration`，滑动时 `.seek-hint` 浮层提示，松手才 seek），去掉独立进度条 `input#seek` | `static/player.html`、`static/library.html`、`static/common.js`、`static/common.css`、`static/detail.html` |
| 2026-10-29 | 修复 | 移动端播放页悬浮按钮（⬇/🎞）压住「下一集」和视频原生控件：在 `player.html` 的 `@media (max-width:860px)` 内用 `body .fab-group { display:none }` 隐藏（`body` 前缀提高优先级，压过 `common.js` 事后注入的 `common.css`）；`.ctl` 底部改用 `calc(10px + env(safe-area-inset-bottom))` 适配 iPhone 底部安全区 | `static/player.html` |
| 2026-10-29 | 调整 | 去掉移动端底部「上一集 / 时间 / 下一集」控制条，改为标题同一行右侧的「剧集」按钮（`#btnEps`）；点击弹出底部面板，列出当前这部剧已下载的全部集数（当前集高亮、自动滚到中间），点一集直接切集并关闭，点遮罩关闭；上一集/下一集逻辑仅保留给 `ended` 自动连播 | `static/player.html` |
| 2026-10-29 | 功能 | 「我的剧集」拆成两个可折叠分区（已下载 / 收藏，折叠状态存 `localStorage`）；卡片新增 ☆/★ 收藏按钮，收藏写入后端 `favorites.json`（`GET/POST /api/favorites`，PC 与手机共用），收藏分区与已下载列表取交集渲染；删除本地目录时同步移出收藏 | `app.py`、`static/library.html` |
