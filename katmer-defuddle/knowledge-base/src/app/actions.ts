"use server";

import { prisma } from "@/lib/prisma";

export async function searchContent(
  query: string,
  category?: string,
  status?: string,
) {
  if (!query) return [];

  // 1. DB検索
  const whereClause: any = {
    content: {
      contains: query,
      mode: "insensitive",
    },
  };

  if (category) {
    whereClause.category = category;
  }
  if (status) {
    whereClause.status = status;
  }

  const documents = await prisma.knowledgeDocument.findMany({
    where: whereClause,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      content: true,
    },
    take: 50,
  });

  const results = documents.map((doc) => ({
    id: doc.id,
    content: doc.content,
  }));

  return results;
}

export async function downloadAllContents(ids?: string[]) {
  const whereClause: any = {};

  if (ids && ids.length > 0) {
    whereClause.id = { in: ids };
  }

  let documents: any[] = [];

  if (!ids || ids.length === 0 || ids.length > 0) {
    documents = await prisma.knowledgeDocument.findMany({
      where: whereClause,
      select: {
        id: true,
        kb_id: true,
        title: true,
        content: true,
      },
    });
  }

  return documents;
}
