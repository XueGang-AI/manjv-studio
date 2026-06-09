#!/usr/bin/env python3
"""解析 CSV 文件 → 输出结构化 JSON"""
import json, os, csv

CSV_FILE = "/Users/xuegang/Desktop/My Project/AI漫剧制作/分镜提示词＋AI指令整理/分镜提示词整理/300+电影风格提示词.csv"
OUTPUT = "/Users/xuegang/Desktop/My Project/manjv-studio/scripts/output/csv_parsed.json"

if not os.path.exists(CSV_FILE):
    print(f"❌ File not found: {CSV_FILE}")
    exit(1)

rows = []
# 尝试多种编码
for encoding in ['utf-8', 'gbk', 'gb2312', 'gb18030', 'latin-1']:
    try:
        with open(CSV_FILE, 'r', encoding=encoding) as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            for row in reader:
                if row and any(cell.strip() for cell in row):
                    rows.append(row)
        if rows:
            print(f"✅ Success with encoding: {encoding}")
            break
    except Exception as e:
        print(f"  Tried {encoding}: {e}")
        continue

print(f"Headers: {headers}")
print(f"Rows: {len(rows)}")

# 分类统计
from collections import Counter
categories = Counter()
for row in rows:
    if row:
        cat = row[0].strip() if row[0] else "未分类"
        categories[cat] += 1

print(f"\nCategory distribution:")
for cat, count in categories.most_common():
    print(f"  {cat}: {count}")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump({
        "file": "300+电影风格提示词.csv",
        "encoding": encoding,
        "headers": headers,
        "total_rows": len(rows),
        "categories": dict(categories),
        "rows": rows
    }, f, ensure_ascii=False, indent=2)

print(f"\n📄 Output: {OUTPUT}")
