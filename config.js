// Configuration and GitHub App OAuth handler
class GitHubAppConfig {
  constructor() {
    this.config = {
      // GitHub App configuration (these will be set by the server/build process)
      GITHUB_APP_ID: null,
      GITHUB_APP_CLIENT_ID: null,
      APP_NAME: 'GitHub Diff Matrix Viewer',
      APP_URL: window.location.origin,
      DEBUG: false
    };

    this.loadConfig();
  }

  async loadConfig() {
    try {
      // Try to load config from a config endpoint or embedded in HTML
      const configElement = document.getElementById('github-app-config');
      if (configElement) {
        const configData = JSON.parse(configElement.textContent);
        Object.assign(this.config, configData);
      }
    } catch (error) {
      console.warn('Could not load GitHub App config:', error);
    }
  }

  // GitHub OAuth flow for user authentication
  async initiateOAuth() {
    if (!this.config.GITHUB_APP_CLIENT_ID) {
      throw new Error('GitHub App not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.GITHUB_APP_CLIENT_ID,
      redirect_uri: `${this.config.APP_URL}/auth/callback`,
      scope: 'repo:read',
      state: this.generateState()
    });

    // Store state for verification
    sessionStorage.setItem('oauth_state', params.get('state'));

    // Redirect to GitHub OAuth
    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  }

  // Handle OAuth callback
  async handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = sessionStorage.getItem('oauth_state');

    if (!code || !state || state !== storedState) {
      throw new Error('Invalid OAuth callback parameters');
    }

    try {
      // Exchange code for access token
      const response = await fetch('/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code })
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = await response.json();

      // Store the access token
      localStorage.setItem('github_access_token', tokenData.access_token);
      localStorage.setItem('github_token_expires', Date.now() + (tokenData.expires_in * 1000));

      // Clean up OAuth state
      sessionStorage.removeItem('oauth_state');

      // Redirect back to main app
      window.location.href = '/';

      return tokenData.access_token;
    } catch (error) {
      sessionStorage.removeItem('oauth_state');
      throw error;
    }
  }

  // Get current access token
  getAccessToken() {
    const token = localStorage.getItem('github_access_token');
    const expires = localStorage.getItem('github_token_expires');

    if (!token || !expires) {
      return null;
    }

    // Check if token is expired
    if (Date.now() > parseInt(expires)) {
      localStorage.removeItem('github_access_token');
      localStorage.removeItem('github_token_expires');
      return null;
    }

    return token;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getAccessToken();
  }

  // Clear authentication
  clearAuth() {
    localStorage.removeItem('github_access_token');
    localStorage.removeItem('github_token_expires');
    sessionStorage.removeItem('oauth_state');
  }

  // Generate random state for OAuth
  generateState() {
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    return Array.from(array, dec => dec.toString(16)).join('');
  }

  // Get user info from GitHub
  async getUserInfo(token = null) {
    const accessToken = token || this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': this.config.APP_NAME
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  // Get rate limit info
  async getRateLimit(token = null) {
    const accessToken = token || this.getAccessToken();

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': this.config.APP_NAME
    };

    if (accessToken) {
      headers['Authorization'] = `token ${accessToken}`;
    }

    const response = await fetch('https://api.github.com/rate_limit', {
      headers
    });

    if (!response.ok) {
      throw new Error('Failed to get rate limit info');
    }

    return response.json();
  }
}

// Export for use in main application
window.GitHubAppConfig = GitHubAppConfig;
