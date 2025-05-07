/*
 * Rival Mod - Cooldown System
 *
 * cooldown.js serves as a skill cooldown management system.
 * It handles cooldown adjustments, ping compensation, and cooldown application
 * for skills to improve gameplay responsiveness and accuracy.
 */
const hooks = require("../enums/hooks");
const classes = require("../enums/classes");
/*
 * Cooldown module
 *
 * Manages skill cooldowns with ping compensation and related functionality.
 * Provides automatic cooldown application, adjustment based on network latency,
 * and handles special cases for different classes and skill types.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Cooldown(mod, mods) {
    // State tracking
    let cooldownTimeoutId = null;    // Tracks the timeout for applying cooldowns

    // Cooldown adjustment functions
    
    /*
     * Adjusts cooldown times based on ping to compensate for network latency
     * @param {Object} event - The cooldown event data
     * @returns {boolean} True if adjustment was applied, undefined otherwise
     */
    const adjustCooldown = event => {
        if (!mods.utils.isEnabled(event.skill.id)) return;

        // Calculate ping compensation value (with buffer)
        const pingCompensation = Math.max(0, mods.ping.ping - mods.ping.jitter - 5);
        
        // Apply ping compensation to cooldowns
        event.cooldown -= pingCompensation;
        event.nextStackCooldown -= pingCompensation;
        
        // Ensure cooldowns don't go below zero
        if (event.cooldown < 0) event.cooldown = 0;
        if (event.nextStackCooldown < 0) event.nextStackCooldown = 0;
        
        return true;
    };

    // Register cooldown packet hooks
    mod.hook(...mods.packet.get_all("S_DECREASE_COOLTIME_SKILL"), hooks.MODIFY_REAL, adjustCooldown);
    mod.hook(...mods.packet.get_all("S_START_COOLTIME_SKILL"), hooks.MODIFY_REAL, adjustCooldown);
    
    /*
     * Handles crest messages that affect cooldowns
     * @param {Object} message - The crest message data
     */
    mod.hook(...mods.packet.get_all("S_CREST_MESSAGE"), hooks.READ_ALL, message => {
        if (message.type !== 6) return;
        if (!mods.utils.isEnabled()) return;
        
        // Reset cooldown if skill is currently on cooldown
        if (mods.cooldown.isOnCooldown(message.skill)) {
            mod.send(...mods.packet.get_all("S_DECREASE_COOLTIME_SKILL"), {
                skill: message.skill,
                cooldown: 0
            });
        }
    });

    // Utility functions for cooldown management
    
    /*
     * Gets all skills that should have cooldown applied based on the source skill
     * @param {number} skillId - The source skill ID
     * @returns {Array} Array of skill IDs to apply cooldown to
     */
    const getSkillsToApplyCooldown = skillId => {
        const skillsToApplyCooldownTo = mods.skills.getSkillsToApplyCooldownToFrom(skillId);
        if (!skillsToApplyCooldownTo) return [skillId];

        const resultSkillIds = [];    // Will hold all skill IDs that need cooldown applied
        
        for (const skillKey of skillsToApplyCooldownTo) {
            const [group, subGroup] = skillKey.split('-');
            
            for (const skill of mods.last.skillList.skills[skillKey] || []) {
                const skillInfo = mods.utils.getSkillInfo(0);
                resultSkillIds.push(skillInfo.calculateNewId(+group, skill, +subGroup));
            }
        }
        
        // Add original skill if not already included
        if (!resultSkillIds.includes(skillId)) {
            resultSkillIds.push(skillId);
        }
        
        return resultSkillIds;
    };

    /*
     * Checks if the player is a Slayer with specific abnormality condition
     * @param {number} skillId - The skill ID to check
     * @returns {boolean} True if conditions are met
     */
    const isSlayerWithAbnormality = skillId => {
        if (mods.player.job !== classes.SLAYER) return false;
        
        const skillInfo = mods.utils.getSkillInfo(skillId);
        if (skillInfo.skill !== 8) return false;
        
        if (!mods.effects.getAbnormality(0x49705)) return false;
        
        return true;
    };

    // Main cooldown application logic
    
    /*
     * Handles skill actions to apply appropriate cooldowns
     * @param {Object} event - The action stage event
     */
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_DESTINATION_FAKE, event => {
        // Only process events for the player
        if (!mods.player.isMe(event.gameId)) return;
        
        // Only process initial stage
        if (event.stage) return;
        
        // Check if cooldown management is enabled
        if (!mods.utils.isEnabled()) return;
        
        // Clear any existing timeout
        mod.clearTimeout(cooldownTimeoutId);
        
        // Skip if skill is not enabled for cooldown management
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        // Skip for Slayer with specific condition
        if (isSlayerWithAbnormality(event.skill.id)) return;
        
        // Get cooldown data for the skill
        const cooldownData = mods.skills.getCooldownData(event.skill.id);
        if (!cooldownData?.cooltime) return;
        
        // Calculate timing information
        const actionTime = Date.now() - mods.ping.ping - mods.skills.getActionStageDelay(event.skill.id);
        const actionDelay = cooldownData.delay / mods.action.speed.real;
        const skillInfo = mods.utils.getSkillInfo(event.skill.id);
        
        // Set timeout to apply cooldown after skill animation
        cooldownTimeoutId = mod.setTimeout(() => {
            // Skip if cooldown was already applied
            if (mods.cooldown.getData(skillInfo.skill, true)?.time > actionTime) return;
            
            // Skip if no longer in action
            if (!mods.action.inAction) return;
            
            // Skip if action changed
            if (mods.action.stage.id !== event.id) return;
            
            // Skip for moving defense skills
            if (mods.skills.getType(skillInfo.id) === "movingDefence") return;
            
            // Get all skills to apply cooldown to
            const skillsToApplyCooldownTo = getSkillsToApplyCooldown(skillInfo.id);
            
            // Apply cooldown to all related skills
            for (const skillId of skillsToApplyCooldownTo) {
                mod.send(...mods.packet.get_all("S_START_COOLTIME_SKILL"), {
                    skill: skillId,
                    cooldown: cooldownData.cooltime
                });
            }
            
            /*
             * Handles cooldown reset events
             * @param {number} resetSkillId - The skill ID being reset
             */
            const resetHandler = resetSkillId => {
                let isTargetSkill = false;
                
                // Check if the reset skill is one we're tracking
                for (const skillId of skillsToApplyCooldownTo) {
                    if (skillId === resetSkillId) {
                        isTargetSkill = true;
                    }
                }
                
                if (!isTargetSkill) return;
                
                // Clear timeout and execute immediately
                resetTimeoutId._onTimeout();
                mod.clearTimeout(resetTimeoutId);
            };
            
            // Register reset event handler
            mods.cooldown.on("reset", resetHandler);
            
            // Set timeout to check and potentially reset cooldowns
            const resetTimeoutId = mod.setTimeout(() => {
                // Remove reset event handler
                mods.cooldown.off("reset", resetHandler);
                
                // Get current cooldown data
                const currentCooldownData = mods.cooldown.getData(skillInfo.skill, true);
                
                // Skip if cooldown is active and was applied after our action
                if (currentCooldownData?.cooldown !== 0 && currentCooldownData?.time > actionTime) return;
                
                // Reset cooldown for all related skills
                for (const skillId of skillsToApplyCooldownTo) {
                    mod.send(...mods.packet.get_all("S_DECREASE_COOLTIME_SKILL"), {
                        skill: skillId,
                        cooldown: 0
                    });
                }
            }, mods.utils.getPacketBuffer());
        }, actionDelay);
    });
};