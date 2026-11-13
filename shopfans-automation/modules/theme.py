# -*- coding: utf-8 -*-
"""UI 主题 — 统一配色 / 字体 / 按钮 hover / ttk 样式（零第三方依赖）"""
import tkinter as tk
from tkinter import ttk

# ---------- 配色体系 ----------
C = {
    "bg":        "#F4F6F9",   # 面板底色
    "card":      "#FFFFFF",   # 卡片
    "border":    "#DFE3E8",   # 边框
    "text":      "#24292F",   # 主文字
    "muted":     "#6B7280",   # 次要文字

    "primary":   "#1A73E8",   # 主操作（蓝）
    "primary_h": "#1667C9",   # 主操作 hover
    "action":    "#F9AB00",   # 执行操作（琥珀）
    "action_h":  "#E89B00",
    "ok":        "#1E8E3E",   # 成功（绿）
    "ok_bg":     "#E6F4EA",
    "ok_h":      "#34A853",
    "disabled":  "#E9EBEE",
    "muted_fg":  "#9AA0A6",
    "danger":    "#EA4335",   # 危险（红）
    "danger_h":  "#D93025",
    "ghost":     "#FFFFFF",   # 普通按钮
    "ghost_h":   "#E8EAED",
    "warn_bg":   "#FEF7E0",   # 提示底
}

FONT = ("Microsoft YaHei", 10)
FONT_B = ("Microsoft YaHei", 10, "bold")
FONT_TITLE = ("Microsoft YaHei", 13, "bold")
FONT_SUB = ("Microsoft YaHei", 9)
FONT_MONO = ("Consolas", 10)
FONT_MONO_S = ("Consolas", 9)

# kind → (normal_bg, hover_bg, fg)
_KINDS = {
    "primary": (C["primary"],  C["primary_h"], "#FFFFFF"),
    "action":  (C["action"],   C["action_h"],  "#3C2F00"),
    "ghost":   (C["ghost"],    C["ghost_h"],   C["text"]),
    "ok":      (C["ok_bg"],    C["ok_h"],      C["ok"]),
    "danger":  ("#FCE8E6",     C["danger_h"],  C["danger"]),
}


def make_button(parent, text, kind="ghost", command=None, width=None, height=None,
                state="normal", font=None, mono=False):
    """统一样式按钮（带 hover 效果）。disabled 状态自动置灰。"""
    bg, hbg, fg = _KINDS[kind]
    f = font or (FONT_MONO if mono else FONT)
    kw = dict(text=text, font=f, bg=bg, fg=fg, activebackground=hbg,
              activeforeground=fg, relief="flat", bd=0,
              cursor="hand2" if state == "normal" else "arrow",
              disabledforeground=C["muted_fg"])
    if width:
        kw["width"] = width
    if height:
        kw["height"] = height
    if command:
        kw["command"] = command   # 关键：绑定点击回调（此前被丢弃导致按钮无反应）
    btn = tk.Button(parent, state=state, **kw)
    if height:
        btn.configure(padx=14, pady=6)

    def _set_normal():
        btn.config(bg=bg, fg=fg, activebackground=hbg)

    def _enter(_):
        if str(btn["state"]) == "normal":
            btn.config(bg=hbg)

    def _leave(_):
        if str(btn["state"]) == "normal":
            btn.config(bg=bg)

    btn.bind("<Enter>", _enter)
    btn.bind("<Leave>", _leave)
    btn._restore_normal = _set_normal
    return btn


def set_enabled(btn, enabled=True, kind="ghost", done=False):
    """统一启用/禁用样式切换。

    enabled=False 且 done=True → 完成态（淡绿底 + 绿字，state 仍禁用）
    enabled=False 且 done=False → 灰色禁用态
    """
    bg, hbg, fg = _KINDS[kind]
    if enabled:
        btn.config(state="normal", bg=bg, fg=fg,
                   disabledforeground=C["muted_fg"], cursor="hand2")
    elif done:
        btn.config(state="disabled", bg=C["ok_bg"], fg=C["ok"],
                   disabledforeground=C["ok"], cursor="arrow")
    else:
        btn.config(state="disabled", bg=C["disabled"], fg=C["muted_fg"], cursor="arrow")


def card(parent, **pack):
    """白底卡片容器"""
    c = tk.Frame(parent, bg=C["card"], highlightbackground=C["border"],
                 highlightthickness=1)
    c.pack(**pack)
    return c


def apply_ttk_style(root):
    """ttk 控件统一样式（Tab / 进度条等）"""
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass
    style.configure("TNotebook", background=C["bg"], borderwidth=0, tabmargins=(8, 8, 0, 0))
    style.configure("TNotebook.Tab", background=C["disabled"], foreground=C["muted"],
                    font=FONT, padding=(16, 7), borderwidth=0)
    style.map("TNotebook.Tab",
              background=[("selected", C["card"])],
              foreground=[("selected", C["primary"])])
    style.configure("TNotebook.Tab", focuscolor=C["card"])
