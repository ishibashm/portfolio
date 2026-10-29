export function FortuneFrame({ srcdoc }: { srcdoc: string }) {
  return (
    <iframe
      title="AI装飾の運勢レポート"
      sandbox=""
      srcDoc={srcdoc}
      style={{ width: "100%", height: "70vh", minHeight: 480, border: 0 }}
    />
  );
}
