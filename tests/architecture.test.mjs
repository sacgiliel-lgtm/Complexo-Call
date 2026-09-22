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

test('display name remains owned by the application profile', () => {
  const source = read('lib/clerkAuth.js');

  assert.match(source, /O username salvo no perfil é o nome exibido da aplicação/);
  assert.match(source, /if \(!profile\.username\)/);
  assert.doesNotMatch(source, /const desiredUsername = user\.username \|\| profile\.username/);
});

test('profile update synchronizes name to chat history and active LiveKit participant', () => {
  const route = read('app/api/profile/route.js');

  assert.match(route, /from\('channel_messages'\)/);
  assert.match(route, /update\(\{ sender_name: data\.username \}\)/);
  assert.match(route, /new RoomServiceClient/);
  assert.match(route, /updateParticipant\(roomName, actor\.clerkUserId, \{ name: data\.username \}\)/);
  assert.match(route, /roomName = String\(body\.roomName/);
  assert.match(route, /livekitUpdated/);
});

test('server sends the active room when changing the display name', () => {
  const page = read('app/servidor/page.js');

  assert.match(page, /roomName: active\?\.name \|\| ''/);
  assert.match(page, /setMessages\(\(current\) => current\.map/);
  assert.match(page, /sender_name: nextUsername/);
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

test('MoveParticipant is idempotent after a completed transfer', () => {
  const source = read('app/api/admin/participants/route.js');

  assert.match(source, /alreadyAtDestination/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /participant_move_idempotent/);
  assert.match(source, /currentGuestRoom === destinationRoom/);
  assert.match(source, /mode: 'already_at_destination'/);
});

test('guest reconnect reconciles the server room and refreshes the LiveKit token', () => {
  const serverPage = read('app/servidor/page.js');
  const callClient = read('components/CallPolishSafe.js');

  assert.match(serverPage, /const handleCallReconnected = useCallback/);
  assert.match(serverPage, /fetch\('\/api\/guest\/session'/);
  assert.match(serverPage, /session\.currentRoom/);
  assert.match(serverPage, /await handleRoomMoved\(serverRoom, tokenJson\.token\)/);
  assert.match(serverPage, /onCallReconnected=\{handleCallReconnected\}/);
  assert.match(callClient, /onCallReconnected\?\.\(room\?\.name \|\| channel\.name\)/);
});

test('guest transfer end-to-end contract covers move, LiveKit room event and UI reconciliation', () => {
  const route = read('app/api/admin/participants/route.js');
  const page = read('app/servidor/page.js');
  const client = read('components/CallPolishSafe.js');

  assert.match(route, /guest_sessions/);
  assert.match(route, /current_room_name: destinationRoom/);
  assert.match(route, /service\.moveParticipant\(sourceRoom, identity, destinationRoom\)/);
  assert.match(client, /RoomEvent\.Reconnected/);
  assert.match(page, /onRoomMoved=\{handleRoomMoved\}/);
  assert.match(page, /onCallReconnected=\{handleCallReconnected\}/);
  assert.match(page, /setActive\(targetChannel\)/);
  assert.match(page, /setToken\(movedToken\)/);
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
