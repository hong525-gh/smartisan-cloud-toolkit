[中文版](README_zh.md) | English

# Smartisan Notes Bulk Deleter (锤子便签批量删除助手)

A Tampermonkey userscript for batch-deleting notes from Smartisan Cloud (cloud.smartisan.com).

## Problem

Smartisan Notes cloud app does not provide a batch-delete feature. Deleting hundreds of notes one-by-one through the UI is tedious and time-consuming.

## Solution

This userscript adds a floating action button to the Smartisan Notes page. It reads your notes from the browser's IndexedDB, presents a searchable selection modal, and then automates the deletion by clicking through the web app's own UI — ensuring the deletion is properly synced to the server.

## Features

- Read all notes from local IndexedDB (no API calls needed)
- Search and filter notes by title
- Select notes individually, by folder, or select all
- Configurable delay between deletions to avoid rate-limiting
- Pause / Resume / Stop during deletion
- Progress panel with real-time status

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Open the [raw script](https://github.com/hong525/smartisan-notes-delete/raw/main/%E9%94%A4%E5%AD%90%E4%BE%BF%E7%AD%BE%E6%89%B9%E9%87%8F%E5%88%A0%E9%99%A4%E5%8A%A9%E6%89%8B.user.js) — Tampermonkey will prompt to install
3. Navigate to <https://cloud.smartisan.com/#/notes> and log in
4. Click the red trash icon in the bottom-right corner

## Usage

1. Click the red FAB → **Bulk Delete…**
2. Search/filter notes, check the ones to delete
3. Adjust the delay if needed (default: 4000 ms between deletions)
4. Click **Delete Selected** → confirm → the script will click through the UI automatically

## How It Works

1. Reads notes from `_pouch_note` and `_pouch_folder` IndexedDB stores
2. Presents a modal for selecting notes
3. For each selected note: finds the note in the Smartisan sidebar, clicks it, clicks the delete button, confirms the dialog — all with configurable delays

## Safety

- Default delay of 4 seconds between deletions to avoid rate-limiting
- Extra 8-second rest every 5 deletions
- Pause/Stop controls during deletion
- Confirmation dialog before starting

## License

MIT
