import { Router, Request, Response } from "express";

const router = Router();

router.get("/openapi.json", (_req: Request, res: Response) => {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Site Survey API",
      version: "1.0.0",
      description:
        "Survey backend API for mobile offline sync, reporting, handoff, and webhook orchestration.",
    },
    servers: [{ url: "/api" }],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": { description: "Service healthy" },
            "503": { description: "Service unavailable" },
          },
        },
      },
      "/users/register": {
        post: {
          summary: "Register user",
          responses: { "201": { description: "Registered" } },
        },
      },
      "/users/signin": {
        post: {
          summary: "Sign in",
          responses: { "200": { description: "Authenticated" } },
        },
      },
      "/users/refresh": {
        post: {
          summary: "Refresh access token",
          responses: { "200": { description: "Token rotated" } },
        },
      },
      "/users/logout": {
        post: {
          summary: "Logout",
          responses: { "200": { description: "Logged out" } },
        },
      },
      "/users/me": {
        get: {
          summary: "Get current user",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Current user" } },
        },
        delete: {
          summary: "Delete current user account",
          security: [{ bearerAuth: [] }],
          responses: {
            "204": { description: "Deleted" },
            "403": { description: "Admin protected" },
          },
        },
      },
      "/categories": {
        get: {
          summary: "List categories",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Category list" } },
        },
      },
      "/handoff/{token}": {
        get: {
          summary: "Consume handoff token",
          parameters: [
            {
              name: "token",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Handoff payload" },
            "401": { description: "Invalid token" },
            "409": { description: "Replay token" },
          },
        },
      },
      "/webhooks/survey-complete": {
        post: {
          summary: "Inbound survey.completed webhook receiver",
          responses: {
            "200": { description: "Accepted or duplicate" },
            "202": { description: "Accepted pre-ingest mode" },
            "400": { description: "Invalid payload" },
            "401": { description: "Signature validation failed" },
            "501": { description: "Validated but ingest not implemented" },
          },
        },
      },
      "/fallback-surveys/submit": {
        post: {
          summary: "Submit browser fallback survey payload to Postgres",
          responses: {
            "201": { description: "Stored" },
            "400": { description: "Validation failed" },
            "409": { description: "Token replayed" },
          },
        },
      },
      "/surveys": {
        get: {
          summary: "List surveys",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Survey list" } },
        },
        post: {
          summary: "Create or upsert survey",
          security: [{ bearerAuth: [] }],
          responses: {
            "201": { description: "Survey created or updated" },
            "422": { description: "Validation failed" },
          },
        },
      },
      "/surveys/sync": {
        post: {
          summary: "Batch sync surveys",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Sync result" } },
        },
      },
      "/surveys/{id}": {
        get: {
          summary: "Get full survey",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Survey details" },
            "404": { description: "Not found" },
          },
        },
        put: {
          summary: "Update survey",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          summary: "Delete survey",
          security: [{ bearerAuth: [] }],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/surveys/{id}/complete": {
        post: {
          summary: "Complete survey and enqueue webhook",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Completion acknowledged" } },
        },
      },
      "/surveys/{id}/report": {
        get: {
          summary: "Generate survey report",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Report" } },
        },
        delete: {
          summary: "Clear report in client workflow",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Cleared" } },
        },
      },
      "/surveys/admin/webhook-deliveries": {
        get: {
          summary: "Admin webhook delivery logs",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Delivery list" } },
        },
      },
      "/surveys/admin/surveys": {
        get: {
          summary: "Admin survey info list",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Survey info list" } },
        },
      },
      "/metrics": {
        get: {
          summary: "Admin metrics snapshot",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Metrics snapshot" },
            "403": { description: "Admin only" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  };

  res.json(spec);
});

export default router;
