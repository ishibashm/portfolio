"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { encrypt, decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";

export async function saveApiKey(formData: FormData) {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);

  if (false) {
    // if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const apiKey = formData.get("geminiKey") as string;
  let encryptedKey = null;

  if (apiKey && apiKey.trim() !== "") {
    encryptedKey = encrypt(apiKey.trim());
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      encrypted_gemini_key: encryptedKey,
    } as any,
  });

  revalidatePath("/settings");
}

export async function hasConfiguredApiKey() {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);
  if (!session || !session.user) return false;

  const user = (await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { encrypted_gemini_key: true } as any,
  })) as any;

  return !!user?.encrypted_gemini_key;
}

export async function getUserApiKey(): Promise<string | null> {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);
  if (!session || !session.user) return null;

  const user = (await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { encrypted_gemini_key: true } as any,
  })) as any;

  if (!user || !user.encrypted_gemini_key) return null;

  return decrypt(user.encrypted_gemini_key);
}
