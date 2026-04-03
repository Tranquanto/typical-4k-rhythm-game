const elems = {};

/**
 * Returns the element with the specified ID, caching it for future calls
 * @param {string} id ID of the element to query
 * @returns {Element} The element queried
 */
export function getElementById(id) {
    return elems[id] || (elems[id] = document.getElementById(id));
}