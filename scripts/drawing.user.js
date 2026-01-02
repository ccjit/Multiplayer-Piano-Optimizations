// ==UserScript==
// @name         Multiplayer Piano Optimizations [Drawing]
// @namespace    https://tampermonkey.net/
// @version      2.1.0
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

/*
    ### OP 0: Clear user
    - <uint8 op>
    1. Tells clients to clear this user's
    lines

    ### OP 1: Clear lines
    - <uint8 op> <uleb128 length> <uint32 uuid>*
    1. Tells clients to clear lines with
    uuids provided

    ### OP 2: Quick line
    - <uint8 op> <uint24 color> <uint8 transparency> <uleb128 lineWidth> <uleb128 lifeMs> <uleb128 fadeMs> <uint16 x1> <uint16 y1> <uint16 x2> <uint16 y2> <uint32 uuid>
    1. Tells clients to draw a line from
    (x1, y1) to (x2, y2) with options and
    provides a line uuid

    ### OP 3: Start chain
    - <uint8 op> <uint24 color> <uint8 transparency> <uleb128 lineWidth> <uleb128 lifeMs> <uleb128 fadeMs> <uint16 x> <uint16 y>
    1. Tells clients to set a point at
    (x, y) to start a chain of lines with
    options

    ### OP 4: Continue chain
    - <uint8 op> <uleb128 length> <<uint16 x> <uint16 y> <uint32 uuid>>*
    1. Tells clients to continue off of
    the user's chain to point (x, y) and
    provides a line uuid (the (x, y) here
    should after be set to (x1, y1) so that
    the next continue will use that as the
    start points, etc.)

    strings are prefixed with <uleb128 length>
    * Denotes multiple allowed
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
        #enabled = true;
        #isShiftDown = false;
        #isCtrlDown = false;
        #clicking = false;
        #lastPosition;
        #position;
        #color = "#000000";
        #transparency = 1;
        #lineWidth = 3;
        #eraseFactor = 8;
        #lineLifeMs = 5000;
        #lineFadeMs = 3000;
        #lineBuffer = [];
        #opBuffer = [];
        #payloadFlushMs = 200;
        #flushInterval;
        #mouseMoveThrottleMs = 50;
        #lastMouseMoveAt = 0;
        #chains = new Map();
        #localChainStarted = false;

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
        get transparency() {
            return this.#transparency;
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
        get mouseMoveThrottleMs() {
            return this.#mouseMoveThrottleMs;
        }
        get payloadFlushMs() {
            return this.#payloadFlushMs;
        }

        set enabled(enabled) {
            this.#enabled = enabled;
        }
        set color(color) {
            this.#color = color;
        }
        set transparency(transparency) {
            this.#transparency = Math.max(0, Math.min(1, transparency));
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
        set mouseMoveThrottleMs(mouseMoveThrottleMs) {
            this.#mouseMoveThrottleMs = mouseMoveThrottleMs;
        }
        set payloadFlushMs(payloadFlushMs) {
            clearInterval(this.#flushInterval);
            this.#payloadFlushMs = payloadFlushMs;
            this.#flushInterval = setInterval(this.#flushOpBuffer, this.#payloadFlushMs);
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
                this.#localChainStarted = false;

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
                const now = Date.now();
                if (now - this.#lastMouseMoveAt < this.#mouseMoveThrottleMs) return;
                this.#lastMouseMoveAt = now;

                this.#updatePosition();
                if (!this.#lastPosition) this.#lastPosition = this.#position;
                if (this.#isShiftDown && this.#clicking) {
                    const start = this.#lastPosition;
                    const end = this.#position;

                    this.drawLine({
                        x1: start.x,
                        y1: start.y,
                        x2: end.x,
                        y2: end.y,
                        color: this.#color,
                        transparency: this.#transparency,
                        lineWidth: this.#lineWidth,
                        lineLifeMs: this.#lineLifeMs,
                        lineFadeMs: this.#lineFadeMs
                    });

                    this.#lastPosition = this.#position;
                } else if (this.#isCtrlDown && this.#clicking) {
                    const maxDim = Math.max(this.#canvas.width, this.#canvas.height) || 1;
                    const radius = this.#lineWidth * this.#eraseFactor / maxDim;

                    const removedUUIDs = this.erase({
                        x: this.#position.x,
                        y: this.#position.y,
                        radius: radius
                    });

                    if (removedUUIDs && removedUUIDs.length) {
                        this.#pushOp({
                            op: 1,
                            uuids: removedUUIDs.map(n => Number(n) >>> 0)
                        });
                    }
                }
            });

            requestAnimationFrame(this.#draw);
            this.#flushInterval = setInterval(this.#flushOpBuffer, this.#payloadFlushMs);

            window.addEventListener("beforeunload", () => {
                if (this.#flushInterval) clearInterval(this.#flushInterval);
            });

            const participant = this.participant;
            if (participant?.color) this.#color = participant.color;
        }

        #readUint8 = (bytes, state) => {
            if (state.i >= bytes.length) throw new Error("Unexpected end of payload (uint8).");
            return bytes[state.i++];
        }
        #writeUint8 = (bytes, val) => {
            bytes.push(val & 0xFF);
        }

        #readUint16 = (bytes, state) => {
            if (state.i + 2 > bytes.length) throw new Error("Unexpected end of payload (uint16).");
            const v = bytes[state.i] | (bytes[state.i + 1] << 8);
            state.i += 2;
            return v >>> 0;
        }
        #writeUint16 = (bytes, val) => {
            const v = val >>> 0;
            bytes.push(v & 0xFF, (v >>> 8) & 0xFF);
        }

        #readUint32 = (bytes, state) => {
            if (state.i + 4 > bytes.length) throw new Error("Unexpected end of payload (uint32).");
            const v = (bytes[state.i] | (bytes[state.i + 1] << 8) | (bytes[state.i + 2] << 16) | (bytes[state.i + 3] << 24)) >>> 0;
            state.i += 4;
            return v;
        }
        #writeUint32 = (bytes, val) => {
            const v = val >>> 0;
            bytes.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
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

        generateUUID = () => {
            let id = 0;
            if (typeof crypto !== "undefined" && crypto.getRandomValues) {
                const arr = new Uint32Array(1);
                crypto.getRandomValues(arr);
                id = arr[0] >>> 0;
            } else {
                id = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
            }
            if (id === 0) id = 1;
            return id >>> 0;
        }

        #removeLinesByUUIDs = (uuids) => {
            const removed = [];
            const set = new Set(uuids.map(n => Number(n)));
            for (let i = this.#lineBuffer.length - 1; i >= 0; i--) {
                const line = this.#lineBuffer[i];
                if (set.has(Number(line.uuid))) {
                    removed.push(line.uuid);
                    this.#lineBuffer.splice(i, 1);
                }
            }
            return Array.from(new Set(removed));
        }

        #removeLinesByOwner = (ownerId) => {
            const removed = [];
            for (let i = this.#lineBuffer.length - 1; i >= 0; i--) {
                const line = this.#lineBuffer[i];
                if (line.owner === ownerId) {
                    if (line.uuid) removed.push(line.uuid);
                    this.#lineBuffer.splice(i, 1);
                }
            }
            this.#chains.delete(ownerId);
            return Array.from(new Set(removed));
        }

        #pushOp = (opObj) => { // could do some stuff here but dont need to atm
            this.#opBuffer.push(opObj);
        }

        #buildClearUserPacket = () => {
            const bytes = [];
            this.#writeUint8(bytes, 0);
            return bytes;
        }

        #buildClearLinesPacket = (uuids) => {
            const bytes = [];
            this.#writeUint8(bytes, 1);
            this.#writeULEB128(bytes, uuids.length);
            for (const u of uuids) this.#writeUint32(bytes, Number(u) >>> 0);
            return bytes;
        }

        #buildQuickLinePacket = (color, transparency, lineWidth, lineLifeMs, lineFadeMs, x1, y1, x2, y2, uuid) => {
            const bytes = [];
            this.#writeUint8(bytes, 2);
            this.#writeColor(bytes, color);
            this.#writeUint8(bytes, Math.floor(Math.clamp(0, transparency, 1) * 255) & 0xFF);
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineWidth)));
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineLifeMs)));
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineFadeMs)));
            this.#writeUint16(bytes, x1 & 0xFFFF);
            this.#writeUint16(bytes, y1 & 0xFFFF);
            this.#writeUint16(bytes, x2 & 0xFFFF);
            this.#writeUint16(bytes, y2 & 0xFFFF);
            this.#writeUint32(bytes, uuid >>> 0);
            return bytes;
        }

        #buildStartChainPacket = (color, transparency, lineWidth, lineLifeMs, lineFadeMs, x, y) => {
            const bytes = [];
            this.#writeUint8(bytes, 3);
            this.#writeColor(bytes, color);
            this.#writeUint8(bytes, Math.floor(Math.clamp(0, transparency, 1) * 255) & 0xFF);
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineWidth)));
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineLifeMs)));
            this.#writeULEB128(bytes, Math.max(0, Math.floor(lineFadeMs)));
            this.#writeUint16(bytes, x & 0xFFFF);
            this.#writeUint16(bytes, y & 0xFFFF);
            return bytes;
        }

        #buildContinueChainPacket = (entries) => {
            const bytes = [];
            this.#writeUint8(bytes, 4);
            this.#writeULEB128(bytes, entries.length);
            for (const e of entries) {
                this.#writeUint16(bytes, e.x & 0xFFFF);
                this.#writeUint16(bytes, e.y & 0xFFFF);
                this.#writeUint32(bytes, e.uuid >>> 0);
            }
            return bytes;
        }

        #sendCustomData = (payload) => {
            if (!MPP?.client?.sendArray || !Drawboard.connected) return;

            MPP.client.sendArray([{
                m: "custom",
                data: {
                    drawboard: btoa(payload)
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
                x: Math.clamp(0, (participant?.x ?? 0), 100) / 100,
                y: Math.clamp(0, (participant?.y ?? 0), 100) / 100
            };
        }

        #flushOpBuffer = () => {
            if (!this.#opBuffer.length) return;

            const builtOps = [];
            const buf = this.#opBuffer;
            let i = 0;
            while (i < buf.length) {
                const item = buf[i];
                if (!item || typeof item.op !== "number") {
                    i++;
                    continue;
                }

                switch (item.op) {
                    case 0: {
                        builtOps.push(this.#buildClearUserPacket());
                        i++;
                        break;
                    }
                    case 1: {
                        const allU = [];
                        let j = i;
                        while (j < buf.length && buf[j] && buf[j].op === 1) {
                            if (Array.isArray(buf[j].uuids)) allU.push(...buf[j].uuids.map(n => Number(n) >>> 0));
                            j++;
                        }
                        const seen = new Set();
                        const uniq = [];
                        for (const u of allU) {
                            if (!seen.has(u)) {
                                seen.add(u);
                                uniq.push(u);
                            }
                        }
                        builtOps.push(this.#buildClearLinesPacket(uniq));
                        i = j;
                        break;
                    }
                    case 2: {
                        builtOps.push(this.#buildQuickLinePacket(
                            item.color,
                            item.transparency,
                            item.lineWidth,
                            item.lineLifeMs,
                            item.lineFadeMs,
                            item.x1u,
                            item.y1u,
                            item.x2u,
                            item.y2u,
                            item.uuid >>> 0
                        ));
                        i++;
                        break;
                    }
                    case 3: {
                        builtOps.push(this.#buildStartChainPacket(
                            item.color,
                            (typeof item.transparency === "number") ? item.transparency : this.#transparency,
                            item.lineWidth,
                            item.lineLifeMs,
                            item.lineFadeMs,
                            item.xu,
                            item.yu
                        ));
                        i++;
                        break;
                    }
                    case 4: {
                        const allEntries = [];
                        let j = i;
                        while (j < buf.length && buf[j] && buf[j].op === 4) {
                            if (Array.isArray(buf[j].entries)) allEntries.push(...buf[j].entries.map(e => ({
                                x: e.x & 0xFFFF,
                                y: e.y & 0xFFFF,
                                uuid: e.uuid >>> 0
                            })));
                            j++;
                        }
                        builtOps.push(this.#buildContinueChainPacket(allEntries));
                        i = j;
                        break;
                    }
                    default: {
                        i++;
                        break;
                    }
                }
            }

            // final payload
            const bytes = [];
            this.#writeULEB128(bytes, builtOps.length);
            for (const opBytes of builtOps) {
                for (const b of opBytes) bytes.push(b);
            }
            const finalPayload = String.fromCharCode(...bytes);
            this.#sendCustomData(finalPayload);
            this.#opBuffer.length = 0;
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
                const lineLifeMs = line.lineLifeMs;
                const lineFadeMs = line.lineFadeMs;
                const age = now - timestamp;

                if (age >= lineLifeMs + lineFadeMs) {
                    this.#lineBuffer.splice(i, 1);
                    continue;
                }

                let alpha = 1;
                if (age > lineLifeMs) {
                    const fadeAge = age - lineLifeMs;
                    alpha = Math.clamp(0, 1 - (fadeAge / lineFadeMs), 1);
                }

                this.#ctx.globalAlpha = alpha * line.transparency; // line transparency effect
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

        setLineSettings({ color = null, transparency = null, lineWidth = null, lineLifeMs = null, lineFadeMs = null } = {}) {
            this.#color = color ?? this.#color;
            this.#transparency = transparency ?? this.#transparency;
            this.#lineWidth = (Number.isFinite(lineWidth) ? lineWidth : this.#lineWidth) >>> 0;
            this.#lineLifeMs = (Number.isFinite(lineLifeMs) ? lineLifeMs : this.#lineLifeMs) >>> 0;
            this.#lineFadeMs = (Number.isFinite(lineFadeMs) ? lineFadeMs : this.#lineFadeMs) >>> 0;
        }

        renderLine({ x1, y1, x2, y2, color, transparency, lineWidth, lineLifeMs, lineFadeMs, uuid = this.generateUUID(), owner = null } = {}) {
            this.#lineBuffer.push({
                x1, y1,
                x2, y2,
                color,
                transparency: Math.clamp(0, transparency, 1),
                lineWidth,
                lineLifeMs,
                lineFadeMs,
                timestamp: Date.now(),
                uuid: uuid >>> 0,
                owner: owner || null
            });

            return uuid >>> 0;
        }

        drawLine = ({ x1, y1, x2, y2, color = null, transparency = null, lineWidth = null, lineLifeMs = null, lineFadeMs = null, chain = true } = {}) => {
            color = color ?? this.#color;
            transparency = transparency ?? this.#transparency;
            lineWidth = (Number.isFinite(lineWidth) ? lineWidth : this.#lineWidth) >>> 0;
            lineLifeMs = (Number.isFinite(lineLifeMs) ? lineLifeMs : this.#lineLifeMs) >>> 0;
            lineFadeMs = (Number.isFinite(lineFadeMs) ? lineFadeMs : this.#lineFadeMs) >>> 0;

            const nx1 = Math.clamp(0, Number(x1) || 0, 1);
            const ny1 = Math.clamp(0, Number(y1) || 0, 1);
            const nx2 = Math.clamp(0, Number(x2) || 0, 1);
            const ny2 = Math.clamp(0, Number(y2) || 0, 1);

            const uuid = this.generateUUID();

            this.renderLine({
                x1: nx1,
                y1: ny1,
                x2: nx2,
                y2: ny2,
                color: color,
                transparency: transparency,
                lineWidth: lineWidth,
                lineLifeMs: lineLifeMs,
                lineFadeMs: lineFadeMs,
                uuid: uuid,
                owner: (MPP.client.user?.id || MPP.client.getOwnParticipant?.()?.id || null)
            });

            const x1u = Math.round(nx1 * 65535) >>> 0;
            const y1u = Math.round(ny1 * 65535) >>> 0;
            const x2u = Math.round(nx2 * 65535) >>> 0;
            const y2u = Math.round(ny2 * 65535) >>> 0;

            if (chain) {
                if (!this.#localChainStarted) {
                    this.#pushOp({
                        op: 3,
                        color: color,
                        transparency: transparency,
                        lineWidth: lineWidth,
                        lineLifeMs: lineLifeMs,
                        lineFadeMs: lineFadeMs,
                        xu: x1u,
                        yu: y1u
                    });
                    this.#localChainStarted = true;
                }

                this.#pushOp({
                    op: 4,
                    entries: [{
                        x: x2u & 0xFFFF,
                        y: y2u & 0xFFFF,
                        uuid: uuid >>> 0
                    }]
                });
            } else {
                this.#pushOp({
                    op: 2,
                    color: color,
                    transparency: transparency,
                    lineWidth: lineWidth,
                    lineLifeMs: lineLifeMs,
                    lineFadeMs: lineFadeMs,
                    x1u: x1u & 0xFFFF,
                    y1u: y1u & 0xFFFF,
                    x2u: x2u & 0xFFFF,
                    y2u: y2u & 0xFFFF,
                    uuid: uuid >>> 0
                });
            }

            return uuid >>> 0;
        }

        drawLines = (segments = [], { color = null, transparency = null, lineWidth = null, lineLifeMs = null, lineFadeMs = null } = {}) => {
            if (!Array.isArray(segments) || !segments.length) return [];

            const segs = segments.map(s => ({
                x1: Math.clamp(0, Number(s.x1) || 0, 1),
                y1: Math.clamp(0, Number(s.y1) || 0, 1),
                x2: Math.clamp(0, Number(s.x2) || 0, 1),
                y2: Math.clamp(0, Number(s.y2) || 0, 1),
                color: s.color ?? color,
                transparency: s.transparency ?? transparency,
                lineWidth: Number.isFinite(s.lineWidth) ? s.lineWidth : lineWidth,
                lineLifeMs: Number.isFinite(s.lineLifeMs) ? s.lineLifeMs : lineLifeMs,
                lineFadeMs: Number.isFinite(s.lineFadeMs) ? s.lineFadeMs : lineFadeMs,
            }));

            const eps = 1e-6;
            const chainable = segs.length > 1 && (() => {
                for (let i = 0; i < segs.length - 1; i++) {
                    const a = segs[i], b = segs[i + 1];
                    if (Math.abs(a.x2 - b.x1) > eps || Math.abs(a.y2 - b.y1) > eps) return false;
                }
                return true;
            })();

            if (chainable) {
                const first = segs[0];
                const xu = Math.round(first.x1 * 65535);
                const yu = Math.round(first.y1 * 65535);

                this.#pushOp({
                    op: 3,
                    color: first.color ?? this.#color,
                    transparency: first.transparency ?? this.#transparency,
                    lineWidth: first.lineWidth ?? this.#lineWidth,
                    lineLifeMs: first.lineLifeMs ?? this.#lineLifeMs,
                    lineFadeMs: first.lineFadeMs ?? this.#lineFadeMs,
                    xu: xu,
                    yu: yu
                });

                const entries = [];
                const uuids = [];

                for (const s of segs) {
                    const uuid = this.generateUUID() >>> 0;
                    uuids.push(uuid);

                    this.renderLine({
                        x1: s.x1,
                        y1: s.y1,
                        x2: s.x2,
                        y2: s.y2,
                        color: s.color ?? this.#color,
                        transparency: s.transparency ?? this.#transparency,
                        lineWidth: s.lineWidth ?? this.#lineWidth,
                        lineLifeMs: s.lineLifeMs ?? this.#lineLifeMs,
                        lineFadeMs: s.lineFadeMs ?? this.#lineFadeMs,
                        uuid: uuid,
                        owner: (MPP.client.user?.id || MPP.client.getOwnParticipant?.()?.id || null)
                    });

                    entries.push({
                        x: Math.round(s.x2 * 65535) & 0xFFFF,
                        y: Math.round(s.y2 * 65535) & 0xFFFF,
                        uuid: uuid >>> 0
                    });
                }

                this.#pushOp({
                    op: 4,
                    entries: entries
                });

                return uuids;
            }

            const results = [];
            for (const s of segs) {
                const id = this.drawLine({
                    x1: s.x1,
                    y1: s.y1,
                    x2: s.x2,
                    y2: s.y2,
                    color: s.color ?? color,
                    transparency: s.transparency ?? transparency,
                    lineWidth: s.lineWidth ?? lineWidth,
                    lineLifeMs: s.lineLifeMs ?? lineLifeMs,
                    lineFadeMs: s.lineFadeMs ?? lineFadeMs,
                    chain: false
                });
                results.push(id);
            }
            return results;
        }

        renderErase({ x, y, radius } = {}) {
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

        erase = ({ x, y, radius } = {}) => {
            const removedUUIDs = this.renderErase({ x, y, radius });
            return removedUUIDs;
        }

        eraseLine({ uuid } = {}) {
            if (uuid == null) return [];
            const u = Number(uuid) >>> 0;

            const removed = this.#removeLinesByUUIDs([u]);
            if (removed && removed.length) {
                this.#pushOp({ op: 1, uuids: removed.map(n => Number(n) >>> 0) });
            } else {
                this.#pushOp({ op: 1, uuids: [u] });
            }
            return removed;
        }

        eraseLines(uuids = []) {
            if (!Array.isArray(uuids) || !uuids.length) return [];
            const clean = Array.from(new Set(uuids.map(n => Number(n) >>> 0)));
            const removed = this.#removeLinesByUUIDs(clean);
            if (removed && removed.length) {
                this.#pushOp({ op: 1, uuids: removed.map(n => Number(n) >>> 0) });
            } else {
                this.#pushOp({ op: 1, uuids: clean });
            }
            return removed;
        }

        eraseAll() {
            const ownerId = (MPP.client.user?.id ?? MPP.client.getOwnParticipant?.()?.id ?? null);
            const ownerStr = ownerId !== null ? String(ownerId) : null;
            if (ownerStr !== null) {
                this.#removeLinesByOwner(ownerStr);
            } else {
                this.#lineBuffer.length = 0;
            }
            this.#pushOp({ op: 0 });
        }

        handleIncomingData = (packet) => {
            if (!packet?.data?.drawboard) return;
            const payload = atob(packet.data.drawboard);

            try {
                const bytes = new Array(payload.length);
                for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);

                const state = { i: 0 };
                const opCount = this.#readULEB128(bytes, state);

                const senderId = (packet && packet.p) ? String(packet.p) : null;

                for (let opIndex = 0; opIndex < opCount; opIndex++) {
                    const type = this.#readUint8(bytes, state);

                    switch (type) {
                        case 0: {
                            if (!senderId) {
                                console.warn("Clear user received but no sender provided.");
                            } else {
                                this.#removeLinesByOwner(senderId);
                            }
                            break;
                        }
                        case 1: {
                            const len = this.#readULEB128(bytes, state);
                            const uuids = [];
                            for (let k = 0; k < len; k++) {
                                const u = this.#readUint32(bytes, state);
                                uuids.push(u >>> 0);
                            }
                            this.#removeLinesByUUIDs(uuids);
                            break;
                        }
                        case 2: {
                            const color = this.#readColor(bytes, state);
                            const transparency = Math.clamp(0, this.#readUint8(bytes, state) / 255, 1);
                            const lineWidth = this.#readULEB128(bytes, state);
                            const lineLifeMs = this.#readULEB128(bytes, state);
                            const lineFadeMs = this.#readULEB128(bytes, state);
                            const x1u = this.#readUint16(bytes, state);
                            const y1u = this.#readUint16(bytes, state);
                            const x2u = this.#readUint16(bytes, state);
                            const y2u = this.#readUint16(bytes, state);
                            const uuid = this.#readUint32(bytes, state);

                            const x1 = Math.clamp(0, x1u / 65535, 1);
                            const y1 = Math.clamp(0, y1u / 65535, 1);
                            const x2 = Math.clamp(0, x2u / 65535, 1);
                            const y2 = Math.clamp(0, y2u / 65535, 1);

                            this.renderLine({
                                x1, y1, x2, y2,
                                color,
                                transparency,
                                lineWidth,
                                lineLifeMs: lineLifeMs,
                                lineFadeMs: lineFadeMs,
                                uuid: uuid >>> 0,
                                owner: senderId
                            });
                            break;
                        }
                        case 3: {
                            const color = this.#readColor(bytes, state);
                            const transparency = Math.clamp(0, this.#readUint8(bytes, state) / 255, 1);
                            const lineWidth = this.#readULEB128(bytes, state);
                            const lineLifeMs = this.#readULEB128(bytes, state);
                            const lineFadeMs = this.#readULEB128(bytes, state);
                            const xu = this.#readUint16(bytes, state);
                            const yu = this.#readUint16(bytes, state);
                            const entry = {
                                x: xu >>> 0,
                                y: yu >>> 0,
                                color,
                                transparency,
                                lineWidth,
                                lineLifeMs: lineLifeMs,
                                lineFadeMs: lineFadeMs
                            };
                            if (senderId) this.#chains.set(senderId, entry);
                            break;
                        }
                        case 4: {
                            const len = this.#readULEB128(bytes, state);
                            if (!senderId) {
                                for (let k = 0; k < len; k++) {
                                    const xu = this.#readUint16(bytes, state);
                                    const yu = this.#readUint16(bytes, state);
                                    const uuid = this.#readUint32(bytes, state);
                                    // no sender ... ignore for now
                                }
                            } else {
                                let chain = this.#chains.get(senderId);
                                for (let k = 0; k < len; k++) {
                                    const xu = this.#readUint16(bytes, state);
                                    const yu = this.#readUint16(bytes, state);
                                    const uuid = this.#readUint32(bytes, state);

                                    const x = xu >>> 0;
                                    const y = yu >>> 0;
                                    if (!chain) {
                                        chain = {
                                            x,
                                            y,
                                            color: "#000000",
                                            transparency: 1,
                                            lineWidth: 3,
                                            lineLifeMs: 5000,
                                            lineFadeMs: 3000
                                        };
                                        this.#chains.set(senderId, chain);
                                        continue;
                                    }

                                    const x1n = Math.clamp(0, chain.x / 65535, 1);
                                    const y1n = Math.clamp(0, chain.y / 65535, 1);
                                    const x2n = Math.clamp(0, x / 65535, 1);
                                    const y2n = Math.clamp(0, y / 65535, 1);

                                    this.renderLine({
                                        x1: x1n,
                                        y1: y1n,
                                        x2: x2n,
                                        y2: y2n,
                                        color: chain.color,
                                        transparency: chain.transparency,
                                        lineWidth: chain.lineWidth,
                                        lineLifeMs: chain.lineLifeMs,
                                        lineFadeMs: chain.lineFadeMs,
                                        uuid: uuid >>> 0,
                                        owner: senderId
                                    });

                                    chain.x = x;
                                    chain.y = y;
                                }
                                this.#chains.set(senderId, chain);
                            }
                            break;
                        }
                        default: {
                            console.warn("Unknown drawboard op type:", type);
                            break;
                        }
                    }
                }
            } catch (err) {
                console.warn("Failed to parse incoming drawboard payload:", err);
            }
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
                    MPP.drawboard.handleIncomingData(packet);
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