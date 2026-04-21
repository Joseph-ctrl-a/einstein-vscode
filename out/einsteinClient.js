"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkError = exports.AuthError = void 0;
exports.checkAuth = checkAuth;
exports.submitFile = submitFile;
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
class AuthError extends Error {
}
exports.AuthError = AuthError;
class NetworkError extends Error {
}
exports.NetworkError = NetworkError;
async function checkAuth(username, password) {
    const res = await httpsGet('https://einstein.computing.dcu.ie/auth/auth.txt', username, password);
    if (res.statusCode === 401 || res.statusCode === 403) {
        throw new AuthError('Invalid DCU credentials');
    }
    if (res.statusCode >= 400) {
        throw new NetworkError(`Auth check failed with status ${res.statusCode}`);
    }
}
async function submitFile(filePath, module, task, username, password) {
    const uploadUrl = `https://${module}.computing.dcu.ie/einstein/upload`;
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);
    const boundary = `----EinsteinBoundary${crypto.randomBytes(12).toString('hex')}`;
    const body = buildMultipart(boundary, fileName, fileContent);
    const res = await httpsPost(uploadUrl, username, password, boundary, body);
    if (res.statusCode === 401 || res.statusCode === 403) {
        throw new AuthError('Invalid DCU credentials');
    }
    if (res.statusCode >= 400) {
        throw new NetworkError(`Server returned ${res.statusCode}: ${res.body.slice(0, 200)}`);
    }
    return parseResponse(res.body, module, task, fileName);
}
function parseResponse(body, module, task, fileName) {
    let text = body;
    // Server may wrap output in JSON — unwrap it first
    try {
        const json = JSON.parse(body);
        const candidate = json.output ?? json.stdout ?? json.result ?? json.text ?? json.body;
        if (typeof candidate === 'string') {
            text = candidate;
        }
        else if (typeof json === 'string') {
            text = json;
        }
    }
    catch {
        // Not JSON — use raw body as-is
    }
    const testResults = [];
    for (const line of text.split('\n')) {
        const m = line.match(/^#test-report\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s+(passed|failed)/);
        if (m) {
            testResults.push({ task: m[1], name: m[2], passed: m[3] === 'passed' });
        }
    }
    const passCount = testResults.filter(t => t.passed).length;
    const failCount = testResults.filter(t => !t.passed).length;
    const reportUrl = `https://${module}.computing.dcu.ie/einstein/report.html`;
    return { testResults, passCount, failCount, reportUrl, rawOutput: text, module, task, fileName };
}
function buildMultipart(boundary, fileName, content) {
    const safeFileName = fileName.replace(/[^\w.-]/g, '_');
    const header = Buffer.from(`--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    return Buffer.concat([header, content, footer]);
}
function makeAuthHeader(username, password) {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}
function httpsGet(url, username, password) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: { Authorization: makeAuthHeader(username, password) }
        }, res => {
            let body = '';
            res.on('data', (c) => (body += c.toString()));
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
        });
        req.on('error', (e) => reject(new NetworkError(e.message)));
        req.end();
    });
}
function httpsPost(url, username, password, boundary, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                Authorization: makeAuthHeader(username, password),
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        }, res => {
            let responseBody = '';
            res.on('data', (c) => (responseBody += c.toString()));
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: responseBody }));
        });
        req.on('error', (e) => reject(new NetworkError(e.message)));
        req.write(body);
        req.end();
    });
}
