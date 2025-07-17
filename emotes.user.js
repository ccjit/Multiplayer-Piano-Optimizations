// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.2.5
// @description  Display emoticons in chat!
// @author       zackiboiz
// @match        *://multiplayerpiano.com/*
// @match        *://multiplayerpiano.net/*
// @match        *://multiplayerpiano.org/*
// @match        *://piano.mpp.community/*
// @match        *://mpp.7458.space/*
// @match        *://qmppv2.qwerty0301.repl.co/*
// @match        *://mpp.8448.space/*
// @match        *://mpp.autoplayer.xyz/*
// @match        *://mpp.hyye.xyz/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=multiplayerpiano.net
// @grant        GM_info
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/542677/Multiplayer%20Piano%20Optimizations%20%5BEmotes%5D.user.js
// @updateURL    https://update.greasyfork.org/scripts/542677/Multiplayer%20Piano%20Optimizations%20%5BEmotes%5D.meta.js
// ==/UserScript==

(async () => {
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    await sleep(1000);
    const BASE_URL = "https://raw.githubusercontent.com/ZackiBoiz/Multiplayer-Piano-Optimizations/refs/heads/main";
    const OLD_RGB_PREFIX = 0x0D9E;
    const NEW_RGB_PREFIX = 0xF000;
    const PROPOSAL_RGB_PREFIX = 0xA000;

    class EmotesManager {
        constructor(version, baseUrl) {
            this.version = version;
            this.baseUrl = baseUrl;
            this.emotes = {};
            this.tokenRegex = null;
        }

        async init() {
            try {
                await this._loadEmotes();
                this._buildTokenRegex();
                this._initChatObserver();
                this._replaceExistingMessages();
            } catch (err) {
                console.error("EmotesManager failed:", err);
            }
        }

        async _loadEmotes() {
            const res = await fetch(`${this.baseUrl}/emotes/meta.json?_=${Date.now()}`);
            if (!res.ok) throw new Error(`Failed to load emote metadata: ${res.status}`);
            const data = await res.json();
            if (typeof data !== "object" || Array.isArray(data)) throw new Error("Unexpected emote metadata shape");
            this.emotes = data;
        }

        _buildTokenRegex() {
            const tokens = Object.keys(this.emotes).map(t => t.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"));
            tokens.sort((a, b) => b.length - a.length);
            this.tokenRegex = new RegExp(`:(${tokens.join("|")}):`, "g");
        }

        _initChatObserver() {
            const chatList = document.querySelector("#chat > ul");
            if (!chatList) {
                console.warn("EmotesManager: chat container not found");
                return;
            }
            const observer = new MutationObserver(muts => {
                muts.forEach(m => {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "LI") {
                            this._replaceEmotesInElement(node.querySelector(".message"));
                        }
                    });
                });
            });
            observer.observe(chatList, { childList: true });
        }

        _replaceExistingMessages() {
            document.querySelectorAll("#chat > ul li .message").forEach(el => this._replaceEmotesInElement(el));
        }

        _replaceEmotesInElement(el) {
            if (!el) return;

            const walk = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const frag = this._processTextSegment(node.textContent);
                    node.replaceWith(frag);
                    return;
                }

                if (node.nodeType === Node.ELEMENT_NODE) {
                    const childRefs = Array.from(node.childNodes);
                    for (const child of childRefs) {
                        walk(child);
                    }
                }
            }

            walk(el);
        }
        
        _processTextSegment(rawText) {
            const frag = document.createDocumentFragment();

            const segments = rawText.split(/(?<!\\)\\n/).map(s => s.replace(/\\\\n/g, "\\n"));

            for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                const seg = segments[segIdx];
                let i = 0;
                let buffer = "";

                function flushBuffer() {
                    if (buffer) {
                        frag.appendChild(document.createTextNode(buffer));
                        buffer = "";
                    }
                }

                while (i < seg.length) {
                    const cp = seg.codePointAt(i);

                    if (cp === OLD_RGB_PREFIX && i + 3 < seg.length) {
                        flushBuffer();
                        const r = seg.codePointAt(i + 1) & 0xFF;
                        const g = seg.codePointAt(i + 2) & 0xFF;
                        const b = seg.codePointAt(i + 3) & 0xFF;
                        const raw = seg.slice(i, i + 4);
                        this._appendColor(frag, r, g, b, raw);
                        i += 4;
                        continue;
                    }

                    if (cp === NEW_RGB_PREFIX && i + 1 < seg.length) {
                        flushBuffer();
                        const high = seg.codePointAt(i + 1);
                        const hasLow = i + 2 < seg.length;
                        let r, g, b, consumed;

                        if (hasLow) {
                            const low = seg.codePointAt(i + 2);
                            r = (((high >> 8) & 0xF) << 4) | ((low >> 8) & 0xF);
                            g = (((high >> 4) & 0xF) << 4) | ((low >> 4) & 0xF);
                            b = (((high) & 0xF) << 4) | ((low) & 0xF);
                            consumed = 3;
                        } else {
                            r = ((high >> 8) & 0xF) * 17;
                            g = ((high >> 4) & 0xF) * 17;
                            b = (high & 0xF) * 17;
                            consumed = 2;
                        }

                        const raw = seg.slice(i, i + consumed);
                        this._appendColor(frag, r, g, b, raw);
                        i += consumed;
                        continue;
                    }

                    if (cp >= PROPOSAL_RGB_PREFIX && cp <= 0xDFFF) {
                        flushBuffer();
                        const nibble = cp & 0x0FFF;
                        const r2 = ((nibble >> 8) & 0xF) * 17;
                        const g2 = ((nibble >> 4) & 0xF) * 17;
                        const b2 = (nibble & 0xF) * 17;
                        const raw2 = seg.slice(i, i + 1);
                        this._appendColor(frag, r2, g2, b2, raw2);
                        i += 1;
                        continue;
                    }

                    this.tokenRegex.lastIndex = 0;
                    const rest = seg.slice(i);
                    const m = this.tokenRegex.exec(rest);
                    if (m && m.index === 0) {
                        flushBuffer();
                        const token = m[0],
                            key = m[1],
                            ext = this.emotes[key] || "png";

                        const img = document.createElement("img");
                        img.src = `${this.baseUrl}/emotes/assets/${key}.${ext}`;
                        img.alt = img.title = token;
                        img.style.height = "0.75rem";
                        img.style.verticalAlign = "middle";
                        img.style.cursor = "pointer";
                        img.addEventListener("click", () => navigator.clipboard.writeText(token));

                        frag.appendChild(img);
                        i += token.length;
                        continue;
                    }

                    buffer += seg[i];
                    i++;
                }

                flushBuffer();
                if (segIdx < segments.length - 1) {
                    frag.appendChild(document.createElement("br"));
                }
            }

            return frag;
        }

        _appendColor(frag, r, g, b, raw) {
            const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase();
            const span = document.createElement("span");
            span.style.display = "inline-block";
            span.style.width = "0.75rem";
            span.style.height = "0.75rem";
            span.style.verticalAlign = "middle";
            span.style.backgroundColor = `#${hex}`;
            span.style.cursor = "pointer";
            span.title = `#${hex}`;

            span.addEventListener("click", () => navigator.clipboard.writeText(raw));
            frag.appendChild(span);
        }
    }

    const emotesManager = new EmotesManager(GM_info.script.version, BASE_URL);
    emotesManager.init();
})();