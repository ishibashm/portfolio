export function chromiumLaunchArgs(baseArgs: string[]): string[] {
  // gVisor（第1世代）では単一プロセスの Chromium が SIGTRAP で落ちるため除外する。
  return [
    ...new Set([
      ...baseArgs.filter((arg) => arg !== "--single-process"),
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ]),
  ];
}
