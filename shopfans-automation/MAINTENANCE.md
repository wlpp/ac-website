# Shopfans 自动化控制面板 — 维护记录

> 最后更新: 2026-11-13  
> 维护者: 项目对话（新会话请读此文件快速上手）  
> 线上目标: `https://app.shopfans.com/admin/shipment/open.html`

---

## 1. 项目定位

Playwright + Tkinter 的桌面控制面板。一个 Chrome 浏览器 + 一个 Tk 窗口，**多模块共用**（目前只有一个 Shipment Finish Packing 模块）。

核心业务：
1. 打开 Open Shipment 列表页
2. 遍历 Open Boxes / Consolidating 表格，自动逐页收集所有 shipment_id
3. 点击某个 ID → 自动跑完整 6 步：Hold on → 跳 action 页 →（关 Hold on 弹框）→ 打开 Finish packing 弹框 → 读 Weight → 填 → Confirm → 等提示消失 → Proceed → 跳回列表
4. 完成的 ID 按钮变"✓ 910001"淡绿完成态

---

## 2. 目录结构

```
shopfans-automation/
├── main.py                      # 入口 + Tk 主窗口 + 公共按钮条 + 日志区
├── MAINTENANCE.md               # ← 本维护记录
│
├── modules/
│   ├── __init__.py
│   ├── base.py                  # BaseRunner（Playwright 生命周期）
│   │                            #   - launch + new_context(storage_state=...)
│   │                            #   - open_page(url, url_keyword, save_cookie) 通用打开
│   │                            #   - save_state() 在 open_page 检测到已登录、close 时调用
│   │                            # BaseModulePanel（UI 基类，子类实现 build_ui）
│   │
│   ├── theme.py                 # 零依赖 UI 主题
│   │                            #   - 配色 C 字典（primary/action/ok/danger 等）
│   │                            #   - make_button(parent, text, kind, command, ...)  hover + 状态
│   │                            #   - set_enabled(btn, enabled, kind, done) 状态机（普通/禁用/完成）
│   │                            #   - apply_ttk_style(root) clam 主题
│   │
│   └── shipment_finish.py       # ShipmentFinishRunner + ShipmentFinishPanel
│                                #   - BASE_URL, OPEN_LIST_PATH 模块级常量（本地测试时 monkeypatch）
│                                #   - run_one(shipment_id) 完整 6 步
│                                #   - _close_hold_on_dialog() best-effort 关弹框
│                                #   - get_ids(table_selector) 自动遍历 DataTables 分页
│
├── pages/shipment_open/         # 本地静态测试页（业务 ID 全用 9xxxxx 测试段）
│   ├── index.html               # Open Shipment 列表
│   ├── action.html              # Hold on 跳转后的 action 页（含隐藏的 Hold on 弹框模板 + In box + Finish packing 弹框）
│   └── css/
│
├── scripts/
│   ├── test_ui.py               # UI 状态机无头测试（不启动浏览器）
│   ├── test_local_flow.py       # 本地端到端流程测试（需本地服务器在 8766）
│   ├── diff.py                  # 线上 vs 本地结构审计
│   └── single_finish_packing.py # 单点验证脚本（遗留）
│
└── legacy/01_manual_control.py  # 单文件旧版（模块化拆分前的备份）
```

---

## 3. 运行方式

```powershell
# 线上运行
cd e:\myWork\project\ac-website\shopfans-automation
..\.venv\Scripts\python.exe main.py

# 本地测试（静态页，不会触发线上 API）
# 启动服务器（根目录必须是 pages/shipment_open，因为 action.html Proceed 跳转用 /index.html 绝对路径）
..\.venv\Scripts\python.exe -m http.server 8766 --directory pages/shipment_open

# 标准测试脚本
..\.venv\Scripts\python.exe scripts\test_ui.py           # UI 状态机（不启动浏览器，快速）
..\.venv\Scripts\python.exe scripts\test_local_flow.py   # 端到端（真实 Chrome 跑两个 shipment）
```

---

## 4. 核心架构

### 4.1 Runner 三层

```
BaseRunner (modules/base.py)
├── start_browser()     launch + new_context(storage_state)
├── close()             save_state → context.close → browser.close → pw.stop
├── open_page()         goto + 登录检测 + URL 关键词校验 + save_state
├── goto()              通用跳转 + login/sign 重定向检测
└── save_state()        context.storage_state() 持久化 cookie/localStorage

ShipmentFinishRunner (modules/shipment_finish.py)
├── open_list()         调 BaseRunner.open_page(BASE_URL + OPEN_LIST_PATH, "shipment")
├── get_ids(table)      遍历 DataTables 分页收集 .check_id 的 value
├── get_open_boxes_ids / get_consolidating_ids
├── _close_hold_on_dialog()   best-effort，不阻塞主流程
└── run_one(id)         6 步完整流程
```

Runner 是单例，main.py 创建后传给所有模块 Panel 共享。

### 4.2 Panel 三层

```
BaseModulePanel (modules/base.py)
├── MODULE_TITLE / MODULE_SUBTITLE
├── __init__(runner, log_func)
├── build_ui(parent)   # 子类实现
└── on_reset_ui()      # 子类可选覆盖

ShipmentFinishPanel (modules/shipment_finish.py)
├── build_ui           Notebook Tab 内容：①打开列表 → ③获取ID → ID 按钮网格
├── on_browser_started main.py 在浏览器启动后调用，启用 ① 按钮
├── on_open_list       调 runner.open_list → 完成态 + 启用 ③ 按钮
├── on_get_ids(source) 分页遍历 → 生成 ID 按钮网格
├── on_run_id(sid)     禁全部未完成按钮 → runner.run_one → 置灰 → 恢复
└── on_reset_ui        清 ID 按钮 + 恢复按钮文字 + 跳回列表
```

main.py 里 `MODULES = [ShipmentFinishPanel]` 注册模块 → 追加新模块只需加一行。

### 4.3 main.py 公共按钮

| 按钮 | 功能 | 回调 |
|------|------|------|
| ① 启动浏览器 | 调 runner.start_browser → 完成态 | `on_start_browser` |
| ↻ 重置当前模块 | 调当前 Panel 的 `on_reset_ui` | `on_reset` |
| ✕ 关闭浏览器 | runner.close + root.destroy | `on_close` |
| 📌 置顶 | 切换 `-topmost` | `on_toggle_topmost` |

---

## 5. run_one 6 步详解

```
[1/6] 点击 Hold on
      page.locator("tr:has(.check_id[value='{sid}']) a:has-text('Hold on')")
      → expect_navigation(wait_until="domcontentloaded")
      不限定表格 #open_boxes_table / #consolidating_table —— 全局 checkbox 唯一

[1.5] _close_hold_on_dialog()  best-effort
      .ui-dialog:visible filter(has_text="The reason why")
      count==0 → 跳过；count>0 → 点 .ui-dialog-titlebar-close（兜底 get_by_role("CANCEL")）
      等 .ui-dialog 总数 ≤ 1
      异常只打日志，不阻塞

[2/6] 打开 Finish packing 弹框
      .ui-dialog:visible filter(has_text="Finish packing")
      等 3s 出现 → 自动弹（Consolidating 路径）
      否则 → Open Boxes 路径点 In box 按钮
      In box 多策略: #grid_table button:has-text('In box') / a / input[type=button]
      先等 .ui-widget-overlay 消失，force=True 兜底
      失败时截图到 ~/pw_debug_inbox_fail.png

[3/6] 读 Weight
      扫 #grid_table tbody tr:first-child 所有 td
      re.search(r"([\d.]+)\s*lbs", text) 找 lbs 值
      兼容多种表格布局（找含 lbs 的单元格，不固定列号）

[4/6] 填 Weight
      #weight_0.fill(weight_lbs) → assert input_value == weight_lbs

[5/6] Confirm Weight → 等提示出现再消失
      弹框内 .get_by_role("button", name="Confirm Weight").click()
      #error_message wait_for "attached"
      JS 检测: .ui-dialog offsetParent !== null + textContent含Finish packing + #error_message class含display + text含Weight confirmed
      提示消失: #error_message class不含display
      超时 8s

[6/6] Proceed → 跳回列表
      expect_navigation(wait_until="domcontentloaded")
```

---

## 6. 测试 ID 隔离规则

所有模拟数据用 `9xxxxx` 段，确保线上 API 只会 404 不污染数据：
- Shipment: **910001** ~ 910009
- User: **920001** ~ 920020
- Suite: **930001**
- Package: **940001**

---

## 7. 登录态持久化

**storage_state 文件**: `~/.playwright_shopfans_state.json`（cookies + localStorage）

**保存时机**:
1. `BaseRunner.save_state()` 在 `open_page` 检测到已登录时
2. `ShipmentFinishRunner.open_list`（调 `open_page`）
3. `BaseRunner.close()`（关闭浏览器前）
4. `ShipmentFinishPanel.on_reset_ui`（重置 UI 时）

**加载**: `BaseRunner.start_browser` 检查文件存在时传给 `new_context(storage_state=...)`

**注意**: 用 `launch() + new_context(storage_state=...)`，**不要**用 `launch_persistent_context`（后者会受 Chrome 后台进程抢占 profile 影响，导致连接关闭错误）。

---

## 8. 已知坑与修复历史（重要！）

### Bug #1 — Playwright strict mode 多元素匹配
**现象**: 弹框操作报 strict mode，残留隐藏 dialog DOM 导致 `.weight_0` 匹配多个元素
**修复**: 所有弹框内操作限定作用域 `.ui-dialog:visible`

### Bug #2 — `:visible` 不是标准 CSS 选择器
**现象**: Playwright 的 locator 接受 `:visible`，但 `page.$$(".ui-dialog:visible")` / `page.eval_on_selector_all` 不支持
**修复**: 用 Playwright 原生 `.locator(".ui-dialog:visible")`（Playwright 扩展选择器引擎），或 JS 里手写 `offsetParent !== null`

### Bug #3 — make_button 丢弃 command 参数
**现象**: "点击启动浏览器没反应"（样式重构引入的 bug）
**修复**: theme.py make_button 里加 `if command: kw["command"] = command`
**教训**: 任何封装 tk.Button 的工厂函数都必须检查是否透传了 command

### Bug #4 — main.py 公共按钮没传 command
**现象**: 启动/重置/关闭三个公共按钮点击无反应
**修复**: main.py 四个公共按钮全补 command
**教训**: UI 重构后必须逐一验证所有按钮绑定

### Bug #5 — 本地 action.html 隐藏模板被误判为 Hold on 弹框
**现象**: 本地 action.html 等待 ~9s（close 隐藏元素超时 3s + dialog 计数超时 5s）
**根因**: 本地页 `#form_reason` 弹框模板 `autoOpen:false`，DOM 存在含 "The reason why" 但 `display:none`
**修复**: `_close_hold_on_dialog` 选择器从 `.ui-dialog` 改成 `.ui-dialog:visible`
**教训**: best-effort 弹框关闭逻辑必须加可见性过滤，避免隐藏模板误判

### Bug #6 — Hold on 弹框遮罩层挡住 In box 点击
**现象**: Hold on 弹框关闭后 `.ui-widget-overlay` 残留导致 In box 点不到
**修复**: 点 In box 前先等 `.ui-widget-overlay` offsetParent === null，必要时 force=True

### Bug #7 — Consolidating 路径没有 In box 按钮
**现象**: Consolidating 的 Hold on 跳转后 Finish packing 弹框**自动出现**
**修复**: `run_one` 第 2 步先等 3s 看弹框是否已可见，是的话直接用，否则才点 In box

### Bug #8 — 每次都要重新登录
**现象**: Playwright connection closed（Chrome 后台进程抢占 profile）
**修复**: launch() + new_context(storage_state=...)，显式三时机保存 cookie
**教训**: 不要用 launch_persistent_context（后者绑定固定 profile 路径，Chrome 后台进程会锁文件）

### Bug #9 — Python `//` 注释语法错误 / docstring 无效转义 SyntaxWarning
**现象**: Python 把 `//` 当变量名，docstring 里 `\m` `\.` 触发 SyntaxWarning
**修复**: 所有 docstring 加 `r"""` 前缀，`//` 删除
**教训**: 零告警策略（`-W error::SyntaxWarning`）

### Bug #10 — on_reset_ui 恢复完成态按钮时跳过 done_ids
**现象**: 已完成 ID 按钮在重置后可重复点击
**修复**: 按钮恢复时跳过 `self.done_ids`，入口双重 guard `if sid in done_ids: return` + `btn["state"] == "disabled"`

### Bug #11 — BaseRunner 没有 open_list 属性，on_start_browser 后调 runner.open_list 报 AttributeError
**现象**: main.py 用 `BaseRunner(log=self.log)` 创建但 open_list 在 ShipmentFinishRunner 子类
**修复**: 改用 `ShipmentFinishRunner(log=self.log)`；BaseRunner 加通用 `open_page` 方法

### Bug #12 — main.py 漏 import ttk
**现象**: `NameError: name 'ttk' is not defined`
**修复**: `from tkinter import ttk, scrolledtext, messagebox`

### Bug #13 — 本地 Proceed 跳转 404
**现象**: action.html Proceed 跳 `/index.html`（绝对路径），服务器根目录不对
**修复**: 启动服务器时 `--directory pages/shipment_open`（index.html 和 action.html 在同一目录，相对路径跳转）

---

## 9. 线上 vs 本地差异速查表

| 项 | 线上 | 本地静态页 |
|----|------|-----------|
| URL | `https://app.shopfans.com` | `http://localhost:8766`（root=pages/shipment_open） |
| Hold on 弹框 | 点完真弹出可见的 "The reason why" 弹框 | DOM 有 `#form_reason` 模板但 `display:none` |
| Finish packing | 真实弹框，Proceed 提交后端 | jQuery UI dialog + setTimeout 模拟提示消失（5s） |
| DataTables | 真实分页 | 只有 1 页 6+3 条 |
| In box | 两种路径：Open Boxes 需点 In box；Consolidating 自动弹 | 统一走 Open Boxes 路径（需点 In box） |
| API 调用 | 真实后端（shipment_id 用线上值） | 全部 mock，ID 用 9xxxxx |
| 登录 | 需要手动登录一次，storage_state 持久化 | 无登录（直接访问） |
| #error_message | 提示由后端返回 + display class | JS Confirm Weight 按钮点击触发 display class + setTimeout 5s 自动消失 |

---

## 10. 分页遍历逻辑（DataTables）

```python
wrapper = page.locator(table_selector) \
    .locator("xpath=ancestor::*[contains(@class,'dataTables_wrapper')]").first
next_btn = wrapper.locator(".dataTables_paginate .paginate_button.next")
# 每轮: 读当前页 .check_id → 去重 → 看 next_btn 的 class 有没有 "disabled" → 有就 break
page.wait_for_function("document.querySelectorAll(table + ' .check_id').length > 0", timeout=5000)
max_pages=50  # 安全上限防死循环
```

**前提**: DataTables 的 class 名 `paginate_button.next` 和 `paginate_button_disabled` 必须和线上一致。如果线上升级 DataTables 版本改了 class，需要同步改。

---

## 11. 标准测试脚本

| 脚本 | 用途 | 依赖 | 耗时 |
|------|------|------|------|
| `scripts/test_ui.py` | UI 按钮绑定 + 状态机（启动/置顶/重置/关闭） | 无 | <1s |
| `scripts/test_local_flow.py` | 本地端到端：Open Boxes(910001) + Consolidating(910007) 各跑完整 6 步 | 本地服务器 8766 + Chrome | ~20s |

**改动 main.py / theme.py / shipment_finish.py 后必须跑 `test_ui.py`**，改业务逻辑后必须跑 `test_local_flow.py`。

两个脚本内部用 `sys.path.insert(0, parent.parent)` 自动定位项目根，从任何目录调用都能运行。

---

## 12. 后续待办

1. **批量循环执行**：当前是单个 ID 点击运行，后续加 "一键跑完所有 ID"（遍历 id_buttons 调 on_run_id）
2. **线上登录态恢复**：若线上因 session 过期被踢回登录页，需要明确提示用户重新手动登录
3. **diff.py / single_finish_packing.py 脚本更新**：路径已改成新结构，但里面的 import 和 BASE_URL 硬编码可能需要检查
4. **多模块框架验证**：MODULES 列表追加第二个 ModulePanel 验证 Tab 切换 + 共享 Runner 没问题

---

## 13. 关键配置常量

| 位置 | 常量 | 值 | 说明 |
|------|------|----|----|
| modules/base.py | CHROME_EXE | `C:\Program Files\Google\Chrome\Application\chrome.exe` | 系统 Chrome 路径 |
| modules/base.py | COOKIE_STATE_FILE | `~/.playwright_shopfans_state.json` | 登录态文件 |
| modules/shipment_finish.py | BASE_URL | `https://app.shopfans.com` | 线上根（本地测试 monkeypatch） |
| modules/shipment_finish.py | OPEN_LIST_PATH | `/admin/shipment/open.html` | 列表路径 |
| main.py | 窗口尺寸 | `660x760` | |
| action.html | 本地服务器根 | `pages/shipment_open` | 因为 Proceed 跳 `/index.html` 绝对路径 |

---

## 14. 依赖

- Python 3.13（.venv 在 ac-website/.venv）
- playwright（sync_api）+ 系统 Chrome
- tkinter（Python 自带）
- 第三方零依赖（theme.py）
