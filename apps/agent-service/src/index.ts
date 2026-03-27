import Fastify from 'fastify';
import pino from 'pino';

const logger = pino();
const fastify = Fastify({ logger: true });

fastify.post('/agent/chat', async (request, reply) => {
  const { message, sessionId } = request.body as any;
  
  // Simple mock agent logic
  // In a real system, this would call an LLM
  return {
    text: `You said: ${message}. How can I help you further?`,
    voiceId: 'default', // Can be dynamic based on user profile or agent persona
    emotion: 'happy'
  };
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
