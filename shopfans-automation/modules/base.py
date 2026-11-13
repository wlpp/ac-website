# -*- coding: utf-8 -*-
"""
模块基类 — 所有自动化模块共享的 Runner（Playwright）和 Panel（Tkinter UI）能力

使用方式:
  class MyModulePanel(BaseModulePanel):
      def build_ui(self, parent):
          # 在 parent frame 里放自己的按钮
          ...

  class MyModuleRunner(BaseRunner):
      # 继承 start_browser / close / save_state
      # 实现自己的业务方法
      ...
"""
import os
import time
import tkinter as tk
from playwright.sync_api import sync_playwright


# ===== 系统级配置（所有模块共享）=====
COOKIE_STATE_FILE = os.path.join(os.path.expanduser("~"), ".playwright_shopfans_state.json")


def find_chrome_exe() -> str:
    """自动探测系统 Chrome 安装路径（兼容 64/32 位、用户级安装、注册表）。
    打包成 exe 后在其他电脑上也能找到正确路径。"""
    # 1) 注册表 App Paths（最可靠）
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                            r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe") as k:
            path, _ = winreg.QueryValueEx(k, "")
            if path and os.path.isfile(path):
                return path
    except OSError:
        pass
    # 2) 常见路径兜底
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""),
                     r"Google\Chrome\Application\chrome.exe"),
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    # 都找不到时返回默认路径，由 Playwright 启动时报错提示
    return r"C:\Program Files\Google\Chrome\Application\chrome.exe"


CHROME_EXE = find_chrome_exe()


class BaseRunner:
    """共享 Playwright Runner — 一个 Chrome 实例，所有模块共用"""

    def __init__(self, log):
        self.log = log
        self.pw = None
        self.browser = None
        self.context = None
        self.page = None

    # ---------- 生命周期 ----------
    def start_browser(self):
        if self.pw:
            self.log("  （浏览器已启动，跳过）")
            return
        self.pw = sync_playwright().start()
        self.log(f"  使用系统 Chrome: {CHROME_EXE}")

        context_kwargs = {}
        if os.path.exists(COOKIE_STATE_FILE):
            context_kwargs["storage_state"] = COOKIE_STATE_FILE
            self.log("  ✓ 加载了上次保存的登录态")
        else:
            self.log("  ⚠ 首次运行无登录态 —— 启动后请先手动登录 shopfans")

        self.browser = self.pw.chromium.launch(
            executable_path=CHROME_EXE,
            headless=False,
            args=[
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        self.context = self.browser.new_context(**context_kwargs)
        self.page = self.context.new_page()
        self.page.goto("about:blank")
        time.sleep(0.5)
        self.log("✓ 浏览器已启动")

    def save_state(self):
        if self.context:
            try:
                self.context.storage_state(path=COOKIE_STATE_FILE)
            except Exception:
                pass

    def close(self):
        self.save_state()
        if self.context:
            try: self.context.close()
            except Exception: pass
        if self.browser:
            try: self.browser.close()
            except Exception: pass
        if self.pw:
            try: self.pw.stop()
            except Exception: pass
        self.pw = self.browser = self.context = self.page = None
        self.log("✓ 浏览器已关闭")

    def goto(self, url: str):
        """通用跳转 + 登录检测"""
        self.page.goto(url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        if "login" in self.page.url.lower() or "sign" in self.page.url.lower():
            raise RuntimeError(
                f"页面跳转到了登录页 ({self.page.url})\n"
                "请先在浏览器里手动登录 shopfans"
            )

    def open_page(self, url: str, url_keyword: str = None, save_cookie: bool = True):
        """
        通用打开页面 + 登录检测 + URL 关键词校验 + 保存 cookie
        每个模块的 open_list 都应该调这个方法
        """
        self.log(f"打开 {url} ...")
        self.goto(url)
        if url_keyword:
            assert url_keyword in self.page.url.lower(), \
                f"页面未正确加载（URL 不含 '{url_keyword}'）: {self.page.url}"
        self.log(f"  ✓ 页面加载完成: {self.page.url}")
        if save_cookie:
            self.save_state()


class BaseModulePanel:
    """模块 UI 基类 — 子类实现 build_ui(parent) 把自己的控件放进 tab frame"""

    # 子类覆盖
    MODULE_TITLE = "未命名模块"
    MODULE_SUBTITLE = ""

    def __init__(self, runner: BaseRunner, log_func):
        self.runner = runner
        self.log = log_func
        self.frame = None   # build_ui 时设置

    def build_ui(self, parent: tk.Frame):
        """子类必须实现 —— 在 parent frame 里放自己的按钮/布局"""
        raise NotImplementedError

    def on_reset_ui(self):
        """子类可选覆盖 —— 重置自己的 UI 状态（Runner 保持不变）"""
        pass
