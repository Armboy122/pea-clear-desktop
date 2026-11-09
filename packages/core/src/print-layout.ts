export async function fitTravelPlaces(doc: Document): Promise<void> {
  const view = doc.defaultView;
  if (!view) return;
  await doc.fonts.ready;
  const range = doc.createRange();

  for (const place of doc.querySelectorAll<HTMLElement>('.travel-place')) {
    const available = place.getBoundingClientRect().width;
    range.selectNodeContents(place);
    const width = range.getBoundingClientRect().width;
    if (available > 1 && width > available) {
      const fontSize = Number.parseFloat(view.getComputedStyle(place).fontSize);
      place.style.fontSize = (fontSize * (available - 0.5) / width) + 'px';
    }
  }
}
