// ==UserScript==
// @name         锤子便签批量删除助手
// @name:en     Smartisan Notes Bulk Deleter
// @namespace   https://github.com/hong525-gh/smartisan-notes-delete
// @version     1.0.0
// @description  批量删除锤子便签：读取便签列表，勾选后通过模拟点击自动逐条删除。带速率限制，避免被标记为爬虫。
// @author      hong525-gh
// @homepageURL https://github.com/hong525-gh/smartisan-notes-delete
// @supportURL  https://github.com/hong525-gh/smartisan-notes-delete/issues
// @match       *://cloud.smartisan.com/*
// @match       *://note.smartisan.com/*
// @match       *://yun.smartisan.com/*
// @match       *://cloud.smartisan.com/apps/note/*
// @match       *://smartisan.com/apps/note/*
// @icon        https://cloud.smartisan.com/favicon.ico
// @run-at      document-end
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==

/* global GM_addStyle, GM_setValue, GM_getValue */

(function () {
    'use strict';

    // Only run inside the notes-app iframe (cloud_app_notes).
    // The parent-page injection is a no-op.
    try { if (window.self === window.top) return; } catch (_) { return; }

    // -------- 可配置延迟（毫秒）--------
    const DELAY = {
        afterSelectNote: 1000,   // 选中便签后等待 UI 响应
        afterClickDelete: 1000,  // 点击删除按钮后等待对话框出现
        beforeConfirm: 800,      // 对话框出现后等待动画完成
        afterConfirm: 4000,      // 确认后等待删除请求完成
        betweenBatches: 8000,    // 每 N 条之后额外休息
        batchSize: 5,            // 每 N 条休息一次
    };

    // -------- CSS 选择器（从 Smartisan Angular 模板提取）--------
    const SELECTOR = {
        noteListItem: '.note-list .item, .list-wrap .item, [ng-repeat*="note"]',
        deleteBtn: '.delete-button-container .button-normal.button-red, [ng-click*="deleteBtnClick"]',
        dialogConfirm: '.dialog.on .btn-primary, [ng-click*="dialogConfirm"]',
        dialogCancel: '.dialog.on .btn-default, [ng-click*="dialogCancel"]',
        dialogContainer: '.dialog.on',
        noteTitle: '.item-title, .note-title, [ng-bind*="title"]',
    };

    // -------- 样式 --------
    const ROOT_ID = 'snd-root';
    const FAB_ID = 'snd-fab';
    const MENU_ID = 'snd-menu';
    const MODAL_ID = 'snd-modal-root';
    const PANEL_ID = 'snd-progress-panel';

    GM_addStyle(`
        #${ROOT_ID} {
            position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #${FAB_ID} {
            width: 48px; height: 48px; border-radius: 50%;
            background: #e74c3c; color: white; border: none; cursor: pointer;
            box-shadow: 0 3px 10px rgba(0,0,0,0.22);
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; transition: transform .15s ease;
        }
        #${FAB_ID}:hover { background: #c0392b; transform: translateY(-1px); }
        #${FAB_ID}:active { transform: translateY(0); }
        #${FAB_ID}[disabled] { opacity: 0.5; cursor: wait; }
        #${FAB_ID}.running { background: #f39c12; animation: sndPulse 1s infinite; }
        @keyframes sndPulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(243,156,18,0.4); }
            50% { box-shadow: 0 0 0 10px rgba(243,156,18,0); }
        }

        #${MENU_ID} {
            position: absolute; right: 0; bottom: 60px;
            min-width: 180px; background: #fff;
            border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
            padding: 6px; display: none; color: #333;
            transform-origin: bottom right;
            animation: sndPop .14s ease-out;
        }
        @keyframes sndPop {
            from { opacity: 0; transform: scale(.92); }
            to   { opacity: 1; transform: scale(1); }
        }
        #${MENU_ID}.open { display: block; }
        #${MENU_ID} button {
            display: flex; align-items: center; gap: 8px;
            width: 100%; text-align: left; border: none; background: transparent;
            padding: 10px 14px; cursor: pointer; font-size: 13px;
            color: #333; border-radius: 6px;
        }
        #${MENU_ID} button:hover { background: #f3f5f7; }
        #${MENU_ID} .snd-menu-label {
            padding: 6px 14px 2px; font-size: 11px; color: #999;
        }

        /* 进度面板 */
        #${PANEL_ID} {
            position: fixed; top: 16px; right: 16px; z-index: 2147483647;
            background: #fff; border-radius: 10px; padding: 14px 18px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.18);
            display: none; width: 280px;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #${PANEL_ID}.show { display: block; }
        #${PANEL_ID} .snd-progress-title {
            font-size: 14px; font-weight: 600; margin-bottom: 8px;
        }
        #${PANEL_ID} .snd-progress-bar-bg {
            height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-bottom: 6px;
        }
        #${PANEL_ID} .snd-progress-bar-fill {
            height: 100%; background: #e74c3c; border-radius: 3px;
            transition: width .3s ease; width: 0%;
        }
        #${PANEL_ID} .snd-progress-text {
            font-size: 12px; color: #666; margin-bottom: 6px;
        }
        #${PANEL_ID} .snd-progress-btns { display: flex; gap: 6px; }
        #${PANEL_ID} .snd-progress-btns button {
            flex: 1; padding: 6px 12px; border: none; border-radius: 6px;
            cursor: pointer; font-size: 12px;
        }
        #${PANEL_ID} .snd-btn-pause { background: #f39c12; color: #fff; }
        #${PANEL_ID} .snd-btn-stop { background: #e74c3c; color: #fff; }

        /* 模态框 */
        #${MODAL_ID} {
            position: fixed; inset: 0; z-index: 2147483646;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #${MODAL_ID}.open { display: block; }
        #${MODAL_ID} .snd-overlay {
            position: absolute; inset: 0;
            background: rgba(0,0,0,0.45);
            display: flex; align-items: center; justify-content: center;
        }
        #${MODAL_ID} .snd-modal {
            width: min(92vw, 640px); max-height: 82vh;
            background: #fff; border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.28);
            display: flex; flex-direction: column; overflow: hidden;
        }
        #${MODAL_ID} .snd-header {
            padding: 14px 16px 10px; border-bottom: 1px solid #eee;
        }
        #${MODAL_ID} .snd-title-row {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 8px;
        }
        #${MODAL_ID} .snd-title { font-size: 15px; font-weight: 600; }
        #${MODAL_ID} .snd-close {
            border: none; background: transparent; font-size: 20px;
            color: #999; cursor: pointer; padding: 2px 7px; border-radius: 6px;
        }
        #${MODAL_ID} .snd-close:hover { background: #f3f5f7; }
        #${MODAL_ID} .snd-search {
            width: 100%; box-sizing: border-box; padding: 7px 10px;
            border: 1px solid #ddd; border-radius: 8px; font-size: 13px;
        }
        #${MODAL_ID} .snd-search:focus { border-color: #e74c3c; }
        #${MODAL_ID} .snd-body {
            flex: 1; overflow-y: auto; padding: 6px 8px; color: #333;
        }
        #${MODAL_ID} .snd-row {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px;
        }
        #${MODAL_ID} .snd-row:hover { background: #fdf2f2; }
        #${MODAL_ID} .snd-row input[type="checkbox"] {
            width: 15px; height: 15px; accent-color: #e74c3c;
            cursor: pointer; flex: none; margin: 0;
        }
        #${MODAL_ID} .snd-folder-row { font-weight: 600; }
        #${MODAL_ID} .snd-folder-row:hover { background: #f3f5f7; }
        #${MODAL_ID} .snd-caret { width: 14px; text-align: center; color: #999; font-size: 10px; flex: none; }
        #${MODAL_ID} .snd-folder-count { color: #999; font-weight: 400; font-size: 12px; }
        #${MODAL_ID} .snd-note-row { padding-left: 30px; color: #555; }
        #${MODAL_ID} .snd-note-title {
            flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #${MODAL_ID} .snd-note-time { flex: none; color: #aaa; font-size: 11px; }
        #${MODAL_ID} .snd-empty { padding: 28px; text-align: center; color: #999; font-size: 13px; }
        #${MODAL_ID} .snd-footer {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 12px 16px; border-top: 1px solid #eee;
        }
        #${MODAL_ID} .snd-stats { font-size: 13px; color: #666; }
        #${MODAL_ID} .snd-actions { display: flex; gap: 8px; }
        #${MODAL_ID} .snd-btn {
            border: 1px solid #ddd; background: #fff; color: #333;
            padding: 7px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
        }
        #${MODAL_ID} .snd-btn:hover { background: #f3f5f7; }
        #${MODAL_ID} .snd-btn-danger {
            background: #e74c3c; border-color: #e74c3c; color: #fff;
        }
        #${MODAL_ID} .snd-btn-danger:hover { background: #c0392b; }
        #${MODAL_ID} .snd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #${MODAL_ID} .snd-select-all { margin-top: 8px; }
        #${MODAL_ID} .snd-delay-row {
            display: flex; align-items: center; gap: 6px;
            margin-top: 8px; font-size: 12px; color: #666;
        }
        #${MODAL_ID} .snd-delay-row input {
            width: 50px; padding: 3px 5px; border: 1px solid #ddd;
            border-radius: 4px; font-size: 12px; text-align: center;
        }
    `);

    // -------- IndexedDB 读取 --------
    function openDB(name) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(name, 5);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
    }

    function getAllWithKeys(db, storeName) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([storeName], 'readonly');
            const results = [];
            const req = tx.objectStore(storeName).openCursor();
            req.onerror = () => reject(req.error);
            req.onsuccess = (ev) => {
                const c = ev.target.result;
                if (c) { results.push({ k: c.key, v: c.value }); c.continue(); }
                else resolve(results);
            };
        });
    }

    async function loadNotes() {
        const fDb = await openDB('_pouch_folder');
        const nDb = await openDB('_pouch_note');
        try {
            const fRows = await getAllWithKeys(fDb, 'by-sequence');
            const nRows = await getAllWithKeys(nDb, 'by-sequence');

            const folderMap = new Map();
            fRows.forEach(({ v }) => {
                if (v.folder && !v._deleted) folderMap.set(v.folder.sync_id, v.folder.title);
            });

            const list = [];
            nRows.forEach(({ v }) => {
                if (!v.note || v._deleted) return;
                const n = v.note;
                list.push({
                    id: list.length,
                    folder: folderMap.get(n.folderId) || 'Uncategorized',
                    title: n.title || '(untitled)',
                    modifyTime: n.modify_time || 0,
                });
            });
            return list;
        } finally { fDb.close(); nDb.close(); }
    }

    // -------- DOM 操作（脚本已注入到 iframe 内，直接用 document）--------
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    function qs(sel) { return document.querySelector(sel); }
    function qsa(sel) { return document.querySelectorAll(sel); }

    function findNoteElement(title) {
        // Broad search: try known Smartisan selectors, then fall back
        // to scanning every element that looks like a list item.
        const selectors = [
            '.note-list .item',
            '.list-wrap .item',
            '[ng-repeat*="note" i]',
            '[ng-repeat*="item" i]',
            '.sidenav .item',
            '.sidebar .item',
            '[class*="note"][class*="item" i]',
            '[class*="list"] [class*="item" i]',
            '[ng-click]',
        ];
        const seen = new Set();
        for (const sel of selectors) {
            const items = document.querySelectorAll(sel);
            for (const el of items) {
                if (seen.has(el)) continue;
                seen.add(el);
                const text = el.textContent.trim();
                if (text.includes(title) || title.includes(text)) {
                    return el;
                }
            }
        }
        // XPath fallback: find any element whose text exactly matches
        try {
            const xpath = `.//*[normalize-space(text())="${title.replace(/"/g, '&quot;')}"]`;
            const result = document.evaluate(
                xpath, document.body, null,
                XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            if (result.singleNodeValue) return result.singleNodeValue;
        } catch (_) { /* ignore */ }

        return null;
    }

    function clickDeleteBtn() {
        const btn = qs(SELECTOR.deleteBtn);
        if (!btn) return false;
        btn.click();
        return true;
    }

    async function clickDialogConfirm() {
        await wait(DELAY.beforeConfirm);
        const btn = qs(SELECTOR.dialogConfirm);
        if (!btn) return false;
        btn.click();
        return true;
    }

    async function waitForDialog(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const dlg = qs(SELECTOR.dialogContainer);
            if (dlg && dlg.offsetParent !== null) return dlg;
            await wait(200);
        }
        return null;
    }

    async function waitForDialogGone(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const dlg = qs(SELECTOR.dialogContainer);
            if (!dlg || dlg.offsetParent === null) return true;
            await wait(300);
        }
        return false;
    }

    // -------- 逐条删除引擎 --------
    let abortController = null; // { aborted: false, paused: false }

    function updateProgress(done, total, currentTitle) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const pct = Math.round((done / total) * 100);
        panel.querySelector('.snd-progress-bar-fill').style.width = pct + '%';
        panel.querySelector('.snd-progress-text').textContent =
            `[${done}/${total}] ${currentTitle}`;
    }

    /**
     * Deletes notes one by one by clicking through the Smartisan UI.
     * Respects rate limits: pauses between deletions and stops when
     * the abortController signals.
     *
     * @param {Array} noteList — selected notes from loadNotes()
     */
    async function runDeletion(noteList) {
        const total = noteList.length;
        let done = 0;
        let failed = 0;
        abortController = { aborted: false, paused: false };

        const panel = document.getElementById(PANEL_ID);
        if (panel) {
            panel.classList.add('show');
            panel.querySelector('.snd-progress-title').textContent =
                `Deleting ${total} notes…`;
        }

        for (let i = 0; i < total; i++) {
            // --- check abort/pause ---
            while (abortController && abortController.paused) {
                await wait(500);
                if (!abortController || abortController.aborted) break;
            }
            if (!abortController || abortController.aborted) {
                console.log('[snd] Aborted at ' + done + '/' + total);
                break;
            }

            const note = noteList[i];
            updateProgress(done, total, note.title);

            try {
                // 1) Find and click the note in the sidebar
                const noteEl = findNoteElement(note.title);
                if (!noteEl) {
                    console.warn('[snd] Note not found in DOM:', note.title);
                    failed++;
                    done++;
                    continue;
                }
                noteEl.click();
                await wait(DELAY.afterSelectNote);

                // 2) Click delete button
                const deleted = clickDeleteBtn();
                if (!deleted) {
                    console.warn('[snd] Delete button not found for:', note.title);
                    failed++;
                    done++;
                    continue;
                }

                // 3) Wait for confirmation dialog
                const dlg = await waitForDialog(3000);
                if (!dlg) {
                    console.warn('[snd] Dialog did not appear for:', note.title);
                    failed++;
                    done++;
                    continue;
                }

                // 4) Click confirm
                await clickDialogConfirm();

                // 5) Wait for dialog to close (deletion in progress)
                await waitForDialogGone(5000);
                await wait(DELAY.afterConfirm);

                done++;
            } catch (err) {
                console.error('[snd] Error deleting:', note.title, err);
                failed++;
                done++;
            }

            // Periodic extra rest
            if (done > 0 && done % DELAY.batchSize === 0 && i < total - 1) {
                updateProgress(done, total, `(resting ${DELAY.betweenBatches / 1000}s…)`);
                await wait(DELAY.betweenBatches);
            }
        }

        // --- done ---
        if (panel) {
            panel.querySelector('.snd-progress-title').textContent =
                `Done: ${done} deleted` + (failed ? `, ${failed} failed` : '');
            panel.querySelector('.snd-progress-bar-fill').style.width = '100%';
            panel.querySelector('.snd-progress-text').textContent =
                failed ? `${failed} notes could not be deleted (not found in list)` : 'Refresh to update';
        }
        setFabRunning(false);
        abortController = null;
    }

    // -------- 模态框 --------
    let modalState = null; // { allNotes, selected:Set, collapsed:Set, query:'' }

    function visibleNotes() {
        const q = modalState.query.trim().toLowerCase();
        if (!q) return modalState.allNotes;
        return modalState.allNotes.filter(n => n.title.toLowerCase().includes(q));
    }

    function groupedNotes() {
        const g = new Map();
        visibleNotes().forEach(n => {
            if (!g.has(n.folder)) g.set(n.folder, []);
            g.get(n.folder).push(n);
        });
        return g;
    }

    function shortTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getMonth()+1}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function renderModal() {
        const root = document.getElementById(MODAL_ID);
        if (!root || !modalState) return;
        const body = root.querySelector('.snd-body');
        const g = groupedNotes();
        const vis = visibleNotes();

        if (vis.length === 0) {
            body.innerHTML = '<div class="snd-empty">No matching notes</div>';
        } else {
            let h = '';
            g.forEach((items, folder) => {
                const collapsed = modalState.collapsed.has(folder);
                const sel = items.filter(n => modalState.selected.has(n.id)).length;
                h += `<div class="snd-row snd-folder-row" data-folder="${esc(folder)}">
                    <span class="snd-caret">${collapsed?'▶':'▼'}</span>
                    <input type="checkbox"${sel===items.length?' checked':''}/>
                    <span class="snd-note-title">${esc(folder)}</span>
                    <span class="snd-folder-count">(${sel}/${items.length})</span>
                </div>`;
                if (!collapsed) {
                    items.sort((a,b)=>(b.modifyTime||0)-(a.modifyTime||0));
                    items.forEach(n => {
                        h += `<div class="snd-row snd-note-row" data-id="${n.id}">
                            <input type="checkbox"${modalState.selected.has(n.id)?' checked':''}/>
                            <span class="snd-note-title">${esc(n.title)}</span>
                            <span class="snd-note-time">${shortTime(n.modifyTime)}</span>
                        </div>`;
                    });
                }
            });
            body.innerHTML = h;

            let idx = 0;
            g.forEach((items) => {
                const sel = items.filter(n => modalState.selected.has(n.id)).length;
                const row = body.querySelectorAll('.snd-folder-row')[idx];
                if (row) {
                    const cb = row.querySelector('input[type="checkbox"]');
                    if (cb) cb.indeterminate = sel > 0 && sel < items.length;
                }
                idx++;
            });
        }

        const st = modalState.selected.size;
        root.querySelector('.snd-stats').textContent = `Selected ${st} / ${modalState.allNotes.length}`;
        root.querySelector('.snd-btn-danger').disabled = st === 0;
        const allCb = root.querySelector('.snd-all-cb');
        if (allCb) {
            const vs = vis.filter(n=>modalState.selected.has(n.id)).length;
            allCb.checked = vis.length>0 && vs===vis.length;
            allCb.indeterminate = vs>0 && vs<vis.length;
        }
    }

    function closeModal() {
        document.getElementById(MODAL_ID)?.classList.remove('open');
    }

    function ensureModal() {
        let r = document.getElementById(MODAL_ID);
        if (r) return r;
        r = document.createElement('div');
        r.id = MODAL_ID;
        r.innerHTML = `<div class="snd-overlay">
            <div class="snd-modal">
                <div class="snd-header">
                    <div class="snd-title-row">
                        <span class="snd-title">Bulk Delete Notes</span>
                        <button class="snd-close">×</button>
                    </div>
                    <input class="snd-search" placeholder="Search notes…"/>
                    <div class="snd-row snd-select-all">
                        <input type="checkbox" class="snd-all-cb"/>
                        <span>Select all (visible)</span>
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
        r.querySelector('.snd-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target===overlay) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

        r.querySelector('.snd-search').addEventListener('input', e => {
            modalState.query = e.target.value; renderModal();
        });

        r.querySelector('.snd-delay-ms').addEventListener('change', e => {
            DELAY.afterConfirm = Math.max(500, parseInt(e.target.value, 10) || 2500);
        });

        r.querySelector('.snd-body').addEventListener('click', e => {
            const row = e.target.closest('.snd-row');
            if (!row) return;
            if (e.target.closest('.snd-caret')) {
                const f = row.dataset.folder;
                modalState.collapsed.has(f) ? modalState.collapsed.delete(f) : modalState.collapsed.add(f);
                renderModal(); return;
            }
            if (row.classList.contains('snd-folder-row')) {
                const items = groupedNotes().get(row.dataset.folder) || [];
                const all = items.every(n=>modalState.selected.has(n.id));
                items.forEach(n=>all?modalState.selected.delete(n.id):modalState.selected.add(n.id));
                renderModal();
            } else if (row.classList.contains('snd-note-row')) {
                const id = +row.dataset.id;
                modalState.selected.has(id) ? modalState.selected.delete(id) : modalState.selected.add(id);
                renderModal();
            }
        });

        r.querySelector('.snd-select-all').addEventListener('click', () => {
            const v = visibleNotes();
            const all = v.every(n=>modalState.selected.has(n.id));
            v.forEach(n=>all?modalState.selected.delete(n.id):modalState.selected.add(n.id));
            renderModal();
        });

        r.querySelector('.snd-actions').addEventListener('click', e => {
            const btn = e.target.closest('.snd-btn');
            if (!btn || btn.disabled) return;
            if (btn.dataset.act === 'cancel') { closeModal(); return; }
            if (btn.dataset.act === 'go') {
                const selected = modalState.allNotes.filter(n => modalState.selected.has(n.id));
                if (selected.length === 0) return;
                const ok = confirm(
                    `Delete ${selected.length} notes?\n\nThis will click through the Smartisan UI to delete each note one by one.\n\n⚠ Keep this tab active. The process runs at ~${Math.round(DELAY.afterConfirm/1000)}s per note and can be paused.\n\nFirst 10:\n${selected.slice(0,10).map(n=>'  – '+n.title).join('\n')}${selected.length>10?'\n  … and '+(selected.length-10)+' more':''}`
                );
                if (!ok) return;
                closeModal();
                setFabRunning(true);
                runDeletion(selected);
            }
        });
        return r;
    }

    async function openModal() {
        closeMenu();
        setFabBusy('load');
        let notes;
        try { notes = await loadNotes(); }
        catch (err) {
            console.error('[snd]', err);
            alert('Failed to load notes: ' + (err.message||err));
            setFabBusy(null);
            return;
        }
        if (notes.length === 0) {
            alert('No notes found. Please log in and sync first.');
            setFabBusy(null);
            return;
        }
        modalState = {
            allNotes: notes,
            selected: new Set(),
            collapsed: new Set(),
            query: '',
        };
        const r = ensureModal();
        r.querySelector('.snd-search').value = '';
        r.querySelector('.snd-delay-ms').value = DELAY.afterConfirm;
        renderModal();
        r.classList.add('open');
    }

    // -------- FAB --------
    function getFab() { return document.getElementById(FAB_ID); }

    function setFabBusy(label) {
        const fab = getFab();
        if (!fab) return;
        if (label) { fab.disabled = true; fab.title = label; }
        else { fab.disabled = false; fab.title = 'Delete Notes'; fab.innerHTML = '🗑'; }
    }

    function setFabRunning(running) {
        const fab = getFab();
        if (!fab) return;
        if (running) { fab.classList.add('running'); fab.innerHTML = '⏳'; fab.title = 'Deleting…'; fab.disabled = false; }
        else { fab.classList.remove('running'); fab.innerHTML = '🗑'; fab.title = 'Delete Notes'; fab.disabled = false; }
        // 给 FAB 加点击：运行中暂停/恢复
        if (running) {
            fab.onclick = () => {
                if (!abortController) return;
                abortController.paused = !abortController.paused;
                fab.innerHTML = abortController.paused ? '▶' : '⏳';
            };
        } else {
            fab.onclick = () => toggleMenu();
        }
    }

    function openMenu() {
        const m = document.getElementById(MENU_ID);
        if (m) m.classList.add('open');
    }
    function closeMenu() {
        const m = document.getElementById(MENU_ID);
        if (m) m.classList.remove('open');
    }
    function toggleMenu() {
        const m = document.getElementById(MENU_ID);
        if (!m) return;
        m.classList.contains('open') ? closeMenu() : openMenu();
    }

    function ensureFab() {
        if (!document.body) return;
        document.querySelectorAll('#' + ROOT_ID).forEach(el => el.remove());

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <div id="${PANEL_ID}">
                <div class="snd-progress-title">Deleting…</div>
                <div class="snd-progress-bar-bg"><div class="snd-progress-bar-fill"></div></div>
                <div class="snd-progress-text"></div>
                <div class="snd-progress-btns">
                    <button class="snd-btn-pause">Pause</button>
                    <button class="snd-btn-stop">Stop</button>
                </div>
            </div>
            <div id="${MENU_ID}">
                <div class="snd-menu-label">Delete</div>
                <button data-act="open">🗑 Bulk Delete…</button>
                <div class="snd-menu-label" style="font-size:11px;color:#999;white-space:normal;">
                    Select notes → confirm → auto‑click Smartisan UI
                </div>
            </div>
            <button id="${FAB_ID}">🗑</button>
        `;
        document.body.appendChild(root);

        // Progress panel buttons
        const panel = root.querySelector('#' + PANEL_ID);
        panel.querySelector('.snd-btn-pause').addEventListener('click', () => {
            if (!abortController) return;
            abortController.paused = !abortController.paused;
            const fab = getFab();
            if (fab) { fab.innerHTML = abortController.paused ? '▶' : '⏳'; }
            panel.querySelector('.snd-btn-pause').textContent =
                abortController.paused ? 'Resume' : 'Pause';
        });
        panel.querySelector('.snd-btn-stop').addEventListener('click', () => {
            if (abortController) { abortController.aborted = true; abortController.paused = false; }
            panel.querySelector('.snd-btn-pause').textContent = 'Pause';
        });

        // Menu
        const menu = root.querySelector('#' + MENU_ID);
        const fab = root.querySelector('#' + FAB_ID);
        fab.onclick = () => toggleMenu();
        menu.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.act === 'open') openModal();
        });
        document.addEventListener('click', e => {
            if (!root.contains(e.target)) closeMenu();
        }, true);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeMenu();
        });
    }

    // -------- 启动 --------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureFab);
    } else {
        ensureFab();
    }
    new MutationObserver(() => {
        if (document.body && document.querySelectorAll('#' + ROOT_ID).length !== 1) ensureFab();
    }).observe(document.body || document.documentElement, { childList: true, subtree: false });
})();
