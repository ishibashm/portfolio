/**
 * Parses Google AI Studio chat export JSON into a Markdown conversation.
 * Handles various possible structures of the exported JSON.
 */
export function parseAiStudioJson(jsonString: string): string {
  try {
    const data = JSON.parse(jsonString);
    let markdown = "";

    // Check for different known structures
    if (Array.isArray(data)) {
      markdown = processMessageArray(data);
    } else if (data.chunkedPrompt && Array.isArray(data.chunkedPrompt.chunks)) {
      markdown = processMessageArray(data.chunkedPrompt.chunks);
    } else if (data.contents && Array.isArray(data.contents)) {
      markdown = processMessageArray(data.contents);
    } else if (data.history && Array.isArray(data.history)) {
      markdown = processMessageArray(data.history);
    } else if (data.messages && Array.isArray(data.messages)) {
      markdown = processMessageArray(data.messages);
    } else if (
      data.prompt &&
      data.prompt.messages &&
      Array.isArray(data.prompt.messages)
    ) {
      markdown = processMessageArray(data.prompt.messages);
    } else if (
      data.prompt &&
      data.prompt.contents &&
      Array.isArray(data.prompt.contents)
    ) {
      markdown = processMessageArray(data.prompt.contents);
    } else if (data.modelHistory && Array.isArray(data.modelHistory)) {
      markdown = processMessageArray(data.modelHistory);
    } else {
      // 見つからなかった場合は一番長い配列を探す（ヒューリスティック）
      let longestArray: any[] = [];
      Object.keys(data).forEach((key) => {
        if (
          Array.isArray(data[key]) &&
          data[key].length > longestArray.length
        ) {
          // 要素が role や content を持っているか簡易チェック
          if (
            data[key][0] &&
            (data[key][0].role ||
              data[key][0].author ||
              data[key][0].content ||
              data[key][0].parts ||
              data[key][0].text)
          ) {
            longestArray = data[key];
          }
        }
      });

      if (longestArray.length > 0) {
        markdown = processMessageArray(longestArray);
      } else {
        markdown =
          "Unrecognized JSON structure. Raw content:\n\n```json\n" +
          JSON.stringify(data, null, 2) +
          "\n```";
      }
    }

    return markdown.trim();
  } catch (error) {
    console.error("Failed to parse AI Studio JSON:", error);
    return (
      "Error parsing JSON file. It might not be a valid JSON format.\n\nRaw content:\n" +
      jsonString
    );
  }
}

function processMessageArray(messages: any[]): string {
  let md = "";

  messages.forEach((msg, index) => {
    // Determine the role
    let role = msg.role || msg.author || "unknown";

    // Normalize role names
    if (role.toLowerCase() === "user") {
      role = "👤 User";
    } else if (
      role.toLowerCase() === "model" ||
      role.toLowerCase() === "assistant" ||
      role.toLowerCase() === "ai"
    ) {
      role = "🤖 AI";
    } else {
      // Capitalize first letter
      role = role.charAt(0).toUpperCase() + role.slice(1);
    }

    // Extract content
    let content = "";

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (typeof msg.text === "string") {
      content = msg.text;
    } else if (msg.parts && Array.isArray(msg.parts)) {
      // Gemini API format: parts: [{ text: "..." }]
      content = msg.parts.map((p: any) => p.text || "").join("\n");
    } else if (msg.content && Array.isArray(msg.content)) {
      // Some other structures
      content = msg.content.map((c: any) => c.text || "").join("\n");
    } else {
      content = JSON.stringify(msg);
    }

    // Add to markdown
    md += `### ${role}\n\n${content.trim()}\n\n---\n\n`;
  });

  return md;
}
