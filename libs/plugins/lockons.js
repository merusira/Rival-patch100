/*
 * Rival Mod - Lock-on Targeting System
 * 
 * lockons.js handles validation and management of skill lock-on targets.
 * It processes player lock-on requests, validates targets against skill data,
 * and manages the list of active lock-on targets for multi-target skills.
 */
const hooks = require("../enums/hooks");
/*
 * Lockons module
 *
 * Manages the lock-on targeting system for skills that require target selection.
 * Validates targets against skill data rules and maintains the list of currently
 * locked-on targets for multi-target skills.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Lockons(mod, mods) {
    // State tracking
    let lockonTargets = [];        // List of currently locked-on targets
    let lastResetTime = 0;         // Timestamp of last target list reset

    // Block all incoming lock-on target packets from server
    mod.hook(...mods.packet.get_all("S_CAN_LOCKON_TARGET"), hooks.MODIFY_REAL, event => {
        if (!mods.utils.isEnabled(event.skill.id)) return;
        return false; // Block the packet
    });

    // Utility methods

    /*
     * Calculate maximum number of lock-on targets for a skill
     * @param {number} skillId - The skill ID to check
     * @returns {number} Maximum number of targets (defaults to 50 if no data found)
     */
    const getMaxLockonTargets = skillId => {
        const lockonData = mods.skills.getLockonData(skillId);
        if (!lockonData) return 50; // Default max targets

        let totalTargets = 0;
        for (const targetType of lockonData || []) {
            for (const type in targetType) {
                totalTargets += targetType[type];
            }
        }
        return totalTargets + mods.action.effects.lockon;
    };

    /*
     * Add a target to the lock-on list and send success packet
     * @param {Object} event - The lock-on event data
     */
    const addLockonTarget = event => {
        if (lockonTargets.length >= getMaxLockonTargets(event.skill.id)) {
            mods.log.debug("LOCKON", "Reached max lockon targets");
            return;
        }

        lockonTargets.push(event.target);
        mod.send(...mods.packet.get_all("S_CAN_LOCKON_TARGET"), {
            ...event,
            success: true
        });
    };

    // Event handlers

    // Handle player lock-on target requests
    mod.hook(...mods.packet.get_all("C_CAN_LOCKON_TARGET"), hooks.MODIFY_ALL, event => {
        if (!mods.utils.isEnabled(event.skill.id)) return;

        // Reset targets list if this is a new skill cast
        if (mods.action.stage._time > lastResetTime) {
            lockonTargets = [];
            lastResetTime = mods.action.stage._time;
        }

        // Skip if target is already locked on
        if (lockonTargets.includes(event.target)) return;

        const targetId = event.target.toString();
        const lockonData = mods.skills.getLockonData(event.skill.id);

        // Handle case with no lock-on data but valid player target
        if (!lockonData) {
            if (mods.entity.players[targetId]) {
                mods.log.debug("LOCKON", "Sending hardcoded lockon success");
                addLockonTarget(event);
                return;
            }
        }

        // Process lock-on data rules
        for (const targetType of lockonData || []) {
            for (const type in targetType) {
                switch (type) {
                    case "enemyOrPvp": {
                        if ((mods.entity.mobs[targetId] || mods.entity.players[targetId]) && 
                            mods.utils.canLockonEntity(targetId)) {
                            addLockonTarget(event);
                            return;
                        }
                        break;
                    }
                    case "allyExceptMe": {
                        if (mods.entity.players[targetId]) {
                            addLockonTarget(event);
                            return;
                        }
                        break;
                    }
                    case "raidExceptMe":
                    case "raid": {
                        if (mods.player.playersInParty.has(BigInt(event.target))) {
                            addLockonTarget(event);
                            return;
                        }
                        break;
                    }
                    default: {
                        mods.log.error(
                            "LOCKON", 
                            `Failed to identify type for ${type} - ${event.skill.id} - ${mods.player.templateId}`
                        );
                        break;
                    }
                }
            }
        }
        
        // Send failure packet if no valid lock-on condition were met
        mod.send(...mods.packet.get_all("S_CAN_LOCKON_TARGET"), {
            ...event,
            success: false
        });
    });
};