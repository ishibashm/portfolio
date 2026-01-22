import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { deletePost } from "./actions";

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  if (!prisma) {
    return <div className="p-8">Database connection failed</div>;
  }
  const posts = await prisma.blogPost.findMany({
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Link
          href="/admin/posts/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Create New
        </Link>
      </div>

      <div className="bg-white text-black rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4 text-left">Title</th>
              <th className="p-4 text-left">Date</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-t border-gray-200">
                <td className="p-4">{post.title}</td>
                <td className="p-4">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </td>
                <td className="p-4">
                  <span
                    className={`px-2 py-1 rounded text-xs ${post.published
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                      }`}
                  >
                    {post.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="text-blue-600 hover:underline mr-4"
                  >
                    Edit
                  </Link>
                  <form action={deletePost.bind(null, post.id)} className="inline">
                    <button
                      type="submit"
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
