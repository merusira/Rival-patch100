/*
 * Rival Mod - Cooldown System
 *
 * classes/cooldown.js serves as the central manager for skill cooldowns.
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
        
        // Enhanced debug logging for cooldown check
        this.mods.log.debug("COOLDOWN_DEBUG", `Checking cooldown for skill ${skillId}, stack ${stackSkillId}`);
        
        // Get skill details for better debugging
        const skillDetails = this.mods.utils.getSkillInfo(skillId);
        const isMultiStageSkill = skillDetails && this.mods.skills._getInfo(skillId)?.nextSkill;
        
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
            const isOnCd = cooldownData.maxStack === effectiveStacks;
            this.mods.log.debug("COOLDOWN_DEBUG", `Stack skill ${stackSkillId}: isOnCd=${isOnCd}, effectiveStacks=${effectiveStacks}, maxStack=${cooldownData?.maxStack}`);
            return isOnCd;
        }
        
        // Handle regular skills (single cooldown)
        const {
            time = 0,                       // Timestamp when cooldown started
            cooldown = 0                    // Duration of the cooldown in milliseconds
        } = this.info.skills[skillId] || {};
        
        // Calculate when the cooldown ends
        const cooldownEndTime = time + cooldown;
        
        // Check if the skill is on cooldown
        const isOnCd = cooldownEndTime > currentTime;
        
        // Debug logging for regular cooldown check
        this.mods.log.debug("COOLDOWN_DEBUG", `Regular skill ${skillId}: isOnCd=${isOnCd}, endTime=${cooldownEndTime}, currentTime=${currentTime}, remaining=${cooldownEndTime - currentTime}ms, isMultiStage=${isMultiStageSkill}`);
        
        // Check if there's a group cooldown for this skill
        const groupId = `${Math.floor(skillDetails.skill / 10000)}-0`;
        
        // Only check group cooldown if:
        // 1. This is a skill ID (not a group ID itself)
        // 2. The group exists in the cooldown info
        // 3. We're not currently in an action, OR we're checking a skill in the same group as the current action
        const isGroupId = String(skillId).includes('-');
        const currentSkillId = this.mods?.action?.stage?.skill?.id;
        const currentSkillGroupId = currentSkillId ?
            `${Math.floor(this.mods.utils.getSkillInfo(currentSkillId).skill / 10000)}-0` : null;
        const isSameGroup = groupId === currentSkillGroupId;
        
        // Check if this is a special skill type (projectile, drain, lockon, or movingSkill)
        const skillType = this.mods.skills.getType(skillId);
        const isProjectileSkill = skillType === "projectile";
        const isDrainSkill = skillType === "drain";
        const isMovingSkill = skillType === "movingSkill";
        const hasLockon = this.mods.skills.getLockonData(skillId);
        const isSpecialSkill = isProjectileSkill || isDrainSkill || hasLockon || isMovingSkill;
        
        // Only check group cooldown in specific cases:
        // 1. Not a group ID itself
        // 2. Has a valid group ID
        // 3. Group has cooldown data
        // 4. Not a special skill type (projectile or drain)
        // 5. Either not in an action OR checking a skill in the same group as current action
        const shouldCheckGroupCooldown = !isGroupId &&
            groupId &&
            this.info.skills[groupId] &&
            !isSpecialSkill &&
            (!this.mods.action.inAction || isSameGroup);
            
        this.mods.log.debug("COOLDOWN_DEBUG", `Skill ${skillId} type: ${skillType}, Is projectile: ${isProjectileSkill}, Is drain: ${isDrainSkill}, Is movingSkill: ${isMovingSkill}, Has lockon: ${hasLockon}`);
        
        if (shouldCheckGroupCooldown) {
            const groupData = this.info.skills[groupId];
            const groupEndTime = groupData.time + groupData.cooldown;
            const isGroupOnCd = groupEndTime > currentTime;
            
            this.mods.log.debug("COOLDOWN_DEBUG", `Group ${groupId} for skill ${skillId}: isOnCd=${isGroupOnCd}, endTime=${groupEndTime}, remaining=${groupEndTime - currentTime}ms`);
            this.mods.log.debug("COOLDOWN_DEBUG", `Current action: ${this.mods.action.inAction}, Current skill: ${currentSkillId}, Same group: ${isSameGroup}`);
            
            // Return true if either the skill itself or its group is on cooldown
            return isOnCd || isGroupOnCd;
        }
        
        return isOnCd;
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
        
        // Debug logging for cooldown application
        this.mods.log.debug("COOLDOWN_APPLY", `Applying cooldown to skill ${skillEvent.skill.id}, normalized: ${skillInfo.skill}, cooldown: ${skillEvent.cooldown}ms`);
        
        // Update client-side cooldown data for both raw and normalized skill IDs
        this.info.skills[skillEvent.skill.id] = cooldownData;
        this.info.skills[skillInfo.skill] = cooldownData;
        
        // For multi-stage skills, only apply cooldown to the group if this is a multi-stage skill
        // and not a special type (projectile, drain, lockon, or movingSkill)
        const groupId = `${Math.floor(skillInfo.skill / 10000)}-0`;
        const isMultiStageSkill = this.mods.skills._getInfo(skillEvent.skill.id)?.nextSkill;
        
        // Check if this is a special skill type (projectile, drain, lockon, or movingSkill)
        const skillType = this.mods.skills.getType(skillEvent.skill.id);
        const isProjectileSkill = skillType === "projectile";
        const isDrainSkill = skillType === "drain";
        const isMovingSkill = skillType === "movingSkill";
        const hasLockon = this.mods.skills.getLockonData(skillEvent.skill.id);
        const isSpecialSkill = isProjectileSkill || isDrainSkill || hasLockon || isMovingSkill;
        
        if (groupId && isMultiStageSkill && !isSpecialSkill) {
            this.mods.log.debug("COOLDOWN_APPLY", `Also applying cooldown to group ${groupId} for multi-stage skill`);
            this.mods.log.debug("COOLDOWN_DEBUG", `Multi-stage skill detected: ${skillEvent.skill.id} -> group ${groupId}`);
            this.mods.log.debug("COOLDOWN_DEBUG", `Skill type: ${skillType}, Is projectile: ${isProjectileSkill}, Is drain: ${isDrainSkill}, Is movingSkill: ${isMovingSkill}, Has lockon: ${hasLockon}`);
            this.mods.log.debug("COOLDOWN_DEBUG", `Cooldown data: ${JSON.stringify(cooldownData)}`);
            this.info.skills[groupId] = cooldownData;
        } else if (groupId) {
            if (isSpecialSkill) {
                this.mods.log.debug("COOLDOWN_APPLY", `Not applying group cooldown for special skill type ${skillType} (${skillEvent.skill.id})`);
            } else {
                this.mods.log.debug("COOLDOWN_APPLY", `Not applying group cooldown for non-multi-stage skill ${skillEvent.skill.id}`);
            }
        }
        
        // Update server-side cooldown data if this event wasn't from the server
        // This helps maintain consistency between client and server state
        if (!isFromServer) {
            this.info.server[skillEvent.skill.id] = cooldownData;
            this.info.server[skillInfo.skill] = cooldownData;
            
            // Also update server-side group cooldown, but only for multi-stage skills that aren't special types
            if (groupId && isMultiStageSkill && !isSpecialSkill) {
                this.info.server[groupId] = cooldownData;
            }
        }
        
        // Debug log the current cooldown state
        this.mods.log.debug("COOLDOWN_STATE", `Current cooldown state: ${JSON.stringify(this.info.skills)}`);
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