import request from "supertest";

type SigninAttemptRow = {
  failures: number;
  firstFailureAt: string;
  lockedUntil: string | null;
};

type PasswordResetRow = {
  tokenHash: string;
  expiresAt: string;
};

describe("users auth state persistence", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  async function buildUsersApp(options?: {
    verifyUserCredentialsResult?: null | {
      id: string;
      email: string;
      full_name: string;
      created_at: string;
    };
    getUserByEmailResult?: null | {
      id: string;
      email: string;
      full_name: string;
      created_at: string;
    };
  }) {
    process.env.NODE_ENV = "test";
    process.env.SIGNIN_MAX_FAILURES = "2";
    process.env.SIGNIN_WINDOW_MINUTES = "15";
    process.env.SIGNIN_LOCK_MINUTES = "15";

    const signinAttempts = new Map<string, SigninAttemptRow>();
    const passwordResetTokens = new Map<string, PasswordResetRow>();

    const queryMock = jest.fn(async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ").trim().toLowerCase();

      if (text.includes("create table if not exists signin_attempts")) return { rows: [] };
      if (text.includes("create table if not exists password_reset_tokens")) return { rows: [] };
      if (text.includes("create index if not exists signin_attempts_locked_until_idx")) return { rows: [] };
      if (text.includes("create index if not exists password_reset_tokens_expires_idx")) return { rows: [] };

      if (text.includes("select failures, first_failure_at::text, locked_until::text from signin_attempts")) {
        const key = String(params[0]);
        const row = signinAttempts.get(key);
        if (!row) return { rows: [] };
        return {
          rows: [
            {
              failures: row.failures,
              first_failure_at: row.firstFailureAt,
              locked_until: row.lockedUntil,
            },
          ],
        };
      }

      if (text.includes("insert into signin_attempts") && text.includes("on conflict (attempt_key) do nothing")) {
        const key = String(params[0]);
        if (!signinAttempts.has(key)) {
          const now = new Date().toISOString();
          signinAttempts.set(key, {
            failures: 0,
            firstFailureAt: now,
            lockedUntil: null,
          });
        }
        return { rows: [] };
      }

      if (text.includes("insert into signin_attempts") && text.includes("do update set")) {
        const key = String(params[0]);
        const failures = Number(params[1]);
        const firstFailureMs = Number(params[2]);
        const lockedUntil = params[3] == null ? null : String(params[3]);
        signinAttempts.set(key, {
          failures,
          firstFailureAt: new Date(firstFailureMs).toISOString(),
          lockedUntil,
        });
        return { rows: [] };
      }

      if (text.includes("update signin_attempts") && text.includes("set failures = 0")) {
        const key = String(params[0]);
        const now = new Date().toISOString();
        signinAttempts.set(key, {
          failures: 0,
          firstFailureAt: now,
          lockedUntil: null,
        });
        return { rows: [] };
      }

      if (text.includes("delete from signin_attempts where attempt_key = $1")) {
        signinAttempts.delete(String(params[0]));
        return { rows: [] };
      }

      if (text.includes("insert into password_reset_tokens") && text.includes("on conflict (email)")) {
        const email = String(params[0]);
        const tokenHash = String(params[1]);
        const expiresAt = String(params[2]);
        passwordResetTokens.set(email, { tokenHash, expiresAt });
        return { rows: [] };
      }

      if (text.includes("select token_hash as \"tokenhash\", expires_at::text as expires_at from password_reset_tokens")) {
        const email = String(params[0]);
        const row = passwordResetTokens.get(email);
        if (!row) return { rows: [] };
        return {
          rows: [
            {
              tokenHash: row.tokenHash,
              expires_at: row.expiresAt,
            },
          ],
        };
      }

      if (text.includes("delete from password_reset_tokens where email = $1")) {
        passwordResetTokens.delete(String(params[0]));
        return { rows: [] };
      }

      return { rows: [] };
    });

    const verifyUserCredentials = jest.fn().mockResolvedValue(options?.verifyUserCredentialsResult ?? null);
    const getUserByEmail = jest.fn().mockResolvedValue(
      options?.getUserByEmailResult ?? {
        id: "user-1",
        email: "reset@example.com",
        full_name: "Reset User",
        created_at: new Date().toISOString(),
      },
    );

    const updateUserPasswordByEmail = jest.fn().mockResolvedValue({ id: "user-1" });
    const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);

    jest.doMock("../database", () => ({
      pool: {
        query: queryMock,
      },
    }));

    jest.doMock("../services/sqliteAuthStore", () => ({
      getUserById: jest.fn(),
      getUserByEmail,
      createUser: jest.fn(),
      verifyUserCredentials,
      updateUserPasswordByEmail,
      insertRefreshToken: jest.fn(),
      getRefreshTokenWithUserByHash: jest.fn(),
      revokeRefreshTokenById: jest.fn(),
      revokeRefreshTokensByUserId: jest.fn(),
      revokeRefreshTokenByHash: jest.fn(),
      deleteRefreshTokensByUserId: jest.fn(),
      deleteUserById: jest.fn(),
      listUsersWithHashMetadata: jest.fn(),
    }));

    jest.doMock("../utils/authToken", () => ({
      signAuthToken: jest.fn(() => "token"),
      generateRefreshToken: jest.fn(() => "refresh-token"),
      hashRefreshToken: jest.fn(() => "refresh-hash"),
      refreshTokenExpiresAt: jest.fn(() => new Date(Date.now() + 60_000)),
    }));

    jest.doMock("../utils/authAudit", () => ({
      authAudit: jest.fn(),
    }));

    jest.doMock("../utils/passwordResetMailer", () => ({
      sendPasswordResetEmail,
    }));

    const express = await import("express");
    const usersRouter = (await import("../routes/users")).default;

    const app = express.default();
    app.use(express.default.json());
    app.use("/api/users", usersRouter);

    return {
      app,
      verifyUserCredentials,
      getUserByEmail,
      updateUserPasswordByEmail,
      sendPasswordResetEmail,
      queryMock,
    };
  }

  it("locks sign-in after threshold and keeps lock state across subsequent requests", async () => {
    const { app, verifyUserCredentials } = await buildUsersApp({
      verifyUserCredentialsResult: null,
    });

    const first = await request(app)
      .post("/api/users/signin")
      .send({ email: "user@example.com", password: "WrongPass123!" });

    const second = await request(app)
      .post("/api/users/signin")
      .send({ email: "user@example.com", password: "WrongPass123!" });

    const third = await request(app)
      .post("/api/users/signin")
      .send({ email: "user@example.com", password: "WrongPass123!" });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(third.status).toBe(429);
    expect(verifyUserCredentials).toHaveBeenCalledTimes(2);
  });

  it("stores reset token and invalidates it after successful password reset", async () => {
    const { app, updateUserPasswordByEmail } = await buildUsersApp({
      getUserByEmailResult: {
        id: "user-1",
        email: "reset@example.com",
        full_name: "Reset User",
        created_at: new Date().toISOString(),
      },
    });

    const forgot = await request(app)
      .post("/api/users/forgot-password")
      .send({ email: "reset@example.com" });

    expect(forgot.status).toBe(200);
    expect(typeof forgot.body.resetToken).toBe("string");

    const reset = await request(app)
      .post("/api/users/reset-password")
      .send({
        email: "reset@example.com",
        token: forgot.body.resetToken,
        new_password: "NewSecurePass123!",
      });

    expect(reset.status).toBe(200);
    expect(updateUserPasswordByEmail).toHaveBeenCalledTimes(1);

    const replay = await request(app)
      .post("/api/users/reset-password")
      .send({
        email: "reset@example.com",
        token: forgot.body.resetToken,
        new_password: "AnotherPass123!",
      });

    expect(replay.status).toBe(400);
  });
});

