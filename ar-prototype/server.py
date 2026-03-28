#!/usr/bin/env python3
"""
Simple HTTPS-capable local server for the WebAR prototype.
Camera access (getUserMedia) requires a secure context: either localhost or HTTPS.
Running on localhost:8000 works in Chrome/Safari without HTTPS.

Usage:
    python3 server.py              # HTTP on localhost:8000 (sufficient for Chrome)
    python3 server.py --port 3000  # custom port

Open http://localhost:8000 in your browser.
"""

import http.server
import ssl
import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description='WebAR local dev server')
    parser.add_argument('--port', type=int, default=8000, help='Port (default 8000)')
    parser.add_argument('--https', action='store_true', help='Enable self-signed HTTPS')
    args = parser.parse_args()

    # Serve from the directory this script lives in
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    handler = http.server.SimpleHTTPRequestHandler
    server = http.server.HTTPServer(('0.0.0.0', args.port), handler)

    if args.https:
        # Generate a self-signed cert on the fly (requires openssl)
        cert = '/tmp/webar-cert.pem'
        key  = '/tmp/webar-key.pem'
        if not os.path.exists(cert):
            os.system(f'openssl req -x509 -newkey rsa:2048 -keyout {key} -out {cert} '
                      f'-days 1 -nodes -subj "/CN=localhost" 2>/dev/null')
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        proto = 'https'
    else:
        proto = 'http'

    print(f'\n  🔮 WebAR Prototype Server')
    print(f'  ─────────────────────────')
    print(f'  Open  {proto}://localhost:{args.port}  in Chrome or Safari\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
        sys.exit(0)

if __name__ == '__main__':
    main()
