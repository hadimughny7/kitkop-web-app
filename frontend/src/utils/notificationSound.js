// Notification tones use Web Audio synthesis without external audio files.

let audioContext = null;
let repeatInterval = null;
let isRinging = false;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

/**
 * Original soft bell motif: C6, E6, G6.
 * Gentle attacks and fading harmonics keep repeated alerts clear without clicks.
 */
const playChime = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.02;
    const notes = [
      { frequency: 1046.50, offset: 0, volume: 0.19 },
      { frequency: 1318.51, offset: 0.19, volume: 0.16 },
      { frequency: 1567.98, offset: 0.38, volume: 0.14 },
    ];

    notes.forEach(({ frequency, offset, volume }) => {
      // A quiet overtone gives the sine bell a little sparkle, without harshness.
      [1, 2].forEach((harmonic) => {
        const start = now + offset;
        const duration = harmonic === 1 ? 0.95 : 0.36;
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency * harmonic, start);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(volume * (harmonic === 1 ? 1 : 0.12), start + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration - 0.03);
        envelope.gain.linearRampToValueAtTime(0, start + duration);
        oscillator.connect(envelope);
        envelope.connect(ctx.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + duration);
      });
    });
  } catch (err) {
    console.warn('Notification sound failed:', err);
  }
};

// Each chime lasts about 1.35 seconds; delayMs sets the interval between starts.
export const playNotificationSound = (repeatCount = 3, delayMs = 1800) => {
  let played = 0;

  const playNext = () => {
    if (played >= repeatCount) return;
    playChime();
    played++;
    if (played < repeatCount) {
      setTimeout(playNext, delayMs);
    }
  };

  playNext();
};

// The alert repeats until stopNotificationAlert() is called.
export const startNotificationAlert = (intervalMs = 3000) => {
  // Don't stack multiple alerts
  if (isRinging) return;
  isRinging = true;

  playChime();

  repeatInterval = setInterval(() => {
    playChime();
  }, intervalMs);
};

export const stopNotificationAlert = () => {
  if (repeatInterval) {
    clearInterval(repeatInterval);
    repeatInterval = null;
  }
  isRinging = false;
};

export const isAlertRinging = () => isRinging;

/**
 * Initialize audio context on user interaction (required by browser policy).
 * Call this once on any click/touch event.
 */
export const initAudioContext = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch {
    // Audio initialization is optional when the browser denies access.
  }
};
