/**
 * Calculates the star rating for a given set of hit objects.
 * @param {Array.<Object>} hitObjects an array of all the hit objects
 * @param {number} speedMul speed multiplier (mod)
 * @param {number} diffSpikePrev difficulty spike prevention strength (0 = no prevention; 4 = default)
 * @returns {number} star rating
 */
export function getStarRating(hitObjects, speedMul = 1, diffSpikePrev = 10) {
    if (hitObjects.length === 0) return 0; // no objects = 0 stars

    // calculate number of keys based on columns in hitObjects
    const keys = Math.max(...hitObjects.map(o => o.column)) + 1;

    let difficulty = 0;
    let lastAddition = 0;
    let lastAddition2 = 0;
    let lastColumns = Array(9).fill(-Infinity);
    let lastDeltaColumns = Array(9).fill(0);
    let inThisColumn = [0, -1]; // [count, column]
    let lastDelta = Infinity;

    for (let i = 0; i < hitObjects.length; i++) {
        difficulty += 1e-8 * (i + 1);
        const column = hitObjects[i].column;
        if (inThisColumn[1] === column) {
            inThisColumn[0]++;
        } else {
            inThisColumn = [1, column];
        }
        const valid = isFinite(lastDelta);
        const realDelta = (hitObjects[i].time - (lastColumns[column] ?? -Infinity)) / speedMul;
        const delta = (realDelta + (valid ? lastDelta * diffSpikePrev : 0)) / (valid ? diffSpikePrev + 1 : 1); // time since last object (ms); first object is treated as free
        lastDelta = delta;
        if (delta === 0) {
            lastAddition2++;
            difficulty += lastAddition * lastAddition2 ** 3; // chord; more objects in chord = more difficult
        } else { // new time
            const lastRealDelta = lastDeltaColumns[column] ?? Infinity;
            const repetitionDecrease = (Math.abs(realDelta < lastRealDelta ? (realDelta - lastRealDelta) / lastRealDelta : (lastRealDelta - realDelta) / realDelta) ** 0.5 * 1.3 + 0.3) ** 0.25 || 0; // repeated patterns = easier

            lastAddition2 = 0;
            lastAddition = ((1 / (delta + 1)) ** 2 * 1e5 + lastAddition * 3) / 4 * repetitionDecrease; // ultimate addition
            difficulty += (lastAddition / 4 * keys) ** 4;
        }
        lastColumns[hitObjects[i].column] = hitObjects[i].time; // update last time for this column

        const valid2 = isFinite(lastDeltaColumns[column]);
        lastDeltaColumns[column] = (valid2 ? lastDeltaColumns[column] : realDelta) * 0.6 + realDelta * 0.4; // update last delta for this column
    }
    let stars = difficulty ** (1 / 12) * 2.4 - 1; // convert "difficulty" to star rating
    if (stars < 1) stars = (stars + 1) ** 2 / 4;
    return stars;
}

export function getPerformance(stars, accuracy = 1, misses = 0, notes = stars * 1000, speedMul = 1) { // stars to performance points
    let debug = false;
    if (accuracy === true) {
        debug = true;
        accuracy = 1;
    }
    const mul = (accuracy ** (8 / speedMul)) / (1 + misses * 40 / (notes || 1));

    let a = 2.5 ** (Math.log(stars) / Math.log(1.7)) * 7 * mul;

    let b = 0;
    if (stars > 5) b = (stars - 5) ** 2 * 10 * mul;
    if (stars > 10) b /= 1.06 ** (stars - 10);

    const performance = (Math.max(a + b, 0)) * (1 + Math.sqrt(notes + misses) / 90);
    if (debug) return [performance, a, b];
    return performance;
}

export function getRank(accuracy, misses) {
    let colors = {
        X: "#fc0",
        S: "#f70",
        A: "#69d32a",
        B: "#438be1",
        C: "#9e4cce",
        D: "#d23d3d",
        F: "#555"
    };
    let rank = "F";
    if (accuracy === 1) rank = "X";
    else if (accuracy >= 0.95) rank = "S";
    else if (accuracy >= 0.9) rank = "A";
    else if (accuracy >= 0.8) rank = "B";
    else if (accuracy >= 0.7) rank = "C";
    else if (accuracy >= 0.6) rank = "D";
    return {rank, color: colors[rank[0]]};
}

for (let i = 0; i < 15; i++) console.log(i + "*", "|", getPerformance(i, true).map(x => x.toFixed(2)).join(", "));