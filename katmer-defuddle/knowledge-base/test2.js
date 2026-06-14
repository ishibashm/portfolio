const { streamText } = require("ai");
const { createOpenAI } = require("@ai-sdk/openai");
async function run() {
  const provider = createOpenAI({
    apiKey: "dummy",
    baseURL: "http://localhost",
  });
  const res = await streamText({
    model: provider("dummy"),
    prompt: "hi",
  });
  console.log(Object.keys(res));
  if (typeof res.toDataStreamResponse === "function")
    console.log("has toDataStreamResponse");
  else if (typeof res.toAIStreamResponse === "function")
    console.log("has toAIStreamResponse");
  else if (typeof res.toResponse === "function") console.log("has toResponse");
}
run().catch(console.error);
