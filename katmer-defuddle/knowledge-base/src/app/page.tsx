import { prisma } from "@/lib/prisma";
import DocumentList from "@/components/DocumentList";

export const dynamic = "force-dynamic";

export default async function KnowledgeBaseHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const params = await searchParams;

  // 初期データとして、ドキュメントを取得（ローカルDBに移行したため全件一括取得が可能）
  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      kb_id: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      category: true,
      created_at: true,
      // content: true を除外して高速化
    },
  });

  return (
    <DocumentList
      initialDocuments={documents}
      initialQuery={params.q}
      initialCategory={params.category}
      initialStatus={params.status}
    />
  );
}
