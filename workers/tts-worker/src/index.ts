import { Worker, Job } from 'bullmq';
import { TTSOrchestrator } from '@voice-platform/tts-core';
import { CoquiAdapter, BarkAdapter } from '@voice-platform/adapters';
import { chunkText, generateHash } from '@voice-platform/audio-utils';
import { SpeechConfig } from '@voice-platform/shared-types';
import * as Minio from 'minio';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const orchestrator = new TTSOrchestrator();
orchestrator.registerEngine(new CoquiAdapter(process.env.COQUI_URL || 'http://localhost:8000'));
orchestrator.registerEngine(new BarkAdapter(process.env.BARK_URL || 'http://localhost:8001'));

const worker = new Worker('tts-queue', async (job: Job<SpeechConfig>) => {
  const { text, ...config } = job.data;
  logger.info({ jobId: job.id }, 'Processing TTS job');

  const chunks = chunkText(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkConfig = { ...config, text: chunk };
    const chunkHash = generateHash([chunk, config.voiceId, config.emotion || 'neutral']);
    const objectName = `chunks/${chunkHash}.wav`;

    try {
      // Check if chunk exists in storage
      try {
        await minio.statObject('audio', objectName);
        logger.info({ chunkIndex: i }, 'Chunk already exists in storage');
      } catch (err) {
        // Synthesize and save
        const audioBuffer = await orchestrator.synthesize(chunkConfig);
        await minio.putObject('audio', objectName, audioBuffer);
        logger.info({ chunkIndex: i }, 'Chunk synthesized and stored');
      }

      // Notify streaming service (mocked here, would be a Redis pub/sub or another queue)
      await redis.publish('audio-chunks', JSON.stringify({
        jobId: job.id,
        chunkIndex: i,
        objectName,
        isLast: i === chunks.length - 1
      }));

    } catch (err) {
      logger.error({ err, chunkIndex: i }, 'Failed to process chunk');
      throw err;
    }
  }

  return { success: true };
}, { connection: redis });

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Job completed'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Job failed'));

logger.info('TTS Worker started');
