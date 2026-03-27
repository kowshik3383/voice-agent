from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from bark import SAMPLE_RATE, generate_audio, preload_models
import numpy as np
import io
import uvicorn
from scipy.io.wavfile import write as write_wav
from fastapi.responses import StreamingResponse

app = FastAPI()

# Preload models
print("Preloading Bark models...")
preload_models()

class TTSRequest(BaseModel):
    text: str
    voiceId: string = "v2/en_speaker_6"
    speed: float = 1.0

@app.post("/tts")
async def synthesize(request: TTSRequest):
    try:
        audio_array = generate_audio(request.text, history_prompt=request.voiceId)
        
        # Write to buffer
        out = io.BytesIO()
        write_wav(out, SAMPLE_RATE, audio_array)
        out.seek(0)
        
        return StreamingResponse(out, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
