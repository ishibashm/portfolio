import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const gasUrl = process.env.GAS_WEBAPP_URL || process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    console.error("GAS Web App URL is not configured in environment variables.");
    return NextResponse.json(
      { error: 'Backend server URL is not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json(
        { error: 'メールアドレスを入力してください。' },
        { status: 400 }
      );
    }

    // Server-side email basic validation check
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '無効なメールアドレス形式です。' },
        { status: 400 }
      );
    }

    // Forward the POST request to the GAS Web App
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error(`GAS returned error status on POST: ${response.status}`);
      return NextResponse.json(
        { error: `Backend service returned error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    
    // Check if the internal payload contains status = duplicate or error
    if (data.status === 'duplicate') {
      return NextResponse.json(
        { message: data.message || 'このメールアドレスは既に登録されています。' },
        { status: 409 }
      );
    } else if (data.status === 'error') {
      return NextResponse.json(
        { message: data.message || '登録中にエラーが発生しました。' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: data.message || '購読登録が完了しました！'
    });
  } catch (error: any) {
    console.error("Error proxying newsletter subscription POST request:", error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
