export enum AppView {
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  VEO = 'VEO',
  TTS = 'TTS'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface BlogContextState {
  title: string;
  content: string;
}

// Helper types for Veo
export interface VeoConfig {
  aspectRatio: '16:9' | '9:16';
  prompt: string;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
