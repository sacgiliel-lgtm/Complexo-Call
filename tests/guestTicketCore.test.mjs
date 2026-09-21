import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TTL_MS,
  createGuestTicket,
  verifyGuestTicket,
} from '../lib/guestTicketCore.mjs';

process.env.GUEST_TICKET_SECRET = 'cpx-test-secret-0123456789abcdef-0123456789abcdef';

test('creates and verifies a valid guest ticket', () => {
  const expiresAt = Date.now() + DEFAULT_TTL_MS;
  const ticket = createGuestTicket({
    jti: 'test-jti',
    username: 'Visitante',
    inviteId: 'invite-123',
    expiresAt,
  });

  const payload = verifyGuestTicket(ticket);

  assert.equal(payload?.jti, 'test-jti');
  assert.equal(payload?.username, 'Visitante');
  assert.equal(payload?.inviteId, 'invite-123');
  assert.equal(payload?.exp, expiresAt);
});

test('rejects a tampered guest ticket', () => {
  const ticket = createGuestTicket({
    jti: 'test-jti',
    username: 'Visitante',
    inviteId: 'invite-123',
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });

  const tampered = ticket.slice(0, -1) + (ticket.endsWith('a') ? 'b' : 'a');

  assert.equal(verifyGuestTicket(tampered), null);
});

test('rejects an expired guest ticket', () => {
  const ticket = createGuestTicket({
    jti: 'test-jti',
    username: 'Visitante',
    inviteId: 'invite-123',
    expiresAt: Date.now() - 1000,
  });

  assert.equal(verifyGuestTicket(ticket), null);
});

test('rejects malformed guest tickets', () => {
  assert.equal(verifyGuestTicket(''), null);
  assert.equal(verifyGuestTicket('abc'), null);
  assert.equal(verifyGuestTicket('abc.def.ghi'), null);
});
