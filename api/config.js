/**
 * Vercel serverless endpoint: /api/config
 *
 * Returns a minimal public configuration for the client to start OAuth:
 *  - GITHUB_APP_CLIENT_ID (public)
 *  - APP_URL (optional)
 *
 * Notes:
 *  - This endpoint must NOT return the client secret.
 *  - It is safe to expose the client_id to the browser.
 *
 * Usage:
 *  - Deploy to Vercel with environment variable GITHUB_APP_CLIENT_ID set.
 *  - The client will fetch /api/config to obtain the client id when an
 *    embedded config script is not available.
 */

module.exports = (req, res) => {
  // CORS headers (allow requests from any origin; adjust if you need to restrict)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only support GET
  if (req.method !== "GET") {
    res.setHeader("Content-Type", "application/json");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const clientId = process.env.GITHUB_APP_CLIENT_ID || null;

    // Build an APP_URL if available (prefer explicit APP_URL, then VERCEL_URL)
    let appUrl = process.env.APP_URL || null;
    if (!appUrl && process.env.VERCEL_URL) {
      // VERCEL_URL is provided by Vercel and does not include protocol
      appUrl = `https://${process.env.VERCEL_URL}`;
    }

    if (!clientId) {
      res.setHeader("Content-Type", "application/json");
      return res.status(500).json({
        error: "missing_configuration",
        message:
          "GITHUB_APP_CLIENT_ID is not set in the environment. Configure it in your deployment platform.",
      });
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      GITHUB_APP_CLIENT_ID: clientId,
      APP_URL: appUrl,
      // Helpful flag for client-side behavior if needed
      IS_SERVERLESS: true,
    });
  } catch (err) {
    console.error("api/config error:", err);
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({ error: "server_error", message: err.message });
  }
};
