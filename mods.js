import {game, recalcStars} from "./map-list.js";

document.getElementById("mod-speed-input").addEventListener("input", e => {
    const value = parseFloat(e.target.value);
    game.speed = value;
    document.getElementById("mod-speed-value").textContent = `${value.toFixed(2)}x`;
    recalcStars();
});