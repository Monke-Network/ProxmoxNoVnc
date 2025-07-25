// ==UserScript==
// @name         noVNC Paste for Proxmox 4 monke
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Read & Paste the whole clipboard , count chars , with enhanced visual feedback
// @author       Wolfyrion % Forked by olli2984
// @match        https://*/:8006/*
// @match        https://p*.wellermann.org/*
// @include      /^https?:\/\/.*:8006\/.*novnc.*/
// @include      /^https:\/\/p.*\.wellermann\.org\/.*novnc.*/
// @require      http://code.jquery.com/jquery-3.3.1.min.js
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // Load saved state or default to true
    let pasteMode = GM_getValue('pasteMode', true);
    let indicatorTimeout;
    let statusTimeout;
    let isProcessingPaste = false;

    function showStatus(message, isError = false) {
        clearTimeout(statusTimeout);

        const existing = document.getElementById("paste-action-indicator");
        if (existing) existing.remove();

        const div = document.createElement("div");
        div.id = "paste-action-indicator";
        div.textContent = message;
        div.style.position = "fixed";
        div.style.bottom = "60px";
        div.style.right = "20px";
        div.style.backgroundColor = isError ? "#d32f2f" : "#388e3c";
        div.style.color = "white";
        div.style.padding = "8px 16px";
        div.style.borderRadius = "8px";
        div.style.fontFamily = "Arial, sans-serif";
        div.style.fontSize = "14px";
        div.style.zIndex = "9998";
        div.style.opacity = "0.9";
        div.style.boxShadow = "0 0 8px rgba(0,0,0,0.3)";
        div.style.transition = "opacity 0.3s ease";
        div.style.maxWidth = "300px";
        div.style.wordWrap = "break-word";

        document.body.appendChild(div);

        statusTimeout = setTimeout(() => {
            div.style.opacity = "0";
            setTimeout(() => div.remove(), 300);
        }, isError ? 5000 : 3000);
    }

    function showPasteStatus() {
        clearTimeout(indicatorTimeout);

        const existing = document.getElementById("paste-status-indicator");
        if (existing) existing.remove();

        const div = document.createElement("div");
        div.id = "paste-status-indicator";
        div.textContent = "Paste Mode: " + (pasteMode ? "ON" : "OFF");
        div.style.position = "fixed";
        div.style.bottom = "20px";
        div.style.right = "20px";
        div.style.backgroundColor = pasteMode ? "#388e3c" : "#d32f2f";
        div.style.color = "white";
        div.style.padding = "6px 12px";
        div.style.borderRadius = "8px";
        div.style.fontFamily = "Arial, sans-serif";
        div.style.fontSize = "14px";
        div.style.zIndex = "9999";
        div.style.opacity = "0.85";
        div.style.boxShadow = "0 0 5px rgba(0,0,0,0.3)";
        div.style.transition = "opacity 0.3s ease";

        document.body.appendChild(div);

        indicatorTimeout = setTimeout(() => {
            div.style.opacity = "0";
            setTimeout(() => div.remove(), 300);
        }, 2000);
    }

    async function sendString(text) {
        const el = document.getElementById("canvas-id");
        if (!el) {
            const errorMsg = "noVNC canvas element not found";
            console.error(errorMsg);
            showStatus("Paste Failed: Canvas not found", true);
            GM_notification({
                title: "noVNC Paste Error",
                text: errorMsg,
                silent: true
            });
            return false;
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        try {
            isProcessingPaste = true;
            showStatus("Pasting...", false);

            el.focus();
            await sleep(50);

            const charCount = text.length;
            let processed = 0;

            for (const char of text) {
                if (char === '\n') {
                    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
                    await sleep(10);
                    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
                } else {
                    const needsShift = char.match(/[A-Z!@#$%^&*()_+{}:"<>?~|]/);

                    if (needsShift) {
                        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", bubbles: true }));
                        await sleep(10);
                        el.dispatchEvent(new KeyboardEvent("keydown", { key: char.toLowerCase(), shiftKey: true, bubbles: true }));
                        await sleep(10);
                        el.dispatchEvent(new KeyboardEvent("keyup", { key: char.toLowerCase(), shiftKey: true, bubbles: true }));
                        await sleep(10);
                        el.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true }));
                    } else {
                        el.dispatchEvent(new KeyboardEvent("keydown", { key: char.toLowerCase(), bubbles: true }));
                        await sleep(10);
                        el.dispatchEvent(new KeyboardEvent("keyup", { key: char.toLowerCase(), bubbles: true }));
                    }
                }
                processed++;

                if (processed % 10 === 0) {
                    showStatus(`Pasting... (${processed}/${charCount})`, false);
                }

                await sleep(20);
            }

            showStatus(`Pasted ${charCount} characters successfully`, false);
            return true;
        } catch (error) {
            const errorMsg = `Paste Failed: ${error.message}`;
            console.error(errorMsg, error);
            showStatus(errorMsg, true);
            GM_notification({
                title: "Paste Error",
                text: errorMsg,
                silent: true
            });
            return false;
        } finally {
            setTimeout(() => {
                isProcessingPaste = false;
            }, 100);
        }
    }

    function initCanvas() {
        const canvas = $("canvas").first();
        if (canvas.length > 0 && !canvas.attr("id")) {
            canvas.attr("id", "canvas-id");

            canvas.on("contextmenu", (e) => {
                if (pasteMode) {
                    e.preventDefault();
                    return false;
                }
            });

            canvas.on("mousedown", (e) => {
                if (isProcessingPaste) {
                    e.preventDefault();
                    return false;
                }

                if (e.button === 2 && pasteMode) {
                    e.preventDefault();
                    showStatus("Clipboard was read...", false);

                    navigator.clipboard.readText().then(text => {
                        if (text && text.length > 0) {
                            const trimmedText = text.trim();
                            if (trimmedText.length > 1000) {
                                showStatus(`Pasting large text (${trimmedText.length} chars)...`, false);
                            }
                            sendString(trimmedText);
                        } else {
                            showStatus("Clipboard is empty", true);
                        }
                    }).catch(err => {
                        const errorMsg = "Clipboard access denied. Check permissions.";
                        console.error(errorMsg, err);
                        showStatus(errorMsg, true);
                        GM_notification({
                            title: "Clipboard Error",
                            text: errorMsg,
                            silent: true
                        });
                    });
                    return false;
                }
            });

            canvas.on("mouseup", (e) => {
                if (isProcessingPaste) {
                    e.preventDefault();
                    return false;
                }
            });
        }
    }

    $(document).ready(function () {
        showPasteStatus();
        initCanvas();

        const canvasCheckInterval = setInterval(() => {
            if ($("canvas").length > 0) {
                initCanvas();
                clearInterval(canvasCheckInterval);
            }
        }, 1000);

        $(document).on("keydown", (e) => {
            if (e.altKey && (e.key === "p" || e.key === "P")) {
                pasteMode = !pasteMode;
                GM_setValue('pasteMode', pasteMode);
                showPasteStatus();
                e.preventDefault();
            }
        });

        console.log("noVNC Paste Script Loaded (Paste Mode: " + (pasteMode ? "ON" : "OFF") + ")");
    });

})();
