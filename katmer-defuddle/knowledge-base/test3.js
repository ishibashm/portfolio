const { convertToModelMessages, streamText } = require("ai");
const payload = [
  { role: "user", content: "Xから投稿を取得して", id: "1" },
  {
    id: "2",
    role: "assistant",
    parts: [
      { type: "step-start" },
      { type: "reasoning", text: "Thinking... " },
      { type: "text", text: "What?" },
    ],
    state: "done",
  },
];

const sanitizedMessages = payload.map((m) => {
  let newParts = m.parts
    ? m.parts.filter((p) => p.type !== "reasoning" && p.type !== "step-start")
    : [];
  if (!m.parts && m.content) {
    newParts = [{ type: "text", text: m.content }];
  }
  return { ...m, parts: newParts };
});

async function run() {
  try {
    const modelMessages = await convertToModelMessages(sanitizedMessages);
    console.log("Converted:", JSON.stringify(modelMessages, null, 2));
  } catch (e) {
    console.error("Error:", e.stack);
  }
}
run();
