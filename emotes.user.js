// ==UserScript==
// @name         Multiplayer Piano Optimizations [Emotes]
// @namespace    https://tampermonkey.net/
// @version      1.4.0
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
// @grant        GM_info
// @license      MIT
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
            this.tokenRegex = null;

            this.MAX_SUGGESTIONS = 100;
            this.DROPDOWN_OFFSET_PX = 10;

            this.dropdown = document.createElement("div");
            this.dropdown.id = "emote-suggestions";
            Object.assign(this.dropdown.style, {
                position: "absolute",
                backgroundColor: "#333",
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
        }

        async init() {
            try {
                await this._loadEmotesMeta();
                await this._preloadEmotes();
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
            await Promise.all(
                Object.entries(this.emotes).map(async ([key, ext]) => {
                    try {
                        const resp = await fetch(`${this.baseUrl}/emotes/assets/${key}.${ext}?_=${Date.now()}`);
                        const blob = await resp.blob();
                        this.emoteUrls[key] = URL.createObjectURL(blob);
                    } catch (e) {
                        console.warn(`Could not preload emote "${key}":`, e);
                    }
                })
            );
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
            let lastIndex = 0, m;
            while ((m = this.tokenRegex.exec(rawText)) !== null) {
                const [full, key] = m;
                if (m.index > lastIndex) {
                    frag.appendChild(document.createTextNode(rawText.slice(lastIndex, m.index)));
                }
                const img = document.createElement("img");
                img.src = this.emoteUrls[key] || "";
                img.alt = img.title = full;
                img.style.height = "0.75rem";
                img.style.verticalAlign = "middle";
                img.style.cursor = "pointer";
                img.addEventListener("click", () => navigator.clipboard.writeText(full));
                frag.appendChild(img);
                lastIndex = m.index + full.length;
            }
            if (lastIndex < rawText.length) {
                frag.appendChild(document.createTextNode(rawText.slice(lastIndex)));
            }
            return frag;
        }

        _initSuggestionListeners() {
            const input = document.querySelector("#chat-input");
            if (!input) return;
            const dd = this.dropdown;
            const MAX = this.MAX_SUGGESTIONS;
            const OFFSET = this.DROPDOWN_OFFSET_PX;
            const emoteKeys = Object.keys(this.emotes);
            let selectedIndex = -1;

            const wrapChar = ch => `<strong style="color: #ff007f;">${ch}</strong>`;

            function showSuggestions(q, rect) {
                const qLow = q.toLowerCase();
                const buckets = [[], [], [], []];
                for (const name of emoteKeys) {
                    const nameLow = name.toLowerCase();
                    if (nameLow === qLow) {
                        buckets[0].push(name);
                    } else if (nameLow.startsWith(qLow)) {
                        buckets[1].push(name);
                    } else if (nameLow.includes(qLow)) {
                        buckets[2].push(name);
                    } else {
                        let qi = 0;
                        for (const ch of nameLow) {
                            if (qi < qLow.length && ch === qLow[qi]) qi++;
                        }
                        if (qi === qLow.length) buckets[3].push(name);
                    }
                }
                for (const arr of buckets) arr.sort((a, b) => a.length - b.length || a.localeCompare(b));
                const matches = buckets.flat().slice(0, MAX);
                if (!matches.length) {
                    dd.style.display = "none";
                    return;
                }
                dd.innerHTML = "";
                dd.style.display = "block";
                dd.style.left = rect.left + "px";
                dd.style.bottom = (window.innerHeight - rect.top + OFFSET) + "px";

                const hdr = document.createElement("div");
                hdr.innerHTML = `<em>Showing top <strong>${matches.length}</strong> suggestion${matches.length === 1 ? "" : "s"}...</em>`;
                hdr.style.cssText = "font-size: 10px; color: #cccccc; padding: 6px; position: sticky; top: 0; background: #2c2c2c;";
                dd.appendChild(hdr);

                matches.forEach((name, idx) => {
                    const item = document.createElement("div");
                    item.className = "dropdown-item";
                    item.style.padding = "6px";
                    item.style.cursor  = "pointer";
                    item.dataset.index = idx;

                    const img = document.createElement("img");
                    img.src = this.emoteUrls[name] || "";
                    img.alt = img.title = `:${name}:`;
                    img.style.height = "1rem";
                    img.style.verticalAlign = "middle";
                    img.style.marginRight = "4px";
                    item.appendChild(img);

                    let label = "";
                    let qi = 0;
                    for (const ch of name.split("")) {
                        if (qi < qLow.length && ch.toLowerCase() === qLow[qi]) {
                            label += wrapChar(ch);
                            qi++;
                        } else {
                            label += ch;
                        }
                    }
                    item.insertAdjacentHTML("beforeend", `:${label}:`);

                    item.addEventListener("mouseenter", () => setSelected(idx));
                    item.addEventListener("mouseleave", () => setSelected(-1));
                    item.addEventListener("click", () => select(idx));

                    dd.appendChild(item);
                });

                selectedIndex = -1;
            }

            function clearSelection() {
                dd.querySelectorAll(".dropdown-item.selected").forEach(el => {
                    el.classList.remove("selected");
                    el.style.backgroundColor = "#3c3c3c";
                });
            }
            function setSelected(idx) {
                clearSelection();
                if (idx >= 0) {
                    const el = dd.querySelector(`.dropdown-item[data-index="${idx}"]`);
                    if (el) {
                        el.classList.add("selected");
                        el.style.backgroundColor = "#4c4c4c";
                        el.scrollIntoView({ block: "nearest" });
                        selectedIndex = idx;
                    }
                } else {
                    selectedIndex = -1;
                }
            }
            function select(idx) {
                const el = dd.querySelector(`.dropdown-item[data-index="${idx}"]`);
                if (el) {
                    const text = `${el.innerText.trim()} `;
                    input.value = input.value.replace(/(?<!\\):([^:]*)$/, text);
                }
                dd.style.display = "none";
                input.focus();
            }

            input.addEventListener("input", () => {
                const val = input.value, caret = input.selectionStart;
                const before = val.slice(0, caret);
                const m = before.match(/(?<!\\):([^:]+)$/);
                if (m) {
                    showSuggestions.call(this, m[1], input.getBoundingClientRect());
                } else {
                    dd.style.display = "none";
                }
            });

            input.addEventListener("keydown", e => {
                if (dd.style.display === "block") {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSelected((selectedIndex + 1) % dd.querySelectorAll(".dropdown-item").length);
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const len = dd.querySelectorAll(".dropdown-item").length;
                        setSelected((selectedIndex - 1 + len) % len);
                    } else if (e.key === "Tab") {
                        if (selectedIndex >= 0) {
                            e.preventDefault();
                            select(selectedIndex);
                        }
                    } else if (e.key === "Escape") {
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