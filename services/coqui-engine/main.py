from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from TTS.api import TTS
import torch
import io
import uvicorn
from fastapi.responses import StreamingResponse

app = FastAPI()

# Load model once at startup
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading Coqui TTS model on {device}...")
# Using a faster model like VITS by default
tts = TTS("tts_models/en/vctk/vits").to(device)

class TTSRequest(BaseModel):
    text: str
    voiceId: string = "p225"  # Default speaker for VITS VCTK
    speed: float = 1.0

@app.post("/tts")
async def synthesize(request: TTSRequest):
    try:
        # Synthesize to a buffer
        out = io.BytesIO()
        tts.tts_to_file(
            text=request.text,
            speaker=request.voiceId,
            file_path=out
        )
        out.seek(0)
        return StreamingResponse(out, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
