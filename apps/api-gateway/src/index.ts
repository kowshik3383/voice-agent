import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { prisma } from '@voice-platform/database';
import { hashApiKey } from '@voice-platform/shared-types/src/auth';

const logger = pino();
const fastify = Fastify({ logger: true });

// Rate Limiting
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Auth Middleware
fastify.addHook('preHandler', async (request, reply) => {
  // Only protect v1 routes except /v1/voices if public
  if (!request.url.startsWith('/v1')) return;
  if (request.url === '/v1/voices') return;

  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.status(401).send({
      error: {
        message: 'Missing API Key',
        type: 'authentication_error'
      }
    });
  }

  const hash = hashApiKey(apiKey);
  const keyRecord = await prisma.apiKey.findFirst({
    where: { keyHash: hash, isActive: true }
  });

  if (!keyRecord) {
    return reply.status(403).send({
      error: {
        message: 'Invalid API Key',
        type: 'authentication_error'
      }
    });
  }
});

// Proxy to Agent Service (V1)
fastify.register(proxy, {
  upstream: process.env.AGENT_SERVICE_URL || 'http://localhost:3001',
  prefix: '/v1/agent',
  rewritePrefix: '/agent'
});

// Proxy to Voice Training Service (V1)
fastify.register(proxy, {
  upstream: process.env.VOICE_TRAINING_SERVICE_URL || 'http://localhost:8002',
  prefix: '/v1/voices',
  rewritePrefix: '' // Directly call /clone etc on the training service
});

// Proxy to TTS Service (V1)
fastify.register(proxy, {
  upstream: process.env.TTS_SERVICE_URL || 'http://localhost:3002',
  prefix: '/v1/text-to-speech',
  rewritePrefix: '/tts'
});

// Proxy to Streaming Service (V1)
fastify.register(proxy, {
  upstream: process.env.STREAMING_SERVICE_URL || 'http://localhost:3003',
  prefix: '/v1/stream',
  rewritePrefix: '/ws'
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
