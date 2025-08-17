// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.4.16
// @description  Display emoticons and colors in chat!
// @author       zackiboiz, ccjit
// @match        *://multiplayerpiano.com/*
// @match        *://multiplayerpiano.net/*
// @match        *://dev.multiplayerpiano.net/*
// @match        *://multiplayerpiano.org/*
// @match        *://piano.mpp.community/*
// @match        *://mpp.7458.space/*
// @match        *://qmppv2.qwerty0301.repl.co/*
// @match        *://mpp.8448.space/*
// @match        *://mpp.autoplayer.xyz/*
// @match        *://mpp.hyye.xyz/*
// @match        *://mpp.smp-meow.net/*
// @match        *://piano.ourworldofpixels.com/*
// @match        *://mpp.lapishusky.dev/*
// @match        *://staging-mpp.sad.ovh/*
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
        console.warn("Could not find Greasy Fork script ID in downloadURL/updateURL/homepageURL:", dl);
    } else {
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
                new MPP.Notification({
                    "m": "notification",
                    "duration": 15000,
                    "title": "Update Available",
                    "html": "<p>A new version of this script is available!</p>" +
                        `<p style='margin-top: 10px;'>Script: ${GM_info.script.name}</p>` +
                        `<p>Local: v${localVersion}</p>` +
                        `<p>Latest: v${remoteVersion}</p>` +
                        `<a href='https://greasyfork.org/scripts/${scriptId}' target='_blank' style='position: absolute; right: 0;bottom: 0; margin: 10px; font-size: 0.5rem;'>Open Greasy Fork to update?</a>`
                })
            }
        }).catch(err => console.error("Update check failed:", err));
    }

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
            this.emotePromises = {};
            this.tokenRegex = null;
            this.DROPDOWN_OFFSET_PX = 10;

            this.dropdown = document.createElement("div");
            this.dropdown.id = "emote-suggestions";
            Object.assign(this.dropdown.style, {
                position: "absolute",
                backgroundColor: "#3c3c3c",
                border: "1px solid #555",
                borderRadius: "8px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                zIndex: "9999",
                maxHeight: "200px",
                overflowY: "auto",
                display: "none",
                fontFamily: "Ubuntu, Arial",
                color: "#ffffff",
                fontSize: "0.75rem"
            });
            document.body.appendChild(this.dropdown);

            const style = document.createElement("style");
            style.textContent = `
                #emote-suggestions .dropdown-item:hover {
                    background-color: #4c4c4c;
                }
            `;
            document.head.appendChild(style);
        }

        async init() {
            try {
                await this._loadEmotesMeta();
                this._buildTokenRegex();
                this._initChatObserver();
                this._replaceExistingMessages();
                this._initSuggestionListeners();
            } catch (err) {
                console.error("EmotesManager failed:", err);
            }
        }

        async _loadEmotesMeta() {
            const res = await fetch(`${this.baseUrl}/emotes/meta.json?_=${Date.now()}`);
            if (!res.ok) throw new Error(`Failed to load emote metadata: ${res.status}`);
            this.emotes = await res.json();
        }

        _buildTokenRegex() {
            const tokens = Object.keys(this.emotes)
                .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .sort((a, b) => b.length - a.length);
            this.tokenRegex = new RegExp(`:(${tokens.join("|")}):`, "g");
        }

        async _getEmoteUrl(key) {
            if (this.emoteUrls[key]) return this.emoteUrls[key];
            if (this.emotePromises[key]) return this.emotePromises[key];

            const promise = (async () => {
                const ext = this.emotes[key];
                try {
                    const resp = await fetch(`${this.baseUrl}/emotes/assets/${key}.${ext}?_=${Date.now()}`);
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    this.emoteUrls[key] = url;
                    return url;
                } catch (e) {
                    console.warn(`Failed to load emote "${key}":`, e);
                    return "";
                } finally {
                    delete this.emotePromises[key];
                }
            })();

            this.emotePromises[key] = promise;
            return promise;
        }

        _initChatObserver() {
            const chatList = document.querySelector("#chat > ul");
            if (!chatList) return;
            const observer = new MutationObserver(mutations => {
                observer.disconnect();
                mutations.forEach(m => m.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === "LI") {
                        const msgEl = node.querySelector(".message");
                        this._replaceEmotesInElement(msgEl);
                        if (chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 30) {
                            chatList.scrollTop = chatList.scrollHeight;
                        }
                    }
                }));
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
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === "code") return;

                if (node.nodeType === Node.TEXT_NODE) {
                    const frag = this._processTextSegment(node.textContent);
                    node.replaceWith(frag);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    Array.from(node.childNodes).forEach(walk);
                }
            };
            walk(el);
        }

        _processTextSegment(rawText) {
            const frag = document.createDocumentFragment();

            const segments = rawText.split(/(?<!\\)(?:\\\\)*\\n/);

            for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                const seg = segments[segIdx];
                let buffer = "", i = 0;

                const flush = () => {
                    if (buffer) {
                        frag.appendChild(document.createTextNode(buffer));
                        buffer = "";
                    }
                };

                while (i < seg.length) {
                    if (seg[i] === "\\" && seg[i + 1] === ":") {
                        i += 2;
                        continue;
                    }

                    const rest = seg.slice(i);
                    this.tokenRegex.lastIndex = 0;
                    const m = this.tokenRegex.exec(rest);
                    if (m) {
                        const full = m[0], key = m[1];
                        const absIdx = i + m.index;
                        let k = absIdx - 1, backCount = 0;
                        while (k >= 0 && seg[k] === "\\") {
                            backCount++; k--;
                        }

                        if (backCount % 2 === 1) {
                            flush();
                            frag.appendChild(document.createTextNode(full));
                            i = absIdx + full.length;
                            continue;
                        }

                        if (m.index === 0) {
                            flush();
                            const img = document.createElement("img");
                            img.alt = img.title = full;
                            img.style.cssText = "height: 0.75rem; vertical-align: middle; cursor: pointer; image-rendering: auto;";

                            this._getEmoteUrl(key).then(url => {
                                img.src = url;
                            });
                            img.addEventListener("click", () => navigator.clipboard.writeText(full));
                            frag.appendChild(img);
                            i += full.length;
                            continue;
                        }
                    }

                    const cp = seg.codePointAt(i);
                    if (cp === OLD_RGB_PREFIX && i + 3 < seg.length) {
                        flush();
                        const [rRaw, gRaw, bRaw] = [
                            seg.codePointAt(i + 1),
                            seg.codePointAt(i + 2),
                            seg.codePointAt(i + 3)
                        ];
                        const [r, g, b] = [rRaw & 0xFF, gRaw & 0xFF, bRaw & 0xFF];
                        const raw = seg.slice(i, i + 4);
                        this._appendColor(frag, r, g, b, raw);
                        i += 4;
                        continue;
                    }
                    if (cp >= 0xE000 && cp <= 0xEFFF) {
                        flush();
                        const nib = cp & 0x0FFF;
                        const r = ((nib >> 8) & 0xF) * 17;
                        const g = ((nib >> 4) & 0xF) * 17;
                        const b = (nib & 0xF) * 17;
                        const raw = seg.slice(i, i + 1);
                        this._appendColor(frag, r, g, b, raw);
                        i += 1;
                        continue;
                    }

                    buffer += seg[i++];
                }

                flush();
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

        _initSuggestionListeners() {
            const input = document.querySelector("#chat > input");
            const dd = this.dropdown;
            const OFFSET = this.DROPDOWN_OFFSET_PX;
            const emoteKeys = Object.keys(this.emotes);
            let selectedIndex = -1;

            const wrapChar = ch => `<strong style="color: #ff007f;">${ch}</strong>`;

            const showSuggestions = (q, rect) => {
                const qLow = q.toLowerCase();
                const buckets = [[], [], [], []];
                for (const name of emoteKeys) {
                    const nameLow = name.toLowerCase();
                    if (nameLow === qLow) {
                        buckets[0].push(name);
                    } else if (qLow && nameLow.startsWith(qLow)) {
                        buckets[1].push(name);
                    } else if (qLow && nameLow.includes(qLow)) {
                        buckets[2].push(name);
                    } else if (!qLow || isSubsequence(qLow, nameLow)) {
                        buckets[3].push(name);
                    }
                }

                for (let i = 0; i < buckets.length; i++) {
                    if (i >= 2 && qLow) {
                        buckets[i].sort((a, b) => {
                            const ia = a.toLowerCase().indexOf(qLow[0]);
                            const ib = b.toLowerCase().indexOf(qLow[0]);
                            if (ia !== ib) return ia - ib;
                            return a.length - b.length || a.localeCompare(b);
                        });
                    } else {
                        buckets[i].sort((a, b) => a.length - b.length || a.localeCompare(b));
                    }
                }
                const matches = buckets.flat();
                if (!matches.length) { dd.style.display = "none"; return; }

                dd.innerHTML = "";
                dd.style.display = "block";
                dd.style.left = `${rect.left}px`;
                dd.style.bottom = `${window.innerHeight - rect.top + OFFSET}px`;

                const hdr = document.createElement("div");
                hdr.innerHTML = `<em>Showing top <strong>${matches.length}</strong> suggestion${matches.length === 1 ? "" : "s"}...</em>`;
                hdr.style.cssText = "font-size: 10px; color: #cccccc; padding: 6px; position: sticky; top: 0; background: #2c2c2c;";
                dd.appendChild(hdr);

                matches.forEach((name, idx) => {
                    const item = document.createElement("div");
                    item.className = "dropdown-item";
                    item.dataset.index = idx;
                    item.style.cssText = "padding: 6px; cursor: pointer;";
                    const img = document.createElement("img");
                    img.alt = img.title = `:${name}:`;
                    img.style.cssText = "height: 1rem; vertical-align: middle; margin-right: 4px; image-rendering: auto;";
                    this._getEmoteUrl(name).then(url => img.src = url);
                    item.appendChild(img);

                    let label = "";
                    let qi = 0;
                    for (const ch of name) {
                        if (qi < qLow.length && ch.toLowerCase() === qLow[qi]) {
                            label += wrapChar(ch);
                            qi++;
                        }
                        else label += ch;
                    }
                    item.insertAdjacentHTML("beforeend", `:${label}:`);
                    item.addEventListener("click", () => {
                        input.value = input.value.replace(/(?<!\\):([^:]*)$/, `:${name}: `);
                        dd.style.display = "none"; input.focus();
                    });
                    dd.appendChild(item);
                });
                setSelected(0);
            };

            const isSubsequence = (q, name) => {
                let qi = 0;
                for (const ch of name) {
                    if (qi < q.length && ch === q[qi]) qi++;
                }
                return qi === q.length;
            };

            const clearSelection = () => {
                dd.querySelectorAll(".dropdown-item.selected").forEach(el => {
                    el.classList.remove("selected");
                    el.style.backgroundColor = "#3c3c3c";
                });
            };

            const setSelected = idx => {
                clearSelection();
                if (idx >= 0) {
                    const el = dd.querySelector(`.dropdown-item[data-index="${idx}"]`);
                    if (el) {
                        el.classList.add("selected");
                        el.style.backgroundColor = "#4c4c4c";
                        el.scrollIntoView({
                            block: "nearest"
                        });
                        selectedIndex = idx;
                    }
                } else {
                    selectedIndex = -1;
                }
            };

            input.addEventListener("input", () => {
                const val = input.value;
                const caret = input.selectionStart;
                const before = val.slice(0, caret);

                const m = before.match(/(?<![\\\w]):([^:\s]*)$/);
                if (!m) {
                    this.dropdown.style.display = "none";
                    return;
                }
                if (/:(?:[^:\s]+):$/.test(before)) {
                    this.dropdown.style.display = "none";
                    return;
                }

                showSuggestions(m[1], input.getBoundingClientRect());
            });

            input.addEventListener("keydown", e => {
                if (dd.style.display === "block") {
                    const items = dd.querySelectorAll(".dropdown-item");
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                        e.preventDefault();
                        setSelected((selectedIndex + 1) % items.length);
                    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                        e.preventDefault();
                        setSelected((selectedIndex - 1 + items.length) % items.length);
                    } else if (e.key === "Tab") {
                        if (selectedIndex >= 0) {
                            e.preventDefault();
                            items[selectedIndex].click();
                        }
                    } else if (e.key === "Escape" || e.key === "Enter") {
                        dd.style.display = "none";
                    }
                }
            });

            document.addEventListener("click", e => {
                if (!e.target.closest("#chat-input") && !e.target.closest("#emote-suggestions")) {
                    dd.style.display = "none";
                }
            });
        }
    }

    const manager = new EmotesManager(GM_info.script.version, BASE_URL);
    manager.init();
})();