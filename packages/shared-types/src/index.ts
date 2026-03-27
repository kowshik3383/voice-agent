export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';

export interface SpeechConfig {
  text: string;
  voiceId: string;
  emotion?: Emotion;
  speed?: number;
}

export interface TTSJob {
  id: string;
  config: SpeechConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  createdAt: number;
}

export interface AudioChunk {
  jobId: string;
  chunkIndex: number;
  data: Buffer;
  isLast: boolean;
}
