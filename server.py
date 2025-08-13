#!/usr/bin/env python3
"""
Simple HTTP server for the Code Review Tool

This script provides a local development server with CORS support
for testing the application without needing to deploy it.

Usage:
    python server.py [port]

Default port: 8000
"""

import http.server
import socketserver
import sys
import os
from urllib.parse import urlparse


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS support"""

    def end_headers(self):
        """Add CORS headers to all responses"""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        """Handle preflight OPTIONS requests"""
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        """Handle GET requests with custom routing"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        # Serve index.html for root path
        if path == "/":
            self.path = "/index.html"

        # Add security headers
        super().do_GET()

    def log_message(self, format, *args):
        """Custom log format"""
        print(
            f"[{self.log_date_time_string()}] {self.address_string()} - {format % args}"
        )


def main():
    """Start the development server"""
    # Get port from command line argument or use default
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
            sys.exit(1)

    # Change to script directory to serve files correctly
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # Create server
    handler = CORSHTTPRequestHandler
    httpd = socketserver.TCPServer(("", port), handler)

    print("GitHub Diff Matrix Viewer Development Server")
    print(f"Serving at http://localhost:{port}")
    print(f"Directory: {script_dir}")
    print("Press Ctrl+C to stop the server")
    print("-" * 50)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
