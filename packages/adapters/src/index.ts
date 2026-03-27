import { TTSEngine } from '@voice-platform/tts-core';
import { SpeechConfig } from '@voice-platform/shared-types';
import axios from 'axios';

export class CoquiAdapter implements TTSEngine {
  name = 'coqui';
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async synthesize(config: SpeechConfig): Promise<Buffer> {
    const response = await axios.post(`${this.baseUrl}/tts`, {
      text: config.text,
      voiceId: config.voiceId,
      embedding_b64: (config as any).embedding_b64,
      language: config.language || 'en'
    }, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }
}

export class BarkAdapter implements TTSEngine {
  name = 'bark';
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async synthesize(config: SpeechConfig): Promise<Buffer> {
    const response = await axios.post(`${this.baseUrl}/tts`, config, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }
}
