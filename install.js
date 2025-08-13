#!/usr/bin/env node

/**
 * Installation script for Code Review Tool
 * This script sets up the environment and installs necessary dependencies
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 Setting up Code Review Tool...\n");

// Check if Node.js version is supported
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split(".")[0].substring(1));

if (majorVersion < 14) {
  console.error("❌ Node.js 14 or higher is required");
  console.error(`   Current version: ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Install dotenv if not already installed
try {
  console.log("📦 Installing dependencies...");
  execSync("npm install dotenv", { stdio: "inherit" });
  console.log("✅ Dependencies installed");
} catch (error) {
  console.error("❌ Failed to install dependencies:", error.message);
  process.exit(1);
}

// Check if .env file exists, create from template if not
const envPath = path.join(__dirname, ".env");
const envExamplePath = path.join(__dirname, ".env.example");

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    console.log("📝 Creating .env file from template...");
    fs.copyFileSync(envExamplePath, envPath);
    console.log("✅ Created .env file");
    console.log("⚠️  Please edit .env file with your GitHub App credentials");
  } else {
    console.log("📝 Creating basic .env file...");
    const basicEnv = `# GitHub App Configuration
# Fill in these values after creating your GitHub App

GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
APP_NAME=Code Review Tool
APP_URL=http://localhost:8000
PORT=8000
DEBUG=false
`;
    fs.writeFileSync(envPath, basicEnv);
    console.log("✅ Created basic .env file");
  }
} else {
  console.log("✅ .env file already exists");
}

// Check if package.json has the required scripts
const packageJsonPath = path.join(__dirname, "package.json");
if (fs.existsSync(packageJsonPath)) {
  console.log("✅ package.json found");
} else {
  console.log("⚠️  package.json not found - you may need to run npm init");
}

console.log("\n🎉 Setup complete!");
console.log("\nNext steps:");
console.log("1. Edit the .env file with your GitHub App credentials");
console.log("2. Run: npm start");
console.log("3. Open http://localhost:8000 in your browser");
console.log("4. Visit http://localhost:8000/debug.html for configuration help");

console.log("\n📖 For GitHub App setup instructions, see:");
console.log("   - .env.example file");
console.log("   - debug.html page");
console.log("   - README.md file");

console.log("\n💡 Quick test:");
console.log("   node server.js");
