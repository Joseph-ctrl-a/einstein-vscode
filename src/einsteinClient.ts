import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface TestResult {
  name: string;
  passed: boolean;
  task: string;
}

export interface SubmissionResult {
  testResults: TestResult[];
  passCount: number;
  failCount: number;
  reportUrl: string;
  rawOutput: string;
  module: string;
  task: string;
  fileName: string;
}

export class AuthError extends Error {}
export class NetworkError extends Error {}

const TASKS_DB_URL = "https://einstein.computing.dcu.ie/termcast/tasks.txt";

// Returns a map of sha1(taskName) => module codes that have that task
export async function fetchTasksDb(): Promise<Map<string, string[]>> {
  const res = await new Promise<{ statusCode: number; body: string }>(
    (resolve, reject) => {
      const req = https.request(TASKS_DB_URL, (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      });
      req.on("error", (e: Error) => reject(new NetworkError(e.message)));
      req.end();
    }
  );

  const db = new Map<string, string[]>();
  for (const line of res.body.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) db.set(parts[0], parts.slice(1));
  }
  return db;
}

export async function checkAuth(
  username: string,
  password: string
): Promise<void> {
  const res = await httpsGet(
    "https://einstein.computing.dcu.ie/auth/auth.txt",
    username,
    password
  );
  if (res.statusCode === 401 || res.statusCode === 403) {
    throw new AuthError("Invalid DCU credentials");
  }
  if (res.statusCode >= 400) {
    throw new NetworkError(`Auth check failed with status ${res.statusCode}`);
  }
}

export async function submitFile(
  filePath: string,
  module: string,
  task: string,
  username: string,
  password: string
): Promise<SubmissionResult> {
  const uploadUrl = `https://${module}.computing.dcu.ie/einstein/upload`;
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  const boundary = `----EinsteinBoundary${crypto
    .randomBytes(12)
    .toString("hex")}`;
  const body = buildMultipart(boundary, fileName, fileContent);

  const res = await httpsPost(uploadUrl, username, password, boundary, body);

  if (res.statusCode === 401 || res.statusCode === 403) {
    throw new AuthError("Invalid DCU credentials");
  }
  if (res.statusCode >= 400) {
    throw new NetworkError(
      `Server returned ${res.statusCode}: ${res.body.slice(0, 200)}`
    );
  }

  return parseResponse(res.body, module, task, fileName);
}

function parseResponse(
  body: string,
  module: string,
  task: string,
  fileName: string
): SubmissionResult {
  let text = body;

  // Server may wrap output in JSON unwrap it first
  try {
    const json = JSON.parse(body);
    const candidate =
      json.output ?? json.stdout ?? json.result ?? json.text ?? json.body;
    if (typeof candidate === "string") {
      text = candidate;
    } else if (typeof json === "string") {
      text = json;
    }
  } catch {
    // Not JSON use raw body as is
  }

  const testResults: TestResult[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(
      /^#test-report\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s+(passed|failed)/
    );
    if (m) {
      testResults.push({ task: m[1], name: m[2], passed: m[3] === "passed" });
    }
  }

  const passCount = testResults.filter((t) => t.passed).length;
  const failCount = testResults.filter((t) => !t.passed).length;
  const reportUrl = `https://${module}.computing.dcu.ie/einstein/report.html`;

  return {
    testResults,
    passCount,
    failCount,
    reportUrl,
    rawOutput: text,
    module,
    task,
    fileName,
  };
}

function buildMultipart(
  boundary: string,
  fileName: string,
  content: Buffer
): Buffer {
  const safeFileName = fileName.replace(/[^\w.-]/g, "_");
  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([header, content, footer]);
}

function makeAuthHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

function httpsGet(
  url: string,
  username: string,
  password: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: { Authorization: makeAuthHeader(username, password) },
      },
      (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", (e: Error) => reject(new NetworkError(e.message)));
    req.end();
  });
}

function httpsPost(
  url: string,
  username: string,
  password: string,
  boundary: string,
  body: Buffer
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          Authorization: makeAuthHeader(username, password),
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (c: Buffer) => (responseBody += c.toString()));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 0, body: responseBody })
        );
      }
    );
    req.on("error", (e: Error) => reject(new NetworkError(e.message)));
    req.write(body);
    req.end();
  });
}
