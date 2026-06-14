import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Key, Shield, ShieldCheck } from "lucide-react";
import { hasConfiguredApiKey, saveApiKey } from "./actions";

export default async function SettingsPage() {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);

  if (false) {
    // if (!session || !session.user) {
    redirect("/");
  }

  const hasKey = await hasConfiguredApiKey();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Settings
        </h1>
      </div>

      <div className="p-6 md:p-12 w-full max-w-3xl mx-auto overflow-y-auto flex-1">
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Key className="text-purple-500" size={24} />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              AI API Configuration
            </h2>
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            To use AI features like Auto-Categorization, Document Analysis, and
            the AI Chat Assistant, please provide your own Gemini API key. Your
            key is encrypted before being stored securely in the database.
          </p>

          {hasKey && (
            <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg flex items-center gap-3">
              <ShieldCheck
                className="text-emerald-600 dark:text-emerald-400"
                size={20}
              />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Your API Key is currently configured and securely stored.
              </span>
            </div>
          )}

          <form action={saveApiKey} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="geminiKey"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Google Gemini API Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Shield className="h-4 w-4 text-zinc-400" />
                </div>
                <input
                  type="password"
                  name="geminiKey"
                  id="geminiKey"
                  placeholder={
                    hasKey ? "Enter new key to update..." : "AIzaSy..."
                  }
                  className="block w-full pl-10 pr-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent sm:text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
              >
                {hasKey ? "Update API Key" : "Save API Key"}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
              How to get an API Key?
            </h3>
            <ol className="list-decimal list-inside text-sm text-zinc-600 dark:text-zinc-400 space-y-1 ml-1">
              <li>
                Go to{" "}
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Google AI Studio
                </a>
              </li>
              <li>Sign in with your Google Account</li>
              <li>Click on "Get API key" in the left sidebar</li>
              <li>Create an API key in a new or existing project</li>
              <li>Copy the key and paste it above</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
