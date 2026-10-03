/** Shared by the live client shell and the realtor's preview. */
const clientPages = new Set(['/', '/listings', '/favorites', '/messages', '/message', '/calendar', '/account', '/client-profile', '/menu', '/documents', '/notifications', '/insights', '/note', '/book', '/legal']);
export function isClientPage(path: string): boolean {
  return clientPages.has(path) || path.startsWith('/listing/') || path.startsWith('/watchlist/');
}
export function isPrivateClientPage(path: string): boolean {
  return ['/account', '/favorites', '/messages', '/message', '/calendar', '/documents', '/notifications', '/client-profile', '/menu'].includes(path) || path.startsWith('/watchlist/');
}
export function clientDestination(path: string, preview: boolean): string {
  if (preview && ['/account', '/client-profile', '/client-recovery'].includes(path)) return '/menu';
  if (path === '/message') return '/messages';
  return path;
}
export const previewFeatures: Record<string, { title: string; copy: string }> = {
  '/messages': { title: 'A direct line to you', copy: 'Clients can message you here. Their conversations arrive in your realtor inbox. Your preview never opens a real client’s thread or sends a message.' },
  '/message': { title: 'A direct line to you', copy: 'Clients can message you here. Their conversations arrive in your realtor inbox. Your preview never opens a real client’s thread or sends a message.' },
  '/calendar': { title: 'Your clients’ showings', copy: 'Clients see their own viewing requests and confirmed appointments here. Your personal calendar and other clients’ appointments stay out of this view.' },
  '/documents': { title: 'Documents shared with a client', copy: 'Clients see files and transaction documents shared with them here. Your preview keeps real client documents private.' },
  '/notifications': { title: 'Updates for your clients', copy: 'Clients receive listing updates and messages intended for them here. Previewing this page does not mark your notifications as read.' },
};
