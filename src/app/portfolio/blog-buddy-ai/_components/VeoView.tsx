import React, { useState } from "react";
import { generateVeoVideo } from "../_services/geminiService";

const VeoView: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage) return;

    setLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      // Check for API Key selection for Veo (Paid feature check)
      const win = window as any;
      if (win.aistudio) {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          try {
            await win.aistudio.openSelectKey();
            // We assume success if openSelectKey resolves without throwing,
            // but strictly we should check hasSelectedApiKey again or just proceed.
          } catch (err) {
            throw new Error("API Key selection failed or cancelled.");
          }
        }
      }

      // Extract Base64 data (remove prefix)
      const base64Data = selectedImage.split(",")[1];

      const uri = await generateVeoVideo(prompt, base64Data, aspectRatio);

      // Append API Key for fetching the video bytes
      const fetchUrl = `${uri}&key=${process.env.API_KEY}`;

      setVideoUrl(fetchUrl);
    } catch (err: any) {
      console.error(err);

      // Handle "Requested entity was not found" error by prompting for key again
      if (
        err.message &&
        err.message.includes("Requested entity was not found")
      ) {
        const win = window as any;
        if (win.aistudio) {
          try {
            await win.aistudio.openSelectKey();
            // Retry once
            const base64Data = selectedImage.split(",")[1];
            const uri = await generateVeoVideo(prompt, base64Data, aspectRatio);
            const fetchUrl = `${uri}&key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`;
            setVideoUrl(fetchUrl);
            setError(null); // Clear error if retry succeeds
            return;
          } catch (retryErr: any) {
            setError(
              retryErr.message || "Failed to generate video after retry",
            );
            return;
          }
        }
      }

      setError(err.message || "Failed to generate video");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600"
          >
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
          Animate with Veo
        </h2>
        <p className="text-slate-600">
          Upload an image from your blog to create a cinematic video intro.
        </p>
        <p className="text-xs text-amber-700 bg-amber-100/50 backdrop-blur-sm p-2 rounded-lg border border-amber-200/50 inline-block">
          Note: This feature is highly experimental and may require specific API
          access.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* Image Upload */}
          <div className="border-2 border-dashed border-slate-300/50 bg-white/30 backdrop-blur-sm rounded-2xl p-8 text-center hover:border-indigo-500/50 hover:bg-white/40 transition-all cursor-pointer group relative">
            {selectedImage ? (
              <div className="relative">
                <img
                  src={selectedImage}
                  alt="Preview"
                  className="max-h-64 mx-auto rounded-lg shadow-md"
                />
                <button
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-[-10px] right-[-10px] bg-white/80 hover:bg-red-500 hover:text-white text-slate-500 p-2 rounded-full shadow-lg transition-all"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ) : (
              <label className="cursor-pointer block w-full h-full flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-indigo-100/50 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <span className="text-indigo-600 font-bold text-lg">
                  Click to Upload
                </span>
                <span className="text-slate-500 text-sm mt-1">
                  Drag and drop or browse (PNG/JPG)
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </label>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4 bg-white/30 backdrop-blur-sm p-6 rounded-2xl border border-white/20">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Prompt (Optional)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the motion (e.g., 'Cinematic pan, slow motion, 4k')"
                className="w-full px-4 py-3 bg-white/60 border border-white/40 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:outline-none text-sm h-24 resize-none backdrop-blur-sm placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Aspect Ratio
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setAspectRatio("16:9")}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all border ${aspectRatio === "16:9" ? "bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.02]" : "bg-white/50 border-white/40 text-slate-600 hover:bg-white/80"}`}
                >
                  Landscape (16:9)
                </button>
                <button
                  onClick={() => setAspectRatio("9:16")}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all border ${aspectRatio === "9:16" ? "bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.02]" : "bg-white/50 border-white/40 text-slate-600 hover:bg-white/80"}`}
                >
                  Portrait (9:16)
                </button>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedImage || loading}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Creating Magic...
                </>
              ) : (
                "Generate Video"
              )}
            </button>
            {error && (
              <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Output Area */}
        <div className="bg-black/90 backdrop-blur-md rounded-2xl overflow-hidden flex items-center justify-center min-h-[300px] border border-white/10 relative shadow-2xl">
          {!videoUrl && !loading && (
            <div className="text-slate-500 text-center p-8">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-slate-600"
                >
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </div>
              <p className="font-medium">Video Output</p>
              <p className="text-sm text-slate-600 mt-1">
                Your generated video will play here automatically.
              </p>
            </div>
          )}
          {loading && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div className="text-white/80 font-medium animate-pulse">
                Rendering Video...
              </div>
            </div>
          )}
          {videoUrl && (
            <video
              controls
              autoPlay
              loop
              className="max-w-full max-h-[500px] w-full h-full object-contain bg-black"
            >
              <source src={videoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          )}
        </div>
      </div>
    </div>
  );
};

export default VeoView;
