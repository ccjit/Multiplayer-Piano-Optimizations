// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.3.0
// @description  Display emoticons and colors in chat!
// @author       zackiboiz, ccjit
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
    const dl = GM_info.script.downloadURL || GM_info.script.updateURL || GM_info.script.homepageURL || "";
    const match = dl.match(/greasyfork\.org\/scripts\/(\d+)/);
    if (!match) {
        return console.warn("Could not find Greasy Fork script ID in downloadURL/updateURL/homepageURL:", dl);
    }
    const scriptId = match[1];
    const localVersion = GM_info.script.version;
    const apiUrl = `https://greasyfork.org/scripts/${scriptId}.json`;

    fetch(apiUrl, {
        mode: "cors",
        headers: {
            Accept: "application/json"
        }
    }).then(r => {
        if (!r.ok) throw new Error("Failed to fetch Greasy Fork data.");
        return r.json();
    }).then(data => {
        const remoteVersion = data.version;
        if (compareVersions(localVersion, remoteVersion) < 0) {
            if (confirm(
                `A new version of this script is available!\n` +
                `Local: ${localVersion}\n` +
                `Latest: ${remoteVersion}\n\n` +
                `Open Greasy Fork to update?`
            )) {
                window.open(`https://greasyfork.org/scripts/${scriptId}`, "_blank");
            }
        }
    }).catch(err => console.error("Update check failed:", err));

    function compareVersions(a, b) {
        const pa = a.split(".").map(n => parseInt(n, 10) || 0);
        const pb = b.split(".").map(n => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            if ((pa[i] || 0) < (pb[i] || 0)) return -1;
            if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    await sleep(1000);
    const BASE_URL = "https://raw.githubusercontent.com/ZackiBoiz/Multiplayer-Piano-Optimizations/refs/heads/main";
    const OLD_RGB_PREFIX = 0x0D9E;

    class EmotesManager {
        constructor(version, baseUrl) {
            this.version = version;
            this.baseUrl = baseUrl;
            this.emotes = {};
            this.emoteUrls = {};
            this.tokenRegex = null;
        }

        async init() {
            try {
                await this._loadEmotesMeta();
                await this._preloadEmotes();
                this._buildTokenRegex();
                this._initChatObserver();
                this._replaceExistingMessages();
            } catch (err) {
                console.error("EmotesManager failed:", err);
            }
        }

        async _loadEmotesMeta() {
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

        async _preloadEmotes() {
            const entries = Object.entries(this.emotes);
            await Promise.all(entries.map(async ([key, ext]) => {
                try {
                    const resp = await fetch(`${this.baseUrl}/emotes/assets/${key}.${ext}?_=${Date.now()}`);
                    if (!resp.ok) throw new Error(`Failed to fetch emote ${key}`);
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    this.emoteUrls[key] = url;
                } catch (e) {
                    console.warn(`Could not preload emote "${key}":`, e);
                }
            }));
        }

        _buildTokenRegex() {
            const tokens = Object.keys(this.emotes)
                .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .sort((a, b) => b.length - a.length);
            this.tokenRegex = new RegExp(`:(${tokens.join("|")}):`, "g");
        }

        _initChatObserver() {
            const chatList = document.querySelector("#chat > ul");
            if (!chatList) return;
            const observer = new MutationObserver(mutations => {
                observer.disconnect();
                mutations.forEach(m => {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === "LI") {
                            const msgEl = node.querySelector(".message");
                            this._replaceEmotesInElement(msgEl);
                            if (chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 30) {
                                chatList.scrollTop = chatList.scrollHeight;
                            }
                        }
                    });
                });
                observer.observe(chatList, { childList: true });
            });
            observer.observe(chatList, { childList: true });
        }


        _replaceExistingMessages() {
            document.querySelectorAll("#chat > ul li .message").forEach(el => this._replaceEmotesInElement(el));
        }

        _replaceEmotesInElement(el) {
            if (!el) return;

            const walk = node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const frag = this._processTextSegment(node.textContent);
                    node.replaceWith(frag);
                    return;
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                    Array.from(node.childNodes).forEach(child => walk(child));
                }
            };

            walk(el);
        }

        _processTextSegment(rawText) {
            const frag = document.createDocumentFragment();
            const segments = rawText
                .replace(/((?<!\\)(?:\\\\)*)(?:\\n){2,}/g, "$1\\n")
                .split(/(?<!\\)(?:\\\\)*\\n/)
                .map(s => s.replace(/\\\\n/g, "\\n"));

            for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                const seg = segments[segIdx];
                let buffer = "";
                let i = 0;

                const flushBuffer = () => {
                    if (buffer) {
                        frag.appendChild(document.createTextNode(buffer));
                        buffer = "";
                    }
                };

                while (i < seg.length) {
                    const cp = seg.codePointAt(i);

                    if (cp === OLD_RGB_PREFIX && i + 3 < seg.length) {
                        flushBuffer();
                        const rRaw = seg.codePointAt(i + 1);
                        const gRaw = seg.codePointAt(i + 2);
                        const bRaw = seg.codePointAt(i + 3);
                        const r = rRaw & 0xFF, g = gRaw & 0xFF, b = bRaw & 0xFF;
                        const raw = seg.slice(i, i + 4);
                        this._appendColor(frag, r, g, b, raw);
                        i += 4;
                        continue;
                    }

                    if (cp >= 0xE000 && cp <= 0xEFFF) {
                        flushBuffer();
                        const nib = cp & 0x0FFF;
                        const r = ((nib >> 8) & 0xF) * 17;
                        const g = ((nib >> 4) & 0xF) * 17;
                        const b = (nib & 0xF) * 17;
                        const raw = seg.slice(i, i + 1);
                        this._appendColor(frag, r, g, b, raw);
                        i += 1;
                        continue;
                    }

                    this.tokenRegex.lastIndex = 0;
                    const rest = seg.slice(i);
                    const m = this.tokenRegex.exec(rest);
                    if (m && m.index === 0) {
                        flushBuffer();
                        const fullToken = m[0];
                        const key = m[1];

                        const img = document.createElement("img");
                        img.src = this.emoteUrls[key] || "";
                        img.alt = img.title = fullToken;
                        img.style.height = "0.75rem";
                        img.style.verticalAlign = "middle";
                        img.style.cursor = "pointer";
                        img.addEventListener("click", () => navigator.clipboard.writeText(fullToken));

                        frag.appendChild(img);
                        i += fullToken.length;
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

    const emotesManager = new EmotesManager(localVersion, BASE_URL);
    emotesManager.init();
})();