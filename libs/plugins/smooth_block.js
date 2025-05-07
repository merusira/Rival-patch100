/*
 * Rival Mod - Smooth Block System
 *
 * smooth_block.js improves the blocking experience by disabling super armor effects.
 * When enabled, this plugin intercepts skill result packets and removes super armor
 * effects that would otherwise prevent the player from properly blocking attacks.
 */
const hooks = require("../enums/hooks");
/*
 * SmoothBlockManager module
 *
 * Enhances the blocking experience by disabling super armor effects on incoming attacks.
 * Super armor typically prevents players from being knocked down or interrupted,
 * but can interfere with proper blocking mechanics. This module removes those effects
 * when the smoothBlock setting is enabled.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, settings, and utility modules
 */
module.exports = function SmoothBlockManager(mod, mods) {
    /*
     * Intercepts skill result packets to disable super armor effects
     *
     * This hook processes all incoming skill result packets and removes
     * super armor effects when the smooth block feature is enabled.
     */
    mod.hook(
        ...mods.packet.get_all("S_EACH_SKILL_RESULT"),
        hooks.MODIFY_ALL,
        skillEvent => {
            // Skip processing if any of these conditions are met:
            
            // 1. Feature is disabled in settings
            if (!mods.settings.smoothBlock) return;
            
            // 2. Event is not targeting the player
            if (!mods.player.isMe(skillEvent.target)) return;
            
            // 3. No super armor effect is present
            if (!skillEvent.superArmorId) return;
            
            // 4. Module is globally disabled
            if (!mods.utils.isEnabled()) return;
            
            // Disable the super armor effect by setting its ID to 0
            // This allows the player to properly block the attack
            skillEvent.superArmorId = 0;
            
            // Return true to allow the modified packet to be processed
            return true;
        }
    );
};