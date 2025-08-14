const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");
const querystring = require("querystring");
require("dotenv").config();

// MIME types for static file serving
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Configuration
const CONFIG = {
  GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
  GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || "localhost",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server error");
      }
    } else {
      const mimeType = getMimeType(filePath);
      res.writeHead(200, { "Content-Type": mimeType });
      res.end(content);
    }
  });
}

function serveIndexWithConfig(res) {
  const indexPath = path.join(__dirname, "index.html");
  fs.readFile(indexPath, "utf8", (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error");
      return;
    }

    // Inject config script before closing head tag
    const configScript = `
<script id="github-app-config" type="application/json">
${JSON.stringify({
  GITHUB_APP_CLIENT_ID: CONFIG.GITHUB_APP_CLIENT_ID,
  APP_URL: `http://${CONFIG.HOST}:${CONFIG.PORT}`,
})}
</script>
`;
    const modifiedContent = content.replace(
      "</head>",
      configScript + "</head>",
    );

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(modifiedContent);
  });
}

async function exchangeCodeForToken(code, state) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      client_id: CONFIG.GITHUB_APP_CLIENT_ID,
      client_secret: CONFIG.GITHUB_APP_CLIENT_SECRET,
      code: code,
      state: state,
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
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error("Invalid response from GitHub"));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function requestHandler(req, res) {
  setCORSHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  // Handle OAuth callback
  if (pathname === "/auth/callback") {
    const { code, state, error } = parsedUrl.query;

    if (error) {
      res.writeHead(302, {
        Location: `/?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(parsedUrl.query.error_description || "")}`,
      });
      res.end();
      return;
    }

    if (code) {
      res.writeHead(302, {
        Location: `/?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || "")}`,
      });
      res.end();
      return;
    }
  }

  // Handle token exchange API
  if (pathname === "/api/auth/token" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { code, state } = JSON.parse(body);
        const tokenData = await exchangeCodeForToken(code, state);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(tokenData));
      } catch (error) {
        console.error("Token exchange error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Token exchange failed" }));
      }
    });
    return;
  }

  // Serve static files
  if (pathname === "/" || pathname === "/index.html") {
    serveIndexWithConfig(res);
  } else {
    const filePath = path.join(__dirname, pathname);

    // Security check
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
      } else {
        serveFile(res, filePath);
      }
    });
  }
}

function startServer() {
  const server = http.createServer(requestHandler);

  server.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(
      `🚀 YSWS Code Review Server running at http://${CONFIG.HOST}:${CONFIG.PORT}/`,
    );
    console.log("📁 Serving static files from:", __dirname);

    if (CONFIG.GITHUB_APP_CLIENT_ID && CONFIG.GITHUB_APP_CLIENT_SECRET) {
      console.log("🔐 GitHub OAuth configured");
    } else {
      console.log(
        "⚠️  GitHub OAuth not configured - set GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET",
      );
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`❌ Port ${CONFIG.PORT} is already in use`);
      console.log(`💡 Try: npm start -- --port 3001`);
    } else {
      console.error("Server error:", err);
    }
  });
}

// Handle command line arguments
const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith("--port="));
if (portArg) {
  CONFIG.PORT = parseInt(portArg.split("=")[1]) || CONFIG.PORT;
}

startServer();
