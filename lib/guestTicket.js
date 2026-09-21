import {
  DEFAULT_TTL_MS,
  createGuestTicket,
  verifyGuestTicket,
} from './guestTicketCore.mjs';

export { DEFAULT_TTL_MS, createGuestTicket, verifyGuestTicket };

export function getGuestTicketFromCookie(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)cpx_guest_ticket=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
