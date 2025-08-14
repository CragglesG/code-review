// Code Review Tool Diff Viewer
class GitHubDiffViewer {
  constructor() {
    this.repoData = null;
    this.commits = [];
    this.files = new Set();
    this.diffData = new Map();
    this.config = null;
    this.initializeElements();
    this.loadConfig();
    this.bindEvents();
    this.initializeDarkMode();
    this.setupKeyboardShortcuts();
    this.handleAuthCallback();
    // Wait a bit for DOM and config to be ready
    setTimeout(() => {
      this.autoAuthenticate();
    }, 100);
  }

  async loadConfig() {
    try {
      const configElement = document.getElementById("github-app-config");
      if (configElement) {
        this.config = JSON.parse(configElement.textContent);
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

    // Clean up existing scroll controllers
    const existingControllers = document.querySelectorAll(
      ".commits-horizontal-scroll",
    );
    existingControllers.forEach((controller) => controller.remove());

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
      }
    });
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  new GitHubDiffViewer();
});
