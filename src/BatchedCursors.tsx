import { RequestForQueries, useConvexAuth, useMutation, useQueries, useQuery } from "convex/react";
import { MouseEvent, useCallback, useEffect, useMemo, useRef } from "react"
import { api } from "../convex/_generated/api";
import * as color from "@radix-ui/colors";

const colorNames = [
    "tomato",
    "red",
    "crimson",
    "pink",
    "plum",
    "purple",
    "violet",
    "indigo",
    "blue",
    "cyan",
    "teal",
    "green",
    "grass",
    "orange",
    "brown",
    "sky",
    "mint",
    "lime",
    "yellow",
    "amber",
];
const colors = colorNames.map(name => {
    return (color as any)[name][name + "11"];
})

const heightPx = 600;
const widthPx = 800;

type SerializedCursorBuffer = {
    startTs: number;
    x: ArrayBuffer;
    y: ArrayBuffer;
    t: ArrayBuffer;
};

type UnpackedCursorBuffer = {
    startTs: number;
    x: Uint16Array;
    y: Uint16Array;
    dt: Float32Array;
}

const maxBufferLen = 4096;

const cursorSamplesPerSec = 120;
const cursorInterval = 1000 / cursorSamplesPerSec;

const mutationSamplesPerSec = 1;
const mutationInterval = 1000 / mutationSamplesPerSec;

class CursorBuffer {
    start: number;
    length: number;

    x: Uint16Array;
    y: Uint16Array;
    t: Float64Array;

    constructor() {
        this.start = 0;
        this.length = 0;

        this.x = new Uint16Array(maxBufferLen);
        this.y = new Uint16Array(maxBufferLen);
        this.t = new Float64Array(maxBufferLen);
    }

    static unpack(serialized: SerializedCursorBuffer): UnpackedCursorBuffer {
        const x = new Uint16Array(serialized.x);
        const y = new Uint16Array(serialized.y);
        const dt = new Float32Array(serialized.t);
        if (x.length !== y.length || x.length !== dt.length) {
            throw new Error(`Invalid serialized cursor buffer`);
        }
        return { x, y, dt, startTs: serialized.startTs };
    }

    push(t: number, x: number, y: number) {
        if (this.length > 0) {
            const lastT = this.t[(this.start + this.length - 1) % maxBufferLen];
            if (t < lastT) {
                throw new Error(`Non-monotonic time: ${t} < ${lastT}`);
            }
            // Overwrite the last sample if we're within our sampling interval.
            if (t - lastT < cursorInterval) {
                this.x[(this.start + this.length - 1) % maxBufferLen] = x;
                this.y[(this.start + this.length - 1) % maxBufferLen] = y;
                return;
            }
        }
        // Drop the last sample if we're overflowing.
        if (this.length === maxBufferLen) {
            this.start = (this.start + 1) % maxBufferLen;
            this.length--;
        }
        this.x[(this.start + this.length) % maxBufferLen] = x;
        this.y[(this.start + this.length) % maxBufferLen] = y;
        this.t[(this.start + this.length) % maxBufferLen] = t;
        this.length++;
    }

    drain(): SerializedCursorBuffer | null {
        if (this.length === 0) {
            return null;
        }
        const startTs = this.t[this.start];
        const x = new Uint16Array(this.length);
        const y = new Uint16Array(this.length);
        const t = new Float32Array(this.length);
        for (let i = 0; i < this.length; i++) {
            x[i] = this.x[(this.start + i) % maxBufferLen];
            y[i] = this.y[(this.start + i) % maxBufferLen];
            t[i] = this.t[(this.start + i) % maxBufferLen] - startTs;
        }

        this.start = 0;
        this.length = 0;
        this.x.fill(0);
        this.y.fill(0);
        this.t.fill(0);

        return {startTs, x: x.buffer, y: y.buffer, t: t.buffer};
    }

    print() {
        console.log(`CursorBuffer(${this.start}, ${this.length})`);
        for (let i = 0; i < this.length; i++) {
            const t = this.t[(this.start + i) % maxBufferLen];
            const x = this.x[(this.start + i) % maxBufferLen];
            const y = this.y[(this.start + i) % maxBufferLen];
            console.log(`  ${t}: (${x}, ${y})`);
        }
    }
}

export default function BatchedCursors() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const me = useQuery(api.cursors.me);

    const currentCursor = useRef<{x: number, y: number} | null>(null);

    const otherMembers = useQuery(api.cursors.otherMembers);
    const queries = useMemo(() => {
        const q: RequestForQueries = {};
        for (const member of otherMembers ?? []) {
            q[member.user] = {query: api.cursors.listCursors, args: {user: member.user}};
        }
        return q;
    }, [otherMembers]);
    const samples = useQueries(queries);

    const latestSamples = useRef<{[user: string]: {buffers: UnpackedCursorBuffer[], name: string}}>({});
    useEffect(() => {
        const q: {[user: string]: {name: string, buffers: UnpackedCursorBuffer[]}} = {};
        for (const [user, r] of Object.entries(samples)) {
            if (!r) {
                continue;
            }
            const {name, buffers} = r;
            if (!q[user]) {
                q[user] = { name, buffers: [] };
            }
            for (const buffer of buffers) {
                const unpacked = CursorBuffer.unpack(buffer);
                q[user].buffers.push(unpacked);
            }
        }
        latestSamples.current = q;
    }, [samples]);

    const requestRef = useRef<any>();

    type RenderState = {renderedNow: number, lastUpdate: number};
    const now = performance.timeOrigin + performance.now();
    const renderState = useRef<Record<string, RenderState>>({});

    const animate = useCallback((t: number) => {
        requestRef.current = requestAnimationFrame(animate);
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.clearRect(0, 0, widthPx, heightPx);

        const now = performance.timeOrigin + performance.now();
        const samples = latestSamples.current;

        const st = renderState.current;

        for (const [user, {name, buffers}] of Object.entries(samples)) {
            if (buffers.length === 0) {
                continue;
            }
            if (!st[user]) {
                const start = Math.max(buffers[0].startTs, now - 1000);
                console.log(`Starting time for ${user} ${now - start}ms ago`);
                st[user] = {renderedNow: start, lastUpdate: now};
            }
            const renderState = st[user]!;

            const dt = now - renderState.lastUpdate;
            renderState.renderedNow += dt;
            renderState.lastUpdate = now;

            const renderedNow = renderState.renderedNow;

            let i = buffers.length - 1;
            while (i > 0 && buffers[i].startTs > renderedNow) {
                i--;
            }
            const buffer = buffers[i];
            let j = 0;
            while (j < buffer.x.length) {
                const t = buffer.startTs + buffer.dt[j];
                if (t > renderedNow) {
                    break;
                }
                j++;
            }
            j = Math.min(j, buffer.x.length - 1);

            const t = buffer.startTs + buffer.dt[j];
            if (t < renderedNow - 10000) {
                continue;
            }

            ctx.fillStyle = colors[cyrb53(name) % colors.length];
            const x = buffer.x[j];
            const y = buffer.y[j];
            ctx.fillRect(x - 5, y - 5, 10, 10);
            ctx.font = "16px sans-serif";
            ctx.fillText(name, x + 12, y + 6);
        }
        if (currentCursor.current !== null) {
            const {x, y} = currentCursor.current;
            ctx.fillStyle = "#000000";
            ctx.fillRect(x - 5, y - 5, 10, 10);
            ctx.font = "16px sans-serif";
            ctx.fillText("Me", x + 12, y + 6);
        }

    }, [requestRef]);
    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [animate]);


    const cursorBuffer = useRef(new CursorBuffer());
    const join = useMutation(api.cursors.join);
    const leave = useMutation(api.cursors.leave);
    const pushCursor = useMutation(api.cursors.pushCursor);
    const onMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        const nativeEvent = e.nativeEvent as any;
        const x = Math.min(Math.max(nativeEvent.offsetX, 0), widthPx);
        const y = Math.min(Math.max(nativeEvent.offsetY, 0), heightPx);
        const t = performance.timeOrigin + e.timeStamp;
        cursorBuffer.current.push(t, x, y);
        currentCursor.current = {x, y};
    }, [cursorBuffer]);
    useEffect(() => {
        join();
        const id = setInterval(() => {
            const n = cursorBuffer.current.length;
            const cursors = cursorBuffer.current.drain();
            pushCursor({cursorBuffer: cursors});
        }, mutationInterval);
        return () => {
            clearInterval(id);
            leave();
        }
    }, [join, pushCursor, leave, cursorBuffer])
    return (
        <canvas
            ref={canvasRef}
            onMouseMove={onMouseMove}
            style={{"border": "1px solid black", backgroundColor: "white"}}
            height={heightPx}
            width={widthPx}
            />
    )
}

const cyrb53 = (str: string, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};