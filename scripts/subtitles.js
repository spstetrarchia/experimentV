export class SubtitleEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.cues = [];
    this.timers = [];
    this.active = false;

    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      bottom: "5%",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "10px 20px",
      background: "rgba(21,21,21,0.6)",
      color: "#ffe100",
      fontFamily: "monospace",
      fontSize: "18px",
      borderRadius: "6px",
      pointerEvents: "none",
      whiteSpace: "pre-line",
      textAlign: "center",
      minWidth: "200px",
      opacity: "0",
      textShadow: "2px 2px black",
      fontStyle: "italic",
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
    this.stop();
    this.active = true;

    const now = this.ctx.currentTime;

    for (const cue of this.cues) {
      const startDelay = Math.max(0, (startTime + cue.start - now) * 1000);
      const endDelay = Math.max(0, (startTime + cue.end - now) * 1000);

      this.timers.push(
        setTimeout(() => {
          if (!this.active) return;
          this._show(cue.text);
        }, startDelay),
      );

      this.timers.push(
        setTimeout(() => {
          if (!this.active) return;
          this._hide();
        }, endDelay),
      );
    }
  }

  stop() {
    this.active = false;
    this.timers.forEach(clearTimeout);
    this.timers.length = 0;
    this.el.textContent = "";
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { opacity: 0 });
  }

  _show(text) {
    this.el.textContent = text;
    gsap.killTweensOf(this.el);
    gsap.to(this.el, { opacity: 1, y: 0, duration: 0.15 });
  }

  _hide() {
    gsap.killTweensOf(this.el);
    gsap.to(this.el, { opacity: 0, y: 10, duration: 0.1 });
  }
}