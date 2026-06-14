import { convertToModelMessages } from "ai";

const messages = [
  {
    role: "user",
    content: "Xの最近の投稿を取得して",
    id: "Wxt1GaTDvPEMiMpN",
  },
  {
    id: "7jma1b3NCGSqVnQo",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "「Xの最近の投稿」を取得するためには、**どのような情報**を探しているか、または**どのユーザー**の投稿が知りたいか、もう少し具体的な情報が必要です。",
      },
    ],
  },
  {
    role: "user",
    content: "AI技術",
    id: "qSn2dGiRfwPrReta",
  },
];

const sanitizedMessages = messages.map((m) => {
  let newParts = m.parts
    ? m.parts.filter((p) => p.type !== "reasoning" && p.type !== "step-start")
    : [];
  if (!m.parts && m.content) {
    newParts = [{ type: "text", text: m.content }];
  }
  return { ...m, parts: newParts };
});

const modelMessages = convertToModelMessages(sanitizedMessages);
console.log(JSON.stringify(modelMessages, null, 2));
