import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Gets the duration of an audio file in seconds.
 * 
 * @param filePath Path to the audio file.
 * @returns Promise resolving to the duration in seconds.
 */
export const getAudioDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
};

/**
 * Validates audio requirements:
 * - Minimum duration: 5 minutes (300 seconds)
 * - Recommended duration: 5-30 minutes (300 - 1800 seconds)
 * 
 * @param filePath Path to the audio file.
 * @returns Object with duration and validation results.
 */
export const validateAudioRequirements = async (filePath: string) => {
  const duration = await getAudioDuration(filePath);
  const isValid = duration >= 300;
  const isRecommended = duration >= 300 && duration <= 1800;

  return {
    duration,
    isValid,
    isRecommended,
    error: isValid ? null : 'Audio too short. Minimum 5 minutes required for voice training.'
  };
};
