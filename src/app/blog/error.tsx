'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
      <div className="text-center p-8 border border-red-500/50 rounded-xl bg-red-900/20 max-w-2xl w-full">
        <h2 className="text-3xl font-bold text-red-400 mb-4">Something went wrong!</h2>
        <p className="text-gray-300 mb-6">
          The blog section encountered an unexpected error.
        </p>
        
        <div className="bg-black/50 p-4 rounded text-left overflow-auto text-xs font-mono text-red-300 border border-red-500/20 mb-6 max-h-96">
          <p className="font-bold border-b border-red-500/20 pb-2 mb-2">Error Details:</p>
          <p>{error.message}</p>
          {error.stack && (
            <pre className="mt-4 opacity-70 whitespace-pre-wrap">{error.stack}</pre>
          )}
          {error.digest && (
            <p className="mt-4 text-gray-500">Digest: {error.digest}</p>
          )}
        </div>

        <button
          onClick={reset}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
