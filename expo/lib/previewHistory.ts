/** Local preview navigation mirrors router.navigate: revisiting a page unwinds to it. */
export function previewDestination(history: string[], current: string, destination: string): string {
  if (current === destination) return current;
  const existing = history.lastIndexOf(destination);
  if (existing >= 0) history.splice(existing);
  else history.push(current);
  return destination;
}
export function previousPreviewPage(history: string[]): string | null {
  return history.pop() ?? null;
}
