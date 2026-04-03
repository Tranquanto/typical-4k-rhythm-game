import { getPerformance, getRank, getStarRating } from "./calculator.js";
import { rand01 } from "../the-draconic-depths/js/perlin.js";
import { getElementById } from "./getElementById.js"; // to prevent constantly calling document.getElementById

export const game = {
    speed: 1
};

export const maps = [];

export function recalcStars() {
    for (let i = 0; i < maps.length; i++) {
        const map = maps[i];
        const mapElem = getElementById(`map-${map.id}`);
        const diffElem = mapElem.querySelector(".map-difficulty");
        const stars = map.getStars();
        diffElem.textContent = `${stars.toFixed(2)}* | ${getPerformance(stars, 1, 0, map.hitObjects.length, game.speed).toFixed(1)} max pp`;
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

    return lerpColor(colors[keys[closest]], colors[keys[next]], (stars - keys[closest]) / (keys[next] - keys[closest]));
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
                        const useRandom = mode !== "3";

                        const hitObjectsIndex = lines.findIndex(l => l === "[HitObjects]");
                        const hitObjects = [...new Set(lines.slice(hitObjectsIndex + 1).map((l, i) => {
                            const parts = l.split(",");
                            const data = {
                                column: useRandom ? [0, 1, 2, 3][Math.floor(rand01(1, 1, i, 57 + Number(parts[2])) * 4)] : Math.floor(Number(parts[0]) / 128),
                                time: Number(parts[2])
                            };
                            return `${data.column},${data.time}`;
                        }))].map(l => {
                            const parts = l.split(",");
                            return {
                                column: Number(parts[0]),
                                time: Number(parts[1])
                            };
                        });

                        for (let i = 1; i < hitObjects.length; i++) {
                            if (hitObjects[i].column === hitObjects[i - 1].column && useRandom) {
                                hitObjects[i].column = [0, 1, 2, 3].filter(c => c !== hitObjects[i - 1].column)[Math.floor(rand01(1, 2, i, 57 + hitObjects[i].time) * 3)];
                            }
                        }

                        const hitObjectsPerSecond = {};
                        for (let i = 0; i < hitObjects.length; i++) {
                            const hitObject = hitObjects[i];
                            const interval = Math.floor(hitObject.time / 1000);
                            if (!hitObjectsPerSecond[interval]) {
                                hitObjectsPerSecond[interval] = [];
                            }
                            hitObjectsPerSecond[interval].push(hitObject);
                        }

                        const audioBlob = await zip.file(audioFile).async("blob");
                        const audioURL = URL.createObjectURL(audioBlob);
                        const audio = new Audio(audioURL);
                        audio.preservesPitch = false;
                        
                        // create the map element
                        const mapElem = document.createElement("div");
                        mapElem.id = `map-${maps.length}`;
                        mapElem.classList.add("map-entry");
                        
                        const titleElem = document.createElement("span");
                        titleElem.classList.add("map-name");
                        titleElem.textContent = `${artist} - ${title} [${version}]`;
                        mapElem.appendChild(titleElem);

                        const diffElem = document.createElement("span");
                        diffElem.classList.add("map-difficulty");
                        const stars = getStarRating(hitObjects, game.speed);
                        diffElem.textContent = `${stars.toFixed(2)}* | ${getPerformance(stars, 1, 0, hitObjects.length, game.speed).toFixed(1)} max pp`;
                        diffElem.style.color = getColor(stars);
                        mapElem.appendChild(diffElem);
                        mapElem.setAttribute("data-id", maps.length);

                        maps.push({
                            id: maps.length,
                            title,
                            artist,
                            version,
                            audio,
                            hitObjects,
                            hitObjectsPerInterval: hitObjectsPerSecond,
                            getStars: () => getStarRating(hitObjects, game.speed)
                        });

                        async function loadMap(e) { // start game
                            const hitObjectsPerInterval = JSON.parse(JSON.stringify(hitObjectsPerSecond));

                            let auto = false;
                            if (e.ctrlKey) auto = true;
                            getElementById("map-list").style.display = "none";
                            getElementById("game").style.display = "";

                            const hitsound = new Audio("hitnormal.wav");
                            hitsound.volume = 0.5;
                            await hitsound.play();
                            hitsound.pause();
                            
                            await audio.play();
                            audio.pause();
                            audio.playbackRate = game.speed;
                            let startTime = performance.now() + 1000;
                            setTimeout(async () => {
                                await audio.play();
                                startTime = performance.now();
                            }, 1000);

                            /** @type {HTMLCanvasElement} */
                            const canvas = getElementById("game-canvas");
                            const ctx = canvas.getContext("2d");
                            function resize() {
                                canvas.width = 400;
                                canvas.height = window.innerHeight;
                            }
                            window.addEventListener("resize", resize);
                            resize();

                            let score = 0;
                            let combo = 0;
                            let hits = 0;
                            let misses = 0;
                            let cumulativeAccuracy = 0;
                            let cumulativeOffset = 0;
                            let approachTime = 800 * game.speed;
                            let inputEvents = [];
                            let pulses = [0, 0, 0, 0]; // pulse time per column
                            let completed = false;

                            document.onkeydown = e => {
                                if (completed) return;
                                const column = ["d", "f", "j", "k"].indexOf(e.key);
                                if (!auto && column !== -1) {
                                    inputEvents.push({column, time: (performance.now() - startTime) * game.speed});
                                    hitsound.currentTime = 0;
                                    hitsound.play();

                                    draw(false);
                                } else if (e.key === " ") {
                                    console.log((performance.now() - startTime) * game.speed, hitObjects[0].time - approachTime - 1000);
                                    if (hits + misses === hitObjects.length) {
                                        // skip to results
                                        completed = true;
                                    } else if (hits + misses === 0 && (performance.now() - startTime) * game.speed < hitObjects[0].time - approachTime - 1000) {
                                        // skip to first object
                                        audio.currentTime = (hitObjects[0].time - approachTime - 1000) / 1000;
                                        startTime = performance.now() - ((hitObjects[0].time - approachTime) - 1000) / game.speed;
                                        draw(false);
                                    }
                                }
                            };

                            if (auto) {
                                for (const hitObject of hitObjects) {
                                    inputEvents.push({column: hitObject.column, time: hitObject.time});
                                }
                            }

                            function draw(loop) {
                                for (const event of inputEvents) {
                                    const {column, time} = event;
                                    if (time / game.speed + startTime > performance.now()) continue;
                                    event.processed = true;
                                    const interval = Math.floor(time / 1000);
                                    let hitObjects;
                                    pulses[column] = time;
                                    for (let i = Math.floor(interval - game.speed); i < interval + 2 * game.speed; i++) {
                                        if (hitObjectsPerInterval[i]?.length) {
                                            hitObjects = hitObjectsPerInterval[i];
                                            break;
                                        }
                                    }
                                    if (hitObjects) {
                                        for (let i = 0; i < hitObjects.length; i++) {
                                            const hitObject = hitObjects[i];
                                            if (hitObject.column === column) {
                                                const timeDiff = hitObject.time - time; // negative = late
                                                const absTimeDiff = Math.abs(timeDiff);
                                                if (absTimeDiff < 200) {
                                                    if (absTimeDiff < 150) {
                                                        hits++;
                                                        hitsound.currentTime = 0;
                                                        hitsound.play();

                                                        cumulativeOffset += timeDiff;
                                                        getElementById("offset").textContent = `Avg. Error: ${(cumulativeOffset / hits).toFixed(2)} ms`;
                                                    }
                                                    if (absTimeDiff < 50) {
                                                        score += 300 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1;

                                                        getElementById("judgment").textContent = "Perfect";
                                                        getElementById("judgment").style.color = "#5ff";
                                                    } else if (absTimeDiff < 100) {
                                                        score += 100 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1 / 3;

                                                        getElementById("judgment").textContent = "Okay";
                                                        getElementById("judgment").style.color = "#5f5";
                                                    } else if (absTimeDiff < 150) {
                                                        score += 50 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1 / 6;

                                                        getElementById("judgment").textContent = "Bad";
                                                        getElementById("judgment").style.color = "#ff5";
                                                    } else { // extremely early
                                                        misses++;
                                                        combo = 0;

                                                        getElementById("judgment").textContent = "Miss";
                                                        getElementById("judgment").style.color = "#f55";
                                                    }
                                                    hitObjects.splice(i, 1);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                                inputEvents = inputEvents.filter(e => !e.processed);
                                const currentTime = (performance.now() - startTime) * game.speed;
                                const currentInterval = Math.floor(currentTime / 1000);
                                canvas.width = canvas.width;

                                // draw the columns
                                for (let i = 0; i < 4; i++) {
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
                                        const opacity = (pulses[i] - currentTime) / 500 + 0.5;
                                        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                                        ctx.fillRect(i * 100 + 2, canvas.height - 160, 96, 160);
                                    }
                                }

                                for (let i = Math.floor(currentInterval - game.speed); i < currentInterval + 3 * game.speed; i++) {
                                    const hitObjects = hitObjectsPerInterval[i];
                                    if (hitObjects) {
                                        for (let j = 0; j < hitObjects.length; j++) {
                                            const hitObject = hitObjects[j];
                                            const timeUntilHit = hitObject.time - currentTime;
                                            const y = canvas.height - (timeUntilHit / approachTime) * canvas.height - 160;
                                            ctx.fillStyle = "#b574ff";
                                            ctx.fillRect(hitObject.column * 100 + 2, y, 96, 40);

                                            ctx.fillStyle = "#fff";
                                            ctx.fillRect(hitObject.column * 100 + 2, y + 30, 96, 10);

                                            if (timeUntilHit < -200) {
                                                // missed
                                                hitObjects.splice(j, 1);
                                                j--;
                                                misses++;
                                                combo = 0;

                                                getElementById("judgment").textContent = "Miss";
                                                getElementById("judgment").style.color = "#f55";
                                            }
                                        }
                                    }
                                }

                                getElementById("score").textContent = `Score: ${Math.floor(score)}`;
                                getElementById("combo").textContent = `Combo: ${combo}`;
                                getElementById("accuracy").textContent = `Accuracy: ${hits + misses > 0 ? ((cumulativeAccuracy / (hits + misses)) * 100).toFixed(2) : "0"}%`;

                                const stars = getStarRating(hitObjects.slice(0, hits + misses), game.speed);
                                const pf = getPerformance(stars, cumulativeAccuracy / (hits + misses) || 0, misses, hits + misses, game.speed);
                                getElementById("performance").textContent = `${pf.toFixed(1)} pp`;

                                const stars2 = getStarRating((hitObjectsPerSecond[currentInterval - 1] || []).concat(hitObjectsPerSecond[currentInterval] || []).concat(hitObjectsPerSecond[currentInterval + 1] || []), game.speed, 2);

                                getElementById("current-stars").textContent = `${stars2?.toFixed(2) || "0.00"}*`;
                                getElementById("current-stars").style.color = getColor(stars2);

                                getElementById("cumulative-stars").textContent = `${stars?.toFixed(2) || "0.00"}*`;
                                getElementById("cumulative-stars").style.color = getColor(stars);

                                if ((hits + misses === hitObjects.length && audio.ended) || completed) {
                                    // show results
                                    completed = true;
                                    loop = false;
                                    getElementById("game").style.display = "none";
                                    getElementById("results").style.display = "";

                                    getElementById("results-title").textContent = `${artist} - ${title} [${version}]`;

                                    getElementById("results-difficulty").textContent = `${getStarRating(hitObjects, game.speed).toFixed(2)}*`;
                                    getElementById("results-difficulty").style.color = getColor(getStarRating(hitObjects, game.speed));

                                    const rank = getRank(cumulativeAccuracy / (hits + misses) || 0, misses);
                                    getElementById("results-rank").textContent = `${rank.rank.replace("X", "SS")}`;
                                    getElementById("results-rank").style.setProperty("--rank-color", rank.color);
                                    getElementById("results-rank").style.setProperty("--rank-glow", /[SX]/.test(rank.rank) ? "8px" : "0");

                                    getElementById("results-score").textContent = `${Math.floor(score).toLocaleString()}`;
                                    
                                    getElementById("results-max-combo").textContent = `${combo}x`;
                                    getElementById("results-accuracy").textContent = `${hits + misses > 0 ? ((cumulativeAccuracy / (hits + misses)) * 100).toFixed(2) : "0"}%`;
                                    getElementById("results-performance").textContent = `${pf.toFixed(1)} pp`;

                                    getElementById("results-mods").textContent = `${game.speed.toFixed(2)}x`;

                                    getElementById("retry-btn").onclick = e => {
                                        getElementById("results").style.display = "none";
                                        loadMap(e);
                                    };
                                    getElementById("results-back-btn").onclick = () => {
                                        getElementById("results").style.display = "none";
                                        getElementById("main-menu").style.display = "";
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