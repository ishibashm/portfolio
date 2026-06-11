import React from "react";
import { Folder } from "lucide-react";

interface MediaGalleryProps {
  images: string[];
}

export const MediaGallery = ({ images }: MediaGalleryProps) => {
  const dummyImages =
    images.length > 0
      ? images
      : [
          "https://via.placeholder.com/400x225/1e293b/94a3b8?text=Extracted+Frame+1",
          "https://via.placeholder.com/400x225/1e293b/94a3b8?text=Extracted+Frame+2",
          "https://via.placeholder.com/400x225/1e293b/94a3b8?text=Extracted+Frame+3",
          "https://via.placeholder.com/400x225/1e293b/94a3b8?text=Extracted+Frame+4",
        ];

  return (
    <div className="w-full h-full flex flex-col p-4 bg-slate-900/50">
      <div className="mb-4">
        <h4 className="text-md font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-pink-500">🖼️</span> Extracted Frames / Media
          Gallery
        </h4>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
          <Folder size={14} className="text-emerald-400" />
          <span className="font-mono text-[10px] text-emerald-400 break-all">
            Saved to:
            C:\Users\ishib\projects\immediate\image\apps\api-gateway\media_output\frames\
          </span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          {dummyImages.map((src, index) => (
            <div
              key={index}
              className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Extracted frame ${index + 1}`}
                className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-mono text-white tracking-widest">
                  FRAME_{index + 1}.png
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
