/**
 * Modifies a provided list of hit objects according to the specified mods. This is an in-place function.
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
        }
    }

    return hitObjects;
}

/**
 * Calculates the star rating for a given set of hit objects.
 * @param {Array.<Object>} hitObjects an array of all the hit objects
 * @param {number} speedMul speed multiplier (mod)
 * @param {number} diffSpikePrev difficulty spike prevention strength (0 = no prevention; 4 = default)
 * @param {Set.<string>} mods a set of mods to apply
 * @returns {number} star rating
 */
export function getStarRating(mode, hitObjects, speedMul = 1, diffSpikePrev = Math.max(10, hitObjects.length / 50), mods = new Set()) {
    if (hitObjects.length === 0) return 0; // no objects = 0 stars

    const modified = modify(JSON.parse(JSON.stringify(hitObjects)), mods);

    const ends = modified.filter(e => e.type === 1).map(o => o.end);

    if (mode === "keys") {
        // calculate number of keys based on columns in hitObjects
        const keys = Math.max(...modified.map(o => o.column)) + 1;

        let difficulty = 0; // total added difficulty that gets ultimately gets converted to stars

        let lastAddition = 0;
        let lastAddition2 = 0;
        let lastColumns = Array(9).fill(-Infinity);
        let lastEnds = Array(9).fill(-Infinity);
        let lastDeltaColumns = Array(9).fill(0);
        let lastDelta = Infinity, lastDeltaAll = Infinity;
        let speedBuff = Infinity; // fast notes across different columns also increase difficulty
        let lastLength = Infinity; // for hold notes
        let activeHolds = [];

        for (let i = 0; i < modified.length; i++) {
            const obj = modified[i];

            difficulty += 1e-8 * (i + 1); // tiny increase per object
            const column = obj.column;

            for (let h = 0; h < activeHolds.length; h++) {
                if (activeHolds[h].end <= obj.time) { // hold ended
                    activeHolds.splice(h, 1);
                    h--;
                }
            }

            function evaluate(time, multiplier = 1, setLasts = true) {
                const valid = isFinite(lastDelta);
                const realDelta = Math.min((time - (lastColumns[column] ?? -Infinity)), 1.5 * (15 + time - (lastEnds[column] ?? -Infinity))) / speedMul;
                const delta = (realDelta + (valid ? lastDelta * diffSpikePrev : 0)) / (valid ? diffSpikePrev + 1 : 1); // time since last object (ms); first object is treated as free
                if (setLasts) lastDelta = delta;

                // find end that was closest to current time but before it
                const lastEnd = Math.max(...ends.filter(e => e <= time));

                const validAll = isFinite(lastDeltaAll);
                const realDeltaLast = Math.min((time - modified[i - 1]?.time), 1.5 * (15 + time - lastEnd)) / speedMul || Infinity;
                const deltaLast = (realDeltaLast + (validAll ? lastDeltaAll * diffSpikePrev : 0)) / (validAll ? diffSpikePrev + 1 : 1);
                if (setLasts) lastDeltaAll = deltaLast;

                if (!isFinite(speedBuff)) speedBuff = realDeltaLast;
                if (setLasts) speedBuff = speedBuff * (1 - 1 / (diffSpikePrev + 4)) + realDeltaLast / (diffSpikePrev + 4);

                if (delta === 0) {
                    if (setLasts) lastAddition2++;
                    // difficulty += lastAddition * lastAddition2 ** 3; // chord; more objects in chord = more difficult
                } else { // new time
                    const lastRealDelta = lastDeltaColumns[column] ?? Infinity;
                    const repetitionDecrease = (Math.abs(realDelta < lastRealDelta ? (realDelta - lastRealDelta) / lastRealDelta : (lastRealDelta - realDelta) / realDelta) ** 0.5 * 1.1 + 0.1) ** 0.25 || 0; // repeated patterns = easier

                    if (setLasts) lastAddition2 = 0;
                    const out = (((1 / (delta + 1)) ** 2 * 1e5 + lastAddition * 3) / 4 * repetitionDecrease * (1 / Math.min(speedBuff / 1000, 1)) ** 0.07 * (activeHolds.length + 1) ** 0.11) * multiplier; // ultimate addition

                    if (setLasts) lastAddition = out;
                    difficulty += out ** 4;
                }
                if (setLasts) lastColumns[obj.column] = time; // update last time for this column
                if (setLasts) lastEnds[obj.column] = obj.end ?? time;

                const valid2 = isFinite(lastDeltaColumns[column]);
                if (setLasts) lastDeltaColumns[column] = (valid2 ? lastDeltaColumns[column] : realDelta) * 0.6 + realDelta * 0.4; // update last delta for this column
            }

            evaluate(obj.time);
            if (obj.type === 1) evaluate(obj.end, 0, false);

            // active hold notes
            if (obj.type === 1) {
                activeHolds.push(obj);
            }
        }
        let stars = difficulty ** (1 / 12) * 2.5 - 1; // convert "difficulty" to star rating
        if (stars < 1) stars = (stars + 1) ** 2 / 4;
        return stars;
    }
}

export function getPerformance(mode, stars, accuracy = 1, misses = 0, notes = stars * 1000, speedMul = 1) { // stars to performance points
    let debug = false;
    if (accuracy === true) {
        debug = true;
        accuracy = 1;
    }

    if (mode === "keys") {
        const mul = (accuracy ** (8 / speedMul)) / (1 + misses * 40 / (notes || 1));

        let a = 2.8 ** (Math.log(stars) / Math.log(1.7)) * 7 * mul;

        let b = 0;
        if (stars > 5) b = (stars - 5) ** 2 * 10 * mul;
        if (stars > 10) b /= 1.06 ** (stars - 10);

        const performance = (Math.max(a + b, 0)) * (1 + Math.sqrt(notes + misses) / 90);
        if (debug) return [performance, a, b];
        return performance;
    }
}
window.getPerformance = getPerformance;

export function getRank(accuracy, misses) {
    let colors = {
        X: "#ccc",
        SS: "#fc0",
        S: "#f70",
        A: "#69d32a",
        B: "#438be1",
        C: "#9e4cce",
        D: "#d23d3d",
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

for (let i = 0; i < 15; i++) console.log(i + "*", "|", getPerformance("keys", i, true).map(x => x.toFixed(2)).join(", "));