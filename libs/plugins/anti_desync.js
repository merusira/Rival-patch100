/*
 * Rival Mod - Anti-Desync System
 *
 * anti_desync.js serves as a position correction system to prevent desynchronization issues.
 * It monitors and corrects position discrepancies between client and server to prevent
 * rubber-banding/ghosting and movement issues during skill usage.
 */
const hooks = require("../enums/hooks");
const classes = require("../enums/classes");
/*
 * AntiDesync module
 *
 * Detects and corrects position desynchronization between client and server.
 * Provides location correction for skills and movement to ensure smooth gameplay
 * by preventing rubber-banding and other movement-related issues.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function AntiDesync(mod, mods) {
    // Configuration
    let correctionDistance = -1.5;    // Default correction distance (negative to move backward)
    
    // Constants
    const defenseSkillTypes = ['defence', "movingDefence", "pressHit"];    // Skill types that use defense mechanics
    
    // Register command to adjust correction distance
    mods.command.add("desync", value => {
        value = +value;    // Convert to number
        if (isNaN(value)) {
            return mods.command.message("Need to provide a valid value.");
        }
        mods.command.message("Value set to " + value);
        correctionDistance = value * -1;
    });

    // Utility methods for desync detection and correction

    /*
     * Checks if the provided location is desynchronized from the server's expected position
     * @param {Object} location - The location to check
     * @returns {boolean} True if the location is desynchronized, undefined otherwise
     */
    const isLocationDesynchronized = location => {
        // Skip if skill is disabled
        if (!mods.utils.isEnabled(mods?.action?.serverStage?.skill?.id)) return;
        
        // Skip for certain skill types (0x2a = 42 = special type)
        if (mods.skills.getTypeId(mods?.action?.serverStage?.skill?.id) === 42) return;
        
        // Skip if not in action
        if (!mods.action.serverInAction) return false;
        
        // Skip if too much time has passed since last server action
        if (Date.now() - mods.action.serverStage._time > 2500) return false;
        
        // Skip if no animation sequence
        if (!mods.action.serverStage.animSeq.length) return false;
        
        // Calculate distances
        const clientDistance = mods.action.stage.loc.dist2D(location);
        const serverExpectedLocation = calculateServerLocation();
        const serverDistance = mods.action.serverStage.loc.dist2D(serverExpectedLocation);
        
        // If client distance is greater than server distance, location is desynchronized
        if (clientDistance > serverDistance) return true;
    };

    /*
     * Calculates the expected server location based on animation sequence
     * @returns {Object} The calculated server location
     */
    const calculateServerLocation = () => {
        const serverStage = mods.action.serverStage;
        let location = serverStage.loc;
        
        if (!serverStage.animSeq.length) return location.clone();
        
        // Calculate direction with skill modifiers
        const direction = serverStage.w + mods.skills.getDirectionModifier(
            serverStage.skill.id,
            serverStage.stage
        );
        
        // Apply all animation sequence movements
        for (const anim of serverStage.animSeq) {
            location = mods.utils.applyDistance(location, direction, anim.distance);
        }
        
        return location;
    };

    /*
     * Corrects skill location if desynchronized
     * @param {Object} event - The skill event
     * @returns {boolean} True if location was corrected, undefined otherwise
     */
    const correctSkillLocation = event => {
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        if (!isLocationDesynchronized(event.loc)) return;
        
        // Correct the location
        event.loc = calculateServerLocation();
        return true;
    };

    // Packet hooks for position correction

    // Register skill-related packet hooks to correct locations
    mod.hook(...mods.packet.get_all("C_START_SKILL"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    mod.hook(...mods.packet.get_all("C_START_TARGETED_SKILL"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    mod.hook(...mods.packet.get_all("C_START_COMBO_INSTANT_SKILL"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    mod.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    mod.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL_EX"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    mod.hook(...mods.packet.get_all("C_PRESS_SKILL"), hooks.MODIFY_INTERNAL_REAL, correctSkillLocation);
    
    /*
     * Blocks player location updates if desynchronized
     * @param {Object} event - The player location event
     * @returns {boolean} False if location is desynchronized to block the packet
     */
    mod.hook(...mods.packet.get_all("C_PLAYER_LOCATION"), hooks.MODIFY_REAL, event => {
        if (!mods.utils.isEnabled()) return;
        
        if (isLocationDesynchronized(event.loc)) return false;
    });
    
    /*
     * Handles action end and corrects position with instant move if needed
     * @param {Object} event - The action end event
     * @returns {boolean} True if location was corrected
     */
    mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.MODIFY_INTERNAL_FAKE, event => {
        if (!mods.utils.isEnabled(event.skill.id) || !mods.player.isMe(event.gameId)) return;
        
        if (!isLocationDesynchronized(event.loc)) return;
        
        // Skip for certain skill types (21 and 22)
        if ([21, 22].includes(mods.skills.getTypeId(event.skill.id))) return;
        
        mods.log.debug("AD", "sending S_INSTANT_MOVE");
        event.loc = calculateServerLocation();
        mod.send(...mods.packet.get_all("S_INSTANT_MOVE"), event);
        return true;
    });
    
    /*
     * Handles location notifications during actions
     * @param {Object} event - The location notification event
     * @returns {boolean} True if location was corrected, false to block the packet
     */
    mod.hook(...mods.packet.get_all("C_NOTIFY_LOCATION_IN_ACTION"), hooks.MODIFY_REAL, event => {
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        if (isLocationDesynchronized(event.loc)) return false;
        
        // Special case for Slayer's skill 17
        if (mods.player.job === classes.SLAYER &&
            mods.utils.getSkillInfo(event.skill.id).skill === 17) return;
        
        // Skip for skill type 22
        if (mods.skills.getTypeId(event.skill.id) === 22) return false;
        
        // Apply correction distance
        event.loc = mods.utils.applyDistance(event.loc, event.w, correctionDistance);
        return true;
    });
};