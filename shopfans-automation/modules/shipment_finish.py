# -*- coding: utf-8 -*-
r"""
Shipment Finish Packing 模块

流程: 启动浏览器 → 打开 Open Shipment → 获取 Open Boxes/Consolidating 的所有 ID
      → 点击某个 ID 自动跑完整流程（Hold on → In box → 读 Weight → 填 → Confirm → Proceed）
      → 完成的 ID 按钮置灰

运行（通过 main.py）:
  cd e:/myWork/project/ac-website/shopfans-automation
  ..\.venv\Scripts\python.exe main.py
"""
import os
import re
import time
import tkinter as tk
from modules.base import BaseRunner, BaseModulePanel
from modules import theme
from modules.theme import C, FONT_SUB


# ===== 模块配置 =====
BASE_URL = "https://app.shopfans.com"
OPEN_LIST_PATH = "/admin/shipment/open.html"


def parse_lbs(raw: str) -> str:
    m = re.search(r"([\d.]+)\s*lbs", raw)
    if not m:
        raise ValueError(f"cannot parse lbs from '{raw}'")
    return m.group(1)


class ShipmentFinishRunner(BaseRunner):
    """Shipment Finish Packing 的 Playwright 业务方法"""

    def open_list(self):
        url = f"{BASE_URL}{OPEN_LIST_PATH}"
        # 复用基类 open_page（登录检测 + URL 关键词校验 + 保存 cookie）
        self.open_page(url, url_keyword="shipment")

    def get_ids(self, table_selector: str) -> list:
        """从指定表格读取所有 shipment_id —— 自动遍历 DataTables 分页"""
        all_ids = []
        page_num = 0
        max_pages = 50

        while page_num < max_pages:
            ids = self.page.eval_on_selector_all(
                f"{table_selector} .check_id",
                "els => els.map(e => e.value).filter(Boolean)"
            )
            new_ids = [i for i in ids if i not in all_ids]
            all_ids.extend(new_ids)
            self.log(f"    第 {page_num+1} 页: 本页 {len(ids)} 条 (+{len(new_ids)} 新)")

            # 找 DataTables wrapper 里的 Next 按钮
            wrapper = self.page.locator(table_selector).locator(
                "xpath=ancestor::*[contains(@class,'dataTables_wrapper')]"
            ).first
            next_btn = wrapper.locator(".dataTables_paginate .paginate_button.next")
            try:
                next_btn.wait_for(state="attached", timeout=1000)
                cls = next_btn.get_attribute("class") or ""
                if "disabled" in cls:
                    break
                next_btn.click()
                page_num += 1
                self.page.wait_for_function(
                    f"() => document.querySelectorAll('{table_selector} .check_id').length > 0",
                    timeout=5000,
                )
                time.sleep(0.5)
            except Exception:
                break

        self.log(f"    ✓ 共获取 {len(all_ids)} 个 ID（{page_num+1} 页）")
        return all_ids

    def get_open_boxes_ids(self) -> list:
        return self.get_ids("#open_boxes_table")

    def get_consolidating_ids(self) -> list:
        return self.get_ids("#consolidating_table")

    def _close_hold_on_dialog(self):
        try:
            self.page.wait_for_load_state("networkidle", timeout=8000)
            time.sleep(1)
            # 只匹配可见的 .ui-dialog —— 本地页有隐藏的 #form_reason 模板（autoOpen:false），
            # 若不加 :visible 会误判为弹框并尝试关闭隐藏元素，导致 3s+5s 超时等待
            dlg = self.page.locator(".ui-dialog:visible").filter(has_text="The reason why")
            count = dlg.count()
            self.log(f"    检测到 {count} 个含 'The reason why' 的 .ui-dialog")
            if count == 0:
                self.log("    （无 Hold on 弹框，跳过）")
                return
            try:
                dlg.first.locator(".ui-dialog-titlebar-close").wait_for(state="visible", timeout=3000)
                dlg.first.locator(".ui-dialog-titlebar-close").click()
            except Exception:
                try:
                    dlg.first.get_by_role("button", name="CANCEL").click()
                except Exception:
                    pass
            try:
                self.page.wait_for_function(
                    "() => document.querySelectorAll('.ui-dialog').length",
                    predicate=lambda cnt: cnt <= 1,
                    timeout=5000,
                )
            except Exception:
                pass
            try:
                dlg.first.wait_for(state="hidden", timeout=2000)
            except Exception:
                pass
            self.log("    ✓ Hold on 弹框已关闭")
        except Exception as e:
            self.log(f"    关闭 Hold on 弹框时出错（可忽略）: {e}")

    def run_one(self, shipment_id: str):
        """对单个 shipment_id 跑完整个 6 步流程"""
        self.log(f"\n{'─'*40}\n▶ 处理 shipment_id = {shipment_id}\n{'─'*40}")

        # 1. 点 Hold on
        self.log("[1/6] 点击 Hold on ...")
        self.page.wait_for_selector(f".check_id[value='{shipment_id}']", state="visible")
        link = self.page.locator(
            f"tr:has(.check_id[value='{shipment_id}']) a:has-text('Hold on')"
        )
        link.wait_for(state="visible")
        with self.page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
            link.click()
        self.log(f"    ✓ 跳转到 {self.page.url}")

        # 1.5 关 Hold on 弹框
        self._close_hold_on_dialog()

        # 2. Finish packing 弹框（Consolidating 自动弹 / Open Boxes 需点 In box）
        self.log("[2/6] 等待 Finish packing 弹框 ...")
        fp_dialog = self.page.locator(".ui-dialog:visible").filter(has_text="Finish packing")
        try:
            fp_dialog.first.wait_for(state="visible", timeout=3000)
            self.log("    ✓ 弹框已自动出现（Consolidating 路径）")
        except Exception:
            self.log("    弹框未自动出现，尝试点 In box 按钮（Open Boxes 路径）...")
            try:
                self.page.wait_for_function(
                    "() => !document.querySelector('.ui-widget-overlay') || "
                    "document.querySelector('.ui-widget-overlay').offsetParent === null",
                    timeout=5000,
                )
            except Exception:
                self.log("    ⚠ 仍有遮罩层，尝试强制点击...")
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
                    f"找不到 In box 按钮。当前 URL: {self.page.url}，截图: {shot_path}"
                )
            fp_dialog.first.wait_for(state="visible", timeout=5000)
            self.log("    ✓ 弹框已打开")

        # 3. 读 Weight
        self.log("[3/6] 读取 Weight ...")
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

        # 4. 填 Weight
        self.log(f"[4/6] 填入 Weight = {weight_lbs} ...")
        inp = fp_dialog.locator("#weight_0")
        inp.wait_for(state="visible")
        inp.fill(weight_lbs)
        assert inp.input_value() == weight_lbs
        self.log(f"    ✓ 已填入")

        # 5. Confirm Weight → 等提示出现再消失
        self.log("[5/6] 点击 Confirm Weight ...")
        fp_dialog.get_by_role("button", name="Confirm Weight").click()
        fp_dialog.locator("#error_message").wait_for(state="attached", timeout=5000)

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

        # 6. Proceed → 跳回列表页
        self.log("[6/6] 点击 Proceed ...")
        with self.page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
            self.page.locator(".ui-dialog").filter(has_text="Finish packing").nth(0) \
                .get_by_role("button", name="Proceed").click()
        self.log(f"    ✓ 已跳回列表页: {self.page.url}")
        self.log(f"✅ shipment_id={shipment_id} 流程完成")


class ShipmentFinishPanel(BaseModulePanel):
    """Shipment Finish Packing 的 Tkinter UI"""

    MODULE_TITLE = "Shipment Finish Packing"
    MODULE_SUBTITLE = "Open Boxes → Hold on → In box → Finish packing"

    def __init__(self, runner, log_func):
        super().__init__(runner, log_func)
        self.phase = 0
        self.id_buttons = {}
        self.done_ids = set()
        self.last_source = ""

    def build_ui(self, parent: tk.Frame):
        self.frame = parent
        # 标题
        tk.Label(parent, text=self.MODULE_TITLE,
                 font=("Microsoft YaHei", 12, "bold"),
                 fg=C["primary"], bg=C["card"]).pack(pady=(14, 1))
        tk.Label(parent, text=self.MODULE_SUBTITLE,
                 font=FONT_SUB, fg=C["muted"], bg=C["card"]).pack(pady=(0, 10))

        # ① 打开 Open Shipment
        base_frame = tk.Frame(parent, bg=C["card"])
        base_frame.pack(padx=24, pady=4, fill="x")
        self.btn_open_list = theme.make_button(
            base_frame, "① 打开 Open Shipment", kind="action", height=1,
            command=self.on_open_list)
        self.btn_open_list.grid(row=0, column=0, padx=6, pady=4, sticky="ew")
        theme.set_enabled(self.btn_open_list, False, "action")   # 浏览器没启动时禁用
        base_frame.columnconfigure(0, weight=1)

        # ③ 获取 ID
        get_frame = tk.Frame(parent, bg=C["card"])
        get_frame.pack(padx=24, pady=4, fill="x")
        self.btn_get_open = theme.make_button(
            get_frame, "③ 获取 Open Boxes ID", kind="action", height=1,
            state="disabled", command=lambda: self.on_get_ids("open"))
        self.btn_get_open.grid(row=0, column=0, padx=6, pady=4, sticky="ew")
        self.btn_get_consol = theme.make_button(
            get_frame, "③ 获取 Consolidating ID", kind="action", height=1,
            state="disabled", command=lambda: self.on_get_ids("consol"))
        self.btn_get_consol.grid(row=0, column=1, padx=6, pady=4, sticky="ew")
        theme.set_enabled(self.btn_get_open, False, "action")
        theme.set_enabled(self.btn_get_consol, False, "action")
        get_frame.columnconfigure(0, weight=1)
        get_frame.columnconfigure(1, weight=1)

        # ID 按钮区
        self.id_label = tk.Label(parent, text="Shipment ID（点击执行，完成后置灰）:",
                                 font=FONT_SUB, anchor="w", bg=C["card"], fg=C["muted"])
        self.id_label.pack(anchor="w", padx=26, pady=(10, 2))
        self.id_frame = tk.Frame(parent, bg=C["card"])
        self.id_frame.pack(padx=24, pady=2, fill="both", expand=True)

        # 保存 frame 引用给 on_reset_ui 用
        self._base_frame = base_frame
        self._get_frame = get_frame

    # ---------- 被 main.py 调用的生命周期 ----------
    def on_browser_started(self):
        """main.py 在浏览器启动后调用 —— 启用 ② 按钮"""
        theme.set_enabled(self.btn_open_list, True, "action")

    # ---------- 按钮回调 ----------
    def on_open_list(self):
        try:
            self.runner.open_list()
            self.phase = 2
            theme.set_enabled(self.btn_open_list, False, "action", done=True)
            self.btn_open_list.config(text="✓ Open Shipment 已打开")
            theme.set_enabled(self.btn_get_open, True, "action")
            theme.set_enabled(self.btn_get_consol, True, "action")
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            from tkinter import messagebox
            messagebox.showerror("失败", str(e))

    def on_get_ids(self, source: str):
        try:
            runner: ShipmentFinishRunner = self.runner
            if source == "open":
                ids = runner.get_open_boxes_ids()
                self.last_source = "Open boxes"
            else:
                ids = runner.get_consolidating_ids()
                self.last_source = "Consolidating"
            self.log(f"  ✓ 从 {self.last_source} 获取到 {len(ids)} 个 ID: {ids}")

            for b in self.id_buttons.values():
                b.destroy()
            self.id_buttons.clear()
            self.done_ids.clear()
            self.id_label.config(text=f"Shipment ID — {self.last_source}（点击执行，完成后置灰）:",
                                 fg=C["text"])

            for i, sid in enumerate(ids):
                r, c = divmod(i, 3)
                b = theme.make_button(self.id_frame, text=sid, kind="ghost",
                                      width=12, height=1, mono=True,
                                      command=lambda s=sid: self.on_run_id(s))
                b.grid(row=r, column=c, padx=5, pady=4, sticky="ew")
                self.id_frame.columnconfigure(c, weight=1)
                self.id_buttons[sid] = b

            self.phase = 3
            if source == "open":
                theme.set_enabled(self.btn_get_open, False, "action", done=True)
                self.btn_get_open.config(text="✓ Open Boxes 已获取")
                theme.set_enabled(self.btn_get_consol, True, "action")
            else:
                theme.set_enabled(self.btn_get_consol, False, "action", done=True)
                self.btn_get_consol.config(text="✓ Consolidating 已获取")
                theme.set_enabled(self.btn_get_open, True, "action")
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            from tkinter import messagebox
            messagebox.showerror("失败", str(e))

    def on_run_id(self, shipment_id: str):
        if shipment_id in self.done_ids:
            return
        b = self.id_buttons.get(shipment_id)
        if not b or b["state"] == "disabled":
            return
        try:
            for sid, btn in self.id_buttons.items():
                if sid not in self.done_ids:
                    btn.config(state="disabled")
            self.frame.update_idletasks()

            self.runner.run_one(shipment_id)

            self.done_ids.add(shipment_id)
            theme.set_enabled(b, False, "action", done=True)
            b.config(text=f"{shipment_id} ✓")
            for sid, btn in self.id_buttons.items():
                if sid != shipment_id and sid not in self.done_ids:
                    theme.set_enabled(btn, True, "ghost")
            self.log(f"\n✅ 完成 {len(self.done_ids)}/{len(self.id_buttons)} 个 ID")
        except Exception as e:
            import traceback
            self.log(f"  ✗ shipment_id={shipment_id} 失败: {e}")
            self.log(traceback.format_exc())
            from tkinter import messagebox
            messagebox.showerror(f"shipment_id={shipment_id} 失败", str(e))
            for sid, btn in self.id_buttons.items():
                if sid not in self.done_ids:
                    theme.set_enabled(btn, True, "ghost")

    def on_reset_ui(self):
        self.phase = 0
        self.done_ids.clear()
        self.last_source = ""
        for b in self.id_buttons.values():
            b.destroy()
        self.id_buttons.clear()
        self.id_label.config(text="Shipment ID（点击执行，完成后置灰）:", fg=C["muted"])
        # 浏览器还活着 → ② 按钮恢复
        browser_alive = self.runner and self.runner.page is not None
        self.btn_open_list.config(text="① 打开 Open Shipment")
        theme.set_enabled(self.btn_open_list, browser_alive, "action")
        self.btn_get_open.config(text="③ 获取 Open Boxes ID")
        theme.set_enabled(self.btn_get_open, False, "action")
        self.btn_get_consol.config(text="③ 获取 Consolidating ID")
        theme.set_enabled(self.btn_get_consol, False, "action")
        # 跳回列表页
        if browser_alive:
            self.runner.save_state()
            try:
                self.runner.page.goto(f"{BASE_URL}{OPEN_LIST_PATH}", wait_until="domcontentloaded")
            except Exception:
                pass
        self.log("--- 已重置（浏览器保持打开） ---")
