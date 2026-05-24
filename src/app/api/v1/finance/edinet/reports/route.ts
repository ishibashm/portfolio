import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  try {
    const apiKey = process.env.EDINET_API_KEY;
    if (!apiKey) {
      // APIキーがない場合のモックデータ（またはエラーを返す）
      console.warn("EDINET_API_KEY is not set. Returning empty list or mock data.");
      return NextResponse.json({ 
        error: 'EDINET APIキーが設定されていません。.envに EDINET_API_KEY を設定してください。' 
      }, { status: 500 });
    }

    const apiUrl = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${apiKey}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`EDINET API responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.results) {
      return NextResponse.json({ reports: [] });
    }

    // 「有価証券報告書」「大量保有報告書」「四半期報告書」などに絞り込む
    const filteredReports = data.results.filter((doc: any) => {
      if (!doc.docDescription) return false;
      return doc.docDescription.includes('報告書');
    });

    const reports = filteredReports.map((doc: any) => ({
      docID: doc.docID,
      docDescription: doc.docDescription,
      filerName: doc.filerName,
      submitDateTime: doc.submitDateTime,
    }));

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error("Failed to fetch EDINET reports:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
