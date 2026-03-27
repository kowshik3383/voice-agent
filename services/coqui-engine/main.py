from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from TTS.api import TTS
import torch
import io
import uvicorn
from fastapi.responses import StreamingResponse
import base64

app = FastAPI()

# Load model once at startup
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading Coqui XTTS v2 model on {device}...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

class TTSRequest(BaseModel):
    text: str
    voiceId: str = "p225"
    language: str = "en"
    speed: float = 1.0
    # Add support for base64 encoded unified speaker embedding
    embedding_b64: str = None

@app.post("/tts")
async def synthesize(request: TTSRequest):
    try:
        out = io.BytesIO()
        
        if request.embedding_b64:
            # Decode and load combined embedding
            embedding_data = torch.load(io.BytesIO(base64.b64decode(request.embedding_b64)))
            speaker_embedding = embedding_data["speaker_embedding"]
            gpt_cond_latent = embedding_data["gpt_cond_latent"]
            
            # Use model directly for inference with latents
            # This is more efficient for cloned voices
            tts.model.synthesize(
                request.text,
                request.language,
                speaker_embedding=speaker_embedding,
                gpt_cond_latent=gpt_cond_latent,
                file_path=out
            )
        else:
            # Use default speaker from model
            tts.tts_to_file(
                text=request.text,
                speaker=request.voiceId,
                language=request.language,
                file_path=out
            )
            
        out.seek(0)
        return StreamingResponse(out, media_type="audio/wav")
    except Exception as e:
        print(f"Error during synthesis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from prometheus_client import make_asgi_app

# Metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
