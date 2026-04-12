import { delay } from "./utils.js";

export function createCutsceneOne(audio, ui) {
  let token = 0;
  let cancelBag = [];
  let active = true;

  function invalidate() {
    if (!active) return;

    active = false;
    token++;

    cancelBag.forEach((fn) => fn());
    cancelBag = [];

    audio.stopAll();
    gsap.killTweensOf("*");
  }

  async function start() {
    const t = ++token;
    active = true;

    audio.play("rain", { id: "rain", volume: 0.3 });

    await delay(1000, cancelBag);
    if (!active || t !== token) return;

    await audio.playAsync("click");
    if (!active || t !== token) return;

    await delay(2000, cancelBag);
    if (!active || t !== token) return;

    await audio.playAsync("crt", {
      volume: 0.4,
      subtitles: "static/subtitles/crt_intro.vtt",
    });
    if (!active || t !== token) return;

    await audio.playAsync("click");
    if (!active || t !== token) return;

    await audio.playAsync("cs1", {
      subtitles: "static/subtitles/disbelief_cs1.vtt",
    });
    if (!active || t !== token) return;

    await audio.fadeOut("rain", 1);

    if (active) ui.finish();
  }

  return {
    start,
    skip: invalidate,
  };
}
