export function delay(ms, cancelBag) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    cancelBag?.push(() => clearTimeout(id));
  });
}
