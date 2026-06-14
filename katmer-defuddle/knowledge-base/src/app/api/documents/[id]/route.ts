import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }, // In Next.js 15, params is expected to be a Promise
) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id, user_id: session.user.id },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id },
    });

    if (!doc || doc.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized or document not found" },
        { status: 404 },
      );
    }

    const document = await prisma.knowledgeDocument.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        tags: data.tags,
        category: data.category,
        domain: data.domain,
        updated_at: new Date(),
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id },
    });

    if (!doc || doc.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized or document not found" },
        { status: 404 },
      );
    }

    await prisma.knowledgeDocument.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
