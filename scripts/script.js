import { AudioEngine } from "./audio.js";
import { createCutsceneOne } from "./cutscene_one.js";
import { show, hide } from "./ui.js";
const audio = new AudioEngine();
const skipBtn = document.getElementById("skip");
const playBtn = document.getElementById("play");
const preface = document.getElementById("preface");
const hero = document.getElementById("hero");
let cutscene = null;
let bgInstance = null;
preface.onclick = async () => {
  audio.init();
  await audio.ctx.resume();
  bgInstance = await audio.play("bg", {
    loop: true,
    volume: 0,
    bus: "music",
    id: "bg",
  });
  audio.fade(bgInstance.gain, 0.5, 2);
  preface.style.pointerEvents = "none";
  gsap.to(preface, {
    opacity: 0,
    duration: 0.8,
    onComplete: () => {
      preface.style.display = "none";
    },
  });
  gsap.to(hero, {
    filter: "blur(0px)",
    duration: 2,
  });
};
playBtn.onclick = async () => {
  skipBtn.style.display = "block";
  if (bgInstance) {
    await audio.fadeOut("bg", 0.5);
    bgInstance = null;
  }
  gsap.killTweensOf(hero);
  hide("hero");
  cutscene = createCutsceneOne(audio, {
    finish: () => {
      gsap.killTweensOf(hero);
      skipBtn.style.display = "none";
      cutscene = null;
    },
  });
  cutscene.start();
};
skipBtn.onclick = () => {
  if (!cutscene) return;
  cutscene.skip();
  cutscene = null;
  gsap.killTweensOf(hero);
  hero.style.opacity = "0";
  hero.style.display = "none";
  skipBtn.style.display = "none";
};
(async () => {
  audio.init();
  await Promise.all([
    audio.load("bg", "static/media/fluorescent_buzzing.mp3"),
    audio.load("click", "static/media/click.mp3"),
    audio.load("hover", "static/media/hover.mp3"),
    audio.load("rain", "static/media/rain.mp3"),
    audio.load("crt", "static/media/voicelines/crt_intro.wav"),
    audio.load("cs1", "static/media/voicelines/main/disbelief_cs1.wav"),
  ]);
})();
