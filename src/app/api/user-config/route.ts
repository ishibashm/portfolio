import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encrypt } from '@/utils/encryption';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (!session || authError) {
      return NextResponse.json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    const body = await req.json();
    const {
      birth_date, birth_lat, birth_lon,
      base_lat, base_lon, void_zodiac_override,
      geminiKey
    } = body;

    const upsertData: any = {
      user_email: session.user.email,
    };

    if (birth_date !== undefined) upsertData.birth_date = birth_date;
    if (birth_lat !== undefined) upsertData.birth_lat = birth_lat;
    if (birth_lon !== undefined) upsertData.birth_lon = birth_lon;
    if (base_lat !== undefined) upsertData.base_lat = base_lat;
    if (base_lon !== undefined) upsertData.base_lon = base_lon;

    if (geminiKey) {
      upsertData.encrypted_gemini_key = encrypt(geminiKey);
    } else if (geminiKey === "") {
      // 空文字の場合はキーを削除
      upsertData.encrypted_gemini_key = null;
    }

    // upsert with Supabase
    const { error: upsertError } = await supabase
      .from('user_configs')
      .upsert(upsertData, { onConflict: 'user_email' });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Config Save Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save config' }, { status: 500 });
  }
}
