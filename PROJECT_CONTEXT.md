# ac-website 项目开发档案

> 本档案由 AI 于 2026-10-16 基于代码结构 + git 提交历史重建（原 Trae 对话历史因卸载丢失）。
> **用途：新会话开始时先读本文档，即可恢复项目上下文。**

## 一、项目定位

个人影视网站（ACG/番剧向）：爬虫采集视频资源 → MySQL 存储 → Flask Web 端在线观看（HLS 流播放）+ 收藏功能。
项目路径：`E:\myWork\project\ac-website`（本地 MySQL：`root:123456@localhost:3306/ac-website`）

## 二、技术栈

- 后端：Python + Flask + Flask-SQLAlchemy（pymysql 连 MySQL）
- 前端：原生 HTML/JS（`src/` 静态目录，HLS.js 视频流播放）
- 爬虫：requests / selenium（chromedriver）/ Appium（手机自动化实验）
- 版本管理：git + 自写 `git.py` 自动提交脚本（历史里大量 "Auto commit" 即来源于此）

## 三、模块架构与数据流

```
crawler/（采集） → MySQL(ac-website) → web/（Flask 服务 :5000） → src/（前端展示）
```

| 路径 | 职责 | 关键文件 |
|------|------|----------|
| `run.py` | 启动入口 | 运行 web 下的 Flask 应用，监听 `0.0.0.0:5000` |
| `git.py` | git 自动 add/commit/push 脚本 | 开发流程自动化 |
| `web/app.py` | Flask 主应用 | 配置 MySQL、静态目录指向 `src/`、注册蓝图 article/user/resources/system/crawling |
| `web/crawling.py` | 视频 API 核心（~1800 行） | `/vods` 列表页、`/vodplay` 播放页、`/api/vod-stream`（HLS 视频流）、`/api/vods-list`（按推荐/电影/动漫分类分页） |
| `web/user.py` | 用户系统 | 注册登录 + `vods_collect` 收藏表（收藏/取消/检查状态 API，L669-788） |
| `src/views/` | 前端页面 | `vods.html`（视频列表：导航/搜索/收藏/分页）等 |
| `src/js/vodplay.js` | 播放器逻辑 | 调用 `/api/vod-stream?vid=...` 取 HLS 流初始化播放（L192-220） |
| `crawler/` | 爬虫脚本集（30+ 个实验脚本） | 核心：`爬取acg.py`、`爬取国漫列表.py`、`爬取hex视频3.py`、`爬取视频.py/2.py`、`爬取jtv.py`；另有小说爬取（`xiaoshuo*.py`）、美团自动化（Appium）、博客爬取（`爬取零度博客*.py`）等实验 |
| `system/` | 系统辅助模块 | |
| `.trae/skills/disk-safe-cleanup/` | 磁盘安全清理技能（与网站无关，后放入） | scan-drive.ps1 / clean-safe.ps1 |

## 四、开发里程碑（git log 时间线）

| 时间 | 阶段 | 内容 |
|------|------|------|
| 2024-11-13 ~ 12 | 立项+密集开发 | 大量 Auto commit，搭建 Flask 骨架、用户系统、文章功能、爬虫采集视频数据入库 |
| 2025-01 | 调试 | 留下 captcha.png / code.png / login_error.png（验证码/登录调试痕迹） |
| 2025-04-07 ~ 15 | 视频模块开发 | "视频完成初期布局及功能"（vods 页面雏形） |
| 2025-06-30 | 视频播放攻坚 | 实现基础播放 → 修复播放慢 → 优化体验 → update vods_collect |
| 2025-07-01 | 收藏功能 | vods_collect 收藏表 + API 完善 |
| 2025-12-13 | 最后功能提交 | "update" |
| 2026-10-14 | 仓库整理 | 仅改 .gitignore（当日做过磁盘清理维护） |

## 五、注意事项 / 已知问题

- MySQL80 服务是**手动启动**：跑站前先 `net start MySQL80`
- `crawler.log`（1.1MB）为 GBK 编码，读取时需 `encoding='gbk'`，避免乱码
- `crawler/` 目录多为一次性实验脚本（ttt2/tttt2/ttttt3 等），核心可复用的是 `爬取acg.py` 和 `爬取国漫列表.py` 系列
- 视频流接口 `/api/vod-stream` 是播放体验关键，历史上修过"播放慢"问题（2025-06-30）

## 六、后续开发入口

- 加新功能 → 优先在 `web/crawling.py` 加路由，前端在 `src/views/` 加页面
- 改数据模型 → `web/user.py` 等 SQLAlchemy 模型，改完注意 MySQL 里的表结构同步
- 提交 → 可用 `git.py` 自动提交，commit message 建议写清改动点（历史里的 Auto commit 可读性差）
