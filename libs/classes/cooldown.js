/*
 * Rival Mod - Cooldown System
 *
 * cooldown.js serves as the central manager for skill cooldowns.
 * It tracks both client and server-side cooldown states, provides methods to check cooldown status,
 * and handles cooldown reset events through an event-based interface.
 */
const hooks = require("../enums/hooks");
const EventEmitter = require("events");
/*
 * Cooldown class
 *
 * Extends EventEmitter to provide an event-based interface for tracking
 * skill cooldowns. Maintains separate state for client and server-side
 * cooldown information and provides methods to check and manage cooldowns.
 */
class Cooldown extends EventEmitter {
    /*
     * Creates a new Cooldown instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        super();
        
        this.mod = mod;                // Reference to the mod object
        this.mods = mods;              // References to other modules
        this.info = {
            skills: {},                // Client-side cooldown information by skill ID
            server: {}                 // Server-side cooldown information by skill ID
        };
        
        // Register hooks for cooldown-related events
        mod.hook(
            ...mods.packet.get_all("S_DECREASE_COOLTIME_SKILL"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.cooltimeSkill
        );
        
        mod.hook(
            ...mods.packet.get_all("S_START_COOLTIME_SKILL"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.cooltimeSkill
        );
        
        mod.hook(
            ...mods.packet.get_all('S_CREST_MESSAGE'),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.crestMessage
        );
    }

    // Cooldown check methods

    /*
     * Checks if a skill is currently on cooldown
     * @param {number} skillId - The ID of the skill to check
     * @param {number} stackSkillId - The ID of the stack skill to check (if applicable)
     * @returns {boolean} Whether the skill is on cooldown
     */
    isOnCooldown = (skillId, stackSkillId) => {
        const currentTime = Date.now();
        
        // Handle stacked skills (skills with multiple charges)
        if (this.info.skills[stackSkillId]?.usedStacks) {
            const {
                time = 0,                   // Timestamp when cooldown started
                usedStacks = 0,             // Number of stacks/charges used
                nextStackCooldown = 0       // Time until next stack is available
            } = this.info.skills[stackSkillId];
            
            // Get the skill's cooldown configuration
            const cooldownData = this.mods.skills.getCooldownData(stackSkillId);
            
            // Calculate effective stacks by checking if a stack has recovered
            // If current time is past the next stack recovery time, reduce used stacks by 1
            const isStackRecovered = time + nextStackCooldown <= currentTime;
            const effectiveStacks = usedStacks - (isStackRecovered ? 1 : 0);
            
            // Skill is on cooldown if all stacks are used
            return cooldownData.maxStack === effectiveStacks;
        }
        
        // Handle regular skills (single cooldown)
        const {
            time = 0,                       // Timestamp when cooldown started
            cooldown = 0                    // Duration of the cooldown in milliseconds
        } = this.info.skills[skillId] || {};
        
        // Calculate when the cooldown ends
        const cooldownEndTime = time + cooldown;
        
        // Skill is on cooldown if current time hasn't reached the end time
        return cooldownEndTime > currentTime;
    };

    /*
     * Checks if a skill is on cooldown using base cooldown data
     * @param {number} skillId - The ID of the skill to check
     * @returns {boolean} Whether the skill is on cooldown
     */
    isOnCooldownBase = skillId => {
        const currentTime = Date.now();
        const {
            time = 0,                       // Timestamp when cooldown started
            cooldown = 0                    // Duration of the cooldown in milliseconds
        } = this.info.skills[skillId] || {};
        
        // Calculate when the cooldown ends and check if it's still active
        const cooldownEndTime = time + cooldown;
        return cooldownEndTime > currentTime;
    };

    /*
     * Gets cooldown data for a skill
     * @param {number} skillId - The ID of the skill
     * @param {boolean} fromServer - Whether to get server-side cooldown data
     * @returns {Object} The cooldown data for the skill
     */
    getData = (skillId, fromServer = false) => {
        return fromServer ? this.info.server[skillId] : this.info.skills[skillId];
    };

    // Event handlers for cooldown packets

    /*
     * Handles cooldown skill events
     * @param {Object} skillEvent - The skill event data
     * @param {boolean} isFromServer - Whether the event is from the server
     */
    cooltimeSkill = (skillEvent, isFromServer) => {
        // Create cooldown data structure with current timestamp and event data
        const cooldownData = {
            time: Date.now(),               // Current timestamp when cooldown started
            cooldown: skillEvent.cooldown,  // Duration of the cooldown in milliseconds
            usedStacks: skillEvent.usedStacks, // Number of stacks/charges used (for stacked skills)
            nextStackCooldown: skillEvent.nextStackCooldown // Time until next stack recovery
        };
        
        // Get normalized skill info to handle skill variants
        const skillInfo = this.mods.utils.getSkillInfo(skillEvent.skill.id);
        
        // Update client-side cooldown data for both raw and normalized skill IDs
        this.info.skills[skillEvent.skill.id] = cooldownData;
        this.info.skills[skillInfo.skill] = cooldownData;
        
        // Update server-side cooldown data if this event wasn't from the server
        // This helps maintain consistency between client and server state
        if (!isFromServer) {
            this.info.server[skillEvent.skill.id] = cooldownData;
            this.info.server[skillInfo.skill] = cooldownData;
        }
    };

    /*
     * Handles crest message events (for cooldown resets)
     * @param {Object} message - The crest message data
     * @param {boolean} isFromServer - Whether the message is from the server
     */
    crestMessage = (message, isFromServer) => {
        // Only process type 6 crest messages (cooldown reset)
        if (message.type !== 6) return;
        
        this.mods.log.debug('CREST-COOLDOWN', "Removed cd from skill:", message.skill);
        
        // Create reset data structure to clear the cooldown
        const resetData = {
            time: Date.now(),               // Current timestamp
            cooldown: 0,                    // Set cooldown to 0 (no cooldown)
            usedStacks: 0,                  // Reset used stacks
            nextStackCooldown: 0            // Reset stack cooldown
        };
        
        // Get normalized skill info to handle skill variants
        const skillInfo = this.mods.utils.getSkillInfo(message.skill);
        
        // Update client-side cooldown data for both raw and normalized skill IDs
        this.info.skills[message.skill] = resetData;
        this.info.skills[skillInfo.skill] = resetData;
        
        // Update server-side cooldown data if this event wasn't from the server
        if (!isFromServer) {
            this.info.server[message.skill] = resetData;
            this.info.server[skillInfo.skill] = resetData;
        }
        
        // Emit reset event for other modules to respond to
        this.emit("reset", skillInfo.id, isFromServer);
    };

}
// Export the Cooldown class
module.exports = Cooldown;