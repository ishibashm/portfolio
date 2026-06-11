import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline";
import prisma from "../src/lib/prisma";

async function main() {
  const downloadsDir = path.join(process.cwd(), "x_downloads");
  if (!fs.existsSync(downloadsDir)) {
    console.log("No x_downloads directory found.");
    return;
  }

  const files = fs
    .readdirSync(downloadsDir)
    .filter((file) => file.endsWith("_data.jsonl"));
  let totalImported = 0;

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(downloadsDir, file);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let count = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);

        await prisma.xPost.upsert({
          where: { id: data.id },
          update: {
            url: data.url || "",
            authorHandle: data.author_handle || "",
            authorDisplay: data.author_display || "",
            datetime: data.datetime ? new Date(data.datetime) : new Date(),
            text: data.text || "",
            quotedUrls: data.quoted_urls || [],
            externalLinks: data.external_links || [],
            savedMedia: data.saved_media || [],
          },
          create: {
            id: data.id,
            url: data.url || "",
            authorHandle: data.author_handle || "",
            authorDisplay: data.author_display || "",
            datetime: data.datetime ? new Date(data.datetime) : new Date(),
            text: data.text || "",
            quotedUrls: data.quoted_urls || [],
            externalLinks: data.external_links || [],
            savedMedia: data.saved_media || [],
          },
        });
        count++;
        totalImported++;
      } catch (e) {
        console.error(`Error processing line in ${file}:`, e);
      }
    }
    console.log(`Imported ${count} posts from ${file}.`);
  }

  console.log(`\nDone! Total imported: ${totalImported}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
