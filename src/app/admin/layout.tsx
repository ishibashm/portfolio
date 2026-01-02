import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white p-6">
        <h2 className="text-xl font-bold mb-8">Admin Panel</h2>
        <nav>
          <ul>
            <li className="mb-4">
              <Link href="/admin" className="hover:text-gray-300">
                Dashboard
              </Link>
            </li>
            <li className="mb-4">
              <Link href="/" target="_blank" className="hover:text-gray-300">
                View Site
              </Link>
            </li>
            <li>
              {/* NextAuthのデフォルトログアウト */}
              <a href="/api/auth/signout" className="hover:text-red-400">
                Logout
              </a>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
