/**
 * サイト改善・成長フレームワーク。
 *
 * オンデマンドだけ。マージもデプロイも、ファイルの自動適用もしない。
 * 鍵は環境変数。レポートから広告 ID と計測パラメータは落とす。
 *
 *   npm run growth
 *   npm run growth -- --live
 *   npm run growth -- --provider openai
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  previousFindingsFromJson,
  runGrowthPipeline,
} from "../src/lib/growth/pipeline";
import { reportToMarkdown } from "../src/lib/growth/report";
import type { GrowthConfig, GrowthProviderName } from "../src/lib/growth/types";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.some((arg) => ["--merge", "--deploy", "--apply"].includes(arg))) {
  fail("マージ、デプロイ、ファイルの自動適用はしません。");
}

const root = process.cwd();
const config = JSON.parse(
  readFileSync(join(root, "growth.config.json"), "utf8"),
) as GrowthConfig;
const providerIndex = argv.indexOf("--provider");
if (providerIndex >= 0) {
  const name = argv[providerIndex + 1] as GrowthProviderName | undefined;
  if (!name || !config.providers[name])
    fail(`provider が設定に無い: ${name ?? ""}`);
  config.provider = name;
}

const stampIndex = argv.indexOf("--stamp");
const stamp =
  stampIndex >= 0
    ? argv[stampIndex + 1]
    : new Date().toISOString().slice(0, 10);
if (!stamp || !/^\d{4}-\d{2}-\d{2}$/.test(stamp)) fail("stamp は YYYY-MM-DD");

const live = argv.includes("--live") && !argv.includes("--no-live");
const outRoot = join(root, config.outputDir);

function previousRaw(): string | null {
  if (!existsSync(outRoot)) return null;
  const days = readdirSync(outRoot)
    .filter(
      (name) =>
        name !== stamp && existsSync(join(outRoot, name, "report.json")),
    )
    .sort();
  const last = days.at(-1);
  if (!last) return null;
  return readFileSync(join(outRoot, last, "report.json"), "utf8");
}

async function main() {
  const report = await runGrowthPipeline({
    root,
    config,
    now: new Date().toISOString(),
    live,
    previousFindings: previousFindingsFromJson(previousRaw()),
  });

  const out = join(outRoot, stamp);
  mkdirSync(out, { recursive: true });
  const jsonPath = join(out, "report.json");
  const mdPath = join(out, "report.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, reportToMarkdown(report));
  try {
    execFileSync("node_modules/.bin/prettier", ["--write", jsonPath, mdPath], {
      stdio: "ignore",
    });
  } catch {
    console.error("prettier を掛けられなかった。レポートはそのまま残した。");
  }
  console.log(out);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "実行に失敗しました";
  console.error(message);
  process.exit(1);
});
