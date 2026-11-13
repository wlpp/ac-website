# -*- coding: utf-8 -*-
r"""
shipment 自动化测试 — Open Boxes → Hold on → In box → Finish packing 完整流程
当前流程: shipment_id=910001 单点验证，后续可扩展批量循环

运行:
  cd e:/myWork/project/ac-website/shopfans-automation
  ..\..\.venv\Scripts\python.exe scripts\single_finish_packing.py
或:
  ..\..\.venv\Scripts\python.exe -m pytest scripts\single_finish_packing.py -v -s
"""
import re
import time
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

BASE_URL = "http://localhost:8766"
SHIPMENT_ID = "910001"   # 当前测试的 shipment_id
STEP_DELAY = 2.0         # 每步之间的延迟（秒），调大看得更清楚
PAUSE_AT_END = True      # 流程结束后是否暂停等你按 Enter 再关浏览器


def parse_lbs(raw: str) -> str:
    """grid_table Weight 列格式: '0.4 lbs / 0.16 kg' → '0.4'"""
    m = re.search(r"([\d.]+)\s*lbs", raw)
    if not m:
        raise ValueError(f"无法从 '{raw}' 解析 lbs 值")
    return m.group(1)


def wait_for_toast(page, text_substr: str, timeout: int = 5000, vanish: bool = True) -> None:
    """
    等一个包含 text_substr 的 toast 出现；如果 vanish=True，再等它消失（最多 timeout ms）。
    toast 容器: #float-messages 内部 div
    """
    toast_sel = f"#float-messages .toast-msg:has-text('{text_substr}')"
    page.wait_for_selector(toast_sel, timeout=timeout)
    if vanish:
        page.wait_for_selector(
            toast_sel,
            state="hidden",
            timeout=timeout,
        )


def wait_for_error_message(page, text: str = "Weight confirmed",
                           appear_timeout: int = 5000,
                           vanish_timeout: int = 0) -> None:
    """
    #error_message 提示：出现 → 消失。
      vanish_timeout = 0  → 只等出现（等待 text 填入 + .display class 加上）
      vanish_timeout > 0  → 只等消失（等待 .display class 被移除 + text 清空）
    """
    if vanish_timeout == 0:
        # 等出现
        err = page.locator(f"#error_message:has-text('{text}')")
        err.wait_for(state="visible", timeout=appear_timeout)
        classes = err.get_attribute("class") or ""
        assert "display" in classes, f"#error_message 没加 .display class: {classes!r}"
    else:
        # 等消失 —— .display class 被移除（Proceed 按钮里做了这件事）
        page.wait_for_function(
            "() => {"
            "  const el = document.querySelector('#error_message');"
            "  if (!el) return true;"
            "  return !el.classList.contains('display') && el.textContent.trim() === '';"
            "}",
            timeout=vanish_timeout,
        )


def test_finish_packing_flow():
    with sync_playwright() as p:
        # 用系统 Chrome（避免下载 Playwright 自带 Chromium）
        chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        browser = p.chromium.launch(executable_path=chrome_exe, headless=False)
        context = browser.new_context()
        page = context.new_page()

        try:
            # ============ Step 1: 打开 Open Shipment 列表页 ============
            print(f"[1] 打开 {BASE_URL}/index.html")
            page.goto(f"{BASE_URL}/index.html", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            assert "Open Shipment" in page.title() or "Open Shipment" in page.url, \
                f"页面标题不对: {page.title()}"
            print("    ✓ Open Shipment 列表页加载完成")

            # ============ Step 2: 找到 shipment_id=910001 的 Hold on 链接并点击 ============
            print(f"[2] 点击 shipment_id={SHIPMENT_ID} 那行的 Hold on")
            # Open boxes 表格里，每行的 checkbox.value = shipment_id
            row_checkbox = page.locator(
                f"#open_boxes_table .check_id[value='{SHIPMENT_ID}']"
            )
            row_checkbox.wait_for(state="visible", timeout=5000)

            # Hold on 链接在同一行里，href 以 action.html?shipment_id= 开头
            hold_on_link = page.locator(
                f"#open_boxes_table tr:has(.check_id[value='{SHIPMENT_ID}']) a:has-text('Hold on')"
            )
            hold_on_link.wait_for(state="visible")
            with page.expect_navigation(wait_until="domcontentloaded", timeout=10000):
                hold_on_link.click()
            print(f"    ✓ 跳转到 {page.url}")

            # ============ Step 3: 点击 Order Contents 里的 In box 按钮 ============
            print("[3] 点击 In box 按钮 → 打开 Finish packing 弹框")
            page.wait_for_selector("#grid_table button:has-text('In box')", state="visible")
            page.locator("#grid_table button:has-text('In box')").click()
            print("    ✓ Finish packing 弹框已打开")

            # ============ Step 4: 从页面读取 Weight 值（动态，不写死）============
            print("[4] 从 Order Contents 表格读取 Weight 值")
            weight_cell = page.locator("#grid_table tbody tr:first-child td").nth(3)
            weight_text = weight_cell.inner_text()  # 例如 "0.4 lbs / 0.16 kg"
            expected_lbs = parse_lbs(weight_text)
            print(f"    ✓ 页面读取 Weight 列原文: '{weight_text}' → 提取 lbs = {expected_lbs}")

            # ============ Step 5: 填入 Weight 输入框 ============
            print(f"[5] 向 #weight_0 输入框填入 {expected_lbs}")
            weight_input = page.locator("#weight_0")
            weight_input.wait_for(state="visible")
            weight_input.fill(expected_lbs)
            actual = weight_input.input_value()
            assert actual == expected_lbs, f"填入后值不对: 期望 {expected_lbs} 实际 {actual}"
            print(f"    ✓ 已填入，确认值 = {actual}")

            # ============ Step 6: 点击 Confirm Weight，等 #error_message 出现 ============
            print("[6] 点击 Confirm Weight")
            page.get_by_role("button", name="Confirm Weight").click()
            print("    等待 #error_message 出现 'Weight confirmed'...")
            wait_for_error_message(page, text="Weight confirmed",
                                   appear_timeout=5000, vanish_timeout=0)  # 只等出现
            print("    ✓ #error_message 已出现，已带 .display class")

            # ============ Step 7: 点击 Proceed → #error_message 消失 + 弹框关闭 ============
            print("[7] 点击 Proceed 按钮")
            page.get_by_role("button", name="Proceed").click()
            print("    等待 #error_message 消失...")
            wait_for_error_message(page, text="Weight confirmed",
                                   appear_timeout=3000, vanish_timeout=5000)   # 等 .display class 被移除
            print("    ✓ #error_message 已消失 (.display 已移除)")

            # 验证弹框关闭 + Proceed toast 出现
            page.wait_for_selector(".ui-dialog", state="hidden", timeout=3000)
            wait_for_toast(page, "Proceed", timeout=5000, vanish=False)
            print("    ✓ Finish packing 弹框已关闭，Proceed toast 已出现")

            print(f"\n{'='*50}")
            print(f"  流程完成 ✅  shipment_id={SHIPMENT_ID}  weight={expected_lbs} lbs")
            if PAUSE_AT_END:
                input("")
            print(f"{'='*50}")

        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    test_finish_packing_flow()
