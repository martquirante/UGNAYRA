#!/usr/bin/env python3
"""
UGNAYRA — Single Page Application (SPA) Local Development Server
Provides clean URL rewriting (/profile, /feed, /settings, /messages) to /index.html
without requiring '#' hash fragments in the browser URL bar.
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
DIRECTORY = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else "frontend")

class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _rewrite_spa_path(self):
        clean_path = self.path.split('?')[0].split('#')[0]
        rel_path = clean_path.lstrip('/')
        local_path = os.path.normpath(os.path.join(DIRECTORY, rel_path))

        if os.path.isfile(local_path):
            return
        if os.path.isdir(local_path) and os.path.isfile(os.path.join(local_path, 'index.html')):
            return
        base_name = os.path.basename(clean_path)
        if '.' in base_name:
            return
        preserved_query = ('?' + self.path.split('?')[1]) if '?' in self.path else ''
        self.path = '/index.html' + preserved_query

    def do_GET(self):
        self._rewrite_spa_path()
        return super().do_GET()

    def do_HEAD(self):
        self._rewrite_spa_path()
        return super().do_HEAD()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("127.0.0.1", PORT), SPARequestHandler) as httpd:
            print(f"[UGNAYRA] SPA Dev Server live at http://127.0.0.1:{PORT}")
            print(f"          Root directory: {DIRECTORY}")
            print(f"          Clean URL rewriting: ENABLED (zero '#' required)")
            sys.stdout.flush()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
