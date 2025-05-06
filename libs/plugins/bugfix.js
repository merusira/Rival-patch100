/*
 * Rival Mod - Bugfix System
 *
 * bugfix.js serves as a correction system for various game mechanics issues.
 * It prevents skill failures during teleport skills, manages system messages,
 * and provides class-specific resource messages for better gameplay experience.
 */
const hooks = require('../enums/hooks');
/*
 * Bugfix module
 *
 * Handles various game mechanics issues by intercepting and modifying packets.
 * Focuses on three main areas: teleport skill failures, system message management,
 * and class-specific resource messages to improve gameplay experience.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Bugfix(mod, mods) {
    // Configuration
    let teleportBufferEndTime = 0;    // Timestamp to track teleport skill buffer period

    // Teleport skill handling
    
    /*
     * Detects teleport skills and sets a buffer period to prevent skill failures
     * @param {Object} event - The action stage event
     */
    mod.hook(
        ...mods.packet.get_all("S_ACTION_STAGE"),
        hooks.READ_DESTINATION_ALL,
        event => {
            // Only process packets for the player's character
            if (!mods.player.isMe(event.gameId)) return;
            
            // Only process enabled skills
            if (!mods.utils.isEnabled(event.skill.id)) return;
            
            // Only process teleport-type skills
            if (!["catchBack", "shortTel"].includes(mods.skills.getType(event.skill.id))) return;
            
            // Set buffer time after teleport skill use
            teleportBufferEndTime = Date.now() + mods.utils.getPacketBuffer(100);
        }
    );

    // Skill failure prevention
    
    /*
     * Prevents skill failures during teleport buffer period
     * @param {Object} event - The skill failure event
     * @param {boolean} retry - Whether this is a retry attempt
     * @returns {boolean} False to block the packet if during buffer period
     */
    mod.hook(
        ...mods.packet.get_all("S_CANNOT_START_SKILL"),
        hooks.MODIFY_ALL,
        (event, retry) => {
            // Only process enabled skills
            if (!mods.utils.isEnabled(event.skill.id)) return;
            
            // Prevent skill failure during teleport buffer period
            if (teleportBufferEndTime > Date.now()) return false;
            
            // Update buffer time on retry
            if (retry) teleportBufferEndTime = Date.now() + mods.utils.getPacketBuffer();
        }
    );

    // System message management
    
    /*
     * Manages system messages for skill failures and class-specific resources
     * @param {Object} event - The system message event
     * @returns {boolean} False to block the message when appropriate
     */
    mod.hook(
        ...mods.packet.get_all("S_SYSTEM_MESSAGE"),
        hooks.MODIFY_ALL,
        event => {
            // Only process if feature is enabled
            if (!mods.utils.isEnabled()) return;
            
            const systemMessage = mod.parseSystemMessage(event.message);
            
            switch (systemMessage.id) {
                case "SMT_SKILL_FAIL_CATEGORY": {
                    mods.log.debug("S_SYSTEM_MESSAGE", "failed to start skill");
                    
                    // Prevent duplicate failure messages during actions
                    if (mods.action.inAction) return false;
                    
                    // Prevent failure messages during skill buffer period
                    const actionEndTime = mods.action?.end?._time || 0;
                    if (Date.now() - actionEndTime <= mods.utils.getPacketBuffer()) return false;
                    break;
                }
                
                case "SMT_BATTLE_SKILL_FAIL_LOW_STAMINA": {
                    // Map of class-specific resource messages
                    const classResourceMessages = {
                        9: "SMT_BATTLE_SKILL_FAIL_LOW_ARCANE",      // Gunner
                        10: "SMT_BATTLE_SKILL_FAIL_LOW_FURY",       // Brawler
                        11: "SMT_BATTLE_SKILL_FAIL_LOW_CHAKRA",     // Ninja
                        12: "SMT_BATTLE_SKILL_FAIL_LOW_MOON_LIGHT"  // Valkyrie
                    };
                    
                    const resourceMessage = classResourceMessages[mods.player.job];
                    if (!resourceMessage) break;
                    
                    // Send class-specific resource message instead of generic stamina message
                    mods.utils.sendSystemMessage(resourceMessage);
                    return false;
                }
            }
        }
    );
};