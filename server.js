#!/usr/bin/env node
/**
 * Node.js HTTP server for the Code Review Tool
 *
 * This script provides a local development server with CORS support
 * for testing the application without needing to deploy it.
 *
 * Usage:
 *     node server.js [port]
 *     npm start [port]
 *
 * Default port: 8000
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");
const querystring = require("querystring");

// Load environment variables
require("dotenv").config();

// MIME type mappings
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".wasm": "application/wasm",
};

/**
 * Get MIME type for a file based on its extension
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Send CORS headers
 * @param {http.ServerResponse} res - Response object
 */
function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, DELETE",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

/**
 * Log request information
 * @param {http.IncomingMessage} req - Request object
 * @param {number} statusCode - HTTP status code
 */
function logRequest(req, statusCode) {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.headers["user-agent"] || "Unknown";

  console.log(
    `[${timestamp}] ${method} ${url} - ${statusCode} - ${userAgent.substring(0, 50)}${userAgent.length > 50 ? "..." : ""}`,
  );
}

/**
 * Serve a file
 * @param {string} filePath - Path to the file to serve
 * @param {http.ServerResponse} res - Response object
 * @param {http.IncomingMessage} req - Request object
 */
function serveFile(filePath, res, req) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(`
                    <h1>404 - File Not Found</h1>
                    <p>The requested file <code>${filePath}</code> was not found.</p>
                    <p><a href="/">← Back to Home</a></p>
                `);
        logRequest(req, 404);
      } else {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`
                    <h1>500 - Internal Server Error</h1>
                    <p>Error reading file: ${err.message}</p>
                    <p><a href="/">← Back to Home</a></p>
                `);
        logRequest(req, 500);
      }
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
    logRequest(req, 200);
  });
}

/**
 * Handle HTTP requests
 * @param {http.IncomingMessage} req - Request object
 * @param {http.ServerResponse} res - Response object
 */
function requestHandler(req, res) {
  // Set CORS headers for all requests
  setCORSHeaders(res);

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    logRequest(req, 200);
    return;
  }

  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Handle API routes
  if (pathname.startsWith("/api/")) {
    handleApiRequest(req, res, pathname, parsedUrl);
    return;
  }

  // Handle OAuth callback
  if (pathname === "/auth/callback") {
    handleOAuthCallback(req, res, parsedUrl);
    return;
  }

  // Handle token exchange
  if (pathname === "/auth/token") {
    if (req.method === "POST") {
      handleTokenExchange(req, res);
    } else if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      logRequest(req, 200);
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      logRequest(req, 405);
    }
    return;
  }

  // Remove query parameters and fragments
  pathname = pathname.split("?")[0].split("#")[0];

  // Prevent directory traversal
  pathname = path.normalize(pathname);
  if (pathname.includes("..")) {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end(`
            <h1>403 - Forbidden</h1>
            <p>Directory traversal is not allowed.</p>
            <p><a href="/">← Back to Home</a></p>
        `);
    logRequest(req, 403);
    return;
  }

  // Default to index.html for root path
  if (pathname === "/") {
    pathname = "/index.html";
  }

  // Serve files with config injection for index.html
  if (pathname === "/index.html") {
    serveIndexWithConfig(res, req);
    return;
  }

  // Construct file path
  const filePath = path.join(__dirname, pathname);

  // Check if file exists and serve it
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try adding .html extension
      const htmlPath = filePath + ".html";
      fs.stat(htmlPath, (htmlErr, htmlStats) => {
        if (htmlErr || !htmlStats.isFile()) {
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end(`
                        <h1>404 - Page Not Found</h1>
                        <p>The requested page <code>${pathname}</code> was not found.</p>
                        <p><a href="/">← Back to Home</a></p>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 40px; }
                            h1 { color: #dc3545; }
                            code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; }
                            a { color: #007bff; text-decoration: none; }
                            a:hover { text-decoration: underline; }
                        </style>
                    `);
          logRequest(req, 404);
        } else {
          serveFile(htmlPath, res, req);
        }
      });
    } else {
      serveFile(filePath, res, req);
    }
  });
}

/**
 * Serve index.html with GitHub App config injected
 */
function serveIndexWithConfig(res, req) {
  const indexPath = path.join(__dirname, "index.html");

  fs.readFile(indexPath, "utf8", (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`
                <h1>500 - Internal Server Error</h1>
                <p>Error reading index.html: ${err.message}</p>
            `);
      logRequest(req, 500);
      return;
    }

    // Inject GitHub App config
    const config = {
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
      APP_NAME: process.env.APP_NAME || "GitHub Diff Matrix Viewer",
      APP_URL:
        process.env.APP_URL || `http://localhost:${process.env.PORT || 8000}`,
      DEBUG: process.env.DEBUG === "true",
    };

    const configScript = `
            <script type="application/json" id="github-app-config">
            ${JSON.stringify(config, null, 2)}
            </script>
        `;

    // Insert config before closing head tag
    const modifiedData = data.replace(
      "</head>",
      `    ${configScript}\n    </head>`,
    );

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(modifiedData);
    logRequest(req, 200);
  });
}

/**
 * Handle API requests
 */
function handleApiRequest(req, res, pathname, parsedUrl) {
  if (pathname === "/api/config") {
    // Return public configuration
    const config = {
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
      APP_NAME: process.env.APP_NAME || "GitHub Diff Matrix Viewer",
      APP_URL:
        process.env.APP_URL || `http://localhost:${process.env.PORT || 8000}`,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(config));
    logRequest(req, 200);
    return;
  }

  // 404 for unknown API routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "API endpoint not found" }));
  logRequest(req, 404);
}

/**
 * Handle OAuth callback from GitHub
 */
function handleOAuthCallback(req, res, parsedUrl) {
  console.log("OAuth callback received:", parsedUrl.query);

  const code = parsedUrl.query.code;
  const state = parsedUrl.query.state;
  const error = parsedUrl.query.error;
  const error_description = parsedUrl.query.error_description;

  if (error) {
    const errorMsg = error_description || error;
    console.error("OAuth error:", error, error_description);
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`
            <html>
            <head><title>Authentication Error</title></head>
            <body style="font-family: Arial, sans-serif; padding: 40px;">
                <h1>Authentication Error</h1>
                <p><strong>Error:</strong> ${error}</p>
                ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ""}
                <p><a href="/" style="color: #0366d6;">← Back to Home</a></p>
            </body>
            </html>
        `);
    logRequest(req, 400);
    return;
  }

  if (!code) {
    console.error("OAuth callback missing code parameter");
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`
            <html>
            <head><title>Authentication Error</title></head>
            <body style="font-family: Arial, sans-serif; padding: 40px;">
                <h1>Authentication Error</h1>
                <p>Missing authorization code from GitHub.</p>
                <p><a href="/" style="color: #0366d6;">← Back to Home</a></p>
            </body>
            </html>
        `);
    logRequest(req, 400);
    return;
  }

  // Redirect to main app with code and state
  const redirectUrl = state
    ? `/?code=${code}&state=${state}`
    : `/?code=${code}`;
  console.log("Redirecting to:", redirectUrl);

  res.writeHead(302, {
    Location: redirectUrl,
  });
  res.end();
  logRequest(req, 302);
}

/**
 * Handle token exchange
 */
function handleTokenExchange(req, res) {
  console.log("Token exchange request received");

  if (
    !process.env.GITHUB_APP_CLIENT_ID ||
    !process.env.GITHUB_APP_CLIENT_SECRET
  ) {
    console.error("GitHub App credentials not configured");
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Server configuration error",
        message: "GitHub App credentials not configured",
      }),
    );
    logRequest(req, 500);
    return;
  }

  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      console.log("Token exchange request body:", body);
      const { code } = JSON.parse(body);

      if (!code) {
        console.error("Missing authorization code in request");
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing authorization code" }));
        logRequest(req, 400);
        return;
      }

      console.log("Exchanging code for token:", code.substring(0, 8) + "...");

      // Exchange code for access token
      const tokenData = await exchangeCodeForToken(code);

      console.log("Token exchange successful");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tokenData));
      logRequest(req, 200);
    } catch (error) {
      console.error("Token exchange error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Token exchange failed",
          message: error.message,
        }),
      );
      logRequest(req, 500);
    }
  });

  req.on("error", (error) => {
    console.error("Request error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Request error",
        message: error.message,
      }),
    );
    logRequest(req, 500);
  });
}

/**
 * Exchange OAuth code for access token
 */
async function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      client_id: process.env.GITHUB_APP_CLIENT_ID,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
      code: code,
    });

    console.log("Making token exchange request to GitHub...");

    const options = {
      hostname: "github.com",
      port: 443,
      path: "/login/oauth/access_token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": process.env.APP_NAME || "GitHub-Diff-Viewer",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      console.log("GitHub token exchange response status:", res.statusCode);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          console.log("GitHub token exchange response:", data);
          const tokenResponse = JSON.parse(data);

          if (tokenResponse.error) {
            console.error("GitHub OAuth error:", tokenResponse);
            reject(
              new Error(tokenResponse.error_description || tokenResponse.error),
            );
          } else if (tokenResponse.access_token) {
            console.log("Token exchange successful");
            resolve(tokenResponse);
          } else {
            console.error("No access token in response:", tokenResponse);
            reject(new Error("No access token received from GitHub"));
          }
        } catch (error) {
          console.error("Failed to parse GitHub response:", data, error);
          reject(new Error("Invalid JSON response from GitHub: " + data));
        }
      });
    });

    req.on("error", (error) => {
      console.error("HTTPS request error:", error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Start the server
 * @param {number} port - Port number to listen on
 */
function startServer(port) {
  const server = http.createServer(requestHandler);

  server.listen(port, () => {
    console.log("GitHub Diff Matrix Viewer Development Server");
    console.log(`Server running at http://localhost:${port}/`);
    console.log(`Directory: ${__dirname}`);
    console.log("");
    console.log("GitHub App Configuration:");
    console.log(`- App ID: ${process.env.GITHUB_APP_ID || "Not configured"}`);
    console.log(
      `- Client ID: ${process.env.GITHUB_APP_CLIENT_ID || "Not configured"}`,
    );
    console.log(
      `- Client Secret: ${process.env.GITHUB_APP_CLIENT_SECRET ? "Configured" : "Not configured"}`,
    );
    console.log("");
    console.log("Press Ctrl+C to stop the server");
    console.log("-".repeat(50));
  });

  // Handle server errors
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${port} is already in use.`);
      console.error("Please try a different port or stop the other server.");
    } else {
      console.error("Server error:", err.message);
    }
    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down server...");
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });
}

// Main execution
function main() {
  // Get port from command line argument or environment variable
  let port = 8000;

  if (process.argv[2]) {
    const argPort = parseInt(process.argv[2]);
    if (isNaN(argPort) || argPort < 1 || argPort > 65535) {
      console.error(`Error: Invalid port number '${process.argv[2]}'.`);
      console.error("Port must be a number between 1 and 65535.");
      process.exit(1);
    }
    port = argPort;
  } else if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT);
    if (!isNaN(envPort) && envPort >= 1 && envPort <= 65535) {
      port = envPort;
    }
  }

  startServer(port);
}

// Run the server if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  startServer,
  requestHandler,
  getMimeType,
  exchangeCodeForToken,
};
