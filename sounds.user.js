// ==UserScript==
// @name         Multiplayer Piano Optimizations [Sounds]
// @namespace    https://tampermonkey.net/
// @version      1.2.2
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
    function injectScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.async = false;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    await injectScript("https://code.jquery.com/ui/1.12.1/jquery-ui.js");

    if (!MPP.chat.sendPrivate) {
        MPP.chat.sendPrivate = ({ name, color, message }) => {
            MPP.chat.receive({
                m: "a",
                t: Date.now(),
                a: message,
                p: { _id: "usrscr", id: "userscript", name, color },
            });
        };
    }

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

            const stored = localStorage.currentSoundpack || defaultName;
            this.currentSoundpack = this.soundpacks[stored] ? stored : defaultName;
            this.SOUNDS = this.soundpacks[this.currentSoundpack];
            this._loadAssetsForCurrentPack();
        }

        _loadSoundpacks() {
            let saved = {};
            try {
                saved = JSON.parse(localStorage.savedSoundpacks) || {};
            } catch {
                console.warn(
                    "Invalid savedSoundpacks JSON, reverting to builtin only."
                );
                saved = {};
            }

            this.soundpacks = { ...saved };
            builtin.forEach((sp) => this.saveSoundpack(sp, true));
            localStorage.savedSoundpacks = JSON.stringify(this.soundpacks);
        }

        setCurrentSoundpack(name) {
            if (!this.soundpacks[name]) {
                console.warn(`Soundpack "${name}" does not exist.`);
                return;
            }
            this.currentSoundpack = name;
            this.SOUNDS = this.soundpacks[name];
            localStorage.currentSoundpack = name;
            this._refreshDropdown();
            this._loadAssetsForCurrentPack();
        }

        saveSoundpack(obj, loading = false) {
            const { NAME, AUTHOR, MENTION, JOIN, LEAVE } = obj;
            if (!NAME || !AUTHOR || !MENTION || !JOIN || !LEAVE) {
                if (!loading) alert("All fields (NAME, AUTHOR, MENTION, JOIN, LEAVE) are required.");
                return;
            }

            for (const [existingName, sp] of Object.entries(this.soundpacks)) {
                if (sp.MENTION === MENTION && sp.JOIN === JOIN && sp.LEAVE === LEAVE) {
                    if (!loading) alert(`This soundpack is identical to "${existingName}".`);
                    return;
                }
            }

            let unique = NAME;
            let counter = 1;
            while (this.soundpacks[unique]) {
                unique = `${NAME} (${counter++})`;
            }

            this.soundpacks[unique] = {
                NAME: unique,
                AUTHOR,
                MENTION,
                JOIN,
                LEAVE
            };
            localStorage.savedSoundpacks = JSON.stringify(this.soundpacks);
            if (!loading) alert(`Imported soundpack "${unique}".`);
            this._refreshDropdown?.();
        }

        _loadAssetsForCurrentPack() {
            this.audioCache = {};
            ["MENTION", "JOIN", "LEAVE"].forEach(key => {
                const baseSrc = this.SOUNDS[key];
                const timestamp = Date.now();
                const separator = baseSrc.includes("?") ? "&" : "?";
                const bustedSrc = `${baseSrc + separator}_=${timestamp}`;

                const audio = new Audio(bustedSrc);
                audio.preload = "auto";
                audio.volume = this.volume;
                this.audioCache[baseSrc] = audio;
            });
        }

        play(src) {
            const now = Date.now();
            if (!this.lastPlayed[src] || now - this.lastPlayed[src] >= this.GAP_MS) {
                this.lastPlayed[src] = now;
                const original = this.audioCache[src];
                if (original) {
                    const clone = original.cloneNode();
                    clone.volume = this.volume;
                    clone.play().catch(() => { });
                } else {
                    const audio = new Audio(src);
                    audio.volume = this.volume;
                    audio.play().catch(() => { });
                }
            }
        }

        _refreshDropdown() {
            const select = document.querySelector("#soundpack-select");
            if (!select) return;
            select.innerHTML = "";
            for (const [key, sp] of Object.entries(this.soundpacks)) {
                const opt = document.createElement("option");
                opt.value = key;
                opt.textContent = `${sp.NAME} [${sp.AUTHOR}]`;
                if (key === this.currentSoundpack) opt.selected = true;
                select.appendChild(opt);
            }
        }
    }

    const soundManager = new SoundManager(GM_info.script.version);
    let replyTo = {};
    let users = {};

    function onMessage(msg) {
        const sender = msg.p ?? msg.sender;
        replyTo[msg.id] = sender._id;

        const me = MPP.client.user._id;
        const mention = msg.a.includes(`@${me}`);
        const replyMention = msg.r && replyTo[msg.r] === me;

        if ((mention || replyMention) && !document.hasFocus()) {
            soundManager.play(soundManager.SOUNDS.MENTION);
        }
    }
    MPP.client.on("a", onMessage);
    MPP.client.on("dm", onMessage);
    MPP.client.on("ch", (ch) => {
        users = {};
        ch.ppl.forEach((u) => (users[u._id] = u));
    });
    MPP.client.on("p", (p) => {
        if (!users[p._id]) {
            soundManager.play(soundManager.SOUNDS.JOIN);
        }
        users[p._id] = p;
    });
    MPP.client.on("bye", (u) => {
        soundManager.play(soundManager.SOUNDS.LEAVE);
        delete users[u.p];
    });
    MPP.client.on("c", () => {
        MPP.chat.sendPrivate({
            name: `[MPP Sounds] v${soundManager.version}`,
            color: "#ffaa00",
            message: "Sound alerts loaded.",
        });
    });

    const topOffset = $(".mpp-hats-button").length ? 84 : 58;
    const $btn = $(
        `<button id="soundpack-btn" class="ugly-button top-button" style="position: fixed; right: 6px; top: ${topOffset}px; z-index: 100; padding: 5px;">MPP Sounds</button>`
    );
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
                <input type="file" id="soundpack-file" accept=".json"/>
            </label>
            </p>
            <p>
            <label>Reset Soundpacks:
                <button id="reset-soundpacks">Reset to default</button>
            </label>
            </p>
            <p><button id="soundpack-submit" class="submit">OK</button></p>
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
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                soundManager.saveSoundpack(data);
            } catch {
                alert("Invalid JSON file.");
            } finally {
                this.value = "";
            }
        };
        reader.onerror = () => alert("Failed to read file.");
        reader.readAsText(file);
    });
    $("#soundpack-submit").on("click", () => {
        const sel = $("#soundpack-select").val();
        soundManager.setCurrentSoundpack(sel);
        hideAllModals();
    });
    $("#reset-soundpacks").on("click", () => {
        if (
            confirm("Are you sure you want to reset your soundpacks?") &&
            confirm("Are you absolutely sure you want to reset your soundpacks?") &&
            confirm("ARE YOU TOTALLY ABSOLUTELY 100% SURE? THERE IS NO GOING BACK.")
        ) {
            soundManager.soundpacks = {};
            builtin.forEach((sp) => soundManager.saveSoundpack(sp, true));
            localStorage.savedSoundpacks = JSON.stringify(soundManager.soundpacks);
            alert("Successfully reset your soundpacks!");
            soundManager.setCurrentSoundpack(defaultName);
        }
    });
})();