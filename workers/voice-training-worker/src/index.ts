import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { MinioAdapter } from '@voice-platform/adapters';
import { convertToWav } from '@voice-platform/audio-utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execPromise = promisify(exec);
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const minioClient = new MinioAdapter({
  endpoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucket: 'voice-platform'
});

const worker = new Worker('voice-queue', async (job: Job) => {
  const { voiceId, fileUrl } = job.data;
  const tempDir = path.join(os.tmpdir(), voiceId);
  fs.mkdirSync(tempDir, { recursive: true });

  const rawPath = path.join(tempDir, 'raw.audio');
  const wavPath = path.join(tempDir, 'processed.wav');
  const outputDir = path.join(process.cwd(), 'models', voiceId);

  try {
    console.log(`Processing training job ${job.id} for voice ${voiceId}...`);

    // 1. Download from MinIO
    await minioClient.downloadFile(fileUrl, rawPath);

    // 2. Preprocess to 16kHz mono WAV
    await convertToWav(rawPath, wavPath);

    // 3. Run Python training script SECURELY (P0 Fix)
    const pyScript = path.join(__dirname, '..', 'train.py');
    const args = [pyScript, voiceId, wavPath, outputDir];
    
    console.log(`Executing training script: python3 ${args.join(' ')}`);
    
    const { spawn } = require('child_process');
    const child = spawn('python3', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    console.log(`Python stdout: ${stdout}`);
    if (stderr) console.error(`Python stderr: ${stderr}`);

    if (exitCode !== 0) {
      throw new Error(`Training script failed with exit code ${exitCode}`);
    }

    // 4. Upload config.pth and sample.wav back to MinIO (optional, but good for portability)
    const configPath = path.join(outputDir, 'config.pth');
    const samplePath = path.join(outputDir, 'sample.wav');

    let embeddingPath = '';
    let previewUrl = '';

    if (fs.existsSync(configPath)) {
      embeddingPath = await minioClient.uploadFile(configPath, `models/${voiceId}/config.pth`);
    }

    if (fs.existsSync(samplePath)) {
      previewUrl = await minioClient.uploadFile(samplePath, `previews/${voiceId}.wav`);
    }

    // 5. Update DB Status
    await prisma.voice.update({
      where: { id: voiceId },
      data: {
        status: 'ready',
        embeddingPath,
        previewUrl
      }
    });

    console.log(`Voice ${voiceId} is ready.`);
  } catch (err) {
    console.error(`Training failed for voice ${voiceId}:`, err);
    await prisma.voice.update({
      where: { id: voiceId },
      data: { status: 'failed' }
    });
    throw err;
  } finally {
    // fs.rmSync(tempDir, { recursive: true, force: true });
  }
}, { connection: redis, concurrency: 1 }); // Serial training

console.log('Voice Training Worker (Node.js) started...');
