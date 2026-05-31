// ==UserScript==
// @name         锤子便签联系人删除助手
// @name:en      Smartisan Notes Contact Deleter
// @namespace    https://github.com/hong525-gh/smartisan-notes-delete
// @version      1.0.0
// @description  批量删除锤子便签联系人：滚动收集全部联系人，勾选后通过模拟点击自动逐条删除。带速率限制与暂停/恢复。
// @description:en  Bulk-delete Smartisan contacts: scroll-collect all contacts, select, then auto-click through the UI one by one. Rate-limited with pause/resume.
// @author       hong525-gh
// @homepageURL  https://github.com/hong525-gh/smartisan-notes-delete
// @supportURL   https://github.com/hong525-gh/smartisan-notes-delete/issues
// @match        *://cloud.smartisan.com/*
// @include      *://cloud.smartisan.com/?from=snote*
// @icon         https://cloud.smartisan.com/favicon.ico
// @run-at       document-end
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

/* global GM_addStyle */

(function () {
    'use strict';

    // ── Run only on the parent page, on the contacts section ──
    try { if (window.self !== window.top) return; } catch (_) { return; }
    if (!/#\/contacts/.test(location.hash)) return;

    // ── iframe access ──
    const IFRAME_ID = 'cloud_app_contacts';

    /** Returns the contacts iframe's document, or null if not ready. */
    function getDoc() {
        const iframe = document.getElementById(IFRAME_ID);
        if (!iframe) return null;
        try { return iframe.contentDocument || iframe.contentWindow.document; }
        catch (_) { return null; }
    }

    function qs(sel)  { const d = getDoc(); return d ? d.querySelector(sel) : null; }
    function qsa(sel) { const d = getDoc(); return d ? d.querySelectorAll(sel) : []; }

    /** Wait until the iframe document is ready (non-empty body). */
    async function waitForDoc(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const doc = getDoc();
            if (doc && doc.body && doc.querySelector('.contact-item')) return doc;
            await new Promise(r => setTimeout(r, 500));
        }
        return null;
    }

    // ── Delays ──
    const DELAY = {
        afterSelectContact: 1500,
        afterClickEdit:     1000,
        afterClickDelete:   1000,
        beforeConfirm:      800,
        afterConfirm:       4000,
        betweenBatches:     8000,
        batchSize:          5,
        scrollStep:         400,
        scrollWait:         500,
    };

    // ── Click helper (runs INSIDE the iframe's JS context) ──
    /**
     * Inject a click function into the iframe's own global scope.
     * Synthetic clicks from the parent page cannot trigger Angular's zone.js
     * inside the iframe, even with the iframe's own MouseEvent constructor.
     * The click must be dispatched from code running *inside* the iframe.
     */
    function ensureIframeClickHelper() {
        const doc = getDoc();
        if (!doc) return null;
        const win = doc.defaultView;
        if (!win.__sccClick) {
            win.__sccClick = win.eval(`(function(el) {
                if (!el) return;
                var r = el.getBoundingClientRect();
                var x = r.left + r.width / 2;
                var y = r.top + r.height / 2;
                var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
                // Full pointer + mouse sequence to simulate a real click
                try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(_) {}
                try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(_) {}
                try { el.click(); } catch(_) {}
            })`);
        }
        if (!win.__sccSelectContact) {
            win.__sccSelectContact = win.eval(`(function(el) {
                if (!el) return false;
                // Try 1: full pointer + mouse event sequence
                var r = el.getBoundingClientRect();
                var x = r.left + r.width / 2;
                var y = r.top + r.height / 2;
                var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
                try { el.focus(); } catch(_) {}
                try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(_) {}
                try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(_) {}
                try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(_) {}
                // Try 2: native click
                try { el.click(); } catch(_) {}
                // Try 3: Angular dev-mode probe
                try {
                    var debugEl = ng.probe(el);
                    if (debugEl && debugEl.componentInstance) {
                        var cmp = debugEl.componentInstance;
                        if (typeof cmp.onSelect === 'function') cmp.onSelect();
                        else if (typeof cmp.select === 'function') cmp.select();
                        else if (typeof cmp.onClick === 'function') cmp.onClick();
                        else if (typeof cmp.handleClick === 'function') cmp.handleClick();
                    }
                } catch(_) {}
                // Try 4: trigger Angular change detection
                try {
                    var appEl = document.querySelector('.layout-wrapper') || document.body;
                    var appDebug = ng.probe(appEl);
                    if (appDebug) {
                        var appRef = appDebug.injector.get(
                            appDebug.injector.get(
                                ng.coreTokens && ng.coreTokens.ApplicationRef
                            ).constructor
                        );
                    }
                } catch(_) {}
                return true;
            })`);
        }
        return win.__sccSelectContact;
    }

    function selectContact(el) {
        const fn = ensureIframeClickHelper();
        if (fn) fn(el);
    }

    /** Click helper for edit/delete/confirm buttons (works fine already). */
    function iframeClick(el) {
        if (!el) return;
        const doc = getDoc();
        if (!doc) return;
        const win = doc.defaultView;
        if (!win.__sccButtonClick) {
            win.__sccButtonClick = win.eval(`(function(el) {
                if (!el) return;
                try { el.click(); } catch (_) {}
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            })`);
        }
        win.__sccButtonClick(el);
    }

    // ── Selectors (queried inside the iframe) ──
    const S = {
        contactItem:   '.contact-item',
        contactInner:  '.contact-inner',
        contactLabel:  '.contact-content label',
        editButton:    '.edit-button.button',
        deleteButton:  '.delete-button.button.button-red',
        confirmDialog: '.dialog-content',
        confirmButton: '.confirm-btn',
        virtualScroll: 'virtual-scroll',
        slimScrollDiv: '.slimScrollDiv',
    };

    // ── CSS (injected into the parent page) ──
    const ROOT_ID  = 'scc-root';
    const FAB_ID   = 'scc-fab';
    const MENU_ID  = 'scc-menu';
    const PANEL_ID = 'scc-progress-panel';

    GM_addStyle(`
        #${ROOT_ID} {
            position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #${FAB_ID} {
            width: 48px; height: 48px; border-radius: 50%;
            background: #e74c3c; color: #fff; border: none; cursor: pointer;
            box-shadow: 0 3px 10px rgba(0,0,0,0.22);
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; transition: transform .15s ease; opacity: 0.85;
        }
        #${FAB_ID}:hover  { background: #c0392b; opacity: 1; transform: translateY(-1px); }
        #${FAB_ID}:active { transform: translateY(0); }
        #${FAB_ID}[disabled] { opacity: 0.5; cursor: wait; }
        #${FAB_ID}.running { background: #f39c12; animation: sccPulse 1s infinite; }
        @keyframes sccPulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(243,156,18,0.4); }
            50%     { box-shadow: 0 0 0 10px rgba(243,156,18,0); }
        }
        #${MENU_ID} {
            position: absolute; right: 0; bottom: 60px;
            min-width: 200px; background: #fff;
            border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
            padding: 6px; display: none; color: #333;
            transform-origin: bottom right;
            animation: sccPop .14s ease-out;
        }
        @keyframes sccPop {
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
        #${MENU_ID} .scc-menu-label {
            padding: 6px 14px 2px; font-size: 11px; color: #999;
        }
        #${PANEL_ID} {
            position: fixed; top: 16px; right: 16px; z-index: 2147483647;
            background: #fff; border-radius: 10px; padding: 14px 18px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.18);
            display: none; width: 280px;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        }
        #${PANEL_ID}.show { display: block; }
        #${PANEL_ID} .scc-progress-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
        #${PANEL_ID} .scc-progress-bar-bg { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
        #${PANEL_ID} .scc-progress-bar-fill { height: 100%; background: #e74c3c; border-radius: 3px; transition: width .3s ease; width: 0%; }
        #${PANEL_ID} .scc-progress-text { font-size: 12px; color: #666; margin-bottom: 6px; }
        #${PANEL_ID} .scc-progress-btns { display: flex; gap: 6px; }
        #${PANEL_ID} .scc-progress-btns button {
            flex: 1; padding: 6px 12px; border: none; border-radius: 6px;
            cursor: pointer; font-size: 12px;
        }
        #${PANEL_ID} .scc-btn-pause { background: #f39c12; color: #fff; }
        #${PANEL_ID} .scc-btn-stop  { background: #e74c3c; color: #fff; }
    `);

    // ── Contact collection (operates inside iframe) ──

    async function scrollAndCollectContacts(onTick) {
        await waitForDoc(10000);
        const vs      = qs(S.virtualScroll);
        const slimDiv = qs(S.slimScrollDiv);
        if (!vs && !slimDiv) {
            const labels = qsa(S.contactLabel);
            return [...new Set([...labels].map(l => l.textContent.trim()).filter(Boolean))];
        }

        const seen = new Set();
        let prevSize = 0, noChange = 0, maxSteps = 300;

        for (let i = 0; i < maxSteps; i++) {
            qsa(S.contactLabel).forEach(l => {
                const name = l.textContent.trim();
                if (name) seen.add(name);
            });
            if (onTick) onTick(seen.size);

            if (seen.size === prevSize) {
                noChange++;
                if (noChange >= 5) break;
            } else {
                noChange = 0;
                prevSize = seen.size;
            }

            if (vs) {
                vs.scrollTop = (vs.scrollTop || 0) + DELAY.scrollStep;
                vs.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            if (slimDiv) {
                slimDiv.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: DELAY.scrollStep, deltaMode: 0,
                    bubbles: true, cancelable: true,
                }));
            }
            await new Promise(r => setTimeout(r, DELAY.scrollWait));
        }

        if (vs) { vs.scrollTop = 0; vs.dispatchEvent(new Event('scroll', { bubbles: true })); }
        if (slimDiv) {
            slimDiv.dispatchEvent(new WheelEvent('wheel', {
                deltaY: -99999, deltaMode: 0, bubbles: true, cancelable: true,
            }));
        }
        await new Promise(r => setTimeout(r, 300));
        return [...seen];
    }

    // ── Deletion engine (operates inside iframe) ──

    let abortController = null;

    function updateProgress(done, total, currentName) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.querySelector('.scc-progress-bar-fill').style.width = Math.round((done / total) * 100) + '%';
        panel.querySelector('.scc-progress-text').textContent = `[${done}/${total}] ${currentName}`;
    }

    function waitForElement(selector, timeoutMs = 5000) {
        const start = Date.now();
        return new Promise(resolve => {
            function check() {
                const el = qs(selector);
                if (el && el.getBoundingClientRect().width > 0) { resolve(el); return; }
                if (Date.now() - start > timeoutMs) { resolve(null); return; }
                setTimeout(check, 150);
            }
            check();
        });
    }

    async function waitForDialogGone(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const dlg = qs(S.confirmDialog);
            if (!dlg || dlg.getBoundingClientRect().width === 0) return true;
            await new Promise(r => setTimeout(r, 300));
        }
        return false;
    }

    function findContactElement(name) {
        const items = qsa(S.contactItem);
        for (const el of items) {
            const label = el.querySelector('.contact-content label');
            if (!label) continue;
            const text = label.textContent.trim();
            if (text === name || text.includes(name) || name.includes(text)) {
                return el; // .contact-item — the Angular component host
            }
        }
        return null;
    }

    async function runDeletion(contactNames) {
        const total = contactNames.length;
        let done = 0, failed = 0;
        abortController = { aborted: false, paused: false };

        // Diagnostic: verify iframe access
        const doc = getDoc();
        console.log('[scc] iframe doc ready:', !!doc);
        if (doc) {
            const testItem = doc.querySelector('.contact-item');
            console.log('[scc] sample .contact-item found:', !!testItem);
            if (testItem) {
                console.log('[scc] sample element tag:', testItem.tagName, '| visible:', testItem.getBoundingClientRect().width > 0);
                // Test: can we click it and get any response?
                console.log('[scc] ownerDocument.defaultView === window.top:', testItem.ownerDocument.defaultView === window.top);
            }
        }

        const panel = document.getElementById(PANEL_ID);
        if (panel) { panel.classList.add('show'); panel.querySelector('.scc-progress-title').textContent = `Deleting ${total} contacts…`; }

        for (let i = 0; i < total; i++) {
            while (abortController && abortController.paused) {
                await new Promise(r => setTimeout(r, 500));
                if (!abortController || abortController.aborted) break;
            }
            if (!abortController || abortController.aborted) {
                console.log('[scc] Aborted at ' + done + '/' + total);
                break;
            }

            const name = contactNames[i];
            updateProgress(done, total, name);

            try {
                // 1) Find contact and try clicking at every level
                const item = findContactElement(name);
                if (!item) {
                    console.warn('[scc] Contact not found:', name);
                    failed++; done++; continue;
                }

                // Debug: highlight the element being clicked
                const origOutline = item.style.outline;
                item.style.outline = '3px solid red';
                const origBg = item.style.backgroundColor;
                item.style.backgroundColor = '#ffeeee';

                // Try clicking .contact-item (host), .contact-inner, and label, at each level
                let editBtn = null;
                const targets = [
                    item,
                    item.querySelector('.contact-inner'),
                    item.querySelector('.contact-content label'),
                ].filter(Boolean);

                for (const tgt of targets) {
                    selectContact(tgt);
                    editBtn = await waitForElement(S.editButton, 2000);
                    if (editBtn) {
                        console.log('[scc] Click SUCCESS on', tgt.className || tgt.tagName, 'for:', name);
                        break;
                    }
                    console.log('[scc] Click on', tgt.className || tgt.tagName, 'did NOT open detail view for:', name);
                }

                // Restore visual
                item.style.outline = origOutline;
                item.style.backgroundColor = origBg;

                if (!editBtn) {
                    console.warn('[scc] ALL click targets failed — detail view never opened for:', name);
                    failed++; done++; continue;
                }
                await new Promise(r => setTimeout(r, DELAY.afterSelectContact));

                // 2) Click "编辑" → wait for "删除联系人"
                iframeClick(editBtn);
                const delBtn = await waitForElement(S.deleteButton, 5000);
                if (!delBtn) {
                    console.warn('[scc] Delete button never appeared for:', name);
                    failed++; done++; continue;
                }
                await new Promise(r => setTimeout(r, DELAY.afterClickEdit));

                // 3) Click "删除联系人" → wait for confirm
                iframeClick(delBtn);
                const confirmBtn = await waitForElement(S.confirmButton, 5000);
                if (!confirmBtn) {
                    console.warn('[scc] Confirm button never appeared for:', name);
                    failed++; done++; continue;
                }
                await new Promise(r => setTimeout(r, DELAY.beforeConfirm));

                // 4) Click "确认"
                iframeClick(confirmBtn);

                // 5) Wait for dialog gone + deletion complete
                await waitForDialogGone(5000);
                await new Promise(r => setTimeout(r, DELAY.afterConfirm));
                done++;
            } catch (err) {
                console.error('[scc] Error deleting:', name, err);
                failed++; done++;
            }

            if (done > 0 && done % DELAY.batchSize === 0 && i < total - 1) {
                updateProgress(done, total, `(resting ${DELAY.betweenBatches / 1000}s…)`);
                await new Promise(r => setTimeout(r, DELAY.betweenBatches));
            }
        }

        if (panel) {
            panel.querySelector('.scc-progress-title').textContent =
                `Done: ${done} deleted` + (failed ? `, ${failed} failed` : '');
            panel.querySelector('.scc-progress-bar-fill').style.width = '100%';
            panel.querySelector('.scc-progress-text').textContent =
                failed ? `${failed} contacts could not be deleted` : 'All done';
        }

        return { done, failed, aborted: abortController && abortController.aborted };
    }

    // ── Progress panel ──

    function ensureProgressPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="scc-progress-title">Deleting…</div>
            <div class="scc-progress-bar-bg"><div class="scc-progress-bar-fill"></div></div>
            <div class="scc-progress-text"></div>
            <div class="scc-progress-btns">
                <button class="scc-btn-pause">Pause</button>
                <button class="scc-btn-stop">Stop</button>
            </div>`;
        document.body.appendChild(panel);
        panel.querySelector('.scc-btn-pause').addEventListener('click', () => {
            if (!abortController) return;
            abortController.paused = !abortController.paused;
            panel.querySelector('.scc-btn-pause').textContent =
                abortController.paused ? 'Resume' : 'Pause';
            const fab = document.getElementById(FAB_ID);
            if (fab) fab.innerHTML = abortController.paused ? '▶' : '⏳';
        });
        panel.querySelector('.scc-btn-stop').addEventListener('click', () => {
            if (abortController) { abortController.aborted = true; abortController.paused = false; }
            panel.querySelector('.scc-btn-pause').textContent = 'Pause';
        });
    }

    // ── FAB state ──

    function getFab() { return document.getElementById(FAB_ID); }

    function setFabBusy(label) {
        const fab = getFab();
        if (!fab) return;
        if (label) { fab.disabled = true; fab.title = label; fab.textContent = label; }
        else { fab.disabled = false; fab.title = 'Delete Contacts'; fab.innerHTML = '🗑'; }
    }

    function setFabRunning(running) {
        const fab = getFab();
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
            };
        } else {
            fab.classList.remove('running');
            fab.innerHTML = '🗑';
            fab.title = 'Delete Contacts';
            fab.disabled = false;
            fab.onclick = () => toggleMenu();
        }
    }

    // ── Menu ──

    function openMenu()  { const m = document.getElementById(MENU_ID); if (m) m.classList.add('open'); }
    function closeMenu() { const m = document.getElementById(MENU_ID); if (m) m.classList.remove('open'); }
    function toggleMenu() { const m = document.getElementById(MENU_ID); if (m) { m.classList.contains('open') ? closeMenu() : openMenu(); } }

    // ── Main action ──

    async function startDeleteAll() {
        closeMenu();
        setFabBusy('收集');

        const names = await scrollAndCollectContacts(count => setFabBusy(`${count}`));
        setFabBusy(null);

        if (names.length === 0) {
            alert('未找到任何联系人。');
            return;
        }

        const ok = confirm(
            `找到 ${names.length} 个联系人。\n\n确定要全部删除吗？\n\n⚠ 操作不可撤销！脚本将模拟点击逐条删除。\n\n前 10 个：\n${names.slice(0, 10).map(n => '  – ' + n).join('\n')}${names.length > 10 ? '\n  … 还有 ' + (names.length - 10) + ' 个' : ''}`
        );
        if (!ok) return;

        ensureProgressPanel();
        setFabRunning(true);
        const result = await runDeletion(names);
        setFabRunning(false);

        if (result.aborted) return;
        if (result.done > 0) {
            alert(`删除完成：${result.done} 个已删除` + (result.failed ? `，${result.failed} 个失败` : ''));
        }
    }

    // ── FAB + Menu init ──

    function ensureFab() {
        if (!document.body) return;
        const existing = document.querySelectorAll('#' + ROOT_ID);
        if (existing.length === 1) return;
        existing.forEach(el => el.remove());

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <div id="${MENU_ID}">
                <div class="scc-menu-label">Delete</div>
                <button data-act="delete-all">🗑 删除全部联系人…</button>
                <div class="scc-menu-label" style="font-size:11px;color:#999;white-space:normal;">
                    Scroll-collect → confirm → auto‑click Smartisan UI
                </div>
            </div>
            <button id="${FAB_ID}">🗑</button>`;
        document.body.appendChild(root);

        const fab  = root.querySelector('#' + FAB_ID);
        const menu = root.querySelector('#' + MENU_ID);

        fab.onclick = () => toggleMenu();
        menu.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.act === 'delete-all') startDeleteAll();
        });

        document.addEventListener('click', e => {
            if (!root.contains(e.target)) closeMenu();
        }, true);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeMenu();
        });
    }

    // ── Startup ──

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureFab);
    } else {
        ensureFab();
    }

    new MutationObserver(() => {
        if (document.body && document.querySelectorAll('#' + ROOT_ID).length !== 1) ensureFab();
    }).observe(document.body || document.documentElement, { childList: true, subtree: false });

})();
