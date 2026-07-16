// Lightweight sound effects synthesized with the Web Audio API -- no audio
// files needed. All sounds are short oscillator blips with a gain envelope.
// A single shared AudioContext is created lazily on first use (by which point
// the player has already interacted with the page, satisfying autoplay rules).

let ctx = null;
let muted = false;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function blip({ freq, type = 'sine', dur = 0.12, gain = 0.14, slideTo, delay = 0 }) {
  const ac = getCtx();
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function chord(freqs, { type = 'sine', step = 0.09, dur = 0.18, gain = 0.13 } = {}) {
  freqs.forEach((f, i) => blip({ freq: f, type, dur, gain, delay: i * step }));
}

export const sfx = {
  draw: () => blip({ freq: 300, type: 'triangle', slideTo: 520, dur: 0.1, gain: 0.12 }),
  discard: () => blip({ freq: 600, type: 'square', slideTo: 180, dur: 0.12, gain: 0.1 }),
  meld: () => chord([523, 659, 784], { type: 'triangle' }), // C-E-G
  ceki: () => {
    blip({ freq: 880, type: 'sawtooth', dur: 0.14, gain: 0.13 });
    blip({ freq: 1180, type: 'sawtooth', dur: 0.22, gain: 0.13, delay: 0.14 });
  },
  turn: () => blip({ freq: 620, type: 'sine', dur: 0.14, gain: 0.1 }),
  myturn: () => chord([660, 990], { type: 'sine', step: 0.1, dur: 0.15 }),
  win: () => chord([523, 659, 784, 1046], { type: 'triangle', step: 0.12, dur: 0.22, gain: 0.16 }),
  lose: () => chord([420, 340, 280], { type: 'sawtooth', step: 0.13, dur: 0.22, gain: 0.12 }),
};

export function setMuted(m) {
  muted = m;
  if (typeof window !== 'undefined') localStorage.setItem('remi:muted', m ? '1' : '0');
}

export function loadMuted() {
  if (typeof window === 'undefined') return false;
  muted = localStorage.getItem('remi:muted') === '1';
  return muted;
}
