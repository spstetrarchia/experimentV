export function hide(id) {
  const el = document.getElementById(id);
  if (!el) return;

  gsap.killTweensOf(el);

  gsap.to(el, {
    opacity: 0,
    duration: 0.25,
    onComplete: () => {
      el.style.display = "none";
    },
  });
}

export function show(id, display = "block") {
  const el = document.getElementById(id);
  if (!el) return;

  gsap.killTweensOf(el);

  el.style.display = display;

  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 });
}
