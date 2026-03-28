import { useRef, useCallback } from 'react';

const SOUND_NAMES = ['battle', 'hit', 'catch', 'victory', 'defeat', 'select'];

// Sounds that should loop when played
const LOOPING_SOUNDS = ['battle'];

export default function useSound() {
  const hasInteracted = useRef(false);
  const audioCache = useRef({});

  // Track first user interaction for autoplay policy
  if (typeof window !== 'undefined' && !hasInteracted.current) {
    const markInteracted = () => {
      hasInteracted.current = true;
      window.removeEventListener('click', markInteracted);
      window.removeEventListener('keydown', markInteracted);
      window.removeEventListener('touchstart', markInteracted);
    };
    window.addEventListener('click', markInteracted);
    window.addEventListener('keydown', markInteracted);
    window.addEventListener('touchstart', markInteracted);
  }

  const play = useCallback((soundName) => {
    if (!hasInteracted.current) return;
    if (!SOUND_NAMES.includes(soundName)) return;

    try {
      // Reuse or create Audio element
      if (!audioCache.current[soundName]) {
        audioCache.current[soundName] = new Audio(`/sounds/${soundName}.mp3`);
      }
      const audio = audioCache.current[soundName];
      audio.currentTime = 0;
      audio.volume = 0.3;
      audio.loop = LOOPING_SOUNDS.includes(soundName);
      audio.play().catch(() => {
        // Sound file missing or blocked — fail silently
      });
    } catch {
      // Gracefully handle any audio errors
    }
  }, []);

  const stop = useCallback((soundName) => {
    const audio = audioCache.current[soundName];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  return { play, stop };
}
