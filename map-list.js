import { getPerformance, getRank, getStarRating, lerp, modify } from "./calculator.js";
import { rand01 } from "./rand01.js";
import { getElementById } from "./getElementById.js"; // to prevent constantly calling document.getElementById

export const game = {
    mode: "keys",
    keys: 4,
    speed: 1,
    offset: 0, // audio offset in ms
    mods: new Set()
};

export const judgments = [
    {name: "Perfect", color: "#55f", mult: 1, window: 20},
    {name: "Great", color: "#5ff", mult: 0.98, window: 50},
    {name: "Good", color: "#5f5", mult: 0.5, window: 80},
    {name: "Okay", color: "#ff5", mult: 0.2, window: 120},
    {name: "Bad", color: "#fa5", mult: 0.1, window: 150},
    {name: "Miss", color: "#f55", mult: 0, window: 250}
];

export const keybinds = {
    1: [" "],
    2: ["f", "j"],
    3: ["f", " ", "j"],
    4: ["d", "f", "j", "k"],
    5: ["d", "f", " ", "j", "k"],
    6: ["s", "d", "f", "j", "k", "l"],
    7: ["s", "d", "f", " ", "j", "k", "l"],
    8: ["a", "s", "d", "f", "j", "k", "l", ";"],
    9: ["a", "s", "d", "f", " ", "j", "k", "l", ";"],
    10: ["a", "s", "d", "f", "v", "n", "j", "k", "l", ";"]
};

const keysPressed = {};

export const maps = [];

export function recalcStars(mods = game.mods) {
    for (let i = 0; i < maps.length; i++) {
        const map = maps[i];
        const mapElem = getElementById(`map-${map.id}`);
        const diffElem = mapElem.querySelector(".map-difficulty");
        const stars = map.getStars(game.keys, mods);
        diffElem.textContent = `${stars.toFixed(2)}* | ${getPerformance(game.mode, stars, 1, 0, map.hitObjects[game.keys].length, game.speed).toFixed(1)} max pp`;
        diffElem.style.color = getColor(stars);
    }
}

const colors = {
    0: "#fff",
    0.5: "#5ff",
    1.5: "#5f5",
    2.5: "#ff5",
    3.5: "#fa5",
    4.5: "#f55",
    5.5: "#d5d",
    6.5: "#a5f",
    7.5: "#00f",
    8.5: "#888",
    10: "#600"
};
const keys = Object.keys(colors).map(k => parseFloat(k)).sort((a, b) => a - b);

function getColor(stars) {
    const closest = (() => {
        let closestKey = keys[0];
        for (const key of keys) {
            if (stars - key >= 0) {
                closestKey = key;
            } else break;
        }
        return keys.indexOf(closestKey);
    })();

    const next = closest + (keys.length > closest);
    if (next === closest || keys[next] === undefined) return colors[keys[closest]];

    const o = lerpColor(colors[keys[closest]], colors[keys[next]], (stars - keys[closest]) / (keys[next] - keys[closest]));
    if (o.length !== 7) return "#000";
    return o;
}

function lerpColor(a, b, amount) {
    if (a.replace("#", "").length === 3) {
        const a1 = a.replace("#", "");
        a = a1[0].repeat(2) + a1[1].repeat(2) + a1[2].repeat(2);
    }
    if (b.replace("#", "").length === 3) {
        const a1 = b.replace("#", "");
        b = a1[0].repeat(2) + a1[1].repeat(2) + a1[2].repeat(2);
    }
    const ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);
    return "#" + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}

for (const elem of document.querySelectorAll(".map-difficulty")) {
    const diff = Number(elem.textContent.replace("*", ""));
    
    elem.style.color = getColor(diff);
}

window.addEventListener("dragover", e => {
    if (e.dataTransfer.types.includes("Files")) {
        getElementById("file-drop-label").classList.remove("inactive");
    }
});

getElementById("file-drop").addEventListener("dragleave", () => {
    getElementById("file-drop-label").classList.add("inactive");
})

getElementById("file-drop").addEventListener("change", e => {
    getElementById("file-drop-label").classList.add("inactive");
    for (const file of e.target.files) {
        let zip;

        const reader = new FileReader();
        reader.onload = function (e) {
            zip = new JSZip();
            zip.loadAsync(e.target.result).then(zip => {
                // load the map
                const osuFiles = Object.keys(zip.files).filter(g => g.endsWith(".osu"));
                for (let i = 0; i < osuFiles.length; i++) {
                    const file = zip.files[osuFiles[i]];
                    file.async("string").then(async content => {
                        const lines = content.split("\n").map(l => l.trim()).filter(l => l.length);
                        const audioFile = lines.find(l => l.startsWith("AudioFilename:")).split(":")[1].trim();
                        const title = lines.find(l => l.startsWith("Title:")).split(":")[1].trim();
                        const artist = lines.find(l => l.startsWith("Artist:")).split(":")[1].trim();
                        const version = lines.find(l => l.startsWith("Version:")).split(":")[1].trim();
                        const mode = lines.find(l => l.startsWith("Mode:")).split(":")[1].trim();

                        const originalKeys = lines.find(l => l.startsWith("CircleSize:"))?.split(":")[1].trim() ?? 4;
                        
                        const useRandom = mode !== "3";

                        let timingPoints = [];
                        const timingPointsIndex = lines.findIndex(l => l === "[TimingPoints]");
                        let lastBeatLength = 500;
                        if (timingPointsIndex !== -1) {
                            const timingPointsLines = lines.slice(timingPointsIndex + 1);
                            for (let i = 0; i < timingPointsLines.length; i++) {
                                const line = timingPointsLines[i];
                                if (line.trim().length === 0 || line.startsWith("[")) break;

                                const parts = line.split(",");
                                const time = Number(parts[0]);
                                const beatLength = Number(parts[1]);
                                if (beatLength < 0) {
                                    timingPoints.push({time, beatLength: lastBeatLength, scrollSpeed: -100 / beatLength});
                                } else {
                                    timingPoints.push({time, beatLength, scrollSpeed: 1});
                                    lastBeatLength = beatLength;
                                }
                            }
                        }

                        const hitObjectsIndex = lines.findIndex(l => l === "[HitObjects]");

                        let perKey = {};
                        let hitObjectsPerInterval = {};

                        for (let keys = 1; keys <= 10; keys++) {
                            const hitObjects = [...new Set(lines.slice(hitObjectsIndex + 1).map((l, i) => {
                                const parts = l.split(",");
                                const data = {
                                    column: useRandom ?
                                        Array.from(
                                            {length: keys}, (_, idx) => idx
                                        )[Math.floor(rand01(keys, 1, i, 57 + Number(parts[2])) * keys)]
                                        : Math.max(Math.floor(
                                            Number(parts[0]) / 512 * keys
                                          - (originalKeys === keys ? rand01(-5, 1, i, Number(parts[2]) - 93) * 0.5 : 0)
                                        ), 0),
                                    time: Number(parts[2]),
                                    type: 0 // standard, short-hit note
                                };

                                if (parts[5]?.split(":")[0] !== "0" && parts[3] === "128") {
                                    parts[5] = parts[5].split(":")[0];
                                    data.type = 1; // long/hold note
                                    data.end = Number(parts[5]);
                                }

                                return data;
                            }))] // check for duplicates and remove
                            .filter((v, i, s) => s.findIndex(d => d.column === v.column && d.time === v.time) === i);

                            if (keys > 1 && useRandom) for (let i = 1; i < hitObjects.length; i++) {
                                if (hitObjects[i].column === hitObjects[i - 1].column) {
                                    hitObjects[i].column = Array.from({length: keys}, (_, idx) => idx).filter(c => c !== hitObjects[i - 1].column)[Math.floor(rand01(keys, 2, i, 57 + hitObjects[i].time) * (keys - 1))];
                                }
                            }

                            const hitObjectsPerSecond = {};
                            for (let i = 0; i < hitObjects.length; i++) {
                                const hitObject = hitObjects[i];
                                function add(interval) {
                                    if (interval < 0 || isNaN(interval)) return;
                                    if (!hitObjectsPerSecond[interval]) {
                                        hitObjectsPerSecond[interval] = [];
                                    }
                                    hitObjectsPerSecond[interval].push(hitObject);
                                }

                                add(Math.floor(hitObject.time / 1000));
                                // add(Math.floor(hitObject.end / 1000));
                            }

                            perKey[keys] = hitObjects;
                            hitObjectsPerInterval[keys] = hitObjectsPerSecond;
                        }

                        const audioBlob = await zip.file(audioFile).async("blob");

                        const audioContext = new AudioContext();
                        const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());

                        const audio = (() => {
                            const duration = audioBuffer.duration;
                            let source = null;
                            let playing = false;
                            let ended = true;
                            let pausedAt = 0;
                            let startedAtCtx = 0;
                            let rate = 1;

                            const clampTime = t => Math.max(0, Math.min(duration, t));

                            const stopSource = () => {
                                if (!source) return;
                                source.onended = null;
                                source.stop(0);
                                source.disconnect();
                                source = null;
                            };

                            const startSource = (offsetSec) => {
                                stopSource();
                                source = audioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.playbackRate.value = rate;
                                source.connect(gainNode);
                                gainNode.connect(audioContext.destination);

                                startedAtCtx = audioContext.currentTime;
                                pausedAt = clampTime(offsetSec);
                                playing = true;
                                ended = false;

                                source.onended = () => {
                                    if (!playing) return;
                                    playing = false;
                                    source = null;
                                    pausedAt = duration;
                                    ended = true;
                                };

                                source.start(0, pausedAt);
                            };

                            const gainNode = audioContext.createGain();

                            return {
                                get playbackRate() {
                                    return rate;
                                },
                                set playbackRate(v) {
                                    const next = Math.max(0.01, Number(v) || 1);
                                    if (next === rate) return;
                                    const t = this.currentTime;
                                    rate = next;
                                    if (playing) startSource(t);
                                },

                                get currentTime() {
                                    if (!playing) return clampTime(pausedAt);
                                    return clampTime(pausedAt + (audioContext.currentTime - startedAtCtx) * rate);
                                },
                                set currentTime(value) {
                                    const t = clampTime(Number(value) || 0);
                                    pausedAt = t;
                                    ended = t >= duration;
                                    if (playing) startSource(t);
                                },

                                get ended() {
                                    return ended || this.currentTime >= duration;
                                },

                                async play() {
                                    await audioContext.resume();
                                    if (playing) return;
                                    if (pausedAt >= duration) pausedAt = 0;
                                    startSource(pausedAt);
                                },

                                pause() {
                                    if (!playing) return;
                                    pausedAt = this.currentTime;
                                    playing = false;
                                    ended = false;
                                    stopSource();
                                },

                                set volume(value) {
                                    gainNode.gain.value = value;
                                }
                            };
                        })();

                        // const audio = new Audio(audioURL);
                        // audio.preservesPitch = false;
                        
                        // create the map element
                        const mapElem = document.createElement("div");
                        mapElem.id = `map-${maps.length}`;
                        mapElem.classList.add("map-entry");

                        const artistElem = document.createElement("span");
                        artistElem.classList.add("map-artist");
                        artistElem.textContent = artist;
                        mapElem.appendChild(artistElem);
                        
                        const titleElem = document.createElement("span");
                        titleElem.classList.add("map-name");
                        titleElem.textContent = title;
                        mapElem.appendChild(titleElem);

                        const versionElem = document.createElement("span");
                        versionElem.classList.add("map-version");
                        versionElem.textContent = `${version}`;
                        mapElem.appendChild(versionElem);

                        const diffElem = document.createElement("span");
                        diffElem.classList.add("map-difficulty");
                        const stars = getStarRating(game.mode, perKey[game.keys], game.speed, undefined, game.mods);
                        diffElem.textContent = `${stars.toFixed(2)}* | ${getPerformance(game.mode, stars, 1, 0, perKey[game.keys].length, game.speed).toFixed(1)} max pp`;
                        diffElem.style.color = getColor(stars);
                        mapElem.appendChild(diffElem);
                        mapElem.setAttribute("data-id", maps.length);

                        const difficultyBar = document.createElement("div");
                        difficultyBar.classList.add("map-difficulty-bar");

                        const diffsPerHitObject = perKey[originalKeys].map((h, i) => [getStarRating(game.mode, perKey[originalKeys].slice(Math.max(0, i - 15), Math.min(i + 16, perKey[originalKeys].length)), 1, 0), h.time]);
                        const maxTime = perKey[originalKeys].length ? perKey[originalKeys][perKey[originalKeys].length - 1].end ?? perKey[originalKeys][perKey[originalKeys].length - 1].time : 0;
                        // build a gradient
                        const gradient = document.createElement("canvas");
                        gradient.width = 1000;
                        gradient.height = 8;
                        const gctx = gradient.getContext("2d");
                        const grad = gctx.createLinearGradient(0, 0, gradient.width, 0);
                        let last = 0;
                        for (let i = 0; i < diffsPerHitObject.length; i++) {
                            const [diff, time] = diffsPerHitObject[i];
                            grad.addColorStop(time / maxTime, getColor((diff + last * 3) / 4));
                            last = diff;
                        }
                        gctx.fillStyle = grad;
                        gctx.fillRect(0, 0, gradient.width, gradient.height);
                        difficultyBar.style.backgroundImage = `url(${gradient.toDataURL()})`;
                        mapElem.appendChild(difficultyBar);

                        maps.push({
                            id: maps.length,
                            title,
                            artist,
                            version,
                            audio,
                            hitObjects: perKey,
                            hitObjectsPerInterval,
                            originalKeys,
                            getStars: k => getStarRating(game.mode, perKey[k], game.speed, undefined, game.mods)
                        });

                        async function loadMap(e) { // start game
                            const map = maps[Number(mapElem.getAttribute("data-id"))];

                            const hitObjects = [...map.hitObjects[game.keys]];

                            for (let i = 0; i < hitObjects.length; i++) {
                                hitObjects[i] = {...hitObjects[i]}; // create a copy of each hit object so that mods can modify them without affecting the original map data
                            }

                            const hitObjectsPerInterval = JSON.parse(JSON.stringify(map.hitObjectsPerInterval[game.keys]));

                            modify(hitObjects, game.mods);
                            for (const i in hitObjectsPerInterval) {
                                modify(hitObjectsPerInterval[i], game.mods);
                            }

                            let auto = false;
                            if (e.ctrlKey) auto = true;
                            getElementById("map-list").style.display = "none";
                            getElementById("game").style.display = "";

                            const hitsound = new Audio("hit.wav");
                            hitsound.volume = 0.5;
                            await hitsound.play();
                            hitsound.pause();
                            
                            await audio.play();
                            audio.pause();
                            audio.playbackRate = game.speed;
                            audio.volume = game.volume ?? 1;
                            let startTime = performance.now() + 1000;
                            setTimeout(async () => {
                                await audio.play();
                                startTime = performance.now();
                            }, 1000);

                            /** @type {HTMLCanvasElement} */
                            const canvas = getElementById("game-canvas");
                            const ctx = canvas.getContext("2d");
                            function resize() {
                                canvas.width = 100 * game.keys;
                                canvas.height = window.innerHeight;
                            }
                            window.addEventListener("resize", resize);
                            resize();

                            function now() {
                                if (performance.now() < startTime)
                                return (performance.now() - startTime) * game.speed + game.offset;
                                return (audio.currentTime * 1000 ?? (performance.now() - startTime) * game.speed) + game.offset;
                            }

                            let score = 0, scoreDisplay = 0;
                            let combo = 0, maxCombo = 0;
                            let pfDisplay = 0, starsDisplay = 0;
                            let hits = 0;
                            let misses = 0;
                            let cumulativeAccuracy = 0, accuracyDisplay = 100, totalAccuracy = 0;
                            let cumulativeOffset = 0;
                            let approachTime = 650 * game.speed;
                            let inputEvents = [];
                            let pulses = [0, 0, 0, 0]; // pulse time per column
                            let completed = false, paused = false;
                            let startedNotes = new Set();

                            const maxStars = getStarRating(game.mode, map.hitObjects[game.keys]); // speed is not included in these
                            const maxPF = getPerformance(game.mode, maxStars, 1, 0, map.hitObjects[game.keys].length);

                            document.onkeydown = async e => {
                                const k = e.key.toLowerCase();
                                keysPressed[k] = true;

                                if (completed || e.repeat) return;
                                const column = keybinds[game.keys]?.indexOf(k) ?? -1;
                                let canSkip = false;
                                if (hits + misses === hitObjects.length) canSkip = 1;
                                else if (hits + misses === 0 && now() < hitObjects[0].time - approachTime - 2000) canSkip = 2;

                                if (!auto && column !== -1 && !paused && !canSkip) {
                                    inputEvents.push({column, time: now(), hitsoundPlayed: true});
                                    hitsound.currentTime = 0;
                                    hitsound.play();
                                } else if (k === " " && canSkip) {
                                    if (canSkip === 1) {
                                        // skip to results
                                        completed = true;
                                    } else if (canSkip === 2) {
                                        // skip to first object
                                        audio.currentTime = (hitObjects[0].time - approachTime - 1000) / 1000;
                                        startTime = performance.now() - ((hitObjects[0].time - approachTime) - 1000) / game.speed;
                                    }
                                } else if (k === "escape") {
                                    if (paused) {
                                        await audio.play();
                                        paused = false;
                                    } else {
                                        audio.pause();
                                        paused = true;
                                    }
                                    getElementById("pause-overlay").style.display = paused ? "" : "none";
                                }
                            };

                            document.onkeyup = e => {
                                const k = e.key.toLowerCase();
                                keysPressed[k] = false;

                                if (completed || e.repeat) return;
                                const column = keybinds[game.keys]?.indexOf(k) ?? -1;

                                if (!auto && column !== -1 && !paused) {
                                    inputEvents.push({column, time: now(), hitsoundPlayed: true, release: true});
                                }
                            };

                            if (auto) {
                                for (const hitObject of hitObjects) {
                                    inputEvents.push({column: hitObject.column, time: hitObject.time});
                                    if (hitObject.type === 1) {
                                        inputEvents.push({column: hitObject.column, time: hitObject.end, release: true});
                                    } else {
                                        inputEvents.push({column: hitObject.column, time: hitObject.time, release: true});
                                    }
                                }
                            }

                            function draw(loop) {
                                const currentTime = now();

                                // get last timing point
                                let currentTimingPoint;
                                for (let i = timingPoints.length - 1; i >= 0; i--) {
                                    if (timingPoints[i].time <= currentTime) {
                                        currentTimingPoint = timingPoints[i];
                                        break;
                                    }
                                }
                                if (!currentTimingPoint) currentTimingPoint = timingPoints[0];
                                const currentBeat = (currentTime - currentTimingPoint.time) / currentTimingPoint.beatLength;
                                // set background pulse opacity based on current beat
                                let beatFraction = currentBeat % 1;
                                // if (beatFraction < 0) beatFraction++;
                                if (beatFraction >= 0) getElementById("background-pulse").style.opacity = 1 - Math.max(0, beatFraction);

                                // process inputs
                                for (const event of inputEvents) {
                                    const {column, time} = event;
                                    if (time / game.speed + startTime > performance.now()) continue;
                                    event.processed = true;
                                    const interval = Math.floor(time / 1000);
                                    let processed = false;
                                    let isRelease = event.release;
                                    if (isRelease || auto) pulses[column] = time;

                                    if (auto) {
                                        keysPressed[keybinds[game.keys][column]] = !isRelease;
                                    }

                                    for (let i = Math.floor(interval - game.speed); i < interval + 2 * game.speed && !processed; i++) {
                                        const intervalNotes = (hitObjectsPerInterval[i] || []).concat(isRelease ? Array.from(startedNotes) : []);
                                        if (!intervalNotes) continue;

                                        outer: for (let j = 0; j < intervalNotes.length; j++) {
                                            const hitObject = intervalNotes[j];
                                            if (hitObject.done || isRelease && !hitObject.started) continue;
                                            if (hitObject.column === column) {
                                                const timeDiff = (isRelease ? hitObject.end : hitObject.time) - time; // negative = late
                                                const absTimeDiff = Math.abs(timeDiff);
                                                for (let k = 0; k < judgments.length; k++) {
                                                    const judgment = judgments[k];
                                                    if (absTimeDiff > judgment.window && !(judgment.name === "Miss" && isRelease)) continue;

                                                    getElementById("judgment").textContent = judgment.name;
                                                    getElementById("judgment").style.color = judgment.color;

                                                    cumulativeAccuracy += judgment.mult;
                                                    totalAccuracy++;

                                                    if (judgment.name !== "Miss") {
                                                        if (!isRelease) hits++;
                                                        combo++;

                                                        if (!event.hitsoundPlayed && !isRelease) {
                                                            hitsound.currentTime = 0;
                                                            hitsound.play();
                                                            event.hitsoundPlayed = true;
                                                        }

                                                        cumulativeOffset += timeDiff;
                                                        getElementById("offset").textContent = `Avg. Error: ${(cumulativeOffset / hits).toFixed(2)} ms`;
                                                    } else {
                                                        if (!isRelease) misses++;
                                                        combo = 0;
                                                        totalAccuracy++;
                                                    }
                                                    if (hitObject.type === 0) {
                                                        hitObject.done = 2;
                                                    } else if (hitObject.type === 1) {
                                                        if (isRelease) {
                                                            hitObject.done = 2;
                                                            startedNotes.delete(hitObject);
                                                        } else {
                                                            hitObject.started = true;
                                                            startedNotes.add(hitObject);
                                                        }
                                                    }
                                                    processed = true;
                                                    if (!isRelease) break outer;
                                                    else break;
                                                }
                                            }
                                        }
                                    }
                                    if (combo > maxCombo) maxCombo = combo;
                                }
                                inputEvents = inputEvents.filter(e => !e.processed);
                                const currentInterval = Math.floor(currentTime / 1000);
                                canvas.width = canvas.width;

                                // draw the columns
                                for (let i = 0; i < game.keys; i++) {
                                    ctx.fillStyle = "#33006d";
                                    ctx.fillRect(i * 100 + 2, 0, 96, canvas.height);

                                    // floor
                                    ctx.fillStyle = "#4b00a0";
                                    ctx.fillRect(i * 100 + 2, canvas.height - 160, 96, 160);

                                    // judgment line
                                    ctx.fillStyle = "#7700ff";
                                    ctx.fillRect(i * 100 + 2, canvas.height - 160, 96, 40);

                                    // pulses
                                    if (pulses[i] > 0) {
                                        const keybind = keybinds[game.keys]?.[i];
                                        const opacity = keysPressed[keybind] ? 0.5 : (pulses[i] - currentTime) / 200 + 0.5;
                                        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                                        ctx.fillRect(i * 100 + 2, canvas.height - 160, 96, 160);
                                    }
                                }

                                for (let i = Math.floor(currentInterval - game.speed); i < currentInterval + 3 * game.speed; i++) {
                                    const hitObjects = (hitObjectsPerInterval[i] || []).concat(Array.from(startedNotes));
                                    if (hitObjects) {
                                        for (let j = 0; j < hitObjects.length; j++) {
                                            const hitObject = hitObjects[j];
                                            if (hitObject.done) continue;
                                            const timeUntilHit = hitObject.time - currentTime;
                                            const y = canvas.height - (timeUntilHit / approachTime) * canvas.height - 160;
                                            const type = hitObject.type;

                                            // if hold note, draw the track
                                            if (type === 1) {
                                                const yEnd = canvas.height - ((hitObject.end - currentTime) / approachTime) * canvas.height - 160;
                                                ctx.fillStyle = "#7700ff";
                                                ctx.fillRect(hitObject.column * 100 + 6, (hitObject.started ? yEnd : y), 88, (hitObject.started ? canvas.height - 160 - yEnd : yEnd - y));
                                            }
                                            
                                            if (!(type === 1 && hitObject.started)) {
                                                ctx.fillStyle = "#b574ff";
                                                ctx.fillRect(hitObject.column * 100 + 2, y, 96, 40);

                                                ctx.fillStyle = "#fff";
                                                ctx.fillRect(hitObject.column * 100 + 2, y + 30, 96, 10);
                                            }

                                            if (!hitObject.started && timeUntilHit < -200) {
                                                // missed
                                                hitObject.done = true;
                                                misses++;
                                                combo = 0;
                                                totalAccuracy++;

                                                getElementById("judgment").textContent = "Miss";
                                                getElementById("judgment").style.color = "#f55";
                                            }
                                        }
                                    }
                                }

                                for (const obj of startedNotes) {
                                    const timeUntilEnd = obj.end - currentTime;
                                    if (timeUntilEnd < -judgments[judgments.length - 1].window) {
                                        // missed
                                        obj.done = true;
                                        combo = 0;
                                        totalAccuracy++;

                                        getElementById("judgment").textContent = "Miss";
                                        getElementById("judgment").style.color = "#f55";

                                        startedNotes.delete(obj);
                                    }
                                }

                                getElementById("combo").textContent = `Combo: ${combo}`;
                                accuracyDisplay = lerp(accuracyDisplay, hits + misses > 0 ? ((cumulativeAccuracy / totalAccuracy) * 100).toFixed(2) : 100, 0.1);
                                getElementById("accuracy").textContent = `Accuracy: ${accuracyDisplay.toFixed(2)}%`;

                                const stars = getStarRating(game.mode, hitObjects.slice(0, hits + misses), game.speed);
                                starsDisplay = lerp(starsDisplay, stars, 0.1);
                                const pf = getPerformance(game.mode, stars, cumulativeAccuracy / totalAccuracy || 0, misses, hits + misses, game.speed);
                                pfDisplay = lerp(pfDisplay, pf, 0.1);
                                getElementById("performance").textContent = `${Math.round(pfDisplay)} pp`;

                                score = (pf / maxPF * stars / maxStars) ** 0.5 * (hits + misses) / hitObjects.length * 1e6;
                                scoreDisplay = lerp(scoreDisplay, score, 0.1);
                                getElementById("score").textContent = `${Math.round(scoreDisplay).toLocaleString()}`;

                                /* const stars2 = getStarRating(game.mode, hitObjects.slice(Math.max(0, hits + misses - 15), hits + misses), game.speed, 1);

                                getElementById("current-stars").textContent = `${stars2?.toFixed(2) || "0.00"}*`;
                                getElementById("current-stars").style.color = getColor(stars2); */

                                getElementById("cumulative-stars").textContent = `${starsDisplay?.toFixed(2) || "0.00"}*`;
                                getElementById("cumulative-stars").style.color = getColor(starsDisplay);

                                if ((hits + misses >= hitObjects.length && audio.ended) || completed) {
                                    // show results
                                    completed = true;
                                    loop = false;
                                    getElementById("game").style.display = "none";
                                    getElementById("results").style.display = "";
                                    getElementById("background-pulse").style.opacity = 0;

                                    getElementById("results-title").textContent = `${artist} - ${title} [${version}]`;

                                    getElementById("results-difficulty").textContent = `${getStarRating(game.mode, hitObjects, game.speed).toFixed(2)}*`;
                                    getElementById("results-difficulty").style.color = getColor(getStarRating(game.mode, hitObjects, game.speed));

                                    const rank = getRank(cumulativeAccuracy / totalAccuracy || 0, misses);
                                    getElementById("results-rank").textContent = `${rank.rank}`;
                                    getElementById("results-rank").style.setProperty("--rank-color", rank.color);
                                    getElementById("results-rank").style.setProperty("--rank-glow", /[SX]/.test(rank.rank) ? "8px" : "0");

                                    getElementById("results-score").textContent = `${Math.round(score).toLocaleString()}`;
                                    
                                    getElementById("results-max-combo").textContent = `${maxCombo}x`;
                                    getElementById("results-accuracy").textContent = `${hits + misses > 0 ? ((cumulativeAccuracy / totalAccuracy) * 100).toFixed(2) : "0"}%`;
                                    getElementById("results-performance").textContent = `${pf.toFixed(1)} pp`;

                                    getElementById("results-mods").textContent = `${game.speed.toFixed(2)}x`;

                                    getElementById("retry-btn").onclick = e => {
                                        getElementById("results").style.display = "none";
                                        loadMap(e);
                                    };
                                    getElementById("results-back-btn").onclick = () => {
                                        getElementById("results").style.display = "none";
                                        getElementById("map-list").style.display = "";
                                    };
                                }

                                if (loop) requestAnimationFrame(draw);
                            }
                            draw(true);
                        }
                        
                        mapElem.addEventListener("click", loadMap);

                        getElementById("map-list").appendChild(mapElem);
                    });
                }
            });
        }
        reader.readAsArrayBuffer(file);
    }
});
window.maps = maps;