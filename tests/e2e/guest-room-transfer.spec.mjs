import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const guestUrl = process.env.E2E_GUEST_URL;
const adminStorageState = process.env.E2E_ADMIN_STORAGE_STATE || 'playwright/.auth/admin.json';
const destinationRoom = process.env.E2E_DESTINATION_ROOM;

test('guest transfer survives LiveKit move and updates the visible room', async ({ browser }) => {
  test.skip(!guestUrl, 'Defina E2E_GUEST_URL com um convite de convidado válido.');
  test.skip(!destinationRoom, 'Defina E2E_DESTINATION_ROOM com uma call ativa de destino.');
  test.skip(!fs.existsSync(adminStorageState), `Arquivo de autenticação não encontrado: ${adminStorageState}`);

  const adminContext = await browser.newContext({ storageState: adminStorageState });
  const guestContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const guestPage = await guestContext.newPage();

  try {
    await guestPage.goto(guestUrl, { waitUntil: 'domcontentloaded' });

    const guestSessionResponse = await guestPage.request.get('/api/guest/session');
    expect(guestSessionResponse.ok()).toBeTruthy();
    const guestSession = await guestSessionResponse.json();
    expect(guestSession.currentRoom).toBeTruthy();

    const sourceRoom = guestSession.currentRoom;
    const identity = `guest:${guestSession.jti}`;

    await adminPage.goto('/servidor', { waitUntil: 'domcontentloaded' });

    const moveResponse = await adminPage.request.post('/api/admin/participants', {
      data: {
        sourceRoom,
        destinationRoom,
        identity,
        name: guestSession.username,
      },
    });

    expect(moveResponse.ok()).toBeTruthy();
    const moveResult = await moveResponse.json();
    expect(moveResult.destinationRoom).toBe(destinationRoom);
    expect(moveResult.idempotent).not.toBe(true);

    await expect(
      guestPage.locator('.topbar-channel strong').filter({ hasText: destinationRoom }),
    ).toHaveText(destinationRoom);

    const retryResponse = await adminPage.request.post('/api/admin/participants', {
      data: {
        sourceRoom,
        destinationRoom,
        identity,
        name: guestSession.username,
      },
    });

    expect(retryResponse.ok()).toBeTruthy();
    const retryResult = await retryResponse.json();
    expect(retryResult.idempotent).toBe(true);
    expect(retryResult.mode).toBe('already_at_destination');
  } finally {
    await guestContext.close();
    await adminContext.close();
  }
});
