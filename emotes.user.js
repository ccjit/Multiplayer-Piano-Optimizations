// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.0.2
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
            messages.forEach(msgEl => {
                this._replaceEmotesInElement(msgEl);
            });
        }

        _replaceEmotesInElement(element) {
            for (const child of Array.from(element.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    if (!this.tokenRegex.test(text)) continue;
                    this.tokenRegex.lastIndex = 0;

                    const frag = document.createDocumentFragment();
                    let lastIndex = 0;
                    let match;

                    while ((match = this.tokenRegex.exec(text)) !== null) {
                        const fullMatch = match[0];
                        const token = match[1];
                        const idx = match.index;

                        if (idx > lastIndex) {
                            frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                        }

                        const ext = this.emotes[token] || "png";
                        const url = `${this.baseUrl}/emotes/assets/${token}.${ext}`;
                        const img = document.createElement("img");
                        img.src = url;
                        img.title = fullMatch;
                        img.alt = fullMatch;
                        img.style.height = "0.75rem";
                        img.style.verticalAlign = "middle";
                        img.style.margin = "0 0.1rem";
                        frag.appendChild(img);

                        lastIndex = idx + fullMatch.length;
                    }

                    if (lastIndex < text.length) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                    }
                    element.replaceChild(frag, child);
                }
            }
        }
    }

    const emotesManager = new EmotesManager(GM_info.script.version, BASE_URL);
    emotesManager.init();
})();