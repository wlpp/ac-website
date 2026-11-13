# -*- coding: utf-8 -*-
r"""
交互式自动化控制面板（旧版单文件备份）

流程: 启动浏览器 → 打开 Open Shipment → 获取 Open Boxes 所有 ID
      → 点击某个 ID 自动跑完整流程（Hold on → In box → 读 Weight → 填 → Confirm → Proceed）
      → 完成的 ID 按钮置灰

运行:
  cd e:/myWork/project/ac-website/shopfans-automation/legacy
  ..\..\..\.venv\Scripts\python.exe 01_manual_control.py
"""
import os
import re
import time
import tkinter as tk
from tkinter import scrolledtext, messagebox
from playwright.sync_api import sync_playwright

# ===== 线上配置 =====
BASE_URL = "https://app.shopfans.com"
OPEN_LIST_PATH = "/admin/shipment/open.html"

# 系统 Chrome 路径
CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# Cookie 持久化文件 —— 比 launch_persistent_context 更可控，不受 Chrome 后台进程影响
COOKIE_STATE_FILE = os.path.join(os.path.expanduser("~"), ".playwright_shopfans_state.json")


def parse_lbs(raw: str) -> str:
    m = re.search(r"([\d.]+)\s*lbs", raw)
    if not m:
        raise ValueError(f"cannot parse lbs from '{raw}'")
    return m.group(1)


class Runner:
    def __init__(self, log):
        self.log = log           # 日志函数
        self.pw = None
        self.context = None
        self.page = None
        self.weight_lbs = None

    def start_browser(self):
        self.pw = sync_playwright().start()
        self.log(f"  使用系统 Chrome: {CHROME_EXE}")

        # 如果有之前保存的 cookie，显式加载（比 persistent_context 更可靠）
        context_kwargs = {}
        if os.path.exists(COOKIE_STATE_FILE):
            context_kwargs["storage_state"] = COOKIE_STATE_FILE
            self.log("  ✓ 加载了上次保存的登录态")
        else:
            self.log("  ⚠ 首次运行无登录态 —— 启动后请先手动登录 shopfans")

        # 用普通 launch + new_context，不用 launch_persistent_context（后者受 Chrome 后台进程影响）
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
        """手动保存 cookie / localStorage 到文件（确保下次能恢复登录态）"""
        if self.context:
            try:
                self.context.storage_state(path=COOKIE_STATE_FILE)
                self.log(f"  ✓ 登录态已保存到 {COOKIE_STATE_FILE}")
            except Exception as e:
                self.log(f"  ⚠ 保存登录态失败: {e}")

    def close(self):
        self.save_state()   # 先保存 cookie 再关浏览器
        if self.context:
            try: self.context.close()
            except Exception: pass
        if self.browser:
            try: self.browser.close()
            except Exception: pass
        if self.pw: self.pw.stop()
        self.log("✓ 浏览器已关闭")

    # ---------- 页面操作 ----------
    def open_list(self):
        url = f"{BASE_URL}{OPEN_LIST_PATH}"
        self.log(f"打开 {url} ...")
        self.page.goto(url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        # 检查是否被重定向到登录页
        if "login" in self.page.url.lower() or "sign" in self.page.url.lower():
            raise RuntimeError(
                f"页面跳转到了登录页 ({self.page.url})\n"
                "请先在浏览器里手动登录 shopfans，登录成功后再点 [② 打开 Open Shipment]"
            )
        assert "shipment" in self.page.url.lower() or "open" in self.page.url.lower(), \
            f"页面未正确加载: {self.page.url}"
        self.log("  ✓ Open Shipment 列表页加载完成")
        self.save_state()  # 已登录 → 立即保存 cookie

    def get_ids(self, table_selector: str) -> list:
        """从指定表格读取所有 shipment_id —— 自动遍历 DataTables 分页"""
        all_ids = []
        page_num = 0
        max_pages = 50  # 安全上限，防止死循环

        while page_num < max_pages:
            # 读当前页所有 checkbox value
            ids = self.page.eval_on_selector_all(
                f"{table_selector} .check_id",
                "els => els.map(e => e.value).filter(Boolean)"
            )
            new_ids = [i for i in ids if i not in all_ids]
            all_ids.extend(new_ids)
            self.log(f"    第 {page_num+1} 页: 本页 {len(ids)} 条 (+{len(new_ids)} 新)")

            # 检查有没有 "Next" 分页按钮且可用
            # DataTables 结构: table.dataTable 被 .dataTables_wrapper 包裹，分页在内部
            wrapper = self.page.locator(f"{table_selector}").locator("xpath=ancestor::*[contains(@class,'dataTables_wrapper')]").first
            next_btn = wrapper.locator(".dataTables_paginate .paginate_button.next")
            try:
                next_btn.wait_for(state="attached", timeout=1000)
                cls = next_btn.get_attribute("class") or ""
                if "disabled" in cls:
                    break   # 没有下一页了
                next_btn.click()
                page_num += 1
                # 等表格数据刷新
                self.page.wait_for_function(
                    f"() => document.querySelectorAll('{table_selector} .check_id').length > 0",
                    timeout=5000,
                )
                time.sleep(0.5)
            except Exception:
                break   # 没有分页控件或已到最后一页

        self.log(f"    ✓ 共获取 {len(all_ids)} 个 ID（{page_num+1} 页）")
        return all_ids

    def get_open_boxes_ids(self) -> list:
        return self.get_ids("#open_boxes_table")

    def get_consolidating_ids(self) -> list:
        return self.get_ids("#consolidating_table")

    def _close_hold_on_dialog(self):
        """检测并关闭页面自动弹出的 Hold on 弹框（关完等 DOM 真正移除）"""
        try:
            # 跳转后先多等一会儿，确保弹框渲染出来
            self.page.wait_for_load_state("networkidle", timeout=8000)
            time.sleep(1)   # 额外缓冲

            # 找所有 .ui-dialog，看哪个含 "The reason why" 文字（Hold on 独有）
            dlg = self.page.locator(".ui-dialog").filter(has_text="The reason why")
            count = dlg.count()
            self.log(f"    检测到 {count} 个含 'The reason why' 的 .ui-dialog")
            if count == 0:
                self.log("    （无 Hold on 弹框，跳过）")
                return

            # 主方案：点右上角 ✕
            try:
                close_btn = dlg.first.locator(".ui-dialog-titlebar-close")
                close_btn.wait_for(state="visible", timeout=3000)
                close_btn.click()
            except Exception:
                # 兜底：点 CANCEL 按钮
                try:
                    dlg.first.get_by_role("button", name="CANCEL").click()
                except Exception:
                    self.log("    ⚠ 两种关闭方式都失败，继续尝试...")

            # 等弹框真正从 DOM 移除（不是 visible=hidden）
            try:
                self.page.wait_for_function(
                    "() => document.querySelectorAll('.ui-dialog').length",
                    predicate=lambda cnt: cnt <= 1,
                    timeout=5000,
                )
            except Exception:
                # 超时也继续 —— 弹框可能只是 hidden 但 DOM 还在
                pass

            # 确认 Hold on 弹框消失
            try:
                dlg.first.wait_for(state="hidden", timeout=2000)
            except Exception:
                pass

            self.log("    ✓ Hold on 弹框已关闭")
        except Exception as e:
            self.log(f"    关闭 Hold on 弹框时出错（可忽略）: {e}")

    def run_one(self, shipment_id: str):
        """对单个 shipment_id 跑完整个流程：Hold on → In box → 读 Weight → 填 → Confirm → Proceed"""
        self.log(f"\n{'─'*40}\n▶ 处理 shipment_id = {shipment_id}\n{'─'*40}")

        # 1. 点 Hold on → action.html
        # 不限制 #open_boxes_table / #consolidating_table —— 直接用唯一的 checkbox value 定位
        self.log("[1/5] 点击 Hold on ...")
        self.page.wait_for_selector(f".check_id[value='{shipment_id}']", state="visible")
        link = self.page.locator(
            f"tr:has(.check_id[value='{shipment_id}']) a:has-text('Hold on')"
        )
        link.wait_for(state="visible")
        with self.page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
            link.click()
        self.log(f"    ✓ 跳转到 {self.page.url}")

        # 1.5 如果页面自动弹出 Hold on 弹框，先关掉
        self._close_hold_on_dialog()

        # 2. Finish packing 弹框：Consolidating 路径自动弹出，Open Boxes 需点 In box
        self.log("[2/5] 等待 Finish packing 弹框 ...")
        # 只取可见的那个（可能有残留的隐藏弹框 DOM，导致 strict mode 冲突）
        fp_dialog = self.page.locator(".ui-dialog:visible").filter(has_text="Finish packing")
        try:
            fp_dialog.first.wait_for(state="visible", timeout=3000)
            self.log("    ✓ 弹框已自动出现（Consolidating 路径）")
        except Exception:
            # 没自动弹 → Open Boxes 路径，需要点 In box 按钮
            self.log("    弹框未自动出现，尝试点 In box 按钮（Open Boxes 路径）...")

            # 先确保没有残留的 jQuery UI 遮罩层挡住点击
            try:
                self.page.wait_for_function(
                    "() => !document.querySelector('.ui-widget-overlay') || "
                    "document.querySelector('.ui-widget-overlay').offsetParent === null",
                    timeout=5000,
                )
            except Exception:
                self.log("    ⚠ 仍有遮罩层，尝试强制点击...")

            # 多策略尝试：button / a / input 都可能
            in_box_locators = [
                "#grid_table button:has-text('In box')",
                "#grid_table a:has-text('In box')",
                "#grid_table input[type='button'][value*='In box']",
                "#grid_table [class*='in-box']",
            ]
            clicked = False
            for sel in in_box_locators:
                loc = self.page.locator(sel).first
                try:
                    loc.wait_for(state="visible", timeout=3000)
                    loc.click(force=True)
                    clicked = True
                    self.log(f"    ✓ 用选择器 {sel} 点成功")
                    break
                except Exception:
                    continue

            if not clicked:
                shot_path = os.path.join(os.path.expanduser("~"), "pw_debug_inbox_fail.png")
                self.page.screenshot(path=shot_path, full_page=True)
                raise RuntimeError(
                    f"找不到 In box 按钮（已尝试 4 种选择器）。"
                    f"当前 URL: {self.page.url}，截图: {shot_path}"
                )

            # 等弹框出现
            fp_dialog.first.wait_for(state="visible", timeout=5000)
            self.log("    ✓ 弹框已打开")

        # 3. 读 Weight —— 扫描第一行所有单元格，找含 "lbs" 的那个（列序可能因路径不同）
        self.log("[3/5] 读取 Weight ...")
        row_cells = self.page.locator("#grid_table tbody tr:first-child td")
        n = row_cells.count()
        weight_lbs = None
        for i in range(n):
            txt = row_cells.nth(i).inner_text()
            try:
                weight_lbs = parse_lbs(txt)
                self.log(f"    ✓ 第 {i+1} 列 '{txt.strip()}' → {weight_lbs} lbs")
                break
            except ValueError:
                continue
        if not weight_lbs:
            raise RuntimeError(f"在 #grid_table 第一行 {n} 个单元格中未找到含 lbs 的 weight 值")

        # 4. 填 Weight —— 限定在可见的 Finish packing 弹框内（避免残留 DOM 冲突）
        self.log(f"[4/5] 填入 Weight = {weight_lbs} ...")
        inp = fp_dialog.locator("#weight_0")
        inp.wait_for(state="visible")
        inp.fill(weight_lbs)
        assert inp.input_value() == weight_lbs
        self.log(f"    ✓ 已填入")

        # 5. Confirm Weight → 等提示出现再消失（用原生 JS 检测可见弹框内的提示）
        self.log("[5/5] 点击 Confirm Weight ...")
        fp_dialog.get_by_role("button", name="Confirm Weight").click()
        fp_dialog.locator("#error_message").wait_for(state="attached", timeout=5000)

        # 原生 JS：找可见的 Finish packing 弹框内的 #error_message
        js_visible_dlg = (
            "() => {"
            "const dlgs = document.querySelectorAll('.ui-dialog');"
            "for (const d of dlgs) {"
            "  if (d.offsetParent !== null && d.textContent.includes('Finish packing')) {"
            "    const el = d.querySelector('#error_message');"
            "    if (el && el.classList.contains('display') && el.textContent.includes('Weight confirmed')) return true;"
            "  }"
            "}"
            "return false;"
            "}"
        )
        self.page.wait_for_function(js_visible_dlg, timeout=5000)
        self.log("    ✓ Weight confirmed 出现，等待自动消失 ...")

        js_wait_hide = (
            "() => {"
            "const dlgs = document.querySelectorAll('.ui-dialog');"
            "for (const d of dlgs) {"
            "  if (d.offsetParent !== null && d.textContent.includes('Finish packing')) {"
            "    const el = d.querySelector('#error_message');"
            "    if (el && el.classList.contains('display')) return false;"
            "    return true;"
            "  }"
            "}"
            "return true;"
            "}"
        )
        self.page.wait_for_function(js_wait_hide, timeout=8000)
        self.log("    ✓ 提示已消失")

        # 6. Proceed → 跳回列表页（自动，不再手动）
        self.log("[6/6] 点击 Proceed ...")
        with self.page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
            self.page.locator(".ui-dialog").filter(has_text="Finish packing").nth(0) \
                .get_by_role("button", name="Proceed").click()
        self.log(f"    ✓ 已跳回列表页: {self.page.url}")
        self.log(f"✅ shipment_id={shipment_id} 流程完成")


class ControlPanel:
    def __init__(self, root):
        self.root = root
        self.root.title("Shipment 自动化控制面板")
        self.root.geometry("600x680")
        self._topmost = False   # 默认不置顶
        self.runner = None
        self.phase = 0          # 0=未启动 1=浏览器已启动 2=列表页已打开 3=已获取ID
        self.id_buttons = {}    # shipment_id → tk.Button
        self.done_ids = set()
        self.last_source = ""   # "Open boxes" / "Consolidating"

        # 标题
        tk.Label(root, text="Open Boxes → Hold on → In box → Finish packing",
                 font=("Microsoft YaHei", 11, "bold"),
                 fg="#1565C0").pack(pady=(14, 2))
        tk.Label(root, text="启动浏览器 → 打开列表 → 获取 ID → 点某个 ID 自动跑完整流程",
                 font=("Microsoft YaHei", 9), fg="#666").pack(pady=(0, 10))

        # 基础按钮区（启动 / 打开列表）
        base_frame = tk.Frame(root)
        base_frame.pack(padx=20, pady=4, fill="x")
        self.btn_start = tk.Button(base_frame, text="① 启动浏览器", width=18, height=2,
                                   font=("Microsoft YaHei", 10),
                                   bg="#FFD54F", command=self.on_start)
        self.btn_start.grid(row=0, column=0, padx=6, pady=4, sticky="ew")
        self.btn_open = tk.Button(base_frame, text="② 打开 Open Shipment", width=18, height=2,
                                  font=("Microsoft YaHei", 10),
                                  bg="#F5F5F5", fg="#999", state="disabled",
                                  command=self.on_open_list)
        self.btn_open.grid(row=0, column=1, padx=6, pady=4, sticky="ew")
        base_frame.columnconfigure(0, weight=1)
        base_frame.columnconfigure(1, weight=1)

        # 获取 ID 按钮区（Open boxes / Consolidating 二选一）
        get_frame = tk.Frame(root)
        get_frame.pack(padx=20, pady=4, fill="x")
        self.btn_get_open = tk.Button(get_frame, text="③ 获取 Open Boxes ID", width=18, height=2,
                                      font=("Microsoft YaHei", 10),
                                      bg="#F5F5F5", fg="#999", state="disabled",
                                      command=lambda: self.on_get_ids("open"))
        self.btn_get_open.grid(row=0, column=0, padx=6, pady=4, sticky="ew")
        self.btn_get_consol = tk.Button(get_frame, text="③ 获取 Consolidating ID", width=18, height=2,
                                        font=("Microsoft YaHei", 10),
                                        bg="#F5F5F5", fg="#999", state="disabled",
                                        command=lambda: self.on_get_ids("consol"))
        self.btn_get_consol.grid(row=0, column=1, padx=6, pady=4, sticky="ew")
        get_frame.columnconfigure(0, weight=1)
        get_frame.columnconfigure(1, weight=1)

        # ID 按钮区
        self.id_label = tk.Label(root, text="Shipment ID（点击执行，完成后置灰）:",
                                 font=("Microsoft YaHei", 9), anchor="w")
        self.id_label.pack(anchor="w", padx=22, pady=(8, 2))
        self.id_frame = tk.Frame(root)
        self.id_frame.pack(padx=20, pady=2, fill="both", expand=True)

        # 结束按钮
        end_frame = tk.Frame(root)
        end_frame.pack(padx=20, pady=8, fill="x")
        tk.Button(end_frame, text="📌 置顶", width=10, height=1,
                  font=("Microsoft YaHei", 9),
                  bg="#E3F2FD", command=self.on_toggle_topmost).pack(side="left", padx=4)
        tk.Button(end_frame, text="✕ 关闭浏览器", width=14, height=1,
                  font=("Microsoft YaHei", 9),
                  bg="#FFCDD2", command=self.on_close).pack(side="left", padx=4)
        tk.Button(end_frame, text="↻ 重置进度", width=14, height=1,
                  font=("Microsoft YaHei", 9),
                  bg="#FFF9C4", command=self.on_reset).pack(side="right", padx=4)

        # 日志
        tk.Label(root, text="执行日志:", font=("Microsoft YaHei", 9),
                 anchor="w").pack(anchor="w", padx=22, pady=(8, 2))
        self.log_box = scrolledtext.ScrolledText(root, height=12,
                                                 font=("Consolas", 9),
                                                 bg="#1E1E1E", fg="#D4D4D4",
                                                 insertbackground="white")
        self.log_box.pack(padx=20, pady=(0, 12), fill="both", expand=True)

    def log(self, msg):
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.root.update_idletasks()

    # ---------- 三个基础按钮 ----------
    def on_start(self):
        try:
            self.runner = Runner(self.log)
            self.runner.start_browser()
            self.phase = 1
            self.btn_start.config(state="disabled", bg="#C8E6C9", fg="#2E7D32")
            self.btn_open.config(state="normal", bg="#FFD54F", fg="#000")
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            messagebox.showerror("失败", str(e))

    def on_open_list(self):
        try:
            self.runner.open_list()
            self.phase = 2
            self.btn_open.config(state="disabled", bg="#C8E6C9", fg="#2E7D32")
            self.btn_get_open.config(state="normal", bg="#FFD54F", fg="#000")
            self.btn_get_consol.config(state="normal", bg="#FFD54F", fg="#000")
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            messagebox.showerror("失败", str(e))

    def on_get_ids(self, source: str):
        """source: 'open' 或 'consol'"""
        try:
            if source == "open":
                ids = self.runner.get_open_boxes_ids()
                self.last_source = "Open boxes"
            else:
                ids = self.runner.get_consolidating_ids()
                self.last_source = "Consolidating"
            self.log(f"  ✓ 从 {self.last_source} 获取到 {len(ids)} 个 ID: {ids}")
            # 清空旧按钮
            for b in self.id_buttons.values():
                b.destroy()
            self.id_buttons.clear()
            self.done_ids.clear()
            # 更新标签
            self.id_label.config(text=f"Shipment ID — {self.last_source}（点击执行，完成后置灰）:")
            # 生成新按钮
            for i, sid in enumerate(ids):
                r, c = divmod(i, 3)
                b = tk.Button(self.id_frame, text=sid, width=12, height=1,
                              font=("Consolas", 10),
                              bg="#E3F2FD", fg="#000",
                              command=lambda s=sid: self.on_run_id(s))
                b.grid(row=r, column=c, padx=4, pady=3, sticky="ew")
                self.id_frame.columnconfigure(c, weight=1)
                self.id_buttons[sid] = b
            self.phase = 3
            if source == "open":
                self.btn_get_open.config(state="disabled", bg="#C8E6C9", fg="#2E7D32")
                self.btn_get_consol.config(state="normal", bg="#FFF9C4", fg="#000")
            else:
                self.btn_get_consol.config(state="disabled", bg="#C8E6C9", fg="#2E7D32")
                self.btn_get_open.config(state="normal", bg="#FFF9C4", fg="#000")
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            messagebox.showerror("失败", str(e))

    # ---------- 单个 ID 执行 ----------
    def on_run_id(self, shipment_id: str):
        # 双重 guard：已完成的 ID 永不执行
        if shipment_id in self.done_ids:
            return
        b = self.id_buttons.get(shipment_id)
        if not b or b["state"] == "disabled":
            return
        try:
            # 禁用所有未完成的 ID 按钮，防止并发（已完成的保持 disabled）
            for sid, btn in self.id_buttons.items():
                if sid not in self.done_ids:
                    btn.config(state="disabled")
            self.root.update_idletasks()

            self.runner.run_one(shipment_id)

            # 完整 6 步跑完 → 当前 ID 置灰，恢复其他未完成的
            self.done_ids.add(shipment_id)
            b.config(state="disabled", bg="#C8E6C9", fg="#2E7D32", text=f"{shipment_id} ✓")
            for sid, btn in self.id_buttons.items():
                if sid != shipment_id and sid not in self.done_ids:
                    btn.config(state="normal")
            self.log(f"\n✅ 完成 {len(self.done_ids)}/{len(self.id_buttons)} 个 ID")
        except Exception as e:
            import traceback
            self.log(f"  ✗ shipment_id={shipment_id} 失败: {e}")
            self.log(traceback.format_exc())
            messagebox.showerror(f"shipment_id={shipment_id} 失败", str(e))
            # 恢复未完成的 ID 按钮（已完成的继续保持 disabled）
            for sid, btn in self.id_buttons.items():
                if sid not in self.done_ids:
                    btn.config(state="normal")

    def on_toggle_topmost(self):
        self._topmost = not self._topmost
        self.root.attributes("-topmost", self._topmost)
        self.log(f"控制面板置顶: {'ON' if self._topmost else 'OFF'}")

    def on_close(self):
        if self.runner:
            try: self.runner.close()
            except Exception: pass
        self.root.destroy()

    def on_reset(self):
        # 清 UI 状态，但保留 runner（浏览器和登录态不丢）
        self.phase = 0
        self.done_ids.clear()
        self.last_source = ""
        self.current_shipment_id = None
        for b in self.id_buttons.values():
            b.destroy()
        self.id_buttons.clear()
        self.id_label.config(text="Shipment ID（点击执行，完成后置灰）:")
        self.btn_start.config(state="disabled", bg="#C8E6C9", fg="#2E7D32")
        self.btn_open.config(state="normal" if self.runner else "disabled",
                             bg="#FFD54F" if self.runner else "#F5F5F5",
                             fg="#000" if self.runner else "#999")
        self.btn_get_open.config(state="disabled", bg="#F5F5F5", fg="#999")
        self.btn_get_consol.config(state="disabled", bg="#F5F5F5", fg="#999")
        # 如果 runner 存在，把 page 跳回列表页（方便重新开始）
        if self.runner:
            self.runner.save_state()  # 顺便保存一下 cookie
            try:
                self.runner.page.goto(f"{BASE_URL}{OPEN_LIST_PATH}", wait_until="domcontentloaded")
            except Exception:
                pass
        self.log("--- 已重置（浏览器保持打开） ---")


if __name__ == "__main__":
    root = tk.Tk()
    app = ControlPanel(root)
    root.mainloop()
