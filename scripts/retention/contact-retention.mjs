// 自動実行には組み込まず、既定は件数確認だけにする。
import { register } from "node:module";
register(new URL("./typescript-loader.mjs", import.meta.url));
const { runContactRetention } =
  await import("../../src/lib/retention/contactRetention.ts");
try {
  console.log(
    JSON.stringify(
      await runContactRetention({ dryRun: !process.argv.includes("--apply") }),
    ),
  );
} catch {
  console.error("Contact retention failed");
  process.exitCode = 1;
} finally {
  const { default: prisma } = await import("../../src/lib/prisma.ts");
  await prisma.$disconnect();
}
