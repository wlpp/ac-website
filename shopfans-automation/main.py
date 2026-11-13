# -*- coding: utf-8 -*-
r"""
Shopfans 自动化控制面板 — 多模块入口

运行:
  cd e:/myWork/project/ac-website/shopfans-automation
  ..\.venv\Scripts\python.exe main.py

模块注册:
  在 MODULES 列表里追加新的 ModulePanel 子类即可。
  每个模块自己 build_ui(tab_frame) 放自己的控件，共享同一个 Runner（一个 Chrome）。
"""
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox

from modules.shipment_finish import ShipmentFinishRunner, ShipmentFinishPanel
from modules import theme
from modules.theme import C, FONT, FONT_B, FONT_TITLE, FONT_SUB, FONT_MONO_S


# ===== 模块注册（加新模块在这里追加）=====
MODULES = [
    ShipmentFinishPanel,
    # 后续追加: OtherModulePanel, AnotherModulePanel, ...
]


class MainApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Shopfans 自动化控制面板")
        self.root.geometry("660x760")
        self.root.configure(bg=C["bg"])
        self._topmost = False
        self._top_btn = None

        theme.apply_ttk_style(root)

        # 共享 Runner —— 当前只有 shipment 模块，用 ShipmentFinishRunner
        self.runner = ShipmentFinishRunner(log=self.log)
        self.modules = {}   # MODULE_TITLE → ModulePanel 实例

        # ---------- 顶部标题栏 ----------
        head = tk.Frame(root, bg=C["primary"], height=52)
        head.pack(fill="x")
        head.pack_propagate(False)
        tk.Label(head, text="⭐ Shopfans 自动化", font=FONT_TITLE,
                 bg=C["primary"], fg="#FFFFFF").pack(side="left", padx=(16, 4), pady=10)
        tk.Label(head, text="v1.0", font=FONT_SUB,
                 bg=C["primary"], fg="#C6DAFB").pack(side="left", pady=14)

        # ---------- Notebook（模块 Tab）----------
        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill="both", expand=True, padx=12, pady=(10, 6))

        for mod_cls in MODULES:
            tab_frame = tk.Frame(self.notebook, bg=C["card"])
            self.notebook.add(tab_frame, text=mod_cls.MODULE_TITLE)
            panel = mod_cls(runner=self.runner, log_func=self.log)
            panel.build_ui(tab_frame)
            self.modules[mod_cls.MODULE_TITLE] = panel

        # ---------- 公共按钮条 ----------
        bar = tk.Frame(root, bg=C["card"], highlightbackground=C["border"],
                       highlightthickness=1)
        bar.pack(fill="x", padx=12, pady=(0, 6), ipady=8)

        self.btn_start = theme.make_button(bar, "① 启动浏览器（所有模块共用）",
                                           kind="primary", font=FONT_B, height=1,
                                           command=self.on_start_browser)
        self.btn_start.pack(side="left", padx=(12, 6), ipadx=10)
        self.btn_start.bind("<Enter>", lambda e: None)   # 主按钮保持原 hover

        self.btn_reset = theme.make_button(bar, "↻ 重置当前模块", kind="ghost",
                                           command=self.on_reset)
        self.btn_reset.pack(side="right", padx=6)

        self.btn_close = theme.make_button(bar, "✕ 关闭浏览器", kind="danger",
                                           command=self.on_close)
        self.btn_close.pack(side="right", padx=6)

        self._top_btn = theme.make_button(bar, "📌 置顶", kind="ghost", width=8,
                                          command=self.on_toggle_topmost)
        self._top_btn.pack(side="right", padx=6)

        # ---------- 公共日志区 ----------
        log_head = tk.Frame(root, bg=C["bg"])
        log_head.pack(fill="x", padx=14)
        tk.Label(log_head, text="执行日志", font=FONT_B, bg=C["bg"],
                 fg=C["text"]).pack(side="left")
        self.log_box = scrolledtext.ScrolledText(
            root, height=9, font=FONT_MONO_S,
            bg="#1E2430", fg="#C9D1D9", insertbackground="#FFFFFF",
            relief="flat", bd=0, padx=10, pady=8,
            highlightbackground=C["border"], highlightthickness=1)
        self.log_box.pack(padx=12, pady=(4, 12), fill="both", expand=True)

    # ---------- 公共方法 ----------
    def log(self, msg: str):
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.root.update_idletasks()

    def _current_panel(self):
        title = self.notebook.tab(self.notebook.select(), "text")
        return self.modules.get(title)

    # ---------- 公共按钮回调 ----------
    def on_start_browser(self):
        try:
            self.runner.start_browser()
            self.btn_start.config(state="disabled", bg=C["ok_bg"], fg=C["ok"],
                                  text="✓ 浏览器已启动")
            for panel in self.modules.values():
                if hasattr(panel, "on_browser_started"):
                    panel.on_browser_started()
        except Exception as e:
            import traceback
            self.log(f"  ✗ {e}")
            self.log(traceback.format_exc())
            messagebox.showerror("启动浏览器失败", str(e))

    def on_toggle_topmost(self):
        self._topmost = not self._topmost
        self.root.attributes("-topmost", self._topmost)
        if self._top_btn:
            self._top_btn.config(text="📌 已置顶" if self._topmost else "📌 置顶")
        self.log(f"控制面板置顶: {'ON' if self._topmost else 'OFF'}")

    def on_reset(self):
        panel = self._current_panel()
        if panel and hasattr(panel, "on_reset_ui"):
            panel.on_reset_ui()

    def on_close(self):
        self.runner.close()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = MainApp(root)
    root.mainloop()
