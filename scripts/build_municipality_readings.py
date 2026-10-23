"""日本郵便の無料公開CSVから自治体の読みだけを抽出する（実行時通信なし）。
Usage: python3 scripts/build_municipality_readings.py UTF_ZIP ROMAN_ZIP
取得元・取得日・SHA256は出力に記録。町域や郵便番号は保存しない。
"""
import csv
import hashlib
import io
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

BASE = "https://www.post.japanpost.jp/service/search/zipcode/download/"

def rows(path, encoding):
    with zipfile.ZipFile(path) as archive:
        return list(csv.reader(io.StringIO(archive.read(archive.namelist()[0]).decode(encoding))))

def compact(value):
    return "".join(value.split())

kana_path, roman_path = sys.argv[1:]
roman = {(r[1], compact(r[2])): [r[4], r[5]] for r in rows(roman_path, "cp932")}
entries = {}
for r in rows(kana_path, "utf-8-sig"):
    key = r[6] + r[7]
    entry = {"pref": r[6], "city": r[7], "prefKana": r[3], "cityKana": r[4]}
    if (r[6], r[7]) in roman:
        entry["prefRoman"], entry["cityRoman"] = roman[(r[6], r[7])]
    entries[key] = entry

result = {
    "source": "日本郵便 郵便番号データ（UTF-8・ローマ字）を加工",
    "retrievedAt": date.today().isoformat(),
    "sources": [{"url": BASE + suffix, "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest()}
                for path, suffix in [(kana_path, "utf/zip/utf_ken_all.zip"), (roman_path, "roman/KEN_ALL_ROME.zip")]],
    "municipalities": sorted(entries.values(), key=lambda e: e["pref"] + e["city"]),
}
Path("src/data/municipalityReadings.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(f"Generated {len(entries)} municipality readings")
