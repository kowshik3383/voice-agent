export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';

export interface SpeechConfig {
  text: string;
  voiceId: string;
  emotion?: Emotion;
  speed?: number;
  language?: string;
  embedding_b64?: string;
  speaker_embedding_b64?: string;
  gpt_cond_latent_b64?: string;
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
