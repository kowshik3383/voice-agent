from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import torch
from TTS.api import TTS
import os
import uuid
import subprocess
import shutil
from minio import Minio
import io
import psycopg2

app = FastAPI()

# Database connection
DB_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@postgres:5432/voice_platform")

def update_voice_db(voice_id, status, embedding_path=None, preview_url=None):
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(
            "UPDATE voices SET status = %s, embedding_path = %s, preview_url = %s WHERE id = %s",
            (status, embedding_path, preview_url, voice_id)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database error: {e}")

# Initialize MinIO
minio_client = Minio(
    os.getenv("MINIO_ENDPOINT", "localhost:9000"),
    access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
    secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
    secure=False
)

# Ensure bucket exists
if not minio_client.bucket_exists("voice-platform"):
    minio_client.make_bucket("voice-platform")

# Load XTTS v2 for embedding extraction
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading XTTS v2 for embedding extraction on {device}...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

@app.post("/clone")
async def clone_voice(name: str, file: UploadFile = File(...)):
    voice_id = str(uuid.uuid4())
    
    # 0. Create Initial Record
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO voices (id, name, engine, status, created_at) VALUES (%s, %s, %s, %s, NOW())",
            (voice_id, name, "coqui", "processing")
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to create initial record: {e}")
        raise HTTPException(status_code=500, detail="Database error during initialization")

    temp_dir = f"/tmp/{voice_id}"
    os.makedirs(temp_dir, exist_ok=True)
    
    raw_path = f"{temp_dir}/raw_{file.filename}"
    processed_path = f"{temp_dir}/processed.wav"
    
    try:
        # 1. Save uploaded file
        with open(raw_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Preprocessing Pipeline (FFmpeg)
        cmd = [
            "ffmpeg", "-i", raw_path,
            "-af", "silenceremove=1:0:-50dB,loudnorm", 
            "-ar", "22050", "-ac", "1", 
            processed_path, "-y"
        ]
        subprocess.run(cmd, check=True, stderr=subprocess.PIPE)
        
        # 3. Validate Duration
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", processed_path],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        duration = float(result.stdout)
        if duration < 3.0:
            update_voice_db(voice_id, "failed")
            raise HTTPException(status_code=400, detail="Audio too short (min 3s)")

        # 4. Extract Embedding
        gpt_cond_latent, speaker_embedding = tts.model.get_conditioning_latents(audio_path=[processed_path])
        
        # 5. Store Embedding in MinIO
        embedding_buffer = io.BytesIO()
        torch.save({"gpt_cond_latent": gpt_cond_latent, "speaker_embedding": speaker_embedding}, embedding_buffer)
        embedding_buffer.seek(0)
        
        embedding_path = f"embeddings/{voice_id}.pth"
        minio_client.put_object(
            "voice-platform", embedding_path, embedding_buffer, length=embedding_buffer.getbuffer().nbytes
        )
        
        # 6. Generate Preview
        preview_path = f"{temp_dir}/preview.wav"
        tts.tts_to_file(
            text="Hello! This is my new cloned voice. How does it sound?",
            speaker_wav=processed_path,
            language="en",
            file_path=preview_path
        )
        
        # 7. Store Preview in MinIO
        with open(preview_path, "rb") as f:
            preview_data = f.read()
            minio_client.put_object(
                "voice-platform", f"previews/{voice_id}.wav", io.BytesIO(preview_data), length=len(preview_data)
            )

        # 8. Final DB Update
        preview_url = f"/previews/{voice_id}.wav"
        update_voice_db(voice_id, "ready", embedding_path, preview_url)

        return {
            "voice_id": voice_id,
            "name": name,
            "status": "ready",
            "preview_url": preview_url
        }

    except Exception as e:
        print(f"Error during cloning: {e}")
        update_voice_db(voice_id, "failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

from prometheus_client import make_asgi_app

# Metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
