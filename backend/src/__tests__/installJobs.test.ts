import request from "supertest";
import app from "../index";
import { pool } from "../database";
import { closeAuthStoreConnections } from "../services/sqliteAuthStore";
import { installJobId } from "../routes/surveys";

const createdIds: string[] = [];
let auth = "";
let email = "";

beforeAll(async () => {
  email = `installtest-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  const reg = await request(app).post("/api/users/register").send({ full_name: "Install Crew", email, password: "TestPass123!" });
  expect(reg.status).toBe(201);
  auth = `Bearer ${reg.body.token as string}`;
});

afterAll(async () => {
  if (createdIds.length) await pool.query("DELETE FROM surveys WHERE id = ANY($1)", [createdIds]);
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
  await closeAuthStoreConnections();
  await pool.end();
});

const project = () => `proj-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function openJob(projectId: string, extra: Record<string, unknown> = {}) {
  const id = installJobId(projectId);
  return request(app)
    .put(`/api/surveys/install-jobs/${id}`)
    .set("Authorization", auth)
    .send({ solarpro_project_id: projectId, project_name: "Andrew Lindsey", site_address: "1 Main St", ...extra });
}

function sendPhoto(jobId: string, clientId: string, meta: Record<string, unknown>) {
  return request(app)
    .post(`/api/surveys/${jobId}/photos`)
    .set("Authorization", auth)
    .field("labels", JSON.stringify(["Install day · Feet in rafters"]))
    .field("client_ids", JSON.stringify([clientId]))
    .field("metas", JSON.stringify([meta]))
    .attach("photos", Buffer.from(`img-${clientId}`), { filename: `${clientId}.jpg`, contentType: "image/jpeg" });
}

describe("install job id", () => {
  it("is a stable UUIDv5 per project", () => {
    const a = installJobId("p-123");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(installJobId("p-123")).toBe(a);
    expect(installJobId("p-124")).not.toBe(a);
  });
});

describe("PUT /api/surveys/install-jobs/:id", () => {
  it("creates once; a second crew phone joins the same job without overwriting it", async () => {
    const p = project();
    const first = await openJob(p, { inspector_name: "Cody Arnold" });
    expect(first.status).toBe(200);
    createdIds.push(first.body.id);
    expect(first.body.kind).toBe("install");
    expect(first.body.id).toBe(installJobId(p));

    const second = await openJob(p, { project_name: "Something else", inspector_name: "Raymond O'Brian" });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.project_name).toBe("Andrew Lindsey");
    expect(second.body.inspector_name).toBe("Cody Arnold");
  });

  it("rejects an id that doesn't belong to the project", async () => {
    const res = await request(app)
      .put(`/api/surveys/install-jobs/${installJobId("other")}`)
      .set("Authorization", auth)
      .send({ solarpro_project_id: "mine" });
    expect(res.status).toBe(422);
  });

  it("is not listed with site surveys", async () => {
    const p = project();
    const job = await openJob(p);
    createdIds.push(job.body.id);
    const list = await request(app).get("/api/surveys?limit=500").set("Authorization", auth);
    expect(list.body.surveys.map((s: { id: string }) => s.id)).not.toContain(job.body.id);
    const installs = await request(app).get("/api/surveys?kind=install&limit=500").set("Authorization", auth);
    expect(installs.body.surveys.map((s: { id: string }) => s.id)).toContain(job.body.id);
  });
});

describe("crew photos", () => {
  it("photos from two phones land in one job with their creators; re-sends don't duplicate", async () => {
    const p = project();
    const job = (await openJob(p)).body;
    createdIds.push(job.id);
    await sendPhoto(job.id, "cody-1", { slotId: "inst_feet", creatorName: "Cody Arnold" });
    await sendPhoto(job.id, "james-1", { slotId: "inst_feet", creatorName: "James Carpenter" });
    await sendPhoto(job.id, "cody-1", { slotId: "inst_feet", creatorName: "Cody Arnold" });

    const again = await openJob(p);
    expect(again.body.photos).toHaveLength(2);
    expect(again.body.photos.map((x: { meta: { creatorName: string } }) => x.meta.creatorName).sort()).toEqual([
      "Cody Arnold",
      "James Carpenter",
    ]);
    expect(again.body.photos[0].remote_url).toBeTruthy();
  });

  it("deletes one photo by its client id", async () => {
    const job = (await openJob(project())).body;
    createdIds.push(job.id);
    await sendPhoto(job.id, "x-1", { slotId: "inst_feet" });
    await sendPhoto(job.id, "x-2", { slotId: "inst_feet" });
    const del = await request(app).delete(`/api/surveys/${job.id}/photos/by-client/x-1`).set("Authorization", auth);
    expect(del.body.deleted).toBe(1);
    const full = await request(app).get(`/api/surveys/${job.id}`).set("Authorization", auth);
    expect(full.body.photos.map((x: { client_photo_id: string }) => x.client_photo_id)).toEqual(["x-2"]);
  });
});

describe("answers and finishing", () => {
  it("merges answers from different phones", async () => {
    const job = (await openJob(project())).body;
    createdIds.push(job.id);
    await request(app).patch(`/api/surveys/install-jobs/${job.id}/answers`).set("Authorization", auth).send({ answers: { tilt_deg: 33.7 } });
    const res = await request(app)
      .patch(`/api/surveys/install-jobs/${job.id}/answers`)
      .set("Authorization", auth)
      .send({ answers: { cell_modem: true } });
    expect(res.status).toBe(200);
    expect(res.body.answers).toEqual({ tilt_deg: 33.7, cell_modem: true });
  });

  it("finishing a phase queues an install.completed event for SolarPro", async () => {
    const job = (await openJob(project())).body;
    createdIds.push(job.id);
    const bad = await request(app).post(`/api/surveys/install-jobs/${job.id}/finish`).set("Authorization", auth).send({ phase: "nope" });
    expect(bad.status).toBe(422);
    const res = await request(app)
      .post(`/api/surveys/install-jobs/${job.id}/finish`)
      .set("Authorization", auth)
      .send({ phase: "final_inspection" });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(`SELECT event_type, payload FROM webhook_deliveries WHERE event_id = $1`, [res.body.event_id]);
    expect(rows[0].event_type).toBe("install.completed");
    expect(rows[0].payload.phase).toBe("final_inspection");
    expect(rows[0].payload.solarpro_project_id).toBeTruthy();
    await pool.query(`DELETE FROM webhook_deliveries WHERE survey_id = $1`, [job.id]);
  });
});
