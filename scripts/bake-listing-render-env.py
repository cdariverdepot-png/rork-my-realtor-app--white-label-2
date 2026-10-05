#!/usr/bin/env python3
"""Write the importer's deploy-time renderer fallback. Never prints the token."""
import os
import pathlib
import sys

url = os.environ.get("LISTING_RENDER_URL", "")
token = os.environ.get("LISTING_RENDER_TOKEN", "")
if url != "https://cdariver-listing-renderer.fly.dev":
    sys.exit("LISTING_RENDER_URL is not the deployed renderer.")
if len(token) < 16 or any(ch.isspace() for ch in token):
    sys.exit("LISTING_RENDER_TOKEN failed validation.")
root = pathlib.Path(__file__).resolve().parents[1]
path = root / "supabase/functions/analyze-realtor-build/listingRenderEnv.ts"
path.write_text(
    "/** Deployed fallback. The git copy returns nothing and must not contain this value. */\n"
    "export function listingRenderEnv(name: string): string | undefined {\n"
    f"  if (name === \"LISTING_RENDER_URL\") return {url!r};\n"
    f"  if (name === \"LISTING_RENDER_TOKEN\") return {token!r};\n"
    "  return undefined;\n"
    "}\n",
    encoding="utf-8",
)
print("listing renderer fallback written; token was not printed")
