function loadLibrary(storageKey) {
    try {
        let savedData = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return Array.isArray(savedData) ? savedData : [];
    } catch (error) {
        return [];
    }
}

let combatants = [];
let currentTurn = -1;
let round = 1;
let creatureLibrary = loadLibrary("creatureLibrary");
let editingCreatureId = null;
let npcLibrary = loadLibrary("npcLibrary");
let editingNpcId = null;
let storyNpcLibrary = loadLibrary("storyNpcLibrary");
let editingStoryNpcId = null;
let playerLibrary = loadLibrary("playerLibrary");
let editingPlayerId = null;
let lootLibrary = loadLibrary("lootLibrary");
let editingLootId = null;
let lootGenerated = false;
let lootedMonsterIds = new Set();
let effectTargetId = null;
let generatedEncounter = [];
let encounterSaveTimer = null;

const commonEffects = [
    "Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened",
    "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified",
    "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
    "Sleep", "Bless", "Concentrating", "Haste", "Hex", "Other"
];

const challengeRatingXP = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100,
    "5": 1800, "6": 2300, "7": 2900, "8": 3900,
    "9": 5000, "10": 5900, "11": 7200, "12": 8400,
    "13": 10000, "14": 11500, "15": 13000, "16": 15000,
    "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000,
    "25": 75000, "26": 90000, "27": 105000, "28": 120000,
    "29": 135000, "30": 155000
};

const encounterThresholdsByLevel = {
    1: [25, 50, 75, 100], 2: [50, 100, 150, 200],
    3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
    5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400],
    7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
    9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800],
    11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700],
    15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
    17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500],
    19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
};

const lootItemsByTier = {
    "Common": ["Potion of Healing", "Potion of Climbing", "Spell Scroll (cantrip)"],
    "Uncommon": ["Potion of Greater Healing", "Bag of Holding", "+1 Weapon"],
    "Rare": ["Potion of Superior Healing", "Ring of Protection", "+2 Weapon"],
    "Very Rare": ["Potion of Supreme Healing", "Staff of Fire", "+3 Weapon"],
    "Legendary": ["Holy Avenger", "Staff of the Magi", "Vorpal Sword"]
};

const lootRarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const lootValueModifiers = [
    { name: "Fine", percent: 5 },
    { name: "Superior", percent: 10 },
    { name: "Masterwork", percent: 15 },
    { name: "Worn", percent: -5 },
    { name: "Poor", percent: -10 },
    { name: "Damaged", percent: -15 }
];

function formatLootValueModifier(item, modifiers = lootValueModifiers) {
    let modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
    let percentage = (modifier.percent > 0 ? "+" : "") + modifier.percent + "%";
    let result = " | " + modifier.name + " (" + percentage + ")";

    if (Number.isFinite(item.valueGp)) {
        let adjustedValue = Math.max(0, Math.round(item.valueGp * (1 + modifier.percent / 100) * 100) / 100);
        let formattedValue = Number.isInteger(adjustedValue)
            ? String(adjustedValue)
            : adjustedValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        result += " | Value: " + formattedValue + " gp";
    }
    return result;
}

function nextTurn(){
    if(combatants.length === 0) return;
    if (currentTurn >= 0) {
        tickCombatantEffects(combatants[currentTurn]);
    }
    let checked = 0;
    do{
        currentTurn++;
        if(currentTurn >= combatants.length){
            currentTurn =0;
            round++;
        }
        checked++;
        let combatant = combatants[currentTurn];
        if(combatant.type === "player" || combatant.hp > 0){
            document.getElementById("round").textContent=round;
            displayCombatants();
            return;
        }
    }
    while(checked < combatants.length);
    currentTurn = -1;
    document.getElementById("round").textContent=round;
    displayCombatants();
    checkCombatFinished();
}

function displayCombatants(){
    let list=document.getElementById("combatantList");
    list.innerHTML="";
    
    for (let combatant of combatants){
        
        let entry = document.createElement("p");
        entry.id=combatant.id;
        
        let label = document.createElement("span");
        label.textContent = combatant.name;
        if (combatant.type === "npc") {
            let npcTag = document.createElement("span");
            npcTag.className = "npc-tag";
            npcTag.textContent = "NPC";
            label.appendChild(npcTag);
        }
        if (combatant.type === "storyNpc") {
            let storyNpcTag = document.createElement("span");
            storyNpcTag.className = "npc-tag story-npc-tag";
            storyNpcTag.textContent = "Story";
            label.appendChild(storyNpcTag);
        }
        
        let initiativeInput = document.createElement("input");

        initiativeInput.type = "number";
        initiativeInput.value = Number.isFinite(combatant.initiative) ? combatant.initiative : "";
        initiativeInput.className = "initiative-input";
        initiativeInput.setAttribute("aria-label", combatant.name + " initiative total");
        initiativeInput.placeholder = "Roll";

        initiativeInput.onchange = function() {
            if (initiativeInput.value.trim() === ""){
                combatant.initiative = null;
                saveCurrentEncounter();
                return;
            }

            combatant.initiative = Number(initiativeInput.value);
            saveCurrentEncounter();
        };

        entry.appendChild(initiativeInput);

        entry.appendChild(label);

        let effects = Array.isArray(combatant.effects) ? combatant.effects : [];
        if (effects.length > 0) {
            let effectsList = document.createElement("span");
            effectsList.className = "effect-list";
            for (let effect of effects) {
                let effectTag = document.createElement("span");
                effectTag.className = "effect-tag";
                effectTag.textContent = effect.name +
                    (Number.isInteger(effect.remainingTurns)
                        ? " (" + effect.remainingTurns + " turns)"
                        : effect.duration ? " (" + effect.duration + ")" : "") +
                    (effect.notes ? " - " + effect.notes : "");

                let removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "remove-effect-button";
                removeButton.textContent = "x";
                removeButton.title = "Remove " + effect.name;
                removeButton.setAttribute("aria-label", "Remove " + effect.name);
                removeButton.onclick = function() {
                    removeCombatantEffect(combatant.id, effect.id);
                };

                effectTag.appendChild(removeButton);
                effectsList.appendChild(effectTag);
            }
            entry.appendChild(effectsList);
        }

        let effectsButton = document.createElement("button");
        effectsButton.type = "button";
        effectsButton.className = "effects-button";
        effectsButton.textContent = "Effects";
        effectsButton.onclick = function() {
            openEffectDialog(combatant.id);
        };
        entry.appendChild(effectsButton);

        if (combatant.type === "player"){
            let downButton = document.createElement("button");

            downButton.textContent = combatant.down ? "Revive": "Down";
            downButton.onclick = function(){
                toggleDown(combatant.id);
            };

            entry.appendChild(downButton);

            if (combatant.down){
                let saves = document.createElement("span");

                saves.textContent = 
                "Successes: " + combatant.deathSuccesses + 
                "/3 | Failures: " + combatant.deathFailures + "/3 ";

                entry.appendChild(saves);

                let successButton = document.createElement("button");
                successButton.textContent = "+ Success";
                successButton.onclick = function(){
                    changeDeathSave(combatant.id, "success");
                };

                entry.appendChild(successButton);

                let failureButton = document.createElement("button");
                failureButton.textContent = "+ Failure";
                failureButton.onclick = function(){
                    changeDeathSave(combatant.id,"failure");
                };

                entry.appendChild(failureButton);

                let nat1Button = document.createElement("button");
                nat1Button.textContent = "Nat 1";
                nat1Button.onclick = function(){
                    changeDeathSave(combatant.id, "nat1");
                };

                entry.appendChild(nat1Button);

                let nat20Button = document.createElement("button");
                nat20Button.textContent = "Nat 20";
                nat20Button.onclick = function(){
                    changeDeathSave(combatant.id, "nat20");
                };

                entry.appendChild(nat20Button);
            }
        }

        if (combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc"){
            let hpDisplay = document.createElement("span");
            hpDisplay.textContent = " - " + combatant.hp + "/" + combatant.maxHP + " HP";
            
            entry.appendChild(hpDisplay);
            
            let amountInput = document.createElement("input");
            amountInput.type = "number";
            amountInput.min = "1";
            amountInput.value = "";
            amountInput.className = "hp-input";
            
            entry.appendChild(amountInput);
            
            let damageButton = document.createElement("button");
            damageButton.textContent = "Damage";
            damageButton.onclick = function(){
                changeHP(combatant.id, -Number(amountInput.value));
            };
            
            entry.appendChild(damageButton);
            
            let healButton = document.createElement("button");
            healButton.textContent = "Heal";
            healButton.onclick = function(){
                changeHP(combatant.id, Number(amountInput.value));
            };
            
            entry.appendChild(healButton);
        }
        if (currentTurn >= 0 && combatants[currentTurn].id === combatant.id){
            entry.classList.add("active");
        }
        if ((combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc") && combatant.hp === 0){
            entry.classList.add("defeated");
        }
        if (combatant.type === "player" && combatant.down){
            if(combatant.deathFailures >= 3) {
                entry.classList.add("defeated");
            }
            else if (combatant.deathSuccesses >= 3){
                entry.classList.add("stabilized");
            }
            else {
                entry.classList.add("downed");
            }
        }
        list.appendChild(entry);
}
    updateCombatDanger();
    if (encounterSaveTimer) {
        clearTimeout(encounterSaveTimer);
    }
    encounterSaveTimer = setTimeout(() => {
        saveCurrentEncounter();
    }, 0);
    }

function updateCombatDanger() {
    let panel = document.getElementById("combatDanger");
    let title = document.getElementById("combatDangerTitle");
    let details = document.getElementById("combatDangerDetails");
    let encounterCreatures = combatants.filter(combatant =>
        combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc"
    );
    let players = combatants.filter(combatant => combatant.type === "player");

    if (encounterCreatures.length === 0) {
        panel.className = "danger-rating danger-neutral";
        title.textContent = "No encounter";
        details.textContent = "Add players and creatures to see the difficulty.";
        return;
    }

    if (players.length === 0) {
        panel.className = "danger-rating danger-neutral";
        title.textContent = "Not rated";
        details.textContent = "Add players to combat to calculate difficulty.";
        return;
    }

    let rating = rateEncounter(encounterCreatures, players);
    panel.className = "danger-rating danger-" + rating.difficulty.toLowerCase();
    title.textContent = rating.difficulty;
    details.textContent = rating.adjustedXP + " adjusted XP across " +
        encounterCreatures.length + " creature(s) and " + players.length + " player(s).";
}

function buildEncounterState() {
    return {
        version: 1,
        combatants: combatants,
        currentTurn: currentTurn,
        round: round,
        lootGenerated: lootGenerated,
        lootedMonsterIds: Array.from(lootedMonsterIds),
        lootItems: Array.from(document.querySelectorAll("#lootResults li"), item => item.textContent),
        lootVisible: !document.getElementById("lootPanel").hidden
    };
}

function saveCurrentEncounter() {
    try {
        localStorage.setItem("currentEncounter", JSON.stringify(buildEncounterState()));
        document.getElementById("encounterSaveStatus").textContent = "Autosaved on this device.";
        return true;
    } catch (error) {
        document.getElementById("encounterSaveStatus").textContent = "Could not save this encounter.";
        return false;
    }
}

function saveEncounter() {
    if (combatants.length === 0) {
        alert("Add players or creatures before saving an encounter.");
        return;
    }
    if (!saveCurrentEncounter()) return;

    try {
        localStorage.setItem("savedEncounter", localStorage.getItem("currentEncounter"));
        document.getElementById("resumeEncounterButton").disabled = false;
        document.getElementById("encounterSaveStatus").textContent = "Encounter saved. Resume it any time on this device.";
    } catch (error) {
        document.getElementById("encounterSaveStatus").textContent = "Could not save this encounter.";
    }
}

function restoreEncounterState(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.combatants) ||
        !state.combatants.every(combatant =>
            combatant && typeof combatant.id === "string" &&
            typeof combatant.name === "string" &&
            (combatant.type === "player" || combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc")
        )) {
        return false;
    }

    combatants = state.combatants.map(combatant => {
        if (!Number.isFinite(combatant.initiativeModifier)) {
            combatant.initiativeModifier = Number(combatant.initiative) || 0;
        }
        if (!Number.isFinite(combatant.initiative)) {
            combatant.initiative = null;
        }
        if (!Array.isArray(combatant.effects)) {
            combatant.effects = [];
        }
        return combatant;
    });
    currentTurn = Number.isInteger(state.currentTurn) &&
        state.currentTurn >= 0 && state.currentTurn < combatants.length
        ? state.currentTurn
        : -1;
    round = Number.isInteger(state.round) && state.round > 0 ? state.round : 1;
    lootGenerated = Boolean(state.lootGenerated);
    lootedMonsterIds = new Set(Array.isArray(state.lootedMonsterIds) ? state.lootedMonsterIds : []);
    document.getElementById("round").textContent = round;

    let lootResults = document.getElementById("lootResults");
    lootResults.replaceChildren();
    if (state.lootVisible && Array.isArray(state.lootItems) && state.lootItems.length > 0) {
        let list = document.createElement("ul");
        for (let item of state.lootItems) {
            let entry = document.createElement("li");
            entry.textContent = item;
            list.appendChild(entry);
        }
        lootResults.appendChild(list);
    }
    document.getElementById("lootPanel").hidden =
        !(state.lootVisible && Array.isArray(state.lootItems) && state.lootItems.length > 0);
    displayCombatants();
    return true;
}

function resumeSavedEncounter() {
    let savedEncounter = localStorage.getItem("savedEncounter");
    if (!savedEncounter) {
        alert("There is no saved encounter on this device.");
        return;
    }
    if (combatants.length > 0 && !confirm("Replace the current encounter with the saved encounter?")) {
        return;
    }
    try {
        if (!restoreEncounterState(JSON.parse(savedEncounter))) {
            alert("The saved encounter could not be read.");
            return;
        }
        showScreen("combat");
        document.getElementById("encounterSaveStatus").textContent = "Saved encounter resumed.";
    } catch (error) {
        alert("The saved encounter could not be read.");
    }
}

function restoreCurrentEncounter() {
    try {
        let currentEncounter = localStorage.getItem("currentEncounter");
        return currentEncounter
            ? restoreEncounterState(JSON.parse(currentEncounter))
            : false;
    } catch (error) {
        return false;
    }
}

function changeHP(id, amount){
    let monster = combatants.find(c=>c.id===id);
    if(!monster || (monster.type !== "monster" && monster.type !== "npc" && monster.type !== "storyNpc")){
        return;
    }
    if (!Number.isFinite(amount)||!Number.isInteger(amount)||amount === 0){
        return;
    }
    monster.hp=Math.max(0, Math.min(monster.maxHP, monster.hp + amount)
    );
    displayCombatants();
    checkCombatFinished();
    
}

function openEffectDialog(combatantId) {
    let combatant = combatants.find(item => item.id === combatantId);
    if (!combatant) return;
    effectTargetId = combatantId;
    document.getElementById("effectTargetName").textContent = combatant.name;
    document.getElementById("effectDialog").showModal();
    document.getElementById("effectName").focus();
}

function addCombatantEffect() {
    let combatant = combatants.find(item => item.id === effectTargetId);
    let name = document.getElementById("effectName").value.trim();
    let durationText = document.getElementById("effectDuration").value;
    let remainingTurns = durationText === "" ? null : Number(durationText);
    if (!combatant || !name) return;
    if (remainingTurns !== null && (!Number.isInteger(remainingTurns) || remainingTurns < 1)) {
        alert("Duration must be a whole number of turns greater than zero.");
        return;
    }

    if (!Array.isArray(combatant.effects)) {
        combatant.effects = [];
    }
    combatant.effects.push({
        id: "effect-" + Date.now() + "-" + Math.random(),
        name: name,
        remainingTurns: remainingTurns,
        notes: document.getElementById("effectNotes").value.trim()
    });
    displayCombatants();
    document.getElementById("effectDialog").close();
}

function tickCombatantEffects(combatant) {
    if (!Array.isArray(combatant.effects)) return;
    for (let effect of combatant.effects) {
        if (Number.isInteger(effect.remainingTurns)) {
            effect.remainingTurns--;
        }
    }
    combatant.effects = combatant.effects.filter(effect =>
        !Number.isInteger(effect.remainingTurns) || effect.remainingTurns > 0
    );
}

function removeCombatantEffect(combatantId, effectId) {
    let combatant = combatants.find(item => item.id === combatantId);
    if (!combatant || !Array.isArray(combatant.effects)) return;
    combatant.effects = combatant.effects.filter(effect => effect.id !== effectId);
    displayCombatants();
}

function resetEffectDialog() {
    effectTargetId = null;
    document.getElementById("effectForm").reset();
}

function checkCombatFinished() {
    if (lootGenerated) return;

    let hostileCombatants = combatants.filter(combatant =>
        combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc"
    );
    if (hostileCombatants.length === 0) return;
    if (hostileCombatants.some(combatant => combatant.hp > 0)) return;

    let rewardableMonsters = hostileCombatants.filter(combatant =>
        combatant.type === "monster" && !lootedMonsterIds.has(combatant.id)
    );
    let protectedNpcs = hostileCombatants.filter(combatant =>
        (combatant.type === "npc" || combatant.type === "storyNpc") &&
        combatant.hp > 0 && !lootedMonsterIds.has(combatant.id)
    );
    let rewardableCombatants = rewardableMonsters.concat(protectedNpcs);
    if (rewardableCombatants.length === 0) return;

    lootGenerated = true;
    rewardableCombatants.forEach(combatant => lootedMonsterIds.add(combatant.id));
    let protectedNpcXP = protectedNpcs.length * challengeRatingXP["1/8"];
    let totalXP = rewardableCombatants.reduce((sum, combatant) => {
        let challengeRating = combatant.challengeRating ||
            (combatant.type === "npc" ? "1/8" : "0");
        return sum + (challengeRatingXP[challengeRating] || 10);
    }, 0);
    let party = combatants.filter(combatant => combatant.type === "player");
    let averagePartyLevel = party.length
        ? party.reduce((sum, player) => sum + (player.level || 1), 0) / party.length
        : 1;
    let levelTier = averagePartyLevel >= 17 ? "Legendary" :
        averagePartyLevel >= 11 ? "Very Rare" :
        averagePartyLevel >= 5 ? "Rare" : "Uncommon";
    let xpTier = totalXP >= 50000 ? "Legendary" :
        totalXP >= 18000 ? "Very Rare" :
        totalXP >= 7200 ? "Rare" :
        totalXP >= 1800 ? "Uncommon" : "Common";
    let tierOrder = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
    let tier = tierOrder[Math.min(tierOrder.indexOf(levelTier), tierOrder.indexOf(xpTier))];
    let gold = Math.max(1, Math.round(totalXP * (0.025 + Math.random() * 0.025)));
    let itemChance = tier === "Common" ? 0.2 :
        tier === "Uncommon" ? 0.35 :
        tier === "Rare" ? 0.5 : 0.65;
    let rewards = document.createElement("ul");
    let xpReward = document.createElement("li");
    xpReward.textContent = totalXP + " XP earned" +
        (protectedNpcXP > 0
            ? " (includes " + protectedNpcXP + " bonus XP for " + protectedNpcs.length + " protected NPC(s))"
            : "");
    rewards.appendChild(xpReward);

    let coins = document.createElement("li");
    coins.textContent = gold + " gp";
    rewards.appendChild(coins);

    let rewardTier = lootRarities.indexOf(tier);
    let defaultItems = Object.entries(lootItemsByTier).flatMap(([rarity, items]) =>
        lootRarities.indexOf(rarity) <= rewardTier
            ? items.map(name => ({ name: name, rarity: rarity, details: "" }))
            : []
    );
    let customItems = lootLibrary.filter(item =>
        lootRarities.indexOf(item.rarity) <= rewardTier
    );
    let itemPool = defaultItems.concat(customItems);

    if (Math.random() < itemChance && itemPool.length > 0) {
        let item = itemPool[Math.floor(Math.random() * itemPool.length)];
        let itemReward = document.createElement("li");
        itemReward.textContent = item.rarity + " loot: " + item.name +
            (item.details ? " - " + item.details : "") +
            formatLootValueModifier(item);
        rewards.appendChild(itemReward);
    } else {
        let noItem = document.createElement("li");
        noItem.textContent = "No magic item found this time.";
        rewards.appendChild(noItem);
    }

    let overLevelledItems = lootLibrary.filter(item =>
        lootRarities.indexOf(item.rarity) > rewardTier
    );
    if (overLevelledItems.length > 0 && Math.random() < 0.05) {
        let item = overLevelledItems[Math.floor(Math.random() * overLevelledItems.length)];
        let bonusReward = document.createElement("li");
        bonusReward.textContent = "Lucky over-levelled find: " + item.rarity + " loot: " + item.name +
            (item.details ? " - " + item.details : "") +
            formatLootValueModifier(item, lootValueModifiers.filter(modifier => modifier.percent > 0));
        rewards.appendChild(bonusReward);
    }

    document.getElementById("lootResults").replaceChildren(rewards);
    document.getElementById("lootPanel").hidden = false;
    saveCurrentEncounter();
}

function clearCombatLoot() {
    lootGenerated = false;
    document.getElementById("lootPanel").hidden = true;
    document.getElementById("lootResults").replaceChildren();
}

function toggleDown(id){
    let player = combatants.find(c => c.id === id);

    if (!player || player.type !== "player") return;

    player.down = !player.down;

    player.deathSuccesses = 0;
    player.deathFailures = 0;

    displayCombatants();
}

function changeDeathSave(id, result){
    let player = combatants.find(c => c.id === id);

    if (!player || player.type !== "player" || !player.down){
        return;
    }

    if (player.deathSuccesses >= 3 || player.deathFailures >= 3) {
        return;
    }

    if (result === "success") {
        player.deathSuccesses++;
    }
    
    if (result === "failure") {
        player.deathFailures++;
    }

    if (result === "nat1") {
        player.deathFailures = Math.min(3, player.deathFailures + 2);
    }

    if (result === "nat20") {
        player.down = false;
        player.deathSuccesses = 0;
        player.deathFailures = 0;
    }

    displayCombatants();
}

function sortInitiative(){
    if (combatants.some(combatant => !Number.isFinite(combatant.initiative))) {
        alert("Roll monster initiative and enter each player's roll before sorting.");
        return;
    }

    let activeId = currentTurn >= 0
    ? combatants[currentTurn].id
    : null;

    combatants.sort((a,b) => b.initiative - a.initiative);

    if (activeId !== null){
        currentTurn = combatants.findIndex(c => c.id===activeId);
    }

    displayCombatants();
}

function rollMonsterInitiative() {
    let hostileCombatants = combatants.filter(combatant =>
        combatant.type === "monster" || combatant.type === "npc" || combatant.type === "storyNpc"
    );
    if (hostileCombatants.length === 0) {
        alert("Add a monster or NPC to combat before rolling initiative.");
        return;
    }

    for (let combatant of hostileCombatants) {
        if (Number.isFinite(combatant.initiative)) {
            continue;
        }

        let modifier = Number.isFinite(combatant.initiativeModifier)
            ? combatant.initiativeModifier
            : Number(combatant.initiative) || 0;
        combatant.initiativeModifier = modifier;
        combatant.initiative = Math.floor(Math.random() * 20) + 1 + modifier;
    }
    displayCombatants();
}

function showScreen(screen){
    let screens = document.querySelectorAll(".screen");
    for (let section of screens) {
        section.classList.remove("active");
        section.style.display = "none";
    }

    let selectedScreen = document.getElementById(screen + "Screen") ||
        document.getElementById(screen);
    if (selectedScreen) {
        selectedScreen.classList.add("active");
        selectedScreen.style.display = "block";
    }

    for (let button of document.querySelectorAll("nav button[data-screen]")) {
        let isSelected = button.dataset.screen === screen;
        button.classList.toggle("selected", isSelected);
        if (isSelected) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    }
}

function getEncounterParty() {
    let activePlayers = combatants.filter(combatant => combatant.type === "player");
    return activePlayers.length > 0 ? activePlayers : playerLibrary;
}

function getEncounterMultiplier(monsterCount, partySize) {
    let baseMultiplier = monsterCount === 1 ? 1 :
        monsterCount === 2 ? 1.5 :
        monsterCount <= 6 ? 2 :
        monsterCount <= 10 ? 2.5 :
        monsterCount <= 14 ? 3 : 4;
    let multipliers = [0.5, 1, 1.5, 2, 2.5, 3, 4];
    let multiplierIndex = multipliers.indexOf(baseMultiplier);

    if (partySize < 3) {
        multiplierIndex = Math.min(multipliers.length - 1, multiplierIndex + 1);
    } else if (partySize >= 6) {
        multiplierIndex = Math.max(0, multiplierIndex - 1);
    }
    return multipliers[multiplierIndex];
}

function rateEncounter(monsters, party) {
    let baseXP = monsters.reduce((sum, monster) => {
        let cr = monster.challengeRating || "0";
        return sum + (challengeRatingXP[cr] || 10);
    }, 0);
    let multiplier = getEncounterMultiplier(monsters.length, party.length);
    let adjustedXP = Math.round(baseXP * multiplier);

    if (party.length === 0) {
        return { baseXP, adjustedXP, multiplier, difficulty: null };
    }

    let thresholds = [0, 0, 0, 0];
    for (let player of party) {
        let level = Math.max(1, Math.min(20, Number(player.level) || 1));
        let playerThresholds = encounterThresholdsByLevel[level];
        thresholds = thresholds.map((threshold, index) => threshold + playerThresholds[index]);
    }

    let difficulty = adjustedXP <= thresholds[0] ? "Easy" :
        adjustedXP <= thresholds[1] ? "Medium" :
        adjustedXP <= thresholds[2] ? "Hard" : "Deadly";
    return { baseXP, adjustedXP, multiplier, difficulty, thresholds };
}

function generateRandomEncounter() {
    let targetCR = document.getElementById("encounterCR").value;
    let xpBudget = challengeRatingXP[targetCR];
    let generatedXP = 0;
    generatedEncounter = [];

    let availableCreatures = creatureLibrary.filter(creature => {
        let cr = creature.challengeRating || "0";
        return challengeRatingXP[cr] !== undefined;
    });
    let result = document.getElementById("generatedEncounter");
    let addButton = document.getElementById("addGeneratedEncounterButton");
    result.replaceChildren();
    addButton.hidden = true;

    if (availableCreatures.length === 0) {
        result.textContent = "Add creatures to your saved list before generating an encounter.";
        return;
    }

    while (generatedEncounter.length < 8) {
        let eligibleCreatures = availableCreatures.filter(creature => {
            let cr = creature.challengeRating || "0";
            return challengeRatingXP[cr] <= xpBudget - generatedXP;
        });
        if (eligibleCreatures.length === 0) break;

        let highestEligibleXP = Math.max(...eligibleCreatures.map(creature =>
            challengeRatingXP[creature.challengeRating || "0"]
        ));
        let variedOptions = eligibleCreatures.filter(creature =>
            challengeRatingXP[creature.challengeRating || "0"] >= highestEligibleXP * 0.6
        );
        let creature = variedOptions[Math.floor(Math.random() * variedOptions.length)];
        generatedEncounter.push(creature);
        generatedXP += challengeRatingXP[creature.challengeRating || "0"];
    }

    let party = getEncounterParty();
    let rating = rateEncounter(generatedEncounter, party);
    let summary = document.createElement("p");
    summary.textContent = "Generated " + generatedEncounter.length +
        " monster(s): " + generatedXP + " / " + xpBudget + " XP budget. " +
        "Adjusted XP: " + rating.adjustedXP + " (" + rating.multiplier + "x). " +
        (rating.difficulty
            ? "Party difficulty: " + rating.difficulty + "."
            : "Save players to calculate party difficulty.");
    result.appendChild(summary);

    let list = document.createElement("ul");
    for (let creature of generatedEncounter) {
        let item = document.createElement("li");
        let cr = creature.challengeRating || "0";
        item.textContent = creature.name + " (CR " + cr + ", " + challengeRatingXP[cr] + " XP)";
        list.appendChild(item);
    }
    result.appendChild(list);
    addButton.hidden = generatedEncounter.length === 0;
}

function addGeneratedEncounterToCombat() {
    if (generatedEncounter.length === 0) return;

    clearCombatLoot();
    for (let creature of generatedEncounter) {
        combatants.push({
            id: "monster-" + Date.now() + "-" + Math.random(),
            libraryId: creature.id,
            name: creature.name,
            type: "monster",
            initiative: null,
            initiativeModifier: creature.initiativeModifier,
            hp: creature.hp,
            maxHP: creature.hp,
            ac: creature.ac,
            challengeRating: creature.challengeRating || "0",
            effects: []
        });
    }

    generatedEncounter = [];
    document.getElementById("generatedEncounter").replaceChildren();
    document.getElementById("addGeneratedEncounterButton").hidden = true;
    displayCombatants();
    showScreen("combat");
}

function saveCreature() {
    let name = document.getElementById("creatureName").value.trim();
    let hpText = document.getElementById("creatureHP").value.trim();
    let acText = document.getElementById("creatureAC").value.trim();
    let initText = document.getElementById("creatureInit").value;
    let challengeRating = document.getElementById("creatureCR").value;
    let hp = Number(hpText);
    let ac = Number(acText);
    let initiative = Number(initText);

    if (name === "" ||
        hpText === "" || !Number.isInteger(hp) || hp <= 0 ||
        acText === "" || !Number.isInteger(ac) || ac <= 0 ||
        initText === "" || !Number.isInteger(initiative) ||
        challengeRatingXP[challengeRating] === undefined) {
            alert("Please enter a name, valid HP, AC, initiative modifier, and challenge rating.");
            return;
        }

    if(editingCreatureId === null) {
        let creature = {
            id: Date.now().toString(),
            name: name,
            hp: hp,
            ac: ac,
            initiativeModifier: initiative,
            challengeRating: challengeRating
        };

        creatureLibrary.push(creature);
    } else {
        let creature = creatureLibrary.find(c => c.id === editingCreatureId);
        if (!creature) return;
        creature.name = name;
        creature.hp = hp;
        creature.ac = ac;
        creature.initiativeModifier = initiative;
        creature.challengeRating = challengeRating;
    }
    editingCreatureId = null;
    document.getElementById("saveCreatureButton").textContent = "Save Creature";
    localStorage.setItem("creatureLibrary", JSON.stringify(creatureLibrary)
    );

    document.getElementById("creatureSearch").value = "";
    displayCreatureLibrary();

    document.getElementById("creatureName").value = "";
    document.getElementById("creatureHP").value = "";
    document.getElementById("creatureAC").value = "";
    document.getElementById("creatureInit").value = "";
    document.getElementById("creatureCR").value = "1/4";
}


function displayCreatureLibrary() {
    let list = document.getElementById("creatureList");
    list.innerHTML = "";
    let query = document.getElementById("creatureSearch").value.trim().toLowerCase();
    let sortOrder = document.getElementById("creatureSort").value;
    let visibleCreatures = creatureLibrary.filter(creature =>
        creature.name.toLowerCase().includes(query)
    );

    visibleCreatures.sort((first, second) => {
        if (sortOrder === "cr-asc" || sortOrder === "cr-desc") {
            let firstXP = challengeRatingXP[first.challengeRating || "0"] || 0;
            let secondXP = challengeRatingXP[second.challengeRating || "0"] || 0;
            return sortOrder === "cr-asc" ? firstXP - secondXP : secondXP - firstXP;
        }
        let nameOrder = first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
        return sortOrder === "name-desc" ? -nameOrder : nameOrder;
    });

    for (let creature of visibleCreatures) {
        let entry = document.createElement("p");

        entry.textContent =
            creature.name +
            " | HP: " + creature.hp +
            " | AC: " + creature.ac +
            " | Initiative: " +
            (creature.initiativeModifier >= 0 ? "+" : "") +
            creature.initiativeModifier +
            " | CR: " + (creature.challengeRating || "0");

        let addButton = document.createElement("button");
        addButton.textContent = "Add to Combat";
        addButton.className = "add-combat-button";
        addButton.onclick = function() {
            addCreatureToCombat(creature.id);
        };
        entry.appendChild(addButton);

        let editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-button";
        editButton.onclick = function() {
            editCreature(creature.id);
        };
        entry.appendChild(editButton);

        let deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";
        deleteButton.onclick = function() {
            deleteCreature(creature.id);
        };

        entry.appendChild(deleteButton);
        list.appendChild(entry);
    }

    if (visibleCreatures.length === 0) {
        list.textContent = query ? "No matching creatures." : "No saved creatures yet.";
    }
}

function savePlayer() {
    let name = document.getElementById("playerName").value.trim();
    let acText = document.getElementById("playerAC").value;
    let initText = document.getElementById("playerInit").value;
    let levelText = document.getElementById("playerLevel").value;

    let ac = Number(acText);
    let initiative = Number(initText);
    let level = Number(levelText);

    if (name === "" ||
        acText === "" || !Number.isInteger(ac) || ac <= 0 ||
        initText === "" || !Number.isInteger(initiative) ||
        !Number.isInteger(level) || level < 1 || level > 20) {
            alert("Enter a name, valid AC, initiative modifier, and level from 1 to 20.");
            return;
        }
        
    if (editingPlayerId === null) {
        playerLibrary.push({
            id: "player-" + Date.now() + "-" + Math.random(),
            name: name,
            ac: ac,
            initiativeModifier: initiative,
            level: level
        });
    } else {
        let player = playerLibrary.find(p => p.id === editingPlayerId);
        if (!player) return;
        player.name = name;
        player.ac = ac;
        player.initiativeModifier = initiative;
        player.level = level;
    }

    editingPlayerId = null;
    document.getElementById("savePlayerButton").textContent = "Save Player";
    localStorage.setItem(
        "playerLibrary",
        JSON.stringify(playerLibrary)
    );

    document.getElementById("playerSearch").value = "";
    displayPlayerLibrary();

    document.getElementById("playerName").value = "";
    document.getElementById("playerAC").value = "";
    document.getElementById("playerInit").value = "";
    document.getElementById("playerLevel").value = "1";
}

function displayPlayerLibrary() {
    let list = document.getElementById("playerList");
    list.innerHTML = "";
    let query = document.getElementById("playerSearch").value.trim().toLowerCase();
    let sortOrder = document.getElementById("playerSort").value;
    let visiblePlayers = playerLibrary.filter(player =>
        player.name.toLowerCase().includes(query)
    );

    visiblePlayers.sort((first, second) => {
        if (sortOrder === "level-asc" || sortOrder === "level-desc") {
            let levelOrder = (first.level || 1) - (second.level || 1);
            return sortOrder === "level-asc" ? levelOrder : -levelOrder;
        }
        let nameOrder = first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
        return sortOrder === "name-desc" ? -nameOrder : nameOrder;
    });

    for (let player of visiblePlayers) {
        let entry = document.createElement("p");

        entry.textContent =
            player.name +
            " | Level " + (player.level || 1) +
            " | AC: " + player.ac +
            " | Initiative: " +
            (player.initiativeModifier >= 0 ? "+":"") +
            player.initiativeModifier;

        let addButton = document.createElement("button");
        addButton.textContent = "Add to Combat";
        addButton.className = "add-combat-button";

        addButton.onclick = function() {
            addPlayerToCombat(player.id);
        };

        entry.appendChild(addButton);

        let editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-button";
        editButton.onclick = function() {
            editPlayer(player.id);
        };

        entry.appendChild(editButton);
        
        let deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";
        deleteButton.onclick = function() {
            deletePlayer(player.id);
        };
        
        entry.appendChild(deleteButton);
        
        list.appendChild(entry);
    }

    if (visiblePlayers.length === 0) {
        list.textContent = query ? "No matching players." : "No saved players yet.";
    }
}

function saveNpc() {
    let name = document.getElementById("npcName").value.trim();
    let hpText = document.getElementById("npcHP").value;
    let acText = document.getElementById("npcAC").value;
    let hp = Number(hpText);
    let ac = Number(acText);

    if (!name || hpText === "" || !Number.isInteger(hp) || hp <= 0 ||
        acText === "" || !Number.isInteger(ac) || ac <= 0) {
        alert("Enter a name, positive hit points, and a positive AC.");
        return;
    }

    if (editingNpcId === null) {
        npcLibrary.push({
            id: "npc-" + Date.now() + "-" + Math.random(),
            name: name,
            hp: hp,
            ac: ac,
            challengeRating: "1/8",
            level: 1
        });
    } else {
        let npc = npcLibrary.find(item => item.id === editingNpcId);
        if (!npc) return;
        npc.name = name;
        npc.hp = hp;
        npc.ac = ac;
    }

    editingNpcId = null;
    document.getElementById("saveNpcButton").textContent = "Save NPC";
    localStorage.setItem("npcLibrary", JSON.stringify(npcLibrary));
    document.getElementById("npcSearch").value = "";
    displayNpcLibrary();
    document.getElementById("npcName").value = "";
    document.getElementById("npcHP").value = "";
    document.getElementById("npcAC").value = "";
}

function saveStoryNpc() {
    let name = document.getElementById("storyNpcName").value.trim();
    let role = document.getElementById("storyNpcRole").value.trim();
    let hpText = document.getElementById("storyNpcHP").value;
    let acText = document.getElementById("storyNpcAC").value;
    let challengeRating = document.getElementById("storyNpcCR").value;
    let notes = document.getElementById("storyNpcNotes").value.trim();
    let hp = Number(hpText);
    let ac = Number(acText);

    if (!name || hpText === "" || !Number.isInteger(hp) || hp <= 0 ||
        acText === "" || !Number.isInteger(ac) || ac <= 0 ||
        challengeRatingXP[challengeRating] === undefined) {
        alert("Enter a name, positive hit points, a positive AC, and a valid challenge rating for the story NPC.");
        return;
    }

    if (editingStoryNpcId === null) {
        storyNpcLibrary.push({
            id: "story-npc-" + Date.now() + "-" + Math.random(),
            name: name,
            role: role,
            hp: hp,
            ac: ac,
            notes: notes,
            challengeRating: challengeRating,
            level: 1,
            isStoryNpc: true
        });
    } else {
        let storyNpc = storyNpcLibrary.find(item => item.id === editingStoryNpcId);
        if (!storyNpc) return;
        storyNpc.name = name;
        storyNpc.role = role;
        storyNpc.hp = hp;
        storyNpc.ac = ac;
        storyNpc.challengeRating = challengeRating;
        storyNpc.notes = notes;
        storyNpc.isStoryNpc = true;
    }

    editingStoryNpcId = null;
    document.getElementById("saveStoryNpcButton").textContent = "Save Story NPC";
    localStorage.setItem("storyNpcLibrary", JSON.stringify(storyNpcLibrary));
    document.getElementById("storyNpcSearch").value = "";
    displayStoryNpcLibrary();
    document.getElementById("storyNpcName").value = "";
    document.getElementById("storyNpcRole").value = "";
    document.getElementById("storyNpcHP").value = "";
    document.getElementById("storyNpcAC").value = "";
    document.getElementById("storyNpcCR").value = "1";
    document.getElementById("storyNpcNotes").value = "";
    alert("Story NPC saved.");
}

function displayNpcLibrary() {
    let list = document.getElementById("npcList");
    list.innerHTML = "";
    let query = document.getElementById("npcSearch").value.trim().toLowerCase();
    let sortOrder = document.getElementById("npcSort").value;
    let visibleNpcs = npcLibrary.filter(npc => npc.name.toLowerCase().includes(query));

    visibleNpcs.sort((first, second) => {
        if (sortOrder === "hp-asc" || sortOrder === "hp-desc") {
            let hpOrder = first.hp - second.hp;
            return sortOrder === "hp-asc" ? hpOrder : -hpOrder;
        }
        let nameOrder = first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
        return sortOrder === "name-desc" ? -nameOrder : nameOrder;
    });

    for (let npc of visibleNpcs) {
        let entry = document.createElement("p");
        entry.textContent = npc.name + " | HP: " + npc.hp + " | AC: " + npc.ac +
            " | CR: 1/8 | Level: 1";

        let addButton = document.createElement("button");
        addButton.textContent = "Add to Combat";
        addButton.className = "add-combat-button";
        addButton.onclick = function() {
            addNpcToCombat(npc.id);
        };
        entry.appendChild(addButton);

        let editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-button";
        editButton.onclick = function() {
            editNpc(npc.id);
        };
        entry.appendChild(editButton);

        let deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";
        deleteButton.onclick = function() {
            deleteNpc(npc.id);
        };
        entry.appendChild(deleteButton);
        list.appendChild(entry);
    }

    if (visibleNpcs.length === 0) {
        list.textContent = query ? "No matching NPCs." : "No saved NPCs yet.";
    }
}

function displayStoryNpcLibrary() {
    let list = document.getElementById("storyNpcList");
    list.innerHTML = "";
    let query = document.getElementById("storyNpcSearch").value.trim().toLowerCase();
    let sortOrder = document.getElementById("storyNpcSort").value;
    let visibleStoryNpcs = storyNpcLibrary.filter(npc =>
        npc.name.toLowerCase().includes(query)
    );

    visibleStoryNpcs.sort((first, second) => {
        if (sortOrder === "hp-asc" || sortOrder === "hp-desc") {
            let hpOrder = first.hp - second.hp;
            return sortOrder === "hp-asc" ? hpOrder : -hpOrder;
        }
        let nameOrder = first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
        return sortOrder === "name-desc" ? -nameOrder : nameOrder;
    });

    for (let npc of visibleStoryNpcs) {
        let entry = document.createElement("p");
        let details = npc.role ? " | Role: " + npc.role : "";
        let cr = npc.challengeRating || "1/8";
        let notes = npc.notes ? " | Notes: " + npc.notes : "";
        entry.textContent = npc.name + " | HP: " + npc.hp + " | AC: " + npc.ac + " | CR: " + cr + details + notes;

        let addButton = document.createElement("button");
        addButton.textContent = "Add to Combat";
        addButton.className = "add-combat-button";
        addButton.onclick = function() {
            addStoryNpcToCombat(npc.id);
        };
        entry.appendChild(addButton);

        let editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-button";
        editButton.onclick = function() {
            editStoryNpc(npc.id);
        };
        entry.appendChild(editButton);

        let deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";
        deleteButton.onclick = function() {
            deleteStoryNpc(npc.id);
        };
        entry.appendChild(deleteButton);
        list.appendChild(entry);
    }

    if (visibleStoryNpcs.length === 0) {
        list.textContent = query ? "No matching story NPCs." : "No saved story NPCs yet.";
    }
}

function saveLoot() {
    let name = document.getElementById("lootName").value.trim();
    let rarity = document.getElementById("lootRarity").value;
    let details = document.getElementById("lootDetails").value.trim();
    let valueText = document.getElementById("lootValueGp").value;
    let valueGp = valueText === "" ? null : Number(valueText);
    if (!name) {
        alert("Enter a name for this loot.");
        return;
    }
    if (valueGp !== null && (!Number.isFinite(valueGp) || valueGp < 0)) {
        alert("Enter a nonnegative value in gold pieces.");
        return;
    }

    if (editingLootId === null) {
        lootLibrary.push({
            id: "loot-" + Date.now() + "-" + Math.random(),
            name: name,
            rarity: rarity,
            details: details,
            valueGp: valueGp
        });
    } else {
        let loot = lootLibrary.find(item => item.id === editingLootId);
        if (!loot) return;
        loot.name = name;
        loot.rarity = rarity;
        loot.details = details;
        loot.valueGp = valueGp;
    }

    editingLootId = null;
    document.getElementById("saveLootButton").textContent = "Save Loot";
    localStorage.setItem("lootLibrary", JSON.stringify(lootLibrary));
    document.getElementById("lootSearch").value = "";
    displayLootLibrary();
    document.getElementById("lootName").value = "";
    document.getElementById("lootRarity").value = "Common";
    document.getElementById("lootDetails").value = "";
    document.getElementById("lootValueGp").value = "";
}

function displayLootLibrary() {
    let list = document.getElementById("lootList");
    list.innerHTML = "";
    let query = document.getElementById("lootSearch").value.trim().toLowerCase();
    let sortOrder = document.getElementById("lootSort").value;
    let visibleLoot = lootLibrary.filter(item => item.name.toLowerCase().includes(query));

    visibleLoot.sort((first, second) => {
        if (sortOrder === "rarity-asc" || sortOrder === "rarity-desc") {
            let rarityOrder = lootRarities.indexOf(first.rarity) - lootRarities.indexOf(second.rarity);
            return sortOrder === "rarity-asc" ? rarityOrder : -rarityOrder;
        }
        let nameOrder = first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
        return sortOrder === "name-desc" ? -nameOrder : nameOrder;
    });

    for (let loot of visibleLoot) {
        let entry = document.createElement("p");
        entry.textContent = loot.name + " | " + loot.rarity +
            (loot.details ? " | " + loot.details : "") +
            (Number.isFinite(loot.valueGp) ? " | Value: " + loot.valueGp + " gp" : "");

        let editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-button";
        editButton.onclick = function() {
            editLoot(loot.id);
        };
        entry.appendChild(editButton);

        let deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";
        deleteButton.onclick = function() {
            deleteLoot(loot.id);
        };
        entry.appendChild(deleteButton);
        list.appendChild(entry);
    }

    if (visibleLoot.length === 0) {
        list.textContent = query ? "No matching loot." : "No saved loot yet.";
    }
}

function editLoot(id) {
    let loot = lootLibrary.find(item => item.id === id);
    if (!loot) return;
    editingLootId = id;
    document.getElementById("lootName").value = loot.name;
    document.getElementById("lootRarity").value = loot.rarity;
    document.getElementById("lootDetails").value = loot.details || "";
    document.getElementById("lootValueGp").value = Number.isFinite(loot.valueGp) ? loot.valueGp : "";
    document.getElementById("saveLootButton").textContent = "Update Loot";
}

function deleteLoot(id) {
    let loot = lootLibrary.find(item => item.id === id);
    if (!loot || !confirm("Permanently delete " + loot.name + " from your loot library?")) {
        return;
    }
    lootLibrary = lootLibrary.filter(item => item.id !== id);
    if (editingLootId === id) {
        editingLootId = null;
        document.getElementById("saveLootButton").textContent = "Save Loot";
        document.getElementById("lootName").value = "";
        document.getElementById("lootDetails").value = "";
    }
    localStorage.setItem("lootLibrary", JSON.stringify(lootLibrary));
    displayLootLibrary();
}

function addPlayerToCombat(playerId) {
    let player = playerLibrary.find(p => p.id === playerId);

    if (!player) return;

    if (combatants.some(c => c.libraryId === playerId)) {
        alert ("This player is already in combat.");
        return;
    }

    let combatant = {
        id: "combat-" + Date.now() + "-" + Math.random(),
        libraryId: player.id,
        name: player.name,
        type: "player",
        initiative: null,
        initiativeModifier: player.initiativeModifier,
        ac: player.ac,
        level: player.level || 1,
        down: false,
        deathSuccesses: 0,
        deathFailures: 0
    };

    combatants.push(combatant);

    displayCombatants();
}

function addNpcToCombat(npcId) {
    let npc = npcLibrary.find(item => item.id === npcId);
    if (!npc) return;

    combatants.push({
        id: "combat-npc-" + Date.now() + "-" + Math.random(),
        libraryId: npc.id,
        name: npc.name,
        type: "npc",
        initiative: null,
        initiativeModifier: 0,
        hp: npc.hp,
        maxHP: npc.hp,
        ac: npc.ac,
        challengeRating: "1/8",
        level: 1,
        effects: []
    });
    clearCombatLoot();
    displayCombatants();
    checkCombatFinished();
}

function addStoryNpcToCombat(storyNpcId) {
    let storyNpc = storyNpcLibrary.find(item => item.id === storyNpcId);
    if (!storyNpc) return;

    combatants.push({
        id: "combat-story-npc-" + Date.now() + "-" + Math.random(),
        libraryId: storyNpc.id,
        name: storyNpc.name,
        type: "storyNpc",
        initiative: null,
        initiativeModifier: 0,
        hp: storyNpc.hp,
        maxHP: storyNpc.hp,
        ac: storyNpc.ac,
        challengeRating: storyNpc.challengeRating || "1/8",
        level: 1,
        effects: [],
        storyRole: storyNpc.role,
        storyNotes: storyNpc.notes
    });
    clearCombatLoot();
    displayCombatants();
    checkCombatFinished();
}

function deletePlayer(id) {
    let player = playerLibrary.find(p => p.id===id);
    if(!player) return;
    let confirmed = confirm(
        "Permanently delete " + player.name + " from your library?"
    );

    if(!confirmed) return;
    playerLibrary = playerLibrary.filter(p => p.id !== id);
    localStorage.setItem(
        "playerLibrary",
        JSON.stringify(playerLibrary)
    );

    displayPlayerLibrary();
}

function editNpc(id) {
    let npc = npcLibrary.find(item => item.id === id);
    if (!npc) return;
    editingNpcId = id;
    document.getElementById("npcName").value = npc.name;
    document.getElementById("npcHP").value = npc.hp;
    document.getElementById("npcAC").value = npc.ac;
    document.getElementById("saveNpcButton").textContent = "Update NPC";
}

function editStoryNpc(id) {
    let storyNpc = storyNpcLibrary.find(item => item.id === id);
    if (!storyNpc) return;
    editingStoryNpcId = id;
    document.getElementById("storyNpcName").value = storyNpc.name;
    document.getElementById("storyNpcRole").value = storyNpc.role || "";
    document.getElementById("storyNpcHP").value = storyNpc.hp;
    document.getElementById("storyNpcAC").value = storyNpc.ac;
    document.getElementById("storyNpcCR").value = storyNpc.challengeRating || "1";
    document.getElementById("storyNpcNotes").value = storyNpc.notes || "";
    document.getElementById("saveStoryNpcButton").textContent = "Update Story NPC";
}

function deleteNpc(id) {
    let npc = npcLibrary.find(item => item.id === id);
    if (!npc || !confirm("Permanently delete " + npc.name + " from your NPC library?")) {
        return;
    }
    npcLibrary = npcLibrary.filter(item => item.id !== id);
    if (editingNpcId === id) {
        editingNpcId = null;
        document.getElementById("saveNpcButton").textContent = "Save NPC";
        document.getElementById("npcName").value = "";
        document.getElementById("npcHP").value = "";
        document.getElementById("npcAC").value = "";
    }
    localStorage.setItem("npcLibrary", JSON.stringify(npcLibrary));
    displayNpcLibrary();
}

function deleteStoryNpc(id) {
    let storyNpc = storyNpcLibrary.find(item => item.id === id);
    if (!storyNpc || !confirm("Permanently delete " + storyNpc.name + " from your story NPC library?")) {
        return;
    }
    storyNpcLibrary = storyNpcLibrary.filter(item => item.id !== id);
    if (editingStoryNpcId === id) {
        editingStoryNpcId = null;
        document.getElementById("saveStoryNpcButton").textContent = "Save Story NPC";
        document.getElementById("storyNpcName").value = "";
        document.getElementById("storyNpcRole").value = "";
        document.getElementById("storyNpcHP").value = "";
        document.getElementById("storyNpcAC").value = "";
        document.getElementById("storyNpcCR").value = "1";
        document.getElementById("storyNpcNotes").value = "";
    }
    localStorage.setItem("storyNpcLibrary", JSON.stringify(storyNpcLibrary));
    displayStoryNpcLibrary();
}

function addCreatureToCombat(creatureId) {
    let creature = creatureLibrary.find(c => c.id === creatureId);

    if (!creature) return;

    let combatant = {
        id: "monster-" + Date.now() + "-" + Math.random(),
        name: creature.name,
        type: "monster",
        initiative: null,
        initiativeModifier: creature.initiativeModifier,
        hp: creature.hp,
        maxHP: creature.hp,
        ac: creature.ac,
        challengeRating: creature.challengeRating || "0"
    };
    
    clearCombatLoot();
    combatants.push(combatant);

    displayCombatants();
}

function deleteCreature(id) {
    let creature = creatureLibrary.find(c => c.id === id);
    if (!creature) return;
    let confirmed = confirm(
        "Permanently delete " + creature.name + " from your library?"
    );
    if (!confirmed) return;
    creatureLibrary = creatureLibrary.filter(c => c.id !== id);
    localStorage.setItem(
        "creatureLibrary",
        JSON.stringify(creatureLibrary)
    );

    displayCreatureLibrary();
}

function resetCombat() {
    let confirmed = confirm("Clear all combatants and start a new encounter?");

    if (!confirmed) return;

    combatants = [];
    currentTurn = -1;
    round = 1;
    clearCombatLoot();
    lootedMonsterIds.clear();

    document.getElementById("round").textContent = round;

    displayCombatants();
}

function editCreature(id) {
    let creature = creatureLibrary.find(c => c.id === id);
    if (!creature) return;
    editingCreatureId = id;
    document.getElementById("creatureName").value = creature.name;
    document.getElementById("creatureHP").value = creature.hp;
    document.getElementById("creatureAC").value = creature.ac;
    document.getElementById("creatureInit").value = creature.initiativeModifier;
    document.getElementById("creatureCR").value = creature.challengeRating || "0";
    document.getElementById("saveCreatureButton").textContent = "Update Creature";
}

function editPlayer(id) {
    let player = playerLibrary.find(p => p.id === id);
    if (!player) return;
    editingPlayerId = id;
    document.getElementById("playerName").value = player.name;
    document.getElementById("playerAC").value = player.ac;
    document.getElementById("playerInit").value = player.initiativeModifier;
    document.getElementById("playerLevel").value = player.level || 1;
    document.getElementById("savePlayerButton").textContent = "Update Player";
}

function exportSavedData() {
    let backup = {
        format: "dms-grimoire-backup",
        version: 1,
        creatureLibrary: creatureLibrary,
        playerLibrary: playerLibrary,
        npcLibrary: npcLibrary,
        storyNpcLibrary: storyNpcLibrary,
        lootLibrary: lootLibrary
    };
    let file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
    });
    let url = URL.createObjectURL(file);
    let link = document.createElement("a");
    link.href = url;
    link.download = "dms-grimoire-backup-" +
        new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importSavedData(event) {
    let file = event.target.files[0];
    if (!file) return;

    let reader = new FileReader();
    reader.onload = function() {
        try {
            let backup = JSON.parse(reader.result);
            let validCreatures = backup &&
                backup.format === "dms-grimoire-backup" &&
                backup.version === 1 &&
                Array.isArray(backup.creatureLibrary) &&
                backup.creatureLibrary.every(creature =>
                    creature && typeof creature.id === "string" &&
                    typeof creature.name === "string" &&
                    Number.isFinite(creature.hp) &&
                    Number.isFinite(creature.ac) &&
                    Number.isFinite(creature.initiativeModifier) &&
                    (creature.challengeRating === undefined ||
                        Object.prototype.hasOwnProperty.call(challengeRatingXP, creature.challengeRating))
                );
            let validPlayers = backup &&
                Array.isArray(backup.playerLibrary) &&
                backup.playerLibrary.every(player =>
                    player && typeof player.id === "string" &&
                    typeof player.name === "string" &&
                    Number.isFinite(player.ac) &&
                    Number.isFinite(player.initiativeModifier) &&
                    (player.level === undefined ||
                        (Number.isInteger(player.level) && player.level >= 1 && player.level <= 20))
                );
            let validNpcs = backup &&
                (backup.npcLibrary === undefined ||
                    (Array.isArray(backup.npcLibrary) &&
                        backup.npcLibrary.every(npc =>
                            npc && typeof npc.id === "string" &&
                            typeof npc.name === "string" &&
                            Number.isFinite(npc.hp) && npc.hp > 0 &&
                            Number.isFinite(npc.ac) && npc.ac > 0 &&
                            (npc.challengeRating === undefined || npc.challengeRating === "1/8") &&
                            (npc.level === undefined || npc.level === 1)
                        )));
            let validStoryNpcs = backup &&
                (backup.storyNpcLibrary === undefined ||
                    (Array.isArray(backup.storyNpcLibrary) &&
                        backup.storyNpcLibrary.every(npc =>
                            npc && typeof npc.id === "string" &&
                            typeof npc.name === "string" &&
                            (npc.role === undefined || typeof npc.role === "string") &&
                            Number.isFinite(npc.hp) && npc.hp > 0 &&
                            Number.isFinite(npc.ac) && npc.ac > 0 &&
                            (npc.challengeRating === undefined ||
                                Object.prototype.hasOwnProperty.call(challengeRatingXP, npc.challengeRating)) &&
                            (npc.notes === undefined || typeof npc.notes === "string")
                        )));
            let validLoot = backup &&
                (backup.lootLibrary === undefined ||
                    (Array.isArray(backup.lootLibrary) &&
                        backup.lootLibrary.every(item =>
                            item && typeof item.id === "string" &&
                            typeof item.name === "string" &&
                            lootRarities.includes(item.rarity) &&
                            (item.details === undefined || typeof item.details === "string") &&
                            (item.valueGp === undefined ||
                                (Number.isFinite(item.valueGp) && item.valueGp >= 0))
                        )));

            if (!validCreatures || !validPlayers || !validNpcs || !validStoryNpcs || !validLoot) {
                alert("That file is not a valid DM's Grimoire backup.");
                return;
            }

            if (!confirm("Replace the saved creatures, players, NPCs, story NPCs, and loot on this computer with this backup? Older backups without story NPCs or loot will keep the current libraries.")) {
                return;
            }

            localStorage.setItem("creatureLibrary", JSON.stringify(backup.creatureLibrary));
            localStorage.setItem("playerLibrary", JSON.stringify(backup.playerLibrary));
            let importedNpcs = backup.npcLibrary === undefined ? npcLibrary : backup.npcLibrary;
            localStorage.setItem("npcLibrary", JSON.stringify(importedNpcs));
            let importedStoryNpcs = backup.storyNpcLibrary === undefined ? storyNpcLibrary : backup.storyNpcLibrary;
            localStorage.setItem("storyNpcLibrary", JSON.stringify(importedStoryNpcs));
            let importedLoot = backup.lootLibrary === undefined ? lootLibrary : backup.lootLibrary;
            localStorage.setItem("lootLibrary", JSON.stringify(importedLoot));
            creatureLibrary = backup.creatureLibrary;
            playerLibrary = backup.playerLibrary;
            npcLibrary = importedNpcs;
            storyNpcLibrary = importedStoryNpcs;
            lootLibrary = importedLoot;
            displayCreatureLibrary();
            displayPlayerLibrary();
            displayNpcLibrary();
            displayStoryNpcLibrary();
            displayLootLibrary();
            alert("Backup imported.");
        } catch (error) {
            alert("Could not read that backup file.");
        } finally {
            event.target.value = "";
        }
    };
    reader.onerror = function() {
        alert("Could not read that backup file.");
        event.target.value = "";
    };
    reader.readAsText(file);
}

showScreen("combat");
try {
    document.getElementById("resumeEncounterButton").disabled =
        !localStorage.getItem("savedEncounter");
} catch (error) {
    document.getElementById("resumeEncounterButton").disabled = true;
}
if (!restoreCurrentEncounter()) {
    displayCombatants();
}
displayCreatureLibrary();
displayPlayerLibrary();
displayNpcLibrary();
displayStoryNpcLibrary();
displayLootLibrary();

