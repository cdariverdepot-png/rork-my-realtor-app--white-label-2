#!/usr/bin/env python3
"""Confirm renderer secret names exist. Never prints secret values."""
import os
import subprocess
import sys

ref = os.environ.get("SUPABASE_PROJECT_REF", "")
if not ref:
    sys.exit("SUPABASE_PROJECT_REF is missing.")
proc = subprocess.run(
    ["supabase", "secrets", "list", "--project-ref", ref],
    text=True,
    capture_output=True,
)
if proc.returncode != 0:
    sys.exit("supabase secrets list failed. Values were not printed.")
raw = proc.stdout or ""
for name in ("LISTING_RENDER_URL", "LISTING_RENDER_TOKEN"):
    print(f"{name}={'present' if name in raw else 'missing'}")
if "LISTING_RENDER_URL" not in raw or "LISTING_RENDER_TOKEN" not in raw:
    sys.exit(1)
print("Secret values were not printed.")
