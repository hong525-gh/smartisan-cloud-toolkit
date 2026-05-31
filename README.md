[中文版](README_zh.md) | English

# Smartisan Notes Toolkit

A collection of userscripts (Tampermonkey / Greasemonkey) for Smartisan Cloud (cloud.smartisan.com). Install via [Tampermonkey](https://www.tampermonkey.net/) or any compatible userscript manager.

> The "Smartisan Notes Toolkit" script is based on [anyuxurl/smartisan-notes-export](https://github.com/anyuxurl/smartisan-notes-export).

## Scripts

### 1. Smartisan Notes Toolkit (Export + Delete)

**File**: `锤子便签工具箱.user.js`

Combined export and bulk-delete functionality for the notes page (`#/notes`). Two floating buttons in the bottom-right corner:

| Button | Color | Feature |
|---|---|---|
| ⬇ | Green | Export notes (ZIP / loose .md with images) |
| 🗑 | Red | Bulk-delete notes (simulated clicks, iframe only) |

**Export**:
- Export all as ZIP (custom STORE-mode ZIP builder, zero dependencies)
- Custom export: select notes by category or list order
- Image download with base64 inline support
- Optional timestamps (modify time, create time)
- Shift + Click the green button to quick-export all as ZIP

**Delete**:
- Reads notes from IndexedDB
- Filter by category, search by title
- Simulates clicks through the Smartisan UI one by one
- Two-phase deletion: current category → auto-navigate to Trash → permanent delete
- Pause / Resume / Stop controls

**Install**: Install `锤子便签工具箱.user.js`, then visit <https://cloud.smartisan.com/?from=snote#/notes>.

---

### 2. Smartisan Notes Contact Deleter

**File**: `锤子便签联系人删除助手.user.js`

Bulk-delete contacts on the contacts page (`#/contacts`).

- Red FAB button, scroll-collects all contacts via virtual scrolling
- Confirms then simulates clicks: select contact → Edit → Delete Contact → Confirm
- Handles the virtual-scroll list automatically
- Pause / Resume / Stop controls

**Install**: Install `锤子便签联系人删除助手.user.js`, then visit <https://cloud.smartisan.com/?from=snote#/contacts>.

---

## Tested On

- Google Chrome 148.0.7778.96 (Official Build) (64-bit) with Tampermonkey

## License

MIT
