const AudioContextClass = window.AudioContext || window.webkitAudioContext;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SubtitleEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.cues = [];
    this.active = false;
    this.currentCue = null;
    this.index = 0;

    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      bottom: "5%",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "10px 20px",
      background: "rgba(21,21,21,0.6)",
      color: "#fff",
      fontFamily: "monospace",
      fontSize: "18px",
      borderRadius: "6px",
      pointerEvents: "none",
      whiteSpace: "pre-line",
      textAlign: "center",
      minWidth: "200px",
      opacity: "0",
    });

    document.body.appendChild(this.el);
  }

  async load(url) {
    const res = await fetch(url);
    const text = await res.text();

    const regex =
      /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n([\s\S]*?)(?=\n\n|$)/g;

    const toSec = (t) => {
      const [h, m, s] = t.split(":");
      return +h * 3600 + +m * 60 + parseFloat(s);
    };

    let match;
    while ((match = regex.exec(text))) {
      this.cues.push({
        start: toSec(match[1]),
        end: toSec(match[2]),
        text: match[3].trim(),
      });
    }
  }

  start(startTime) {
    this.active = true;
    this.startTime = startTime;
    this.index = 0;
    this.currentCue = null;
    this._loop();
  }

  stop() {
    this.active = false;
    this.currentCue = null;
    this.index = 0;
    this.el.textContent = "";
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { opacity: 0 });
  }

  _getTime() {
    return this.ctx.currentTime - this.startTime;
  }

  _loop() {
    if (!this.active) return;

    const t = this._getTime();

    while (this.cues[this.index] && t > this.cues[this.index].end) {
      this.index++;
    }

    const cue = this.cues[this.index];

    if (cue && t >= cue.start && t <= cue.end) {
      if (this.currentCue !== cue) {
        this.currentCue = cue;
        this._showCue(cue.text);
      }
    } else if (this.currentCue) {
      this.currentCue = null;
      this._hideCue();
    }

    requestAnimationFrame(() => this._loop());
  }

  _showCue(text) {
    if (this.el.textContent === text) return;

    this.el.textContent = text;

    gsap.killTweensOf(this.el);

    gsap.fromTo(
      this.el,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.15 },
    );
  }

  _hideCue() {
    gsap.killTweensOf(this.el);
    gsap.to(this.el, { opacity: 0, y: 10, duration: 0.1 });
  }
}

class AudioEngine {
  constructor() {
    this.ctx = new AudioContextClass();
    this.buffers = {};
    this.instances = {};

    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();

    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.defaultVolume = 1;
  }

  stopAll() {
    Object.values(this.instances).forEach((instance) => {
      try {
        instance.source.stop();
      } catch {}

      if (instance.subtitles) instance.subtitles.stop();
      if (instance._cancel) instance._cancel();
    });

    this.instances = {};
  }

  async load(name, url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this.buffers[name] = await this.ctx.decodeAudioData(arr);
  }

  async _attachSubtitles(source, options, startTime) {
    if (!options.subtitles) return null;

    const sub = new SubtitleEngine(this.ctx);
    await sub.load(options.subtitles);
    sub.start(startTime);

    const original = source.onended;
    source.onended = () => {
      sub.stop();
      if (original) original();
    };

    return sub;
  }

  _registerInstance(id, instance) {
    if (!id) return;

    this.instances[id] = instance;

    const original = instance.source.onended;
    instance.source.onended = () => {
      delete this.instances[id];
      if (original) original();
    };
  }

  async play(name, options = {}) {
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    source.buffer = this.buffers[name];
    source.loop = options.loop || false;

    gain.gain.value = options.volume ?? this.defaultVolume;

    const bus = options.bus === "music" ? this.music : this.sfx;

    source.connect(gain);
    gain.connect(bus);

    const startTime = this.ctx.currentTime + (options.offset || 0);

    const subtitles = await this._attachSubtitles(source, options, startTime);

    source.start(startTime);

    const instance = { source, gain, subtitles };

    this._registerInstance(options.id, instance);

    return instance;
  }

  async playAsync(name, options = {}) {
    const instance = await this.play(name, options);

    return new Promise((resolve) => {
      let resolved = false;

      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const original = instance.source.onended;

      instance.source.onended = () => {
        if (original) original();
        done();
      };

      instance._cancel = done;
    });
  }

  fade(gainNode, to, duration = 1) {
    const now = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(to, now + duration);
  }

  forceFadeOutById(id, duration = 0.5) {
    const instance = this.instances[id];
    if (!instance) return Promise.resolve();

    return new Promise((resolve) => {
      const now = this.ctx.currentTime;

      instance.gain.gain.cancelScheduledValues(now);
      instance.gain.gain.setValueAtTime(instance.gain.gain.value, now);
      instance.gain.gain.linearRampToValueAtTime(0, now + duration);

      const original = instance.source.onended;

      instance.source.onended = () => {
        if (original) original();
        resolve();
      };

      instance.source.stop(now + duration);
    });
  }
}

const audio = new AudioEngine();
let bgInstance = null;

let skipBtn;
let play_button;
let isCutsceneActive = false;
let cutsceneToken = 0;

document.addEventListener("DOMContentLoaded", async () => {
  skipBtn = document.getElementById("skip");
  play_button = document.getElementById("play");

  skipBtn.style.display = "none";

  skipBtn.addEventListener("click", () => {
    if (!isCutsceneActive) return;

    cutsceneToken++;
    isCutsceneActive = false;

    audio.stopAll();
    gsap.killTweensOf("*");

    skipBtn.style.display = "none";
  });

  const preface = document.getElementById("preface");

  await audio.load("crt_intro_cs", "static/media/voicelines/crt_intro.wav");
  await audio.load("bg", "static/media/fluorescent_buzzing.mp3");
  await audio.load("click", "static/media/click.mp3");
  await audio.load("hover", "static/media/hover.mp3");
  await audio.load("rain", "static/media/rain.mp3");
  await audio.load(
    "disbelief_cs1",
    "static/media/voicelines/main/disbelief_cs1.wav",
  );

  preface.addEventListener("click", async () => {
    await audio.ctx.resume();

    bgInstance = await audio.play("bg", {
      loop: true,
      volume: 0,
      bus: "music",
      id: "bg",
    });

    audio.fade(bgInstance.gain, 0.5, 2);

    preface.style.opacity = "0";
    setTimeout(() => (preface.style.display = "none"), 800);

    gsap.to("#hero", {
      filter: "blur(0px)",
      duration: 2,
      ease: "expo.out",
    });
  });

  play_button.addEventListener("mouseover", () => {
    audio.play("hover", { volume: 0.6 });
  });

  play_button.addEventListener("click", async () => {
    skipBtn.style.display = "block";

    audio.play("click", { volume: 1 });

    if (bgInstance) {
      await audio.forceFadeOutById("bg", 0.5);
    }

    await start();
  });
});

function hide(id) {
  const el = document.getElementById(id);
  gsap.to(el, { duration: 0.3, autoAlpha: 0, display: "none" });
}

function show(id, display = "block") {
  const el = document.getElementById(id);
  el.style.display = display;

  gsap.fromTo(
    el,
    { autoAlpha: 0, filter: "blur(10px)" },
    { duration: 0.4, autoAlpha: 1, filter: "blur(0px)", ease: "expo.out" },
  );
}

async function start() {
  isCutsceneActive = true;

  const token = ++cutsceneToken;

  hide("hero");

  audio.play("rain", { volume: 0.3, id: "rain" });

  await delay(1000);
  if (token !== cutsceneToken) return;

  await audio.playAsync("click", { volume: 1 });
  if (token !== cutsceneToken) return;

  await delay(2000);
  if (token !== cutsceneToken) return;

  await audio.playAsync("crt_intro_cs", {
    volume: 0.8,
    subtitles: "static/subtitles/crt_intro.vtt",
  });
  if (token !== cutsceneToken) return;

  await audio.playAsync("click", { volume: 1 });
  if (token !== cutsceneToken) return;

  await delay(500);
  if (token !== cutsceneToken) return;

  await audio.playAsync("disbelief_cs1", {
    volume: 1,
    subtitles: "static/subtitles/disbelief_cs1.vtt",
  });
  if (token !== cutsceneToken) return;

  await audio.forceFadeOutById("rain", 1);
  if (token !== cutsceneToken) return;

  await delay(2000);
  if (token !== cutsceneToken) return;

  skipBtn.style.display = "none";

  show("renderCanvas");
  createSceneTest();

  isCutsceneActive = false;
}
