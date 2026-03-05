"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { extractArticle } from "./actions";

export default function DefuddlePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveSaving, setDriveSaving] = useState(false);

  // Load Google Identity Services script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await extractArticle(url);
      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.error);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      alert("Copied directly to clipboard!");
    }
  };

  const downloadAsFile = () => {
    if (result?.content) {
      const blob = new Blob([result.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = result.title
        ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
        : "extracted_article";
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const uploadToGoogleDrive = async (accessToken: string) => {
    if (!result?.content) return;
    setDriveSaving(true);
    
    try {
      const safeTitle = result.title
        ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
        : "extracted_article";
      const fileName = `${safeTitle}.md`;

      const metadata = {
        name: fileName,
        mimeType: "text/markdown",
      };

      const fileContent = result.content;

      const form = new FormData();
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      form.append(
        "file",
        new Blob([fileContent], { type: "text/markdown" })
      );

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: form,
        }
      );

      if (response.ok) {
        alert(`Successfully saved "${fileName}" to Google Drive!`);
      } else {
        const errData = await response.json();
        console.error("Drive Error:", errData);
        alert(`Failed to save to Google Drive: ${errData.error?.message || response.statusText}`);
      }
    } catch (err) {
      console.error("Upload Error:", err);
      alert("An error occurred while uploading to Google Drive.");
    } finally {
      setDriveSaving(false);
    }
  };

  const handleSaveToDrive = () => {
    if (!window.google?.accounts?.oauth2) {
      alert("Google Identity Services failed to load. Please refresh the page.");
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert("Google Client ID is not configured in the environment variables.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          throw window.google.accounts.oauth2.TokenError(tokenResponse);
        }
        uploadToGoogleDrive(tokenResponse.access_token);
      },
    });

    tokenClient.requestAccessToken();
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-600 bg-white border border-neutral-200 rounded-full shadow-sm hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>
      <div className="max-w-3xl mx-auto pt-8">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-neutral-900">
            Defuddle <span className="text-blue-600">Web</span>
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            Extract clean, readable markdown from any web page URL instantly.
          </p>
        </div>

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden mb-8 border border-neutral-100">
          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="flex-1 rounded-xl border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg py-3 px-4 border"
                disabled={loading || driveSaving}
              />
              <button
                type="submit"
                disabled={loading || driveSaving}
                className="inline-flex justify-center items-center px-8 py-3 border border-transparent text-lg font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Extracting...
                  </span>
                ) : (
                  "Extract"
                )}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-neutral-100 flex flex-col">
            <div className="bg-neutral-50 border-b border-neutral-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 w-full">
                <h2 className="text-lg font-bold text-neutral-800 line-clamp-1">{result.title}</h2>
                <div className="text-sm text-neutral-500 flex flex-wrap gap-4 mt-1">
                  {result.author && <span>By {result.author}</span>}
                  {result.site && <span>From {result.site}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center px-4 py-2 border border-blue-600 text-sm font-medium rounded-lg text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Copy Markdown
                </button>
                <button
                  onClick={downloadAsFile}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Download .md
                </button>
                <button
                  onClick={handleSaveToDrive}
                  disabled={driveSaving}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-[#1fa463] hover:bg-[#198751] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1fa463] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {driveSaving ? (
                    <span className="flex items-center gap-1">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                        <path d="M58.3 52l29-50-29.2-2L0 52l29 50 29.3-50z" fill="#FFC107"/>
                        <path d="M87.3 52l-29 50H0l29-50h58.3z" fill="#1976D2"/>
                        <path d="M29 0h58.3l-29 50H0L29 0z" fill="#4CAF50"/>
                      </svg>
                      Save to Drive
                    </span>
                  )}
                </button>
              </div>
            </div>
            <div className="p-6">
              <textarea
                readOnly
                value={result.content}
                className="w-full h-[500px] p-4 text-sm font-mono text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
