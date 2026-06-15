import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code") || "285A";

    // Clean up code (e.g. remove .T or other suffixes)
    const cleanCode = code.replace(/\.[a-zA-Z]+$/, "").trim();

    const url = `https://kabutan.jp/stock/kabuka?code=${cleanCode}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch from Kabutan: status ${res.status}` },
        { status: 500 },
      );
    }

    const html = await res.text();

    // Find the stock quotes table
    const tableStart = html.indexOf('class="stock_kabuka_dwm"');
    if (tableStart === -1) {
      return NextResponse.json(
        { error: "Stock quote table not found in Kabutan page." },
        { status: 404 },
      );
    }

    const tableEnd = html.indexOf("</table>", tableStart);
    if (tableEnd === -1) {
      return NextResponse.json(
        { error: "Table closing tag not found." },
        { status: 500 },
      );
    }

    const tableHtml = html.slice(tableStart - 20, tableEnd + 8); // include <table> tag start

    // Parse table rows
    const rows: any[] = [];
    const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let match;

    // Skip the first tr because it is the header
    let isHeader = true;

    while ((match = trRegex.exec(tableHtml)) !== null) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      const rowHtml = match[1];

      // Extract date from <th>
      const dateMatch = rowHtml.match(/<th[^>]*>(?:<time[^>]*>)?([^<]+)(?:<\/time>)?<\/th>/);
      if (!dateMatch) continue;
      const date = dateMatch[1].trim();

      // Extract values from <td>
      const tdRegex = /<td[^>]*>(?:<span[^>]*>)?([^<]+?)(?:<\/span>)?<\/td>/g;
      const cells: string[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        cells.push(tdMatch[1].trim());
      }

      if (cells.length < 5) continue;

      const cleanNum = (str: string) => {
        return parseFloat(str.replace(/,/g, "").replace(/[^\d.+\-]/g, "")) || 0;
      };

      const open = cleanNum(cells[0]);
      const high = cleanNum(cells[1]);
      const low = cleanNum(cells[2]);
      const close = cleanNum(cells[3]);
      const change = cleanNum(cells[4]);
      // cells[5] is change %
      const volume = cleanNum(cells[6] || cells[5] || "0"); // volume is usually the last cell

      rows.push({
        date,
        open,
        high,
        low,
        close,
        change,
        volume,
      });
    }

    // Sort chronologically (oldest first)
    const parseDateForSorting = (dateStr: string) => {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        let year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        if (year < 100) year += 2000;
        return new Date(year, month, day).getTime();
      }
      return 0;
    };

    rows.sort((a, b) => parseDateForSorting(a.date) - parseDateForSorting(b.date));

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("Kabutan Scrape Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
