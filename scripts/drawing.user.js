// ==UserScript==
// @name         Multiplayer Piano Optimizations [Drawing]
// @namespace    https://tampermonkey.net/
// @version      1.0.3
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
// @downloadURL  https://update.greasyfork.org/scripts/561021/Multiplayer%20Piano%20Optimizations%20%5BDrawing%5D.user.js
// @updateURL    https://update.greasyfork.org/scripts/561021/Multiplayer%20Piano%20Optimizations%20%5BDrawing%5D.meta.js
// ==/UserScript==

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
            this.#canvas.style.zIndex = "800";
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
        static get connected() {
            return MPP && MPP.client && MPP.client.isConnected() && MPP.client.channel && MPP.client.user && MPP.client.ppl
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

                    this.drawLine({
                        x1: this.#lastPosition.x,
                        y1: this.#lastPosition.y,
                        x2: this.#position.x,
                        y2: this.#position.y,
                        color: this.#color,
                        lineWidth: this.#lineWidth,
                        lineLifeMs: this.#lineLifeMs,
                        lineFadeMs: this.#lineFadeMs,
                        uuid: this.generateUUID()
                    });
                } else if (this.#isCtrlDown && this.#clicking) {
                    this.#updateValues();
                    const maxDim = Math.max(this.#canvas.width, this.#canvas.height) || 1;
                    const radius = this.#lineWidth * this.#eraseFactor / maxDim;

                    this.erase({
                        x: this.#position.x,
                        y: this.#position.y,
                        radius: radius
                    });
                }
            });

            requestAnimationFrame(this.#draw);
            this.#flushInterval = setInterval(this.#flushOpBuffer, this.#payloadFlushMs);

            window.addEventListener("beforeunload", () => {
                if (this.#flushInterval) clearInterval(this.#flushInterval);
            });
        }

        #readUint8 = (bytes, state) => {
            if (state.i >= bytes.length) throw new Error("Unexpected end of payload (uint8).");
            return bytes[state.i++];
        }
        #writeUint8 = (bytes, val) => {
            bytes.push(val & 0xFF);
        }

        #readFloat64LE = (bytes, state) => {
            if (state.i + 8 > bytes.length) throw new Error("Unexpected end of payload (float64).");
            const tmp = new Uint8Array(bytes.slice(state.i, state.i + 8)).buffer;
            const val = new DataView(tmp).getFloat64(0, true);
            state.i += 8;
            return val;
        }
        #writeFloat64LE = (bytes, val) => {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, val, true);
            const u8 = new Uint8Array(buf);
            for (let b of u8) bytes.push(b);
        }

        #readFloat32LE = (bytes, state) => {
            if (state.i + 4 > bytes.length) throw new Error("Unexpected end of payload (float32).");
            const tmp = new Uint8Array(bytes.slice(state.i, state.i + 4)).buffer;
            const val = new DataView(tmp).getFloat32(0, true);
            state.i += 4;
            return val;
        }
        #writeFloat32LE = (bytes, val) => {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, val, true);
            const u8 = new Uint8Array(buf);
            for (let b of u8) bytes.push(b);
        }

        #readULEB128 = (bytes, state) => {
            let result = 0;
            let shift = 0;
            while (true) {
                if (state.i >= bytes.length) throw new Error("Unexpected end of payload (uleb128).");
                const b = bytes[state.i++];
                result |= (b & 0x7F) << shift;
                if (!(b & 0x80)) break;
                shift += 7;
            }
            return result >>> 0;
        }
        #writeULEB128 = (bytes, val) => {
            val = Math.max(0, Math.floor(val));
            while (val > 0x7F) {
                bytes.push((val & 0x7F) | 0x80);
                val >>>= 7;
            }

            bytes.push(val & 0x7F);
        }

        #readColor = (bytes, state) => {
            if (state.i + 3 > bytes.length) throw new Error("Unexpected end of payload (color).");
            const r = bytes[state.i++];
            const g = bytes[state.i++];
            const b = bytes[state.i++];
            return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
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

        #readString = (bytes, state) => {
            const len = this.#readULEB128(bytes, state);
            if (state.i + len > bytes.length) throw new Error("Unexpected end of payload (string).");
            const slice = bytes.slice(state.i, state.i + len);
            state.i += len;
            return new Uint8Array(slice);
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

        #removeLinesByUUID = (uuid) => {
            const hex = this.uuidToHex(uuid);
            const removed = [];
            for (let i = this.#lineBuffer.length - 1; i >= 0; i--) {
                const line = this.#lineBuffer[i];
                const lineUUID = line.uuid;
                const lineHex = (lineUUID instanceof Uint8Array) ? this.uuidToHex(lineUUID) : String(lineUUID);
                if (lineHex === hex) {
                    removed.push(lineUUID || uuid);
                    this.#lineBuffer.splice(i, 1);
                }
            }
            return Array.from(new Set(removed));
        }

        #buildDrawPacket = (uuid, x1, y1, x2, y2, color, lineWidth, lifeMs, fadeMs) => {
            const bytes = [];
            bytes.push(1);
            this.#writeString(bytes, uuid);
            this.#writeColor(bytes, color);

            this.#writeFloat32LE(bytes, x1);
            this.#writeFloat32LE(bytes, y1);
            this.#writeFloat32LE(bytes, x2);
            this.#writeFloat32LE(bytes, y2);
            this.#writeUint8(bytes, lineWidth);
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
            if (!MPP?.client?.sendArray || !Drawboard.connected) return;

            MPP.client.sendArray([{
                m: "custom",
                data: {
                    drawboard: finalPayload
                },
                target: {
                    mode: "subscribed"
                }
            }]);
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
            if (!this.enabled || !Drawboard.connected) return;

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
        }

        handleIncomingData = (payload) => {
            // console.log(payload);
            if (!payload) return;

            try {
                const bytes = new Array(payload.length);
                for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);

                const state = { i: 0 };
                const opCount = this.#readULEB128(bytes, state);

                for (let opIndex = 0; opIndex < opCount; opIndex++) {
                    const type = this.#readUint8(bytes, state);
                    if (type === 0) { // erase
                        const uuidBytes = this.#readString(bytes, state);
                        this.#removeLinesByUUID(uuidBytes);
                    } else if (type === 1) { // draw
                        const uuidBytes = this.#readString(bytes, state);
                        const color = this.#readColor(bytes, state);
                        const x1 = this.#readFloat32LE(bytes, state);
                        const y1 = this.#readFloat32LE(bytes, state);
                        const x2 = this.#readFloat32LE(bytes, state);
                        const y2 = this.#readFloat32LE(bytes, state);
                        const lineWidth = this.#readUint8(bytes, state);
                        const lifeMs = this.#readULEB128(bytes, state);
                        const fadeMs = this.#readULEB128(bytes, state);

                        this.renderLine({
                            x1, y1, x2, y2,
                            color,
                            lineWidth,
                            lineLifeMs: lifeMs,
                            lineFadeMs: fadeMs,
                            uuid: uuidBytes
                        });
                    } else {
                        console.warn("Unknown drawboard op type:", type);
                        break;
                    }
                }
            } catch (err) {
                console.warn("Failed to parse incoming drawboard payload:", err);
            }
        }

        renderLine({ x1, y1, x2, y2, color, lineWidth, lineLifeMs, lineFadeMs, uuid = this.generateUUID() }) {
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

            return uuid;
        }

        drawLine = ({ x1, y1, x2, y2, color, lineWidth, lineLifeMs, lineFadeMs, uuid = this.generateUUID() }) => {
            this.renderLine({ x1, y1, x2, y2, color, lineWidth, lineLifeMs, lineFadeMs, uuid });

            const op = this.#buildDrawPacket(
                uuid,
                x1, y1,
                x2, y2,
                color,
                lineWidth,
                lineLifeMs,
                lineFadeMs
            );
            this.#opBuffer.push(op);

            return uuid;
        }

        renderErase({ x, y, radius }) {
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

            const removedUUIDs = Array.from(new Set(removed));
            return removedUUIDs;
        }

        erase = ({ x, y, radius }) => {
            const removedUUIDs = this.renderErase({ x, y, radius });
            for (const uuid of removedUUIDs) {
                const op = this.#buildErasePacket(uuid);
                this.#opBuffer.push(op);
            }

            return removedUUIDs;
        }
    }

    async function run() {
        MPP.drawboard = new Drawboard();

        MPP.client.sendArray([{
            m: "+custom"
        }]);

        if (MPP?.client?.on) {
            MPP.client.on("custom", (packet) => {
                if (!packet || !packet.data) return;
                if (packet.data.drawboard) {
                    MPP.drawboard.handleIncomingData(packet.data.drawboard);
                }
            });
        }
    }

    function check() {
        if (!Drawboard.connected) {
            return setTimeout(() => {
                check();
            }, 200);
        }

        run();
    }

    check();
})();