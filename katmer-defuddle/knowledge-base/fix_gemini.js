const fs = require("fs");
const path = require("path");
const files = [
  "src/app/api/upload/route.ts",
  "src/app/api/documents/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/[id]/actions.ts",
];
files.forEach((f) => {
  try {
    const filePath = path.join(process.cwd(), f);
    if (!fs.existsSync(filePath)) {
      console.log("File not found: " + filePath);
      return;
    }
    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/gemini\-3\.1\-flash\-lite/g, "gemini-2.5-flash");
    content = content.replace(/gemini\-3\.1\-pro/g, "gemini-2.5-pro");
    fs.writeFileSync(filePath, content);
    console.log("Updated " + f);
  } catch (e) {
    console.error("Error with " + f + ":", e.message);
  }
});
