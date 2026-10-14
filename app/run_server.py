#!/usr/bin/env python3
"""极简本地服务器：在默认浏览器中打开值班排班工具。"""

from __future__ import annotations

import os
import socket
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


APP_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
BASE_PORT = 8765


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.address_string()}] {format % args}")


def find_free_port() -> int:
    for offset in range(20):
        port = BASE_PORT + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
            except OSError:
                continue
            return port
    return BASE_PORT


def main() -> None:
    os.chdir(APP_DIR)
    port = find_free_port()
    server = ThreadingHTTPServer((HOST, port), NoCacheHandler)
    url = f"http://{HOST}:{port}/index.html"

    print("值班排班工具已启动")
    print(f"访问地址: {url}")
    print("按 Ctrl+C 退出")

    threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在退出...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
