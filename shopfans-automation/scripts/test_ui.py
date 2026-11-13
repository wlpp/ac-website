# -*- coding: utf-8 -*-
r"""
控制面板 UI 状态机测试（无头 tkinter，不进 mainloop，不启动浏览器）

验证:
  1. 公共按钮 command 绑定（启动/重置/关闭/置顶）
  2. 点击启动浏览器 → 完成态样式 + 模块按钮启用
  3. 置顶切换
  4. 重置点击生效
  5. 关闭浏览器点击生效

运行:
  cd e:/myWork/project/ac-website/shopfans-automation
  ..\.venv\Scripts\python.exe scripts\test_ui.py
"""
import sys
from pathlib import Path

# 让 scripts/ 也能 import 项目根下的模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import tkinter as tk
from main import MainApp


class FakeRunner:
    """替换真实 Runner，只记录调用，不启动浏览器"""

    def __init__(self):
        self.page = None
        self.calls = []

    def start_browser(self):
        self.calls.append("start_browser")
        self.page = object()

    def save_state(self):
        self.calls.append("save_state")

    def close(self):
        self.calls.append("close")


def run() -> int:
    root = tk.Tk()
    root.withdraw()
    app = MainApp(root)

    fake = FakeRunner()
    app.runner = fake
    panel = app.modules["Shipment Finish Packing"]
    panel.runner = fake   # 真实运行时 app 与 panel 共享同一 runner

    # 1. command 绑定检查
    assert app.btn_start["command"], "btn_start 缺少 command"
    assert app.btn_reset["command"], "btn_reset 缺少 command"
    assert app.btn_close["command"], "btn_close 缺少 command"
    assert app._top_btn["command"], "_top_btn 缺少 command"
    print("1. 四个公共按钮 command 绑定 ✓")

    # 2. 启动浏览器
    app.btn_start.invoke()
    assert "start_browser" in fake.calls
    assert str(app.btn_start["state"]) == "disabled"
    assert app.btn_start["text"] == "✓ 浏览器已启动"
    assert app.btn_start["bg"] == "#E6F4EA" and app.btn_start["fg"] == "#1E8E3E"
    print("2. 启动浏览器点击生效 + 完成态样式 ✓")

    # 3. 浏览器启动后模块按钮联动
    assert str(panel.btn_open_list["state"]) == "normal"
    assert str(panel.btn_get_open["state"]) == "disabled"
    print("3. 浏览器启动后模块按钮状态 ✓")

    # 4. 置顶切换
    app._top_btn.invoke()
    assert app._topmost is True and app._top_btn["text"] == "📌 已置顶"
    app._top_btn.invoke()
    assert app._topmost is False and app._top_btn["text"] == "📌 置顶"
    print("4. 置顶切换 ✓")

    # 5. 重置（浏览器存活 → ① 恢复可点）
    app.btn_reset.invoke()
    assert "save_state" in fake.calls
    assert str(panel.btn_open_list["state"]) == "normal"
    assert panel.btn_open_list["text"] == "① 打开 Open Shipment"
    print("5. 重置点击生效 ✓")

    # 6. 关闭浏览器（不真正销毁窗口）
    destroyed = []
    app.root.destroy = lambda: destroyed.append(1)
    app.btn_close.invoke()
    assert "close" in fake.calls and destroyed == [1]
    print("6. 关闭浏览器点击生效 ✓")

    root.destroy()
    print("\n=== UI 状态机测试全部通过 ===")
    return 0


if __name__ == "__main__":
    sys.exit(run())
