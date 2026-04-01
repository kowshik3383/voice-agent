import { TTSEngine } from '@voice-platform/tts-core';
import { SpeechConfig } from '@voice-platform/shared-types';
import axios from 'axios';
import * as Minio from 'minio';

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

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export class MinioAdapter {
  private client: Minio.Client;
  private bucket: string;

  constructor(config: MinioConfig) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL || false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
  }

  async uploadFile(filePath: string, objectName: string): Promise<string> {
    if (!await this.client.bucketExists(this.bucket)) {
      await this.client.makeBucket(this.bucket, 'us-east-1');
    }
    await this.client.fPutObject(this.bucket, objectName, filePath);
    return objectName;
  }

  async downloadFile(objectName: string, filePath: string): Promise<string> {
    await this.client.fGetObject(this.bucket, objectName, filePath);
    return filePath;
  }
}
