/**
 * Notification Sound Utility
 * Uses Web Audio API to generate notification tones — no external files needed.
 * Supports repeating alerts that continue until manually stopped.
 */

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

/**
 * Play a notification sound that loops 3 times.
 * Each chime is ~1.35s long, with a gap between repeats.
 * @param {number} repeatCount - Number of times to play (default: 3)
 * @param {number} delayMs - Delay between each chime in ms (default: 1800)
 */
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

/**
 * Start a repeating notification alert.
 * Plays the chime every `intervalMs` until stopNotificationAlert() is called.
 * @param {number} intervalMs - Interval between chimes in ms (default: 3000 = 3 seconds)
 */
export const startNotificationAlert = (intervalMs = 3000) => {
  // Don't stack multiple alerts
  if (isRinging) return;
  isRinging = true;

  // Play immediately
  playChime();

  // Repeat
  repeatInterval = setInterval(() => {
    playChime();
  }, intervalMs);
};

/**
 * Stop the repeating notification alert.
 */
export const stopNotificationAlert = () => {
  if (repeatInterval) {
    clearInterval(repeatInterval);
    repeatInterval = null;
  }
  isRinging = false;
};

/**
 * Check if the alert is currently ringing.
 */
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
  } catch (err) {
    // ignore
  }
};
