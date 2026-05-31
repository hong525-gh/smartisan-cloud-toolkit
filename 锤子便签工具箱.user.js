// ==UserScript==
// @name         锤子便签工具箱
// @name:en      Smartisan Notes Toolkit
// @namespace    https://github.com/hong525-gh/smartisan-cloud-toolkit
// @version      2.0.0
// @description  锤子便签一站式工具：导出（ZIP / 独立 .md，含图片）+ 批量删除（模拟点击逐条删除，带速率限制）。
// @description:en  Smartisan Notes all-in-one toolkit: export as ZIP / loose .md (with images) + bulk delete via simulated clicks with rate limiting.
// @author       hong525-gh
// @homepageURL  https://github.com/hong525-gh/smartisan-cloud-toolkit
// @supportURL   https://github.com/hong525-gh/smartisan-cloud-toolkit/issues
// @match        *://cloud.smartisan.com/*
// @match        *://cloud.smartisan.com/apps/note/*
// @match        *://note.smartisan.com/*
// @match        *://smartisan.com/apps/note/*
// @match        *://yun.smartisan.com/*
// @include      *://cloud.smartisan.com/?from=snote*
// @icon         https://cloud.smartisan.com/favicon.ico
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      cloud.smartisan.com
// @license      MIT
// ==/UserScript==

/* global GM_addStyle, GM_setValue, GM_getValue, GM_registerMenuCommand, GM_xmlhttpRequest */

(function () {
    'use strict';

    if (!/smartisan\.com/.test(location.hostname)) return;

    // Only activate on the notes page, not contacts or other sections
    if (location.hash && !location.hash.startsWith('#/notes')) return;

    // Whether we're inside the notes-app iframe — delete feature only works here.
    const isInIframe = (() => {
        try { return window.self !== window.top; } catch (_) { return true; }
    })();

    // ═══════════════════════════════════════════════════════════════
    //  Persistent settings (export)
    // ═══════════════════════════════════════════════════════════════

    const SETTINGS = {
        includeModifyTime: GM_getValue('includeModifyTime', true),
        includeCreateTime: GM_getValue('includeCreateTime', false),
        zipName: GM_getValue('zipName', 'smartisan-notes.zip'),
        customExportView: GM_getValue('customExportView', 'category'),
        includeImages: GM_getValue('includeImages', true),
    };

    function saveSetting(key, value) { SETTINGS[key] = value; GM_setValue(key, value); }

    // ═══════════════════════════════════════════════════════════════
    //  Unified CSS
    // ═══════════════════════════════════════════════════════════════

    const ROOT_ID       = 'snt-root';
    const FAB_EXPORT_ID = 'snt-fab-export';
    const FAB_DELETE_ID = 'snt-fab-delete';
    const MENU_EXPORT_ID = 'snt-menu-export';
    const MENU_DELETE_ID = 'snt-menu-delete';

    GM_addStyle(`
        /* ── FAB container ── */
        #${ROOT_ID} {
            position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        .snt-fab {
            position: absolute; right: 0;
            width: 48px; height: 48px; border-radius: 50%;
            color: #fff; border: none; cursor: pointer;
            box-shadow: 0 3px 10px rgba(0,0,0,0.22);
            display: flex; align-items: center; justify-content: center;
            transition: transform .18s ease, box-shadow .18s ease, background-color .18s ease;
            opacity: 0.85;
        }
        .snt-fab:hover  { opacity: 1; transform: translateY(-1px); box-shadow: 0 5px 14px rgba(0,0,0,0.28); }
        .snt-fab:active { transform: translateY(0); }
        .snt-fab[disabled] { opacity: 0.55; cursor: wait; transform: none; }
        .snt-fab svg { width: 22px; height: 22px; fill: currentColor; }

        #${FAB_EXPORT_ID} { bottom: 60px; background: #1aad19; }
        #${FAB_EXPORT_ID}:hover { background: #129611; }
        #${FAB_EXPORT_ID}:active { background: #3d8b40; }

        #${FAB_DELETE_ID} { bottom: 0; background: #e74c3c; font-size: 20px; }
        #${FAB_DELETE_ID}:hover { background: #c0392b; }
        #${FAB_DELETE_ID}.running { background: #f39c12; animation: sntPulse 1s infinite; }
        @keyframes sntPulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(243,156,18,0.4); }
            50%     { box-shadow: 0 0 0 10px rgba(243,156,18,0); }
        }

        /* ── Popup menus ── */
        .snt-menu {
            position: absolute; right: 0;
            min-width: 230px; background: #fff;
            border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
            padding: 6px; display: none; color: #333;
            transform-origin: bottom right;
            animation: sntPop .14s ease-out;
        }
        @keyframes sntPop {
            from { opacity: 0; transform: scale(.92); }
            to   { opacity: 1; transform: scale(1); }
        }
        .snt-menu.open { display: block; }
        #${MENU_EXPORT_ID} { bottom: 114px; }
        #${MENU_DELETE_ID} { bottom: 54px; }

        .snt-menu .snt-item {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            width: 100%; text-align: left; border: none; background: transparent;
            padding: 9px 12px; cursor: pointer; font-size: 13px; color: #333;
            border-radius: 6px; line-height: 1.3; box-sizing: border-box;
        }
        .snt-menu .snt-item:hover { background: #f3f5f7; }
        .snt-menu .snt-section-label {
            padding: 8px 12px 4px; font-size: 11px; color: #999;
            text-transform: uppercase; letter-spacing: .5px;
        }
        .snt-menu .snt-divider { height: 1px; background: #eee; margin: 4px 0; }
        .snt-menu .snt-check { color: #1aad19; font-weight: bold; }
        .snt-menu .snt-hint { color: #999; font-size: 11px; }
        .snt-menu .snt-status {
            padding: 8px 12px; font-size: 12px; color: #666;
            background: #f8f8f8; border-radius: 6px; margin-top: 4px; display: none;
        }
        .snt-menu .snt-status.show { display: block; }

        /* ── Export custom-select modal (sns- prefix, green accent) ── */
        #sns-modal-root {
            position: fixed; inset: 0; z-index: 2147483647; display: none;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #sns-modal-root.open { display: block; }
        #sns-modal-root .sns-overlay {
            position: absolute; inset: 0; background: rgba(0,0,0,0.45);
            display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;
        }
        #sns-modal-root .sns-modal {
            width: min(92vw, 460px); max-height: 80vh; background: #fff; border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden;
            color: #333; animation: sntPop .14s ease-out;
        }
        #sns-modal-root .sns-modal-header { padding: 14px 16px 10px; border-bottom: 1px solid #eee; }
        #sns-modal-root .sns-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        #sns-modal-root .sns-title { font-size: 15px; font-weight: 600; }
        #sns-modal-root .sns-close {
            border: none; background: transparent; font-size: 20px; line-height: 1;
            color: #999; cursor: pointer; padding: 2px 7px; border-radius: 6px;
        }
        #sns-modal-root .sns-close:hover { background: #f3f5f7; color: #333; }
        #sns-modal-root .sns-search {
            width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid #ddd;
            border-radius: 8px; font-size: 13px; outline: none;
        }
        #sns-modal-root .sns-search:focus { border-color: #1aad19; }
        #sns-modal-root .sns-viewtabs {
            display: flex; gap: 2px; margin-bottom: 10px; background: #f3f5f7;
            border-radius: 8px; padding: 2px;
        }
        #sns-modal-root .sns-tab {
            flex: 1; border: none; background: transparent; padding: 6px 10px;
            font-size: 12px; color: #666; cursor: pointer; border-radius: 6px;
            transition: background-color .15s ease, color .15s ease;
        }
        #sns-modal-root .sns-tab:hover { color: #333; }
        #sns-modal-root .sns-tab.active { background: #fff; color: #1aad19; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
        #sns-modal-root .sns-select-all { margin-top: 8px; }
        #sns-modal-root .sns-body { flex: 1; overflow-y: auto; padding: 6px 8px; }
        #sns-modal-root .sns-row {
            display: flex; align-items: center; gap: 8px; padding: 6px 8px;
            border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1.3; user-select: none;
        }
        #sns-modal-root .sns-row:hover { background: #f3f5f7; }
        #sns-modal-root .sns-row input[type="checkbox"] { width:15px; height:15px; accent-color:#1aad19; cursor:pointer; flex:none; margin:0; }
        #sns-modal-root .sns-folder-row { font-weight: 600; color: #333; }
        #sns-modal-root .sns-caret { width: 14px; text-align: center; color: #999; font-size: 10px; flex: none; }
        #sns-modal-root .sns-folder-count { color: #999; font-weight: 400; font-size: 12px; }
        #sns-modal-root .sns-note-row { padding-left: 30px; color: #555; }
        #sns-modal-root .view-order .sns-note-row { padding-left: 8px; }
        #sns-modal-root .sns-note-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #sns-modal-root .sns-note-time { flex: none; margin-left: 8px; color: #aaa; font-size: 11px; white-space: nowrap; }
        #sns-modal-root .sns-empty { padding: 28px 12px; text-align: center; color: #999; font-size: 13px; }
        #sns-modal-root .sns-modal-footer {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 12px 16px; border-top: 1px solid #eee;
        }
        #sns-modal-root .sns-count { font-size: 13px; color: #666; }
        #sns-modal-root .sns-actions { display: flex; gap: 8px; }
        #sns-modal-root .sns-btn {
            border: 1px solid #ddd; background: #fff; color: #333;
            padding: 7px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
            transition: background-color .15s ease, opacity .15s ease;
        }
        #sns-modal-root .sns-btn:hover { background: #f3f5f7; }
        #sns-modal-root .sns-btn-primary { background: #1aad19; border-color: #1aad19; color: #fff; }
        #sns-modal-root .sns-btn-primary:hover { background: #129611; }
        #sns-modal-root .sns-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

        /* ── Delete progress panel (snd- prefix, red accent) ── */
        #snd-progress-panel {
            position: fixed; top: 16px; right: 16px; z-index: 2147483647;
            background: #fff; border-radius: 10px; padding: 14px 18px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.18); display: none; width: 280px;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #snd-progress-panel.show { display: block; }
        #snd-progress-panel .snd-progress-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
        #snd-progress-panel .snd-progress-bar-bg { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
        #snd-progress-panel .snd-progress-bar-fill {
            height: 100%; background: #e74c3c; border-radius: 3px; transition: width .3s ease; width: 0%;
        }
        #snd-progress-panel .snd-progress-text { font-size: 12px; color: #666; margin-bottom: 6px; }
        #snd-progress-panel .snd-progress-btns { display: flex; gap: 6px; }
        #snd-progress-panel .snd-progress-btns button {
            flex: 1; padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
        }
        #snd-progress-panel .snd-btn-pause { background: #f39c12; color: #fff; }
        #snd-progress-panel .snd-btn-stop { background: #e74c3c; color: #fff; }

        /* ── Delete select modal (snd- prefix, red accent) ── */
        #snd-modal-root {
            position: fixed; inset: 0; z-index: 2147483646; display: none;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #snd-modal-root.open { display: block; }
        #snd-modal-root .snd-overlay {
            position: absolute; inset: 0; background: rgba(0,0,0,0.45);
            display: flex; align-items: center; justify-content: center;
        }
        #snd-modal-root .snd-modal {
            width: min(92vw, 640px); max-height: 82vh; background: #fff; border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden;
        }
        #snd-modal-root .snd-header { padding: 14px 16px 10px; border-bottom: 1px solid #eee; }
        #snd-modal-root .snd-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        #snd-modal-root .snd-title { font-size: 15px; font-weight: 600; }
        #snd-modal-root .snd-close {
            border: none; background: transparent; font-size: 20px; color: #999;
            cursor: pointer; padding: 2px 7px; border-radius: 6px;
        }
        #snd-modal-root .snd-close:hover { background: #f3f5f7; }
        #snd-modal-root .snd-search {
            width: 100%; box-sizing: border-box; padding: 7px 10px;
            border: 1px solid #ddd; border-radius: 8px; font-size: 13px;
        }
        #snd-modal-root .snd-search:focus { border-color: #e74c3c; }
        #snd-modal-root .snd-body { flex: 1; overflow-y: auto; padding: 6px 8px; color: #333; }
        #snd-modal-root .snd-row {
            display: flex; align-items: center; gap: 8px; padding: 6px 8px;
            border-radius: 6px; cursor: pointer; font-size: 13px;
        }
        #snd-modal-root .snd-row:hover { background: #fdf2f2; }
        #snd-modal-root .snd-row input[type="checkbox"] { width:15px; height:15px; accent-color:#e74c3c; cursor:pointer; flex:none; margin:0; }
        #snd-modal-root .snd-folder-row { font-weight: 600; }
        #snd-modal-root .snd-folder-row:hover { background: #f3f5f7; }
        #snd-modal-root .snd-caret { width: 14px; text-align: center; color: #999; font-size: 10px; flex: none; }
        #snd-modal-root .snd-folder-count { color: #999; font-weight: 400; font-size: 12px; }
        #snd-modal-root .snd-note-row { padding-left: 30px; color: #555; }
        #snd-modal-root .snd-note-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #snd-modal-root .snd-note-time { flex: none; color: #aaa; font-size: 11px; }
        #snd-modal-root .snd-empty { padding: 28px; text-align: center; color: #999; font-size: 13px; }
        #snd-modal-root .snd-footer {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 12px 16px; border-top: 1px solid #eee;
        }
        #snd-modal-root .snd-stats { font-size: 13px; color: #666; }
        #snd-modal-root .snd-actions { display: flex; gap: 8px; }
        #snd-modal-root .snd-btn {
            border: 1px solid #ddd; background: #fff; color: #333;
            padding: 7px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
        }
        #snd-modal-root .snd-btn:hover { background: #f3f5f7; }
        #snd-modal-root .snd-btn-danger { background: #e74c3c; border-color: #e74c3c; color: #fff; }
        #snd-modal-root .snd-btn-danger:hover { background: #c0392b; }
        #snd-modal-root .snd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #snd-modal-root .snd-select-all { margin-top: 8px; }
        #snd-modal-root .snd-delay-row {
            display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: #666;
        }
        #snd-modal-root .snd-delay-row input {
            width: 50px; padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; text-align: center;
        }
    `);

    // ═══════════════════════════════════════════════════════════════
    //  Shared: IndexedDB reader
    // ═══════════════════════════════════════════════════════════════

    function openDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 5);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
    }

    function getAllFromStore(db, storeName) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([storeName], 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
    }

    /**
     * Reads folders and notes from the Smartisan IndexedDB databases.
     * @returns {{ folderMap: Map<string,string>, notes: Array<{folderId:string, folder:string, title:string, detail:string, create_time:number, modify_time:number}> }}
     */
    async function loadNotesData() {
        const folderDb = await openDatabase('_pouch_folder');
        const noteDb   = await openDatabase('_pouch_note');
        try {
            const folderRows = await getAllFromStore(folderDb, 'by-sequence');
            const noteRows   = await getAllFromStore(noteDb,   'by-sequence');

            const folderMap = new Map();
            folderRows.forEach(item => {
                if (item.folder && !item._deleted) folderMap.set(item.folder.sync_id, item.folder.title);
            });

            const notes = [];
            noteRows.forEach(item => {
                if (!item.note || item._deleted) return;
                const n = item.note;
                notes.push({
                    folderId:    n.folderId,
                    folder:      folderMap.get(n.folderId) || 'Uncategorized',
                    title:       n.title || '(untitled)',
                    detail:      n.detail || '',
                    create_time: n.create_time || 0,
                    modify_time: n.modify_time || 0,
                });
            });
            return { folderMap, notes };
        } finally {
            folderDb.close();
            noteDb.close();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Shared: utilities
    // ═══════════════════════════════════════════════════════════════

    function safeName(s) {
        return String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function shortTime(ts) {
        if (!ts) return '';
        try {
            const d = new Date(ts);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getMonth()+1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (_) { return ''; }
    }

    function formatTime(ts) {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        } catch (_) { return String(ts); }
    }

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    /** Download a blob by creating a temporary anchor element (bypasses CSP issues). */
    function downloadBlob(blob, filename) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); resolve(); }, 1500);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Export engine
    // ═══════════════════════════════════════════════════════════════

    /** Build the { folderName: [{title, content, modify_time}] } structure used by the export pipeline. */
    async function buildExportData() {
        const { notes } = await loadNotesData();
        const data = {};
        notes.forEach(n => {
            if (!data[n.folder]) data[n.folder] = [];
            const headerLines = [];
            if (SETTINGS.includeModifyTime && n.modify_time) headerLines.push(`修改时间：${formatTime(n.modify_time)}`);
            if (SETTINGS.includeCreateTime && n.create_time) headerLines.push(`创建时间：${formatTime(n.create_time)}`);
            const header = headerLines.length ? headerLines.join('\n') + '\n\n' : '';
            data[n.folder].push({ title: n.title, content: header + n.detail, modify_time: n.modify_time });
        });
        return data;
    }

    function countNotes(notesData) {
        return Object.values(notesData).reduce((sum, arr) => sum + arr.length, 0);
    }

    // ── ZIP builder (STORE, no compression — zero external dependencies) ──

    const CRC32_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(u8) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i++) c = CRC32_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function buildStoreZip(files) {
        const enc = new TextEncoder();
        const now = new Date();
        const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | (Math.floor(now.getSeconds() / 2) & 0x1F);
        const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);
        const chunks = [], central = [];
        let offset = 0;

        files.forEach(f => {
            const nameBytes = enc.encode(f.path);
            const dataBytes = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(String(f.content == null ? '' : f.content));
            const crc = crc32(dataBytes);
            const lfh = new Uint8Array(30 + nameBytes.length);
            const dv = new DataView(lfh.buffer);
            dv.setUint32(0, 0x04034b50, true);
            dv.setUint16(4, 20, true);
            dv.setUint16(6, 0x0800, true);
            dv.setUint16(8, 0, true);
            dv.setUint16(10, dosTime, true);
            dv.setUint16(12, dosDate, true);
            dv.setUint32(14, crc, true);
            dv.setUint32(18, dataBytes.length, true);
            dv.setUint32(22, dataBytes.length, true);
            dv.setUint16(26, nameBytes.length, true);
            dv.setUint16(28, 0, true);
            lfh.set(nameBytes, 30);
            chunks.push(lfh, dataBytes);
            central.push({ nameBytes, crc, size: dataBytes.length, localOffset: offset });
            offset += lfh.byteLength + dataBytes.length;
        });

        const centralStart = offset;
        let centralSize = 0;
        central.forEach(e => {
            const cdh = new Uint8Array(46 + e.nameBytes.length);
            const dv = new DataView(cdh.buffer);
            dv.setUint32(0, 0x02014b50, true);
            dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
            dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true);
            dv.setUint16(12, dosTime, true); dv.setUint16(14, dosDate, true);
            dv.setUint32(16, e.crc, true); dv.setUint32(20, e.size, true);
            dv.setUint32(24, e.size, true); dv.setUint16(28, e.nameBytes.length, true);
            dv.setUint16(30, 0, true); dv.setUint16(32, 0, true);
            dv.setUint16(34, 0, true); dv.setUint16(36, 0, true);
            dv.setUint32(38, 0, true); dv.setUint32(42, e.localOffset, true);
            cdh.set(e.nameBytes, 46);
            chunks.push(cdh);
            centralSize += cdh.byteLength;
        });

        const eocd = new Uint8Array(22);
        const dvE = new DataView(eocd.buffer);
        dvE.setUint32(0, 0x06054b50, true); dvE.setUint16(4, 0, true);
        dvE.setUint16(6, 0, true); dvE.setUint16(8, central.length, true);
        dvE.setUint16(10, central.length, true); dvE.setUint32(12, centralSize, true);
        dvE.setUint32(16, centralStart, true); dvE.setUint16(20, 0, true);
        chunks.push(eocd);

        return new Blob(chunks, { type: 'application/zip' });
    }

    function buildFileList(notesData) {
        const files = [];
        Object.keys(notesData).forEach(category => {
            const cat = safeName(category);
            const used = new Map();
            notesData[category].forEach(note => {
                const base = safeName(note.title);
                const n = (used.get(base) || 0) + 1;
                used.set(base, n);
                files.push({ path: `${cat}/${n === 1 ? base : base + '_' + n}.md`, content: note.content });
            });
        });
        return files;
    }

    // ── Image handling ──

    const IMG_BASE   = 'https://cloud.smartisan.com/apps/note/notesimage/';
    const IMG_TAG_RE = /<image\b[^>]*>/gi;

    function parseImageTag(tag) {
        const name     = (tag.match(/\bname=([^\s>]+)/) || [])[1] || '';
        const describe = (tag.match(/\bdescribe=(.*?)\s+name=/) || [])[1] || '';
        return { name, describe: describe.trim() };
    }

    function collectImageNames(notesData) {
        const set = new Set();
        Object.values(notesData).forEach(arr => arr.forEach(note => {
            let m;
            const re = new RegExp(IMG_TAG_RE.source, 'gi');
            while ((m = re.exec(String(note.content || '')))) {
                const { name } = parseImageTag(m[0]);
                if (name) set.add(name);
            }
        }));
        return [...set];
    }

    function gmFetchBlob(url, name) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'arraybuffer', timeout: 30000,
                onload: r => {
                    if (r.status >= 200 && r.status < 300 && r.response) {
                        const ct = (String(r.responseHeaders || '').match(/content-type:\s*([^\r\n;]+)/i) || [])[1];
                        const mime = ct && /image\/[a-z0-9.+-]+/i.test(ct) ? ct.trim() : (() => {
                            const ext = (name.split('.').pop() || '').toLowerCase();
                            return ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', heic:'image/heic', bmp:'image/bmp' })[ext] || 'application/octet-stream';
                        })();
                        resolve({ bytes: new Uint8Array(r.response), mime });
                    } else { reject(new Error('HTTP ' + r.status)); }
                },
                onerror: () => reject(new Error('network error')),
                ontimeout: () => reject(new Error('timeout')),
            });
        });
    }

    async function downloadImages(names, onProgress) {
        const map = new Map();
        const queue = names.slice();
        let done = 0;
        const CONCURRENCY = 5;
        async function worker() {
            while (queue.length) {
                const name = queue.shift();
                try {
                    const { bytes, mime } = await gmFetchBlob(IMG_BASE + encodeURIComponent(name), name);
                    map.set(name, { bytes, mime, ok: true });
                } catch (err) {
                    console.warn('[snt] image failed:', name, err);
                    map.set(name, { ok: false });
                }
                done++;
                if (onProgress) onProgress(done, names.length);
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, names.length) }, worker));
        return map;
    }

    function bytesToBase64(bytes) {
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(bin);
    }

    function rewriteImages(notesData, opt) {
        Object.values(notesData).forEach(arr => arr.forEach(note => {
            note.content = String(note.content || '').replace(IMG_TAG_RE, tag => {
                const { name, describe } = parseImageTag(tag);
                if (!name) return tag;
                if (!opt.wantImages) return `![${describe}](${IMG_BASE}${encodeURIComponent(name)})`;
                const e = opt.imgMap.get(name);
                if (!e || !e.ok) return `[图片下载失败: ${name}]`;
                if (opt.mode === 'loose') return `![${describe}](data:${e.mime};base64,${bytesToBase64(e.bytes)})`;
                return `![${describe}](../images/${name})`;
            });
        }));
    }

    // ── Export: loose files ──

    async function exportAsLooseFiles(notesData) {
        const all = buildFileList(notesData).map(f => ({ name: f.path.replace(/\//g, '__'), content: f.content }));
        for (let i = 0; i < all.length; i++) {
            setExportFabBusy(`${i + 1}/${all.length}`);
            const blob = new Blob([all[i].content], { type: 'text/markdown;charset=utf-8' });
            await downloadBlob(blob, all[i].name);
            await wait(120);
        }
    }

    async function exportAsZip(notesData, imgMap) {
        setExportFabBusy('打包');
        const files = buildFileList(notesData);
        if (imgMap) imgMap.forEach((v, name) => { if (v && v.ok) files.push({ path: `images/${name}`, bytes: v.bytes }); });
        await wait(0);
        const blob = buildStoreZip(files);
        setExportFabBusy('下载');
        await downloadBlob(blob, SETTINGS.zipName);
    }

    /**
     * Main export flow.
     * @param {'zip'|'loose'} mode
     * @param {object} [notesData] — subset to export; if omitted, reads all notes from DB.
     */
    async function runExport(mode, notesData) {
        closeExportMenu();
        try {
            const isSubset = !!notesData;
            if (!isSubset) {
                setExportFabBusy('读取');
                notesData = await buildExportData();
            }
            const total = countNotes(notesData);
            if (total === 0) {
                alert(isSubset ? '未选择任何便签。' : '未找到任何便签，请确认已登录并已同步数据。');
                return;
            }
            if (!isSubset) {
                const label = mode === 'loose' ? '多个独立 .md' : 'ZIP';
                if (!confirm(`共找到 ${total} 条便签，分布在 ${Object.keys(notesData).length} 个分类中。\n导出模式：${label}\n是否继续？`)) return;
            }
            const wantImages = SETTINGS.includeImages;
            const imgNames = collectImageNames(notesData);
            let imgMap = new Map();
            if (wantImages && imgNames.length) {
                setExportFabBusy('图片');
                imgMap = await downloadImages(imgNames, (d, t) => setExportFabBusy(`图 ${d}/${t}`));
            }
            rewriteImages(notesData, { mode, wantImages, imgMap });
            if (mode === 'loose') await exportAsLooseFiles(notesData);
            else await exportAsZip(notesData, wantImages ? imgMap : null);
        } catch (err) {
            console.error('[snt] export failed:', err);
            alert(`导出失败: ${err && err.message ? err.message : err}\n详细信息见控制台。`);
        } finally {
            setExportFabBusy(null);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Export: custom-select modal
    // ═══════════════════════════════════════════════════════════════

    let exportModalState = null;

    function flattenExportData(notesData) {
        const flat = [];
        Object.keys(notesData).forEach(folder => {
            notesData[folder].forEach(note => { flat.push({ id: flat.length, folder, note }); });
        });
        return flat;
    }

    function buildSubset(flat, selected) {
        const out = {};
        flat.forEach(it => { if (selected.has(it.id)) (out[it.folder] || (out[it.folder] = [])).push(it.note); });
        return out;
    }

    function exportModalVisible() {
        const q = exportModalState.query.trim().toLowerCase();
        return q ? exportModalState.flat.filter(it => (it.note.title || '').toLowerCase().includes(q)) : exportModalState.flat;
    }

    function exportModalGroups() {
        const g = new Map();
        exportModalVisible().forEach(it => {
            if (!g.has(it.folder)) g.set(it.folder, []);
            g.get(it.folder).push(it);
        });
        return g;
    }

    function sortByTimeDesc(arr) {
        return arr.slice().sort((a, b) => (b.note.modify_time || 0) - (a.note.modify_time || 0));
    }

    function renderExportModal() {
        const root = document.getElementById('sns-modal-root');
        if (!root || !exportModalState) return;
        const body = root.querySelector('.sns-body');
        const vis = exportModalVisible();

        root.querySelectorAll('.sns-tab').forEach(t => t.classList.toggle('active', t.dataset.view === exportModalState.view));
        body.className = 'sns-body view-' + exportModalState.view;

        if (vis.length === 0) {
            body.innerHTML = '<div class="sns-empty">没有匹配的笔记</div>';
        } else if (exportModalState.view === 'order') {
            body.innerHTML = sortByTimeDesc(vis).map(it => `
                <div class="sns-row sns-note-row" data-id="${it.id}">
                    <input type="checkbox"${exportModalState.selected.has(it.id) ? ' checked' : ''} />
                    <span class="sns-note-title">${escapeHtml(it.note.title || '(无标题)')}</span>
                    <span class="sns-note-time">${shortTime(it.note.modify_time)}</span>
                </div>`).join('');
        } else {
            const groups = exportModalGroups();
            let html = '';
            groups.forEach((items, folder) => {
                const collapsed = exportModalState.collapsed.has(folder);
                const selCount = items.filter(it => exportModalState.selected.has(it.id)).length;
                html += `<div class="sns-row sns-folder-row" data-folder="${escapeHtml(folder)}">
                    <span class="sns-caret">${collapsed ? '▶' : '▼'}</span>
                    <input type="checkbox"${selCount === items.length ? ' checked' : ''} />
                    <span class="sns-note-title">${escapeHtml(folder)}</span>
                    <span class="sns-folder-count">(${selCount}/${items.length})</span>
                </div>`;
                if (!collapsed) sortByTimeDesc(items).forEach(it => {
                    html += `<div class="sns-row sns-note-row" data-id="${it.id}">
                        <input type="checkbox"${exportModalState.selected.has(it.id) ? ' checked' : ''} />
                        <span class="sns-note-title">${escapeHtml(it.note.title || '(无标题)')}</span>
                        <span class="sns-note-time">${shortTime(it.note.modify_time)}</span>
                    </div>`;
                });
            });
            body.innerHTML = html;
            const folderRows = body.querySelectorAll('.sns-folder-row');
            let i = 0;
            groups.forEach(items => {
                const selCount = items.filter(it => exportModalState.selected.has(it.id)).length;
                const cb = folderRows[i] && folderRows[i].querySelector('input[type="checkbox"]');
                if (cb) cb.indeterminate = selCount > 0 && selCount < items.length;
                i++;
            });
        }

        const sel = exportModalState.selected.size;
        root.querySelector('.sns-count').textContent = `已选 ${sel} 条`;
        root.querySelectorAll('.sns-actions .sns-btn').forEach(b => b.disabled = sel === 0);
        const allCb = root.querySelector('.sns-all-cb');
        const visSel = vis.filter(it => exportModalState.selected.has(it.id)).length;
        allCb.checked = vis.length > 0 && visSel === vis.length;
        allCb.indeterminate = visSel > 0 && visSel < vis.length;
    }

    function closeExportModal() {
        const root = document.getElementById('sns-modal-root');
        if (root) root.classList.remove('open');
    }

    function ensureExportModal() {
        let root = document.getElementById('sns-modal-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'sns-modal-root';
        root.innerHTML = `
            <div class="sns-overlay">
                <div class="sns-modal" role="dialog" aria-modal="true">
                    <div class="sns-modal-header">
                        <div class="sns-title-row">
                            <span class="sns-title">自定义导出</span>
                            <button class="sns-close" type="button" title="关闭">×</button>
                        </div>
                        <div class="sns-viewtabs">
                            <button class="sns-tab" type="button" data-view="category">按分类</button>
                            <button class="sns-tab" type="button" data-view="order">按顺序</button>
                        </div>
                        <input class="sns-search" type="text" placeholder="搜索笔记标题…" />
                        <div class="sns-row sns-select-all">
                            <input type="checkbox" class="sns-all-cb" /><span>全选（当前显示）</span>
                        </div>
                    </div>
                    <div class="sns-body"></div>
                    <div class="sns-modal-footer">
                        <span class="sns-count">已选 0 条</span>
                        <div class="sns-actions">
                            <button class="sns-btn" type="button" data-mode="loose" disabled>逐个导出</button>
                            <button class="sns-btn sns-btn-primary" type="button" data-mode="zip" disabled>打包 ZIP</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(root);

        const overlay = root.querySelector('.sns-overlay');
        const body    = root.querySelector('.sns-body');
        const search  = root.querySelector('.sns-search');

        root.querySelector('.sns-close').addEventListener('click', closeExportModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeExportModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('open')) closeExportModal(); });

        search.addEventListener('input', e => { exportModalState.query = e.target.value; renderExportModal(); });

        root.querySelector('.sns-viewtabs').addEventListener('click', e => {
            const tab = e.target.closest('.sns-tab');
            if (!tab || tab.dataset.view === exportModalState.view) return;
            exportModalState.view = tab.dataset.view;
            saveSetting('customExportView', exportModalState.view);
            renderExportModal();
        });

        root.querySelector('.sns-select-all').addEventListener('click', () => {
            const vis = exportModalVisible();
            const allSel = vis.length > 0 && vis.every(it => exportModalState.selected.has(it.id));
            vis.forEach(it => allSel ? exportModalState.selected.delete(it.id) : exportModalState.selected.add(it.id));
            renderExportModal();
        });

        body.addEventListener('click', e => {
            const row = e.target.closest('.sns-row');
            if (!row) return;
            if (e.target.closest('.sns-caret')) {
                const f = row.dataset.folder;
                exportModalState.collapsed.has(f) ? exportModalState.collapsed.delete(f) : exportModalState.collapsed.add(f);
                renderExportModal(); return;
            }
            if (row.classList.contains('sns-folder-row')) {
                const items = exportModalGroups().get(row.dataset.folder) || [];
                const allSel = items.length > 0 && items.every(it => exportModalState.selected.has(it.id));
                items.forEach(it => allSel ? exportModalState.selected.delete(it.id) : exportModalState.selected.add(it.id));
                renderExportModal();
            } else if (row.classList.contains('sns-note-row')) {
                const id = Number(row.dataset.id);
                exportModalState.selected.has(id) ? exportModalState.selected.delete(id) : exportModalState.selected.add(id);
                renderExportModal();
            }
        });

        root.querySelector('.sns-actions').addEventListener('click', e => {
            const btn = e.target.closest('.sns-btn');
            if (!btn || btn.disabled) return;
            const subset = buildSubset(exportModalState.flat, exportModalState.selected);
            closeExportModal();
            runExport(btn.dataset.mode, subset);
        });

        return root;
    }

    async function openCustomExport() {
        closeExportMenu();
        setExportFabBusy('读取');
        let data;
        try { data = await buildExportData(); } catch (err) {
            console.error('[snt] extract failed:', err);
            alert(`读取便签失败: ${err && err.message ? err.message : err}`);
            return;
        } finally { setExportFabBusy(null); }
        const total = countNotes(data);
        if (total === 0) { alert('未找到任何便签，请确认已登录并已同步数据。'); return; }
        const flat = flattenExportData(data);
        exportModalState = {
            flat, selected: new Set(flat.map(it => it.id)),
            collapsed: new Set(), query: '', view: SETTINGS.customExportView,
        };
        const root = ensureExportModal();
        root.querySelector('.sns-search').value = '';
        renderExportModal();
        root.classList.add('open');
        root.querySelector('.sns-search').focus();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Delete engine
    // ═══════════════════════════════════════════════════════════════

    const DELAY = {
        afterSelectNote: 1000, afterClickDelete: 1000, beforeConfirm: 800,
        afterConfirm: 4000, betweenBatches: 8000, batchSize: 5,
    };

    const SELECTOR = {
        deleteBtn:       '.delete-button-container .button-normal.button-red, [ng-click*="deleteBtnClick"]',
        dialogConfirm:   '.dialog.on .btn-primary, [ng-click*="dialogConfirm"]',
        dialogContainer: '.dialog.on',
    };

    // ── DOM helpers for the Angular notes-app iframe ──

    function findNoteElement(title) {
        // Primary: .note-item is the Angular ng-repeat element (see other_info.md)
        const noteItems = document.querySelectorAll('.note-item');
        for (const el of noteItems) {
            const titleEl = el.querySelector('.note-title span');
            const text = (titleEl || el).textContent.trim();
            if (text === title || text.includes(title) || title.includes(text)) return el;
        }
        // Fallback: broad search for any list item that contains the title
        const fallbackSelectors = [
            '.list-wrap .item', '[ng-repeat*="note" i]', '[ng-repeat*="item" i]',
            '[class*="note"][class*="item" i]', '[class*="list"] [class*="item" i]',
        ];
        const seen = new Set();
        for (const sel of fallbackSelectors) {
            for (const el of document.querySelectorAll(sel)) {
                if (seen.has(el)) continue;
                seen.add(el);
                const text = el.textContent.trim();
                if (text.includes(title) || title.includes(text)) return el;
            }
        }
        return null;
    }

    async function waitForDialog(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const dlg = document.querySelector(SELECTOR.dialogContainer);
            if (dlg && dlg.offsetParent !== null) return dlg;
            await wait(200);
        }
        return null;
    }

    async function waitForDialogGone(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const dlg = document.querySelector(SELECTOR.dialogContainer);
            if (!dlg || dlg.offsetParent === null) return true;
            await wait(300);
        }
        return false;
    }

    // ── Deletion loop ──

    let abortController = null;

    function updateDeleteProgress(done, total, currentTitle) {
        const panel = document.getElementById('snd-progress-panel');
        if (!panel) return;
        panel.querySelector('.snd-progress-bar-fill').style.width = Math.round((done / total) * 100) + '%';
        panel.querySelector('.snd-progress-text').textContent = `[${done}/${total}] ${currentTitle}`;
    }

    async function runDeletion(noteList) {
        const total = noteList.length;
        let done = 0, failed = 0;
        abortController = { aborted: false, paused: false };

        const panel = document.getElementById('snd-progress-panel');
        if (panel) { panel.classList.add('show'); panel.querySelector('.snd-progress-title').textContent = `Deleting ${total} notes…`; }

        for (let i = 0; i < total; i++) {
            while (abortController && abortController.paused) { await wait(500); if (!abortController || abortController.aborted) break; }
            if (!abortController || abortController.aborted) { console.log('[snt] Aborted at ' + done + '/' + total); break; }

            const note = noteList[i];
            updateDeleteProgress(done, total, note.title);

            try {
                const noteEl = findNoteElement(note.title);
                if (!noteEl) { console.warn('[snt] Note not found in DOM:', note.title); failed++; done++; continue; }
                noteEl.click();
                await wait(DELAY.afterSelectNote);

                const delBtn = document.querySelector(SELECTOR.deleteBtn);
                if (!delBtn) { console.warn('[snt] Delete button not found for:', note.title); failed++; done++; continue; }
                delBtn.click();

                const dlg = await waitForDialog(3000);
                if (!dlg) { console.warn('[snt] Dialog did not appear for:', note.title); failed++; done++; continue; }

                await wait(DELAY.beforeConfirm);
                const confirmBtn = document.querySelector(SELECTOR.dialogConfirm);
                if (!confirmBtn) { failed++; done++; continue; }
                confirmBtn.click();

                await waitForDialogGone(5000);
                await wait(DELAY.afterConfirm);
                done++;
            } catch (err) { console.error('[snt] Error deleting:', note.title, err); failed++; done++; }

            if (done > 0 && done % DELAY.batchSize === 0 && i < total - 1) {
                updateDeleteProgress(done, total, `(resting ${DELAY.betweenBatches / 1000}s…)`);
                await wait(DELAY.betweenBatches);
            }
        }

        if (panel) {
            panel.querySelector('.snd-progress-title').textContent = `Done: ${done} deleted` + (failed ? `, ${failed} failed` : '');
            panel.querySelector('.snd-progress-bar-fill').style.width = '100%';
            panel.querySelector('.snd-progress-text').textContent = failed ? `${failed} notes could not be deleted (not found in list)` : 'Refresh to update';
        }
        return { done, failed, aborted: abortController && abortController.aborted };
    }

    // ── Category detection & Trash navigation ──

    function detectCurrentCategory() {
        // The active folder item has class "on" — see other_info.md
        const activeFolder = document.querySelector('.folder-item.on');
        if (activeFolder) {
            const titleEl = activeFolder.querySelector('.folder-tit');
            if (titleEl) return titleEl.textContent.trim();
            // Fallback: strip count badge from full textContent
            const text = activeFolder.textContent.trim();
            return text.replace(/^[\d\s]+/, '').replace(/\s*\(\d+\)\s*$/, '');
        }
        return '全部便签';
    }

    function findSidebarItem(name) {
        // Direct class match for known special folders
        if (/回收站|trash|垃圾箱/i.test(name)) {
            const el = document.querySelector('.trash-can-folder');
            if (el) return el;
        }
        // General: search folder items by title text
        const folders = document.querySelectorAll('.folder-item');
        for (const el of folders) {
            const tit = el.querySelector('.folder-tit');
            const text = (tit || el).textContent.trim();
            if (text.includes(name) || name.includes(text)) return el;
        }
        return null;
    }

    async function navigateToTrash() {
        // Direct class-based lookup is most reliable
        const trashEl = document.querySelector('.trash-can-folder');
        if (trashEl) { trashEl.click(); await wait(3000); return true; }
        // Fallback: text-based search
        const el = findSidebarItem('回收站') || findSidebarItem('垃圾箱') || findSidebarItem('Trash');
        if (el) { el.click(); await wait(3000); return true; }
        return false;
    }

    const TRASH_NAMES = /回收站|垃圾箱|trash/i;

    async function runDeleteWithTrash(selectedNotes) {
        const currentCategory = detectCurrentCategory();
        const isTrash = TRASH_NAMES.test(currentCategory);

        // Phase 1: delete from current category (moves notes to Trash)
        const result1 = await runDeletion(selectedNotes);
        if (result1.aborted || result1.done === 0) {
            setDeleteFabRunning(false);
            abortController = null;
            return;
        }

        // Phase 2: navigate to Trash and permanently delete
        if (!isTrash) {
            const panel = document.getElementById('snd-progress-panel');
            if (panel) {
                panel.querySelector('.snd-progress-title').textContent = 'Phase 2: navigating to Trash…';
                panel.querySelector('.snd-progress-bar-fill').style.width = '0%';
            }
            const found = await navigateToTrash();
            if (!found) {
                console.warn('[snt] Could not find Trash in sidebar');
                setDeleteFabRunning(false);
                abortController = null;
                return;
            }
            await runDeletion(selectedNotes);
        }

        setDeleteFabRunning(false);
        abortController = null;
    }

    // ── Delete: progress panel ──

    function ensureDeleteProgressPanel() {
        if (document.getElementById('snd-progress-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'snd-progress-panel';
        panel.innerHTML = `
            <div class="snd-progress-title">Deleting…</div>
            <div class="snd-progress-bar-bg"><div class="snd-progress-bar-fill"></div></div>
            <div class="snd-progress-text"></div>
            <div class="snd-progress-btns">
                <button class="snd-btn-pause">Pause</button>
                <button class="snd-btn-stop">Stop</button>
            </div>`;
        document.body.appendChild(panel);
        panel.querySelector('.snd-btn-pause').addEventListener('click', () => {
            if (!abortController) return;
            abortController.paused = !abortController.paused;
            panel.querySelector('.snd-btn-pause').textContent = abortController.paused ? 'Resume' : 'Pause';
        });
        panel.querySelector('.snd-btn-stop').addEventListener('click', () => {
            if (abortController) { abortController.aborted = true; abortController.paused = false; }
            panel.querySelector('.snd-btn-pause').textContent = 'Pause';
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Delete: select modal
    // ═══════════════════════════════════════════════════════════════

    let deleteModalState = null;

    function deleteVisibleNotes() {
        const q = deleteModalState.query.trim().toLowerCase();
        return q ? deleteModalState.allNotes.filter(n => n.title.toLowerCase().includes(q)) : deleteModalState.allNotes;
    }

    function deleteGroupedNotes() {
        const g = new Map();
        deleteVisibleNotes().forEach(n => {
            if (!g.has(n.folder)) g.set(n.folder, []);
            g.get(n.folder).push(n);
        });
        return g;
    }

    function renderDeleteModal() {
        const root = document.getElementById('snd-modal-root');
        if (!root || !deleteModalState) return;
        const body = root.querySelector('.snd-body');
        const g = deleteGroupedNotes();
        const vis = deleteVisibleNotes();

        if (vis.length === 0) {
            body.innerHTML = '<div class="snd-empty">No matching notes</div>';
        } else {
            let h = '';
            g.forEach((items, folder) => {
                const collapsed = deleteModalState.collapsed.has(folder);
                const sel = items.filter(n => deleteModalState.selected.has(n.id)).length;
                h += `<div class="snd-row snd-folder-row" data-folder="${escapeHtml(folder)}">
                    <span class="snd-caret">${collapsed ? '▶' : '▼'}</span>
                    <input type="checkbox"${sel === items.length ? ' checked' : ''}/>
                    <span class="snd-note-title">${escapeHtml(folder)}</span>
                    <span class="snd-folder-count">(${sel}/${items.length})</span>
                </div>`;
                if (!collapsed) {
                    items.sort((a, b) => (b.modifyTime || 0) - (a.modifyTime || 0));
                    items.forEach(n => {
                        h += `<div class="snd-row snd-note-row" data-id="${n.id}">
                            <input type="checkbox"${deleteModalState.selected.has(n.id) ? ' checked' : ''}/>
                            <span class="snd-note-title">${escapeHtml(n.title)}</span>
                            <span class="snd-note-time">${shortTime(n.modifyTime)}</span>
                        </div>`;
                    });
                }
            });
            body.innerHTML = h;
            let idx = 0;
            g.forEach(items => {
                const sel = items.filter(n => deleteModalState.selected.has(n.id)).length;
                const row = body.querySelectorAll('.snd-folder-row')[idx];
                if (row) { const cb = row.querySelector('input[type="checkbox"]'); if (cb) cb.indeterminate = sel > 0 && sel < items.length; }
                idx++;
            });
        }

        const st = deleteModalState.selected.size;
        root.querySelector('.snd-stats').textContent = `Selected ${st} / ${deleteModalState.allNotes.length}`;
        root.querySelector('.snd-btn-danger').disabled = st === 0;
        const allCb = root.querySelector('.snd-all-cb');
        if (allCb) {
            const vs = vis.filter(n => deleteModalState.selected.has(n.id)).length;
            allCb.checked = vis.length > 0 && vs === vis.length;
            allCb.indeterminate = vs > 0 && vs < vis.length;
        }
    }

    function closeDeleteModal() {
        document.getElementById('snd-modal-root')?.classList.remove('open');
    }

    function ensureDeleteModal() {
        let r = document.getElementById('snd-modal-root');
        if (r) return r;
        r = document.createElement('div');
        r.id = 'snd-modal-root';
        r.innerHTML = `<div class="snd-overlay">
            <div class="snd-modal">
                <div class="snd-header">
                    <div class="snd-title-row">
                        <span class="snd-title">Bulk Delete Notes</span>
                        <button class="snd-close">×</button>
                    </div>
                    <input class="snd-search" placeholder="Search notes…"/>
                    <div class="snd-row snd-select-all">
                        <input type="checkbox" class="snd-all-cb"/><span>Select all (visible)</span>
                    </div>
                    <div class="snd-delay-row">
                        <span>Delay between deletes:</span>
                        <input type="number" class="snd-delay-ms" value="${DELAY.afterConfirm}" min="500" step="500"/>
                        <span>ms</span>
                    </div>
                </div>
                <div class="snd-body"></div>
                <div class="snd-footer">
                    <span class="snd-stats">Selected 0 / 0</span>
                    <div class="snd-actions">
                        <button class="snd-btn" data-act="cancel">Cancel</button>
                        <button class="snd-btn snd-btn-danger" data-act="go" disabled>Delete Selected</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(r);

        const overlay = r.querySelector('.snd-overlay');
        r.querySelector('.snd-close').addEventListener('click', closeDeleteModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDeleteModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDeleteModal(); });

        r.querySelector('.snd-search').addEventListener('input', e => { deleteModalState.query = e.target.value; renderDeleteModal(); });
        r.querySelector('.snd-delay-ms').addEventListener('change', e => {
            DELAY.afterConfirm = Math.max(500, parseInt(e.target.value, 10) || 2500);
        });

        r.querySelector('.snd-body').addEventListener('click', e => {
            const row = e.target.closest('.snd-row');
            if (!row) return;
            if (e.target.closest('.snd-caret')) {
                const f = row.dataset.folder;
                deleteModalState.collapsed.has(f) ? deleteModalState.collapsed.delete(f) : deleteModalState.collapsed.add(f);
                renderDeleteModal(); return;
            }
            if (row.classList.contains('snd-folder-row')) {
                const items = deleteGroupedNotes().get(row.dataset.folder) || [];
                const all = items.every(n => deleteModalState.selected.has(n.id));
                items.forEach(n => all ? deleteModalState.selected.delete(n.id) : deleteModalState.selected.add(n.id));
                renderDeleteModal();
            } else if (row.classList.contains('snd-note-row')) {
                const id = +row.dataset.id;
                deleteModalState.selected.has(id) ? deleteModalState.selected.delete(id) : deleteModalState.selected.add(id);
                renderDeleteModal();
            }
        });

        r.querySelector('.snd-select-all').addEventListener('click', () => {
            const v = deleteVisibleNotes();
            const all = v.every(n => deleteModalState.selected.has(n.id));
            v.forEach(n => all ? deleteModalState.selected.delete(n.id) : deleteModalState.selected.add(n.id));
            renderDeleteModal();
        });

        r.querySelector('.snd-actions').addEventListener('click', e => {
            const btn = e.target.closest('.snd-btn');
            if (!btn || btn.disabled) return;
            if (btn.dataset.act === 'cancel') { closeDeleteModal(); return; }
            if (btn.dataset.act === 'go') {
                const selected = deleteModalState.allNotes.filter(n => deleteModalState.selected.has(n.id));
                if (selected.length === 0) return;
                const ok = confirm(
                    `Delete ${selected.length} notes?\n\nThis will click through the Smartisan UI to delete each note one by one.\n\n⚠ Keep this tab active. The process runs at ~${Math.round(DELAY.afterConfirm/1000)}s per note and can be paused.\n\nFirst 10:\n${selected.slice(0, 10).map(n => '  – ' + n.title).join('\n')}${selected.length > 10 ? '\n  … and ' + (selected.length - 10) + ' more' : ''}`
                );
                if (!ok) return;
                closeDeleteModal();
                ensureDeleteProgressPanel();
                setDeleteFabRunning(true);
                runDeleteWithTrash(selected);
            }
        });
        return r;
    }

    async function openDeleteModal() {
        closeDeleteMenu();
        setDeleteFabBusy('load');
        const currentCategory = detectCurrentCategory();
        let allNotes;
        try {
            const { notes } = await loadNotesData();
            allNotes = notes.map((n, i) => ({
                id: i, folder: n.folder, title: n.title, modifyTime: n.modify_time,
            }));
        } catch (err) {
            console.error('[snt]', err);
            alert('Failed to load notes: ' + (err.message || err));
            setDeleteFabBusy(null);
            return;
        }
        // Filter by current category (unless viewing "all" or a special category)
        if (currentCategory !== '全部便签' && currentCategory !== 'All Notes' &&
            !/加星|star/i.test(currentCategory) && !TRASH_NAMES.test(currentCategory)) {
            allNotes = allNotes.filter(n => n.folder === currentCategory);
        }
        if (allNotes.length === 0) { alert(`No notes found in "${currentCategory}".`); setDeleteFabBusy(null); return; }
        deleteModalState = { allNotes, selected: new Set(), collapsed: new Set(), query: '' };
        const r = ensureDeleteModal();
        r.querySelector('.snd-search').value = '';
        r.querySelector('.snd-delay-ms').value = DELAY.afterConfirm;
        renderDeleteModal();
        r.classList.add('open');
        setDeleteFabBusy(null);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Unified FAB + Menu
    // ═══════════════════════════════════════════════════════════════

    const ICON_DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

    // ── Export FAB busy state ──

    function setExportFabBusy(label) {
        const fab = document.getElementById(FAB_EXPORT_ID);
        if (!fab) return;
        if (label) {
            fab.disabled = true;
            fab.title = label;
            fab.innerHTML = `<span style="font-size:11px;line-height:1;text-align:center;color:#fff;padding:2px 4px;">${label}</span>`;
        } else {
            fab.disabled = false;
            fab.title = '锤子便签导出';
            fab.innerHTML = ICON_DOWNLOAD_SVG;
        }
    }

    // ── Delete FAB states ──

    function setDeleteFabBusy(label) {
        const fab = document.getElementById(FAB_DELETE_ID);
        if (!fab) return;
        if (label) { fab.disabled = true; fab.title = label; }
        else { fab.disabled = false; fab.title = 'Delete Notes'; fab.innerHTML = '🗑'; }
    }

    function setDeleteFabRunning(running) {
        const fab = document.getElementById(FAB_DELETE_ID);
        if (!fab) return;
        if (running) {
            fab.classList.add('running');
            fab.innerHTML = '⏳';
            fab.title = 'Deleting…';
            fab.disabled = false;
            fab.onclick = () => {
                if (!abortController) return;
                abortController.paused = !abortController.paused;
                fab.innerHTML = abortController.paused ? '▶' : '⏳';
                const btn = document.querySelector('#snd-progress-panel .snd-btn-pause');
                if (btn) btn.textContent = abortController.paused ? 'Resume' : 'Pause';
            };
        } else {
            fab.classList.remove('running');
            fab.innerHTML = '🗑';
            fab.title = 'Delete Notes';
            fab.disabled = false;
            fab.onclick = () => toggleDeleteMenu();
        }
    }

    // ── Export menu ──

    function buildExportMenuHtml() {
        const tMod  = SETTINGS.includeModifyTime ? '<span class="snt-check">✓</span>' : '';
        const tCre  = SETTINGS.includeCreateTime ? '<span class="snt-check">✓</span>' : '';
        const tImg  = SETTINGS.includeImages     ? '<span class="snt-check">✓</span>' : '';
        return `
            <div class="snt-section-label">Export</div>
            <button class="snt-item" data-act="export-all"><span>全部导出为 ZIP</span><span class="snt-hint">Shift+Click</span></button>
            <button class="snt-item" data-act="export-custom"><span>自定义导出…</span><span class="snt-hint">选择笔记</span></button>
            <div class="snt-divider"></div>
            <div class="snt-section-label">Options</div>
            <button class="snt-item" data-act="opt-modify">  <span>包含修改时间</span>${tMod}</button>
            <button class="snt-item" data-act="opt-create">  <span>包含创建时间</span>${tCre}</button>
            <button class="snt-item" data-act="opt-images">  <span>包含图片（联网下载）</span>${tImg}</button>
            <button class="snt-item" data-act="opt-zipname"><span>设置 ZIP 文件名…</span></button>
            <div id="snt-status" class="snt-status"></div>`;
    }

    function renderExportMenu() {
        const menu = document.getElementById(MENU_EXPORT_ID);
        if (menu) menu.innerHTML = buildExportMenuHtml();
    }

    function openExportMenu()  { const m = document.getElementById(MENU_EXPORT_ID); if (m) { renderExportMenu(); m.classList.add('open'); } }
    function closeExportMenu() { const m = document.getElementById(MENU_EXPORT_ID); if (m) m.classList.remove('open'); }
    function toggleExportMenu() { const m = document.getElementById(MENU_EXPORT_ID); if (m) { m.classList.contains('open') ? closeExportMenu() : openExportMenu(); } }

    function handleExportMenuAction(act) {
        switch (act) {
            case 'export-all':    runExport('zip'); break;
            case 'export-custom': openCustomExport(); break;
            case 'opt-modify':
                saveSetting('includeModifyTime', !SETTINGS.includeModifyTime); renderExportMenu(); break;
            case 'opt-create':
                saveSetting('includeCreateTime', !SETTINGS.includeCreateTime); renderExportMenu(); break;
            case 'opt-images':
                saveSetting('includeImages', !SETTINGS.includeImages); renderExportMenu(); break;
            case 'opt-zipname': {
                const v = prompt('ZIP 文件名：', SETTINGS.zipName);
                if (v) saveSetting('zipName', v.trim());
                break;
            }
        }
    }

    // ── Delete menu ──

    function openDeleteMenu()  { const m = document.getElementById(MENU_DELETE_ID); if (m) m.classList.add('open'); }
    function closeDeleteMenu() { const m = document.getElementById(MENU_DELETE_ID); if (m) m.classList.remove('open'); }
    function toggleDeleteMenu() { const m = document.getElementById(MENU_DELETE_ID); if (m) { m.classList.contains('open') ? closeDeleteMenu() : openDeleteMenu(); } }

    // ── Build both FABs ──

    function ensureFab() {
        if (!document.body) return;
        const existing = document.querySelectorAll('#' + ROOT_ID);
        if (existing.length === 1) return;
        existing.forEach(el => el.remove());

        const root = document.createElement('div');
        root.id = ROOT_ID;

        // Export FAB + menu (always)
        let html = `
            <div id="${MENU_EXPORT_ID}" class="snt-menu"></div>
            <button id="${FAB_EXPORT_ID}" class="snt-fab" type="button" title="锤子便签导出">${ICON_DOWNLOAD_SVG}</button>`;

        // Delete FAB + menu (iframe only)
        if (isInIframe) {
            html += `
            <div id="${MENU_DELETE_ID}" class="snt-menu">
                <div class="snt-section-label">Delete</div>
                <button class="snt-item" data-act="delete-open">🗑 批量删除…</button>
                <div class="snt-section-label" style="font-size:11px;color:#999;white-space:normal;text-transform:none;letter-spacing:0;">
                    Select notes → confirm → auto‑click Smartisan UI
                </div>
            </div>
            <button id="${FAB_DELETE_ID}" class="snt-fab" type="button" title="Delete Notes">🗑</button>`;
        }

        root.innerHTML = html;
        document.body.appendChild(root);

        // Export FAB events
        const fabExport = root.querySelector('#' + FAB_EXPORT_ID);
        const menuExport = root.querySelector('#' + MENU_EXPORT_ID);
        renderExportMenu();

        fabExport.addEventListener('click', e => {
            if (fabExport.disabled) return;
            if (e.shiftKey) { closeExportMenu(); runExport('zip'); }
            else toggleExportMenu();
        });
        fabExport.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (!fabExport.disabled) { closeExportMenu(); runExport('zip'); }
        });
        menuExport.addEventListener('click', e => {
            const btn = e.target.closest('.snt-item');
            if (!btn) return;
            handleExportMenuAction(btn.dataset.act);
        });

        // Delete FAB events (iframe only)
        if (isInIframe) {
            const fabDelete = root.querySelector('#' + FAB_DELETE_ID);
            const menuDelete = root.querySelector('#' + MENU_DELETE_ID);
            fabDelete.onclick = () => toggleDeleteMenu();
            menuDelete.addEventListener('click', e => {
                const btn = e.target.closest('.snt-item');
                if (btn && btn.dataset.act === 'delete-open') openDeleteModal();
            });
        }

        // Global: close menus on outside click / Escape
        document.addEventListener('click', e => {
            if (!root.contains(e.target)) { closeExportMenu(); closeDeleteMenu(); }
        }, true);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { closeExportMenu(); closeDeleteMenu(); }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Startup
    // ═══════════════════════════════════════════════════════════════

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureFab);
    } else {
        ensureFab();
    }

    // SPA re-injection guard
    new MutationObserver(() => {
        if (!document.body) return;
        if (document.querySelectorAll('#' + ROOT_ID).length !== 1) ensureFab();
    }).observe(document.body || document.documentElement, { childList: true, subtree: false });

    // Tampermonkey menu commands (export only — delete requires the notes-app iframe)
    GM_registerMenuCommand('全部导出为 ZIP', () => runExport('zip'));
    GM_registerMenuCommand('自定义导出…（选择笔记）', () => openCustomExport());
    GM_registerMenuCommand(`${SETTINGS.includeModifyTime ? '✅' : '⬜'} 包含修改时间`,
        () => { saveSetting('includeModifyTime', !SETTINGS.includeModifyTime); renderExportMenu(); alert('已切换'); });
    GM_registerMenuCommand(`${SETTINGS.includeCreateTime ? '✅' : '⬜'} 包含创建时间`,
        () => { saveSetting('includeCreateTime', !SETTINGS.includeCreateTime); renderExportMenu(); alert('已切换'); });
    GM_registerMenuCommand(`${SETTINGS.includeImages ? '✅' : '⬜'} 包含图片（联网下载）`,
        () => { saveSetting('includeImages', !SETTINGS.includeImages); renderExportMenu(); alert('已切换'); });
    GM_registerMenuCommand('设置 ZIP 文件名', () => {
        const v = prompt('ZIP 文件名：', SETTINGS.zipName);
        if (v) saveSetting('zipName', v);
    });

})();
