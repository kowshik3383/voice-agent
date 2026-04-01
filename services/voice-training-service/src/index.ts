import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { validateAudioRequirements } from '@voice-platform/audio-utils';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MinioAdapter } from '@voice-platform/adapters';
import { fileTypeFromFile } from 'file-type';

const fastify = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const voiceQueue = new Queue('voice-queue', { connection: redis });

const minioClient = new MinioAdapter({
  endpoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucket: 'voice-platform'
});

fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for audio
  }
});

fastify.post('/upload', async (request, reply) => {
  const data = await request.file();
  if (!data) {
    return reply.status(400).send({
      error: { message: 'No audio file uploaded', type: 'invalid_request_error' }
    });
  }

  const name = (data.fields.name as any)?.value || 'Custom Voice';
  // P0 Fix: Sanitize filename and use UUID for internal path
  const sanitizedFilename = path.basename(data.filename).replace(/[^a-z0-9.]/gi, '_');
  const voiceId = uuidv4();
  const tempDir = path.join(os.tmpdir(), voiceId);
  fs.mkdirSync(tempDir, { recursive: true });

  const rawPath = path.join(tempDir, sanitizedFilename);
  
  try {
    // 1. Save uploaded file to temp
    const writeStream = fs.createWriteStream(rawPath);
    await new Promise((resolve, reject) => {
      data.file.pipe(writeStream);
      data.file.on('end', resolve);
      data.file.on('error', reject);
    });

    // P1 Fix: MIME Magic Byte Validation
    const type = await fileTypeFromFile(rawPath);
    const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'];
    if (!type || !allowedMimeTypes.includes(type.mime)) {
      return reply.status(400).send({
        error: { 
          message: `Unsupported file type: ${type?.mime || 'unknown'}. Please upload MP3, WAV, or OGG.`, 
          type: 'invalid_request_error' 
        }
      });
    }

    // 2. Validate Duration
    const { duration, isValid, error } = await validateAudioRequirements(rawPath);
    if (!isValid) {
      return reply.status(400).send({
        error: { message: error, type: 'invalid_request_error' }
      });
    }

    if (duration > 1800) {
      fastify.log.warn(`Large audio uploaded for voice ${voiceId} (${Math.round(duration/60)} mins)`);
    }

    // 3. Upload to MinIO
    const fileUrl = await minioClient.uploadFile(rawPath, `raw-voices/${voiceId}${path.extname(data.filename)}`);

    // 4. Create DB Record
    const voice = await prisma.voice.create({
      data: {
        id: voiceId,
        name,
        engine: 'coqui',
        status: 'processing'
      }
    });

    // 5. Queue Training Job
    await voiceQueue.add('train-voice', {
      voiceId,
      fileUrl,
      fileName: data.filename
    }, {
      jobId: `train-${voiceId}`
    });

    return {
      data: {
        voice_id: voiceId,
        status: 'processing'
      }
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({
      error: { message: 'Failed to process voice upload', type: 'server_error' }
    });
  } finally {
    // cleanup in worker or after upload? typically after upload is fine for raw
    // but we might want to keep it if preprocessing is slow.
    // fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

import { register } from 'prom-client';
fastify.get('/metrics', async (request, reply) => {
  return reply.send(await register.metrics());
});

const start = async () => {
  try {
    await fastify.listen({ port: 8002, host: '0.0.0.0' });
    console.log('Voice Training Service (Node.js) listening on port 8002');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
