import { SubtitleEngine } from "./subtitles.js";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.instances = new Map();
  }

  init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();

    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async load(name, url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this.buffers.set(name, await this.ctx.decodeAudioData(arr));
  }

  async play(name, options = {}) {
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    source.buffer = this.buffers.get(name);
    source.loop = !!options.loop;
    gain.gain.value = options.volume ?? 1;

    const bus = options.bus === "music" ? this.music : this.sfx;

    source.connect(gain);
    gain.connect(bus);

    const startTime = this.ctx.currentTime + (options.offset || 0);

    let subtitles = null;
    if (options.subtitles) {
      subtitles = new SubtitleEngine(this.ctx);
      await subtitles.load(options.subtitles);
      subtitles.start(startTime);
    }

    source.start(startTime);

    const instance = { source, gain, subtitles, resolve: null, stopped: false };

    const promise = new Promise((res) => {
      instance.resolve = res;
    });

    source.onended = () => {
      if (instance.stopped) return;
      instance.stopped = true;
      subtitles?.stop();
      instance.resolve?.();
      if (options.id) this.instances.delete(options.id);
    };

    if (options.id) this.instances.set(options.id, instance);

    instance.promise = promise;
    return instance;
  }

  async playAsync(name, options = {}) {
    const i = await this.play(name, options);
    return i.promise;
  }

  stopAll() {
    for (const i of this.instances.values()) {
      try {
        i.stopped = true;
        i.source.stop(0);
      } catch {}
      i.subtitles?.stop();
      i.resolve?.();
    }
    this.instances.clear();
  }

  fade(gain, to, duration = 1) {
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + duration);
  }

  fadeOut(id, duration = 0.5) {
    const i = this.instances.get(id);
    if (!i) return;

    const now = this.ctx.currentTime;

    i.gain.gain.cancelScheduledValues(now);
    i.gain.gain.setValueAtTime(i.gain.gain.value, now);
    i.gain.gain.linearRampToValueAtTime(0, now + duration);

    setTimeout(() => {
      try {
        i.stopped = true;
        i.source.stop();
      } catch {}
      i.resolve?.();
      this.instances.delete(id);
    }, duration * 1000);
  }
}
