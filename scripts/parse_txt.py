#!/usr/bin/env python3
"""解析 TXT 文件 → 输出结构化 JSON"""
import json, os, re

def extract_sections(text, filename):
    sections = []
    lines = text.strip().split('\n')
    current_section = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if re.match(r'^[【🎬🎨📋]', line) or line.startswith('【'):
            current_section = {"title": line, "content": []}
            sections.append(current_section)
        elif current_section is not None:
            current_section["content"].append(line)
        else:
            if not sections:
                sections.append({"title": "head", "content": []})
            sections[0]["content"].append(line)
    return sections

FILES = [
    ("seedance2.0分镜提示词模板.txt",
     "/Users/xuegang/Desktop/My Project/AI漫剧制作/分镜提示词＋AI指令整理/分镜提示词整理/seedance2.0分镜提示词模板.txt",
     "分镜提示词整理"),
    ("Seedance2.0智能体模板.txt",
     "/Users/xuegang/Desktop/My Project/AI漫剧制作/分镜提示词＋AI指令整理/辅助创作提示词/Seedance 2.0智能体模板.txt",
     "辅助创作提示词"),
]

OUTPUT = "/Users/xuegang/Desktop/My Project/manjv-studio/scripts/output/txt_parsed.json"
results = []

for name, path, source_dir in FILES:
    if not os.path.exists(path):
        results.append({"file": name, "status": "NOT_FOUND", "path": path})
        continue
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    results.append({
        "file": name,
        "source_dir": source_dir,
        "status": "OK",
        "path": path,
        "char_count": len(content),
        "line_count": content.count('\n') + 1,
        "content": content,
        "sections": extract_sections(content, name),
    })
    print(f"✅ {name}: {len(content)} chars, {content.count(chr(10))+1} lines")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\n📄 Output: {OUTPUT}")
