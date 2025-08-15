/**
 * ysws-review/api/auth/token.js
 *
 * Serverless endpoint to exchange a GitHub OAuth code for an access token.
 *
 * Expected request:
 *  - POST /api/auth/token
 *  - Content-Type: application/json
 *  - Body: { code: string, state?: string }
 *
 * Response:
 *  - 200: JSON from GitHub (access_token, scope, token_type or error)
 *  - 4xx/5xx: { error: string, message?: string }
 *
 * Notes:
 *  - This endpoint MUST be deployed with environment variables:
 *      GITHUB_APP_CLIENT_ID
 *      GITHUB_APP_CLIENT_SECRET
 *  - Do NOT log or leak the client secret.
 *  - CORS is set permissively to allow the SPA to call this endpoint. Restrict if needed.
 */

const https = require("https");
const querystring = require("querystring");

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  // Adjust the origin policy as appropriate for your deployment.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Helper to read raw JSON body if req.body is not pre-parsed by the platform.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    // If platform already provides parsed body (e.g. some serverless runtimes),
    // use it directly.
    if (req.body) {
      return resolve(req.body);
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Prevent overly large bodies
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

/**
 * Exchange the code for a token with GitHub.
 * Returns the parsed JSON response from GitHub.
 */
function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return reject(new Error("Server not configured with GitHub credentials"));
    }

    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
    });

    const options = {
      hostname: "github.com",
      port: 443,
      path: "/login/oauth/access_token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Accept: "application/json",
        "User-Agent": "YSWS-Code-Review/1.0",
      },
      timeout: 10000, // 10s timeout
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error("Invalid response from GitHub"));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Token exchange request timed out"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    // CORS preflight
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const code = body && body.code;

    if (!code || typeof code !== "string") {
      return sendJson(res, 400, { error: "missing_code", message: "Missing 'code' in request body." });
    }

    // Perform token exchange
    const tokenResponse = await exchangeCodeForToken(code);

    // GitHub may respond with { error, error_description } on failure.
    if (tokenResponse.error) {
      // Forward GitHub error but avoid leaking server internals.
      return sendJson(res, 400, {
        error: tokenResponse.error,
        error_description: tokenResponse.error_description || null,
      });
    }

    // Success: return the token payload (access_token, scope, token_type, etc.)
    return sendJson(res, 200, tokenResponse);
  } catch (err) {
    console.error("api/auth/token error:", err && err.message ? err.message : err);
    return sendJson(res, 500, { error: "server_error", message: err.message || String(err) });
  }
};
