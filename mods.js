import { game, recalcStars } from "./map-list.js";
import { getElementById } from "./getElementById.js";

getElementById("mod-volume-input").addEventListener("input", e => {
    const value = parseFloat(e.target.value);
    game.volume = value;
    getElementById("mod-volume-value").textContent = `${Math.round(value * 100)}%`;
});

getElementById("mod-speed-input").addEventListener("input", e => {
    const value = parseFloat(e.target.value);
    game.speed = value;
    getElementById("mod-speed-value").textContent = `${value.toFixed(2)}x`;
    recalcStars();
});

getElementById("mod-keys-input").addEventListener("input", e => {
    const value = parseInt(e.target.value);
    game.keys = value;
    getElementById("mod-keys-value").textContent = `${value}K`;
    recalcStars();
});

getElementById("mod-no-holds-input").addEventListener("change", e => {
    if (e.target.checked) {
        game.mods.add("no-holds");
        game.mods.delete("all-holds");
        getElementById("mod-all-holds-input").checked = false;
    } else {
        game.mods.delete("no-holds");
    }
    recalcStars(game.mods);
});

getElementById("mod-all-holds-input").addEventListener("change", e => {
    if (e.target.checked) {
        game.mods.add("all-holds");
        game.mods.delete("no-holds");
        getElementById("mod-no-holds-input").checked = false;
    } else {
        game.mods.delete("all-holds");
    }
    recalcStars(game.mods);
});