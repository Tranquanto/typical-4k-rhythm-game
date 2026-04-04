import {game, recalcStars} from "./map-list.js";

document.getElementById("mod-speed-input").addEventListener("input", e => {
    const value = parseFloat(e.target.value);
    game.speed = value;
    document.getElementById("mod-speed-value").textContent = `${value.toFixed(2)}x`;
    recalcStars();
});

document.getElementById("mod-keys-input").addEventListener("input", e => {
    const value = parseInt(e.target.value);
    game.keys = value;
    document.getElementById("mod-keys-value").textContent = `${value}K`;
    recalcStars();
});