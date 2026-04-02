export function getStarRating(hitObjects, speedMul = 1) {
    if (hitObjects.length === 0) return 0; // no objects = 0 stars

    const columns = [];
    for (let i = 0; i < 4; i++) { // split objects into respective columns
        columns.push(hitObjects.filter(h => h.column === i).map(h => h.time));
    }

    let difficulty = 0;
    let lastAddition = 0;
    let lastAddition2 = 0;
    let lastColumns = Array(4).fill(-Infinity);
    let inThisColumn = [0, 0];
    let lastDelta = Infinity;

    for (let i = 0; i < hitObjects.length; i++) {
        difficulty += 1e-6;
        const column = hitObjects[i].column;
        if (inThisColumn[1] === column) {
            inThisColumn[0]++;
        } else {
            inThisColumn = [1, column];
        }
        const valid = isFinite(lastDelta);
        const delta = ((hitObjects[i].time - (lastColumns[column] || -Infinity)) / speedMul + (valid ? lastDelta * 4 : 0)) / (valid ? 5 : 1); // time since last object (ms); first object is treated as free
        lastDelta = delta;
        if (delta === 0) {
            lastAddition2++;
            difficulty += lastAddition * lastAddition2 ** 3; // chord; more objects in chord = more difficult
        } else { // new time
            lastAddition2 = 0;
            lastAddition = ((1 / (delta * Math.cbrt(inThisColumn[0]) + 1)) ** 2 * 1e5 + lastAddition * 3) / 4; // ultimate addition
            difficulty += lastAddition ** 4;
        }
        lastColumns[hitObjects[i].column] = hitObjects[i].time; // update last time for this column
    }
    let stars = difficulty ** (1 / 12) * 2.4 - 1; // convert "difficulty" to star rating
    if (stars < 1) stars = (stars + 1) ** 2 / 4;
    return stars;
}

export function getPerformance(stars, accuracy = 1, misses = 0, notes = 1000, speedMul = 1) { // stars to performance points
    const mul = (accuracy ** (8 / speedMul)) / (1 + misses * 40 / (notes || 1));
    return (Math.max(1.7 ** stars * 9 * mul + (stars + 3) ** 2.4 / 2 * mul, 0) - 15.98 * mul) * (1 + Math.sqrt(notes + misses) / 90);
}

for (let i = 0; i < 15; i++) console.log(i, getPerformance(i).toFixed(2));