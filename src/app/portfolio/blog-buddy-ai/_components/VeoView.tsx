import React, { useState } from 'react';
import { generateVeoVideo } from '../services/geminiService';

const VeoView: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
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
      const base64Data = selectedImage.split(',')[1];
      
      const uri = await generateVeoVideo(prompt, base64Data, aspectRatio);
      
      // Append API Key for fetching the video bytes
      const fetchUrl = `${uri}&key=${process.env.API_KEY}`;
      
      setVideoUrl(fetchUrl);

    } catch (err: any) {
      console.error(err);
      
      // Handle "Requested entity was not found" error by prompting for key again
      if (err.message && err.message.includes("Requested entity was not found")) {
        const win = window as any;
        if (win.aistudio) {
          try {
            await win.aistudio.openSelectKey();
            // Retry once
            const base64Data = selectedImage.split(',')[1];
            const uri = await generateVeoVideo(prompt, base64Data, aspectRatio);
            const fetchUrl = `${uri}&key=${process.env.API_KEY}`;
            setVideoUrl(fetchUrl);
            setError(null); // Clear error if retry succeeds
            return;
          } catch (retryErr: any) {
            setError(retryErr.message || "Failed to generate video after retry");
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
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
            Animate with Veo
        </h2>
        <p className="text-slate-500">Upload an image from your blog to create a cinematic video intro or summary.</p>
        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 inline-block">
           Note: Requires a paid project API key selection.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* Image Upload */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors bg-slate-50">
            {selectedImage ? (
              <div className="relative group">
                <img src={selectedImage} alt="Preview" className="max-h-64 mx-auto rounded-lg shadow-md" />
                <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ) : (
              <label className="cursor-pointer block">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <span className="text-indigo-600 font-medium">Upload an image</span>
                <span className="text-slate-400 block text-sm mt-1">PNG or JPG supported</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prompt (Optional)</label>
              <textarea 
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)} 
                placeholder="Describe the motion (e.g., 'The clouds move slowly, cinematic lighting')"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm h-24 resize-none"
              />
            </div>

            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Aspect Ratio</label>
               <div className="flex gap-4">
                 <button 
                    onClick={() => setAspectRatio('16:9')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === '16:9' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                 >
                    Landscape (16:9)
                 </button>
                 <button 
                    onClick={() => setAspectRatio('9:16')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${aspectRatio === '9:16' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                 >
                    Portrait (9:16)
                 </button>
               </div>
            </div>

            <button
                onClick={handleGenerate}
                disabled={!selectedImage || loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
            >
                {loading ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating (this may take a minute)...
                    </>
                ) : 'Generate Video'}
            </button>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        </div>

        {/* Output Area */}
        <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[300px] border border-slate-800 relative">
             {!videoUrl && !loading && (
                 <div className="text-slate-500 text-center p-4">
                     <p>Generated video will appear here.</p>
                 </div>
             )}
             {loading && (
                 <div className="text-white/70 animate-pulse">Processing frames...</div>
             )}
             {videoUrl && (
                 <video controls autoPlay loop className="max-w-full max-h-[500px]">
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