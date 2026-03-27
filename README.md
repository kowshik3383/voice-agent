# Voice Platform Backend

Open-source voice agent backend system.

## Features
- **Production-Grade Security**: API key-based authentication with hashed storage.
- **SaaS API Design**: Versioned endpoints (`/v1/*`) with consistent JSON response formats.
- **Rate Limiting**: Built-in protection against API abuse.
- **Input Validation**: Strict schema validation using Zod.
- **Microservices Architecture**: Scalable services for API, LLM, TTS, and streaming.
- **Real-time Streaming**: Progressive audio delivery using text chunking and WebSockets.

## Architecture
```mermaid
graph TD
    Client ->|HTTP + API Key| Gateway[API Gateway]
    Gateway ->|Auth Check| DB[(PostgreSQL)]
    Gateway ->|V1 Proxy| Agent[Agent Service]
    Gateway ->|V1 Proxy| TTS[TTS Service]
    TTS ->|Queue| Redis[Redis / Queue]
    Redis ->|Job| Worker[TTS Worker]
    Worker ->|HTTP| Coqui[Coqui Engine]
    Worker ->|Storage| MinIO[MinIO Storage]
    Worker ->|PubSub| Stream[Streaming Service]
    Stream ->|WS| Client
```

## Setup & Running

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.9+

### Using Docker (Recommended)
```bash
docker-compose up --build
```

### Initializing Database
```bash
cd packages/database
npm install
npx prisma migrate dev
```

## API Reference

### Authentication
All requests to `/v1/*` (except `/v1/voices`) require an `x-api-key` header.

### Endpoints
- `POST /v1/agent/generate`: Generate speech config.
- `POST /v1/text-to-speech/tts`: Queue audio generation.
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
