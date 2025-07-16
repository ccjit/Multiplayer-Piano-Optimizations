// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.1.0
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
    const RGB_PREFIX = "\u0D9E";

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
            if (!res.ok) {
                throw new Error(`Failed to load emote metadata: ${res.status}`);
            }
            const data = await res.json();
            if (typeof data !== "object" || Array.isArray(data)) {
                throw new Error("Unexpected emote metadata shape");
            }
            this.emotes = data;
        }

        _buildTokenRegex() {
            const tokens = Object.keys(this.emotes).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
            tokens.sort((a, b) => b.length - a.length);
            this.tokenRegex = new RegExp(`:(${tokens.join("|")}):`, "g");
        }

        _initChatObserver() {
            const chatList = document.querySelector("#chat > ul");
            if (!chatList) {
                console.warn("EmotesManager: chat container not found");
                return;
            }

            const observer = new MutationObserver(mutations => {
                for (const m of mutations) {
                    if (m.type === "childList" && m.addedNodes.length) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "LI") {
                                this._replaceEmotesInElement(node.querySelector(".message"));
                            }
                        }
                    }
                }
            });

            observer.observe(chatList, {
                childList: true
            });
        }

        _replaceExistingMessages() {
            const messages = document.querySelectorAll("#chat > ul li .message");
            messages.forEach(element => {
                this._replaceEmotesInElement(element);
                this._replaceRGBSquaresInElement(element);
            });
        }

        _replaceEmotesInElement(element) {
            if (!element) return;

            const prelim = [];
            for (const node of Array.from(element.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.includes("\\n")) {
                    const parts = node.nodeValue.split("\\n");
                    parts.forEach((part, i) => {
                        prelim.push(document.createTextNode(part));
                        if (i < parts.length - 1) {
                            prelim.push(document.createElement("br"));
                        }
                    });
                } else {
                    prelim.push(node);
                }
            }
            element.textContent = "";
            prelim.forEach(n => element.appendChild(n));

            Array.from(element.childNodes).forEach(child => {
                if (child.nodeType !== Node.TEXT_NODE) return;
                const text = child.nodeValue;
                if (!this.tokenRegex || !this.tokenRegex.test(text)) return;
                this.tokenRegex.lastIndex = 0;

                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                let match;
                while ((match = this.tokenRegex.exec(text)) !== null) {
                    const full = match[0];
                    const token = match[1];
                    const idx = match.index;

                    if (idx > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    }

                    const ext = this.emotes[token] || "png";
                    const url = `${this.baseUrl}/emotes/assets/${token}.${ext}`;
                    const img = document.createElement("img");
                    img.src = url;
                    img.title = full;
                    img.alt = full;
                    img.style.height = "0.75rem";
                    img.style.verticalAlign = "middle";
                    img.style.cursor = "pointer";
                    img.addEventListener("click", () => {
                        navigator.clipboard.writeText(full).catch(err => {
                            console.error("Failed copying emote token:", err);
                        });
                    });
                    frag.appendChild(img);
                    lastIndex = idx + full.length;
                }

                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                }
                element.replaceChild(frag, child);
            });
        }

        _replaceRGBSquaresInElement(element) {
            for (const node of Array.from(element.childNodes)) {
                if (node.nodeType !== Node.TEXT_NODE) continue;
                const text = node.nodeValue;
                if (!text.includes(RGB_PREFIX)) continue;

                const frag = document.createDocumentFragment();
                const rgbRegex = new RegExp(`${RGB_PREFIX}([\uFF00-\uFFFF]{3})`, "g");
                let lastIndex = 0, match;

                while ((match = rgbRegex.exec(text)) !== null) {
                    const idx = match.index;

                    if (idx > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    }

                    const trio = match[1];
                    const r = trio.charCodeAt(0) & 0xFF;
                    const g = trio.charCodeAt(1) & 0xFF;
                    const b = trio.charCodeAt(2) & 0xFF;
                    const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");

                    const span = document.createElement("span");
                    span.style.display = "inline-block";
                    span.style.width = "0.75rem";
                    span.style.height = "0.75rem";
                    span.style.verticalAlign = "middle";
                    span.style.backgroundColor = `#${hex}`;
                    span.style.cursor = "pointer";

                    const token = RGB_PREFIX + trio;
                    span.title = `#${hex}`;
                    span.addEventListener("click", () => {
                        navigator.clipboard.writeText(token).catch(err => console.error("Clipboard failed", err));
                    });

                    frag.appendChild(span);
                    lastIndex = idx + RGB_PREFIX.length + trio.length;
                }

                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                }
                element.replaceChild(frag, node);
            }
        }
    }

    const emotesManager = new EmotesManager(GM_info.script.version, BASE_URL);
    emotesManager.init();
})();