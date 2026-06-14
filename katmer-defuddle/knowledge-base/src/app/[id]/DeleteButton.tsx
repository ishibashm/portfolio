"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export default function DeleteButton({
  id,
  isCompact = false,
}: {
  id: string;
  isCompact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/kb/api/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete document");
      }

      // If we are on the document page, go back to home. Otherwise just refresh.
      if (pathname === `/${id}`) {
        router.push("/");
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      alert("Failed to delete document");
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className={`inline-flex items-center justify-center gap-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50 ${isCompact ? "p-1" : "p-2"}`}
      title="Delete document"
    >
      {isDeleting ? (
        <Loader2 size={isCompact ? 16 : 18} className="animate-spin" />
      ) : (
        <Trash2 size={isCompact ? 16 : 18} />
      )}
    </button>
  );
}
