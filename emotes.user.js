// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.2.1
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
                MPP.chat.sendPrivate({
                    name: `[MPP Emotes] v${this.version}`,
                    color: "#ff0000",
                    message: "EmotesManager initialization failed. Check console for details",
                });
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

            const nodes = [];
            el.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const raw = node.nodeValue;
                    if (raw.includes("\\n")) {
                        const parts = raw.split(/(?<!\\)\\n/).map(str => str.replace(/\\\\n/g, "\\n"));
                        parts.forEach((seg, i) => {
                            nodes.push(document.createTextNode(seg));
                            if (i < parts.length - 1) nodes.push(document.createElement("br"));
                        });
                        return;
                    }
                }
                nodes.push(node);
            });
            el.textContent = "";
            nodes.forEach(n => el.appendChild(n));

            el.childNodes.forEach(node => {
                if (node.nodeType !== Node.TEXT_NODE) return;
                const text = node.nodeValue;
                const frag = document.createDocumentFragment();
                let i = 0;

                while (i < text.length) {
                    const cp = text.codePointAt(i);

                    // 0x0D9E 0xFFRR 0xFFGG 0xFFBB
                    if (cp === OLD_RGB_PREFIX && i + 3 < text.length) {
                        const raw = text.slice(i, i + 4);
                        const r = text.codePointAt(i + 1) & 0xFF;
                        const g = text.codePointAt(i + 2) & 0xFF;
                        const b = text.codePointAt(i + 3) & 0xFF;
                        this._appendColor(frag, r, g, b, raw);
                        i += 4;
                        continue;
                    }

                    // 0xF000 0xERGB [0xErgb]
                    if (cp === NEW_RGB_PREFIX && i + 1 < text.length) {
                        const high = text.codePointAt(i + 1);
                        const rHigh = (high >> 8) & 0xF;
                        const gHigh = (high >> 4) & 0xF;
                        const bHigh = high & 0xF;
                        let r, g, b, len;
                        if (i + 2 < text.length) {
                            const low = text.codePointAt(i + 2);
                            const rLow = (low >> 8) & 0xF;
                            const gLow = (low >> 4) & 0xF;
                            const bLow = low & 0xF;
                            r = (rHigh << 4) | rLow;
                            g = (gHigh << 4) | gLow;
                            b = (bHigh << 4) | bLow;
                            len = 3;
                        } else {
                            r = rHigh * 17;
                            g = gHigh * 17;
                            b = bHigh * 17;
                            len = 2;
                        }
                        const raw = text.slice(i, i + len + 1);
                        this._appendColor(frag, r, g, b, raw);
                        i += len + 1;
                        continue;
                    }

                    // 0xF000
                    if (cp >= NEW_RGB_PREFIX && cp <= 0xFFFF) {
                        const raw = text.slice(i, i + 1);
                        const nibble = cp & 0x0FFF;
                        const r = ((nibble >> 8) & 0xF) * 17;
                        const g = ((nibble >> 4) & 0xF) * 17;
                        const b = (nibble & 0xF) * 17;
                        this._appendColor(frag, r, g, b, raw);
                        i += 1;
                        continue;
                    }

                    this.tokenRegex.lastIndex = 0;
                    const rest = text.slice(i);
                    const m = this.tokenRegex.exec(rest);
                    if (m && m.index === 0) {
                        const token = m[0], key = m[1];
                        const ext = this.emotes[key] || 'png';
                        const url = `${this.baseUrl}/emotes/assets/${key}.${ext}`;
                        const img = document.createElement('img');
                        img.src = url;
                        img.title = token;
                        img.alt = token;
                        img.style.height = '0.75rem';
                        img.style.verticalAlign = 'middle';
                        img.style.cursor = 'pointer';
                        img.addEventListener('click', () => navigator.clipboard.writeText(token));
                        frag.appendChild(img);

                        i += token.length;
                        continue;
                    }

                    frag.appendChild(document.createTextNode(text[i]));
                    i++;                }
                node.replaceWith(frag);
            });
        }

        _appendColor(frag, r, g, b, raw) {
            const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase();
            const span = document.createElement('span');
            span.style.display = 'inline-block';
            span.style.width = '0.75rem';
            span.style.height = '0.75rem';
            span.style.verticalAlign = 'middle';
            span.style.backgroundColor = `#${hex}`;
            span.style.cursor = 'pointer';
            span.title = `#${hex}`;

            span.addEventListener('click', () => navigator.clipboard.writeText(raw));
            frag.appendChild(span);
        }
    }

    const emotesManager = new EmotesManager(GM_info.script.version, BASE_URL);
    emotesManager.init();
})();