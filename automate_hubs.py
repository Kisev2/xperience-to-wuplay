"""
Xperience -> Wuplay Hub Automator
==================================
Automatically creates Wuplay Hubs from an exported Xperience collection JSON.

For each Xperience collection  -> creates a Wuplay Hub
For each folder inside it      -> creates a Hub Section with cover image
For each catalog source        -> adds the Xperience addon catalog to that section

REQUIREMENTS:
    pip install requests browser-cookie3

FIRST RUN:
    Just run the script — it will ask you everything it needs and save your
    settings to config.json for future runs.

    python automate_hubs.py
"""

import json
import os
import sys
import time
import requests
from datetime import datetime, timezone

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────
BASE_URL       = "https://config.wuplay.app"
CONFIG_FILE    = "config.json"          # saved settings & cookie cache
COOKIE_TTL     = 50 * 60               # cookie reuse window in seconds (50 min)
REQUEST_DELAY  = 0.5                   # delay between API calls (seconds)

DEFAULT_COLLECTION_FILE = "Xperience Collection/xperience-me-copy-collections.json"
DEFAULT_MANIFEST_FILE   = "Xperience Addon Manifest File/manifest.json"


# ─────────────────────────────────────────────
# Config persistence
# ─────────────────────────────────────────────

def load_config():
    """Load saved settings from config.json."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(cfg):
    """Persist settings to config.json."""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


# ─────────────────────────────────────────────
# Interactive setup
# ─────────────────────────────────────────────

def setup_prompt(cfg):
    """
    On first run (or if settings are missing), interactively ask the user
    for required values and save them to config.json.
    """
    changed = False

    print("=" * 55)
    print("  Xperience -> Wuplay Hub Automator  |  Setup")
    print("=" * 55)

    # Profile key
    if not cfg.get("profile_key"):
        print()
        print("Your Wuplay profile key is in the URL:")
        print("  config.wuplay.app/configure/<PROFILE_KEY>")
        key = input("Profile key: ").strip()
        if not key:
            print("ERROR: Profile key is required.")
            sys.exit(1)
        cfg["profile_key"] = key
        changed = True

    # Collection file
    if not cfg.get("collection_file"):
        print()
        print(f"Path to your Xperience collection JSON")
        print(f"  (press Enter for default: {DEFAULT_COLLECTION_FILE})")
        path = input("Collection file: ").strip()
        cfg["collection_file"] = path or DEFAULT_COLLECTION_FILE
        changed = True

    # Manifest file
    if not cfg.get("manifest_file"):
        print()
        print(f"Path to your Xperience addon manifest JSON")
        print(f"  (press Enter for default: {DEFAULT_MANIFEST_FILE})")
        path = input("Manifest file: ").strip()
        cfg["manifest_file"] = path or DEFAULT_MANIFEST_FILE
        changed = True

    if changed:
        save_config(cfg)
        print()
        print(f"Settings saved to {CONFIG_FILE}")
        print("=" * 55)

    return cfg


# ─────────────────────────────────────────────
# Cookie management (with 50-minute cache)
# ─────────────────────────────────────────────

def is_cookie_fresh(cfg):
    """Return True if the cached cookie is less than 50 minutes old."""
    saved_at = cfg.get("cookie_saved_at")
    if not saved_at or not cfg.get("cookie"):
        return False
    try:
        saved_time = datetime.fromisoformat(saved_at)
        age = (datetime.now(timezone.utc) - saved_time).total_seconds()
        return age < COOKIE_TTL
    except Exception:
        return False


def get_cookie_from_browser():
    """Try to auto-extract cf_clearance from Chrome via browser-cookie3."""
    try:
        import browser_cookie3
        jar = browser_cookie3.chrome(domain_name="config.wuplay.app")
        cookies = {c.name: c.value for c in jar}
        if not cookies:
            print("  No cookies found in Chrome (may be encrypted on Windows).")
            return None
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        print(f"  Cookie auto-detected from Chrome ({len(cookies)} cookie(s))")
        return cookie_str
    except ImportError:
        print("  browser-cookie3 not installed (run: pip install browser-cookie3)")
        return None
    except Exception as e:
        print(f"  Could not read Chrome cookies: {e}")
        return None


def prompt_cookie():
    """Ask user to paste the cf_clearance value manually."""
    print()
    print("Paste your cf_clearance cookie value:")
    print("  1. Open config.wuplay.app in Chrome")
    print("  2. Press F12 -> Network tab -> refresh the page")
    print("  3. Click any request -> Request Headers -> find 'Cookie:'")
    print("  4. Copy the value after 'cf_clearance=' (up to the next ';' or end)")
    print()
    value = input("cf_clearance=").strip()
    if value.startswith("cf_clearance="):
        value = value[len("cf_clearance="):]
    return f"cf_clearance={value}" if value else None


def resolve_cookie(cfg):
    """
    Return a valid cookie string. Uses cache if fresh (<50 min),
    otherwise tries browser auto-detect, then falls back to manual prompt.
    Saves the result to config.json with a timestamp.
    """
    if is_cookie_fresh(cfg):
        age_min = int(
            (datetime.now(timezone.utc) -
             datetime.fromisoformat(cfg["cookie_saved_at"])).total_seconds() / 60
        )
        print(f"  Using cached cookie ({age_min} min old, refreshes at 50 min)")
        return cfg["cookie"]

    print("  Cached cookie expired or missing — refreshing...")
    cookie = get_cookie_from_browser()
    if not cookie:
        cookie = prompt_cookie()
    if not cookie:
        print("ERROR: No cookie provided. Cannot continue.")
        sys.exit(1)

    cfg["cookie"] = cookie
    cfg["cookie_saved_at"] = datetime.now(timezone.utc).isoformat()
    save_config(cfg)
    print("  Cookie saved to config.json (valid for ~50 min)")
    return cookie


# ─────────────────────────────────────────────
# Headers
# ─────────────────────────────────────────────

def make_headers(cookie, profile_key):
    return {
        "Content-Type":       "application/json",
        "Cookie":             cookie,
        "Referer":            f"{BASE_URL}/configure/{profile_key}",
        "Origin":             BASE_URL,
        "User-Agent":         (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/137.0.0.0 Safari/537.36"
        ),
        "Accept":             "application/json, */*",
        "Accept-Language":    "en-US,en;q=0.9",
        "Accept-Encoding":    "gzip, deflate, br",
        "sec-ch-ua":          '"Not)A;Brand";v="99", "Google Chrome";v="137"',
        "sec-ch-ua-mobile":   "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest":     "empty",
        "sec-fetch-mode":     "cors",
        "sec-fetch-site":     "same-origin",
    }


# ─────────────────────────────────────────────
# API helpers
# ─────────────────────────────────────────────

def api_get(path, headers, api_base):
    r = requests.get(f"{api_base}{path}", headers=headers)
    r.raise_for_status()
    return r.json()


def api_post(path, body, headers, api_base):
    r = requests.post(f"{api_base}{path}", headers=headers, json=body)
    r.raise_for_status()
    return r.json()


def api_put(path, body, headers, api_base):
    r = requests.put(f"{api_base}{path}", headers=headers, json=body)
    r.raise_for_status()
    return r.json() if r.text else {}


def api_delete(path, headers, api_base):
    r = requests.delete(f"{api_base}{path}", headers=headers)
    r.raise_for_status()


# ─────────────────────────────────────────────
# Xperience addon detection
# ─────────────────────────────────────────────

def detect_xperience_addon(headers, api_base):
    """Find the installed Xperience addon ID and transport URL from Wuplay."""
    data = api_get("", headers, api_base)
    for addon in data.get("addons", []):
        if addon.get("id", "").startswith("app.xperience."):
            transport = addon["url"].replace("/manifest.json", "")
            print(f"  Xperience addon found: {addon['id']}")
            return addon["id"], transport
    return None, None


# ─────────────────────────────────────────────
# Duplicate hub detection
# ─────────────────────────────────────────────

def get_existing_hubs(headers, api_base):
    """
    Return a dict of {hub_name_lower: hub_data} for all existing hubs.
    hub_data includes 'id' and 'existingSections' (set of section name lowercased).
    """
    data = api_get("/hubs", headers, api_base)
    result = {}
    for h in data:
        # Sections may be in 'customItems' or 'items' depending on hub type
        sections = h.get("customItems", []) or h.get("items", [])
        existing_sections = {s["name"].lower() for s in sections if "name" in s}
        result[h["name"].lower()] = {
            "id":               h["id"],
            "existingSections": existing_sections,
        }
    return result


def ask_duplicate_action(hub_name):
    """
    Ask the user what to do when a hub with this name already exists.
    Returns: 'replace', 'skip', or 'update'
    """
    print()
    print(f"  Hub '{hub_name}' already exists. What do you want to do?")
    print("    [r] Replace — delete the existing hub and recreate it from scratch")
    print("    [s] Skip    — leave it as-is and move on")
    print("    [u] Update  — add any missing sections into the existing hub")
    while True:
        choice = input("  Your choice (r/s/u): ").strip().lower()
        if choice in ("r", "s", "u"):
            return {"r": "replace", "s": "skip", "u": "update"}[choice]
        print("  Please enter r, s, or u.")


# ─────────────────────────────────────────────
# Hub & section operations
# ─────────────────────────────────────────────

def create_hub(name, headers, api_base):
    print(f"  Creating hub: {name}")
    data = api_post("/hubs", {
        "name":           name,
        "detailViewType": "poster_rows",
        "tileShape":      "landscape",
    }, headers, api_base)
    print(f"    Hub ID: {data['id']}")
    return data["id"]


def delete_hub(hub_id, headers, api_base):
    api_delete(f"/hubs/{hub_id}", headers, api_base)
    print(f"    Deleted hub {hub_id}")


def create_hub_item(hub_id, name, headers, api_base):
    data = api_post(f"/hubs/{hub_id}/items", {"name": name}, headers, api_base)
    return data["id"], data["layoutId"]


def update_hub_items(hub_id, items, headers, api_base):
    api_put(f"/hubs/{hub_id}", {
        "items": [{"slug": str(i["id"]), "name": i["name"]} for i in items]
    }, headers, api_base)


def upload_item_logo(hub_id, item_id, image_url, headers, api_base):
    if not image_url:
        return
    try:
        img_resp = requests.get(image_url, timeout=15)
        img_resp.raise_for_status()
        content_type = img_resp.headers.get("Content-Type", "image/webp")
        filename = image_url.split("/")[-1].split("?")[0] or "cover.webp"
        upload_headers = {k: v for k, v in headers.items() if k != "Content-Type"}
        files = {"file": (filename, img_resp.content, content_type)}
        r = requests.post(
            f"{api_base}/hubs/{hub_id}/items/{item_id}/logo",
            headers=upload_headers,
            files=files,
        )
        r.raise_for_status()
        result = r.json() if r.text else {}
        print(f"    Logo -> {result.get('logoUrl', 'uploaded')}")
    except Exception as e:
        print(f"    WARNING: Logo upload failed ({e})")


def update_item_meta(hub_id, item_id, name, hide_title, headers, api_base):
    api_put(f"/hubs/{hub_id}/items/{item_id}", {
        "name":     name,
        "showName": not hide_title,
    }, headers, api_base)


def add_catalogs_to_layout(layout_id, catalogs_payload, headers, api_base):
    if not catalogs_payload:
        return
    api_post(f"/layouts/{layout_id}/rows/addon-bulk",
             {"catalogs": catalogs_payload}, headers, api_base)


# ─────────────────────────────────────────────
# Data helpers
# ─────────────────────────────────────────────

def load_manifest_catalog_map(manifest_path):
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    catalog_map = {}
    for catalog in manifest.get("catalogs", []):
        key = (catalog["id"], catalog["type"])
        catalog_map[key] = {
            "name":  catalog.get("name", catalog["id"]),
            "extra": catalog.get("extra", []),
        }
    return catalog_map


def build_catalog_entry(source, catalog_map, addon_id, transport_url):
    catalog_id = source["catalogId"]
    media_type = source["type"]
    meta = catalog_map.get((catalog_id, media_type), {})
    return {
        "addonId":      addon_id,
        "catalogId":    catalog_id,
        "type":         media_type,
        "name":         meta.get("name", catalog_id),
        "transportUrl": transport_url,
        "addonName":    "Xperience",
        "extra":        meta.get("extra", []),
        "genres":       None,
    }


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    # ── Setup: load or prompt for config ──
    cfg = load_config()
    cfg = setup_prompt(cfg)

    profile_key     = cfg["profile_key"]
    collection_file = cfg["collection_file"]
    manifest_file   = cfg["manifest_file"]
    api_base        = f"{BASE_URL}/configure/api/{profile_key}"

    # ── Cookie (cached for 50 min) ──
    print()
    print("Checking cookie...")
    cookie  = resolve_cookie(cfg)
    HEADERS = make_headers(cookie, profile_key)

    # ── Auto-detect Xperience addon ──
    print("Detecting Xperience addon from Wuplay...")
    addon_id, transport_url = detect_xperience_addon(HEADERS, api_base)
    if not addon_id:
        print("ERROR: Xperience addon not found. Make sure it is installed in Wuplay.")
        sys.exit(1)

    # ── Load files ──
    print("Loading files...")
    with open(collection_file, encoding="utf-8") as f:
        collections = json.load(f)
    catalog_map = load_manifest_catalog_map(manifest_file)
    print(f"  {len(collections)} collections, {len(catalog_map)} catalog definitions")

    # ── Fetch existing hubs for duplicate check ──
    print("Checking existing hubs...")
    existing_hubs = get_existing_hubs(HEADERS, api_base)
    print(f"  {len(existing_hubs)} existing hub(s) found")
    print()

    # ── Process each collection ──
    for collection in collections:
        col_title = collection.get("title", "Untitled")
        folders   = collection.get("folders", [])
        print(f"Collection: {col_title} ({len(folders)} folders)")

        # Duplicate check
        hub_data    = existing_hubs.get(col_title.lower())
        existing_id = hub_data["id"] if hub_data else None

        if existing_id:
            action = ask_duplicate_action(col_title)
            if action == "skip":
                print(f"  Skipping '{col_title}'")
                print()
                continue
            elif action == "replace":
                print(f"  Replacing '{col_title}'...")
                delete_hub(existing_id, HEADERS, api_base)
                time.sleep(REQUEST_DELAY)
                hub_id = create_hub(col_title, HEADERS, api_base)
                time.sleep(REQUEST_DELAY)
                existing_sections = set()   # fresh hub — no existing sections
            elif action == "update":
                print(f"  Updating '{col_title}' (adding missing sections)...")
                hub_id = existing_id
                existing_sections = hub_data.get("existingSections", set())
        else:
            hub_id = create_hub(col_title, HEADERS, api_base)
            time.sleep(REQUEST_DELAY)
            existing_sections = set()

        hub_items = []

        for folder in folders:
            folder_name     = folder.get("title", "Untitled")
            catalog_sources = folder.get("catalogSources", [])
            cover_url       = folder.get("coverImageUrl")
            hide_title      = folder.get("hideTitle", False)

            # Skip sections that already exist in the hub (Update mode)
            if folder_name.lower() in existing_sections:
                print(f"  Section: {folder_name} — already exists, skipping")
                continue

            print(f"  Section: {folder_name} ({len(catalog_sources)} catalogs)")

            item_id, layout_id = create_hub_item(hub_id, folder_name, HEADERS, api_base)
            hub_items.append({"id": item_id, "name": folder_name})
            time.sleep(REQUEST_DELAY)

            update_hub_items(hub_id, hub_items, HEADERS, api_base)
            time.sleep(REQUEST_DELAY)

            if cover_url:
                print("    Uploading cover image...")
                upload_item_logo(hub_id, item_id, cover_url, HEADERS, api_base)
                time.sleep(REQUEST_DELAY)

            update_item_meta(hub_id, item_id, folder_name, hide_title, HEADERS, api_base)
            time.sleep(REQUEST_DELAY)

            seen = set()
            catalogs_payload = []
            for source in catalog_sources:
                key = (source["catalogId"], source["type"])
                if key in seen:
                    continue
                seen.add(key)
                catalogs_payload.append(
                    build_catalog_entry(source, catalog_map, addon_id, transport_url)
                )

            if catalogs_payload:
                print(f"    Adding {len(catalogs_payload)} catalogs...")
                add_catalogs_to_layout(layout_id, catalogs_payload, HEADERS, api_base)
                time.sleep(REQUEST_DELAY)

        added = len(hub_items)
        print(f"  Done: {added} section(s) added")
        print()

    print("All done! Open config.wuplay.app to see your new hubs.")


if __name__ == "__main__":
    main()
