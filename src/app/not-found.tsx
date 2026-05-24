import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>ページが見つかりません (Not Found)</h2>
      <p>お探しのリソースは見つかりませんでした。</p>
      <Link href="/">ホームへ戻る</Link>
    </div>
  )
}
