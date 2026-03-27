import { SpeechConfig } from '@voice-platform/shared-types';

export interface TTSEngine {
  name: string;
  synthesize(config: SpeechConfig): Promise<Buffer>;
}

export class TTSOrchestrator {
  private engines: Map<string, TTSEngine> = new Map();

  registerEngine(engine: TTSEngine) {
    this.engines.set(engine.name, engine);
  }

  getEngine(config: SpeechConfig): TTSEngine {
    if (config.emotion && config.emotion !== 'neutral') {
      return this.engines.get('bark') || this.engines.get('coqui')!;
    }
    return this.engines.get('coqui')!;
  }

  async synthesize(config: SpeechConfig): Promise<Buffer> {
    const engine = this.getEngine(config);
    return engine.synthesize(config);
  }
}
