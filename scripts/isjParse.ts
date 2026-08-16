import * as zlib from "zlib";

/**
 * 位置参照情報（国土交通省）の zip と CSV を読む部分。
 *
 * 取り込み本体（scripts/import_isj_coords.ts）から切り出してある。
 * 本体は起動時に DATABASE_URL を見て走り出すので、そのままでは
 * テストから読めない。**読み取りだけを別にして、実際に動かして
 * 確かめられるようにする**（__tests__/isjCoordsMatch.test.ts）。
 *
 * ここは外にも DB にも触らない。純粋に「バイト列 → 行」だけを扱う。
 */

export interface ZipEntry {
  name: string;
  body: Buffer;
}

/**
 * zip の中身を全部取り出す。**中央ディレクトリから読む。**
 *
 * 最初はローカルヘッダを 1 つだけ読んで「1 本目＝本体」としていたが、
 * 位置参照情報の zip は**フォルダ項目が先に入っている**ので、1 本目は
 * 中身が空のディレクトリだった（2026-08-16 の probe で発覚）。
 * 複数入っている zip では、次の項目のデータまで巻き込む問題もある。
 *
 * 中央ディレクトリには項目ごとの名前・圧縮方式・大きさ・位置が並んで
 * いるので、そこから引けば取り違えない。
 */
export function unzipEntries(buf: Buffer): ZipEntry[] {
  // 末尾から EOCD（中央ディレクトリの終端）を探す。注釈が付いていても
  // 届くよう、後ろ 64KB ぶんを見る。
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip の終端（EOCD）が見つかりません");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`中央ディレクトリの ${i} 番目の形が想定と違います`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("latin1");

    // 本体はローカルヘッダの後ろ。長さはローカル側の値で測る
    // （中央側と食い違うことがある）。
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    let body: Buffer;
    if (method === 0) body = raw;
    else if (method === 8) body = zlib.inflateRawSync(raw);
    else throw new Error(`未対応の圧縮方式: ${method}（${name}）`);

    entries.push({ name, body });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** zip の中から CSV を 1 本選ぶ。ディレクトリ項目や説明ファイルを飛ばす。 */
export function pickCsv(entries: ZipEntry[]): ZipEntry {
  const csv = entries.filter(
    (e) => /\.csv$/i.test(e.name) && e.body.length > 0,
  );
  if (csv.length === 0) {
    throw new Error(
      "zip の中に CSV がありません。入っていたもの:\n  " +
        entries.map((e) => `${e.name} (${e.body.length} bytes)`).join("\n  "),
    );
  }
  return csv[0];
}

/** 見出しがこれを含んでいれば、文字コードの読み方が合っている。 */
export const HEADER_MARK = "都道府県";

/**
 * 中身を文字にする。**文字コードを決め打ちにしない。**
 *
 * 位置参照情報は長く Shift-JIS だったが、決め打ちで読んだら見出しが
 * 化けて列が引けなかった（2026-08-16 の probe）。UTF-8 に変わった年度が
 * あるらしい。**両方で読んでみて、見出しが読めたほうを採る。**
 *
 * どちらでも読めなければ、両方の先頭行を添えて投げる。次に直すときに
 * 推測ではなく実際の中身から決められる（日本郵便の URL で 2 回外した
 * のと同じ轍を踏まないため）。
 */
export function decode(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }

  const utf8 = buf.toString("utf8");
  const sjis = new TextDecoder("shift_jis").decode(buf);
  const firstLine = (s: string) => s.split(/\r?\n/, 1)[0];

  if (firstLine(utf8).includes(HEADER_MARK)) return utf8;
  if (firstLine(sjis).includes(HEADER_MARK)) return sjis;

  // 見出しが無いページ（配布ページの HTML など）はそのまま返す。
  // CSV かどうかは呼び出し側が見出しで判断する。
  return sjis;
}

/** 読めなかったときに出す診断。両方の先頭行と生の先頭を見せる。 */
export function describeEncodings(buf: Buffer): string {
  const head = (s: string) => s.split(/\r?\n/, 1)[0].slice(0, 200);
  return (
    `  UTF-8 として: ${head(buf.toString("utf8"))}\n` +
    `  Shift-JIS として: ${head(new TextDecoder("shift_jis").decode(buf))}\n` +
    `  生の先頭 32 バイト: ${buf.subarray(0, 32).toString("hex")}`
  );
}

export interface IsjRow {
  pref: string;
  city: string;
  town: string;
  lat: number;
  lon: number;
}

/**
 * CSV を読む。列は見出し行の名前で引く。**位置で決め打ちしない**
 * （版が上がると列が増えることがある）。
 */
export function parseCsv(text: string): IsjRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const idx = (name: string) => header.findIndex((h) => h.includes(name));

  const iPref = idx("都道府県名");
  const iCity = idx("市区町村名");
  const iTown = idx("大字町丁目名");
  const iLat = idx("緯度");
  const iLon = idx("経度");

  if (iPref < 0 || iCity < 0 || iTown < 0 || iLat < 0 || iLon < 0) {
    throw new Error(
      `見出しに必要な列がありません: ${header.join(" / ")}\n` +
        "版が変わって列名が違う可能性があります。probe の出力を見てください。",
    );
  }

  const rows: IsjRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue; // 0,0 は大西洋上。方位が出てしまう
    rows.push({
      pref: cols[iPref],
      city: cols[iCity],
      town: cols[iTown],
      lat,
      lon,
    });
  }
  return rows;
}

/**
 * 「〜一丁目」の丁目を落とした形。
 *
 * 郵便番号側の町域は括弧の但し書きを外してあるので「丸の内」までしか
 * 無いが、位置参照情報は「丸の内一丁目」で持っている。そのままでは
 * 1 件も当たらない。丁目を落とした鍵でも引けるようにする。
 */
export function stripChome(town: string): string {
  return town.replace(/[一二三四五六七八九十〇零壱弐参百千]+丁目$/, "");
}

/** 鍵ごとに点を貯める。 */
export function push(
  groups: Map<string, { lat: number; lon: number }[]>,
  key: string,
  point: { lat: number; lon: number },
) {
  const list = groups.get(key);
  if (list) list.push(point);
  else groups.set(key, [point]);
}

/** 同じ鍵に複数の点があるときの代表点。**平均を取る。** */
export function averagePoint(points: { lat: number; lon: number }[]) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}
