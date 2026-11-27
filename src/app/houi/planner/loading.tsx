export default function Loading() {
  return (
    <main className="wg-page min-h-screen px-4 py-10 text-ink">
      <div className="mx-auto max-w-5xl space-y-6">
        <p className="font-serif text-3xl font-bold">吉方位取りプランナー</p>
        <p role="status" aria-live="polite" className="wg-card p-4 text-sm">
          吉方位の日を計算しています…
        </p>
      </div>
    </main>
  );
}
