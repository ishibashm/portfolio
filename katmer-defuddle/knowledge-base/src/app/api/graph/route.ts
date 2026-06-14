import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET() {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.knowledgeDocument.findMany({
      where: { user_id: session.user.id },
      take: 1000, // 描画パフォーマンスのため上限を設ける
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        category: true,
        tags: true,
        // contentは不要なので除外
      },
    });

    const nodes: any[] = [];
    const links: any[] = [];

    // Track unique tags across all documents to create central tag nodes
    const tagMap = new Map<string, number>();

    documents.forEach((doc) => {
      // Create Document Node
      nodes.push({
        id: doc.id,
        name: doc.title,
        group: "document",
        type: doc.type,
        status: doc.status,
        val: 1, // Base size
      });

      // Extract and count tags
      if (Array.isArray(doc.tags)) {
        doc.tags.forEach((t) => {
          const tag = String(t).trim();
          if (!tag) return;
          const currentCount = tagMap.get(tag) || 0;
          tagMap.set(tag, currentCount + 1);

          // Create link from document to tag
          links.push({
            source: doc.id,
            target: `tag_${tag}`,
            val: 1,
          });
        });
      }

      // Also treat category as a super-tag if present
      if (doc.category && doc.category !== "Uncategorized") {
        const cat = String(doc.category).trim();
        const catId = `cat_${cat}`;
        nodes.push({
          id: catId,
          name: cat,
          group: "category",
          val: 8, // Make category nodes large
        });
        links.push({
          source: doc.id,
          target: catId,
          val: 2, // Stronger link
        });
      }
    });

    // Create Tag Nodes
    tagMap.forEach((count, tag) => {
      nodes.push({
        id: `tag_${tag}`,
        name: tag,
        group: "tag",
        val: Math.min(10, count * 2), // Size grows with popularity, max size 10
      });
    });

    // Remove potential duplicates if category and tags overlap, though IDs prevent strict collision.
    // For safety, force unique node IDs.
    const uniqueNodes = Array.from(
      new Map(nodes.map((item) => [item.id, item])).values(),
    );

    return NextResponse.json({ nodes: uniqueNodes, links });
  } catch (error) {
    console.error("Error fetching graph data:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data" },
      { status: 500 },
    );
  }
}
