# -*- coding: utf-8 -*-
r"""
本地端到端流程测试（真实 Chrome 跑两个 shipment）

前置条件:
  本地静态测试页服务器已启动:
    cd e:/myWork/project/ac-website/shopfans-automation
    ..\.venv\Scripts\python.exe -m http.server 8766 --directory pages\shipment_open

验证:
  - Open Boxes 路径: shipment_id=910001 完整 6 步流程
  - Consolidating 路径: shipment_id=910007 完整 6 步流程
  - Weight 从页面读取（0.4 lbs）
  - Confirm Weight 后等待 "Weight confirmed" 提示消失再 Proceed
  - Proceed 后跳回列表页

运行:
  cd e:/myWork/project/ac-website/shopfans-automation
  ..\.venv\Scripts\python.exe scripts\test_local_flow.py
"""
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import modules.shipment_finish as sf
from modules.shipment_finish import ShipmentFinishRunner

LOCAL = "http://localhost:8766"


def check_server():
    """检查本地服务器是否可用"""
    try:
        with urllib.request.urlopen(f"{LOCAL}/index.html", timeout=3) as r:
            if r.status != 200:
                raise RuntimeError(f"服务器返回 {r.status}")
            body = r.read().decode("utf-8", errors="ignore")
            if "910001" not in body:
                raise RuntimeError("index.html 未包含测试 ID 910001（可能根目录不对）")
    except Exception as e:
        print(f"✗ 本地服务器不可用: {e}")
        print(f"\n请先启动:")
        print(f"  cd e:/myWork/project/ac-website/shopfans-automation")
        print(f"  ..\\.venv\\Scripts\\python.exe -m http.server 8766 --directory pages\\shipment_open")
        sys.exit(1)


def run() -> int:
    check_server()
    print(f"✓ 本地服务器可用: {LOCAL}\n")

    # monkeypatch 到本地（只影响本次运行，不修改源码）
    sf.BASE_URL = LOCAL
    sf.OPEN_LIST_PATH = "/index.html"

    runner = ShipmentFinishRunner(log=lambda m: print(m, flush=True))
    try:
        runner.start_browser()

        # 本地 URL 不含 'shipment'，覆盖 open_list 的关键词校验
        runner.open_list = lambda: runner.open_page(
            f"{LOCAL}/index.html", url_keyword="index"
        )
        runner.open_list()

        # ---- 路径1: Open Boxes ----
        ids = runner.get_open_boxes_ids()
        print(f"\n>>> Open Boxes IDs: {ids}")
        assert "910001" in ids, f"未找到 910001: {ids}"

        t0 = time.time()
        runner.run_one("910001")
        print(f"\n[Open Boxes 总耗时: {time.time()-t0:.1f}s]")

        # ---- 路径2: Consolidating ----
        cids = runner.get_consolidating_ids()
        print(f"\n>>> Consolidating IDs: {cids}")
        assert "910007" in cids, f"未找到 910007: {cids}"

        t1 = time.time()
        runner.run_one("910007")
        print(f"\n[Consolidating 总耗时: {time.time()-t1:.1f}s]")

    finally:
        runner.close()

    print("\n=== 本地端到端流程测试通过（Open Boxes + Consolidating）===")
    return 0


if __name__ == "__main__":
    sys.exit(run())
