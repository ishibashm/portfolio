"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  PlusSquare,
  Globe,
  Settings,
  Terminal,
  LogOut,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = {
    data: { user: { name: "Local Admin", email: "admin@local" } },
  } as any; // const { data: session } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navigation = [
    { name: "Knowledge Base", href: "/", icon: BookOpen },
    { name: "Smart Search", href: "/smart-search", icon: Sparkles },
    { name: "New Document", href: "/new", icon: PlusSquare },
    { name: "Web Extractor", href: "/extract", icon: Globe },
    { name: "System Map", href: "/system-graph", icon: Globe },
    { name: "Analytics Dashboard", href: "/analytics", icon: BarChart3 },
    { name: "LLM Wiki", href: "/wiki", icon: BookOpen },
  ];

  return (
    <div
      className={`flex h-full flex-col bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 ease-in-out relative ${isCollapsed ? "w-[68px]" : "w-64"}`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm z-50 transition-colors"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <PanelLeftOpen size={14} />
        ) : (
          <PanelLeftClose size={14} />
        )}
      </button>

      <div
        className={`flex h-16 items-center gap-2 px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0 ${isCollapsed ? "justify-center" : ""}`}
      >
        <Terminal className="h-6 w-6 shrink-0 text-blue-600" />
        {!isCollapsed && (
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight whitespace-nowrap overflow-hidden">
            Katmer Base
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-6">
        <div>
          {!isCollapsed && (
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">
              Navigation
            </div>
          )}
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={isCollapsed ? item.name : undefined}
                  className={`group flex items-center ${isCollapsed ? "justify-center" : "justify-between"} rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-200/50 dark:bg-zinc-800/50 text-blue-600 dark:text-blue-400"
                      : "text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      className={`h-5 w-5 shrink-0 transition-colors ${
                        isActive
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                      }`}
                      aria-hidden="true"
                    />
                    {!isCollapsed && (
                      <span className="whitespace-nowrap">{item.name}</span>
                    )}
                  </div>
                </Link>
              );
            })}
            <button
              onClick={() =>
                window.dispatchEvent(new Event("open-global-uploader"))
              }
              title={isCollapsed ? "Import Documents" : undefined}
              className={`w-full group flex items-center ${isCollapsed ? "justify-center" : "justify-between"} rounded-md px-2 py-2 text-sm font-medium transition-colors text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100`}
            >
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 shrink-0 transition-colors text-zinc-400 group-hover:text-green-500"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {!isCollapsed && (
                  <span className="whitespace-nowrap">Import Documents</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2 shrink-0 ${isCollapsed ? "flex flex-col items-center px-2" : ""}`}
      >
        {session ? (
          <>
            {!isCollapsed && (
              <div className="px-2 py-1 text-sm text-zinc-700 dark:text-zinc-400 truncate w-full">
                {session.user?.email}
              </div>
            )}
            <button
              onClick={() => signOut()}
              title={isCollapsed ? "Sign Out" : undefined}
              className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors ${isCollapsed ? "justify-center" : ""}`}
            >
              <LogOut className="h-5 w-5 shrink-0 text-zinc-400" />
              {!isCollapsed && <span>Sign Out</span>}
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            title={isCollapsed ? "Sign In" : undefined}
            className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors ${isCollapsed ? "justify-center" : ""}`}
          >
            <LogIn className="h-5 w-5 shrink-0 text-zinc-400" />
            {!isCollapsed && <span>Sign In</span>}
          </button>
        )}
        <Link
          href="/settings"
          title={isCollapsed ? "Settings" : undefined}
          className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors ${isCollapsed ? "justify-center" : ""}`}
        >
          <Settings className="h-5 w-5 shrink-0 text-zinc-400" />
          {!isCollapsed && <span>Settings</span>}
        </Link>
      </div>
    </div>
  );
}
