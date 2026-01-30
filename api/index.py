import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VANNA_SRC = os.path.join(ROOT_DIR, "vanna", "src")
if VANNA_SRC not in sys.path:
    sys.path.insert(0, VANNA_SRC)

from vanna_web_server import app
