"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type SanpekiClientProps = {
    images: { id: string; url: string; caption: string | null }[]
};

export default function SanpekiClient({ images }: SanpekiClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) {
      return <div className="p-8 text-center text-red-500">No images found.</div>;
  }

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };
  
  const currentImage = images[currentIndex];
  // Verify if URL is full path or just filename. Seed script stored filename.
  // We need to prepend path if it's just filename.
  const isAbsolute = currentImage.url.startsWith('http') || currentImage.url.startsWith('/');
  const imageUrl = isAbsolute
      ? currentImage.url 
      : `/images/sanpeki/${currentImage.url}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-8 flex flex-col items-center">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold mb-4 text-indigo-700">
          Sanpeki Mokusei
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl">
          回座（正規のルート）と中宮（中央）の視覚化。
          九星気学の循環を探求しましょう。
          <span className="block text-xs mt-2 text-gray-400 font-mono">Data fetched from Supabase</span>
        </p>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center gap-8">
        <div className="relative w-full aspect-square md:aspect-[4/3] max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center p-8"
            >
              <div className="relative w-full h-full">
                <Image
                  src={imageUrl}
                  alt={currentImage.caption || `Sanpeki Chart ${currentIndex + 1}`}
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </motion.div>
          </AnimatePresence>
          

          <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-mono border border-slate-200 flex flex-col items-end gap-1">
            <span>Src: {imageUrl}</span>
            <span className="text-gray-400">Orig: {currentImage.url}</span>
            <span className={isAbsolute ? "text-green-600" : "text-blue-600"}>
              {isAbsolute ? "Absolute URL" : "Local Path"}
            </span>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <button
            onClick={prevImage}
            className="px-6 py-3 bg-white border border-slate-300 rounded-full hover:bg-slate-50 hover:scale-105 transition-all shadow-sm active:scale-95 flex items-center gap-2 font-medium"
          >
            ← Previous
          </button>
          <div className="text-sm font-mono text-slate-500">
            {currentIndex + 1} / {images.length}
          </div>
          <button
            onClick={nextImage}
            className="px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 hover:scale-105 transition-all shadow-md active:scale-95 flex items-center gap-2 font-medium"
          >
            Next →
          </button>
        </div>
      </main>

      <footer className="mt-16 text-center">
        <Link
          href="/portfolio"
          className="text-indigo-600 hover:underline hover:text-indigo-800 transition-colors"
        >
          Back to Portfolio
        </Link>
      </footer>
    </div>
  );
}
