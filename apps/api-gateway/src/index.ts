import Fastify from 'fastify';
import replyFrom from '@fastify/reply-from';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { prisma } from '@voice-platform/database';
import { hashApiKey } from '@voice-platform/shared-types/src/auth';
import { validatorCompiler, serializerCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import swaggerPlugin from './plugins/swagger';

const logger = pino();
const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register Swagger Plugin
app.register(swaggerPlugin);

// Register Proxy Support for manual forwarding
app.register(replyFrom);

// Global Rate Limiting
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Auth Middleware Hook
app.addHook('preHandler', async (request, reply) => {
  // Only protect v1 routes except /v1/voices if public exposure is desired
  // In a real SaaS, we'd probably protect everything under /v1
  if (!request.url.startsWith('/v1')) return;
  
  // Swagger docs are public
  if (request.url.startsWith('/docs') || request.url.startsWith('/v1/docs')) return;

  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.status(401).send({
      error: { message: 'Missing API Key', type: 'authentication_error' }
    });
  }

  const hash = hashApiKey(apiKey);
  const keyRecord = await prisma.apiKey.findFirst({
    where: { keyHash: hash, isActive: true }
  });

  if (!keyRecord) {
    return reply.status(403).send({
      error: { message: 'Invalid API Key', type: 'authentication_error' }
    });
  }
});

// --- Explicit Public Routes for Swagger Documentation ---

const VOICE_SERVICE_URL = process.env.VOICE_TRAINING_SERVICE_URL || 'http://localhost:8002';
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:3002';
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3001';

// 1. Voice Upload
app.post('/v1/voices/upload', {
  schema: {
    tags: ['Voices'],
    summary: 'Upload voice for training',
    security: [{ ApiKeyAuth: [] }],
    consumes: ['multipart/form-data'],
    body: z.object({
      name: z.string().min(1).describe('Name of the custom voice'),
      // The file field is handled by multipart but documented here for Swagger
    }),
    response: {
      200: z.object({
        data: z.object({
          voice_id: z.string(),
          status: z.string()
        })
      })
    }
  }
}, async (request, reply) => {
  return reply.from(`${VOICE_SERVICE_URL}/upload`);
});

// 2. Text-to-Speech
app.post('/v1/text-to-speech/tts', {
  schema: {
    tags: ['TTS'],
    summary: 'Queue high-quality speech generation',
    security: [{ ApiKeyAuth: [] }],
    body: z.object({
      text: z.string().min(1),
      voice_id: z.string().default('default'),
      emotion: z.enum(['neutral', 'happy', 'sad', 'angry', 'surprised']).optional(),
      speed: z.number().min(0.5).max(2.0).optional()
    }),
    response: {
      200: z.object({
        data: z.object({
          job_id: z.string(),
          status: z.string()
        })
      })
    }
  }
}, async (request, reply) => {
  return reply.from(`${TTS_SERVICE_URL}/tts`);
});

// 3. Agent Integration
app.post('/v1/agent/generate', {
  schema: {
    tags: ['Agent'],
    summary: 'Interact with the AI voice agent',
    security: [{ ApiKeyAuth: [] }],
    body: z.object({
      query: z.string().min(1)
    }),
    response: {
      200: z.object({
        data: z.object({
          response: z.string(),
          speechJobId: z.string().optional()
        })
      })
    }
  }
}, async (request, reply) => {
  return reply.from(`${AGENT_SERVICE_URL}/agent`);
});

import { register } from 'prom-client';
app.get('/metrics', async (request, reply) => {
  return reply.send(await register.metrics());
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`API Gateway (Elite) listening on port ${port}`);
    console.log(`Swagger documentation available at http://localhost:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
