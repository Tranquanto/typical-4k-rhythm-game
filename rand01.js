function hash(x, y, z, seed) {
    let h = (seed * 1664525) ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647);
    h = (h ^ (h >> 13)) * 1274126177;
    return h ^ (h >> 16);
}

/**
 * Generates a pseudorandom number between 0 and 1 based on the input coordinates and seed.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} seed Seed for the generator.
 * @returns {number} A pseudorandom number between 0 and 1 based on the input coordinates and seed. If any parameter is undefined, returns Math.random() instead.
 */
export function rand01(x, y, z, seed) {
    if (x === undefined || y === undefined || z === undefined || seed === undefined) return Math.random();
    return (hash(x, y, z, seed) >>> 0) / 2147483648;
}