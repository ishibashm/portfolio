import { GoogleGenAI, Modality, Type } from "@google/genai";

// Helper to get client (checks for API key availability usually managed by environment in this context)
const getClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey)
    throw new Error(
      "API Key not found in environment. Please set NEXT_PUBLIC_GEMINI_API_KEY.",
    );
  return new GoogleGenAI({ apiKey });
};

// --- CHAT ---
export const generateChatResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  blogContext: string,
) => {
  const ai = getClient();
  const systemInstruction = `You are a helpful and enthusiastic AI assistant designed to discuss blog articles. 
  Here is the context of the blog post the user is reading:
  
  ${blogContext}
  
  Answer questions based on this context. Be concise and engaging.`;

  const chat = ai.chats.create({
    model: "gemini-2.0-flash-exp",
    config: { systemInstruction },
    history: history as any, // Cast to any to avoid minor type mismatches with history format
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

// --- TTS ---
export const generateSpeech = async (text: string) => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio data returned");
  return base64Audio;
};

// --- VEO (Video Generation) ---
// Note: We need a fresh client for Veo because the user might need to select a key just before calling this.
export const generateVeoVideo = async (
  prompt: string,
  imageBase64: string,
  aspectRatio: "16:9" | "9:16",
) => {
  // Ensure fresh client with potentially newly selected key
  const ai = getClient();

  let operation = await ai.models.generateVideos({
    model: "veo-3.1-fast-generate-preview",
    prompt: prompt || "Animate this image cinematically",
    image: {
      imageBytes: imageBase64,
      mimeType: "image/png", // Assuming PNG for simplicity, usually handled by file input
    },
    config: {
      numberOfVideos: 1,
      resolution: "720p", // Only 720p supported for fast-generate sometimes, keeping safe
      aspectRatio: aspectRatio,
    },
  });

  // Polling loop
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed or returned no URI");

  return videoUri;
};

// --- UTILS for Audio (Shared with Live) ---
export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
