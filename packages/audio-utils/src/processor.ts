import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Converts audio to a normalized format for training (16kHz mono WAV).
 * 
 * @param inputPath Path to the input audio file.
 * @param outputPath Path to the output audio file (.wav).
 * @returns Promise resolving to the output path.
 */
export const convertToWav = (inputPath: string, outputPath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
};
