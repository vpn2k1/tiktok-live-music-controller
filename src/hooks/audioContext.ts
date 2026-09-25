let audioContext: AudioContext | null = null;

/** One AudioContext for the app's synthesized sounds and game music (started on first use). */
export function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
  return audioContext;
}
