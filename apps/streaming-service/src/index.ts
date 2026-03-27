import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';
import * as Minio from 'minio';
import pino from 'pino';

const logger = pino();
const fastify = Fastify({ logger: true });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

fastify.register(websocket);

fastify.register(async function (fastify) {
  fastify.get('/ws/:jobId', { websocket: true }, (connection, req) => {
    const { jobId } = req.params as { jobId: string };
    logger.info({ jobId }, 'Client connected for streaming');

    const sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    sub.subscribe('audio-chunks');

    sub.on('message', async (channel, message) => {
      const chunkInfo = JSON.parse(message);
      if (chunkInfo.jobId === jobId) {
        // Fetch from MinIO and send to client
        const stream = await minio.getObject('audio', chunkInfo.objectName);
        stream.on('data', (data) => {
          connection.socket.send(data);
        });
        
        if (chunkInfo.isLast) {
          // Could close here or keep open for more context
          logger.info({ jobId }, 'Last chunk sent');
        }
      }
    });

    connection.socket.on('close', () => {
      sub.quit();
      logger.info({ jobId }, 'Client disconnected');
    });
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: 3003, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
