import bcrypt from "bcryptjs";
import { randomBytes, scryptSync } from "crypto";

// The users table is the website's. The website only verifies bcrypt hashes,
// so the app must never write any other format there.

type Captured = { sql: string; params: unknown[] };

function legacyScrypt(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function loadStore(storedHash: string | null) {
  const writes: Captured[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, " ");
    if (text.includes("information_schema.columns")) {
      return { rows: [{ column_name: "name" }] };
    }
    if (text.startsWith(" SELECT id::text") || text.includes("password_hash::text")) {
      return {
        rows: storedHash
          ? [{ id: "u1", email: "tech@example.com", password_hash: storedHash, full_name: "Tech", created_at: "now" }]
          : [],
      };
    }
    if (text.includes("UPDATE users") || text.includes("INSERT INTO users")) {
      writes.push({ sql: text, params });
      return { rows: [{ id: "u1", email: "tech@example.com", full_name: "Tech", created_at: "now" }] };
    }
    return { rows: [] };
  });

  jest.doMock("pg", () => ({
    Pool: jest.fn().mockImplementation(() => ({ query, on: jest.fn() })),
  }));
  jest.doMock("../database", () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
  process.env.WEBSITE_DATABASE_URL = "postgres://u:p@localhost:5432/website";

  const store = await import("../services/sqliteAuthStore");
  return { store, writes };
}

function writtenHash(write: Captured): string {
  return write.params.find((p) => typeof p === "string" && p.startsWith("$2")) as string;
}

describe("website password hashes", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.WEBSITE_DATABASE_URL;
  });

  it("verifies a website bcrypt hash without rewriting it", async () => {
    const { store, writes } = await loadStore(await bcrypt.hash("pw-123456", 4));

    await expect(store.verifyUserCredentials("tech@example.com", "pw-123456")).resolves.toMatchObject({ id: "u1" });
    expect(writes).toHaveLength(0);
  });

  it("repairs a legacy scrypt hash back to bcrypt on successful sign-in", async () => {
    const { store, writes } = await loadStore(legacyScrypt("pw-123456"));

    await expect(store.verifyUserCredentials("tech@example.com", "pw-123456")).resolves.toMatchObject({ id: "u1" });
    expect(writes).toHaveLength(1);
    const hash = writtenHash(writes[0]);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(bcrypt.compare("pw-123456", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password and writes nothing", async () => {
    const { store, writes } = await loadStore(legacyScrypt("pw-123456"));

    await expect(store.verifyUserCredentials("tech@example.com", "nope")).resolves.toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("creates users and resets passwords with bcrypt cost 12", async () => {
    const { store, writes } = await loadStore(null);

    await store.createUser("new@example.com", "pw-abcdef", "New");
    await store.updateUserPasswordByEmail("new@example.com", "pw-ghijkl");

    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(writtenHash(write)).toMatch(/^\$2[aby]\$12\$/);
    }
  });
});
