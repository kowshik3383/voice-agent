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

import { prisma } from '@voice-platform/database';

const orchestrator = new TTSOrchestrator();
orchestrator.registerEngine(new CoquiAdapter(process.env.COQUI_URL || 'http://localhost:8000'));
orchestrator.registerEngine(new BarkAdapter(process.env.BARK_URL || 'http://localhost:8001'));

const worker = new Worker('tts-queue', async (job: Job<SpeechConfig>) => {
  const { text, ...config } = job.data;
  logger.info({ jobId: job.id, voiceId: config.voiceId }, 'Processing TTS job');

  // Fetch Voice from DB
  const voice = await prisma.voice.findUnique({
    where: { id: config.voiceId }
  });

  let embeddingData = {};
  if (voice?.embeddingPath && voice.status === 'ready') {
    logger.info({ voiceId: voice.id }, 'Fetching XTTS embedding from MinIO');
    try {
      const stream = await minio.getObject('voice-platform', voice.embeddingPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const embeddingBuffer = Buffer.concat(chunks);
      
      // We need to split the combined .pth file back into cond_latent and speaker_embedding
      // Actually, my coqui-engine expects the whole .pth content to be loaded via torch.load
      // So I'll just pass the whole thing if I can, but the coqui-engine I wrote expects two separate fields.
      // Wait, let's look at coqui-engine/main.py again.
      // It expects speaker_embedding_b64 and gpt_cond_latent_b64.
      // My voice-training-service saves them as: {"gpt_cond_latent": ..., "speaker_embedding": ...}
      
      // I'll update the coqui-engine to just accept one 'embedding_b64' field if it's easier, or I can parse it here.
      // Better to parse it in the worker or just pass the whole thing and let coqui-engine handle it.
      // Let's stick to the current plan and pass it as one if I update coqui-engine.
      
      // Actually, I'll update coqui-engine/main.py to accept ONE 'embedding_b64' field.
      embeddingData = {
        embedding_b64: embeddingBuffer.toString('base64')
      };
    } catch (err) {
      logger.error({ err, voiceId: voice.id }, 'Failed to fetch embedding');
    }
  }

  const chunks = chunkText(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkConfig = { 
      ...config, 
      text: chunk,
      ...embeddingData
    };
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
