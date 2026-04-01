# Voice Platform Backend

Open-source voice agent backend system with high-fidelity voice cloning.

## Features
- **Production-Grade Security**: API key-based authentication with hashed storage.
- **Professional Voice Cloning**: XTTS v2-based cloning with automated quality enforcement.
- **Distributed Training**: Background processing for long-running training jobs via BullMQ.
- **SaaS API Design**: Versioned endpoints (`/v1/*`) with consistent JSON response formats.
- **Rate Limiting**: Built-in protection against API abuse.
- **Input Validation**: Strict schema validation using Zod and FFmpeg-based audio validation.
- **Microservices Architecture**: Scalable services for API, LLM, TTS, and streaming.
- **Real-time Streaming**: Progressive audio delivery using text chunking and WebSockets.

## Architecture
```mermaid
graph TD
    Client ->|HTTP + API Key| Gateway[API Gateway]
    Gateway ->|Auth Check| DB[(PostgreSQL)]
    
    subgraph "Voice Management"
        Gateway ->|Proxy| VoiceSvc[Voice Service]
        VoiceSvc ->|Queue| TrainQueue[Train Queue]
        TrainQueue ->|Job| TrainWorker[Train Worker]
        TrainWorker ->|Python/XTTS| Models[(Models)]
    end

    subgraph "TTS Pipeline"
        Gateway ->|Proxy| TTSSvc[TTS Service]
        TTSSvc ->|Queue| TTSQueue[TTS Queue]
        TTSQueue ->|Job| TTSWorker[TTS Worker]
        TTSWorker ->|Fetch| Models
        TTSWorker ->|Coqui| CoquiEng[Coqui Engine]
        TTSWorker ->|Storage| MinIO[MinIO Storage]
        TTSWorker ->|PubSub| Stream[Streaming Service]
    end

    Stream ->|WS| Client
```

## Setup & Running

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.9+ (with `TTS` libraries)
- FFmpeg installed in system path

### Using Docker (Recommended)
```bash
docker-compose up --build
```

### Initializing Database
```bash
pnpm --filter @voice-platform/database run db:generate
pnpm --filter @voice-platform/database run db:migrate
```

## Voice Cloning Requirements
To ensure high-fidelity voice cloning, the following requirements are enforced:
- **Audio Duration**: Minimum **5 minutes** of clean, high-quality audio.
- **Recommended Range**: **5–30 minutes** for optimal results.
- **Format**: MP3 or WAV (automatically normalized to 16kHz mono WAV for training).
- **Quality**: Mono audio is preferred; background noise should be minimized.

## API Reference

### Authentication
All requests to `/v1/*` (except `/v1/voices/upload`) require an `x-api-key` header.

### Endpoints
- `POST /v1/voices/upload`: Upload voice sample for training. (Requires `name` and `file`)
- `POST /v1/agent/generate`: Generate speech config.
- `POST /v1/text-to-speech/tts`: Queue audio generation for a specific `voiceId`.
- `WS /v1/stream/ws/:jobId`: Stream audio chunks.

### Response Formats
#### Success
```json
{
  "data": { ... }
}
```
#### Error
```json
{
  "error": {
    "message": "...",
    "type": "..."
  }
}
```

## Repo Hygiene
- `.gitignore`: Comprehensive ignores for all stacks.
- `.env.example`: Template files for all services.

## License
MIT
