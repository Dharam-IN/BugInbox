import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, createOwner, createProject, makePng, multipart, resetDatabase, testApp } from './helpers.ts';

/**
 * Every owner-facing endpoint must scope by owner. Missing resources and
 * other people's resources both return 404, so ids cannot be probed.
 */
describe('tenant isolation', () => {
  beforeEach(resetDatabase);

  it('keeps projects, reports and screenshots private to their owner', async () => {
    const app = await testApp();
    const alice = await createOwner('alice@owner.test');
    const mallory = await createOwner('mallory@owner.test');

    const project = await createProject(alice, 'Alice site', ['https://alice.test']);

    const png = await makePng();
    const submission = multipart(
      { message: 'Alice private report about the checkout page', dedupeKey: 'isolation-0001' },
      { field: 'screenshot', filename: 'shot.png', contentType: 'image/png', data: png },
    );
    const ingest = await app.inject({
      method: 'POST',
      url: `/api/v1/widget/${project.publicKey}/reports`,
      headers: { ...submission.headers, origin: 'https://alice.test' },
      payload: submission.payload,
    });
    expect(ingest.statusCode).toBe(201);
    const reportId = ingest.json().id as string;

    // Alice can see everything.
    expect((await app.inject({ method: 'GET', url: `/api/v1/projects/${project.id}`, headers: authHeaders(alice) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/reports/${reportId}`, headers: authHeaders(alice) })).statusCode).toBe(200);
    const shot = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${reportId}/screenshot`,
      headers: authHeaders(alice),
    });
    expect(shot.statusCode).toBe(200);
    expect(shot.headers['content-type']).toBe('image/png');

    // Mallory can see none of it, and gets 404 rather than 403.
    for (const url of [
      `/api/v1/projects/${project.id}`,
      `/api/v1/reports/${reportId}`,
      `/api/v1/reports/${reportId}/screenshot`,
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: authHeaders(mallory) });
      expect(response.statusCode, url).toBe(404);
    }

    // Nor can she change or delete them.
    const patchProject = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(mallory),
      payload: { name: 'Taken over' },
    });
    expect(patchProject.statusCode).toBe(404);

    const patchReport = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reports/${reportId}`,
      headers: authHeaders(mallory),
      payload: { status: 'resolved' },
    });
    expect(patchReport.statusCode).toBe(404);

    const deleteReport = await app.inject({
      method: 'DELETE',
      url: `/api/v1/reports/${reportId}`,
      headers: authHeaders(mallory),
    });
    expect(deleteReport.statusCode).toBe(404);

    const deleteProject = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(mallory),
      payload: { confirmName: project.name },
    });
    expect(deleteProject.statusCode).toBe(404);

    // Alice's data survived all of that.
    expect((await app.inject({ method: 'GET', url: `/api/v1/reports/${reportId}`, headers: authHeaders(alice) })).statusCode).toBe(200);
  });

  it('only lists an owner their own projects and reports', async () => {
    const app = await testApp();
    const alice = await createOwner('alice2@owner.test');
    const bob = await createOwner('bob2@owner.test');
    await createProject(alice, 'Alice site');
    await createProject(bob, 'Bob site');

    const aliceProjects = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: authHeaders(alice) });
    expect(aliceProjects.json().projects).toHaveLength(1);
    expect(aliceProjects.json().projects[0].name).toBe('Alice site');

    const bobReports = await app.inject({ method: 'GET', url: '/api/v1/reports', headers: authHeaders(bob) });
    expect(bobReports.json().reports).toHaveLength(0);
  });

  it('refuses every owner endpoint without a session', async () => {
    const app = await testApp();
    for (const url of ['/api/v1/projects', '/api/v1/reports', '/api/v1/auth/me']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });
});
