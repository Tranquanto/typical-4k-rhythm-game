import {game, recalcStars} from "./map-list.js";

document.getElementById("mod-volume-input").addEventListener("input", e => {
    const value = parseFloat(e.target.value);
    game.volume = value;
    document.getElementById("mod-volume-value").textContent = `${Math.round(value * 100)}%`;
});

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

document.getElementById("mod-no-holds-input").addEventListener("change", e => {
    if (e.target.checked) {
        game.mods.add("no-holds");
    } else {
        game.mods.delete("no-holds");
    }
    recalcStars(game.mods);
});