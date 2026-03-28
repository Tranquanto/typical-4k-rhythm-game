import { getPerformance, getStarRating } from "./calculator.js";
import { rand01 } from "../the-draconic-depths/js/perlin.js";

const maps = [];

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
        document.getElementById("file-drop-label").classList.remove("inactive");
    }
});

document.getElementById("file-drop").addEventListener("dragleave", () => {
    document.getElementById("file-drop-label").classList.add("inactive");
})

document.getElementById("file-drop").addEventListener("change", e => {
    document.getElementById("file-drop-label").classList.add("inactive");
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
                        const hitObjects = lines.slice(hitObjectsIndex + 1).map((l, i) => {
                            const parts = l.split(",");
                            return {
                                column: useRandom ? [0, 1, 2, 3][Math.floor(rand01(1, 1, i, 57) * 4)] : Math.floor(Number(parts[0]) / 128),
                                time: Number(parts[2])
                            };
                        });

                        for (let i = 1; i < hitObjects.length; i++) {
                            if (hitObjects[i].column === hitObjects[i - 1].column && useRandom) {
                                hitObjects[i].column = [0, 1, 2, 3].filter(c => c !== hitObjects[i - 1].column)[Math.floor(rand01(1, 2, i, 57) * 3)];
                            }
                        }

                        const hitObjectsPerInterval = {};
                        for (let i = 0; i < hitObjects.length; i++) {
                            const hitObject = hitObjects[i];
                            const interval = Math.floor(hitObject.time / 1000);
                            if (!hitObjectsPerInterval[interval]) {
                                hitObjectsPerInterval[interval] = [];
                            }
                            hitObjectsPerInterval[interval].push(hitObject);
                        }

                        const audioBlob = await zip.file(audioFile).async("blob");
                        const audioURL = URL.createObjectURL(audioBlob);
                        const audio = new Audio(audioURL);
                        
                        // create the map element
                        const mapElem = document.createElement("div");
                        mapElem.classList.add("map-entry");
                        
                        const titleElem = document.createElement("span");
                        titleElem.classList.add("map-name");
                        titleElem.textContent = `${artist} - ${title} [${version}]`;
                        mapElem.appendChild(titleElem);

                        const diffElem = document.createElement("span");
                        diffElem.classList.add("map-difficulty");
                        const stars = getStarRating(hitObjects);
                        diffElem.textContent = `${stars.toFixed(2)}*`;
                        diffElem.style.color = getColor(stars);
                        mapElem.appendChild(diffElem);
                        
                        mapElem.addEventListener("click", async () => { // start game
                            document.getElementById("map-list").style.display = "none";
                            document.getElementById("game").style.display = "";

                            const hitsound = new Audio("hitnormal.wav");
                            hitsound.volume = 0.5;
                            await hitsound.play();
                            hitsound.pause();
                            
                            await audio.play();
                            audio.pause();
                            let startTime = performance.now() + 1000;
                            setTimeout(async () => {
                                await audio.play();
                                startTime = performance.now();
                            }, 1000);

                            /** @type {HTMLCanvasElement} */
                            const canvas = document.getElementById("game-canvas");
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

                            function gameLoop() {
                                const currentTime = performance.now() - startTime;
                                const currentInterval = Math.floor(currentTime / 1000);
                                canvas.width = canvas.width;

                                // draw the columns
                                ctx.fillStyle = "#333";
                                for (let i = 0; i < 4; i++) {
                                    ctx.fillRect(i * 100 + 4, 0, 96, canvas.height);
                                }

                                // draw the floor
                                ctx.fillStyle = "#555";
                                ctx.fillRect(0, canvas.height - 160, canvas.width, 160);

                                for (let i = currentInterval - 1; i < currentInterval + 3; i++) {
                                    const hitObjects = hitObjectsPerInterval[i];
                                    if (hitObjects) {
                                        for (let j = 0; j < hitObjects.length; j++) {
                                            const hitObject = hitObjects[j];
                                            const timeUntilHit = hitObject.time - currentTime;
                                            const y = canvas.height - (timeUntilHit / 500) * canvas.height - 160;
                                            ctx.fillStyle = "#fff";
                                            ctx.fillRect(hitObject.column * 100 + 4, y, 96, 40);

                                            if (timeUntilHit < -200) {
                                                // missed
                                                hitObjects.splice(j, 1);
                                                j--;
                                                misses++;
                                                combo = 0;

                                                document.getElementById("judgment").textContent = "Miss";
                                                document.getElementById("judgment").style.color = "#f55";
                                            }
                                        }
                                    }
                                }

                                document.getElementById("score").textContent = `Score: ${Math.floor(score)}`;
                                document.getElementById("combo").textContent = `Combo: ${combo}`;
                                document.getElementById("accuracy").textContent = `Accuracy: ${hits + misses > 0 ? ((cumulativeAccuracy / (hits + misses)) * 100).toFixed(2) : "0"}%`;

                                const stars = getStarRating(hitObjects.slice(0, hits + misses));
                                const pf = getPerformance(stars, cumulativeAccuracy / (hits + misses) || 0, misses);
                                document.getElementById("performance").textContent = `${pf.toFixed(1)} pf`;

                                document.getElementById("current-stars").textContent = `${stars?.toFixed(2) || "0.00"}*`;
                                document.getElementById("current-stars").style.color = getColor(stars);

                                requestAnimationFrame(gameLoop);
                            }
                            gameLoop();

                            document.addEventListener("keydown", e => {
                                const column = ["d", "f", "j", "k"].indexOf(e.key);
                                if (column !== -1) {
                                    const interval = Math.floor((performance.now() - startTime) / 1000);
                                    let hitObjects;
                                    for (let i = interval - 1; i < interval + 2; i++) {
                                        if (hitObjectsPerInterval[i]?.length) {
                                            hitObjects = hitObjectsPerInterval[i];
                                            break;
                                        }
                                    }
                                    if (hitObjects) {
                                        for (let i = 0; i < hitObjects.length; i++) {
                                            const hitObject = hitObjects[i];
                                            if (hitObject.column === column) {
                                                const timeDiff = hitObject.time - (performance.now() - startTime); // negative = late
                                                const absTimeDiff = Math.abs(timeDiff);
                                                if (absTimeDiff < 200) {
                                                    if (absTimeDiff < 150) {
                                                        hits++;
                                                        hitsound.currentTime = 0;
                                                        hitsound.play();

                                                        cumulativeOffset += timeDiff;
                                                        document.getElementById("offset").textContent = `Avg. Error: ${(cumulativeOffset / hits).toFixed(2)} ms`;
                                                    }
                                                    if (absTimeDiff < 50) {
                                                        score += 300 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1;

                                                        document.getElementById("judgment").textContent = "Perfect";
                                                        document.getElementById("judgment").style.color = "#5ff";
                                                    } else if (absTimeDiff < 100) {
                                                        score += 100 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1 / 3;

                                                        document.getElementById("judgment").textContent = "Okay";
                                                        document.getElementById("judgment").style.color = "#5f5";
                                                    } else if (absTimeDiff < 150) {
                                                        score += 50 * (1 + combo / 25);
                                                        combo++;
                                                        cumulativeAccuracy += 1 / 6;

                                                        document.getElementById("judgment").textContent = "Bad";
                                                        document.getElementById("judgment").style.color = "#ff5";
                                                    } else { // extremely early
                                                        misses++;
                                                        combo = 0;

                                                        document.getElementById("judgment").textContent = "Miss";
                                                        document.getElementById("judgment").style.color = "#f55";
                                                    }
                                                    hitObjects.splice(i, 1);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                        });

                        document.getElementById("map-list").appendChild(mapElem);
                    });
                }
            });
        }
        reader.readAsArrayBuffer(file);
    }
});