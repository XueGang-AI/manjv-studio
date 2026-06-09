#!/usr/bin/env python3
"""解析 PDF 文件 → 输出结构化 JSON"""
import json, os, sys
sys.path.insert(0, '/Users/xuegang/Library/Python/3.9/lib/python/site-packages')
import pdfplumber

PDF_FILE = "/Users/xuegang/Desktop/My Project/AI漫剧制作/AI漫剧创作/AI漫剧创作完整指南（专业增强版）.pdf"
OUTPUT = "/Users/xuegang/Desktop/My Project/manjv-studio/scripts/output/pdf_parsed.json"

if not os.path.exists(PDF_FILE):
    print(f"❌ File not found: {PDF_FILE}")
    exit(1)

results = {
    "file": "AI漫剧创作完整指南（专业增强版）.pdf",
    "source_dir": "AI漫剧创作",
    "pages": []
}

total_chars = 0

try:
    with pdfplumber.open(PDF_FILE) as pdf:
        print(f"Total pages: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            total_chars += len(text)
            results["pages"].append({
                "page_num": i + 1,
                "char_count": len(text),
                "text": text
            })
            if (i + 1) % 5 == 0:
                print(f"  Processed page {i+1}/{len(pdf.pages)}")
        
        results["total_pages"] = len(pdf.pages)
        results["total_chars"] = total_chars
        results["status"] = "OK"
        
except Exception as e:
    results["status"] = "ERROR"
    results["error"] = str(e)
    print(f"❌ Error: {e}")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    # Save without full text to keep file manageable, add text separately
    summary = {k: v for k, v in results.items() if k != "pages"}
    summary["page_summaries"] = [
        {"page_num": p["page_num"], "char_count": p["char_count"],
         "preview": p["text"][:200] if p["text"] else ""}
        for p in results["pages"]
    ]
    json.dump({"summary": summary, "full_text": "\n\n--- PAGE BREAK ---\n\n".join(
        p["text"] for p in results["pages"]
    )}, f, ensure_ascii=False, indent=2)

print(f"✅ Total: {total_chars} chars across {len(results['pages'])} pages")
print(f"📄 Output: {OUTPUT}")
