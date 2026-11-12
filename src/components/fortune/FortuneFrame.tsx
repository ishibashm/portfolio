export function FortuneFrame({ srcdoc }: { srcdoc: string }) {
  return (
    <iframe
      title="AI装飾の運勢レポート"
      sandbox=""
      srcDoc={srcdoc}
      className="w-full h-[50svh] min-h-64 border-0 sm:h-[70svh] sm:min-h-[480px]"
    />
  );
}
