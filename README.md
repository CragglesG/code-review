# YSWS Code Review

A modern, interactive GitHub repository diff viewer that displays file changes across commits in an intuitive matrix layout.

## Features

🌙 **Dark Mode** - Toggle between light and dark themes
📁 **Collapsible Files** - Collapse/expand file sections for better navigation
♾️ **Unlimited Commits** - Load all commits or set a specific limit
🎯 **Synchronized Scrolling** - Navigate through commits with unified horizontal scrolling
🎨 **Syntax Highlighting** - Color-coded diffs with proper syntax highlighting
⚡ **Auto Authentication** - Seamless GitHub OAuth integration

## Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd ysws-review
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```

3. **Open Browser**
   ```
   http://localhost:3000
   ```

The app will automatically handle GitHub authentication when you first visit.

## GitHub OAuth Setup (Optional)

For higher API rate limits, configure your own GitHub OAuth App:

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/applications/new)
2. Create a new OAuth App with:
   - **Application name**: YSWS Code Review
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/auth/callback`
3. Copy the Client ID and Client Secret
4. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```
5. Edit `.env` with your credentials:
   ```
   GITHUB_APP_CLIENT_ID=your_client_id_here
   GITHUB_APP_CLIENT_SECRET=your_client_secret_here
   ```

## Usage

1. **Enter Repository URL**: Paste any GitHub repo URL (e.g., `https://github.com/facebook/react`)
2. **Browse Commits**: Use the horizontal scrollbar or drag to navigate through commits
3. **Collapse Files**: Click file headers to collapse/expand sections
4. **Dark Mode**: Toggle with the 🌙/☀️ button

### Keyboard Shortcuts

- `Ctrl/Cmd + E`: Expand all files
- `Ctrl/Cmd + C`: Collapse all files  
- `Ctrl/Cmd + D`: Toggle dark mode

## Architecture

- **Frontend**: Vanilla JavaScript, modern CSS
- **Backend**: Node.js static file server with OAuth proxy
- **API**: GitHub REST API v4
- **Authentication**: GitHub OAuth 2.0

## Development

```bash
# Start development server
npm start

# Custom port
npm start -- --port=3001
```

## License

MIT License