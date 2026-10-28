"""
黄果短剧可视化下载工具
- 主页: 热播列表 + 搜索 + 一键下载 + 下载进度
- 详情页: 标题/封面/简介/选集下载
启动: & e:/myWork/project/ac-website/.venv/Scripts/python.exe app.py
访问: 电脑 http://127.0.0.1:8765 · 手机（同一局域网）http://192.168.2.15:8765
"""
import asyncio
import json
import os
import random
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import aiofiles
import aiohttp
from bs4 import BeautifulSoup
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

# ========== 基础配置 ==========
base_url = "https://huangguoai.com"
CHANNELS = ("duanju", "manju", "mogai")  # 频道：短剧/漫剧/魔改，数据源为 /api/videos/category/ai-{ch} 与 /ai-{ch}/
search_url = f"{base_url}/search/video/"

APP_DIR = Path(__file__).parent
SAVE_DIR = Path(r"E:\download\短剧")  # 保存根目录（按标题建目录）
FFMPEG = APP_DIR / "tools" / "ffmpeg.exe"  # 项目自带便携ffmpeg：把HLS拼接TS流无损转封装为真MP4（手机浏览器/默认播放器才能播）
PORT = 8765

CONCURRENT_DOWNLOADS = 16  # 分片并发数
BATCH_SIZE = 32            # 每批下载数
SEGMENT_TIMEOUT = 30       # 单分片超时（秒）
MAX_RETRIES = 3            # 重试次数

# 防爬配置
EP_DELAY = (3, 7)          # 每集下载完后的随机等待区间（秒）
BATCH_DELAY = (0.0, 0.2)   # 每批分片间的随机等待区间（秒）
PAGE_DELAY = (1.0, 2.5)    # 页面请求间的随机等待区间（秒）

proxy = "http://localhost:7890"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

# 允许代理图片的图床域名（站点会轮换图床：pic.tkzdds.cn → pic.wirqed.cn，按 pic.*.cn 模式匹配兜底）
IMG_HOSTS = {"pic.tkzdds.cn", "pic.wirqed.cn"}
IMG_HOST_RE = re.compile(r"^pic\.[a-z0-9]+\.cn$")

# 图床图片是 AES-128-CBC 加密的（网站前端用 crypto-worker.js 解密后展示）
# key/iv 来自网站配置：下划线分隔的数字串按 ASCII 转字符得到
IMG_AES_KEY = "".join(chr(int(x)) for x in
                      "102_53_100_57_54_53_100_102_55_53_51_51_54_50_55_48".split("_")).encode()
IMG_AES_IV = "".join(chr(int(x)) for x in
                     "57_55_98_54_48_51_57_52_97_98_99_50_102_98_101_49".split("_")).encode()


def decrypt_image(data: bytes) -> bytes:
    """解密图床返回的加密图片（AES-128-CBC NoPadding，明文即图片字节）"""
    cipher = AES.new(IMG_AES_KEY, AES.MODE_CBC, IMG_AES_IV)
    return cipher.decrypt(data)


def rand_headers():
    return {"User-Agent": random.choice(USER_AGENTS), "Referer": f"{base_url}/"}


def sanitize_filename(filename):
    return re.sub(r'[\\/:*?"<>|]', "", filename).strip()


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} - {msg}")


# ========== 下载管理器 ==========
class DownloadManager:
    def __init__(self):
        self.state = {}  # video_id -> {title, cover, total_eps, episodes: {ep: {...}}}
        self.m3u8_cache = {}  # video_id -> {ep: (m3u8_url, ts_time)}，短TTL防auth_key过期
        self.title_cache = {}  # video_id -> 本地目录名（sanitize后的标题），供播放/打开目录用
        self.session = None
        self.jobs = asyncio.Queue()
        self.queued = set()  # (video_id, ep) 去重
        self.paused = False  # 全局暂停开关
        self.resume_event = asyncio.Event()
        self.resume_event.set()  # set=运行中，clear=暂停
        self.remux_lock = asyncio.Lock()  # 转封装互斥（同文件不会并发，全局锁足够）

    async def start(self):
        self.session = aiohttp.ClientSession()
        asyncio.create_task(self._worker())

    # ---------- HTTP 辅助 ----------
    async def fetch_text(self, url, note=""):
        last_err = None
        for retry in range(MAX_RETRIES):
            try:
                async with self.session.get(url, headers=rand_headers(), proxy=proxy, ssl=False,
                                            timeout=aiohttp.ClientTimeout(total=SEGMENT_TIMEOUT)) as resp:
                    if resp.status == 200:
                        return await resp.text()
                    last_err = f"HTTP {resp.status}"
            except Exception as e:
                last_err = str(e)
            if retry < MAX_RETRIES - 1:
                await asyncio.sleep(1 + retry)
        raise Exception(f"请求失败 {url} ({note}): {last_err}")

    async def fetch_bytes(self, url, note=""):
        last_err = None
        for retry in range(MAX_RETRIES):
            try:
                async with self.session.get(url, headers=rand_headers(), proxy=proxy, ssl=False,
                                            timeout=aiohttp.ClientTimeout(total=SEGMENT_TIMEOUT)) as resp:
                    if resp.status == 200:
                        return await resp.read()
                    last_err = f"HTTP {resp.status}"
            except Exception as e:
                last_err = str(e)
            if retry < MAX_RETRIES - 1:
                await asyncio.sleep(1 + retry)
        raise Exception(f"请求失败 {url} ({note}): {last_err}")

    # ---------- 元数据 ----------
    def parse_initial_data(self, html):
        soup = BeautifulSoup(html, "html.parser")
        tag = soup.select_one("script#videoInitialData")
        if not tag or not tag.string:
            raise Exception("页面中未找到 videoInitialData")
        return json.loads(tag.string), soup

    async def get_video_meta(self, video_id):
        """播放页解析标题/简介/封面/总集数"""
        html = await self.fetch_text(f"{base_url}/video/{video_id}/", "视频主页")
        data, soup = self.parse_initial_data(html)
        ep_ids = [int(a["data-ep-id"]) for a in soup.select("[data-web-play-ep-grid] a[data-ep-id]")]
        total_eps = max(ep_ids) if ep_ids else int(data.get("ep") or 1)
        return {
            "id": video_id,
            "title": data.get("title", f"video_{video_id}"),
            "desc": data.get("description", ""),
            "cover": data.get("coverSrc") or data.get("posterSrc") or "",
            "tags": data.get("tags", []),
            "score": None,
            "total_eps": total_eps,
        }

    async def resolve_title(self, video_id):
        """本地目录名（优先缓存，缺失时抓播放页并缓存）"""
        title = self.title_cache.get(video_id)
        if not title:
            meta = await self.get_video_meta(video_id)
            title = sanitize_filename(meta["title"])
            self.title_cache[video_id] = title
        return title

    def init_state(self, meta):
        vid = meta["id"]
        if vid not in self.state:
            self.state[vid] = {
                "title": meta["title"], "cover": meta["cover"],
                "total_eps": meta["total_eps"], "episodes": {},
            }

    def ep_state(self, video_id, ep, create=True):
        eps = self.state.get(video_id, {}).get("episodes")
        if eps is None:
            return None
        if ep not in eps and create:
            eps[ep] = {"status": "pending", "progress": 0, "seg_done": 0,
                       "seg_total": 0, "bytes": 0, "error": ""}
        return eps.get(ep)

    # ---------- 任务队列 ----------
    def enqueue(self, video_id, eps):
        added = []
        for ep in eps:
            key = (video_id, ep)
            # 去重只看队列成员（处理中的任务在finally才移出队列，因此也被覆盖）；
            # 注意不能用 ep_state(create=True) 后的 pending 状态做去重——
            # 那会把刚创建的条目误判为"已排队"导致任务永不入队
            if key in self.queued:
                continue
            st = self.ep_state(video_id, ep, create=False)
            if st and st["status"] == "downloading":
                continue
            self.ep_state(video_id, ep)  # 确保状态条目存在（pending）
            self.queued.add(key)
            self.jobs.put_nowait(key)
            added.append(ep)
        return added

    def set_paused(self, paused):
        """全局暂停/恢复：暂停时当前集在批次间挂起、队列不开始新集；任务仍可入队"""
        self.paused = paused
        if paused:
            self.resume_event.clear()
        else:
            self.resume_event.set()
        log("下载已暂停" if paused else "下载已恢复")

    async def _worker(self):
        while True:
            video_id, ep = await self.jobs.get()
            await self.resume_event.wait()  # 全局暂停时不开始新集
            log(f"取出任务: video={video_id} 第{ep}集（剩余排队 {self.jobs.qsize()}）")
            try:
                await self._download_one(video_id, ep)
            except Exception as e:
                st = self.ep_state(video_id, ep)
                if st:
                    st.update(status="failed", error=str(e))
                log(f"{video_id} 第{ep}集 下载失败: {e}")
            finally:
                self.queued.discard((video_id, ep))
                self.jobs.task_done()

    async def _ensure_m3u8(self, video_id, ep):
        """按需获取m3u8（缓存10分钟，防auth_key过期）"""
        cache = self.m3u8_cache.setdefault(video_id, {})
        hit = cache.get(ep)
        if hit and time.time() - hit[1] < 600:
            return hit[0]
        url = f"{base_url}/video/{video_id}/" if ep == 1 else f"{base_url}/video/{video_id}/ep-{ep}/"
        data, _ = self.parse_initial_data(await self.fetch_text(url, f"第{ep}集页面"))
        m3u8 = None
        for k, v in (data.get("epPlaySrcs") or {}).items():
            cache.setdefault(int(k), (v, time.time()))
        if ep in cache:
            m3u8 = cache[ep][0]
        elif data.get("videoSrc"):
            cache[ep] = (data["videoSrc"], time.time())
            m3u8 = data["videoSrc"]
        await asyncio.sleep(random.uniform(*PAGE_DELAY))
        return m3u8

    @staticmethod
    def parse_m3u8(m3u8_text):
        key_url = iv = None
        media_sequence = 0
        ts_urls = []
        for line in m3u8_text.splitlines():
            line = line.strip()
            if line.startswith("#EXT-X-MEDIA-SEQUENCE:"):
                media_sequence = int(line.split(":", 1)[1])
            elif line.startswith("#EXT-X-KEY:"):
                m = re.search(r'URI="([^"]+)"', line)
                if m:
                    key_url = m.group(1)
                m = re.search(r"IV=0[xX]([0-9a-fA-F]+)", line)
                if m:
                    iv = bytes.fromhex(m.group(1).rjust(32, "0"))
            elif line and not line.startswith("#"):
                ts_urls.append(line)
        return key_url, iv, media_sequence, ts_urls

    @staticmethod
    def decrypt_segment(data, key, iv):
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(data)
        try:
            return unpad(decrypted, AES.block_size)
        except ValueError:
            return decrypted[: len(decrypted) // 16 * 16]

    async def _download_one(self, video_id, ep):
        meta = await self.get_video_meta(video_id)
        self.init_state(meta)
        title = sanitize_filename(meta["title"])
        st = self.ep_state(video_id, ep)
        st.update(status="downloading", progress=0, error="")

        save_dir = SAVE_DIR / title
        save_dir.mkdir(parents=True, exist_ok=True)
        file_path = save_dir / f"第{ep:02d}集.mp4"
        st["file"] = str(file_path)

        if file_path.exists():
            st.update(status="completed", progress=100)
            log(f"{title} 第{ep:02d}集 文件已存在，跳过")
            return

        m3u8_url = await self._ensure_m3u8(video_id, ep)
        if not m3u8_url:
            raise Exception("未能获取到该集的 m3u8 地址")

        m3u8_text = await self.fetch_text(m3u8_url, "m3u8")
        key_url, base_iv, media_sequence, ts_urls = self.parse_m3u8(m3u8_text)
        if not ts_urls:
            raise Exception("未找到任何ts文件链接")
        if not ts_urls[0].startswith("http"):
            base = "/".join(m3u8_url.split("/")[:-1]) + "/"
            ts_urls = [base + u for u in ts_urls]

        key = b""
        if key_url:
            key = await self.fetch_bytes(key_url, "key")

        total = len(ts_urls)
        st["seg_total"] = total
        log(f"{title} 第{ep:02d}集 开始下载，共{total}个分片")
        semaphore = asyncio.Semaphore(CONCURRENT_DOWNLOADS)

        async def fetch_segment(index, url):
            last_err = None
            for retry in range(MAX_RETRIES):
                try:
                    async with semaphore:
                        async with self.session.get(url, headers=rand_headers(), proxy=proxy, ssl=False,
                                                    timeout=aiohttp.ClientTimeout(total=SEGMENT_TIMEOUT)) as resp:
                            if resp.status == 200:
                                return await resp.read()
                            last_err = f"HTTP {resp.status}"
                except Exception as e:
                    last_err = str(e)
                if retry < MAX_RETRIES - 1:
                    await asyncio.sleep(1 + retry)
            raise Exception(f"分片{index}下载失败: {last_err}")

        async with aiofiles.open(file_path, "wb") as f:
            for i in range(0, total, BATCH_SIZE):
                await self.resume_event.wait()  # 批次间响应全局暂停（当前批收尾后挂起）
                batch = ts_urls[i:i + BATCH_SIZE]
                # gather按传入顺序返回结果，保证分片顺序
                results = await asyncio.gather(*(fetch_segment(i + j, u) for j, u in enumerate(batch)))
                for j, raw in enumerate(results):
                    iv = base_iv if base_iv is not None else (media_sequence + i + j).to_bytes(16, "big")
                    if key:
                        raw = self.decrypt_segment(raw, key, iv)
                    await f.write(raw)
                    st["bytes"] += len(raw)
                    st["seg_done"] += 1
                    st["progress"] = round(st["seg_done"] / total * 100, 1)
                await asyncio.sleep(random.uniform(*BATCH_DELAY))

        st.update(status="completed", progress=100)
        size_mb = st["bytes"] / 1024 / 1024
        log(f"{title} 第{ep:02d}集 下载完成 ({size_mb:.1f}MB)")
        await self.ensure_remux(file_path)  # TS→MP4 无损转封装，手机浏览器/默认播放器可播

    # ---------- 转封装 ----------
    @staticmethod
    def _is_ts(file_path):
        """文件是否为HLS拼接的MPEG-TS流（首字节0x47同步字节），真MP4为ftyp盒子"""
        try:
            with open(file_path, "rb") as f:
                return f.read(1) == b"\x47"
        except OSError:
            return False

    async def ensure_remux(self, file_path):
        """TS拼接流 → 真MP4：无损转封装（-c copy不重编码，秒级完成）。
        拼接的TS不是合法MP4，手机浏览器和多数默认播放器无法解码；转封装后原生可播。
        ffmpeg缺失或转封装失败时保留原文件（不影响既有功能）。"""
        if not FFMPEG.exists() or not self._is_ts(file_path):
            return
        async with self.remux_lock:
            if not self._is_ts(file_path):  # 双检：等待锁期间可能已被转封装
                return
            tmp = file_path.with_name(file_path.stem + ".remux.mp4")
            log(f"转封装为MP4: {file_path.parent.name} {file_path.name}")
            try:
                proc = await asyncio.create_subprocess_exec(
                    str(FFMPEG), "-y", "-i", str(file_path), "-c", "copy",
                    "-movflags", "+faststart", str(tmp),
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                try:
                    await asyncio.wait_for(proc.wait(), timeout=600)
                except asyncio.TimeoutError:
                    proc.kill()
                    raise Exception("ffmpeg 超时")
                if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
                    raise Exception(f"ffmpeg 退出码 {proc.returncode}")
                os.replace(tmp, file_path)  # 原子替换
                log(f"转封装完成: {file_path.name}")
            except Exception as e:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass
                log(f"转封装失败（保留原TS文件）: {e}")

    async def remux_all(self):
        """启动后台扫描：历史下载的TS拼接文件全部转封装（跳过10分钟内的活跃下载文件）"""
        if not FFMPEG.exists():
            return
        for video_dir in SAVE_DIR.iterdir():
            if not video_dir.is_dir():
                continue
            for fp in video_dir.glob("第*.mp4"):
                if time.time() - fp.stat().st_mtime < 600:
                    continue  # 可能正在下载
                if self._is_ts(fp):
                    await self.ensure_remux(fp)
        log("历史文件转封装检查完成")

    # ---------- 磁盘状态同步 ----------
    def sync_deleted_files(self, video_id=None):
        """本地文件被手动删除后，清除内存中对应的下载记录（页面刷新后记录同步消失）"""
        vids = [video_id] if video_id is not None else list(self.state.keys())
        for vid in vids:
            s = self.state.get(vid)
            if not s:
                continue
            save_dir = SAVE_DIR / sanitize_filename(s["title"])
            eps = s["episodes"]
            for ep in [e for e, st in eps.items() if st["status"] == "completed"]:
                if not (save_dir / f"第{ep:02d}集.mp4").exists():
                    del eps[ep]
                    log(f"{s['title']} 第{ep:02d}集 本地文件已删除，清除下载记录")
            # 集数记录已全部清空（如删除了整个文件夹）且无排队任务时，移除整部视频的记录
            # （eps为空即意味着没有pending/downloading条目，排队中的任务必会创建条目）
            if vid in self.state and not eps:
                del self.state[vid]
                log(f"{s['title']} 本地文件已全部删除，清除整部视频下载记录")

    # ---------- 进度快照 ----------
    def progress_snapshot(self):
        self.sync_deleted_files()
        out = {}
        for vid, s in self.state.items():
            eps = s["episodes"]
            total = s["total_eps"]
            save_dir = SAVE_DIR / sanitize_filename(s["title"])
            done = 0
            ep_map = {}
            for ep in range(1, total + 1):
                st = eps.get(ep)
                if st:
                    if st["status"] == "completed":
                        done += 1
                    ep_map[str(ep)] = st
                elif (save_dir / f"第{ep:02d}集.mp4").exists():
                    # 本会话之前已下载的集数（文件在磁盘上）：按已完成计
                    done += 1
                    ep_map[str(ep)] = {"status": "completed", "progress": 100,
                                       "seg_done": 0, "seg_total": 0, "bytes": 0,
                                       "error": "", "file": str(save_dir / f"第{ep:02d}集.mp4")}
            failed = [int(ep) for ep, e in ep_map.items() if e["status"] == "failed"]
            cur = next(({"ep": int(ep), **e} for ep, e in sorted(ep_map.items())
                        if e["status"] == "downloading"), None)
            out[str(vid)] = {
                "title": s["title"], "cover": s["cover"], "total_eps": total,
                "completed": done, "failed": failed, "paused": self.paused,
                "overall": round(done / total * 100, 1) if total else 0,
                "current": cur,
                "episodes": ep_map,
                "queue_len": self.jobs.qsize(),
            }
        return out


manager = DownloadManager()

# ========== FastAPI ==========
app = FastAPI(title="黄果短剧下载器")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")


@app.on_event("startup")
async def startup():
    SAVE_DIR.mkdir(parents=True, exist_ok=True)
    await manager.start()
    asyncio.create_task(manager.remux_all())  # 后台把历史TS拼接文件转封装为MP4


@app.get("/")
async def index():
    return FileResponse(APP_DIR / "static" / "index.html")


@app.get("/favicon.ico")
async def favicon():
    """浏览器自动请求，返回204避免控制台404报错"""
    return Response(status_code=204)


@app.get("/detail/{video_id}")
async def detail_page(video_id: int):
    return FileResponse(APP_DIR / "static" / "detail.html")


@app.get("/library")
async def library_page():
    return FileResponse(APP_DIR / "static" / "library.html")


@app.get("/player")
async def player_page():
    return FileResponse(APP_DIR / "static" / "player.html")


def parse_drama_cards(scope):
    """解析 .hg-drama-card 卡片列表（搜索页/频道页latest面板共用）"""
    items = []
    for card in scope.select(".hg-drama-card[data-track-id]"):
        img = card.select_one("img[data-src]")
        score = card.select_one(".hg-drama-card__score")
        ep_text = card.select_one(".hg-drama-card__episode")
        desc = card.select_one(".hg-drama-card__desc")
        tags = []
        for t in card.select(".hg-tag"):
            for sr in t.select(".sr-only"):
                sr.extract()  # 剔除无障碍冗余文本（如"题材短剧 · 《xx》"）
            tags.append(t.get_text(strip=True))
        items.append({
            "id": int(card["data-track-id"]),
            "title": (card.get("data-track-title") or "").strip(),
            "cover": img["data-src"] if img else "",
            "score": score.get_text(strip=True).replace("分", "") if score else None,
            "episode_text": ep_text.get_text(strip=True) if ep_text else "",
            "description": desc.get_text(" ", strip=True) if desc else "",
            "tags": tags,
        })
    return items


async def fetch_latest_page(page: int, ch: str = "duanju"):
    """最新更新板块：抓频道页SSR（latest面板由服务端渲染、翻页为/ai-{ch}/{page}/路径，
    JSON API的sort=latest与其排序/集合不一致，无法复现网页效果）"""
    url = f"{base_url}/ai-{ch}/" if page <= 1 else f"{base_url}/ai-{ch}/{page}/"
    html = await manager.fetch_text(url, "最新更新页面")
    soup = BeautifulSoup(html, "html.parser")
    grid = soup.select_one('.hg-card-grid[data-channel-panel="latest"]')
    if grid is None:
        raise Exception("页面中未找到最新更新面板")
    total = int(grid.get("data-panel-total") or 0)
    pages = (total + 20) // 21 if total else 0
    return {"items": parse_drama_cards(grid), "pagination": {"page": page, "pages": pages}}


@app.get("/api/list")
async def api_list(page: int = 1, sort: str = "hot_window", ch: str = "duanju"):
    """分类列表（ch: duanju=短剧 manju=漫剧 mogai=魔改; sort: hot_window=热播, latest=最新更新-抓频道页SSR）"""
    if ch not in CHANNELS:
        ch = "duanju"
    if sort not in ("hot_window", "latest"):
        sort = "hot_window"
    if sort == "latest":
        try:
            return await fetch_latest_page(page, ch)
        except Exception as e:
            raise HTTPException(502, f"获取列表失败: {e}")
    try:
        async with manager.session.get(f"{base_url}/api/videos/category/ai-{ch}", params={"sort": sort, "page": page, "size": 21},
                                       headers=rand_headers(), proxy=proxy, ssl=False,
                                       timeout=aiohttp.ClientTimeout(total=30)) as resp:
            data = await resp.json()
    except Exception as e:
        raise HTTPException(502, f"获取列表失败: {e}")
    items = []
    for it in data.get("data", {}).get("items", []):
        items.append({
            "id": it.get("id"), "title": (it.get("title") or "").strip(),
            "cover": it.get("cover", ""), "score": it.get("score"),
            "episode_count": it.get("episode_count"), "is_finished": it.get("is_finished"),
            "description": it.get("description", ""), "hot": it.get("hot"),
            "tags": it.get("tags", []),
        })
    return {"items": items, "pagination": data.get("data", {}).get("pagination", {})}


@app.get("/api/search")
async def api_search(q: str):
    """搜索（解析搜索结果页卡片）"""
    if not q.strip():
        return {"items": []}
    url = search_url + quote(q.strip()) + "/"
    try:
        html = await manager.fetch_text(url, "搜索")
    except Exception as e:
        raise HTTPException(502, f"搜索失败: {e}")
    soup = BeautifulSoup(html, "html.parser")
    return {"items": parse_drama_cards(soup)}


@app.get("/api/video/{video_id}")
async def api_video(video_id: int):
    """详情页数据（标题/简介/封面/集数），并合并本地下载状态与文件是否存在"""
    try:
        meta = await manager.get_video_meta(video_id)
    except Exception as e:
        raise HTTPException(502, f"获取视频信息失败: {e}")

    title = sanitize_filename(meta["title"])
    manager.sync_deleted_files(video_id)
    save_dir = SAVE_DIR / title
    episodes = []
    for ep in range(1, meta["total_eps"] + 1):
        st = manager.ep_state(video_id, ep, create=False) or {}
        file_exists = (save_dir / f"第{ep:02d}集.mp4").exists()
        status = st.get("status") or ("completed" if file_exists else "idle")
        episodes.append({
            "ep": ep,
            "status": status,
            "progress": st.get("progress", 100 if file_exists else 0),
            "error": st.get("error", ""),
        })
    return {**meta, "episodes": episodes}


@app.post("/api/download/{video_id}")
async def api_download(video_id: int, body: dict = None):
    """发起下载。body: {ep: 集数} 或 {} 下载全部"""
    ep = (body or {}).get("ep")
    if ep is not None:
        eps = [int(ep)]
    else:
        # 下载全部：需要知道总集数，先取详情
        try:
            meta = await manager.get_video_meta(video_id)
        except Exception as e:
            raise HTTPException(502, f"获取视频信息失败: {e}")
        manager.init_state(meta)
        eps = list(range(1, meta["total_eps"] + 1))
    added = manager.enqueue(video_id, eps)
    return {"queued": added, "skipped": len(eps) - len(added)}


@app.get("/api/progress")
async def api_progress():
    return manager.progress_snapshot()


@app.get("/api/pause")
async def api_get_pause():
    return {"paused": manager.paused}


@app.post("/api/pause")
async def api_set_pause(body: dict = None):
    manager.set_paused(bool((body or {}).get("paused")))
    return {"paused": manager.paused}


LIB_EP_RE = re.compile(r"^第(\d+)集\.mp4$")
_INVALID_DIR_CHARS = set('/\\:*?"<>|')


def _safe_save_subdir(name: str) -> Path:
    """把传入的目录名限制为 SAVE_DIR 下的一级子目录，防止路径穿越"""
    if not name or name in (".", "..") or any(c in name for c in _INVALID_DIR_CHARS):
        raise HTTPException(400, "目录名不合法")
    target = SAVE_DIR / name
    try:
        target.resolve().relative_to(SAVE_DIR.resolve())
    except ValueError:
        raise HTTPException(400, "目录名不合法")
    return target


def _library_file(folder: str, ep: int) -> Path:
    if ep <= 0:
        raise HTTPException(400, "集数不合法")
    return _safe_save_subdir(folder) / f"第{ep:02d}集.mp4"


def _scan_library() -> dict:
    """扫描 SAVE_DIR 下已下载的剧集（目录名=剧名，第NN集.mp4=集数）"""
    if not SAVE_DIR.exists():
        return {"items": [], "count": 0, "total_size": 0}
    items = []
    for d in SAVE_DIR.iterdir():
        if not d.is_dir():
            continue
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        eps = []
        for f in entries:
            m = LIB_EP_RE.match(f.name)
            if not m or not f.is_file():
                continue
            try:
                st = f.stat()
            except OSError:
                continue
            eps.append({"ep": int(m.group(1)), "size": st.st_size, "mtime": int(st.st_mtime)})
        if not eps:
            continue
        eps.sort(key=lambda e: e["ep"])
        items.append({
            "folder": d.name,
            "episodes": eps,
            "count": len(eps),
            "size": sum(e["size"] for e in eps),
            "mtime": max(e["mtime"] for e in eps),
        })
    items.sort(key=lambda e: e["mtime"], reverse=True)
    return {"items": items, "count": len(items), "total_size": sum(i["size"] for i in items)}


@app.get("/api/library")
async def api_library():
    """已下载剧集列表（按最近下载时间倒序）"""
    return await asyncio.to_thread(_scan_library)


# ========== 收藏剧集（PC 与手机共用，存在 favorites.json） ==========
FAV_FILE = APP_DIR / "favorites.json"


def _load_favorites() -> list:
    """读取收藏的剧集目录名"""
    try:
        data = json.loads(FAV_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [str(x) for x in data if isinstance(x, str)]


def _save_favorites(folders: list) -> None:
    FAV_FILE.write_text(json.dumps(folders, ensure_ascii=False, indent=2), encoding="utf-8")


def _toggle_favorite(folder: str, favorite: bool) -> list:
    folders = _load_favorites()
    if favorite and folder not in folders:
        folders.append(folder)
    elif not favorite and folder in folders:
        folders.remove(folder)
    _save_favorites(folders)
    return folders


@app.get("/api/favorites")
async def api_favorites():
    """收藏的剧集目录名列表"""
    return {"folders": await asyncio.to_thread(_load_favorites)}


@app.post("/api/favorites")
async def api_favorites_toggle(body: dict = None):
    """收藏 / 取消收藏（body: {folder, favorite: true/false}）"""
    body = body or {}
    folder = str(body.get("folder") or "")
    if not folder:
        raise HTTPException(400, "缺少剧名")
    return {"folders": await asyncio.to_thread(_toggle_favorite, folder, bool(body.get("favorite")))}


def _folder_is_busy(folder: str) -> bool:
    """该剧集目录是否还有下载中/排队中的任务（此时删除目录会造成写入错乱）"""
    for vid, s in manager.state.items():
        if sanitize_filename(s.get("title", "")) != folder:
            continue
        for ep, st in s.get("episodes", {}).items():
            if st.get("status") in ("downloading", "pending") or (vid, ep) in manager.queued:
                return True
    return False


@app.post("/api/library/delete")
async def api_library_delete(body: dict = None):
    """删除本地剧集目录（body: {folder}）"""
    folder = str((body or {}).get("folder") or "")
    target = _safe_save_subdir(folder)
    if not target.is_dir():
        raise HTTPException(404, "剧集目录不存在")
    if _folder_is_busy(folder):
        raise HTTPException(409, "该剧集正在下载，请先暂停并等待当前集完成后再删除")
    await asyncio.to_thread(shutil.rmtree, target, ignore_errors=True)
    await asyncio.to_thread(_toggle_favorite, folder, False)  # 删除本地文件同时移出收藏
    manager.sync_deleted_files()  # 清理内存中指向已删文件的下载记录
    log(f"已删除本地剧集目录: {folder}")
    return {"deleted": folder}


async def _resolve_video_id(folder: str) -> tuple:
    """按本地目录名反查站内 video_id（目录名即 sanitize 后的剧名）"""
    for vid, name in manager.title_cache.items():
        if name == folder:
            return int(vid), folder
    try:
        html = await manager.fetch_text(search_url + quote(folder) + "/", "搜索")
    except Exception as e:
        raise HTTPException(502, f"搜索失败: {e}")
    items = parse_drama_cards(BeautifulSoup(html, "html.parser"))
    names = [(it, sanitize_filename(it["title"])) for it in items]
    hit = next((it for it, n in names if n == folder), None) \
        or next((it for it, n in names if n and (n in folder or folder in n)), None)
    if not hit:
        raise HTTPException(404, "站内未找到该剧，可能已下架")
    return hit["id"], hit["title"]


@app.get("/api/library/episodes")
async def api_library_episodes(folder: str):
    """卡片展开用：返回该剧全部集数与本机已下载的集数"""
    folder = folder.strip()
    target = _safe_save_subdir(folder)
    if not target.is_dir():
        raise HTTPException(404, "剧集目录不存在")
    downloaded = []
    for f in target.iterdir():
        m = LIB_EP_RE.match(f.name)
        if m and f.is_file():
            downloaded.append(int(m.group(1)))
    vid, _ = await _resolve_video_id(folder)
    try:
        meta = await manager.get_video_meta(vid)
    except Exception as e:
        raise HTTPException(502, f"获取视频信息失败: {e}")
    return {
        "video_id": vid,
        "title": meta["title"],
        "total_eps": max(meta["total_eps"], max(downloaded, default=0)),
        "downloaded": sorted(downloaded),
    }


@app.post("/api/open-folder")
async def api_open_folder(body: dict = None):
    """打开本地下载目录（body: {video_id} 打开对应视频目录，{folder} 打开指定剧集目录，否则打开根目录）"""
    body = body or {}
    vid = body.get("video_id")
    folder = body.get("folder")
    target = SAVE_DIR
    if folder:
        target = _safe_save_subdir(str(folder))
        if not target.is_dir():
            raise HTTPException(404, "剧集目录不存在")
    elif vid:
        try:
            title = await manager.resolve_title(int(vid))
            target = SAVE_DIR / title
        except Exception as e:
            raise HTTPException(502, f"获取视频目录失败: {e}")
    target.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(os.startfile, str(target))  # Windows 资源管理器
    return {"opened": str(target)}


@app.post("/api/play")
async def api_play(body: dict = None):
    """调用本地默认播放器播放已下载的视频（body: {video_id, ep}）。
    网页内嵌播放对 fMP4 型HLS拼接文件与HEVC编码无能为力，本地播放器通吃。"""
    vid = int((body or {}).get("video_id") or 0)
    ep = int((body or {}).get("ep") or 0)
    if not vid or not ep:
        raise HTTPException(400, "缺少 video_id 或 ep")
    try:
        title = await manager.resolve_title(vid)
    except Exception as e:
        raise HTTPException(502, f"获取视频信息失败: {e}")
    file_path = SAVE_DIR / title / f"第{ep:02d}集.mp4"
    if not file_path.exists():
        raise HTTPException(404, "视频文件不存在（尚未下载）")
    await manager.ensure_remux(file_path)  # 若仍是TS拼接流，先无损转封装
    await asyncio.to_thread(os.startfile, str(file_path))  # 系统默认关联播放器
    return {"opened": str(file_path)}


@app.post("/api/library/play")
async def api_library_play(body: dict = None):
    """播放已下载的剧集（body: {folder, ep}），无需 video_id"""
    body = body or {}
    file_path = _library_file(str(body.get("folder") or ""), int(body.get("ep") or 0))
    if not file_path.exists():
        raise HTTPException(404, "视频文件不存在")
    await manager.ensure_remux(file_path)
    await asyncio.to_thread(os.startfile, str(file_path))
    return {"opened": str(file_path)}


def _video_response(file_path: Path, range_header: str):
    """按 Range 返回本地视频流（MP4 原生播放 / TS 交给前端 mpegts.js）"""
    size = file_path.stat().st_size
    start, end = 0, size - 1
    status = 200
    if range_header:
        m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            else:  # bytes=-N 后缀范围
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            status = 206
    if start > end or start >= size:
        raise HTTPException(416, "Range Not Satisfiable")

    # 下载内容是MPEG-TS（0x47同步字节），浏览器用mpegts.js播放；正常MP4用原生播放
    with open(file_path, "rb") as f:
        media_type = "video/mp2t" if f.read(1) == b"\x47" else "video/mp4"

    def iter_file():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1)}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(iter_file(), status_code=status,
                             media_type=media_type, headers=headers)


@app.get("/api/stream/{video_id}/{ep}")
async def api_stream(video_id: int, ep: int, range_header: str = Header(None, alias="range")):
    """本地视频播放（支持Range，可拖动进度条）"""
    try:
        title = await manager.resolve_title(video_id)
    except Exception as e:
        raise HTTPException(502, f"获取视频信息失败: {e}")
    file_path = SAVE_DIR / title / f"第{ep:02d}集.mp4"
    if not file_path.exists():
        raise HTTPException(404, "视频文件不存在（尚未下载）")
    await manager.ensure_remux(file_path)  # 若仍是TS拼接流，先无损转封装（转后才是合法MP4，浏览器可播）
    return _video_response(file_path, range_header)


@app.get("/api/library/stream")
async def api_library_stream(folder: str, ep: int, range_header: str = Header(None, alias="range")):
    """已下载剧集网页播放（支持Range），供手机端从剧集列表直接打开"""
    file_path = _library_file(folder, ep)
    if not file_path.exists():
        raise HTTPException(404, "视频文件不存在")
    await manager.ensure_remux(file_path)
    return _video_response(file_path, range_header)


@app.get("/api/image")
async def api_image(url: str):
    """图片代理（图床有防盗链+auth_key时效，由后端转发）"""
    host = urlparse(url).netloc
    if host not in IMG_HOSTS and not IMG_HOST_RE.match(host):
        raise HTTPException(400, "不支持的图片域名")
    content = b""
    for attempt in range(2):
        try:
            async with manager.session.get(url, headers=rand_headers(), proxy=proxy, ssl=False,
                                           timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status == 200:
                    content = await resp.read()
                    break
        except Exception:
            pass
        await asyncio.sleep(1)
    if not content:
        raise HTTPException(502, "图片获取失败")
    # 图床返回的是AES加密数据，先解密（若已是明文图片则跳过）
    if not (content[:2] == b"\xff\xd8" or content[:8] == b"\x89PNG\r\n\x1a\n"
            or content[:3] == b"GIF" or (content[:4] == b"RIFF" and content[8:12] == b"WEBP")):
        try:
            content = decrypt_image(content)
        except ValueError:
            pass
    # 按文件头嗅探真实格式，避免Content-Type不符导致浏览器拒绝渲染
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        media_type = "image/png"
    elif content[:3] == b"GIF":
        media_type = "image/gif"
    elif content[:2] == b"\xff\xd8":
        media_type = "image/jpeg"
    elif content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        media_type = "image/webp"
    else:
        raise HTTPException(502, "图片解密失败")
    return Response(content, media_type=media_type,
                    headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)  # 监听所有网卡，允许手机局域网访问
