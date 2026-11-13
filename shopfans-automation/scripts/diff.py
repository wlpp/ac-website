# -*- coding: utf-8 -*-
"""
对比线上原始 HTML 与本地测试页面的可定位元素，输出差异清单。
用于自动化测试前的结构对齐审计。
"""
import sys
import re
import json
from pathlib import Path

sys.path.insert(0, r"e:\myWork\project\ac-website\.venv\Lib\site-packages")
from bs4 import BeautifulSoup

ORIG_OPEN   = Path(r"c:\Users\wlpp\Desktop\测试页面1.txt")
LOCAL_OPEN  = Path(r"e:\myWork\project\ac-website\shopfans-automation\pages\shipment_open\index.html")
ORIG_ACTION = Path(r"c:\Users\wlpp\Desktop\hold on跳转页面.txt")
LOCAL_ACTION = Path(r"e:\myWork\project\ac-website\shopfans-automation\pages\shipment_open\action.html")
ORIG_DIALOG = Path(r"c:\Users\wlpp\Desktop\弹框.txt")

def extract(html_text):
    soup = BeautifulSoup(html_text, "html.parser")
    out = {}

    # 所有 id
    out["ids"] = sorted({el["id"] for el in soup.find_all(attrs={"id": True}) if el.get("id")})

    # 所有 class（去重，仅非空）
    out["classes"] = sorted({
        c for el in soup.find_all(attrs={"class": True})
        for c in (el.get("class") or []) if c
    })

    # h1-h3 文本
    out["headings"] = [
        (el.name, el.get_text(strip=True))
        for el in soup.find_all(["h1", "h2", "h3"])
    ]

    # 所有 input/button/select/textarea 的可定位描述
    fields = []
    for tag in ["input", "button", "select", "textarea"]:
        for el in soup.find_all(tag):
            rec = {"tag": tag}
            for attr in ["id", "name", "type", "value", "placeholder", "title", "class"]:
                v = el.get(attr)
                if v is not None:
                    if attr == "class":
                        v = " ".join(v)
                    rec[attr] = v
            rec["text"] = el.get_text(strip=True)
            fields.append(rec)
    out["fields"] = fields

    # 所有 a 链接 (href + text)
    out["links"] = [
        {"href": a.get("href"), "text": a.get_text(strip=True)[:60]}
        for a in soup.find_all("a") if a.get("href")
    ]

    # 所有 table 的列头
    tables = []
    for t in soup.find_all("table"):
        tid = t.get("id")
        ths = [th.get_text(strip=True) for th in t.find_all("th")]
        # 行数
        rows = len(t.find_all("tr"))
        tables.append({"id": tid, "cols": len(ths), "ths": ths, "rows": rows})
    out["tables"] = tables

    # 所有 [data-*] 属性集合（按键名）
    data_attrs = set()
    for el in soup.find_all(attrs=re.compile(r"^data-")):
        for k in el.attrs:
            if k.startswith("data-"):
                data_attrs.add(k)
    out["data_attrs"] = sorted(data_attrs)

    # form 的 hidden input 集合
    hidden = []
    for i in soup.find_all("input", {"type": "hidden"}):
        hidden.append({"name": i.get("name"), "value": i.get("value", "")})
    out["hidden"] = hidden

    return out


def load(path):
    return path.read_text(encoding="utf-8")


def diff(name, orig_html, local_html, ignore_ids=None, ignore_links=None):
    o = extract(orig_html)
    l = extract(local_html)
    ignore_ids = set(ignore_ids or [])
    ignore_links = set(ignore_links or [])

    issues = []

    # 1) id 差异
    o_ids = set(o["ids"]) - ignore_ids
    l_ids = set(l["ids"]) - ignore_ids
    missing = sorted(o_ids - l_ids)
    extra   = sorted(l_ids - o_ids)
    if missing:
        issues.append(("[MISSING id] 线上有但本地没有: " + ", ".join(missing)))
    if extra:
        issues.append(("[EXTRA id]   本地有但线上没有: " + ", ".join(extra)))

    # 2) headings 差异
    o_h = [h for h in o["headings"]]
    l_h = [h for h in l["headings"]]
    if o_h != l_h:
        issues.append(f"[HEADINGS]\n  线上: {o_h}\n  本地: {l_h}")

    # 3) 表格列头 & 列数（按 id 对齐；线上 id 缺失的按位置）
    o_tabs = {t["id"] or f"__pos{i}": t for i, t in enumerate(o["tables"])}
    l_tabs = {t["id"] or f"__pos{i}": t for i, t in enumerate(l["tables"])}
    for tid, t in o_tabs.items():
        lt = l_tabs.get(tid)
        if not lt:
            issues.append(f"[MISSING table] 线上表格 id={tid} (cols={t['cols']}) 本地未找到")
            continue
        if t["cols"] != lt["cols"]:
            issues.append(f"[TABLE cols] {tid}: 线上 {t['cols']} 列 vs 本地 {lt['cols']} 列")
        if t["ths"] != lt["ths"]:
            issues.append(f"[TABLE ths] {tid}:\n  线上: {t['ths']}\n  本地: {lt['ths']}")
    for tid in l_tabs:
        if tid not in o_tabs:
            issues.append(f"[EXTRA table]   本地多了表格 id={tid}")

    # 4) hidden fields
    o_hid = {(h["name"], h["value"]) for h in o["hidden"]}
    l_hid = {(h["name"], h["value"]) for h in l["hidden"]}
    missing_hid = sorted(o_hid - l_hid)
    if missing_hid:
        issues.append("[MISSING hidden] " + json.dumps(missing_hid, ensure_ascii=False))

    # 5) buttons & inputs (按 type+name+value 对齐)
    o_btns = {}
    for f in o["fields"]:
        key = (f.get("tag"), f.get("name") or f.get("id") or f.get("text") or f.get("value"))
        o_btns[key] = f
    l_btns = {}
    for f in l["fields"]:
        key = (f.get("tag"), f.get("name") or f.get("id") or f.get("text") or f.get("value"))
        l_btns[key] = f
    for key, of in o_btns.items():
        lf = l_btns.get(key)
        if not lf:
            issues.append(f"[MISSING field] 线上 {key}  未在本地找到")
            continue
        # 比较 value/text
        ov = of.get("value") or of.get("text")
        lv = lf.get("value") or lf.get("text")
        if ov != lv and ov and lv and ov not in {"", None} and lv not in {"", None}:
            # 忽略数值型差异（比如 shipment_id），只报文案不一致
            if not re.match(r"^[\d.]+$", str(ov)):
                issues.append(f"[FIELD value] {key}: 线上 '{ov}' vs 本地 '{lv}'")

    for key in l_btns:
        if key not in o_btns:
            issues.append(f"[EXTRA field]   本地多了字段 {key}")

    # 6) links（忽略 # 开头和明显的用户链接 / 邮件）
    o_links = set(a["text"] for a in o["links"] if a["text"] not in ignore_links and not a["href"].startswith("#"))
    l_links = set(a["text"] for a in l["links"] if a["text"] not in ignore_links and not a["href"].startswith("#"))
    miss_l = sorted(o_links - l_links)
    if miss_l:
        issues.append("[MISSING link text] " + ", ".join(miss_l))

    print(f"\n{'='*70}\n  {name}\n{'='*70}")
    if not issues:
        print("  ✅ 无差异")
    else:
        for i in issues:
            print("  " + i)
    return issues


ignore_ids_open = {
    # 这些 id 在本地可能有不同后缀或缺失
}
ignore_links = {"Consolidate", "Hold on"}  # 这些在本地 href 不同但文字一致

print("### shipment-open 页面 ###")
diff("shipment-open", load(ORIG_OPEN), load(LOCAL_OPEN),
     ignore_ids=ignore_ids_open, ignore_links=ignore_links)

print("\n### action (hold on) 页面 ###")
diff("action", load(ORIG_ACTION), load(LOCAL_ACTION),
     ignore_ids={"atk-version", "form_finish"},  # atk-version 是空的，form_finish 本地和线上结构略有差异
     ignore_links={"Consolidate", "Hold on", "Return to list"})

print("\n### In box 弹框 (form_finish) ###")
orig_dialog_html = load(ORIG_DIALOG)
# 只对比 form_finish 内部
orig_d = extract(orig_dialog_html)
local_action = extract(load(LOCAL_ACTION))

# 从本地 action.html 中提取 #form_finish 的字段
loc_form = extract(load(LOCAL_ACTION))
print("弹框 ids:", orig_d["ids"])
print("弹框 fields:")
for f in orig_d["fields"]:
    print(" ", f)
