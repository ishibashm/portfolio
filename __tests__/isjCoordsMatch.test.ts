import * as zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  unzipEntries,
  pickCsv,
  decode,
  parseCsv,
  stripChome,
  averagePoint,
} from "../scripts/isjParse";

/**
 * 位置参照情報（国土交通省）の zip と CSV の読み取り。
 *
 * 最初の probe（2026-08-16）は 2 つとも外していた。
 *
 * 1. **zip の 1 本目はフォルダ項目。**中身 0 バイトのディレクトリが
 *    先に入っていて、そこを本体として読んでいた。1 本目だけを見る作り
 *    だったので、CSV に辿り着けていなかった
 * 2. **文字コードを Shift-JIS に決め打ちしていた。**年度によって UTF-8
 *    のことがある。決め打ちだと見出しが化けて列を引けない
 *
 * どちらも「黙って 0 件」に化ける型なので、実際に zip を組んで通す。
 * 以前はスクリプトの字面を検査していたが、字面が合っていても
 * **動かなければ意味がない**ことがこの 2 件で分かった。
 */

/** テスト用に zip を 1 つ組む。ディレクトリ項目も入れられる。 */
function makeZip(files: { name: string; body: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "latin1");
    const deflated = zlib.deflateRawSync(f.body);
    const method = f.body.length === 0 ? 0 : 8;
    const data = method === 0 ? f.body : deflated;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const HEADER =
  '"都道府県コード","都道府県名","市区町村コード","市区町村名",' +
  '"大字町丁目コード","大字町丁目名","緯度","経度","原典資料コード",' +
  '"大字・字・丁目区分コード"';
const ROW =
  '"13","東京都","13101","千代田区","131010011001","丸の内一丁目",' +
  '"35.68156","139.767201","0","3"';
const CSV = `${HEADER}\r\n${ROW}\r\n`;

/**
 * 上の CSV を Shift-JIS にしたもの。
 * Node には Shift-JIS へ**書く**手段が無い（読む TextDecoder はある）ので、
 * バイト列を base64 で直に持つ。
 */
const CSV_SJIS_BASE64 =
  "IpNzk7mVe4yng1KBW4NoIiwik3OTuZV7jKeWvCIsIo5zi+aSrJG6g1KBW4NoIiwi" +
  "jnOL5pKskbqWvCIsIpHljpqSrJKaltqDUoFbg2giLCKR5Y6akqySmpbalrwiLCKI" +
  "3JN4IiwijG+TeCIsIoy0k1SOkZe/g1KBW4NoIiwikeWOmoFFjpqBRZKaltqL5pWq" +
  "g1KBW4NoIg0KIjEzIiwik4yLnpNzIiwiMTMxMDEiLCKQ55Hjk2OL5iIsIjEzMTAx" +
  "MDAxMTAwMSIsIorbgsyT4IjqkpqW2iIsIjM1LjY4MTU2IiwiMTM5Ljc2NzIwMSIs" +
  "IjAiLCIzIg0K";

describe("zip の読み取り", () => {
  it("フォルダ項目を飛ばして CSV を選ぶ", () => {
    // ここが最初の probe で落ちた原因。1 本目は中身 0 バイトの
    // ディレクトリで、そこを本体として読んでいた。
    const zip = makeZip([
      { name: "01000-19.0b/", body: Buffer.alloc(0) },
      { name: "01000-19.0b/01_2025.csv", body: Buffer.from(CSV, "utf8") },
    ]);
    const entries = unzipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual([
      "01000-19.0b/",
      "01000-19.0b/01_2025.csv",
    ]);
    expect(pickCsv(entries).name).toBe("01000-19.0b/01_2025.csv");
  });

  it("CSV 以外しか無ければ、入っていたものを添えて止まる", () => {
    const zip = makeZip([
      { name: "readme.txt", body: Buffer.from("説明", "utf8") },
    ]);
    expect(() => pickCsv(unzipEntries(zip))).toThrow(/readme\.txt/);
  });

  it("2 本目以降のデータを巻き込まない", () => {
    // 1 本目だけを見て「次の中央ディレクトリまで」を本体にすると、
    // 2 本目のヘッダごと読んでしまう。
    const zip = makeZip([
      { name: "a.csv", body: Buffer.from(CSV, "utf8") },
      { name: "b.csv", body: Buffer.from("よけいなもの", "utf8") },
    ]);
    const entries = unzipEntries(zip);
    expect(entries[0].body.toString("utf8")).toBe(CSV);
  });
});

describe("文字コードの見分け", () => {
  it("UTF-8 の CSV を読める", () => {
    expect(decode(Buffer.from(CSV, "utf8")).split("\r\n")[0]).toBe(HEADER);
  });

  it("Shift-JIS の CSV も読める（決め打ちにしない）", () => {
    const buf = Buffer.from(CSV_SJIS_BASE64, "base64");
    expect(decode(buf).split("\r\n")[0]).toBe(HEADER);
  });

  it("BOM 付きの UTF-8 を読める", () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(CSV, "utf8"),
    ]);
    expect(decode(buf).split("\r\n")[0]).toBe(HEADER);
  });
});

describe("CSV の読み取り", () => {
  it("見出しの名前で列を引く", () => {
    const rows = parseCsv(CSV);
    expect(rows).toEqual([
      {
        pref: "東京都",
        city: "千代田区",
        town: "丸の内一丁目",
        lat: 35.68156,
        lon: 139.767201,
      },
    ]);
  });

  it("列が増えても位置ずれで壊れない", () => {
    const header = `"よけいな列",${HEADER}`;
    const row = `"x",${ROW}`;
    expect(parseCsv(`${header}\r\n${row}\r\n`)[0].town).toBe("丸の内一丁目");
  });

  it("必要な列が無ければ止まる（黙って 0 件で終わらない）", () => {
    expect(() => parseCsv('"あ","い"\r\n"1","2"\r\n')).toThrow(
      /見出しに必要な列がありません/,
    );
  });

  it("0,0 の座標は捨てる（大西洋上の実在の点）", () => {
    const row = ROW.replace('"35.68156","139.767201"', '"0","0"');
    expect(parseCsv(`${HEADER}\r\n${row}\r\n`)).toEqual([]);
  });

  it("数でない座標の行は捨てる", () => {
    const row = ROW.replace('"35.68156"', '"-"');
    expect(parseCsv(`${HEADER}\r\n${row}\r\n`)).toEqual([]);
  });
});

describe("丁目の落とし方", () => {
  it("丁目を落とす（郵便番号側には丁目が無い）", () => {
    expect(stripChome("丸の内一丁目")).toBe("丸の内");
    expect(stripChome("東九条西山王町三丁目")).toBe("東九条西山王町");
    expect(stripChome("梅田十丁目")).toBe("梅田");
  });

  it("丁目が無い町名はそのまま", () => {
    expect(stripChome("東九条")).toBe("東九条");
    expect(stripChome("千代田")).toBe("千代田");
  });

  it("末尾以外の「丁目」は落とさない", () => {
    expect(stripChome("一丁目町")).toBe("一丁目町");
  });

  it("漢数字でない丁目は落とさない（別の地名を巻き込まない）", () => {
    expect(stripChome("丸の内1丁目")).toBe("丸の内1丁目");
  });
});

describe("代表点", () => {
  it("同じ町の複数の丁目は平均を取る", () => {
    const p = averagePoint([
      { lat: 35.68156, lon: 139.767201 },
      { lat: 35.680022, lon: 139.763447 },
      { lat: 35.676952, lon: 139.763476 },
    ]);
    expect(p.lat).toBeCloseTo(35.679511, 5);
    expect(p.lon).toBeCloseTo(139.764708, 5);
  });

  it("1 点しかなければそのまま", () => {
    expect(averagePoint([{ lat: 35.1, lon: 139.2 }])).toEqual({
      lat: 35.1,
      lon: 139.2,
    });
  });
});
