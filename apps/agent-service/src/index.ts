import Fastify from 'fastify';
import { z } from 'zod';
import pino from 'pino';

const logger = pino();
const fastify = Fastify({ logger: true });

const GenerateSchema = z.object({
  prompt: z.string().min(1)
});

fastify.post('/generate', async (request, reply) => {
  try {
    const { prompt } = GenerateSchema.parse(request.body);
    
    const responseText = `You said: ${prompt}. How can I assist you further?`;
    
    return {
      data: {
        text: responseText,
        voice_id: 'p225',
        emotion: 'neutral',
        speed: 1.0
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

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
