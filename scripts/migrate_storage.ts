import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
// import mime from 'mime-types'; // Removed to avoid missing types

// Load env vars explicitly
dotenv.config();
// Load env vars explicitly
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const prisma = new PrismaClient();

const BUCKET_NAME = "portfolio-assets";
const LOCAL_DIR = path.join(process.cwd(), "public", "images", "sanpeki");
const PROJECT_ID = "sanpeki-ki";

async function main() {
  console.log("--- Starting Storage Migration ---");

  // 1. Create Bucket (if not exists)
  const { data: buckets, error: bucketError } =
    await supabase.storage.listBuckets();
  if (bucketError) throw bucketError;

  const bucketExists = buckets.find((b) => b.name === BUCKET_NAME);
  if (!bucketExists) {
    console.log(`Creating bucket '${BUCKET_NAME}'...`);
    const { error: createError } = await supabase.storage.createBucket(
      BUCKET_NAME,
      {
        public: true,
        fileSizeLimit: 5242880, // 5MB
      },
    );
    if (createError) throw createError;
  } else {
    console.log(`Bucket '${BUCKET_NAME}' exists.`);
    // Ensure public
    if (!bucketExists.public) {
      console.log("Updating bucket to public...");
      await supabase.storage.updateBucket(BUCKET_NAME, { public: true });
    }
  }

  // 2. Upload Images
  if (!fs.existsSync(LOCAL_DIR)) {
    console.error(`Local directory not found: ${LOCAL_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(LOCAL_DIR)
    .filter((f) => f.endsWith(".png") || f.endsWith(".jpg"));
  console.log(`Found ${files.length} files to upload.`);

  for (const file of files) {
    const filePath = path.join(LOCAL_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    // Basic MIME type guessing
    const contentType = file.endsWith(".png") ? "image/png" : "image/jpeg";

    const storagePath = `sanpeki/${file}`; // folder structure inside bucket

    console.log(`Uploading ${file} to ${storagePath}...`);

    const { data, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload ${file}:`, uploadError.message);
      continue;
    }

    // 3. Get Public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    console.log(`-> URL: ${publicUrl}`);

    // 4. Update Database
    // We find the record by matching part of the caption or order?
    // Or we just update matching 'url' if it matches filename?
    // Current DB url is just "filename.png" (e.g. "20261.png").

    // Match filename, handling the rename case
    let dbUrlForSearch = file;
    if (file === "202600.png") {
      dbUrlForSearch = "2026年年盤.png"; // Map back to what's in DB to find the record
    }

    const updateResult = await prisma.portfolioImage.updateMany({
      where: {
        projectId: PROJECT_ID,
        url: dbUrlForSearch,
      },
      data: {
        url: publicUrl, // Update to new Public URL
      },
    });

    if (updateResult.count > 0) {
      console.log(`-> Updated DB record for ${file}`);
    } else {
      console.log(
        `-> Warning: No matching DB record found for ${file}, attempting backup match...`,
      );
      // Backup: update by caption parsing or Order?
      // Actually, if we just ran seed, the URL is filename.
      // If the user already changed seed, it might be different.
      // Let's rely on filename match first.
    }
  }

  console.log("--- Migration Complete ---");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
