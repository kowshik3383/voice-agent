import sys
import os
import torch
from TTS.api import TTS

def train_voice(voice_id, audio_path, output_dir):
    print(f"Starting training for voice {voice_id} with audio {audio_path}...")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Load model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading XTTS v2 on {device}...")
    tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    
    # Since we're doing lightweight cloning (extracting embeddings) 
    # instead of full fine-tuning (which takes hours/GPU), 
    # we'll use the conditioning latents method.
    
    try:
        # Extract embeddings
        gpt_cond_latent, speaker_embedding = tts.model.get_conditioning_latents(audio_path=[audio_path])
        
        # Save embeddings to the output directory
        checkpoint_path = os.path.join(output_dir, "config.pth")
        torch.save({
            "gpt_cond_latent": gpt_cond_latent,
            "speaker_embedding": speaker_embedding,
        }, checkpoint_path)
        
        # Generate a sample to verify
        sample_path = os.path.join(output_dir, "sample.wav")
        tts.tts_to_file(
            text="Training completed successfully. This is a sample of your new voice.",
            speaker_wav=audio_path,
            language="en",
            file_path=sample_path
        )
        
        print(f"Training completed. Model saved at {checkpoint_path}")
        return True
    except Exception as e:
        print(f"Error during training: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python train.py <voice_id> <audio_path> <output_dir>")
        sys.exit(1)
        
    v_id = sys.argv[1]
    a_path = sys.argv[2]
    out_dir = sys.argv[3]
    
    success = train_voice(v_id, a_path, out_dir)
    if not success:
        sys.exit(1)
