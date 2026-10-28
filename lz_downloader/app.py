"""
荔枝短剧可视化下载工具
- 主页: 专题列表（热播/最新/收藏/点赞/随机）+ 搜索 + 一键下载 + 下载进度
- 详情页: 标题/封面/简介/选集下载
启动: & e:/myWork/project/ac-website/.venv/Scripts/python.exe app.py
访问: 电脑 http://127.0.0.1:8766 · 手机（同一局域网）http://192.168.2.15:8766
"""
import asyncio
import json
import math
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse

import aiofiles
import aiohttp
import requests
import urllib3
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

# ========== 基础配置 ==========
base_url = "https://liz01.com"  # 站点域名会轮换 liz01~liz10，换域名只改这里
API_BASE = f"{base_url}/api/v1"
# 专题（频道）：slug -> 显示名，数据源为 /api/v1/topic/{slug}
TOPICS = {"lizhi-picked": "荔枝精选", "lizhi-original": "荔枝原创"}
# 榜单：tab 参数 -> 显示名
TABS = {"hot": "热播", "new": "最新"}
PAGE_SIZE = 24

APP_DIR = Path(__file__).parent
SAVE_DIR = Path(r"E:\download\荔枝短剧")  # 保存根目录（按标题建目录）
FFMPEG = APP_DIR / "tools" / "ffmpeg.exe"  # 便携ffmpeg：把HLS拼接TS流无损转封装为真MP4
if not FFMPEG.exists():  # 本项目未放ffmpeg时复用黄果项目的，避免重复占100MB
    FFMPEG = APP_DIR.parent / "hg_downloader" / "tools" / "ffmpeg.exe"
PORT = 8766

CONCURRENT_DOWNLOADS = 16  # 分片并发数（单集 TS 分片 2~6MB）
SEGMENT_TIMEOUT = 30       # 接口/m3u8 请求超时（秒）
SEGMENT_CHUNK = 2 * 1024 * 1024      # 分块首次尝试的块大小（CDN约2MB掐断，能过就更快）
SEGMENT_CHUNK_MIN = 1024 * 1024      # 块失败后回退的块大小（原来稳定可用的1MB）
SEGMENT_RETRIES = 8        # 分片连续失败重试次数
CHUNK_DEADLINE = 15        # 单个块最长耗时（秒）：CDN会"滴流"拖住连接，超时即断开重连
MAX_RETRIES = 3            # 接口/m3u8 重试次数

# 防爬配置
EP_DELAY = (0.3, 1)        # 每集真正下载完成后的随机等待区间（秒）；跳过/失败不等待
PAGE_DELAY = (0.5, 1.5)    # 接口请求间的随机等待区间（秒）

proxy = "http://localhost:7890"
FORCE_PROXY = False  # 分片是否强制走代理（False = 先探测直连，直连可用则用直连；实测直连快4倍+）

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

# 允许代理图片的图床域名（封面图在 media.lizdj009.com 一类的域名上）
IMG_HOST_RE = re.compile(r"^media\.lizdj\d+\.com$")

# 图床图片是 AES-128-CBC(NoPadding) 加密的，key/iv 来自站点配置
# window.__NUXT__.config.public.imageAesKeyHex / imageAesIvHex（站点可能轮换）
IMG_AES_KEY = bytes.fromhex("ea19c21e85d768da4165f5964ab886b2")
IMG_AES_IV = bytes.fromhex("f4d53ecbc273901e0d9cd7848233c702")


def decrypt_image(data: bytes) -> bytes:
    """解密图床返回的加密图片（AES-128-CBC NoPadding，明文即图片字节）"""
    cipher = AES.new(IMG_AES_KEY, AES.MODE_CBC, IMG_AES_IV)
    return cipher.decrypt(data)


def rand_headers():
    return {"User-Agent": random.choice(USER_AGENTS), "Referer": f"{base_url}/"}


def sanitize_filename(filename):
    return re.sub(r'[\\/:*?"<>|]', "", filename).strip()


def file_ready(path):
    """正式文件是否可用：存在且不是失败留下的 0 字节/残缺文件（单集正常都有几十 MB）"""
    try:
        return path.exists() and path.stat().st_size > 1024 * 1024
    except OSError:
        return False


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} - {msg}")


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
PROXIES = {"http": proxy, "https": proxy}

_thread_local = threading.local()


def get_seg_session():
    """每个下载线程复用一个 requests.Session：复用 TCP/TLS 连接与代理隧道，
    避免每个分片重新握手（单集 20+ 分片时这部分开销很可观）。"""
    sess = getattr(_thread_local, "session", None)
    if sess is None:
        sess = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=4, max_retries=0)
        sess.mount("http://", adapter)
        sess.mount("https://", adapter)
        sess.trust_env = False  # 直连时不被系统 HTTP_PROXY 环境变量劫持
        _thread_local.session = sess
    return sess


def probe_direct(url):
    """探测CDN能否直连（Range 0-0，几秒内返回即可）：直连比本机代理快数倍"""
    try:
        resp = get_seg_session().get(url, headers={**rand_headers(), "Range": "bytes=0-0"},
                                     proxies=None, verify=False, timeout=(4, 6))
        ok = resp.status_code in (200, 206)
        resp.close()
        return ok
    except Exception:
        return False


def fetch_chunk(session, url, proxies, timeout, start, chunk_size):
    """取 [start, start+chunk_size) 的字节；返回 (chunk, total_size)"""
    headers = rand_headers()
    headers["Accept-Encoding"] = "identity"
    headers["Range"] = f"bytes={start}-{start + chunk_size - 1}"
    resp = session.get(url, headers=headers, proxies=proxies, verify=False, timeout=timeout)
    with resp:
        if resp.status_code == 416:  # Range越界：已到文件末尾
            return b"", start
        if resp.status_code not in (200, 206):
            raise Exception(f"HTTP {resp.status_code}")
        m = re.search(r"/(\d+)\s*$", resp.headers.get("Content-Range") or "")
        total = int(m.group(1)) if m else 0
        body = bytearray()
        t0 = time.time()
        for piece in resp.iter_content(65536):
            body += piece
            if time.time() - t0 > CHUNK_DEADLINE:
                # CDN"滴流"连接：每次都有少量数据但整体极慢，requests的read超时抓不到，必须按总耗时掐断
                raise Exception(f"分块读取超时({CHUNK_DEADLINE}s)")
        if not body:
            raise Exception("空分块")
        if resp.status_code == 200:  # 服务端忽略Range，返回整片
            total = len(body)
        return bytes(body), total


def fetch_segment_sync(url, prefer_direct=True):
    """同步下载单个分片（requests + 多线程）。
    CDN 单连接在约 2MB 处会被断开，因此按 Range 分块拉取再拼接：
    首块尝试 2MB，一旦失败自动降到 1MB（原来稳定可用的块大小）继续。
    每块优先直连（实测比走代理快 3 倍左右），直连失败该块回退代理。"""
    if prefer_direct:
        routes = [(None, (3, 10)), (PROXIES, (5, 20))]
    else:
        routes = [(PROXIES, (5, 20))]

    session = get_seg_session()
    data = bytearray()
    total = None
    fails = 0
    chunk_size = SEGMENT_CHUNK
    while total is None or len(data) < total:
        last_err = None
        chunk = None
        for proxies, timeout in routes:
            try:
                chunk, got_total = fetch_chunk(session, url, proxies, timeout, len(data), chunk_size)
                if got_total:
                    total = got_total
                if not chunk and total == len(data):  # 416，正常收尾
                    break
                if chunk:
                    break
            except Exception as e:
                last_err = f"{'直连' if proxies is None else '代理'}: {e}"
                chunk = None
        if chunk is None:
            fails += 1
            if fails >= SEGMENT_RETRIES:
                raise Exception(last_err)
            chunk_size = SEGMENT_CHUNK_MIN  # 大块被掐断/超时：后续改用最小块，避免反复失败
            time.sleep(0.3)
            continue
        fails = 0
        data.extend(chunk)
        if total and len(data) > total:
            del data[total:]
    return bytes(data)


# ========== 下载管理器 ==========
class DownloadManager:
    def __init__(self):
        self.state = {}  # video_id -> {title, cover, total_eps, episodes: {ep: {...}}}
        self.m3u8_cache = {}  # video_id -> {ep: (m3u8_url, ts_time)}，短TTL防token过期
        self.meta_cache = {}  # video_id -> (meta, ts_time)
        self.title_cache = {}  # video_id -> 本地目录名（sanitize后的标题），供播放/打开目录用
        self.session = None
        self.jobs = asyncio.Queue()
        self.queued = set()  # (video_id, ep) 去重
        self.paused = False  # 全局暂停开关
        self.resume_event = asyncio.Event()
        self.resume_event.set()  # set=运行中，clear=暂停
        self.remux_lock = asyncio.Lock()  # 转封装互斥（同文件不会并发，全局锁足够）
        # 分片下载独立线程池：避免和 aiofiles 写盘共用默认线程池互相排队
        self.seg_pool = ThreadPoolExecutor(max_workers=CONCURRENT_DOWNLOADS + 4,
                                           thread_name_prefix="seg")

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

    async def fetch_json(self, url, note=""):
        text = await self.fetch_text(url, note)
        try:
            return json.loads(text)
        except ValueError as e:
            raise Exception(f"返回不是JSON ({note}): {e}")

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
    async def get_video_meta(self, video_id):
        """剧集详情接口解析标题/简介/封面/总集数"""
        hit = self.meta_cache.get(video_id)
        if hit and time.time() - hit[1] < 600:
            return hit[0]
        raw = await self.fetch_json(f"{API_BASE}/drama/{video_id}", "剧集详情")
        d = raw.get("data") or {}
        if not d:
            raise Exception(f"剧集 {video_id} 数据为空")
        planned = int(d.get("totalEpisodes") or 1)
        published = int(d.get("publishedEpisodeCount") or planned)
        # 未连载完的剧只提供已更新集数，避免对未发布集数发起必败的下载
        downloadable = published if (d.get("partial") and published > 0) else planned
        meta = {
            "id": d.get("id") or video_id,
            "title": (d.get("title") or "").strip() or f"drama_{video_id}",
            "slug": d.get("slug") or "",
            "desc": d.get("description") or "",
            "cover": d.get("coverUrl") or "",
            "tags": [t.get("name") for t in (d.get("tags") or []) if t.get("name")],
            "score": d.get("score"),
            "total_eps": downloadable,
            "planned_eps": planned,
            "published_eps": published,
            "partial": bool(d.get("partial")),
            "view_text": d.get("displayViewText") or "",
            "category": d.get("categoryName") or "",
        }
        self.meta_cache[video_id] = (meta, time.time())
        return meta

    async def resolve_title(self, video_id):
        """本地目录名（优先缓存，缺失时抓详情并缓存）"""
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
            worked = False
            try:
                worked = await self._download_one(video_id, ep)
            except Exception as e:
                st = self.ep_state(video_id, ep)
                if st:
                    st.update(status="failed", error=str(e))
                log(f"{video_id} 第{ep}集 下载失败: {e}")
            finally:
                self.queued.discard((video_id, ep))
                self.jobs.task_done()
            # 仅对真正下载过内容的集随机等待，降低连续请求触发风控的概率；跳过/失败不等待
            if worked:
                await asyncio.sleep(random.uniform(*EP_DELAY))

    async def _ensure_m3u8(self, video_id, ep):
        """按需获取m3u8（缓存10分钟，防播放token过期）"""
        cache = self.m3u8_cache.setdefault(video_id, {})
        hit = cache.get(ep)
        if hit and time.time() - hit[1] < 600:
            return hit[0]
        raw = await self.fetch_json(f"{API_BASE}/drama/{video_id}/ep/{ep}", f"第{ep}集播放地址")
        playback = (raw.get("data") or {}).get("playbackUrl")
        if not playback:
            raise Exception(f"第{ep}集没有可用的播放地址（可能尚未更新）")
        m3u8 = urljoin(base_url + "/", playback)
        cache[ep] = (m3u8, time.time())
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
        # 优先复用内存中的标题，避免每集都回源站取详情（长任务中 meta 缓存会过期）
        s = self.state.get(video_id)
        if s and s.get("title"):
            title = sanitize_filename(s["title"])
        else:
            meta = await self.get_video_meta(video_id)
            self.init_state(meta)
            title = sanitize_filename(meta["title"])
        self.title_cache[video_id] = title
        st = self.ep_state(video_id, ep)
        st.update(status="downloading", progress=0, seg_done=0, seg_total=0, bytes=0, error="")

        save_dir = SAVE_DIR / title
        save_dir.mkdir(parents=True, exist_ok=True)
        file_path = save_dir / f"第{ep:02d}集.mp4"
        st["file"] = str(file_path)

        if file_ready(file_path):
            st.update(status="completed", progress=100)
            log(f"{title} 第{ep:02d}集 文件已存在，跳过")
            return False

        m3u8_url = await self._ensure_m3u8(video_id, ep)
        m3u8_text = await self.fetch_text(m3u8_url, "m3u8")
        key_url, base_iv, media_sequence, ts_urls = self.parse_m3u8(m3u8_text)
        if not ts_urls:
            raise Exception("未找到任何ts文件链接")
        # 分片/密钥可能是相对地址，统一补全
        ts_urls = [urljoin(m3u8_url, u) for u in ts_urls]
        if key_url:
            key_url = urljoin(m3u8_url, key_url)

        key = b""
        if key_url:
            key = await self.fetch_bytes(key_url, "key")

        total = len(ts_urls)
        st["seg_total"] = total
        # 分片线路：默认强制代理；关掉 FORCE_PROXY 时每集探测一次，直连可用才走直连
        use_direct = False if FORCE_PROXY else await asyncio.to_thread(probe_direct, ts_urls[0])
        log(f"{title} 第{ep:02d}集 开始下载，共{total}个分片（{'直连' if use_direct else '代理'}）")
        loop = asyncio.get_running_loop()

        async def fetch_segment(index, url):
            t0 = time.time()
            try:
                raw = await loop.run_in_executor(self.seg_pool, fetch_segment_sync, url, use_direct)
            except Exception as e:
                raise Exception(f"分片{index}下载失败: {e}")
            dt = time.time() - t0
            if dt > 10:  # 只记录明显偏慢的分片，便于定位线路抖动
                log(f"分片{index} 耗时 {dt:.1f}s")
            return raw

        # 先写 .part，整集成功后再原子改名为 .mp4，避免失败留下的残缺文件被当成已下载
        part_path = file_path.with_suffix(".mp4.part")
        async with aiofiles.open(part_path, "wb") as f:
            # 滑动窗口：最多 CONCURRENT_DOWNLOADS 个分片同时在跑，但按顺序边下边写，
            # 不再等一批全部到齐——单个慢分片只会占住自己的位置，不会让整批进度卡死
            pending = {}
            next_start = 0
            write_idx = 0
            while write_idx < total:
                while next_start < total and len(pending) < CONCURRENT_DOWNLOADS:
                    pending[next_start] = asyncio.create_task(
                        fetch_segment(next_start, ts_urls[next_start]))
                    next_start += 1
                await self.resume_event.wait()  # 每写一个分片前响应全局暂停
                raw = await pending.pop(write_idx)
                iv = base_iv if base_iv is not None else (media_sequence + write_idx).to_bytes(16, "big")
                if key:
                    raw = self.decrypt_segment(raw, key, iv)
                await f.write(raw)
                st["bytes"] += len(raw)
                st["seg_done"] += 1
                st["progress"] = round(st["seg_done"] / total * 100, 1)
                write_idx += 1

        os.replace(part_path, file_path)  # 整集完整后才落成正式文件名
        st.update(status="completed", progress=100)
        size_mb = st["bytes"] / 1024 / 1024
        log(f"{title} 第{ep:02d}集 下载完成 ({size_mb:.1f}MB)")
        await self.ensure_remux(file_path)  # TS→MP4 无损转封装，手机浏览器/默认播放器可播
        return True

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
                elif file_ready(save_dir / f"第{ep:02d}集.mp4"):
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


def norm_item(it):
    """把专题/搜索接口的 item 归一化成前端卡片字段"""
    return {
        "id": it.get("id"),
        "title": (it.get("title") or "").strip(),
        "cover": it.get("coverUrl") or "",
        "score": it.get("score"),
        "episode_count": it.get("totalEpisodes"),
        "episode_text": (f"更新至{it.get('publishedEpisodeCount')}集"
                         if it.get("partial") and it.get("publishedEpisodeCount") else ""),
        "description": it.get("description") or "",
        "view_text": it.get("displayViewText") or "",
        "badge": it.get("coverBadge") or "",
        "badge_color": it.get("coverBadgeColor") or "",
        "progress_text": it.get("coverProgress") or "",
        "tags": [t.get("name") for t in (it.get("tags") or []) if t.get("name")],
    }


def norm_page(p_obj, fallback_page=1):
    total = int(p_obj.get("total") or 0)
    size = int(p_obj.get("size") or PAGE_SIZE) or PAGE_SIZE
    pages = max(1, math.ceil(total / size)) if total else fallback_page
    return {"page": p_obj.get("page") or fallback_page, "pages": pages,
            "total": total, "has_more": bool(p_obj.get("hasMore"))}


# ========== FastAPI ==========
app = FastAPI(title="荔枝短剧下载器")
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


@app.get("/api/list")
async def api_list(page: int = 1, sort: str = "hot", ch: str = "lizhi-picked"):
    """专题列表（ch: 专题slug; sort: hot/new/fav/like/random）"""
    if ch not in TOPICS:
        ch = "lizhi-picked"
    if sort not in TABS:
        sort = "hot"
    query = urlencode({"tab": sort, "page": page, "size": PAGE_SIZE})
    try:
        data = await manager.fetch_json(f"{API_BASE}/topic/{ch}?{query}", "专题列表")
    except Exception as e:
        raise HTTPException(502, f"获取列表失败: {e}")
    p_obj = (data.get("data") or {}).get("page") or {}
    items = [norm_item(it) for it in (p_obj.get("items") or [])]
    return {"items": items, "pagination": norm_page(p_obj, page)}


@app.get("/api/search")
async def api_search(q: str, page: int = 1):
    """搜索（站点搜索接口参数名是 keyword；用 q 会被忽略并返回默认列表）"""
    if not q.strip():
        return {"items": [], "pagination": {"page": 1, "pages": 1, "total": 0}}
    query = urlencode({"keyword": q.strip(), "page": page, "size": PAGE_SIZE})
    try:
        data = await manager.fetch_json(f"{API_BASE}/search?{query}", "搜索")
    except Exception as e:
        raise HTTPException(502, f"搜索失败: {e}")
    result = (data.get("data") or {}).get("result") or {}
    p_obj = result.get("page") or {}
    items = [norm_item(it) for it in (p_obj.get("items") or [])]
    return {"items": items, "pagination": norm_page(p_obj, page)}


@app.get("/api/video/{video_id}")
async def api_video(video_id: int):
    """详情页数据（标题/简介/封面/集数），并合并本地下载状态与文件是否存在"""
    try:
        meta = await manager.get_video_meta(video_id)
    except Exception as e:
        raise HTTPException(502, f"获取视频信息失败: {e}")

    title = sanitize_filename(meta["title"])
    manager.init_state(meta)
    manager.sync_deleted_files(video_id)
    save_dir = SAVE_DIR / title
    episodes = []
    for ep in range(1, meta["total_eps"] + 1):
        st = manager.ep_state(video_id, ep, create=False) or {}
        file_exists = file_ready(save_dir / f"第{ep:02d}集.mp4")
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


@app.post("/api/open-folder")
async def api_open_folder(body: dict = None):
    """打开本地下载目录（body: {video_id} 打开对应视频目录，否则打开根目录）"""
    vid = (body or {}).get("video_id")
    target = SAVE_DIR
    if vid:
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
    网页内嵌播放对 fMP4型HLS拼接文件与HEVC编码无能为力，本地播放器通吃。"""
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


@app.get("/api/image")
async def api_image(url: str):
    """图片代理（图床有防盗链+加密，由后端转发并解密）"""
    host = urlparse(url).netloc
    if not IMG_HOST_RE.match(host):
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
