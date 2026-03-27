import Fastify from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { z } from 'zod';
import pino from 'pino';

const logger = pino();
const fastify = Fastify({ logger: true });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const ttsQueue = new Queue('tts-queue', { connection: redis });

const TTSSchema = z.object({
  text: z.string().min(1),
  voice_id: z.string().default('default'),
  emotion: z.enum(['neutral', 'happy', 'sad', 'angry', 'surprised']).optional(),
  speed: z.number().min(0.5).max(2.0).optional()
});

import { prisma } from '@voice-platform/database';

fastify.post('/tts', async (request, reply) => {
  try {
    const speechConfig = TTSSchema.parse(request.body);
    
    // Validate voice exists
    if (speechConfig.voice_id !== 'default') {
      const voice = await prisma.voice.findUnique({
        where: { id: speechConfig.voice_id }
      });
      if (!voice) {
        return reply.status(404).send({
          error: {
            message: 'Voice not found',
            type: 'invalid_request_error'
          }
        });
      }
    }

    const jobId = `tts-${Date.now()}`;
    await ttsQueue.add('synthesize', {
      ...speechConfig,
      voiceId: speechConfig.voice_id // Map voice_id from request to voiceId in SpeechConfig
    }, { jobId });

    return {
      data: {
        job_id: jobId,
        status: 'processing'
      }
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        error: {
          message: 'Validation failed',
          type: 'invalid_request_error',
          details: err.errors
        }
      });
    }
    return reply.status(500).send({
      error: {
        message: 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

import { register } from 'prom-client';

fastify.get('/metrics', async (request, reply) => {
  return reply.send(await register.metrics());
});

const start = async () => {
  try {
    await fastify.listen({ port: 3002, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
