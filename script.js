// Code Review Tool Diff Viewer
class GitHubDiffViewer {
  constructor() {
    this.repoData = null;
    this.commits = [];
    this.files = new Set();
    this.diffData = new Map();
    this.config = null;
    // AI settings with sensible defaults. These are stored in memory and updated by the settings panel.
    this.aiSettings = {
      minBlockLines: 6, // minimal contiguous added lines to consider a block
      duplicateThreshold: 2, // minimal duplicate occurrences to consider suspicious
      bigramWarn: 0.03, // bigram ratio -> warning
      bigramFail: 0.08, // bigram ratio -> fail
      entropyWarn: 3.0, // entropy -> warning
      entropyFail: 2.5, // entropy -> fail
      jaccardThreshold: 0.75, // cross-file Jaccard similarity threshold
    };
    this.initializeElements();
    this.bindEvents();
    this.initializeDarkMode();
    this.setupKeyboardShortcuts();

    console.log("Vercel update worked!");
    // Load config first so auto-auth has the information it needs.
    // After config loads, handle any OAuth callback params and then attempt auto-auth.
    this.loadConfig()
      .then(() => {
        // If the page was redirected back with OAuth params, handle them first.
        try {
          this.handleAuthCallback();
        } catch (err) {
          console.warn("Error while handling auth callback:", err);
        }

        // Then attempt auto-authentication (small delay to allow UI to update).
        setTimeout(() => {
          this.autoAuthenticate();
        }, 100);
      })
      .catch((err) => {
        console.warn("Failed to load config before auth flow:", err);
        // Even if config loading failed, attempt to continue gracefully.
        try {
          this.handleAuthCallback();
        } catch (e) {
          console.warn(
            "Error while handling auth callback after config error:",
            e,
          );
        }
        setTimeout(() => {
          this.autoAuthenticate();
        }, 100);
      });
  }

  async loadConfig() {
    try {
      // First attempt to read an embedded config that may be injected by a server.
      const configElement = document.getElementById("github-app-config");
      if (configElement) {
        this.config = JSON.parse(configElement.textContent);
        // Embedded config present — nothing else required.
        return;
      }

      // Ensure config is at least an object so callers don't wait on null indefinitely.
      this.config = {};

      // As a fallback (useful for static deployments on Vercel), try fetching /api/config.
      try {
        const resp = await fetch("/api/config", { method: "GET" });
        if (resp.ok) {
          const apiConfig = await resp.json();
          // Merge API-provided config into current config
          this.config = { ...(this.config || {}), ...apiConfig };
          return;
        } else {
          console.warn(
            "No config returned from /api/config, status:",
            resp.status,
          );
        }
      } catch (fetchErr) {
        // Fail quietly — the app will continue without server-provided config.
        console.warn("Failed to fetch /api/config:", fetchErr);
      }
    } catch (error) {
      console.warn("Could not load GitHub App config:", error);
      this.config = {};
    }
  }

  initializeElements() {
    this.elements = {
      repoInput: document.getElementById("repoInput"),
      loadRepoBtn: document.getElementById("loadRepoBtn"),
      darkModeToggle: document.getElementById("darkModeToggle"),
      loadingIndicator: document.getElementById("loadingIndicator"),
      errorMessage: document.getElementById("errorMessage"),
      repoInfo: document.getElementById("repoInfo"),
      repoTitle: document.getElementById("repoTitle"),
      repoDescription: document.getElementById("repoDescription"),
      branchSelect: document.getElementById("branchSelect"),
      commitLimit: document.getElementById("commitLimit"),
      refreshBtn: document.getElementById("refreshBtn"),
      expandAllBtn: document.getElementById("expandAllBtn"),
      collapseAllBtn: document.getElementById("collapseAllBtn"),
      runAiDetectionBtn: document.getElementById("runAiDetectionBtn"),
      aiDetection: document.getElementById("aiDetection"),
      aiDetectionResults: document.getElementById("aiDetectionResults"),
      aiOverallStatus: document.getElementById("aiOverallStatus"),
      aiSummaryText: document.getElementById("aiSummaryText"),
      aiChecks: document.getElementById("aiChecks"),
      // Settings UI elements
      openAiSettingsBtn: document.getElementById("openAiSettingsBtn"),
      openAiSettingsBtnSmall: document.getElementById("openAiSettingsBtnSmall"),
      runAiNowBtn: document.getElementById("runAiNowBtn"),
      saveAiSettingsBtn: document.getElementById("saveAiSettingsBtn"),
      resetAiSettingsBtn: document.getElementById("resetAiSettingsBtn"),
      closeAiSettingsBtn: document.getElementById("closeAiSettingsBtn"),
      // Settings inputs
      setting_min_block_lines: document.getElementById(
        "setting_min_block_lines",
      ),
      setting_duplicate_threshold: document.getElementById(
        "setting_duplicate_threshold",
      ),
      setting_bigram_ratio_warn: document.getElementById(
        "setting_bigram_ratio_warn",
      ),
      setting_bigram_ratio_fail: document.getElementById(
        "setting_bigram_ratio_fail",
      ),
      setting_entropy_warn: document.getElementById("setting_entropy_warn"),
      setting_entropy_fail: document.getElementById("setting_entropy_fail"),
      diffMatrix: document.getElementById("diffMatrix"),
      diffTable: document.getElementById("diffTable"),
    };
  }

  bindEvents() {
    this.elements.loadRepoBtn.addEventListener("click", () =>
      this.loadRepository(),
    );
    this.elements.refreshBtn.addEventListener("click", () =>
      this.refreshData(),
    );
    this.elements.darkModeToggle.addEventListener("click", () =>
      this.toggleDarkMode(),
    );
    this.elements.expandAllBtn.addEventListener("click", () =>
      this.expandAllFiles(),
    );
    this.elements.collapseAllBtn.addEventListener("click", () =>
      this.collapseAllFiles(),
    );

    // AI Detection controls
    this.elements.runAiDetectionBtn.addEventListener("click", () =>
      this.runAiDetection(),
    );

    // Open main settings panel
    if (this.elements.openAiSettingsBtn) {
      this.elements.openAiSettingsBtn.addEventListener("click", () => {
        const panel =
          document.getElementById("aiSettings") ||
          document.getElementById("aiSettingsPanel") ||
          document.getElementById("aiSettingsPanel");
        if (panel) panel.classList.toggle("hidden");
      });
    }

    // Small quick-open settings button
    if (this.elements.openAiSettingsBtnSmall) {
      this.elements.openAiSettingsBtnSmall.addEventListener("click", () => {
        const panel =
          document.getElementById("aiSettings") ||
          document.getElementById("aiSettingsPanel");
        if (panel) panel.classList.remove("hidden");
      });
    }

    // Quick run button inside the summary area
    if (this.elements.runAiNowBtn) {
      this.elements.runAiNowBtn.addEventListener("click", () =>
        this.runAiDetection(),
      );
    }

    // Settings save / reset / close handlers (persist in-memory)
    if (this.elements.saveAiSettingsBtn) {
      this.elements.saveAiSettingsBtn.addEventListener("click", () => {
        try {
          const s = this.aiSettings || {};
          const minBlock = parseInt(
            this.elements.setting_min_block_lines?.value ||
              s.minBlockLines ||
              6,
            10,
          );
          const dupThresh = parseInt(
            this.elements.setting_duplicate_threshold?.value ||
              s.duplicateThreshold ||
              2,
            10,
          );
          const bigramWarn = parseFloat(
            this.elements.setting_bigram_ratio_warn?.value ||
              s.bigramWarn ||
              0.03,
          );
          const bigramFail = parseFloat(
            this.elements.setting_bigram_ratio_fail?.value ||
              s.bigramFail ||
              0.08,
          );
          const entropyWarn = parseFloat(
            this.elements.setting_entropy_warn?.value || s.entropyWarn || 3.0,
          );
          const entropyFail = parseFloat(
            this.elements.setting_entropy_fail?.value || s.entropyFail || 2.5,
          );

          this.aiSettings = {
            ...s,
            minBlockLines: Number.isNaN(minBlock) ? s.minBlockLines : minBlock,
            duplicateThreshold: Number.isNaN(dupThresh)
              ? s.duplicateThreshold
              : dupThresh,
            bigramWarn: Number.isNaN(bigramWarn) ? s.bigramWarn : bigramWarn,
            bigramFail: Number.isNaN(bigramFail) ? s.bigramFail : bigramFail,
            entropyWarn: Number.isNaN(entropyWarn)
              ? s.entropyWarn
              : entropyWarn,
            entropyFail: Number.isNaN(entropyFail)
              ? s.entropyFail
              : entropyFail,
          };

          // Reflect saved settings to UI summary
          if (this.elements.aiSummaryText) {
            this.elements.aiSummaryText.textContent = `AI settings updated. Click Run to re-analyze.`;
          }
        } catch (err) {
          console.warn("Failed to save AI settings:", err);
        }
      });
    }

    if (this.elements.resetAiSettingsBtn) {
      this.elements.resetAiSettingsBtn.addEventListener("click", () => {
        // reset to defaults in memory and UI
        this.aiSettings = {
          minBlockLines: 6,
          duplicateThreshold: 2,
          bigramWarn: 0.03,
          bigramFail: 0.08,
          entropyWarn: 3.0,
          entropyFail: 2.5,
          jaccardThreshold: 0.75,
        };
        // Update UI inputs if present
        if (this.elements.setting_min_block_lines)
          this.elements.setting_min_block_lines.value =
            this.aiSettings.minBlockLines;
        if (this.elements.setting_duplicate_threshold)
          this.elements.setting_duplicate_threshold.value =
            this.aiSettings.duplicateThreshold;
        if (this.elements.setting_bigram_ratio_warn)
          this.elements.setting_bigram_ratio_warn.value =
            this.aiSettings.bigramWarn;
        if (this.elements.setting_bigram_ratio_fail)
          this.elements.setting_bigram_ratio_fail.value =
            this.aiSettings.bigramFail;
        if (this.elements.setting_entropy_warn)
          this.elements.setting_entropy_warn.value =
            this.aiSettings.entropyWarn;
        if (this.elements.setting_entropy_fail)
          this.elements.setting_entropy_fail.value =
            this.aiSettings.entropyFail;

        if (this.elements.aiSummaryText) {
          this.elements.aiSummaryText.textContent =
            "AI settings reset to defaults.";
        }
      });
    }

    if (this.elements.closeAiSettingsBtn) {
      this.elements.closeAiSettingsBtn.addEventListener("click", () => {
        const panel =
          document.getElementById("aiSettings") ||
          document.getElementById("aiSettingsPanel");
        if (panel) panel.classList.add("hidden");
      });
    }

    // Handle Enter key in repo input
    this.elements.repoInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.loadRepository();
      }
    });

    // Handle branch selection change
    this.elements.branchSelect.addEventListener("change", () => {
      this.refreshData();
    });
  }

  parseRepoUrl(url) {
    const githubRegex = /github\.com[\/:]([^\/]+)\/([^\/\s\.]+)/i;
    const match = url.match(githubRegex);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
      };
    }
    return null;
  }

  async makeApiRequest(endpoint, options = {}) {
    const headers = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitHub-Diff-Viewer",
      ...options.headers,
    };

    const token = this.getAccessToken();
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return response.json();
  }

  // Authentication Methods
  getAccessToken() {
    // First try OAuth token
    const oauthToken = localStorage.getItem("github_access_token");
    const expires = localStorage.getItem("github_token_expires");

    if (oauthToken && expires && Date.now() < parseInt(expires)) {
      return oauthToken;
    }

    // Fallback to personal token
    return localStorage.getItem("github_token");
  }

  isAuthenticated() {
    return !!this.getAccessToken();
  }

  async initiateOAuth() {
    if (!this.config || !this.config.GITHUB_APP_CLIENT_ID) {
      this.showError(
        "GitHub App not configured properly. Please check server configuration.",
      );
      return;
    }

    try {
      const state = this.generateState();
      sessionStorage.setItem("oauth_state", state);

      const params = new URLSearchParams({
        client_id: this.config.GITHUB_APP_CLIENT_ID,
        redirect_uri: `${window.location.origin}/auth/callback`,
        scope: "repo",
        state: state,
      });

      console.log("Initiating OAuth with params:", Object.fromEntries(params));
      window.location.href = `https://github.com/login/oauth/authorize?${params}`;
    } catch (error) {
      console.error("OAuth initiation failed:", error);
      this.showError(
        `Failed to initiate GitHub authentication: ${error.message}`,
      );
    }
  }

  handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const error = urlParams.get("error");
    const error_description = urlParams.get("error_description");
    const storedState = sessionStorage.getItem("oauth_state");

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error, error_description);
      this.showError(`GitHub OAuth error: ${error_description || error}`);
      sessionStorage.removeItem("oauth_state");
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Handle successful callback
    if (code) {
      if (state && storedState && state !== storedState) {
        console.error("OAuth state mismatch");
        this.showError("Authentication security error. Please try again.");
        sessionStorage.removeItem("oauth_state");
      } else {
        this.exchangeCodeForToken(code);
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      sessionStorage.removeItem("oauth_state");
    }
  }

  async autoAuthenticate() {
    try {
      // Check if already authenticated
      if (this.isAuthenticated()) {
        console.log("✅ Already authenticated with GitHub");
        return;
      }

      console.log("🔐 Checking authentication status...");

      // Wait for config to load with timeout
      let configWaitTime = 0;
      while (!this.config && configWaitTime < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        configWaitTime += 100;
      }

      if (!this.config || !this.config.GITHUB_APP_CLIENT_ID) {
        console.log("⚠️ No GitHub App configuration found, skipping auto-auth");
        return;
      }

      console.log("🔐 Starting automatic GitHub authentication...");
      this.showLoading(true);
      this.elements.loadingIndicator.querySelector("p").textContent =
        "Authenticating with GitHub...";

      // Automatically initiate OAuth
      setTimeout(() => {
        this.initiateOAuth();
      }, 500);
    } catch (error) {
      console.error("Auto-authentication failed:", error);
    }
  }

  async exchangeCodeForToken(code) {
    try {
      console.log("Exchanging code for token...");
      const state = sessionStorage.getItem("oauth_state");

      const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, state }),
      });

      console.log("Token exchange response status:", response.status);

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.message || errorData.error || `HTTP ${response.status}`,
        );
      }

      const tokenData = await response.json();
      console.log("Token exchange successful");

      if (!tokenData.access_token) {
        throw new Error("No access token received from server");
      }

      localStorage.setItem("github_access_token", tokenData.access_token);
      localStorage.setItem(
        "github_token_expires",
        Date.now() + (tokenData.expires_in * 1000 || 3600000),
      );

      sessionStorage.removeItem("oauth_state");

      this.showSuccess("Successfully authenticated with GitHub!");
    } catch (error) {
      console.error("Token exchange failed:", error);
      sessionStorage.removeItem("oauth_state");
      this.showError(`Authentication failed: ${error.message}`);
    }
  }

  generateState() {
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    return Array.from(array, (dec) => dec.toString(16)).join("");
  }

  async getUserInfo() {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Diff-Viewer",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get user info");
    }

    return response.json();
  }

  showLoading(show = true) {
    this.elements.loadingIndicator.classList.toggle("hidden", !show);
    this.elements.loadRepoBtn.disabled = show;
    this.elements.refreshBtn.disabled = show;
  }

  showError(message) {
    this.elements.errorMessage.querySelector("p").textContent = message;
    this.elements.errorMessage.classList.remove("hidden");
    setTimeout(() => {
      this.elements.errorMessage.classList.add("hidden");
    }, 5000);
  }

  showSuccess(message) {
    // Create success message similar to error message
    const successDiv = document.createElement("div");
    successDiv.className = "success-message";
    successDiv.innerHTML = `<p>${message}</p>`;
    successDiv.style.cssText = `
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 20px;
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1001;
      max-width: 300px;
    `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      successDiv.remove();
    }, 3000);
  }

  async loadRepository() {
    const repoUrl = this.elements.repoInput.value.trim();
    if (!repoUrl) {
      this.showError("Please enter a GitHub repository URL");
      return;
    }

    // Clean up existing scroll controllers and hide AI detection
    const existingControllers = document.querySelectorAll(
      ".commits-horizontal-scroll",
    );
    existingControllers.forEach((controller) => controller.remove());
    this.elements.aiDetection.classList.add("hidden");

    const repoInfo = this.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      this.showError(
        "Invalid GitHub repository URL. Please use format: https://github.com/owner/repo",
      );
      return;
    }

    this.showLoading(true);

    try {
      // Get repository information
      this.repoData = await this.makeApiRequest(
        `/repos/${repoInfo.owner}/${repoInfo.repo}`,
      );

      // Get branches
      const branches = await this.makeApiRequest(
        `/repos/${repoInfo.owner}/${repoInfo.repo}/branches`,
      );

      this.populateRepoInfo(branches);
      this.elements.repoInfo.classList.remove("hidden");

      // Load commits and diffs
      await this.loadCommitsAndDiffs();

      // Show AI detection button now that data is loaded
      this.elements.runAiDetectionBtn.style.display = "inline-block";
    } catch (error) {
      console.error("Error loading repository:", error);

      if (
        error.message.includes("rate limit") ||
        error.message.includes("403")
      ) {
        this.showError(
          `Rate limit exceeded. Please authenticate to get higher limits. ${error.message}`,
        );
      } else {
        this.showError(`Failed to load repository: ${error.message}`);
      }
    } finally {
      this.showLoading(false);
    }
  }

  populateRepoInfo(branches) {
    this.elements.repoTitle.textContent = this.repoData.full_name;
    this.elements.repoDescription.textContent =
      this.repoData.description || "No description available";

    // Populate branch selector
    this.elements.branchSelect.innerHTML = "";
    branches.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = branch.name;
      if (branch.name === this.repoData.default_branch) {
        option.selected = true;
      }
      this.elements.branchSelect.appendChild(option);
    });
  }

  async loadCommitsAndDiffs() {
    const branch = this.elements.branchSelect.value;
    const limitValue = this.elements.commitLimit.value;
    const limit = limitValue === "unlimited" ? 100 : parseInt(limitValue);

    // Show warning for unlimited commits
    if (limitValue === "unlimited") {
      console.log(
        "⚠️ Loading all commits - this may take a while for large repositories",
      );
      this.elements.loadingIndicator.querySelector("p").textContent =
        "Loading all commits... This may take several minutes for large repositories.";
    }

    try {
      let commits = [];
      let page = 1;
      let hasMore = true;

      // Get commits (paginated for unlimited)
      while (
        hasMore &&
        (limitValue === "unlimited" || commits.length < limit)
      ) {
        const pageCommits = await this.makeApiRequest(
          `/repos/${this.repoData.owner.login}/${this.repoData.name}/commits?sha=${branch}&per_page=100&page=${page}`,
        );

        if (pageCommits.length === 0) {
          hasMore = false;
        } else {
          commits = commits.concat(pageCommits);
          page++;

          // Update progress for unlimited loading
          if (limitValue === "unlimited") {
            this.updateLoadingProgress(commits.length, "∞");
          }

          // For unlimited, stop at reasonable limit (1000 commits for performance)
          if (limitValue === "unlimited" && commits.length >= 1000) {
            console.log(
              `⚠️ Reached maximum of 1000 commits for performance reasons`,
            );
            hasMore = false;
          }

          // For limited, stop when we have enough
          if (limitValue !== "unlimited" && commits.length >= limit) {
            commits = commits.slice(0, limit);
            hasMore = false;
          }
        }
      }

      this.commits = commits;
      this.files = new Set();
      this.diffData = new Map();

      // Get commit details and files for each commit
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        try {
          const commitDetail = await this.makeApiRequest(
            `/repos/${this.repoData.owner.login}/${this.repoData.name}/commits/${commit.sha}`,
          );

          // Store commit files
          commitDetail.files?.forEach((file) => {
            this.files.add(file.filename);
            const key = `${file.filename}:${commit.sha}`;
            this.diffData.set(key, {
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              changes: file.changes,
              patch: file.patch,
              previous_filename: file.previous_filename,
            });
          });

          // Update progress
          const progressTotal =
            limitValue === "unlimited" ? "∞" : this.commits.length;
          this.updateLoadingProgress(i + 1, progressTotal);
        } catch (error) {
          console.warn(`Failed to load commit ${commit.sha}:`, error);
        }
      }

      this.renderDiffMatrix();
      this.elements.diffMatrix.classList.remove("hidden");
    } catch (error) {
      console.error("Error loading commits:", error);
      if (limitValue === "unlimited") {
        this.showError(
          `Failed to load unlimited commits: ${error.message}. Try using a specific commit limit instead.`,
        );
      } else {
        this.showError(`Failed to load commits: ${error.message}`);
      }
    }
  }

  updateLoadingProgress(current, total) {
    const loadingText = this.elements.loadingIndicator.querySelector("p");
    if (total === "∞") {
      loadingText.textContent = `Loading commits... ${current} found`;
    } else {
      loadingText.textContent = `Loading commit data... ${current}/${total}`;
    }
  }

  renderDiffMatrix() {
    const diffMatrix = this.elements.diffMatrix;
    diffMatrix.innerHTML = "";

    // Create horizontal scroll controller
    const scrollController = document.createElement("div");
    scrollController.className = "commits-horizontal-scroll";
    scrollController.id = "commitsScroll";

    const scrollContent = document.createElement("div");
    scrollContent.className = "scroll-content";
    scrollContent.style.width = `${this.commits.length * 550}px`;
    scrollController.appendChild(scrollContent);

    // Create a new structure for inline diffs
    const container = document.createElement("div");
    container.className = "inline-diff-container";

    // Store all commits rows for synchronized scrolling
    const commitsRows = [];

    // Group files by their changes across commits
    const sortedFiles = Array.from(this.files).sort();

    sortedFiles.forEach((filename) => {
      const fileSection = document.createElement("div");
      fileSection.className = "file-section";

      // File header with collapse functionality
      const fileHeader = document.createElement("div");
      fileHeader.className = "file-section-header";
      fileHeader.setAttribute("data-collapsed", "false");

      // Count changes for this file across all commits
      let changeCount = 0;
      this.commits.forEach((commit) => {
        const key = `${filename}:${commit.sha}`;
        if (this.diffData.has(key)) {
          changeCount++;
        }
      });

      fileHeader.innerHTML = `
        <h3>${filename}</h3>
        <span class="file-stats">${changeCount}/${this.commits.length} commits</span>
        <span class="collapse-indicator">−</span>
      `;
      fileSection.appendChild(fileHeader);

      // Commits row for this file
      const commitsRow = document.createElement("div");
      commitsRow.className = "commits-row";

      this.commits.forEach((commit, index) => {
        const commitColumn = document.createElement("div");
        commitColumn.className = "commit-column";

        // Commit header
        const commitHeader = document.createElement("div");
        commitHeader.className = "commit-header-inline";
        commitHeader.innerHTML = `
          <div class="commit-info">
            <div class="commit-sha">${commit.sha.substring(0, 7)}</div>
            <div class="commit-message">${commit.commit.message.split("\n")[0]}</div>
            <div class="commit-meta">${new Date(commit.commit.author.date).toLocaleDateString()} - ${commit.commit.author.name}</div>
          </div>
        `;
        commitColumn.appendChild(commitHeader);

        // Diff content
        const diffContent = document.createElement("div");
        diffContent.className = "diff-content-inline";

        const key = `${filename}:${commit.sha}`;
        const diffInfo = this.diffData.get(key);

        if (diffInfo && diffInfo.patch) {
          const formattedDiff = this.formatDiffWithSyntax(
            diffInfo.patch,
            filename,
          );
          diffContent.innerHTML = this.decodeHtmlEntities(formattedDiff);
          diffContent.classList.add(`diff-status-${diffInfo.status}`);
        } else {
          diffContent.innerHTML = '<div class="no-changes">No changes</div>';
          diffContent.classList.add("no-changes-content");
        }

        commitColumn.appendChild(diffContent);
        commitsRow.appendChild(commitColumn);
      });

      fileSection.appendChild(commitsRow);
      container.appendChild(fileSection);
      commitsRows.push(commitsRow);

      // Add click handler for collapse/expand
      fileHeader.addEventListener("click", () => {
        const isCollapsed =
          fileHeader.getAttribute("data-collapsed") === "true";
        const indicator = fileHeader.querySelector(".collapse-indicator");

        if (isCollapsed) {
          // Expand
          commitsRow.classList.remove("collapsed");
          fileHeader.setAttribute("data-collapsed", "false");
          indicator.textContent = "−";
        } else {
          // Collapse
          commitsRow.classList.add("collapsed");
          fileHeader.setAttribute("data-collapsed", "true");
          indicator.textContent = "+";
        }
      });
    });

    diffMatrix.appendChild(container);

    // Update repo info with file count
    const repoTitle = this.elements.repoTitle;
    if (repoTitle) {
      repoTitle.innerHTML = `${this.repoData.full_name} <span style="color: #586069; font-weight: normal; font-size: 14px;">(${sortedFiles.length} files, ${this.commits.length} commits)</span>`;
    }

    // Log keyboard shortcuts and file stats
    console.log("📋 Keyboard Shortcuts:");
    console.log("  Ctrl/Cmd + E: Expand all files");
    console.log("  Ctrl/Cmd + C: Collapse all files");
    console.log("  Ctrl/Cmd + D: Toggle dark mode");
    console.log(
      `📁 Loaded ${sortedFiles.length} files across ${this.commits.length} commits`,
    );
    document.body.appendChild(scrollController);

    // Setup synchronized scrolling
    this.setupSynchronizedScrolling(scrollController, commitsRows);
  }

  setupSynchronizedScrolling(scrollController, commitsRows) {
    let isScrolling = false;

    // When the scroll controller is scrolled, sync all commit rows
    scrollController.addEventListener("scroll", () => {
      if (isScrolling) return;
      isScrolling = true;

      const scrollLeft = scrollController.scrollLeft;
      commitsRows.forEach((row) => {
        row.scrollLeft = scrollLeft;
      });

      requestAnimationFrame(() => {
        isScrolling = false;
      });
    });

    // When any commit row is scrolled (via touch/trackpad), sync the controller
    commitsRows.forEach((row) => {
      row.addEventListener("scroll", () => {
        if (isScrolling) return;
        isScrolling = true;

        const scrollLeft = row.scrollLeft;
        scrollController.scrollLeft = scrollLeft;

        // Sync all other rows
        commitsRows.forEach((otherRow) => {
          if (otherRow !== row) {
            otherRow.scrollLeft = scrollLeft;
          }
        });

        requestAnimationFrame(() => {
          isScrolling = false;
        });
      });
    });

    // Clean up any existing scroll controllers
    const existingControllers = document.querySelectorAll(
      ".commits-horizontal-scroll",
    );
    if (existingControllers.length > 1) {
      for (let i = 0; i < existingControllers.length - 1; i++) {
        existingControllers[i].remove();
      }
    }
  }

  getStatusSymbol(status) {
    const symbols = {
      added: "+",
      modified: "~",
      removed: "×",
      renamed: "→",
    };
    return symbols[status] || "?";
  }

  formatDiffWithSyntax(patch, filename) {
    if (!patch || patch === "No diff available") {
      return '<div class="no-diff-message">No diff available for this file</div>';
    }

    const lines = patch.split("\n");
    let result = [];
    let oldLineNumber = 0;
    let newLineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("@@")) {
        // Parse hunk header
        const match = line.match(
          /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?/,
        );
        if (match) {
          oldLineNumber = parseInt(match[1]);
          newLineNumber = parseInt(match[3]);
          const context = match[5] ? match[5].trim() : "";
          result.push(
            `<div class="diff-hunk-header">${this.escapeHtml(line)}</div>`,
          );
        }
        continue;
      }

      if (line.startsWith("---") || line.startsWith("+++")) {
        result.push(
          `<div class="diff-file-header">${this.escapeHtml(line)}</div>`,
        );
        continue;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        const content = line.substring(1);
        const syntaxHighlighted = this.applySyntaxHighlighting(
          content,
          filename,
        );
        result.push(
          `<div class="diff-line diff-line-added">
            <span class="line-number line-number-new">${newLineNumber}</span>
            <span class="line-prefix">+</span>
            <span class="line-content">${syntaxHighlighted}</span>
          </div>`,
        );
        newLineNumber++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        const content = line.substring(1);
        const syntaxHighlighted = this.applySyntaxHighlighting(
          content,
          filename,
        );
        result.push(
          `<div class="diff-line diff-line-removed">
            <span class="line-number line-number-old">${oldLineNumber}</span>
            <span class="line-prefix">-</span>
            <span class="line-content">${syntaxHighlighted}</span>
          </div>`,
        );
        oldLineNumber++;
      } else if (
        line.startsWith(" ") ||
        (!line.startsWith("+") &&
          !line.startsWith("-") &&
          !line.startsWith("@@") &&
          !line.startsWith("---") &&
          !line.startsWith("+++"))
      ) {
        // Context line
        const content = line.startsWith(" ") ? line.substring(1) : line;
        const syntaxHighlighted = this.applySyntaxHighlighting(
          content,
          filename,
        );
        result.push(
          `<div class="diff-line diff-line-context">
            <span class="line-number line-number-old">${oldLineNumber}</span>
            <span class="line-number line-number-new">${newLineNumber}</span>
            <span class="line-prefix"> </span>
            <span class="line-content">${syntaxHighlighted}</span>
          </div>`,
        );
        oldLineNumber++;
        newLineNumber++;
      }
    }

    return result.join("");
  }

  applySyntaxHighlighting(code, filename) {
    if (!code || code.trim() === "") {
      return this.escapeHtml(code);
    }

    const escapedCode = this.escapeHtml(code);
    const extension = filename.split(".").pop().toLowerCase();

    // Basic syntax highlighting for common languages
    switch (extension) {
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
        return this.highlightJavaScript(escapedCode);
      case "py":
        return this.highlightPython(escapedCode);
      case "html":
      case "htm":
        return this.highlightHTML(escapedCode);
      case "css":
      case "scss":
      case "sass":
        return this.highlightCSS(escapedCode);
      case "json":
        return this.highlightJSON(escapedCode);
      case "md":
      case "markdown":
        return this.highlightMarkdown(escapedCode);
      case "xml":
      case "yml":
      case "yaml":
        return this.highlightXML(escapedCode);
      case "java":
      case "c":
      case "cpp":
      case "cs":
        return this.highlightJavaScript(escapedCode); // Similar syntax
      case "php":
        return this.highlightPHP(escapedCode);
      case "rb":
        return this.highlightRuby(escapedCode);
      case "sh":
      case "bash":
        return this.highlightShell(escapedCode);
      default:
        return escapedCode;
    }
  }

  highlightJavaScript(code) {
    return (
      code
        // Comments first (to avoid interfering with other patterns)
        .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
        // Strings (avoiding already highlighted comments)
        .replace(
          /(?!<span class="comment">.*?)(['"`])((?:\\.|(?!\1)[^\\])*?)\1(?!.*?<\/span>)/g,
          '<span class="string">$1$2$1</span>',
        )
        // Keywords
        .replace(
          /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|extends|implements|interface|type|enum|null|undefined|true|false)\b(?![^<]*>)/g,
          '<span class="keyword">$1</span>',
        )
        // Numbers
        .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="number">$1</span>')
        // Functions
        .replace(
          /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()(?![^<]*>)/g,
          '<span class="function">$1</span>',
        )
    );
  }

  highlightPython(code) {
    return (
      code
        // Comments
        .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
        // Strings (triple quotes first, then regular)
        .replace(
          /("""[\s\S]*?"""|'''[\s\S]*?''')/g,
          '<span class="string">$1</span>',
        )
        .replace(
          /(?!<span class="comment">.*?)(['"`])((?:\\.|(?!\1)[^\\])*?)\1(?!.*?<\/span>)/g,
          '<span class="string">$1$2$1</span>',
        )
        // Keywords
        .replace(
          /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|lambda|and|or|not|in|is|None|True|False|self|cls|pass|break|continue|global|nonlocal|yield|assert)\b(?![^<]*>)/g,
          '<span class="keyword">$1</span>',
        )
        // Numbers
        .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="number">$1</span>')
        // Functions
        .replace(
          /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()(?![^<]*>)/g,
          '<span class="function">$1</span>',
        )
    );
  }

  highlightHTML(code) {
    return (
      code
        // Tags
        .replace(/(&lt;\/?[^&gt;]+&gt;)/g, '<span class="tag">$1</span>')
        // Attributes
        .replace(/(\s+[a-zA-Z-]+)(=)/g, '<span class="attribute">$1</span>$2')
        // Attribute values
        .replace(/(=)(['"`])(.*?)\2/g, '$1<span class="string">$2$3$2</span>')
    );
  }

  highlightCSS(code) {
    return (
      code
        // Properties
        .replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="property">$1</span>$2')
        // Values
        .replace(/(:\s*)([^;{\n]+)/g, '$1<span class="value">$2</span>')
        // Selectors
        .replace(/^([^{]+)(\s*{)/gm, '<span class="selector">$1</span>$2')
        // Comments
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
    );
  }

  highlightJSON(code) {
    return (
      code
        // Strings
        .replace(/("(?:\\.|[^"\\])*")/g, '<span class="string">$1</span>')
        // Numbers
        .replace(/:\s*(\d+\.?\d*)/g, ': <span class="number">$1</span>')
        // Booleans and null
        .replace(/:\s*(true|false|null)/g, ': <span class="keyword">$1</span>')
    );
  }

  highlightMarkdown(code) {
    return (
      code
        // Headers
        .replace(
          /^(#{1,6})\s+(.+)$/gm,
          '<span class="keyword">$1</span> <span class="header">$2</span>',
        )
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<span class="bold">**$1**</span>')
        // Italic
        .replace(/\*(.*?)\*/g, '<span class="italic">*$1*</span>')
        // Code
        .replace(/`([^`]+)`/g, '<span class="code">`$1`</span>')
        // Links
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<span class="link">[$1]($2)</span>',
        )
    );
  }

  highlightXML(code) {
    return (
      code
        // Tags
        .replace(/(&lt;\/?[^&gt;]+&gt;)/g, '<span class="tag">$1</span>')
        // Attributes
        .replace(/(\s+[a-zA-Z-:]+)(=)/g, '<span class="attribute">$1</span>$2')
        // Attribute values
        .replace(/(=)(['"`])(.*?)\2/g, '$1<span class="string">$2$3$2</span>')
    );
  }

  escapeHtml(text) {
    if (typeof text !== "string") {
      return "";
    }
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  highlightPHP(code) {
    return code
      .replace(
        /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm,
        '<span class="comment">$1</span>',
      )
      .replace(
        /(?!<span class="comment">.*?)(['"`])((?:\\.|(?!\1)[^\\])*?)\1(?!.*?<\/span>)/g,
        '<span class="string">$1$2$1</span>',
      )
      .replace(
        /\b(function|class|if|else|elseif|for|foreach|while|return|include|require|echo|print|var|public|private|protected|static|final|abstract|interface|extends|implements|new|this|self|parent|true|false|null)\b(?![^<]*>)/g,
        '<span class="keyword">$1</span>',
      )
      .replace(
        /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
        '<span class="variable">$$1</span>',
      )
      .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="number">$1</span>');
  }

  highlightRuby(code) {
    return code
      .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
      .replace(
        /(?!<span class="comment">.*?)(['"`])((?:\\.|(?!\1)[^\\])*?)\1(?!.*?<\/span>)/g,
        '<span class="string">$1$2$1</span>',
      )
      .replace(
        /\b(def|class|module|if|elsif|else|for|while|return|include|require|puts|print|attr_accessor|attr_reader|attr_writer|private|public|protected|true|false|nil|self|super|begin|rescue|ensure|end)\b(?![^<]*>)/g,
        '<span class="keyword">$1</span>',
      )
      .replace(/\b(\d+\.?\d*)\b(?![^<]*>)/g, '<span class="number">$1</span>');
  }

  highlightShell(code) {
    return code
      .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
      .replace(
        /(?!<span class="comment">.*?)(['"`])((?:\\.|(?!\1)[^\\])*?)\1(?!.*?<\/span>)/g,
        '<span class="string">$1$2$1</span>',
      )
      .replace(
        /\b(if|then|else|elif|fi|for|do|done|while|case|esac|function|return|exit|echo|printf|read|export|local|declare)\b(?![^<]*>)/g,
        '<span class="keyword">$1</span>',
      )
      .replace(
        /\$([a-zA-Z_][a-zA-Z0-9_]*|\{[^}]*\})/g,
        '<span class="variable">$&</span>',
      );
  }

  async refreshData() {
    if (!this.repoData) {
      return;
    }

    // Clean up existing scroll controllers
    const existingControllers = document.querySelectorAll(
      ".commits-horizontal-scroll",
    );
    existingControllers.forEach((controller) => controller.remove());

    this.showLoading(true);
    try {
      await this.loadCommitsAndDiffs();
    } finally {
      this.showLoading(false);
    }
  }

  // Dark Mode Methods
  initializeDarkMode() {
    const darkMode = localStorage.getItem("darkMode") === "true";
    if (darkMode) {
      document.body.classList.add("dark-mode");
      this.elements.darkModeToggle.textContent = "☀️";
    } else {
      this.elements.darkModeToggle.textContent = "🌙";
    }
  }

  toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", isDarkMode.toString());
    this.elements.darkModeToggle.textContent = isDarkMode ? "☀️" : "🌙";
  }

  // HTML entity decoder with safety checks
  decodeHtmlEntities(text) {
    if (!text || typeof text !== "string") {
      return text;
    }

    try {
      // Handle numeric entities directly for better results
      text = text.replace(/&#(\d+);/g, (match, dec) => {
        return String.fromCharCode(dec);
      });

      // Then use the textarea trick for named entities
      const textArea = document.createElement("textarea");
      textArea.innerHTML = text;
      return textArea.value;
    } catch (error) {
      console.warn("Failed to decode HTML entities:", error);
      return text;
    }
  }

  // File collapse/expand methods
  expandAllFiles() {
    const allHeaders = document.querySelectorAll(".file-section-header");
    allHeaders.forEach((header) => {
      const commitsRow = header.nextElementSibling;
      const indicator = header.querySelector(".collapse-indicator");

      commitsRow.classList.remove("collapsed");
      header.setAttribute("data-collapsed", "false");
      indicator.textContent = "−";
    });
  }

  collapseAllFiles() {
    const allHeaders = document.querySelectorAll(".file-section-header");
    allHeaders.forEach((header) => {
      const commitsRow = header.nextElementSibling;
      const indicator = header.querySelector(".collapse-indicator");

      commitsRow.classList.add("collapsed");
      header.setAttribute("data-collapsed", "true");
      indicator.textContent = "+";
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Only handle shortcuts when not typing in input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "e":
        case "E":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.expandAllFiles();
          }
          break;
        case "c":
        case "C":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.collapseAllFiles();
          }
          break;
        case "d":
        case "D":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.toggleDarkMode();
          }
          break;
        case "a":
        case "A":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.runAiDetection();
          }
          break;
      }
    });
  }

  // AI Detection Methods
  async runAiDetection() {
    if (!this.commits || this.commits.length === 0) {
      this.showError("No commits loaded. Please load a repository first.");
      return;
    }

    // Disable the trigger button while analysis runs
    if (this.elements.runAiDetectionBtn) {
      this.elements.runAiDetectionBtn.disabled = true;
      this.elements.runAiDetectionBtn.textContent = "🔍 Analyzing...";
    }

    try {
      // Ensure the AI detection panel is visible before running checks
      if (this.elements.aiDetection) {
        this.elements.aiDetection.classList.remove("hidden");
      }

      // Run the checks and display results (panel remains open)
      const checks = await this.performAiChecks();
      this.displayAiResults(checks);
    } catch (error) {
      console.error("AI detection error:", error);
      this.showError("Failed to run AI detection: " + error.message);
    } finally {
      if (this.elements.runAiDetectionBtn) {
        this.elements.runAiDetectionBtn.disabled = false;
        this.elements.runAiDetectionBtn.textContent = "🤖 AI Detection";
      }
    }
  }

  async performAiChecks() {
    // Run existing checks and newly added AI heuristics
    const checks = [
      await this.checkVerboseComments(),
      await this.checkCommentDeletions(),
      await this.checkBoilerplateDuplicates(),
      await this.checkRepetitivePhrasing(),
      await this.checkEntropyInComments(),
      await this.checkCrossFileDuplicates(),
    ];

    return checks;
  }

  async checkVerboseComments() {
    const check = {
      id: "verbose_comments",
      title: "Verbose Comments Analysis",
      description:
        "Detects unusually high comment-to-code ratios that may indicate AI-generated content",
      status: "pass",
      details: [],
      metrics: {},
    };

    let totalLines = 0;
    let totalCommentLines = 0;
    const fileAnalysis = new Map();

    // Analyze each file across all commits
    for (const file of this.files) {
      let fileLines = 0;
      let fileCommentLines = 0;

      for (const commit of this.commits) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);

        if (diffData && diffData.patch) {
          const lines = diffData.patch.split("\n");
          for (const line of lines) {
            if (line.startsWith("+") && !line.startsWith("+++")) {
              const content = line.substring(1).trim();
              if (content) {
                fileLines++;
                totalLines++;

                // Check for various comment patterns
                if (this.isCommentLine(content, file)) {
                  fileCommentLines++;
                  totalCommentLines++;
                }
              }
            }
          }
        }
      }

      if (fileLines > 0) {
        const ratio = fileCommentLines / fileLines;
        fileAnalysis.set(file, {
          lines: fileLines,
          comments: fileCommentLines,
          ratio,
        });

        // Flag files with > 10% comments as suspicious
        if (ratio > 0.1 && fileLines > 10) {
          check.details.push(
            `${file}: ${(ratio * 100).toFixed(1)}% comments (${fileCommentLines}/${fileLines} lines)`,
          );
        }
      }
    }

    const overallRatio = totalLines > 0 ? totalCommentLines / totalLines : 0;
    check.metrics = {
      totalLines,
      totalCommentLines,
      overallRatio: (overallRatio * 100).toFixed(1) + "%",
      suspiciousFiles: check.details.length,
    };

    // Determine status
    if (overallRatio > 0.1) {
      check.status = "fail";
    } else if (overallRatio > 0.5 || check.details.length > 0) {
      check.status = "warning";
    }

    return check;
  }

  async checkCommentDeletions() {
    const check = {
      id: "comment_deletions",
      title: "Comment Deletion Patterns",
      description:
        "Detects patterns of comments being added and then quickly removed",
      status: "pass",
      details: [],
      metrics: {},
    };

    let totalCommentDeletions = 0;
    let commitsWithDeletions = 0;

    for (const commit of this.commits) {
      let commitCommentDeletions = 0;

      for (const file of this.files) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);

        if (diffData && diffData.patch) {
          const lines = diffData.patch.split("\n");
          for (const line of lines) {
            if (line.startsWith("-") && !line.startsWith("---")) {
              const content = line.substring(1).trim();
              if (this.isCommentLine(content, file)) {
                commitCommentDeletions++;
                totalCommentDeletions++;
              }
            }
          }
        }
      }

      if (commitCommentDeletions > 5) {
        commitsWithDeletions++;
        check.details.push(
          `${commit.sha.substring(0, 7)}: ${commitCommentDeletions} comment deletions - "${commit.commit.message.split("\n")[0]}"`,
        );
      }
    }

    check.metrics = {
      totalCommentDeletions,
      commitsWithDeletions,
      avgDeletionsPerCommit:
        this.commits.length > 0
          ? (totalCommentDeletions / this.commits.length).toFixed(1)
          : 0,
    };

    // Determine status
    if (commitsWithDeletions > this.commits.length * 0.3) {
      check.status = "fail";
    } else if (commitsWithDeletions > 0 || totalCommentDeletions > 20) {
      check.status = "warning";
    }

    return check;
  }

  //
  // Helper: determine whether a line appears to be a comment for the given filename extension.
  //
  isCommentLine(content, filename) {
    if (!content || !content.trim()) return false;

    const ext = (filename || "").split(".").pop().toLowerCase();

    // Language-specific comment patterns
    switch (ext) {
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
      case "java":
      case "c":
      case "cpp":
      case "cs":
        return (
          content.trim().startsWith("//") ||
          content.trim().startsWith("/*") ||
          content.includes("*/")
        );

      case "py":
        return (
          content.trim().startsWith("#") ||
          content.includes('"""') ||
          content.includes("'''")
        );

      case "html":
      case "xml":
        return content.includes("<!--") || content.includes("-->");

      case "css":
        return content.trim().startsWith("/*") || content.includes("*/");

      case "sh":
      case "bash":
        return content.trim().startsWith("#");

      case "sql":
        return (
          content.trim().startsWith("--") || content.trim().startsWith("/*")
        );

      case "rb":
        return content.trim().startsWith("#");

      case "php":
        return (
          content.trim().startsWith("//") ||
          content.trim().startsWith("#") ||
          content.trim().startsWith("/*")
        );

      default:
        // Generic patterns
        return (
          content.trim().startsWith("//") ||
          content.trim().startsWith("#") ||
          content.trim().startsWith("/*") ||
          content.includes("*/") ||
          content.includes("<!--")
        );
    }
  }

  //
  // Utility helpers used by new AI checks
  //

  // Normalize a block of code/text for duplicate detection: strip whitespace, collapse spacing
  normalizeCodeBlock(block) {
    if (!block) return "";
    return block
      .replace(/\r\n/g, "\n")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  // Compute n-grams for a piece of text (words)
  computeNgrams(text, n = 2) {
    if (!text) return {};
    const tokens = text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const map = {};
    for (let i = 0; i <= tokens.length - n; i++) {
      const gram = tokens.slice(i, i + n).join(" ");
      map[gram] = (map[gram] || 0) + 1;
    }
    return map;
  }

  // Compute Shannon entropy (on token distribution)
  computeEntropy(tokens) {
    if (!tokens || tokens.length === 0) return 0;
    const freq = {};
    tokens.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
    const N = tokens.length;
    let entropy = 0;
    for (const k in freq) {
      const p = freq[k] / N;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  // Jaccard similarity for two token sets
  jaccardSimilarity(aTokens, bTokens) {
    const A = new Set(aTokens);
    const B = new Set(bTokens);
    const inter = [...A].filter((x) => B.has(x)).length;
    const union = new Set([...A, ...B]).size;
    return union === 0 ? 0 : inter / union;
  }

  //
  // New AI checks
  //

  // 1) Boilerplate / duplicate chunk detection (exact-normalized duplicates)
  async checkBoilerplateDuplicates() {
    const check = {
      id: "boilerplate_duplicates",
      title: "Boilerplate / Duplicate Chunk Detection",
      description:
        "Finds identical or near-identical blocks introduced across files or commits",
      status: "pass",
      details: [],
      metrics: {},
    };

    const blockMap = new Map(); // normalized -> [{file, sha, snippet}]
    const MIN_BLOCK_LINES = this.aiSettings?.minBlockLines || 6; // minimal block length to consider
    const MIN_DUPLICATE_OCCURRENCES = this.aiSettings?.duplicateThreshold || 2;

    // Collect added contiguous blocks from diffs
    for (const file of this.files) {
      for (const commit of this.commits) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);
        if (!diffData || !diffData.patch) continue;

        const lines = diffData.patch.split("\n");
        let buffer = [];
        for (const rawLine of lines) {
          if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
            buffer.push(rawLine.substring(1));
          } else {
            if (buffer.length >= MIN_BLOCK_LINES) {
              const block = buffer.join("\n");
              const norm = this.normalizeCodeBlock(block);
              if (!blockMap.has(norm)) blockMap.set(norm, []);
              blockMap
                .get(norm)
                .push({ file, sha: commit.sha, snippet: block });
            }
            buffer = [];
          }
        }
        // tail
        if (buffer.length >= MIN_BLOCK_LINES) {
          const block = buffer.join("\n");
          const norm = this.normalizeCodeBlock(block);
          if (!blockMap.has(norm)) blockMap.set(norm, []);
          blockMap.get(norm).push({ file, sha: commit.sha, snippet: block });
        }
      }
    }

    // Identify duplicates across different files/commits
    for (const [norm, occurrences] of blockMap.entries()) {
      const uniqueContexts = new Set(
        occurrences.map((o) => `${o.file}:${o.sha}`),
      );
      const uniqueFiles = new Set(occurrences.map((o) => o.file));
      if (
        occurrences.length >= MIN_DUPLICATE_OCCURRENCES &&
        uniqueFiles.size >= 2
      ) {
        check.details.push(
          `${[...uniqueFiles].slice(0, 5).join(", ")} — ${occurrences.length} occurrences`,
        );
      }
    }

    check.metrics.totalBlocks = blockMap.size;
    check.metrics.duplicateBlocks = check.details.length;

    if (check.details.length > 5) check.status = "fail";
    else if (check.details.length > 0) check.status = "warning";

    return check;
  }

  // 2) Repetitive phrasing (n-gram repetition) in comments/commit messages
  async checkRepetitivePhrasing() {
    const check = {
      id: "repetitive_phrasing",
      title: "Repetitive Phrasing (n-gram) Analysis",
      description:
        "Detects unusually repetitive n-grams in comments and commit messages",
      status: "pass",
      details: [],
      metrics: {},
    };

    const ngramCounts = {};
    let totalTokens = 0;
    const collectText = [];

    // Gather comment lines and commit messages
    for (const file of this.files) {
      for (const commit of this.commits) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);
        if (diffData && diffData.patch) {
          const lines = diffData.patch.split("\n");
          for (const line of lines) {
            if (line.startsWith("+") && !line.startsWith("+++")) {
              const content = line.substring(1).trim();
              if (this.isCommentLine(content, file)) {
                collectText.push(content);
              }
            }
          }
        }
      }
    }

    // Add commit messages too
    for (const commit of this.commits) {
      if (commit.commit && commit.commit.message)
        collectText.push(commit.commit.message);
    }

    const combined = collectText.join(" ");
    const tokens = combined
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    totalTokens = tokens.length;

    // Count n-grams (bigrams and trigrams)
    const bigrams = this.computeNgrams(combined, 2);
    const trigrams = this.computeNgrams(combined, 3);

    // Find top bigrams/trigrams
    const topBigrams = Object.entries(bigrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topTrigrams = Object.entries(trigrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Metric: frequency of most common bigram relative to tokens
    const mostCommonBigramFreq = topBigrams.length > 0 ? topBigrams[0][1] : 0;
    const bigramRatio =
      totalTokens > 0 ? mostCommonBigramFreq / totalTokens : 0;

    check.metrics.totalTokens = totalTokens;
    check.metrics.topBigrams = topBigrams
      .map((t) => `${t[0]}(${t[1]})`)
      .join(", ");
    check.metrics.topTrigrams = topTrigrams
      .map((t) => `${t[0]}(${t[1]})`)
      .join(", ");
    check.metrics.bigramRatio = bigramRatio.toFixed(3);

    // Thresholds: flag if top bigram > 3% of tokens or many repeated trigrams
    if (
      bigramRatio > 0.03 ||
      (topTrigrams.length > 0 && topTrigrams[0][1] > 5)
    ) {
      check.status = "warning";
      check.details.push(`Top bigram ratio ${(bigramRatio * 100).toFixed(2)}%`);
    }
    if (bigramRatio > 0.08) {
      check.status = "fail";
    }

    return check;
  }

  // 5) Entropy-based check for comments (low lexical variability)
  async checkEntropyInComments() {
    const check = {
      id: "comment_entropy",
      title: "Comment Entropy Analysis",
      description:
        "Detects unusually low lexical entropy in comments which can indicate formulaic or generated text",
      status: "pass",
      details: [],
      metrics: {},
    };

    const tokens = [];

    for (const file of this.files) {
      for (const commit of this.commits) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);
        if (!diffData || !diffData.patch) continue;
        const lines = diffData.patch.split("\n");
        for (const line of lines) {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            const content = line.substring(1).trim();
            if (this.isCommentLine(content, file)) {
              const toks = content
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter(Boolean)
                .map((t) => t.toLowerCase());
              tokens.push(...toks);
            }
          }
        }
      }
    }

    const entropy = this.computeEntropy(tokens);
    check.metrics.tokenCount = tokens.length;
    check.metrics.entropy = entropy.toFixed(3);

    // Heuristics: low entropy indicates repetitive, formulaic text.
    const entropyWarn = this.aiSettings?.entropyWarn ?? 3.0;
    const entropyFail = this.aiSettings?.entropyFail ?? 2.5;

    if (tokens.length > 50 && entropy < entropyWarn) {
      check.status = "warning";
      check.details.push(`Low comment entropy: ${entropy.toFixed(2)}`);
    }
    if (tokens.length > 200 && entropy < entropyFail) {
      check.status = "fail";
    }

    return check;
  }

  // 9) Cross-file near-duplicate detection (Jaccard on token sets)
  async checkCrossFileDuplicates() {
    const check = {
      id: "cross_file_duplicates",
      title: "Cross-file Near-Duplicate Detection",
      description:
        "Detects similar function/comment bodies across files using Jaccard token similarity",
      status: "pass",
      details: [],
      metrics: {},
    };

    // Gather blocks per file (simple heuristic: consecutive added lines grouped)
    const fileBlocks = new Map(); // file -> [normTokensString]
    for (const file of this.files) {
      const blocks = [];
      for (const commit of this.commits) {
        const key = `${file}:${commit.sha}`;
        const diffData = this.diffData.get(key);
        if (!diffData || !diffData.patch) continue;
        const lines = diffData.patch.split("\n");
        let buffer = [];
        for (const rawLine of lines) {
          if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
            buffer.push(rawLine.substring(1));
          } else {
            if (buffer.length >= 4) {
              const norm = this.normalizeCodeBlock(buffer.join("\n"));
              const tokens = norm
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter(Boolean);
              blocks.push(tokens);
            }
            buffer = [];
          }
        }
        if (buffer.length >= 4) {
          const norm = this.normalizeCodeBlock(buffer.join("\n"));
          const tokens = norm
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean);
          blocks.push(tokens);
        }
      }
      if (blocks.length > 0) fileBlocks.set(file, blocks);
    }

    // Compare blocks across files
    const fileList = [...fileBlocks.keys()];
    for (let i = 0; i < fileList.length; i++) {
      for (let j = i + 1; j < fileList.length; j++) {
        const aBlocks = fileBlocks.get(fileList[i]);
        const bBlocks = fileBlocks.get(fileList[j]);
        for (const a of aBlocks) {
          for (const b of bBlocks) {
            const sim = this.jaccardSimilarity(a, b);
            const jaccardThresh = this.aiSettings?.jaccardThreshold ?? 0.75;
            if (sim > jaccardThresh) {
              check.details.push(
                `${fileList[i]} ~ ${fileList[j]} (similarity ${(sim * 100).toFixed(0)}%)`,
              );
            }
          }
        }
      }
    }

    check.metrics.filesCompared = fileList.length;
    check.metrics.matches = check.details.length;

    if (check.details.length > 5) check.status = "fail";
    else if (check.details.length > 0) check.status = "warning";

    return check;
  }

  displayAiResults(checks) {
    // Calculate overall status
    const failedChecks = checks.filter((c) => c.status === "fail").length;
    const warningChecks = checks.filter((c) => c.status === "warning").length;

    let overallStatus, overallMessage;
    if (failedChecks > 0) {
      overallStatus = "fail";
      overallMessage = `⚠️ ${failedChecks} check(s) failed, ${warningChecks} warning(s)`;
    } else if (warningChecks > 0) {
      overallStatus = "warning";
      overallMessage = `⚠️ ${warningChecks} warning(s) detected`;
    } else {
      overallStatus = "pass";
      overallMessage = `✅ All checks passed`;
    }

    // Update summary
    this.elements.aiOverallStatus.textContent = overallMessage;
    this.elements.aiOverallStatus.className = `ai-status ${overallStatus}`;
    this.elements.aiSummaryText.textContent = `Analyzed ${this.commits.length} commits across ${this.files.size} files`;

    // Clear and populate checks
    this.elements.aiChecks.innerHTML = "";

    for (const check of checks) {
      const checkDiv = document.createElement("div");
      checkDiv.className = `ai-check ${check.status}`;

      const icon =
        check.status === "pass"
          ? "✅"
          : check.status === "warning"
            ? "⚠️"
            : "❌";
      const statusText =
        check.status === "pass"
          ? "PASS"
          : check.status === "warning"
            ? "WARNING"
            : "FAIL";

      let detailsHtml = "";
      if (check.details.length > 0) {
        const detailsList = check.details
          .slice(0, 5)
          .map((detail) => `<li>${this.escapeHtml(detail)}</li>`)
          .join("");
        const moreText =
          check.details.length > 5
            ? `<li>... and ${check.details.length - 5} more</li>`
            : "";
        detailsHtml = `
          <div class="ai-check-details show">
            <strong>Details:</strong>
            <ul>${detailsList}${moreText}</ul>
          </div>`;
      }

      let metricsHtml = "";
      if (Object.keys(check.metrics).length > 0) {
        const metricsList = Object.entries(check.metrics)
          .map(
            ([key, value]) => `<span class="ai-metric">${key}: ${value}</span>`,
          )
          .join(" ");
        metricsHtml = `<div class="ai-check-details show"><strong>Metrics:</strong> ${metricsList}</div>`;
      }

      checkDiv.innerHTML = `
        <div class="ai-check-info">
          <div class="ai-check-title">${check.title}</div>
          <div class="ai-check-description">${check.description}</div>
          ${metricsHtml}
          ${detailsHtml}
        </div>
        <div class="ai-check-result">
          <span class="ai-check-icon">${icon}</span>
          <span>${statusText}</span>
        </div>
      `;

      this.elements.aiChecks.appendChild(checkDiv);
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  new GitHubDiffViewer();
});
