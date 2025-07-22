// ==UserScript==
// @name         Multiplayer Piano Optimizations [Sounds]
// @namespace    https://tampermonkey.net/
// @version      1.4.2
// @description  Play sounds when users join, leave, or mention you in Multiplayer Piano
// @author       zackiboiz, cheezburger0, ccjit
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
// @downloadURL  https://update.greasyfork.org/scripts/542502/Multiplayer%20Piano%20Optimizations%20%5BSounds%5D.user.js
// @updateURL    https://update.greasyfork.org/scripts/542502/Multiplayer%20Piano%20Optimizations%20%5BSounds%5D.meta.js
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

    const builtin = [
        {
            NAME: "Default",
            AUTHOR: "Zacki",
            MENTION: "https://files.catbox.moe/f5tzag.mp3",
            JOIN: "https://files.catbox.moe/t3ztlz.mp3",
            LEAVE: "https://files.catbox.moe/kmpz7e.mp3"
        },
        {
            NAME: "PRISM",
            AUTHOR: "ccjit",
            MENTION: "https://file.garden/aHFDYCLeNBLSceNi/Swoosh.wav",
            JOIN: "https://file.garden/aHFDYCLeNBLSceNi/Plug%20In.wav",
            LEAVE: "https://file.garden/aHFDYCLeNBLSceNi/Plug%20Out.wav"
        },
        {
            NAME: "Win7",
            AUTHOR: "cheezburger0",
            MENTION: "https://file.garden/ZXdl6GMYuz15ftGp/Windows%20Notify.wav",
            JOIN: "https://file.garden/ZXdl6GMYuz15ftGp/Windows%20Logon%20Sound.wav",
            LEAVE: "https://file.garden/ZXdl6GMYuz15ftGp/Windows%20Recycle.wav"
        },
        {
            NAME: "Win11",
            AUTHOR: "ccjit",
            MENTION: "https://file.garden/aHFDYCLeNBLSceNi/Win11%20Notify.wav",
            JOIN: "https://file.garden/aHFDYCLeNBLSceNi/Win11%20Plug%20In.wav",
            LEAVE: "https://file.garden/aHFDYCLeNBLSceNi/Win11%20Plug%20Out.wav"
        },
        {
            NAME: "Discord",
            AUTHOR: "ccjit",
            MENTION: "https://file.garden/aHFDYCLeNBLSceNi/Discord%20Ping.mp3",
            JOIN: "https://file.garden/aHFDYCLeNBLSceNi/Discord%20Join.mp3",
            LEAVE: "https://file.garden/aHFDYCLeNBLSceNi/Discord%20Leave.mp3"
        },
        {
            NAME: "Xylo",
            AUTHOR: "cheezburger0",
            MENTION: "https://file.garden/ZXdl6GMYuz15ftGp/mention.wav",
            JOIN: "https://file.garden/ZXdl6GMYuz15ftGp/join.wav",
            LEAVE: "https://file.garden/ZXdl6GMYuz15ftGp/leave.wav"
        },
        {
            NAME: "Skype 1",
            AUTHOR: "ccjit",
            MENTION: "https://file.garden/aHFDYCLeNBLSceNi/SKYPE_IM_ACC_MENTION.flac",
            JOIN: "https://file.garden/aHFDYCLeNBLSceNi/SKYPE_USER_ADDED.flac",
            LEAVE: "https://file.garden/aHFDYCLeNBLSceNi/SKYPE_USER_LEFT.flac"
        },
        {
            NAME: "Piano",
            AUTHOR: "cheezburger0",
            MENTION: "https://file.garden/ZXdl6GMYuz15ftGp/mention-2.wav",
            JOIN: "https://file.garden/ZXdl6GMYuz15ftGp/join-2.wav",
            LEAVE: "https://file.garden/ZXdl6GMYuz15ftGp/leave-2.wav"
        }
    ];
    const defaultName = builtin[0].NAME;

    class SoundManager {
        constructor(version) {
            this.version = version;
            this.GAP_MS = 200;
            this.volume = 1.0;
            this.lastPlayed = {};
            this.audioCache = {};

            this._loadSoundpacks();

            const stored = localStorage.currentSoundpack;
            this.currentSoundpack = (stored && this.soundpacks[stored]) ? stored : "";
            this.SOUNDS = this.soundpacks[this.currentSoundpack] || {};
            this._loadAssetsForCurrentPack();
        }

        _loadSoundpacks() {
            let saved = {};
            let shouldReset = false;

            try {
                saved = JSON.parse(localStorage.savedSoundpacks) || {};
            } catch {
                console.warn("Invalid savedSoundpacks JSON. Resetting saved list.");
                saved = {};
                shouldReset = true;
            }
            this.soundpacks = { ...saved };

            const didInit = localStorage.initializedSoundpacks === "true";
            if ((!didInit && Object.keys(this.soundpacks).length === 0) || shouldReset) {
                builtin.forEach(sp => this.saveSoundpack(sp, true));
                localStorage.initializedSoundpacks = "true";
            }

            localStorage.savedSoundpacks = JSON.stringify(this.soundpacks);
        }

        setCurrentSoundpack(name) {
            if (name && !this.soundpacks[name]) {
                console.warn(`Soundpack "${name}" does not exist.`);
                return;
            }
            this.currentSoundpack = name;
            localStorage.currentSoundpack = name;
            this.SOUNDS = this.soundpacks[name] || {};
            this._refreshDropdown();
            this._loadAssetsForCurrentPack();
        }

        saveSoundpack(obj, loading = false) {
            const { NAME, AUTHOR, MENTION, JOIN, LEAVE } = obj;
            if (!NAME || !AUTHOR || !MENTION || !JOIN || !LEAVE) {
                if (!loading) alert("All fields (NAME, AUTHOR, MENTION, JOIN, LEAVE) are required.");
                return;
            }

            for (const [k, sp] of Object.entries(this.soundpacks)) {
                if (sp.MENTION === MENTION && sp.JOIN === JOIN && sp.LEAVE === LEAVE) {
                    if (!loading) alert(`Imported soundpack "${NAME}" is identical to soundpack "${k}".`);
                    return;
                }
            }

            let unique = NAME, i = 1;
            while (this.soundpacks[unique]) unique = `${NAME} (${i++})`;

            this.soundpacks[unique] = {
                NAME: unique,
                AUTHOR,
                MENTION,
                JOIN,
                LEAVE
            };
            localStorage.savedSoundpacks = JSON.stringify(this.soundpacks);
            if (!loading) alert(`Imported soundpack "${unique}".`);
            this._refreshDropdown();
        }

        deleteSoundpack(name) {
            if (!this.soundpacks[name]) return;
            const keys = Object.keys(this.soundpacks);

            if (keys.length <= 1) {
                if (!confirm("This is your last soundpack. Deleting it will leave you with no sounds at all. Are you sure?")) {
                    return;
                }
            }

            delete this.soundpacks[name];
            localStorage.savedSoundpacks = JSON.stringify(this.soundpacks);

            const remain = Object.keys(this.soundpacks);
            const next = remain.length ? remain[0] : "";
            this.setCurrentSoundpack(next);
        }

        _loadAssetsForCurrentPack() {
            this.audioCache = {};
            ["MENTION", "JOIN", "LEAVE"].forEach(key => {
                const base = this.SOUNDS[key];
                if (!base) return;
                const sep = base.includes("?") ? "&" : "?";
                const busted = `${base}${sep}_=${Date.now()}`;
                const a = new Audio(busted);
                a.preload = "auto";
                a.volume = this.volume;
                this.audioCache[base] = a;
            });
        }

        play(src) {
            if (!src) return;
            const now = Date.now();
            if (!this.lastPlayed[src] || now - this.lastPlayed[src] >= this.GAP_MS) {
                this.lastPlayed[src] = now;
                const orig = this.audioCache[src];
                if (orig) {
                    const c = orig.cloneNode();
                    c.volume = this.volume;
                    c.play().catch(() => { });
                } else {
                    new Audio(src).play().catch(() => { });
                }
            }
        }

        _refreshDropdown() {
            const sel = document.querySelector("#soundpack-select");
            if (!sel) return;
            sel.innerHTML = "";

            const noneOpt = document.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "No Sounds";
            if (!this.currentSoundpack) noneOpt.selected = true;
            sel.appendChild(noneOpt);

            for (const [k, sp] of Object.entries(this.soundpacks)) {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = `${sp.NAME} [${sp.AUTHOR}]`;
                if (k === this.currentSoundpack) o.selected = true;
                sel.appendChild(o);
            }
        }
    }

    const soundManager = new SoundManager(GM_info.script.version);
    let replyTo = {}, users = {};

    function onMessage(msg) {
        const sender = msg.p ?? msg.sender;
        replyTo[msg.id] = sender._id;
        const me = MPP.client.user._id;
        const mention = msg.a.includes(`@${me}`);
        const replyMention = msg.r && replyTo[msg.r] === me;

        if ((mention || replyMention) &&
            (!document.hasFocus() || MPP.client.getOwnParticipant().afk)) {
            soundManager.play(soundManager.SOUNDS.MENTION);
        }
    }

    MPP.client.on("a", onMessage);
    MPP.client.on("dm", onMessage);
    MPP.client.on("ch", ch => {
        users = {};
        ch.ppl.forEach(u => (users[u._id] = u));
    });
    MPP.client.on("p", p => {
        if (!users[p._id]) soundManager.play(soundManager.SOUNDS.JOIN);
        users[p._id] = p;
    });
    MPP.client.on("bye", u => {
        soundManager.play(soundManager.SOUNDS.LEAVE);
        delete users[u.p];
    });

    const topOff = document.getElementsByClassName("mpp-hats-button").length ? 84 : 58;
    const $btn = $(`
        <button id="soundpack-btn" class="top-button" 
            style="position: fixed; right: 6px; top: ${topOff}px; z-index: 100; padding: 5px;">
            MPP Sounds
        </button>
    `);
    $("body").append($btn);

    const $modal = $(`
        <div id="soundpack-modal" class="dialog" style="height: 240px; margin-top: -120px; display: none;">
            <h3>MPP Sounds</h3><hr>
            <p>
                <label>Select soundpack:
                    <select id="soundpack-select" class="text"></select>
                </label>
            </p>
            <p>
                <label>Import from JSON:
                    <input type="file" id="soundpack-file" accept=".json" multiple/>
                </label>
            </p>
            <p>
                <label>Delete Soundpack:
                    <button id="delete-soundpack">Delete this soundpack</button>
                </label>
                <label>Reset Soundpacks:
                    <button id="reset-soundpacks">Reset to default</button>
                </label>
            </p>
            <p><button id="soundpack-submit" class="submit">OK</button></p>
            <p>
                <a href="https://github.com/ZackiBoiz/Multiplayer-Piano-Optimizations/tree/main/soundpacks" target="_blank"
                    style="position: absolute; left: 0;bottom: 0; margin: 10px; font-size: 0.5rem;">
                    Find more soundpacks
                </a>
            </p>
        </div>
    `);
    $("#modal #modals").append($modal);

    function hideAllModals() {
        $("#modal #modals > *").hide();
        $("#modal").hide();
    }
    function showModal() {
        if (MPP.chat) MPP.chat.blur();
        hideAllModals();
        soundManager._refreshDropdown();
        $("#modal").fadeIn(250);
        $modal.show();
    }

    $btn.on("click", showModal);

    $("#soundpack-file").on("change", function () {
        const files = Array.from(this.files);
        if (!files.length) return;

        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    soundManager.saveSoundpack(data);
                } catch (err) {
                    alert(`Failed to import "${file.name}".`);
                }
            };
            reader.onerror = () => {
                alert(`Failed to read file "${file.name}".`);
            };
            reader.readAsText(file);
        });

        this.value = "";
    });

    $("#soundpack-submit").on("click", () => {
        const sel = $("#soundpack-select").val();
        soundManager.setCurrentSoundpack(sel);
        hideAllModals();
    });

    $("#delete-soundpack").on("click", () => {
        if (!confirm("Are you sure you want to delete this soundpack?")) return;
        const cur = soundManager.currentSoundpack;
        if (!cur) {
            alert("No soundpack selected to delete.");
            return;
        }
        soundManager.deleteSoundpack(cur);
    });

    $("#reset-soundpacks").on("click", () => {
        if (!confirm("Are you sure you want to reset your soundpacks?")) return;
        if (!confirm("Are you absolutely sure? This will erase all your custom packs.")) return;
        if (!confirm("ARE YOU TOTALLY ABSOLUTELY 100% SURE? THIS IS NOT REVERSABLE!")) return;
        localStorage.savedSoundpacks = "{}";
        localStorage.currentSoundpack = defaultName;
        localStorage.initializedSoundpacks = "false";

        soundManager._loadSoundpacks();
        soundManager.setCurrentSoundpack(defaultName);

        alert("Successfully reset your soundpacks!");
    });
})();