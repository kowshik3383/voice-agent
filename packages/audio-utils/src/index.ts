export * from './validator';
export * from './processor';

export function chunkText(text: string): string[] {
  // Simple sentence-based chunking
  // In a production system, this would be more robust (regexp for various punctuation)
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

export function generateHash(segments: string[]): string {
  // Simple hash for text + voice + emotion
  // In production, use crypto.createHash('sha256')
  const content = segments.join('|');
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}
