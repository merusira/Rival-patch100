/*
 * Rival Mod - Skill Management System
 *
 * skills.js serves as the core skill management and execution system.
 * It handles skill information, animations, chains, cooldowns, and abnormality effects
 * for all character classes in the game.
 */

// Constants for commonly used magic numbers
const LARGE_SKILL_ID_DIFFERENCE = 10000;  // Threshold for "far" skill ID redirects
const ABNORMALITY_TIMING_THRESHOLD = 500; // Timing threshold for abnormality redirects
const SMALL_TIMING_THRESHOLD = 30;        // Small timing threshold for various checks
const DEFAULT_RETRY_COUNT = 4;            // Default retry count for skills
const ARROW_TIMEOUT = 200;                // Timeout for skill arrow connections
const MAX_ANIM_LENGTH_CACHE_SIZE = 100;   // Maximum size for animation length cache
const hooks = require('../enums/hooks');
const classes = require("../enums/classes");
const SKILL_CONFIG = require("../../skills.json");
const EventEmitter = require("events");
/*
 * Skills class
 *
 * Extends EventEmitter to provide an event-based interface for managing
 * all aspects of skill execution, including timing, animations, chains,
 * and effects. Serves as the central system for skill-related operations.
 */
class Skills extends EventEmitter {
    /*
     * Creates a new Skills instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        super();
        
        this.mod = mod;                // Reference to the mod API
        this.mods = mods;              // References to other modules
        
        // Initialize skill information storage
        this.info = {
            skillData: {},             // Stores all skill data by ID
            skillIdCounter: 0,         // Counter for unique skill action IDs
            connectSkillArrow: {},     // Stores skill arrow connection data
            skillSupportedCount: 0,    // Count of supported skills
            loadedSkillConfig: {}      // Configuration for loaded skills
        };
        
        // Hook login event to load skill data
        mod.hook("S_LOGIN", "event", hooks.READ_REAL, this.loaded);
    }

    // Getter methods for skill state

    /*
     * Gets the current skill ID counter
     * @returns {number} The current skill ID counter value
     */
    get counter() {
        return this.info.skillIdCounter;
    }

    /*
     * Gets the count of supported skills
     * @returns {number} The number of supported skills
     */
    get supportedCount() {
        return this.info.skillSupportedCount;
    }

    // Abnormality management methods

    /*
     * Gets abnormalities that should be applied when a skill reaches action stage
     * @param {number} skillId - The ID of the skill
     * @returns {Array} List of abnormalities to apply
     */
    getAbnormalitiesToStartOnActionStage = skillId => {
        return this._getInfo(skillId)?.abnormalityApply || [];
    };

    /*
     * Gets abnormalities that should end when a skill reaches action stage
     * @param {number} skillId - The ID of the skill
     * @returns {Array} List of abnormalities to end
     */
    getAbnormalitiesToEndOnActionStage = skillId => {
        return this._getInfo(skillId)?.abnormalityConsume?.stage || [];
    };

    /*
     * Gets abnormalities that should end when a skill action ends
     * @param {number} skillId - The ID of the skill
     * @returns {Array} List of abnormalities to end
     */
    getAbnormalitiesToEndOnActionEnd = skillId => {
        return this._getInfo(skillId)?.abnormalityConsume?.end || [];
    };

    /*
     * Gets skills that should have cooldown applied from this skill
     * @param {number} skillId - The ID of the skill
     * @returns {Array|undefined} List of skills to apply cooldown to
     */
    getSkillsToApplyCooldownToFrom = skillId => {
        return this._getInfo(skillId)?.applyCooldown;
    };

    // Animation and timing methods

    /*
     * Calculates animation length for a skill at a specific stage with speed modifiers
     * @param {number} skillId - The ID of the skill
     * @param {number} stage - The stage of the skill animation
     * @param {Object} speed - Speed modifiers object
     * @returns {number} The calculated animation length in milliseconds, or -1 if not found
     */
    getAnimationLength = (skillId, stage, speed) => {
        // Check for hardcoded length override first
        const hardcodedLength = this.mods.hardcoded.getAnimationLength(skillId, stage, speed);
        if (hardcodedLength) return hardcodedLength;

        const skillInfo = this._getInfo(skillId);
        if (!skillInfo) return -1;

        // Handle different skill types with specific animation calculations
        if (skillInfo.type === 'dash') {
            const distance = Math.abs(this.mods.last.startSkill.loc.dist2D(this.mods.last.startSkill.dest)) + 25;
            const animTime = distance * 1000 / skillInfo.animLength;
            return animTime / speed.real;
        }

        if (skillInfo.type === 'movingCharge') {
            const stageLength = skillInfo.animLength[stage][0];
            return stageLength / speed.real;
        }

        if (skillInfo.shouldNotUseLength) {
            if (skillInfo?.animLength?.length && stage + 1 !== skillInfo.animLength.length)
                return skillInfo.animLength[stage] / speed.real;
            return -1;
        }

        // Handle standard animation length formats
        if (!Array.isArray(skillInfo.animLength))
            return skillInfo.animLength / speed.real;
            
        return skillInfo.animLength[stage] / speed.real;
    };

    /*
     * Gets raw animation length with default parameters
     * @param {number} skillId - The ID of the skill
     * @param {Object} speed - Speed modifiers object (defaults to {real: 1})
     * @param {number} stage - The stage of the skill animation (defaults to 0)
     * @returns {number} The calculated animation length
     */
    getRawAnimationLength = (skillId, speed = {
        real: 1
    }, stage = 0) => {
        return this.getAnimationLength(skillId, stage, speed);
    };

    /*
     * Calculates total animation length across all stages of a skill
     * @param {number} skillId - The ID of the skill
     * @param {Object} speed - Speed modifiers object (defaults to {real: 1})
     * @param {number|null} stageLimit - Optional limit to the number of stages to calculate
     * @returns {number} The total animation length across all stages
     */
    getAnimationlengthForAllStages = (skillId, speed = {
        real: 1
    }, stageLimit = null) => {
        let totalLength = 0;
        const stageCount = stageLimit !== null ? stageLimit : this.getStageCount(skillId);
        
        for (let i = 0; i < stageCount; i++) {
            totalLength += this.getAnimationLength(skillId, i, speed);
        }
        
        return totalLength;
    };

    /*
     * Gets the number of stages for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {number} The number of stages for the skill
     */
    getStageCount = skillId => {
        return this._getInfo(skillId)?.animLength?.length || 0;
    };

    /*
     * Gets cooldown data for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {Object|undefined} Cooldown data for the skill
     */
    getCooldownData = skillId => {
        return this._getInfo(skillId)?.cooldown;
    };

    /*
     * Gets retry count for a skill, with hardcoded override if available
     * @param {number} skillId - The ID of the skill
     * @returns {number} The retry count for the skill (defaults to 4)
     */
    getRetryCount = skillId => {
        const hardcodedRetryCount = this.mods.hardcoded.getRetryCount(skillId);
        if (hardcodedRetryCount !== -1) return hardcodedRetryCount;
        return DEFAULT_RETRY_COUNT;
    };
    // Skill casting validation methods

    /*
     * Determines if a skill can be cast based on various conditions
     * @param {Object} skillData - The skill data object
     * @param {Object} options - Options for skill casting
     * @param {boolean} options.byGrant - Whether the skill is being cast by a grant
     * @param {boolean} options.press - Whether the skill is being cast by a press
     * @param {number} options.originalSkillId - The original skill ID before transformations
     * @returns {number} A type code or negative error code indicating cast result
     */
    canCast = (skillData, {
        byGrant,
        press,
        originalSkillId
    }) => {
        const {
            skillId,
            noAction,
            charge,
            type,
            failed
        } = skillData;
        
        const skillInfo = this._getInfo(skillId);
        
        // Early returns for quick validation
        
        // Check for hardcoded result first (most efficient)
        const hardcodedResult = this.mods.hardcoded.canCast(skillId);
        if (hardcodedResult !== -1) return hardcodedResult;
        
        // Quick checks for skill state
        if (skillInfo.type === "nocasting") return -4;
        if (noAction) return -1;
        if (charge) return -2;
        if (skillInfo.type === "notimeline") return -3;
        if (failed) return -5;
        
        // Check if keeping a moving charge skill
        const isKeepingMovingCharge = !noAction &&
            skillInfo.keepMovingCharge &&
            this.getType(this.mods.action.stage.skill.id) === "movingCharge";
        
        // Check skill categories (only if not keeping moving charge)
        if (!isKeepingMovingCharge) {
            for (const category of skillInfo.categories) {
                if (!this.mods.effects.isCategoryEnabled(category)) {
                    this.mods.log.debug("CAN_CAST", category);
                    return -11; // Category disabled
                }
            }
        }
        
        // Resource and state checks
        
        // Check cooldown
        // For multi-stage skills, also check the group cooldown
        const skillDetails = this.mods.utils.getSkillInfo(skillId);
        const groupId = `${Math.floor(skillDetails.skill / 10000)}-0`;
        const isMultiStageSkill = groupId && this._getInfo(skillId)?.nextSkill;
        
        // Get the skill type to check if it's a special type (projectile, drain, lockon, or movingSkill)
        const skillType = this.getType(skillId);
        const isProjectileSkill = skillType === "projectile";
        const isDrainSkill = skillType === "drain";
        const isMovingSkill = skillType === "movingSkill";
        const hasLockon = this.getLockonData(skillId);
        const isSpecialSkill = isProjectileSkill || isDrainSkill || hasLockon || isMovingSkill;
        
        // Debug logging for cooldown check
        this.mods.log.debug("COOLDOWN_CHECK", `Checking cooldown for skill ${skillId}, original ${originalSkillId}, group ${groupId}`);
        this.mods.log.debug("COOLDOWN_CHECK", `Is multi-stage: ${isMultiStageSkill}, Skill type: ${skillType}`);
        this.mods.log.debug("COOLDOWN_CHECK", `Is projectile: ${isProjectileSkill}, Is drain: ${isDrainSkill}, Is movingSkill: ${isMovingSkill}, Has lockon: ${hasLockon}`);
        
        // Check individual skill cooldown
        const isOnIndividualCooldown = this.mods.cooldown.isOnCooldown(skillId, originalSkillId);
        
        // Check group cooldown for multi-stage skills that are not special types
        const isOnGroupCooldown = isMultiStageSkill && !isSpecialSkill && groupId ?
            this.mods.cooldown.isOnCooldown(groupId, null) : false;
        
        if (isOnIndividualCooldown || isOnGroupCooldown) {
            this.mods.log.debug("COOLDOWN_CHECK", `Skill ${skillId} is on cooldown`);
            this.mods.log.debug("COOLDOWN_CHECK", `Individual cooldown: ${isOnIndividualCooldown}, Group cooldown: ${isOnGroupCooldown}`);
            return -12; // On cooldown
        }
        
        // Check weapon requirement
        if (!skillInfo.noNeedWeapon && !this.mods.player.inven.weapon)
            return -13; // No weapon
        
        // Check crowd control restrictions
        const ccResult = this.mods.crowd_control.canCastSkill(skillId);
        if (ccResult !== 0) return ccResult;
        
        // Check resource requirements
        const appliedEffects = this.mods.effects.getAppliedEffects(skillId);
        if (skillInfo?.resourceUsage?.st + appliedEffects.stamina > this.mods.player.stamina) {
            return -14; // Not enough stamina
        }
        
        // Type and state compatibility checks
        
        // Check type compatibility
        if (type !== 5 && skillInfo.typeId === 27)
            return -27; // Type mismatch
        
        // Check if skill can only be used after successful defense
        if (skillInfo.onlyAfterDefenceSuccess &&
            ((this?.mods?.action?.stage?._time || 0) > (this?.mods?.last?.block?._time || 0) ||
             !this.mods.action.inAction)) {
            return -17; // Not after defense
        }
        
        // Special case for Sorcerer (job 4) and specific skill
        if (this.mods.player.job === 4 && skillId === 359096)
            return -16;
        
        // Check press state validity
        if (!charge && press === false &&
            (noAction || skillId !== this.mods.action.stage.skill.id) &&
            this._getInfo(this?.mods?.action?.stage?.skill?.id)?.typeId !== 7) {
            return -15; // Invalid press state
        }
        
        // Check moving charge compatibility
        if (skillInfo.keepMovingCharge &&
            this._getInfo(this?.mods?.action?.stage?.skill?.id)?.typeId !== 25) {
            return -18; // Invalid moving charge
        }
        
        // Final state checks
        
        if (this.mods.action.stage.skill.id &&
            this.getType(this.mods.action.stage.skill.id) === "notimeline") {
            return -6; // Current skill is notimeline
        }
        
        if (this.mods.action.inSpecialAction && ![27].includes(skillInfo.typeId)) {
            return -7; // In special action
        }
        
        return type;
    };

    /*
     * Checks if a skill can be canceled with a specific cancel type
     * @param {number} skillId - The ID of the skill
     * @param {number} cancelType - The type of cancel to check
     * @returns {boolean|null} Whether the skill can be canceled with the specified type
     */
    canCancelSkillWithType = (skillId, cancelType) => {
        if (!this.mods.action.inAction) return null;
        
        const skillInfo = this._getInfo(skillId);
        const { front = -1 } = skillInfo?.cancels || {};
        const elapsedTime = (Date.now() - this.mods.action.stage._time) * this.mods.action.speed.real;
        
        switch (cancelType) {
            case 1:
                return skillInfo?.typeId === 30; // Type 30 check
            case 2:
                return front !== -1 && front > elapsedTime && this.mods.action.stage.stage === 0;
        }
    };

    // Timing calculation utility methods

    // Cache for animation lengths to avoid recalculation
    _animLengthCache = new Map();
    
    /*
     * Gets timing buffer for skill execution
     * @returns {number} The timing buffer in milliseconds
     */
    _getWiggleRoom = () => {
        return global.TeraProxy ? 80 + this.mods.ping.jitter : this.mods.ping.jitter;
    };

    /*
     * Calculates timing for skill execution based on animation length and speed
     * @param {number} baseTime - The base time to calculate from
     * @param {number} elapsedTime - The elapsed time since action start
     * @param {number} speedFactor - The speed factor to apply
     * @param {number|null} overrideSkillId - Optional skill ID to override current skill
     * @param {number|null} overrideStage - Optional stage to override current stage
     * @param {boolean} useWiggleRoom - Whether to use timing buffer
     * @returns {number} The calculated time for skill execution
     */
    _calculateTime = (baseTime, elapsedTime, speedFactor, overrideSkillId = null, overrideStage = null, useWiggleRoom = true) => {
        // Early return for common case: no elapsed time
        if (elapsedTime <= 0) return 0;
        
        // Calculate wiggle room once
        const wiggleRoom = useWiggleRoom ? this._getWiggleRoom() : 0;
        const adjustedElapsedTime = elapsedTime - wiggleRoom;
        
        // Early optimization: if baseTime is very close to elapsed time, use it directly
        if (Math.abs(baseTime - adjustedElapsedTime) < 10) {
            return Math.max(0, Math.floor((elapsedTime - baseTime - wiggleRoom) / speedFactor) - 1);
        }
        
        // Use override values or current action values
        const stage = overrideSkillId ? overrideStage : this.mods.action.stage.stage + 1;
        const skillId = overrideSkillId ? overrideSkillId : this.mods.action.stage.skill.id;
        
        // Get animation length for all stages (using cache)
        const cacheKey = `${skillId}_${stage}`;
        let animLength;
        
        if (this._animLengthCache.has(cacheKey)) {
            animLength = this._animLengthCache.get(cacheKey);
        } else {
            // Only calculate if not in cache
            animLength = this.getAnimationlengthForAllStages(skillId, { real: 1 }, stage);
            
            // Store in cache
            this._animLengthCache.set(cacheKey, animLength);
            
            // Limit cache size to prevent memory leaks - use more efficient approach
            if (this._animLengthCache.size > MAX_ANIM_LENGTH_CACHE_SIZE) {
                // Convert keys to array, sort by access time, and remove oldest 10%
                const keysToRemove = [...this._animLengthCache.keys()].slice(0, Math.max(1, Math.floor(MAX_ANIM_LENGTH_CACHE_SIZE * 0.1)));
                for (const key of keysToRemove) {
                    this._animLengthCache.delete(key);
                }
            }
        }
        
        // Determine which timing is closer - avoid redundant calculations
        const baseTimeDiff = Math.abs(baseTime - adjustedElapsedTime);
        const animLengthDiff = Math.abs(animLength - adjustedElapsedTime);
        
        // Use the closer timing
        const closestTime = baseTimeDiff <= animLengthDiff ? baseTime : animLength;
        const calculatedTime = Math.floor((elapsedTime - closestTime - wiggleRoom) / speedFactor) - 1;
        
        // Handle negative calculated time more efficiently
        if (calculatedTime >= 0) {
            return calculatedTime;
        }
        
        // Only try alternative if calculated time is negative
        const altTime = closestTime === baseTime ? animLength : baseTime;
        const altCalculatedTime = Math.floor((elapsedTime - altTime - wiggleRoom) / speedFactor) - 1;
        
        return Math.max(0, altCalculatedTime);
    };
    // Skill data processing methods

    /*
     * Determines the appropriate skill data to use based on various conditions
     * Handles skill transformations, abnormality redirects, and skill chains
     * @param {number} requestedSkillId - The initially requested skill ID
     * @param {Object} options - Options for skill processing
     * @param {boolean} options.byGrant - Whether the skill is being cast by a grant
     * @param {boolean} options.press - Whether the skill is being cast by a press
     * @returns {Object} The processed skill data object with execution parameters
     *
     * Handles special class-specific skill transformations
     * @private
     * @param {number} skillId - The skill ID to check
     * @param {boolean} byGrant - Whether the skill is being cast by a grant
     * @returns {number} The potentially transformed skill ID
     */
    _handleSkillTransformations = (skillId, byGrant) => {
        // Special case for Ninja class with specific skills and passivity
        if (!byGrant &&
            this.mods.player.job === classes.NINJA &&
            [90100, 90130].includes(skillId) &&
            this.mods.effects.getPassivity(32065)) {
            return 90131;
        }
        
        // Apply skill transformations from effects
        const appliedEffects = this.mods.effects.getAppliedEffects(skillId);
        if (appliedEffects.transform) {
            return appliedEffects.transform;
        }
        
        return skillId;
    };
    
    getNewSkillData = (requestedSkillId, {
        byGrant,
        press
    }) => {
        const originalSkillId = requestedSkillId;
        
        // Apply skill transformations
        requestedSkillId = this._handleSkillTransformations(requestedSkillId, byGrant);
        
        // Get skill info
        let skillInfo = this._getInfo(requestedSkillId);
        if (!skillInfo) {
            this.mods.log.error("CRITICAL", "Failed to find skill info " + originalSkillId + ' ' + requestedSkillId + ' ' + this.mods.player.templateId + ' 0');
            return {
                failed: true,
                skillId: requestedSkillId,
                notFound: true
            };
        }
        
        // Process abnormality redirects
        const redirectResult = this._processAbnormalityRedirects(requestedSkillId, skillInfo);
        
        // If we need to recursively call getNewSkillData for a far redirect
        if (redirectResult.recursiveRedirect) {
            return this.getNewSkillData(redirectResult.skillId, {
                byGrant,
                press
            });
        }
        
        // Update skill info with redirect results
        requestedSkillId = redirectResult.skillId;
        skillInfo = redirectResult.skillInfo;
        let hasAbnormality = redirectResult.hasAbnormality;
        
        // Process skill connections based on abnormalities
        
        // Connect next skill if has abnormality with type value
        if (skillInfo.connectNextSkill &&
            this.mods.effects.hasAbnormalityWithTypeValue(334, skillInfo.baseId)) {
            requestedSkillId = skillInfo.connectNextSkill;
            skillInfo = this._getInfo(requestedSkillId);
        }
        
        // Handle abnormality with category type value
        if (this.mods.effects.hasAbnormalityWithCategoryTypeValue(skillInfo.categories, 239, null, 3)) {
            const skillDetails = this.mods.utils.getSkillInfo(requestedSkillId);
            skillDetails.sub = 30;
            requestedSkillId = skillDetails.id;
            skillInfo = this._getInfo(requestedSkillId);
        }
        
        // Process skill arrow connections
        const arrowResult = this._handleSkillArrowConnections(originalSkillId, byGrant);
        if (arrowResult) {
            return arrowResult;
        }
        
        // Handle special action states
        
        // Handle not in action
        if (!this.mods.action.inAction) {
            let isCharge = false;
            
            // Handle kept moving charge
            if (skillInfo.keptMovingCharge && skillInfo.type === "movingCharge") {
                requestedSkillId = skillInfo.animLength[this.mods.action.keptMovingCharge][1];
                isCharge = true;
            }
            
            return {
                skillId: requestedSkillId,
                charge: isCharge,
                noAction: true
            };
        }
        
        // Handle notimeline type
        if (skillInfo.type === "notimeline") {
            return {
                skillId: requestedSkillId,
                time: this.mods.ping.jitter,
                type: 9
            };
        }
        // Process current skill context
        
        const currentSkillId = this.mods.action.stage.skill.id;
        const currentSkillDetails = this.mods.utils.getSkillInfo(currentSkillId);
        const currentSkillInfo = this._getInfo(currentSkillId) || {};
        
        // Handle special skill types
        
        // Handle keep moving charge
        if (skillInfo.keepMovingCharge && currentSkillInfo.type === "movingCharge") {
            return {
                skillId: requestedSkillId,
                keepCharge: true,
                time: this.mods.ping.jitter - 1,
                type: 0
            };
        }
        
        // Handle moving charge with press=false
        if ((byGrant || currentSkillId === requestedSkillId) &&
            currentSkillInfo.type === 'movingCharge' &&
            press === false) {
            
            let delayTime = this.mods.ping.jitter;
            const timeSinceStage = Date.now() - this.mods.action.stage._stageTime - delayTime;
            const animTimeDiff = Math.abs(
                currentSkillInfo.animLength[this.mods.action.stage.stage][0] -
                (timeSinceStage + delayTime) * this.mods.action.speed.real
            );
            
            // Adjust delay time based on timing conditions
            if (timeSinceStage <= SMALL_TIMING_THRESHOLD) {
                delayTime = Math.abs(Math.min(timeSinceStage, 15)) * -1;
                this.mods.log.debug("CHARGE", "special charge 1; delaying by:", delayTime);
            } else if (animTimeDiff <= SMALL_TIMING_THRESHOLD) {
                delayTime = Math.abs(animTimeDiff) * -1 - 25;
                this.mods.log.debug("CHARGE", "special charge 2; delaying by:", delayTime);
            }
            
            return {
                skillId: currentSkillInfo.animLength[this.mods.action.stage.stage][1],
                time: delayTime,
                charge: true
            };
        }
        
        // Handle defense-related skills
        
        // Handle skills that can only be used after successful defense
        if (skillInfo.onlyAfterDefenceSuccess &&
            this.mods.last.block._time > this.mods.action.stage._time) {
            
            // Check for race condition with server stage
            if (this.mods.action.serverStage._time >= this.mods.last.block._time) {
                this.mods.log.debug('getNewSkillData', "Not allowing the skill through due to race condition");
                return {
                    skillId: requestedSkillId,
                    failed: true,
                    type: -999
                };
            } else {
                return {
                    skillId: requestedSkillId,
                    chain: true,
                    time: this.mods.last.block._time - this.mods.action.stage._time - 1,
                    type: currentSkillInfo.typeId === 46 ? 6 : 3
                };
            }
        }
        
        // Process skill cancellation and chaining
        
        // Calculate timing parameters for skill execution
        const timingParams = this._calculateTimingParams(currentSkillInfo);
        const {
            rearStartTime,
            pendingStartTime,
            front,
            speedFactor,
            adjustedElapsedTime,
            isPendingTimeActive,
            canRearCancel
        } = timingParams;
        
        // Handle various cancel types
        
        // Handle front cancel for type 25 skills
        if (currentSkillInfo.typeId === 25 && this.canFrontCancel(adjustedElapsedTime, currentSkillInfo.cancels)) {
            return {
                skillId: requestedSkillId,
                front: true,
                time: this._calculateTime(front, adjustedElapsedTime, speedFactor),
                type: 2
            };
        }
        
        // Handle self-cancel for type 41 skills
        if (currentSkillId === requestedSkillId && press === false && skillInfo.typeId === 41) {
            return {
                skillId: requestedSkillId,
                cancel: true,
                time: this.mods.ping.jitter - 1,
                type: 51
            };
        }
        
        // Handle immediate skills with pending type 1
        if ([6, 9, 22, 24, 29, 38, 41, 42].includes(skillInfo.typeId) &&
            skillInfo.pendingType === 1 &&
            isPendingTimeActive &&
            !hasAbnormality) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 1
            };
        }
        
        // Handle type 31 skills with pending type 1
        if (currentSkillInfo.typeId === 31 && skillInfo.pendingType === 1) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 3
            };
        }
        // Process skill chains and connections
        
        const requestedSkillDetails = this.mods.utils.getSkillInfo(requestedSkillId);
        const hasChainAvailable = isPendingTimeActive && currentSkillInfo?.chains?.[requestedSkillDetails.skill] !== undefined;
        const hasSameSkillPendingType3 = requestedSkillDetails.skill === currentSkillDetails.skill &&
                                      skillInfo.pendingType === 3 &&
                                      currentSkillInfo.pendingType === 3 &&
                                      currentSkillInfo?.chains?.[requestedSkillDetails.skill] !== undefined;
        
        // Handle skill chains, abnormality chains, and pending type 3 chains
        if (hasChainAvailable || hasAbnormality || hasSameSkillPendingType3) {
            let chainData = {
                chain: hasChainAvailable,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 4
            };
            
            let shouldSkipChain = false;
            
            // Handle moving charge type
            if (skillInfo.type === "movingCharge") {
                chainData.charge = true;
                requestedSkillDetails.id = skillInfo.overChargeConnectSkill || requestedSkillDetails.id;
            } else {
                // Handle chain and connect skills
                if (hasChainAvailable || hasSameSkillPendingType3) {
                    if (skillInfo.type === "connect") {
                        shouldSkipChain = true;
                        // Find matching connect skill
                        for (const subId of currentSkillInfo.chains[requestedSkillDetails.skill]) {
                            const connectKey = requestedSkillDetails.skill + '-' + subId;
                            if (skillInfo?.connectSkills?.[connectKey] !== undefined) {
                                requestedSkillDetails.sub = subId;
                                requestedSkillDetails.level = skillInfo.connectSkills[connectKey];
                                shouldSkipChain = false;
                                break;
                            }
                        }
                    } else {
                        shouldSkipChain = true;
                        // Check for matching sub or connect skill
                        for (const subId of currentSkillInfo.chains[requestedSkillDetails.skill]) {
                            if (subId === requestedSkillDetails.sub) {
                                shouldSkipChain = false;
                                break;
                            }
                            
                            const connectKey = requestedSkillDetails.skill + '-' + subId;
                            if (skillInfo?.connectSkills?.[connectKey] !== undefined) {
                                requestedSkillDetails.sub = subId;
                                requestedSkillDetails.level = skillInfo.connectSkills[connectKey];
                                shouldSkipChain = false;
                                break;
                            }
                        }
                    }
                }
            }
            
            // Handle abnormality timing
            if ((hasChainAvailable ? hasAbnormality && shouldSkipChain : hasAbnormality)) {
                shouldSkipChain = false;
                const currentTime = Date.now();
                chainData.time = Math.floor(currentTime - hasAbnormality.time);
                
                if (requestedSkillDetails.id === this.mods.action.stage.skill.id) {
                    const isInRedirectList = (currentSkillInfo?.abnormalityRedirectToMe || []).includes(hasAbnormality.id);
                    
                    if (isInRedirectList) {
                        if (currentTime - this.mods.action.stage._time >= ABNORMALITY_TIMING_THRESHOLD) {
                            chainData.time = Math.min(chainData.time, currentTime - this.mods.action.stage._time - (ABNORMALITY_TIMING_THRESHOLD + 1));
                        } else if (isPendingTimeActive) {
                            requestedSkillDetails.id = originalSkillId;
                            chainData.time = this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor);
                            chainData.type = 6;
                            chainData.code = 666;
                            delete chainData.chain;
                        } else {
                            shouldSkipChain = true;
                        }
                    }
                }
            }
            
            chainData.skillId = requestedSkillDetails.id;
            if (!shouldSkipChain) return chainData;
        }
        // Handle special skill type cases
        
        // Handle cancel for type 3 and 46 skills
        if (currentSkillId === requestedSkillId &&
            [3, 46].includes(currentSkillInfo.typeId) &&
            !press) {
            return {
                skillId: requestedSkillId,
                cancel: true,
                time: this.mods.ping.jitter - 1,
                type: currentSkillInfo.typeId === 46 ? 51 : 10
            };
        }
        
        // Handle drain type skills
        if (currentSkillId === requestedSkillId && skillInfo.type === 'drain') {
            return {
                skillId: skillInfo.nextSkill,
                chain: true,
                time: this.mods.ping.jitter - 1,
                type: 11
            };
        }
        
        // Handle lockon skills
        if (currentSkillDetails.skill === this.mods.utils.getSkillInfo(requestedSkillId).skill &&
            !!currentSkillInfo.lockon) {
            return {
                skillId: requestedSkillId,
                chain: true,
                time: this.mods.ping.jitter - 1,
                type: 36
            };
        }
        
        // Handle pending type 3 skills
        if (skillInfo.pendingType === 3 &&
            !(currentSkillInfo.typeId === 9 && currentSkillInfo.pendingType === 0) &&
            currentSkillDetails.skill !== requestedSkillDetails.skill) {
            return {
                skillId: requestedSkillId,
                super: true,
                time: this.mods.ping.jitter - 1,
                type: 6
            };
        }
        
        // Handle type-specific skill cases
        
        // Handle type 25 skills with press and pending type 1
        if (skillInfo.typeId === 25 &&
            press &&
            skillInfo.pendingType === 1 &&
            isPendingTimeActive) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 2
            };
        }
        
        // Handle type 31 skills with pending type 1 and in pending time
        if (skillInfo.typeId === 31 &&
            skillInfo.pendingType === 1 &&
            isPendingTimeActive) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 4
            };
        }
        
        // Process rear cancellation cases
        
        
        // Handle type 30 skills with pending type 0 and can rear cancel
        if (currentSkillInfo.typeId === 30 &&
            currentSkillInfo.pendingType === 0 &&
            canRearCancel) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 5
            };
        }
        
        // Handle type 30 skills with pending type 1
        if (currentSkillInfo.typeId === 30 &&
            skillInfo.pendingType === 1 &&
            isPendingTimeActive) {
            return {
                skillId: requestedSkillId,
                immediate: true,
                time: this._calculateTime(pendingStartTime, adjustedElapsedTime, speedFactor),
                type: 6,
                code: 6
            };
        }
        
        // Process dash and redirect cases
        
        // Check for dash redirect
        const isDashRedirect = currentSkillInfo.typeId === 29 &&
                              skillInfo.typeId !== 29 &&
                              (currentSkillInfo.dashRedirect === requestedSkillId ||
                               currentSkillInfo.dashRedirectFail === requestedSkillId);
        
        // Handle pending type 2 skills with complex conditions
        if (skillInfo.pendingType === 2 &&
            ![9, 28].includes(skillInfo.typeId) &&
            (currentSkillInfo.typeId > 36 ||
             ![3, 9, 21, 35, 41, 53].includes(currentSkillInfo.typeId) ||
             (currentSkillInfo.typeId === 9 && skillInfo.typeId !== 3)) &&
            (canRearCancel || isDashRedirect) &&
            !(currentSkillInfo.pendingType === 0 && skillInfo.typeId === 1)) {
            
            let calculatedTime = this._calculateTime(rearStartTime, adjustedElapsedTime, speedFactor);
            if (isDashRedirect) calculatedTime = -1;
            
            return {
                skillId: requestedSkillId,
                rear: true,
                code: 1,
                time: calculatedTime,
                type: 6
            };
        }
        
        // Handle pending type 2 skills with type 3 or 9
        if (skillInfo.pendingType === 2 &&
            [3, 9].includes(skillInfo.typeId) &&
            canRearCancel &&
            currentSkillInfo.typeId !== skillInfo.typeId &&
            !(this.mods.player.job === classes.LANCER &&
              currentSkillDetails.skill === 26 &&
              requestedSkillDetails.skill === 2)) {
            return {
                skillId: requestedSkillId,
                rear: true,
                code: 2,
                time: this._calculateTime(rearStartTime, adjustedElapsedTime, speedFactor),
                type: 6
            };
        }
        
        // Handle class-specific cases
        
        // Handle skills that can be cast during block
        if (skillInfo.canCastDuringBlock &&
            [3, 41, 46].includes(currentSkillInfo.typeId) &&
            canRearCancel &&
            [0, 1, 10].includes(this.mods.player.job)) {
            return {
                skillId: requestedSkillId,
                block: true,
                time: this._calculateTime(rearStartTime, adjustedElapsedTime, speedFactor),
                type: 6
            };
        }
        
        // Handle dash redirect
        if (isDashRedirect) {
            return {
                skillId: requestedSkillId,
                dash: true,
                time: -1,
                type: 6
            };
        }
        
        // Handle special skill cases
        
        // Handle lockon skills
        if (currentSkillInfo.lockon &&
            currentSkillInfo.typeId === 30 &&
            requestedSkillDetails.skill !== currentSkillDetails.skill) {
            return {
                skillId: requestedSkillId,
                lockon: true,
                time: this.mods.ping.jitter - 1,
                type: 6
            };
        }
        
        // Handle knockdown skills
        if (skillInfo.typeId === 27 &&
            (this.mods.datacenter.isKnockDown(currentSkillId) ||
             this.mods.action.stage.air ||
             this.mods.action.stage.airChain)) {
            return {
                skillId: requestedSkillId,
                kd: true,
                time: this.mods.ping.jitter - 1,
                type: 5
            };
        }
        
        // Handle future actions based on animation timing
        
        // Check animation length for future actions
        const totalAnimLength = this.getAnimationlengthForAllStages(currentSkillId);
        
        if (!currentSkillInfo.shouldNotUseLength &&
            currentSkillInfo.typeId !== 29 &&
            adjustedElapsedTime >= totalAnimLength &&
            this.isSupported(currentSkillId)) {
            
            const calculatedTime = this._calculateTime(totalAnimLength, adjustedElapsedTime, speedFactor);
            
            if (calculatedTime >= 0) {
                this.mods.log.debug("FUTURE", 'Future is bigger than 0. ' + calculatedTime);
            } else {
                return {
                    skillId: requestedSkillId,
                    noAction: true,
                    future: true,
                    time: calculatedTime - 5
                };
            }
        }
        
        // Default case - skill casting failed
        return {
            skillId: requestedSkillId,
            failed: true
        };
    };
    // Speed calculation methods

    /*
     * Calculates speed modifiers for a skill based on various factors
     * Handles abnormality effects, passives, and skill type specific adjustments
     * @param {number} skillId - The ID of the skill
     * @returns {Object} Speed modifier values for different aspects of the skill
     */
    getSpeed = skillId => {
        const skillInfo = this._getInfo(skillId);
        const appliedEffects = this.mods.effects.getAppliedEffects(skillId);
        
        let fixedSpeed = 1;
        let playerAspd = this.mods.player.aspd;
        
        const skillDetails = this.mods.utils.getSkillInfo(skillId);
        const isGunnerSpecialCase = this.mod.patch <= 93 &&
                                   this.mods.player.job === classes.GUNNER &&
                                   skillDetails.skill === 5 &&
                                   ![0, 10, 20].includes(skillDetails.sub);
        
        // Determine base speed values
        let realSpeed = skillInfo?.fixedSpeed || isGunnerSpecialCase || false ? 1 : this.mods.player.aspd;
        let stageSpeed = realSpeed;
        let projectileSpeed = realSpeed;
        
        // Special case for moving skills
        if (["shootingmovingskill", "movingSkill", "movingDefence"].includes(skillInfo?.type)) {
            realSpeed = this.mods.player.aspd;
        }
        
        const isMovingCharge = skillInfo?.type === "movingCharge";
        
        // Apply abnormality and passive speed modifiers
        if (!isMovingCharge) {
            stageSpeed *= appliedEffects.abnormSpeed * appliedEffects.passiveSpeed;
        }
        
        realSpeed *= appliedEffects.abnormSpeed * appliedEffects.passiveSpeed;
        projectileSpeed *= appliedEffects.abnormSpeed * appliedEffects.passiveSpeed;
        fixedSpeed *= appliedEffects.abnormSpeed * appliedEffects.passiveSpeed;
        playerAspd *= appliedEffects.abnormSpeed * appliedEffects.passiveSpeed;
        
        // Apply nocturnal effect
        realSpeed *= appliedEffects.noct;
        stageSpeed *= appliedEffects.noct;
        projectileSpeed *= appliedEffects.noct;
        fixedSpeed *= appliedEffects.noct;
        playerAspd *= appliedEffects.noct;
        
        // Apply charge speed modifiers
        if (isMovingCharge) {
            realSpeed += appliedEffects.chargeSpeed;
            projectileSpeed += appliedEffects.chargeSpeed;
            fixedSpeed += appliedEffects.chargeSpeed;
            playerAspd += appliedEffects.chargeSpeed;
            projectileSpeed *= skillInfo.timeRate;
        }
        
        // Special case for lockon skills
        if (skillInfo?.lockon) {
            stageSpeed = 1;
        }
        
        return {
            real: realSpeed,
            stage: stageSpeed,
            projectile: projectileSpeed,
            fixed: fixedSpeed,
            not_fixed: playerAspd
        };
    };

    /*
     * Checks if a skill is supported by the system
     * First checks hardcoded overrides, then config settings, then skill info
     */
    isSupported = skillId => {
        const hardcodedSupport = this.mods.hardcoded.isSupported(skillId);
        if (hardcodedSupport !== undefined) return hardcodedSupport;
        
        const skillDetails = this.mods.utils.getSkillInfo(skillId);
        
        // Check if skill is explicitly disabled in config
        if (this?.info?.loadedSkillConfig?.[skillDetails.skill]?.[skillDetails.sub] === false) {
            return false;
        }
        
        // Check if skill info exists
        return !!this._getInfo(skillId);
    };
    
    // Skill property accessor methods
    
    /*
     * Gets applied effects for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {Object} The applied effects for the skill
     */
    getAppliedEffects = skillId => {
        return this._getInfo(skillId)?.appliedEffects || {};
    };
    
    /*
     * Checks if a skill keeps moving charge
     * @param {number} skillId - The ID of the skill
     * @returns {boolean|undefined} Whether the skill keeps moving charge
     */
    getKeepMovingCharge = skillId => {
        return this._getInfo(skillId)?.keepMovingCharge;
    };
    
    /*
     * Gets kept moving charge for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {number|undefined} The kept moving charge value
     */
    getKeptMovingCharge = skillId => {
        return this._getInfo(skillId)?.keptMovingCharge;
    };
    
    /*
     * Gets categories for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {Array} The categories for the skill
     */
    getCategories = skillId => {
        return this._getInfo(skillId)?.categories || [];
    };
    
    /*
     * Gets the type of a skill
     * @param {number} skillId - The ID of the skill
     * @returns {string|undefined} The type of the skill
     */
    getType = skillId => {
        return this._getInfo(skillId)?.type;
    };
    
    /*
     * Gets the type ID of a skill
     * @param {number} skillId - The ID of the skill
     * @returns {number|undefined} The type ID of the skill
     */
    getTypeId = skillId => {
        return this._getInfo(skillId)?.typeId;
    };
    
    /*
     * Gets arrow chain data for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {number|undefined} The arrow chain sub ID
     */
    getArrowChain = skillId => {
        return this._getInfo(skillId)?.arrowChain;
    };
    /*
     * Gets the charge skill ID for a specific stage
     * @param {number} skillId - The ID of the skill
     * @param {number} stage - The stage of the skill
     * @returns {number|undefined} The charge skill ID for the specified stage
     */
    getChargeSkillId = (skillId, stage) => {
        return this._getInfo(skillId)?.animLength?.[stage]?.[1];
    };
    
    /*
     * Gets lockon data for a skill
     * @param {number} skillId - The ID of the skill
     * @returns {Object|undefined} The lockon data for the skill
     */
    getLockonData = skillId => {
        return this._getInfo(skillId)?.lockon;
    };
    
    // Skill timing and delay methods
    
    /*
     * Gets delay time for a skill based on various conditions
     * Handles special cases for different skill types and classes
     * @param {number} skillId - The ID of the skill
     * @param {Object} options - Options for delay calculation
     * @param {boolean} options.byGrant - Whether the skill is being cast by a grant
     * @param {boolean} options.press - Whether the skill is being cast by a press
     * @returns {number} The delay time in milliseconds
     */
    getSkillDelayTime = (skillId, {
        byGrant,
        press
    }) => {
        // Check for hardcoded delay time first
        const hardcodedDelay = this.mods.hardcoded.getSkillDelayTime(skillId, {
            byGrant,
            press
        });
        if (hardcodedDelay) return hardcodedDelay;
        
        const skillInfo = this._getInfo(skillId);
        
        // Type 29 (dash) skills have standard delay
        if (skillInfo.typeId === 29) return SMALL_TIMING_THRESHOLD;
        
        // Type 25 skills with press have standard delay
        if (press && skillInfo.typeId === 25) return SMALL_TIMING_THRESHOLD;
        
        // Type 30 skills with lockon have standard delay
        if (skillInfo.typeId === 30 && !!skillInfo.lockon) return SMALL_TIMING_THRESHOLD;
        
        // Special case for Lancer with type 3 or 46 skills and press
        if (this.mods.player.job === classes.LANCER &&
            [3, 46].includes(skillInfo.typeId) &&
            press) return 5;
        
        // Default case
        return 0;
    };
    // Action execution methods
    
    /*
     * Calculates the destination for a skill action based on various parameters
     * Handles different destination types and distance calculations
     * @param {Object} params - Parameters for destination calculation
     * @param {number} params.skillId - The ID of the skill
     * @param {number} params.stage - The stage of the skill
     * @param {Object} params.effects - The effects to apply
     * @param {Object} params.loc - The current location
     * @param {number} params.w - The current direction
     * @returns {Object} The calculated destination coordinates
     */
    getActionDest = ({
        skillId,
        stage,
        effects,
        loc,
        w
    }) => {
        const skillInfo = this._getInfo(skillId);
        const lastInstanceSkill = this.mods.last.packet("C_START_INSTANCE_SKILL");
        
        // Use current location if useDest is 1
        if (skillInfo.useDest[stage] === 1) return loc;
        
        // Use endpoint from last instance skill if available and useDest is 2
        if (lastInstanceSkill?.skill?.id === skillId &&
            lastInstanceSkill.endpoints.length &&
            skillInfo.useDest[stage] === 2) {
            return lastInstanceSkill.endpoints[0];
        }
        
        // Get distance for this stage
        const distance = skillInfo?.distance?.[stage] || 0;
        
        // Return zero coordinates if no distance or useDest is 0
        if (distance === 0 || skillInfo.useDest[stage] === 0) {
            return {
                x: 0,
                y: 0,
                z: 0
            };
        }
        
        // Apply direction modifier if any
        const directionModifier = skillInfo?.directionModifier?.[stage] || 0;
        
        // Calculate destination using distance and direction
        return this.mods.utils.applyDistance(loc, w + directionModifier, distance * effects.dist);
    };
    /*
     * Gets animation sequence data for a skill action
     * Handles special cases for Archer class and movement-based animations
     * @param {number} skillId - The ID of the skill
     * @param {number} stage - The stage of the skill
     * @param {Object} effects - The effects to apply
     * @returns {Array} The animation sequence data
     */
    getActionAnimSeq = (skillId, stage, effects) => {
        const skillInfo = this._getInfo(skillId);
        
        // Special case for Archer class with specific skills
        if (this.mods.player.job === classes.ARCHER &&
            (this.mod.patch >= 114 ? [340101, 340102] : [340100]).includes(skillId)) {
            effects.dist = 0;
        }
        
        // Check if skill should be held when not moving
        const shouldHoldIfNotMoving = skillInfo?.holdIfNotMoving &&
                                     !this.mods.last.packet('C_START_SKILL')?.moving;
        
        // Return empty array for distance 1 when not holding
        if (effects.dist === 1 && !shouldHoldIfNotMoving) return [];
        
        // Deep clone the animation sequence data
        const animSeq = JSON.parse(JSON.stringify(skillInfo?.animSeq?.[stage] || []));
        
        // Adjust distances based on effects and movement state
        for (const anim of animSeq) {
            anim.distance *= effects.dist * (shouldHoldIfNotMoving ? 0 : 1);
        }
        
        return animSeq;
    };
    /*
     * Sends an action stage packet to the server
     * Handles both continuation of existing actions and new actions
     * @param {Object} params - Parameters for the action stage
     * @param {number} params.skillId - The ID of the skill
     * @param {boolean} params.continuation - Whether this is a continuation of an existing action
     * @param {number} params.stage - The stage of the skill (optional for new actions)
     */
    sendActionStage = ({
        skillId,
        continuation,
        stage
    }) => {
        const { player } = this.mods;
        let speed, actionId, effects;
        
        // Handle continuation of existing action or new action
        if (continuation) {
            // Continue existing action with next stage
            stage = this.mods.action.stage.stage + 1;
            speed = this.mods.action.speed;
            actionId = this.mods.action.stage.id;
            effects = this.mods.action.effects;
        } else {
            // Start new action
            stage = stage || 0;
            speed = this.getSpeed(skillId);
            this.mods.log.debug("SPEED",
                `R:${speed.real} S:${speed.stage} P:${speed.projectile} F:${speed.fixed} NF:${speed.not_fixed}`);
            actionId = ++this.info.skillIdCounter;
            effects = this.mods.effects.getAppliedEffects(skillId);
        }
        
        // Calculate effect scale
        let effectScale = effects.effectScale;
        
        // Special case for job 7 (likely Sorcerer) with specific skills
        if (this.mods.player.job === 7 &&
            [25, 27, 33, 34].includes(this.mods.utils.getSkillInfo(skillId).skill)) {
            
            // Apply skill polishing effects
            for (let polishId = 16000021; polishId <= 16000080; polishId++) {
                if (!this.mods.effects.getSkillPolishing(polishId)) continue;
                effectScale += (polishId % 16000020) / 100;
            }
        }
        
        // Get position data
        const w = stage ? this.mods.position.w : this.mods.last.startSkill.w;
        const loc = stage ? this.mods.position.loc : this.mods.last.startSkill.loc || this.mods.position.loc;
        
        // Send action stage packet
        this.mod.send(...this.mods.packet.get_all("S_ACTION_STAGE"), {
            gameId: player.gameId,
            loc: loc,
            w: w,
            templateId: player.templateId,
            skill: skillId,
            stage: stage,
            speed: speed.stage,
            projectileSpeed: speed.projectile,
            id: actionId,
            effectScale: effectScale,
            moving: false,
            dest: this.getActionDest({
                skillId: skillId,
                stage: stage,
                effects: effects,
                loc: loc,
                w: w
            }),
            target: 0n,
            animSeq: this.getActionAnimSeq(skillId, stage, effects)
        });
    };
    /*
     * Sends an action end packet to the server
     * Optionally sends an instant move packet for teleportation effects
     * @param {number} skillId - The ID of the skill
     * @param {number} type - The type of action end
     * @param {Object} loc - The location (optional)
     * @param {boolean} instantMove - Whether to send an instant move packet
     */
    sendActionEnd = (skillId, type, loc, instantMove) => {
        const { player } = this.mods;
        
        // Create packet data
        const packetData = {
            gameId: player.gameId,
            loc: loc || this.mods.position.loc,
            w: this.mods.position.w,
            templateId: player.templateId,
            skill: skillId,
            type: type,
            id: this.mods.action.stage.id
        };
        
        // Send action end packet
        this.mod.send(...this.mods.packet.get_all("S_ACTION_END"), {
            ...packetData,
            loc: this.mods.position.loc
        });
        
        // Optionally send instant move packet
        if (instantMove) {
            this.mod.send(...this.mods.packet.get_all("S_INSTANT_MOVE"), packetData);
        }
    };
    /*
     * Sends a connect skill arrow packet to the server
     * Used for skills that can be chained with arrow indicators
     * @param {number} skillId - The ID of the skill
     * @param {boolean} skipCheck - Whether to skip validation checks
     * @returns {boolean} Whether the arrow was sent successfully
     */
    sendConnectSkillArrow = (skillId, skipCheck) => {
        // Skip if check is requested
        if (skipCheck) return false;
        
        // Get arrow chain data
        const arrowChainSubId = this.getArrowChain(skillId);
        if (arrowChainSubId === null || arrowChainSubId === undefined) return false;
        
        // Verify player is in action
        if (!this.mods.action.inAction) {
            this.mods.log.debug("SKILL ARROW", "didn't send due to not being in a skill");
            return false;
        }
        
        // Get skill details and update with arrow chain
        const skillDetails = this.mods.utils.getSkillInfo(skillId);
        skillDetails.sub = arrowChainSubId;
        
        // Store arrow data for future reference
        this.info.connectSkillArrow[skillDetails.id] = {
            skillId: skillId,
            time: Date.now() + ARROW_TIMEOUT
        };
        
        // Send connect skill arrow packet
        this.mod.send(...this.mods.packet.get_all("S_CONNECT_SKILL_ARROW"), {
            templateId: this.mods.player.templateId,
            unk1: 0,
            skill: skillDetails.id,
            unk2: 1
        });
        
        return true;
    };
    // Skill timing and cancellation methods
    
    /*
     * Checks if the current time is within the pending time window
     * Used for determining if skills can be chained or canceled
     * @param {number} elapsedTime - The elapsed time since action start
     * @param {Object} cancels - The cancel timing data
     * @returns {boolean} Whether the current time is within the pending window
     */
    isInPendingTime = (elapsedTime, cancels = {}) => {
        const {
            pendingStartTime = -1,
            pendingEndTime = -1
        } = cancels;
        
        // No pending time if start time is not defined
        if (pendingStartTime === -1) return false;
        
        // Check if elapsed time is after start time
        if (elapsedTime < pendingStartTime) return false;
        
        // Check if elapsed time is before end time (if defined)
        if (pendingEndTime !== -1 && elapsedTime > pendingEndTime) return false;
        
        return true;
    };
    
    /*
     * Checks if a skill can be front-canceled at the current time
     * @param {number} elapsedTime - The elapsed time since action start
     * @param {Object} cancels - The cancel timing data
     * @returns {boolean} Whether the skill can be front-canceled
     */
    canFrontCancel = (elapsedTime, cancels = {}) => {
        const { front = -1 } = cancels;
        
        // No front cancel if front time is not defined
        if (front === -1) return false;
        
        // Check if elapsed time is after front time
        if (elapsedTime < front) return false;
        
        return true;
    };
    
    /*
     * Checks if a skill can be rear-canceled at the current time
     * @param {number} elapsedTime - The elapsed time since action start
     * @param {Object} cancels - The cancel timing data
     * @returns {boolean} Whether the skill can be rear-canceled
     */
    canRearCancel = (elapsedTime, cancels = {}) => {
        const {
            rearStartTime = -1,
            rearEndTime = -1
        } = cancels;
        
        // No rear cancel if start time is not defined
        if (rearStartTime === -1) return false;
        
        // Check if elapsed time is after start time
        if (elapsedTime < rearStartTime) return false;
        
        // Check if elapsed time is before end time (if defined)
        if (rearEndTime !== -1 && elapsedTime > rearEndTime) return false;
        
        return true;
    };
    
    /*
     * Checks if a skill can chain into another skill
     * @param {number} currentSkillId - The ID of the current skill
     * @param {number} requestedSkillId - The ID of the requested skill
     * @returns {boolean} Whether the current skill can chain into the requested skill
     */
    isChain = (currentSkillId, requestedSkillId) => {
        const requestedSkillDetails = this.mods.utils.getSkillInfo(requestedSkillId);
        const currentSkillInfo = this._getInfo(currentSkillId);
        
        return currentSkillInfo?.chains?.[requestedSkillDetails.skill] !== undefined;
    };
    
    /*
     * Gets direction modifier for a skill at a specific stage
     * @param {number} skillId - The ID of the skill
     * @param {number} stage - The stage of the skill
     * @returns {number} The direction modifier value
     */
    getDirectionModifier = (skillId, stage) => {
        return this._getInfo(skillId)?.directionModifier?.[stage] || 0;
    };
    
    /*
     * Gets action stage delay for a skill
     * Special case for Slayer class with specific skills
     * @param {number} skillId - The ID of the skill
     * @returns {number} The action stage delay in milliseconds
     */
    getActionStageDelay = skillId => {
        // Special delay for Slayer class with specific skills
        const SLAYER_SKILL_DELAY = 30;
        if (this.mods.player.job === classes.SLAYER &&
            [170100, 170200, 170300].includes(skillId)) return SLAYER_SKILL_DELAY;
        
        return 0;
    };
    // Core utility methods
    
    /*
     * Gets skill information from the skill data cache
     * @private
     * @param {number} skillId - The ID of the skill
     * @returns {Object|undefined} The skill information object
     */
    /*
     * Calculates timing parameters for skill execution
     * @private
     * @param {Object} currentSkillInfo - The current skill info
     * @returns {Object} Timing parameters for skill execution
     */
    _calculateTimingParams = (currentSkillInfo) => {
        const {
            rearStartTime = -1,
            pendingStartTime = -1,
            front = -1
        } = currentSkillInfo.cancels || {};
        
        const wiggleRoom = this._getWiggleRoom();
        const speedFactor = this?.mods?.action?.speed?.real || 1;
        const adjustedElapsedTime = (Date.now() - this.mods.action.stage._time) * speedFactor + wiggleRoom;
        const isPendingTimeActive = this.isInPendingTime(adjustedElapsedTime, currentSkillInfo.cancels);
        const canRearCancel = this.canRearCancel(adjustedElapsedTime, currentSkillInfo.cancels);
        
        return {
            rearStartTime,
            pendingStartTime,
            front,
            wiggleRoom,
            speedFactor,
            adjustedElapsedTime,
            isPendingTimeActive,
            canRearCancel
        };
    };
    
    /*
     * Processes abnormality redirects for skills
     * @private
     * @param {number} skillId - The skill ID to process
     * @param {Object} skillInfo - The skill info object
     * @returns {Object} The processed skill data with redirects applied
     */
    _processAbnormalityRedirects = (skillId, skillInfo) => {
        let hasAbnormality = false;
        let isRedirectComplete;
        let currentSkillId = skillId;
        let currentSkillInfo = skillInfo;
        
        do {
            isRedirectComplete = true;
            for (const {
                id: abnormalityId,
                skill: redirectSkillId
            } of currentSkillInfo?.abnormalityRedirect || []) {
                const abnormalityData = this.mods.effects.getAbnormality(abnormalityId);
                if (!abnormalityData) continue;
                
                const redirectSkillInfo = this._getInfo(redirectSkillId);
                if (!redirectSkillInfo) continue;
                
                isRedirectComplete = false;
                
                // If the redirect is too far, return for recursive call
                if (Math.abs(currentSkillId - redirectSkillId) > LARGE_SKILL_ID_DIFFERENCE) {
                    return { recursiveRedirect: true, skillId: redirectSkillId };
                }
                
                hasAbnormality = abnormalityData;
                currentSkillId = redirectSkillId;
                currentSkillInfo = redirectSkillInfo;
                break;
            }
        } while (!isRedirectComplete);
        
        // Special case for Ninja and Berserker with abnormality chains
        if ([classes.NINJA, classes.BERSERKER].includes(this.mods.player.job) &&
            hasAbnormality &&
            currentSkillInfo.typeId === 28) {
            this.mods.log.debug("NEW-SKILL-DATA", "Removing abnormality chain (28): " + currentSkillId);
            hasAbnormality = false;
        }
        
        return { skillId: currentSkillId, skillInfo: currentSkillInfo, hasAbnormality };
    };
    
    /*
     * Handles skill arrow connections
     * @private
     * @param {number} originalSkillId - The original skill ID
     * @param {boolean} byGrant - Whether the skill is being cast by a grant
     * @returns {Object|null} The skill data for arrow connection or null if not applicable
     */
    _handleSkillArrowConnections = (originalSkillId, byGrant) => {
        if (!byGrant || !this.info.connectSkillArrow[originalSkillId]) return null;
        
        const arrowData = this.info.connectSkillArrow[originalSkillId];
        const isInSameSkill = this.mods.action.inAction &&
                             this.mods.action.stage?.skill?.id === arrowData.skillId;
        const isArrowValid = arrowData.time > Date.now() && !isInSameSkill;
        
        if (isArrowValid) {
            return {
                skillId: arrowData.skillId,
                byGrant: true,
                time: this.mods.ping.jitter - 1,
                noAction: true
            };
        }
        
        return null;
    };
    
    _getInfo = skillId => {
        return this.info.skillData[skillId];
    };
    
    /*
     * Loads skill data for the current player class
     * @param {Object} savedState - Optional saved state to restore
     */
    loaded = savedState => {
        // Restore state if provided
        if (savedState) {
            this.info.skillIdCounter = savedState.counter || 0;
            
            // Restore event handlers
            for (const eventName in savedState.events) {
                if (Array.isArray(savedState.events[eventName])) {
                    for (const handler of savedState.events[eventName]) {
                        this.on(eventName, handler);
                    }
                } else {
                    this.on(eventName, savedState.events[eventName]);
                }
            }
        }
        
        // Get player class information
        const {
            class: playerClass,
            gender,
            race
        } = this.mods.datacenter.getUserData(this.mods.player.templateId);
        
        let fileContent = null;
        
        // Try to load skill data file
        try {
            fileContent = this.mods.library.readFile(__dirname,
                `../../skills/${gender}/${race}/${playerClass}.json`);
        } catch (error) {
            this.mods.log.debug("LOADING", "No support for the class: " + this.mods.player.templateId);
            this.info.skillData = {};
            this.info.skillSupportedCount = 0;
            this.info.loadedSkillConfig = {};
            return;
        }
        
        // Parse skill data
        try {
            this.info.skillData = JSON.parse(fileContent);
            this.info.skillSupportedCount = Object.keys(this.info.skillData).length;
            this.info.loadedSkillConfig = SKILL_CONFIG[playerClass.toLowerCase()];
            
            // Set global RE flag
            if (!global.RE) global.RE = {};
            global.RE[this.mods.player.templateId] = true;
            // Log the loaded race and class
            console.log(`Rival loaded skill data for a ${race} ${playerClass}.`);
            this.emit('loaded');
        } catch (error) {
            this.mods.log.error("LOADING", 'Failed to parse skill data', error);
            this.info.skillData = {};
            this.info.skillSupportedCount = 0;
            this.info.loadedSkillConfig = {};
        }
    };
    
    /*
     * Cleans up resources and returns state for persistence
     * @returns {Object} The state to persist
     */
    destructor = () => {
        if (global.RE) delete global.RE;
        
        // Clear the animation length cache
        this._animLengthCache.clear();
        
        return {
            counter: this.info.skillIdCounter,
            events: this._events
        };
    };
}
// Export the Skills class
module.exports = Skills;