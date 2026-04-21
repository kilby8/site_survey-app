import fs from "fs/promises";

interface RoboflowInferOptions {
  modelId?: string;
  apiKey?: string;
  apiUrl?: string;
  confidence?: number;
  overlap?: number;
  elecClasses?: string[];
  materialClasses?: string[];
}

function resolveConfig(options: RoboflowInferOptions): {
  apiKey: string;
  apiUrl: string;
  modelId: string;
} {
  const apiKey = options.apiKey ?? process.env.ROBOFLOW_API_KEY;
  const apiUrl =
    options.apiUrl ??
    process.env.ROBOFLOW_API_URL ??
    "https://detect.roboflow.com";
  const modelId = options.modelId ?? process.env.ROBOFLOW_MODEL_ID;

  if (!apiKey) {
    throw new Error("ROBOFLOW_API_KEY is not configured");
  }
  if (!modelId) {
    throw new Error("ROBOFLOW_MODEL_ID is not configured");
  }

  return { apiKey, apiUrl, modelId };
}

function buildInferUrl(options: RoboflowInferOptions): string {
  const { apiKey, apiUrl, modelId } = resolveConfig(options);
  const url = new URL(
    `${apiUrl.replace(/\/$/, "")}/${encodeURIComponent(modelId)}`,
  );
  url.searchParams.set("api_key", apiKey);

  if (typeof options.confidence === "number") {
    url.searchParams.set("confidence", String(options.confidence));
  }
  if (typeof options.overlap === "number") {
    url.searchParams.set("overlap", String(options.overlap));
  }
  if (Array.isArray(options.elecClasses) && options.elecClasses.length > 0) {
    url.searchParams.set("elec_classes", JSON.stringify(options.elecClasses));
  }
  if (
    Array.isArray(options.materialClasses) &&
    options.materialClasses.length > 0
  ) {
    url.searchParams.set(
      "material_classes",
      JSON.stringify(options.materialClasses),
    );
  }

  return url.toString();
}

async function parseRoboflowResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const details =
      typeof body === "object" && body ? JSON.stringify(body) : text;
    throw new Error(
      `Roboflow inference failed (${response.status}): ${details}`,
    );
  }

  return body;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function inferRoboflowFromBuffer(
  image: Buffer,
  options: RoboflowInferOptions = {},
): Promise<unknown> {
  const response = await fetch(buildInferUrl(options), {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: image,
  });

  return parseRoboflowResponse(response);
}

export async function analyzeImage(
  image: Buffer,
  options: RoboflowInferOptions = {},
): Promise<unknown> {
  return inferRoboflowFromBuffer(image, options);
}

export async function inferRoboflowFromFile(
  filePath: string,
  options: RoboflowInferOptions = {},
): Promise<unknown> {
  const image = await fs.readFile(filePath);
  return inferRoboflowFromBuffer(image, options);
}

/**
 * Resolves a stored `file_path` value to a buffer and runs inference.
 *
 * Handles two formats produced by storageClient:
 *   - Local path  : "/uploads/filename.jpg"  → read from disk
 *   - Remote URL  : "https://..."            → fetch over HTTP (S3 presigned URL)
 */
export async function inferRoboflowFromPath(
  filePathOrUrl: string,
  options: RoboflowInferOptions = {},
): Promise<unknown> {
  if (filePathOrUrl.startsWith("http://") || filePathOrUrl.startsWith("https://")) {
    const response = await fetch(filePathOrUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch photo for inference (${response.status}): ${filePathOrUrl}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return inferRoboflowFromBuffer(Buffer.from(arrayBuffer), options);
  }

  // Local path — strip leading "/" and resolve from uploads dir
  const localPath = filePathOrUrl.startsWith("/")
    ? require("path").join(__dirname, "..", "..", filePathOrUrl)
    : filePathOrUrl;
  return inferRoboflowFromFile(localPath, options);
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL format; expected base64 data URL");
  }
  return Buffer.from(match[1], "base64");
}
