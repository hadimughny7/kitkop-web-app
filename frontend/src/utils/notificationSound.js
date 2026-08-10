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
 * Play a single "ding-dong-ding" notification chime.
 */
const playChime = () => {
  try {
    const ctx = getAudioContext();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // === First tone (higher pitch "ding") ===
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(830, now);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // === Second tone (lower pitch "dong") ===
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, now + 0.15);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);

    // === Third tone (resolution) ===
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(990, now + 0.3);
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.setValueAtTime(0.25, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.8);

  } catch (err) {
    console.warn('Notification sound failed:', err);
  }
};

/**
 * Play a notification sound that loops 3 times.
 * Each chime is ~0.8s long, with a gap between repeats.
 * @param {number} repeatCount - Number of times to play (default: 3)
 * @param {number} delayMs - Delay between each chime in ms (default: 1000)
 */
export const playNotificationSound = (repeatCount = 3, delayMs = 1000) => {
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
