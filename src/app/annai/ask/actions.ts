"use server";

import { cookies, headers } from "next/headers";
import {
  answerFreeQuestion,
  createInitialFreeAnswerState,
  type FreeAnswerResult,
  type FreeQuestionConditions,
} from "@/lib/guide/guideFreeform";
import {
  GUIDE_MEMORY_COOKIE,
  guideMemoryConfig,
  readMemory,
} from "@/lib/guide/guideMemory";
import {
  GUIDE_SESSION_MAX_TURNS,
  guideSessionKey,
  sealFormToken,
} from "@/lib/guide/guideSession";

const MAX_RAW_QUESTION_CHARS = 1_000;
const MAX_RAW_SESSION_CHARS = 12_000;
const MAX_RAW_TOKEN_CHARS = 2_048;

export async function askAction(
  prev: FreeAnswerResult,
  formData: FormData,
): Promise<FreeAnswerResult> {
  const opEntry = formData.get("op");
  const op = typeof opEntry === "string" ? opEntry : "ask";

  if (op === "end") {
    return createInitialFreeAnswerState(
      process.env,
      "会話を終えました。新しく質問できます。",
    );
  }

  const rawQ = formData.get("q");
  const rawS = formData.get("s");
  const rawFt = formData.get("ft");
  const rawWebsite = formData.get("website");

  const qStr = typeof rawQ === "string" ? rawQ : "";
  const sStr = typeof rawS === "string" ? rawS : "";
  const ftStr = typeof rawFt === "string" ? rawFt : "";
  const websiteStr = typeof rawWebsite === "string" ? rawWebsite : "";

  if (
    typeof rawQ !== "string" ||
    qStr.length > MAX_RAW_QUESTION_CHARS ||
    sStr.length > MAX_RAW_SESSION_CHARS ||
    ftStr.length > MAX_RAW_TOKEN_CHARS
  ) {
    const key = guideSessionKey(process.env);
    return {
      status: "invalid_input",
      message: "質問は1文字以上200字以内で入力してください。",
      sentences: [],
      links: [],
      trace: [],
      session:
        sStr.length > 0 && sStr.length <= MAX_RAW_SESSION_CHARS
          ? sStr
          : undefined,
      formToken: key ? sealFormToken(key) : undefined,
      turn: prev?.turn ?? 0,
      maxTurns: GUIDE_SESSION_MAX_TURNS,
      question: "",
    };
  }

  const reqHeaders = await headers();
  let conditions: FreeQuestionConditions | undefined;
  if (guideMemoryConfig(process.env).enabled) {
    try {
      const cookieStore = await cookies();
      const memCookie = cookieStore.get(GUIDE_MEMORY_COOKIE)?.value;
      const memRes = await readMemory(memCookie, { touch: true });
      if (memRes.status === "ok") {
        const { star, pref, topics } = memRes.memory;
        if (
          star !== undefined ||
          pref !== undefined ||
          (topics && topics.length > 0)
        ) {
          conditions = {
            ...(star !== undefined ? { star } : {}),
            ...(pref !== undefined ? { pref } : {}),
            ...(topics && topics.length > 0 ? { topics } : {}),
          };
        }
      }
    } catch {
      conditions = undefined;
    }
  }

  return answerFreeQuestion({
    question: qStr,
    sessionSealed: sStr || undefined,
    formToken: ftStr,
    honeypot: websiteStr || undefined,
    headers: reqHeaders,
    ...(conditions ? { conditions } : {}),
  });
}
