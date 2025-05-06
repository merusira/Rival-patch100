/*
 * Rival Mod - Gunner Recall System
 * 
 * recall.js handles the Gunner's Recall skill (ID: 210300) functionality.
 * It manages the process of canceling other skills and returning to a previous state,
 * including blocking skill usage during active recall and restoring the previous skill state.
 */
const hooks = require('../enums/hooks');
/*
 * Recall module
 *
 * Implements the Gunner's Recall skill functionality, which allows canceling
 * other skills and returning to a previous state. This module only activates
 * for Gunner class characters and handles all aspects of the recall process.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Recall(mod, mods) {
    // State tracking
    let activeHooks = [];        // Stores active hooks for cleanup
    let isRecallActive = false;  // Tracks if recall is currently active
    let lastSkillInfo = null;    // Stores the skill info to restore after recall

    // Utility methods

    /*
     * Completes the recall process by sending the stored skill packet
     * and resetting the recall state
     */
    const completeRecall = () => {
        isRecallActive = false;
        if (lastSkillInfo) {
            mod.send(...mods.packet.get_all(lastSkillInfo._name), lastSkillInfo);
        }
    };

    /*
     * Checks if the player is a Gunner with Recall skill available
     * @returns {boolean} True if player can use Recall
     */
    const canUseRecall = () => {
        return mods.player.job === 9 && mods.skills.isSupported(210300);
    };

    /*
     * Checks if the skill ID is the base skill for the player's class
     * @param {number} skillId - The skill ID to check
     * @returns {boolean} True if it's the base skill
     */
    const isBaseSkill = skillId => {
        return skillId - mods.player.templateId * 100 === 8;
    };

    // Event handlers

    /*
     * Handles the action stage event for Recall
     * @param {Object} event - The action stage event data
     * @returns {boolean} True if the event was modified
     */
    const handleActionStage = event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (!isBaseSkill(event.skill.id)) return;
        if (!mods.utils.isEnabled()) return;
        
        event.skill = 210300;
        lastSkillInfo = null;
        isRecallActive = true;
        return true;
    };

    /*
     * Handles the action end event for Recall
     * @param {Object} event - The action end event data
     * @returns {boolean} True if the event was modified
     */
    const handleActionEnd = event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (!isBaseSkill(event.skill.id)) return;
        if (!mods.utils.isEnabled()) return;
        
        event.skill = 210300;
        completeRecall();
        return true;
    };

    /*
     * Blocks skill usage during active recall
     * @returns {boolean} False if a skill was blocked
     */
    const blockSkillDuringRecall = () => {
        if (isRecallActive && mods.utils.isEnabled()) {
            mods.log.debug('RECALL', "Blocking packet due to being in recall");
            mod.send(...mods.packet.get_all("S_CANNOT_START_SKILL"), {
                skill: mods.last.startSkill.skill.id
            });
            return false;
        }
    };

    /*
     * Handles instance skill events during recall
     * @returns {boolean} False if the skill was blocked
     */
    const handleInstanceSkill = () => {
        if (blockSkillDuringRecall() === false) {
            lastSkillInfo = mods.last.startSkill;
            return false;
        }
    };

    /*
     * Handles player death events
     * @param {Object} event - The creature life event data
     */
    const handlePlayerDeath = event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (event.alive) return;
        
        isRecallActive = false;
    };

    // Hook registration and initialization

    /*
     * Registers all necessary hooks for the Recall functionality
     */
    const registerHooks = () => {
        // Monitor player death to reset recall state
        activeHooks.push(mod.hook(
            ...mods.packet.get_all("S_CREATURE_LIFE"), 
            hooks.READ_DESTINATION_ALL, 
            handlePlayerDeath
        ));
        
        // Handle skill actions for recall
        activeHooks.push(mod.hook(
            ...mods.packet.get_all("S_ACTION_STAGE"), 
            hooks.MODIFY_INTERNAL_REAL, 
            handleActionStage
        ));
        
        activeHooks.push(mod.hook(
            ...mods.packet.get_all("S_ACTION_END"), 
            hooks.MODIFY_INTERNAL_REAL, 
            handleActionEnd
        ));
        
        // Block skills during recall
        activeHooks.push(mod.hook(
            "C_START_SKILL", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            blockSkillDuringRecall
        ));
        
        activeHooks.push(mod.hook(
            "C_START_TARGETED_SKILL", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            blockSkillDuringRecall
        ));
        
        activeHooks.push(mod.hook(
            "C_START_COMBO_INSTANT_SKILL", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            blockSkillDuringRecall
        ));
        
        activeHooks.push(mod.hook(
            "C_START_INSTANCE_SKILL", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            blockSkillDuringRecall
        ));
        
        activeHooks.push(mod.hook(
            "C_START_INSTANCE_SKILL_EX", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            handleInstanceSkill
        ));
        
        activeHooks.push(mod.hook(
            "C_PRESS_SKILL", 
            "event", 
            hooks.MODIFY_INTERNAL_REAL, 
            blockSkillDuringRecall
        ));
    };

    /*
     * Initializes the module when loaded or when player logs in
     */
    const initialize = () => {
        if (canUseRecall()) {
            registerHooks();
        } else {
            // Clean up hooks if recall isn't available
            for (const hookId of activeHooks) {
                mod.unhook(hookId);
            }
            activeHooks = [];
        }
    };
    
    // Register login hook to initialize the module
    mod.hook("S_LOGIN", "event", hooks.READ_DESTINATION_ALL, initialize);
    
    // Initial setup
    initialize();
};