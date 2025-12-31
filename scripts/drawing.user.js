// ==UserScript==
// @name         Multiplayer Piano Optimizations [Drawing]
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  Draw on the screen!
// @author       zackiboiz
// @match        *://*.multiplayerpiano.com/*
// @match        *://*.multiplayerpiano.net/*
// @match        *://dev.multiplayerpiano.net/*
// @match        *://*.multiplayerpiano.org/*
// @match        *://*.multiplayerpiano.dev/*
// @match        *://piano.mpp.community/*
// @match        *://mpp.7458.space/*
// @match        *://qmppv2.qwerty0301.repl.co/*
// @match        *://mpp.8448.space/*
// @match        *://mpp.hri7566.info/*
// @match        *://mpp.autoplayer.xyz/*
// @match        *://mpp.hyye.xyz/*
// @match        *://lmpp.hyye.xyz/*
// @match        *://mpp.hyye.tk/*
// @match        *://mpp.smp-meow.net/*
// @match        *://piano.ourworldofpixels.com/*
// @match        *://mpp.lapishusky.dev/*
// @match        *://staging-mpp.sad.ovh/*
// @match        *://mpp.terrium.net/*
// @match        *://mpp.yourfriend.lv/*
// @match        *://mpp.l3m0ncao.wtf/*
// @match        *://beta-mpp.csys64.com/*
// @match        *://fleetway-mpp.glitch.me/*
// @match        *://mpp.totalh.net/*
// @match        *://mpp.meowbin.com/*
// @match        *://mppfork.netlify.app/*
// @match        *://better.mppclone.me/*
// @match        *://*.openmpp.tk/*
// @match        *://*.mppkinda.com/*
// @match        *://*.augustberchelmann.com/piano/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=multiplayerpiano.net
// @grant        GM_info
// @license      MIT
// @downloadURL  !!!
// @updateURL    !!!
// ==/UserScript==

/*
TODO:
    - client-bound packets
        - ignore users from other rooms
        - decode packet
        - draw lines or erase lines
    - customizeable settings
        - color
        - line width
        - erase factor
        - line life
        - line fade
    - qol features
        - mute lines
        - disable/enable
        - fix mac cmd/ctrl
    - bug testing
    - write readme
    - push to greasyfork
    - implement into zackibot cursor animations
        - lineLifeMs: totalMs - elapsedMs + endAnimationMs * elapsedMs / totalMs
        - lineFadeMs: fadeMs
*/

(async () => {
    const dl = GM_info.script.downloadURL || GM_info.script.updateURL || GM_info.script.homepageURL || "";
    const match = dl.match(/greasyfork\.org\/scripts\/(\d+)/);
    if (!match) {
        console.warn("Could not find Greasy Fork script ID in downloadURL/updateURL/homepageURL:", dl);
    } else {
        const scriptId = match[1];
        const localVersion = GM_info.script.version;
        const apiUrl = `https://greasyfork.org/scripts/${scriptId}.json?_=${Date.now()}`;

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


    Math.clamp = (min, x, max) => Math.min(max, Math.max(min, x));

    class Drawboard {
        #canvas;
        #ctx;
        #connected = false;
        #enabled = true;
        #isShiftDown = false;
        #isCtrlDown = false;
        #clicking = false;
        #lastPosition;
        #position;
        #color = "#000000";
        #lineWidth = 3;
        #eraseFactor = 8;
        #lineLifeMs = 5000;
        #lineFadeMs = 3000;
        #lineBuffer = [];
        #opBuffer = [];
        #payloadFlushMs = 200;
        #flushInterval;

        constructor() {
            this.#canvas = document.createElement("canvas");
            this.#canvas.id = "drawboard";
            this.#canvas.style.position = "absolute";
            this.#canvas.style.top = "0px";
            this.#canvas.style.left = "0px";
            this.#canvas.style.zIndex = "400";
            this.#canvas.style.pointerEvents = "none";
            document.documentElement.appendChild(this.#canvas);

            this.#ctx = this.#canvas.getContext("2d");
            this.#resize();
            this.#init();
        }

        get participant() {
            return MPP.client.getOwnParticipant();
        }
        get participants() {
            return MPP.client.ppl;
        }

        get canvas() {
            return this.#canvas;
        }
        get ctx() {
            return this.#ctx;
        }
        get connected() {
            return this.#connected;
        }
        get enabled() {
            return this.#enabled;
        }
        get lastPosition() {
            return this.#lastPosition;
        }
        get position() {
            return this.#position;
        }
        get color() {
            return this.#color;
        }
        get lineWidth() {
            return this.#lineWidth;
        }
        get eraseFactor() {
            return this.#eraseFactor;
        }
        get lineLifeMs() {
            return this.#lineLifeMs;
        }
        get lineFadeMs() {
            return this.#lineFadeMs;
        }

        set enabled(enabled) {
            this.#enabled = enabled;
        }
        set color(color) {
            this.#color = color;
        }
        set lineWidth(lineWidth) {
            this.#lineWidth = lineWidth;
        }
        set eraseFactor(eraseFactor) {
            this.#eraseFactor = eraseFactor;
        }
        set lineLifeMs(lineLifeMs) {
            this.#lineLifeMs = lineLifeMs;
        }
        set lineFadeMs(lineFadeMs) {
            this.#lineFadeMs = lineFadeMs;
        }

        #resize = () => {
            this.#canvas.width = window.innerWidth;
            this.#canvas.height = window.innerHeight;
        }

        #init = () => {
            window.addEventListener("resize", this.#resize);
            document.addEventListener("keydown", (e) => {
                this.#isShiftDown = e.shiftKey;
                this.#isCtrlDown = e.ctrlKey;
            });
            document.addEventListener("keyup", (e) => {
                this.#isShiftDown = e.shiftKey;
                this.#isCtrlDown = e.ctrlKey;
            });
            document.addEventListener("mousedown", (e) => {
                this.#updatePosition();
                this.#clicking = true;
                if ((this.#isShiftDown || this.#isCtrlDown) && this.#clicking) {
                    e.preventDefault();
                }
            });
            document.addEventListener("mouseup", (e) => {
                this.#updatePosition();
                this.#clicking = false;
                this.#flushOpBuffer();
            });
            document.addEventListener("mousemove", (e) => {
                this.#updatePosition();
                if (!this.#lastPosition) this.#lastPosition = this.#position;
                if (this.#isShiftDown && this.#clicking) {
                    this.#updateValues();

                    const uuid = this.generateUUID();
                    this.drawLine({
                        x1: this.#lastPosition.x,
                        y1: this.#lastPosition.y,
                        x2: this.#position.x,
                        y2: this.#position.y,
                        color: this.#color,
                        lineWidth: this.#lineWidth,
                        lineLifeMs: this.#lineLifeMs,
                        lineFadeMs: this.#lineFadeMs,
                        uuid: uuid
                    });

                    const op = this.#buildDrawPacket(uuid, this.#position.x, this.#position.y, this.#color, this.#lineWidth, this.#lineLifeMs, this.#lineFadeMs);
                    this.#opBuffer.push(op);
                } else if (this.#isCtrlDown && this.#clicking) {
                    this.#updateValues();
                    const maxDim = Math.max(this.#canvas.width, this.#canvas.height) || 1;
                    const radius = this.#lineWidth * this.#eraseFactor / maxDim;

                    const removedUuids = this.erase({
                        x: this.#position.x,
                        y: this.#position.y,
                        radius: radius
                    });

                    for (const uuid of removedUuids) {
                        const op = this.#buildErasePacket(uuid);
                        this.#opBuffer.push(op);
                    }
                }
            });

            requestAnimationFrame(this.#draw);
            this.#flushInterval = setInterval(this.#flushOpBuffer, this.#payloadFlushMs);

            window.addEventListener("beforeunload", () => {
                if (this.#flushInterval) clearInterval(this.#flushInterval);
            });
        }

        #writeFloat64LE = (bytes, val) => {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, val, true);
            const u8 = new Uint8Array(buf);
            for (let b of u8) bytes.push(b);
        }

        #writeFloat32LE = (bytes, val) => {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, val, true);
            const u8 = new Uint8Array(buf);
            for (let b of u8) bytes.push(b);
        }

        #writeULEB128 = (bytes, val) => {
            val = Math.max(0, Math.floor(val));
            while (val > 0x7F) {
                bytes.push((val & 0x7F) | 0x80);
                val >>>= 7;
            }

            bytes.push(val & 0x7F);
        }

        #writeColor = (bytes, hex) => {
            let part = [0, 0, 0];
            if (hex) {
                if (hex.startsWith("#")) hex = hex.slice(1);
                if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
                const num = parseInt(hex, 16) || 0;
                part = [(num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF];
            }

            bytes.push(...part);
        }

        #writeString = (bytes, strOrBytes) => {
            if (strOrBytes instanceof Uint8Array) {
                this.#writeULEB128(bytes, strOrBytes.length);
                for (const b of strOrBytes) bytes.push(b);
                return;
            }

            const textEncoder = new TextEncoder();
            const buf = textEncoder.encode(String(strOrBytes));
            this.#writeULEB128(bytes, buf.length);
            for (const b of buf) bytes.push(b);
        }

        #buildDrawPacket = (uuid, x, y, color, lineWidth, lifeMs, fadeMs) => {
            const bytes = [];
            bytes.push(1);
            this.#writeString(bytes, uuid);
            this.#writeColor(bytes, color);
            this.#writeFloat32LE(bytes, x);
            this.#writeFloat32LE(bytes, y);
            bytes.push(lineWidth & 0xFF);
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lifeMs)));
            this.#writeULEB128(bytes, Math.max(0, Math.floor(fadeMs)));

            return bytes;
        }

        #buildErasePacket = (uuid) => {
            const bytes = [];
            bytes.push(0);
            this.#writeString(bytes, uuid);

            return bytes;
        }

        #sendCustomData = (finalPayload) => {
            if (MPP?.client?.sendArray) {
                MPP.client.sendArray([{
                    m: "custom",
                    data: {
                        drawboard: finalPayload
                    },
                    target: { mode: "subscribed" }
                }]);
            }
        }

        #updatePosition = () => {
            this.#lastPosition = this.#position;
            const participant = this.participant;
            this.#position = {
                x: Math.clamp(0, participant.x, 100) / 100,
                y: Math.clamp(0, participant.y, 100) / 100
            };
        }

        #flushOpBuffer = () => {
            if (!this.#opBuffer.length) return;

            const bytes = [];
            this.#writeULEB128(bytes, this.#opBuffer.length);
            for (const op of this.#opBuffer) {
                for (const b of op) bytes.push(b);
            }
            const finalPayload = String.fromCharCode(...bytes);
            this.#sendCustomData(finalPayload);
            this.#opBuffer.length = 0;
        }

        #updateValues = () => {
            const participant = this.participant;
            this.#color = participant.color;
        }

        #pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
            const vx = x2 - x1;
            const vy = y2 - y1;
            const wx = px - x1;
            const wy = py - y1;
            const c = (wx * vx + wy * vy);
            const d = (vx * vx + vy * vy);
            let t = 0;
            if (d !== 0) t = Math.max(0, Math.min(1, c / d));
            const projx = x1 + t * vx;
            const projy = y1 + t * vy;
            const dx = px - projx;
            const dy = py - projy;
            return Math.sqrt(dx * dx + dy * dy);
        }

        #clear = () => {
            this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        }

        #draw = () => {
            if (!this.#connected) {
                if (MPP?.client?.sendArray) {
                    MPP.client.sendArray([{
                        m: "+custom"
                    }]);
                    this.#connected = true;
                } else {
                    return;
                }
            }
            if (!this.#enabled) return;

            this.#clear();
            const now = Date.now();
            for (let i = this.#lineBuffer.length - 1; i >= 0; i--) {
                const line = this.#lineBuffer[i];

                const timestamp = line.timestamp || 0;
                const life = line.lineLifeMs;
                const fade = line.lineFadeMs;
                const age = now - timestamp;

                if (age >= life + fade) {
                    this.#lineBuffer.splice(i, 1);
                    continue;
                }

                let alpha = 1;
                if (age > life) {
                    const fadeAge = age - life;
                    alpha = Math.clamp(0, 1 - (fadeAge / fade), 1);
                }

                this.#ctx.globalAlpha = alpha;
                this.#ctx.globalCompositeOperation = "source-over";
                this.#ctx.strokeStyle = line.color;
                this.#ctx.lineWidth = line.lineWidth;
                // this.#ctx.lineCap = "round";
                this.#ctx.beginPath();
                this.#ctx.moveTo(line.x1 * this.#canvas.width, line.y1 * this.#canvas.height);
                this.#ctx.lineTo(line.x2 * this.#canvas.width, line.y2 * this.#canvas.height);
                this.#ctx.stroke();
            }
            this.#ctx.globalAlpha = 1;

            requestAnimationFrame(this.#draw);
        }

        generateUUID = () => {
            const arr = new Uint8Array(6);
            if (typeof crypto !== "undefined" && crypto.getRandomValues) {
                crypto.getRandomValues(arr);
            } else {
                for (let i = 0; i < 6; i++) arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        }

        uuidToHex = (u8) => {
            if (!(u8 instanceof Uint8Array)) return String(u8);
            return Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");
        };

        drawLine = ({ x1, y1, x2, y2, color, lineWidth, lineLifeMs, lineFadeMs, uuid }) => {
            this.#lineBuffer.push({
                x1, y1,
                x2, y2,
                color,
                lineWidth,
                lineLifeMs,
                lineFadeMs,
                timestamp: Date.now(),
                uuid: uuid
            });
        }

        erase = ({ x, y, radius }) => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return [];
            const removed = [];
            for (let i = this.#lineBuffer.length - 1; i >= 0; i--) {
                const line = this.#lineBuffer[i];
                const d = this.#pointToSegmentDistance(x, y, line.x1, line.y1, line.x2, line.y2);
                if (d <= radius) {
                    if (line.uuid) removed.push(line.uuid);
                    this.#lineBuffer.splice(i, 1);
                }
            }

            return Array.from(new Set(removed));
        }
    }

    MPP.drawboard = new Drawboard();
})();