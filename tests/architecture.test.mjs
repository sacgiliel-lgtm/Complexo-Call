import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('LiveKit token route uses Clerk and guest tickets only', () => {
  const source = read('app/api/token/route.js');

  assert.match(source, /getRequestClerkIdentity/);
  assert.match(source, /verifyGuestTicket/);
  assert.doesNotMatch(source, /createClient/);
  assert.doesNotMatch(source, /supabase\.auth/);
  assert.doesNotMatch(source, /Authorization.*Bearer/);
  assert.doesNotMatch(source, /access_token/);
});

test('legacy authentication helpers are gone', () => {
  assert.equal(fs.existsSync(path.join(root, 'app/api/resolve-login/route.js')), false);
  assert.doesNotMatch(read('lib/clerkAuth.js'), /externalId/);
  assert.doesNotMatch(read('lib/clerkAuth.js'), /legacyUser/);
  assert.doesNotMatch(read('lib/clerkAuth.js'), /must_change_password/);
});

test('LiveKit move blocks self-targeting and synchronizes guest authorization before moving', () => {
  const source = read('app/api/admin/participants/route.js');

  assert.match(source, /ownIdentity = actor\.type === 'member' \? actor\.clerkUserId : actor\.id/);

  const authUpdate = source.indexOf(".update({ current_room_name: destinationRoom })");
  const livekitMove = source.indexOf("service.moveParticipant(sourceRoom, identity, destinationRoom)");

  assert.ok(authUpdate >= 0, 'guest room authorization update is missing');
  assert.ok(livekitMove >= 0, 'LiveKit move operation is missing');
  assert.ok(authUpdate < livekitMove, 'guest authorization must be updated before LiveKit move');
});

test('servidor separates pending Clerk auth from guest sessions', () => {
  const source = read('app/servidor/page.js');

  assert.match(source, /useAuth\(\{ treatPendingAsSignedOut: false \}\)/);
  assert.match(source, /if \(!clerkLoaded \|\| typeof isSignedIn === 'undefined'\)/);
  assert.match(source, /if \(isSignedIn === true && clerkUser\?\.id\)/);
  assert.match(source, /else if \(isSignedIn === false\)/);
});

test('health endpoint exists and presence heartbeat is configured', () => {
  assert.equal(fs.existsSync(path.join(root, 'app/api/health/route.js')), true);

  const serverPage = read('app/servidor/page.js');
  assert.match(serverPage, /PRESENCE_HEARTBEAT_MS = 45000/);
  assert.match(serverPage, /X-Presence-Heartbeat/);
  assert.match(serverPage, /pagehide/);
});

test('call client has reconnect protection and room move synchronization', () => {
  const source = read('components/CallPolishSafe.js');

  assert.match(source, /RoomEvent\.Reconnected/);
  assert.match(source, /12000/);
  assert.match(source, /onManualDisconnect/);
  assert.match(source, /onRoomMoved\?\.\(roomName, token\)/);
});

test('audit migration records request context fields', () => {
  const migration = read('supabase/migrations/20260921_observability.sql');
  assert.match(migration, /ip_address/);
  assert.match(migration, /user_agent/);
  assert.match(migration, /request_id/);
  assert.match(migration, /source/);

  const logger = read('lib/discordLogger.js');
  assert.match(logger, /getRequestContext/);
  assert.match(logger, /request_id: context\.requestId/);
});
