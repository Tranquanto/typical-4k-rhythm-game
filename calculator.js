export function getStarRating(hitObjects, speedMul = 1) {
    if (hitObjects.length === 0) return 0; // no objects = 0 stars

    const columns = [];
    for (let i = 0; i < 4; i++) { // split objects into respective columns
        columns.push(hitObjects.filter(h => h.column === i).map(h => h.time));
    }

    let difficulty = 0;
    let lastAddition = 0;
    let lastAddition2 = 0;
    let columnChanges = [1, 1, 1, 1];

    for (let i = 0; i < hitObjects.length; i++) {
        const delta = (hitObjects[i].time - (hitObjects[i - 1]?.time || -Infinity)) / speedMul; // time since last object (ms); first object is treated as free
        if (delta === 0) {
            lastAddition2++;
            difficulty += lastAddition * lastAddition2 ** 3; // chord; more objects in chord = more difficult
        } else { // new time
            lastAddition2 = 0;
            for (let c = 0; c < 4; c++) { // "column changes" = number of notes in the same column in a row; more = harder
                if (hitObjects[i].column === c) continue;
                else columnChanges[c] = 1;
            }
            lastAddition = ((1 / (delta + 1)) ** 2 * columnChanges.reduce((a, b) => a + b) / 4 + lastAddition * 3) / 4; // ultimate addition
            difficulty += lastAddition;
        }
        columnChanges[hitObjects[i].column]++; // increase this column
    }
    return difficulty ** 0.25 * 6; // convert "difficulty" to star rating;
}

export function getPerformance(stars, accuracy = 1, misses = 0, notes = 1, speedMul = 1) { // stars to performance points
    const mul = (accuracy ** (8 / speedMul)) / (1 + misses * 40 / (notes || 1));
    return Math.max(1.7 ** stars * 9 * mul + (stars + 3) ** 2.4 / 2 * mul, 0) - 15.98 * mul;
}

for (let i = 0; i < 15; i++) console.log(i, getPerformance(i).toFixed(2));