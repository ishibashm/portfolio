'use client'

import { BlogPost } from "@prisma/client";

export default function PostForm({
  post,
  action,
}: {
  post?: BlogPost;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="space-y-6 bg-white p-8 rounded shadow text-black">
      <div>
        <label className="block text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          name="title"
          defaultValue={post?.title}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Slug</label>
        <input
          type="text"
          name="slug"
          defaultValue={post?.slug}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Content (Markdown)</label>
        <textarea
          name="content"
          rows={10}
          defaultValue={post?.content}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border font-mono"
        />
      </div>

      <div className="flex items-center">
        <input
          id="published"
          name="published"
          type="checkbox"
          defaultChecked={post?.published}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="published" className="ml-2 block text-sm text-gray-900">
          Publish immediately
        </label>
      </div>

      <div>
        <button
          type="submit"
          className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Save
        </button>
      </div>
    </form>
  );
}
