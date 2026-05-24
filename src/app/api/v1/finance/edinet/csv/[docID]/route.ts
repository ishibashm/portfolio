import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ docID: string }> }
) {
  try {
    const { docID } = await params;
    const apiKey = process.env.EDINET_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'EDINET APIキーが設定されていません。.envに EDINET_API_KEY を設定してください。' 
      }, { status: 500 });
    }

    // EDINET API V2 から直接CSVファイル (type=5) または PDF (type=2) をダウンロードするURL
    // ブラウザで直接ダウンロードさせるためにリダイレクトする
    const downloadUrl = `https://api.edinet-fsa.go.jp/api/v2/documents/${docID}?type=5&Subscription-Key=${apiKey}`;
    
    return NextResponse.redirect(downloadUrl);
  } catch (error: any) {
    console.error("Failed to redirect to EDINET CSV:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
