/**
 * An in-place function that modifies a provided list of hit objects according to the specified mods.
 * @param {Array.<Object>} hitObjects an array of all the hit objects
 * @param {Set.<string>} mods a set of mods to apply
 * @returns {Array.<Object>} the modified hit objects
 */
export function modify(hitObjects, mods = new Set()) {
    for (let i = 0; i < hitObjects.length; i++) {
        if (mods.has("no-holds")) {
            if (hitObjects[i].type === 1) {
                hitObjects[i].type = 0;
                delete hitObjects[i].end;
            }
        } else if (mods.has("all-holds")) {
            if (hitObjects[i].type === 0) {
                hitObjects[i].type = 1;
                hitObjects[i].end = hitObjects.find(h => h.column === hitObjects[i].column && h.time > hitObjects[i].time)?.time - 100 ?? (hitObjects[i].time + 500);
            }
        }
    }

    return hitObjects;
}

export function hitObjectsFromOsuFile(content) {
    const lines = content.split("\n").map(l => l.trim()).filter(l => l.length);
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

    const hitObjects = [...new Set(lines.slice(hitObjectsIndex + 1).map((l, i) => {
        const parts = l.split(",");
        const data = {
            column: Math.max(Math.floor(Number(parts[0]) / 512 * originalKeys), 0),
            time: Number(parts[2]),
            type: 0 // standard, short-hit note
        };
        
        if (parts[5]?.split(":")[0] !== "0" && parts[3] === "128") {
            parts[5] = parts[5].split(":")[0];
            data.type = 1; // long/hold note
            data.end = Number(parts[5]);
        }
        
        return data;
    }))];

    return hitObjects;
}

/**
 * Calculates and returns the star rating for a given set of hit objects.
 * @param {Object[]} hitObjects an array of all the hit objects
 * @param {number} speedMul speed multiplier (mod)
 * @param {number} diffSpikePrev difficulty spike prevention strength (0 = no prevention; 4 = default)
 * @param {Set.<string>} mods a set of mods to apply
 * @returns {Promise<number>} star rating
 */
export async function getStarRating(mode, hitObjects, speedMul = 1, diffSpikePrev = 6 ?? Math.max(10, hitObjects.length / 50), mods = new Set(),
    options = {
        evalHoldsPrior: false,
        all: false
    }
) {
    return new Promise(async (resolve, reject) => {
        if (!hitObjects || hitObjects.length === 0) resolve(0); // no objects = 0 stars

        let modified = !options.evalHoldsPrior ? modify(JSON.parse(JSON.stringify(hitObjects)), mods) : JSON.parse(JSON.stringify(hitObjects));

        const ends = modified.filter(e => e.type === 1).map(o => o.end);

        if (mode === "keys") {            
            if (!options.evalHoldsPrior) {
                const holds = modified.filter(o => o.type === 1);
                const outputHolds = await getStarRating(mode, holds, speedMul, diffSpikePrev, mods, {...options, evalHoldsPrior: true});

                modified = modified.filter(o => o.type === 0).concat(outputHolds || []).sort((a, b) => a.time - b.time);
            }

            let difficulty = 0; // total added difficulty that gets ultimately gets converted to stars
            let standardDifficulty = 0,
                speedDifficulty = 0,
                holdsDifficulty = 0;

            let lastAddition = 0;
            let lastAddition2 = 0;
            let lastColumns = Array(10).fill(-Infinity);
            let lastEnds = Array(10).fill(-Infinity);
            let lastDeltaColumns = Array(10).fill(0);
            let lastDeltas = Array(10).fill(Infinity), lastDeltaAll = Infinity;
            let speedBuff = Infinity; // fast notes across different columns also increase difficulty
            let activeHolds = [];

            for (let i = 0; i < modified.length; i++) {
                const obj = modified[i];

                difficulty += 1e-6 * (i + 1); // tiny increase per object
                const column = obj.column;

                for (let h = 0; h < activeHolds.length; h++) {
                    if (activeHolds[h].end <= obj.time) { // hold ended
                        activeHolds.splice(h, 1);
                        h--;
                    }
                }

                function evaluate(time, multiplier = 1, setLasts = true, addSpeed = true) {
                    const valid = isFinite(lastDeltas[column]);
                    const realDelta = Math.min((time - (lastColumns[column] ?? -Infinity)), 1.8 * (15 + time - (lastEnds[column] ?? -Infinity))) / speedMul;
                    const delta = (realDelta + (valid ? lastDeltas[column] * diffSpikePrev : 0)) / (valid ? diffSpikePrev + 1 : 1); // time since last object (ms); first object is treated as free
                    if (setLasts) lastDeltas[column] = delta;

                    // find end that was closest to current time but before it
                    const lastEnd = Math.max(...ends.filter(e => e <= time));

                    const validAll = isFinite(lastDeltaAll);
                    const realDeltaLast = Math.min((time - modified[i - 1]?.time), 1.8 * (25 + time - lastEnd)) / speedMul || Infinity;
                    const deltaLast = (realDeltaLast + (validAll ? lastDeltaAll * diffSpikePrev : 0)) / (validAll ? diffSpikePrev + 1 : 1);
                    if (setLasts) lastDeltaAll = deltaLast;

                    if (!isFinite(speedBuff)) speedBuff = realDeltaLast * 10;
                    if (setLasts) speedBuff = speedBuff * (1 - 1 / (diffSpikePrev + 4)) + realDeltaLast / (diffSpikePrev + 4);

                    if (delta === 0) {
                        if (setLasts) lastAddition2++;
                        obj.difficulty = 0;
                        // difficulty += lastAddition * lastAddition2 ** 3; // chord; more objects in chord = more difficult
                    } else { // new time
                        const lastRealDelta = lastDeltaColumns[column] ?? Infinity;
                        const repetitionDecrease = (Math.abs(realDelta < lastRealDelta ? (realDelta - lastRealDelta) / lastRealDelta : (lastRealDelta - realDelta) / realDelta) ** 0.5 * 1.1 + 0.1) ** 0.25 || 0; // repeated patterns = easier

                        if (setLasts) lastAddition2 = 0;
                        const standardOut = ((1 / (delta + 1)) ** 2 * 1e5 * repetitionDecrease + lastAddition * 3) / 4;
                        const speedOut = !options.evalHoldsPrior && addSpeed ? 1 / (speedBuff / Math.min(1, repetitionDecrease ** 2)) ** 2 * 7000 : 0;
                        const holdsOut = options.evalHoldsPrior ? 0 : activeHolds.reduce((a, b) => a + (b.difficulty || 0) * Math.min(1, (time - b.time) / 150) * (b.multiplier || 1), 0) ** 0.5 * 2.8;
                        const out = (standardOut + speedOut + holdsOut) * multiplier; // ultimate addition

                        if (setLasts) lastAddition = standardOut;
                        if (options.evalHoldsPrior) {
                            if (obj.difficulty === undefined) obj.difficulty = 0;
                            obj.difficulty += out;
                        }
                        if (!options.evalHoldsPrior) {
                            difficulty += out ** 4;
                            standardDifficulty += standardOut ** 4 * multiplier;
                            speedDifficulty += speedOut ** 4 * multiplier;
                            holdsDifficulty += holdsOut ** 4 * multiplier;
                        }
                    }
                    if (setLasts) lastColumns[obj.column] = time; // update last time for this column
                    if (setLasts) lastEnds[obj.column] = obj.end ?? time;

                    const valid2 = isFinite(lastDeltaColumns[column]);
                    if (setLasts) lastDeltaColumns[column] = (valid2 ? lastDeltaColumns[column] : realDelta) * 0.6 + realDelta * 0.4; // update last delta for this column
                }

                evaluate(obj.time);
                if (obj.type === 1) evaluate(obj.end, options.evalHoldsPrior ? 1 : 0, false, false);

                // active hold notes
                if (obj.type === 1) {
                    const length = obj.end - obj.time;
                    obj.multiplier = 1;
                    // obj.multiplier = length < 200 ? (-(length - 200) / 180) ** 2 + 1.25 : 250 / length;
                    activeHolds.push(obj);
                }
            }
            if (options.evalHoldsPrior) resolve(modified);
            if (!options.all) resolve(starsFromDifficulty(difficulty));
            else {
                resolve({
                    overall: starsFromDifficulty(difficulty),
                    standard: starsFromDifficulty(standardDifficulty),
                    speed: starsFromDifficulty(speedDifficulty),
                    holds: starsFromDifficulty(holdsDifficulty),
                    difficulty,
                    standardDifficulty,
                    speedDifficulty,
                    holdsDifficulty
                });
            }
        }
    });
}

function starsFromDifficulty(difficulty) {
    return Math.max(0, difficulty ** (1 / 12) * 2.5 - 1);
}

export function getPerformance(mode, stars, accuracy = 1, misses = 0, notes = stars * 1000) { // stars to performance points
    let debug = false;
    if (accuracy === true) {
        debug = true;
        accuracy = 1;
    }

    if (mode === "keys") {
        const mul = (accuracy ** 8) / (1 || (1 + misses * 40 / (notes || 1)));

        let a = 2.8 ** (Math.log(stars) / Math.log(1.7)) * 7 * mul;

        let b = 0;
        if (stars > 5) b = (stars - 5) ** 2 * 10 * mul;
        if (stars > 10) b /= 1.06 ** (stars - 10);

        const performance = (Math.max(a + b, 0)) * (1 + Math.sqrt(notes + misses) / 90);
        if (debug) return [performance, a, b];
        return performance;
    }
}

export function getRank(accuracy, misses) {
    let colors = {
        X: "#ccc",
        SS: "#08f",
        S: "#0cf",
        A: "#69d32a",
        B: "#caba13",
        C: "#cf8849",
        D: "#be4b4b",
        F: "#555"
    };
    let rank = "F";
    if (accuracy === 1) rank = "X";
    else if (accuracy >= 0.99) rank = "SS";
    else if (accuracy >= 0.95) rank = "S";
    else if (accuracy >= 0.9) rank = "A";
    else if (accuracy >= 0.8) rank = "B";
    else if (accuracy >= 0.7) rank = "C";
    else if (accuracy >= 0.6) rank = "D";
    return {rank, color: colors[rank]};
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// for (let i = 0; i < 15; i++) console.log(i + "*", "|", getPerformance("keys", i, true).map(x => x.toFixed(2)).join(", "));