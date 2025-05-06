/*
 * Rival Mod - Cooldown Management
 *
 * items.js handles out-of-combat cooldown reduction for player skills.
 * It accelerates skill cooldowns when the player and party members are not engaged in combat,
 * allowing for faster skill availability during downtime.
 */
const hooks = require('../enums/hooks');
/*
 * ItemsCooldownManager module
 *
 * Manages cooldown reduction for skills when players are not in combat.
 * Monitors player combat status and reduces cooldowns at regular intervals
 * when the player and all party members are out of combat.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, cooldown, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function ItemsCooldownManager(mod, mods) {
    // Configuration constants
    const COOLDOWN_INTERVAL = 300;    // Cooldown reduction interval in milliseconds
    
    // Module state
    let cooldownTimer = null;         // Reference to the interval timer for cleanup
    
    // Event handlers
    
    /*
     * Handles player status updates to manage cooldown reduction
     * Starts or stops the cooldown reduction timer based on combat status
     * @param {Object} event - The player status event data
     */
    mod.hook(...mods.packet.get_all("S_USER_STATUS"), hooks.READ_DESTINATION_REAL, event => {
        // Clear any existing timer to prevent multiple timers
        mod.clearInterval(cooldownTimer);
        
        // Status 2 indicates the player is out of combat
        if (event.status === 2) {
            cooldownTimer = mod.setInterval(() => {
                // Check if any party member is in combat (status 1)
                for (const partyMember of mods.player.playersInParty.values()) {
                    if (partyMember.status === 1) return;
                }
                
                // Reduce cooldowns for both skills and server categories
                for (const category of ["skills", "server"]) {
                    for (const skillId in mods.cooldown.info[category]) {
                        mods.cooldown.info[category][skillId].cooldown -= COOLDOWN_INTERVAL;
                    }
                }
            }, COOLDOWN_INTERVAL);
        }
    });
    
    // Cleanup function
    
    /*
     * Cleans up resources when the module is unloaded
     * Ensures the cooldown timer is properly cleared to prevent memory leaks
     */
    mod.destructor = () => {
        if (cooldownTimer) {
            mod.clearInterval(cooldownTimer);
            cooldownTimer = null;
        }
    };
};