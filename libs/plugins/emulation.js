/*
 * Rival Mod - Skill Emulation System
 * 
 * emulation.js handles skill execution timing, validation, and synchronization
 * between client and server actions. It ensures skills are executed with proper
 * timing based on network conditions and game state, while maintaining accurate
 * synchronization between client and server.
 */
const hooks = require("../enums/hooks");
const classes = require("../enums/classes");
/*
 * SkillEmulationManager module
 *
 * Manages skill execution by handling timing, validation, and synchronization
 * between client and server. This module intercepts skill-related packets,
 * applies appropriate delays based on ping and jitter, and ensures proper
 * skill execution flow. It also provides retry mechanisms for failed skill
 * attempts and tracks statistics for performance monitoring.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 */
module.exports = function SkillEmulationManager(mod, mods) {
    // State tracking variables
    let expectedSkillId = null,        // Expected skill ID for validation
        expectedEndType = null,        // Expected end type for validation
        skillTimeTracker = {
            arrived: 0,                // Time when skill packet arrived
            estimate: 0,               // Estimated time when skill will execute
            counter: 0                 // Counter for tracking queued skills
        },
        blockSendToServer = false,     // Flag to prevent recursive packet sending
        actionStageTimeout = null,     // Timeout for next action stage
        lastMoveLocation = null,       // Last player movement location
        connectSkillArrowTimeout = 0,  // Timeout for connect skill arrow packets
        grantSkillTimeout = 0,         // Timeout for grant skill packets
        isChargingSkill = false,       // Flag for tracking charging skills
        lastSkillString = null,        // String representation of last skill packet
        pendingStartSkill = null;      // Pending skill start packet
    
    // Constants
    const SKILL_RETRY_MS = 2;          // Base retry delay in milliseconds
    const ABNORMALITY_MOVING_CHARGE = 327; // Abnormality category type value for moving charge skills
    const MOVING_CHARGE_DELAY = 25;    // Delay for moving charge skills in milliseconds
    const POSITION_CORRECTION_THRESHOLD = 100; // Distance threshold for position correction
    const SMALL_MOVEMENT_THRESHOLD = 35; // Threshold for ignoring small movements
    const MAX_SKILL_HISTORY = 500;     // Maximum number of skills to keep in history (reduced from 2000)
    
    // Error codes
    const ERROR_CODES = {
        EXCLUDED: [-11, -3737, -17, -999, -12], // Error codes that prevent skill packet sending (-12 for cooldown)
        SPECIAL_CASE: -4,                  // Special case error code
        FAILURE_THRESHOLD: -4              // Threshold for skill cast failures
    };
    
    // Action end types
    const ACTION_END_TYPES = {
        NORMAL: 0,
        CANCEL: 4,
        REACTION: 9,
        ARCHER_RAPID_FIRE: 25,
        DASH: 39,
        INTERRUPT: 60,
        DEATH: 699
    };
    
    // Valid end types for server action end packets
    const VALID_END_TYPES = [0, 1, 2, 3, 4, 5, 6, 10, 11, 34, 36, 51];
    
    // Skill tracking for statistics
    let skillHistory = [];             // History of skill execution statistics
    let registeredHooks = [];          // Track registered hooks for cleanup
    
    // Add command to display skill timing statistics
    mods.command.add("tracker", () => {
        let totalDelay = 0,
            totalJitter = 0,
            totalExcessTime = 0,
            excessTimeCount = 0;
            
        for (const entry of skillHistory) {
            totalDelay += entry.delay;
            totalJitter += entry.jitter;
            
            if (entry.excessTime !== undefined) {
                excessTimeCount++;
                totalExcessTime += Math.max(0, entry.excessTime);
            }
        }
        
        const skillCount = skillHistory.length,
            averageJitter = mods.utils.round(totalJitter / skillCount),
            averageDelay = mods.utils.round(totalDelay / skillCount),
            averageChainDelay = mods.utils.round(totalExcessTime / excessTimeCount);
            
        mods.command.message("\nAfter " + skillCount + " skills.\nAverage jitter: " + averageJitter +
                           "\nAverage delay: " + averageDelay + "\nAverage chain delay: " + averageChainDelay);
    });
    
    // Validation hooks to verify skill IDs and end types match expectations
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        
        if (expectedSkillId !== event.skill.id) {
            mods.log.debug("EMULATION-VALIDATION", "NOT CORRECT IDS");
        }
    });
    
    mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.READ_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (!event.type) return;
        
        if (expectedEndType !== event.type) {
            mods.log.debug("EMULATION-VALIDATION", "NOT CORRECT TYPE");
        }
    });
    
    /*
     * Creates a string representation of a skill packet for comparison
     * Removes position-related properties that change frequently
     * 
     * @param {string} packetName - The name of the packet
     * @param {Object} packetData - The packet data
     * @returns {string} String representation of the packet for comparison
     */
    const createSkillString = (packetName, packetData) => {
        const cleanedData = {
            name: packetName,
            ...packetData
        };
        
        // Remove position-related properties
        if (cleanedData.w) delete cleanedData.w;
        if (cleanedData.loc) delete cleanedData.loc;
        if (cleanedData.dest) delete cleanedData.dest;
        
        return mods.library.jsonStringify(cleanedData);
    };
    
    /*
     * Handles skill action stages and transitions between stages
     * 
     * @param {number} skillId - The skill ID
     * @param {boolean} isContinuation - Whether this is a continuation of a previous stage
     * @param {number} stageNum - The stage number
     */
    const sendActionStage = (skillId, isContinuation, stageNum) => {
        mod.clearTimeout(actionStageTimeout);
        
        if (isContinuation) {
            if (mods.action.stage.id !== mods.skills.counter) return;
            if (!mods.action.inAction) return;
            
            const totalStages = mods.skills.getStageCount(skillId),
                  isLastStage = totalStages - 1 <= mods.action.stage.stage,
                  skillType = mods.skills.getType(skillId);
                  
            if (isLastStage) {
                if (skillType === "movingCharge") return;
                
                const endType = skillType === "dash" ? 39 : 0;
                expectedEndType = endType;
                mods.skills.sendActionEnd(mods.action.stage.skill.id, endType, lastMoveLocation, !!lastMoveLocation);
                return;
            }
        }
        
        mods.skills.sendActionStage({
            skillId: skillId,
            continuation: isContinuation,
            stage: stageNum
        });
        
        lastMoveLocation = null;
        
        const animationLength = mods.skills.getAnimationLength(skillId, mods.action.stage.stage, mods.action.speed);
        
        mods.log.debug('EMULATION', 'Length for skill: ' + skillId + '(' + mods.action.stage.stage + ") is " + animationLength);
        
        if (animationLength !== -1) {
            mod.clearTimeout(actionStageTimeout);
            actionStageTimeout = mod.setTimeout(sendActionStage, animationLength, skillId, true);
        }
    };
    
    // Flag to track skill ID increment for certain skills
    let shouldIncrementSkillId = false;
    
    /*
     * Processes and executes a skill
     * Handles timing, validation, and server communication
     * 
     * @param {string} packetName - The name of the packet
     * @param {Object} skillEvent - The skill event data
     * @param {Object} prevSkillData - Previous skill data for comparison
     * @param {number} prevCanCastResult - Previous cast result for comparison
     */
    const executeSkill = async (packetName, skillEvent, prevSkillData, prevCanCastResult) => {
        // Send any pending skill start packet
        if (pendingStartSkill) {
            blockSendToServer = true;
            mod.send(...pendingStartSkill);
            blockSendToServer = false;
            pendingStartSkill = null;
        }
        
        const isContinuation = skillEvent.continue,
              isPressSkill = skillEvent.press,
              hasUnknown3 = skillEvent.unkn3,
              newSkillData = mods.skills.getNewSkillData(skillEvent.skill.id, {
                  byGrant: isContinuation,
                  press: isPressSkill
              });
              
        // Handle skill ID increment for certain skills
        if (shouldIncrementSkillId) {
            newSkillData.skillId++;
        }
        shouldIncrementSkillId = false;
        
        // Check if skill data has changed
        if (newSkillData.type !== prevSkillData.type ||
            newSkillData.skillId !== prevSkillData.skillId ||
            newSkillData.failed !== prevSkillData.failed) {
            
            mods.log.debug("EMULATION", "newSkillData changed value:", newSkillData);
            
            // Handle future-time failures
            if (newSkillData.failed !== prevSkillData.failed && (newSkillData.time || 0) < 0) {
                mods.log.debug('EMULATION', "Cancelling skill execution due to time being in the future");
                mod.send(...mods.packet.get_all("S_CANNOT_START_SKILL"), {
                    skill: skillEvent.skill
                });
                
                blockSendToServer = true;
                mod.send(...mods.packet.get_all(packetName), skillEvent);
                blockSendToServer = false;
                return;
            }
            
            // Calculate appropriate delay for skill execution
            let skillDelay = mods.ping.jitter + mods.settings.info.delay;
            skillDelay += mods.skills.getSkillDelayTime(newSkillData.skillId, {
                byGrant: isContinuation,
                press: isPressSkill
            });
            
            if (newSkillData.time) skillDelay -= newSkillData.time;
            
            if (!mods.action.inAction) {
                skillDelay -= Date.now() - (mods?.action?.end?._time || 0);
            }
            
            skillDelay = Math.floor(skillDelay + SKILL_RETRY_MS);
            
            if (skillDelay > 0) {
                await mods.utils.sleep(skillDelay);
            }
        }
        
        // Check if the skill can be cast
        const canCastResult = mods.skills.canCast(newSkillData, {
            byGrant: isContinuation,
            press: isPressSkill,
            originalSkillId: skillEvent.skill.id
        });
        
        // Log if the cast result has changed
        if (canCastResult !== prevCanCastResult) {
            mods.log.debug("EMULATION", "cast changed value: " + canCastResult);
        }
        
        // Send the skill packet to the server if not in the excluded error codes
        if (!ERROR_CODES.EXCLUDED.includes(canCastResult)) {
            blockSendToServer = true;
            mod.send(...mods.packet.get_all(packetName), skillEvent);
            blockSendToServer = false;
        }
        
        // Skip animation for skills with no animation length or on cooldown
        if (mods.skills.getRawAnimationLength(newSkillData.skillId) === 0 || canCastResult === -12) {
            // Enhanced logging for multi-stage skill animation debugging
            const skillDetails = mods.utils.getSkillInfo(newSkillData.skillId);
            const groupId = `${Math.floor(skillDetails.skill / 10000)}-0`;
            const isMultiStageSkill = groupId && mods.skills._getInfo(newSkillData.skillId)?.nextSkill;
            
            mods.log.debug("EMULATION", `Not sending animation for ${newSkillData.skillId} (${canCastResult === -12 ? "on cooldown" : "no animation"})`);
            mods.log.debug("COOLDOWN_DEBUG", `Animation blocked - Multi-stage: ${isMultiStageSkill}, Group: ${groupId}`);
            mods.log.debug("COOLDOWN_DEBUG", `Animation timing: ${Date.now()}, Skill execution flow: executeSkill -> animation check`);
            return;
        }
        
        // Handle skill cast failures
        if (canCastResult < ERROR_CODES.FAILURE_THRESHOLD) {
            mod.send(...mods.packet.get_all('S_CANNOT_START_SKILL'), {
                skill: skillEvent.skill
            });
            return;
        }
        
        // Special case for error code -4
        if (canCastResult === ERROR_CODES.SPECIAL_CASE) return;
        
        // Extract skill properties
        const {
            skillId,
            cancel,
            charge,
            type,
            chain
        } = newSkillData;
        
        // Check if this is a moving charge skill with specific abnormality
        const isMovingChargeWithAbnormality = mods.skills.getType(skillId) === "movingCharge" &&
            mods.effects.hasAbnormalityWithCategoryTypeValue(
                mods.skills.getCategories(skillId),
                ABNORMALITY_MOVING_CHARGE
            );
        
        // Calculate stage for moving charge skills
        const chargeStage = isMovingChargeWithAbnormality ? 
                           mods.skills.getStageCount(skillId) - 1 : 0;
        
        // Handle skill cancellation
        if (cancel) {
            mods.skills.sendActionEnd(mods.action.stage.skill.id, type);
            return;
        }
        
        // Handle connected skills (arrows)
        if (mods.skills.sendConnectSkillArrow(skillId, isContinuation)) {
            connectSkillArrowTimeout = Date.now() + mods.utils.getPacketBuffer();
            
            if (mods.action.inAction && type) {
                mods.skills.sendActionEnd(mods.action.stage.skill.id, type);
            }
            return;
        }
        
        // Handle charge skills
        if ((charge || isMovingChargeWithAbnormality) && !isContinuation) {
            mod.setTimeout(() => {
                // Handle unknown3 flag
                if (hasUnknown3) {
                    shouldIncrementSkillId = true;
                }
                
                // Set timeout for grant skill
                grantSkillTimeout = Date.now() + mods.utils.getPacketBuffer();
                
                // Send grant skill packet
                mod.send(...mods.packet.get_all('S_GRANT_SKILL'), {
                    skill: isMovingChargeWithAbnormality ? 
                          mods.skills.getChargeSkillId(skillId, chargeStage) : 
                          skillId
                });
                
                // Store the skill start packet for later
                pendingStartSkill = [...mods.packet.get_all(packetName), skillEvent];
                
                // Set charging flag for moving charge skills
                if (isMovingChargeWithAbnormality) {
                    isChargingSkill = true;
                }
            }, isMovingChargeWithAbnormality ? MOVING_CHARGE_DELAY : 0);
            
            // Return early for non-moving charge skills
            if (!isMovingChargeWithAbnormality) return;
        }
        
        // Get the current skill type
        const currentSkillType = mods.skills.getType(mods?.action?.stage?.skill?.id);
        
        // End the current action if needed
        if (mods.action.inAction && type && currentSkillType !== "movingCharge") {
            mods.skills.sendActionEnd(
                mods.action.stage.skill.id, 
                isMovingChargeWithAbnormality ? 6 : type
            );
        }
        
        // Get and apply action stage delay
        const actionStageDelay = mods.skills.getActionStageDelay(skillId);
        
        if (actionStageDelay) {
            mod.setTimeout(sendActionStage, actionStageDelay, skillId, false, chargeStage);
        } else {
            sendActionStage(skillId, false, chargeStage);
        }
        
        // Skill retry logic
        const retryCount = mods.skills.getRetryCount(skillId),
              retryDelay = mods.hardcoded.getRetryDelay(skillId),
              allowFutureRetry = mods.hardcoded.getAllowThroughFutureRetry(skillId),
              initialServerStageId = mods?.action?.serverStage?.id,
              initialStageId = mods?.action?.stage?.id,
              startTime = Date.now();
              
        // Attempt retries if needed
        for (let retryIndex = 0; retryIndex < retryCount; retryIndex++) {
            await mods.utils.sleep(retryDelay);
            
            // Check if server changed the skill
            if (mods?.action?.serverStage?.id !== initialServerStageId) {
                const timeSinceServerChange = mods.action.serverStage._time - startTime;
                
                if (timeSinceServerChange >= mods.ping.ping) {
                    mods.log.debug('RETRY', "cancelled retry because server changed skill");
                    break;
                }
            }
            
            // Check if client changed the skill
            if (mods?.action?.stage?.id !== initialStageId) {
                mods.log.debug("RETRY", 'cancelled retry because my skill changed');
                break;
            }
            
            // Get updated skill data for retry
            const retrySkillData = mods.skills.getNewSkillData(skillEvent.skill.id, {
                    byGrant: isContinuation,
                    press: isPressSkill
                }),
                retryCanCast = mods.skills.canCast(retrySkillData, {
                    byGrant: isContinuation,
                    press: isPressSkill,
                    originalSkillId: skillEvent.skill.id
                });
                
            // Check if retry should be allowed
            if (!allowFutureRetry && 
                retryCanCast >= -2 && 
                !(retrySkillData.future && retrySkillData.time <= -25)) {
                
                mods.log.debug("RETRY", "cast allowed through " + retryCanCast, retrySkillData);
                break;
            } else {
                mods.log.debug("RETRY", "retry not allowed through " + retryCanCast, retrySkillData);
            }
            
            // Send the skill packet again
            blockSendToServer = true;
            mod.send(...mods.packet.get_all(packetName), skillEvent);
            blockSendToServer = false;
        }
    };
    
    /*
     * Handles skill start requests from the client
     * Processes timing, validation, and queues execution
     * 
     * @param {string} packetName - The name of the packet
     * @param {Object} skillEvent - The skill event data
     * @returns {boolean} False to block the original packet
     */
    // Special handler for C_PRESS_SKILL to properly handle drain-type skills
    mod.hook(...mods.packet.get_all('C_PRESS_SKILL'), { order: -1000 }, event => {
        // Only handle Corruption Ring (20800) press:0 events
        if (event.skill && event.skill.id === 20800 && event.press === 0) {
            mods.log.debug("CORRUPTION_RING", `C_PRESS_SKILL with press:0 detected for Corruption Ring`);
            
            // Check if we're currently using Corruption Ring
            if (mods.action.inAction && mods.action.stage.skill.id === 20800) {
                mods.log.debug("CORRUPTION_RING", `Currently in Corruption Ring action, forcing action end`);
                
                // Force end the action with type 6 (special drain end type)
                mods.log.debug("CORRUPTION_RING", "Sending action end for Corruption Ring with type 6");
                mods.skills.sendActionEnd(20800, 6);
                
                // Force clear action state to ensure it's properly ended
                mods.action.info.inAction = false;
                mods.action.info.inSpecialAction = false;
                
                // Send an additional S_ACTION_END packet directly to ensure the client receives it
                mod.send('S_ACTION_END', 5, {
                    gameId: mods.player.gameId,
                    loc: mods.player.loc,
                    w: mods.player.w,
                    skill: {
                        id: 20800,
                        reserved: 0,
                        npc: false
                    },
                    type: 6
                });
                
                // Return true to allow the original packet to be processed
                return true;
            }
        }
    });
    
    const handleSkillStart = (packetName, skillEvent) => {
        // Skip if we're already blocking server sends
        if (blockSendToServer) return;
        
        // Safety check for undefined skill
        if (!skillEvent || !skillEvent.skill) {
            mods.log.debug("EMULATION", `Received ${packetName} with undefined skill`);
            return;
        }
        
        // Skip if skill is disabled
        if (!mods.utils.isEnabled(skillEvent.skill.id)) return;
        
        // Skip if player can't cast skills right now
        if (!mods.utils.canCastSkill()) return;
        
        // Prepare skill options
        const skillOptions = {
                byGrant: skillEvent.continue,
                press: skillEvent.press,
                originalSkillId: skillEvent.skill.id
            },
            newSkillData = mods.skills.getNewSkillData(skillEvent.skill.id, skillOptions),
            canCastResult = mods.skills.canCast(newSkillData, skillOptions);
        
        // Early check for cooldown - block immediately if skill is on cooldown
        const skillDetails = mods.utils.getSkillInfo(skillEvent.skill.id);
        const groupId = `${Math.floor(skillDetails.skill / 10000)}-0`;
        const isMultiStageSkill = groupId && mods.skills._getInfo(skillEvent.skill.id)?.nextSkill;
        
        // Check individual skill cooldown
        const isOnIndividualCooldown = mods.cooldown.isOnCooldown(skillEvent.skill.id);
        
        // Get the skill type to check if it's a special type (projectile, drain, lockon, or movingSkill)
        const skillType = mods.skills.getType(skillEvent.skill.id);
        const isProjectileSkill = skillType === "projectile";
        const isDrainSkill = skillType === "drain";
        const isMovingSkill = skillType === "movingSkill";
        const hasLockon = mods.skills.getLockonData(skillEvent.skill.id);
        const isSpecialSkill = isProjectileSkill || isDrainSkill || hasLockon || isMovingSkill;
        
        // Check if the skill being cast is in the same group as the currently active skill
        const currentSkillId = mods?.action?.stage?.skill?.id;
        const isSameSkillGroup = currentSkillId && groupId &&
            Math.floor(mods.utils.getSkillInfo(currentSkillId).skill / 10000) === Math.floor(skillDetails.skill / 10000);
        
        // Only check group cooldown if:
        // 1. This is a multi-stage skill, AND
        // 2. It's not a special skill type (projectile or drain), AND
        // 3. Either:
        //    a. We're not currently in an action (not casting anything), OR
        //    b. We're trying to cast a skill from the same group as the current skill
        const shouldCheckGroupCooldown = isMultiStageSkill &&
            !isSpecialSkill &&
            (!mods.action.inAction || isSameSkillGroup);
        
        // Check group cooldown if needed
        const isOnGroupCooldown = shouldCheckGroupCooldown && groupId ?
            mods.cooldown.isOnCooldown(groupId) : false;
        
        // Block the skill if it's on cooldown
        if (canCastResult === -12 || isOnIndividualCooldown || isOnGroupCooldown) {
            mods.log.debug("COOLDOWN_DEBUG", `Blocking skill ${skillEvent.skill.id} (group: ${groupId}) due to cooldown`);
            mods.log.debug("COOLDOWN_DEBUG", `Is multi-stage: ${isMultiStageSkill}, Original ID: ${skillEvent.skill.id}, Normalized: ${skillDetails.skill}`);
            mods.log.debug("COOLDOWN_DEBUG", `Skill type: ${skillType}, Is projectile: ${isProjectileSkill}, Is drain: ${isDrainSkill}, Is movingSkill: ${isMovingSkill}, Has lockon: ${hasLockon}`);
            mods.log.debug("COOLDOWN_DEBUG", `Individual cooldown: ${isOnIndividualCooldown}, Group cooldown: ${isOnGroupCooldown}`);
            mods.log.debug("COOLDOWN_DEBUG", `Current skill: ${currentSkillId}, Same group: ${isSameSkillGroup}, Should check group: ${shouldCheckGroupCooldown}`);
            mods.log.debug("COOLDOWN_DEBUG", `Cooldown state: ${JSON.stringify(mods.cooldown.info.skills[skillEvent.skill.id])}`);
            mods.log.debug("COOLDOWN_DEBUG", `Group cooldown state: ${groupId ? JSON.stringify(mods.cooldown.info.skills[groupId]) : "N/A"}`);
            
            mod.send(...mods.packet.get_all('S_CANNOT_START_SKILL'), {
                skill: skillEvent.skill
            });
            return false;
        }
            
        // Update expected skill IDs for validation
        expectedSkillId = newSkillData.skillId;
        expectedEndType = newSkillData.type === undefined ? expectedEndType : newSkillData.type;
        
        // Calculate appropriate delay for skill execution
        let skillDelay = mods.ping.jitter + mods.settings.info.delay;
        skillDelay += mods.skills.getSkillDelayTime(newSkillData.skillId, skillOptions);
        
        // Adjust for skill timing
        if (!isChargingSkill && newSkillData.time) {
            skillDelay -= newSkillData.time;
        }
        isChargingSkill = false;
        
        // Adjust for action end time
        if (!mods.action.inAction) {
            skillDelay -= Date.now() - (mods?.action?.end?._time || 0);
        }
        
        // Apply final adjustments
        skillDelay = Math.floor(skillDelay + SKILL_RETRY_MS);
        if (skillDelay < 0) skillDelay = 0;
        
        // Block skills with large delays that have failed
        if (skillDelay > 100 && newSkillData.failed) {
            mods.log.debug("SKILL_UPDATE", 'Delay is too large and it failed. Block: ' + skillDelay);
            mod.send(...mods.packet.get_all('S_CANNOT_START_SKILL'), {
                skill: skillEvent.skill
            });
            return false;
        }
        
        // Block duplicate skill packets
        if (skillTimeTracker.counter && lastSkillString === createSkillString(packetName, skillEvent)) {
            mods.log.debug("SKILL_UPDATE", "Due to same packet as last, blocking");
            mod.send(...mods.packet.get_all("S_CANNOT_START_SKILL"), {
                skill: skillEvent.skill
            });
            return false;
        }
        
        // Get current time and adjust delay based on previous skill timing
        const currentTime = Date.now();
        if (skillTimeTracker.estimate >= currentTime) {
            const estimatedEndTime = currentTime + skillDelay,
                  adjustedEndTime = skillTimeTracker.estimate + (currentTime - skillTimeTracker.arrived);
            skillDelay = Math.max(estimatedEndTime, adjustedEndTime) - currentTime;
        }
        
        // Special handling for Corruption Ring (drain-type skill)
        if (skillEvent.skill.id === 20800 && skillEvent.press === 0) {
            mods.log.debug("CORRUPTION_RING", "Processing Corruption Ring release (press:0) in handleSkillStart");
        }
        
        // Log skill details
        mods.log.debug(
            "SKILL_UPDATE", 
            skillEvent.skill.id + ' ->', 
            newSkillData, 
            "== " + canCastResult + 
            " delay:" + skillDelay + 
            'ping:' + mods.ping.ping +
            "jitter:" + mods.ping.jitter
        );
        
        // Update timing trackers
        skillTimeTracker.arrived = currentTime;
        skillTimeTracker.estimate = currentTime + skillDelay;
        
        // Record skill statistics
        skillHistory.push({
            delay: skillDelay,
            jitter: mods.ping.jitter,
            excessTime: newSkillData.time
        });
        
        // Limit history size
        if (skillHistory.length > MAX_SKILL_HISTORY) {
            skillHistory.splice(0, 1);
        }
        
        // Execute immediately if no delay needed
        if (!skillDelay && !skillTimeTracker.counter) {
            executeSkill(packetName, skillEvent, newSkillData, canCastResult);
            return false;
        }
        
        // Otherwise queue execution with delay
        ++skillTimeTracker.counter;
        mod.setTimeout(() => {
            --skillTimeTracker.counter;
            executeSkill(packetName, skillEvent, newSkillData, canCastResult);
        }, skillDelay);
        
        // Store last skill string for duplicate detection
        lastSkillString = createSkillString(packetName, skillEvent);
        return false;
    };
    
    /*
     * Helper function to register packet hooks with consistent handler
     *
     * @param {string} packetName - The name of the packet
     * @param {number} hookType - The hook type
     * @param {Function} handler - The handler function
     */
    const registerSkillHook = (packetName, hookType, handler) => {
        const hookInstance = mod.hook(...mods.packet.get_all(packetName), hookType, (...args) => {
            return handler(packetName, ...args);
        });
        registeredHooks.push(hookInstance);
        return hookInstance;
    };
    
    // Register all skill-related packet hooks
    registerSkillHook("C_START_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_START_TARGETED_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_START_COMBO_INSTANT_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_START_INSTANCE_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_START_INSTANCE_SKILL_EX", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_PRESS_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    registerSkillHook("C_NOTIMELINE_SKILL", hooks.MODIFY_ALL, handleSkillStart);
    
    /*
     * Handles skill cancellation requests from the client
     * Validates if the skill can be cancelled and sends appropriate packets
     */
    mod.hook('C_CANCEL_SKILL', 3, { order: -1000 }, event => {
        // Safety check for undefined skill
        if (!event || !event.skill) {
            mods.log.debug("EMULATION", "Received C_CANCEL_SKILL with undefined skill");
            return;
        }
        
        // Skip if skill is disabled
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        // Get current skill ID
        const currentSkillId = mods?.action?.stage?.skill?.id;
        if (!currentSkillId) return;
        
        // Special handling for Corruption Ring cancellation
        if (currentSkillId === 20800) {
            mods.log.debug("CORRUPTION_RING", `C_CANCEL_SKILL received for Corruption Ring: type=${event.type}`);
            
            // Force end Corruption Ring regardless of cancel type
            mods.skills.sendActionEnd(20800, 6);
            
            // Force clear action state
            mods.action.info.inAction = false;
            mods.action.info.inSpecialAction = false;
            
            // Send direct S_ACTION_END packet
            mod.send('S_ACTION_END', 5, {
                gameId: mods.player.gameId,
                loc: mods.player.loc,
                w: mods.player.w,
                skill: {
                    id: 20800,
                    reserved: 0,
                    npc: false
                },
                type: 6
            });
            
            mods.log.debug("CORRUPTION_RING", "Sent direct S_ACTION_END packet for Corruption Ring");
            
            // Update expected end type
            expectedEndType = 6;
            
            // Send cancel packet with jitter delay
            mod.setTimeout(() => {
                mod.send('C_CANCEL_SKILL', 3, event);
                mods.log.debug("CORRUPTION_RING", "Sent C_CANCEL_SKILL packet with jitter delay");
            }, mods.ping.jitter);
            
            return false;
        }
        
        // Check if skill can be cancelled with this type
        const canCancel = mods.skills.canCancelSkillWithType(currentSkillId, event.type);
        if (!canCancel) {
            if (currentSkillId === 20800) {
                mods.log.debug("CORRUPTION_RING", `Cannot cancel Corruption Ring with type ${event.type}`);
            }
            return;
        }
        
        // Special case for Archer's Rapid Fire (skill ID 7)
        const isArcherRapidFire = classes.ARCHER === mods.player.job &&
                                 mods.utils.getSkillInfo(currentSkillId).skill === 7;
        
        // Send action end with appropriate type
        mods.skills.sendActionEnd(
            currentSkillId,
            isArcherRapidFire ? ACTION_END_TYPES.ARCHER_RAPID_FIRE : event.type
        );
        
        // Update expected end type
        expectedEndType = event.type;
        
        // Send cancel packet with jitter delay
        mod.setTimeout(() => {
            mod.send('C_CANCEL_SKILL', 3, event);
        }, mods.ping.jitter);
        
        return false;
    });
    
    /*
     * Handles server action stage packets
     * Processes skill chains and handles disabled skills
     */
    mod.hook(...mods.packet.get_all('S_ACTION_STAGE'), hooks.MODIFY_REAL, event => {
        // Skip if not for player
        if (!mods.player.isMe(event.gameId)) return;
        
        // Skip if emulation is disabled
        if (!mods.utils.isEnabled()) return;
        
        // Handle disabled skills
        if (!mods.utils.isEnabled(event.skill.id)) {
            if (!mods.action.inAction) return;
            
            // End current action with interrupt type
            mods.skills.sendActionEnd(mods.action.stage.skill.id, ACTION_END_TYPES.INTERRUPT, event.loc);
            return;
        }
        
        // Handle missing skill chains
        if (event.stage === 0 &&
            mods?.action?.serverEnd?.type === 4 &&
            !mods.skills.isChain(mods.action.serverEnd.skill.id, event.skill.id) &&
            (mods?.action?.end?.type !== 4 || mods?.action?.stage?.skill?.id !== event.skill.id) &&
            mods.action.serverEnd.skill.id !== event.skill.id) {
            
            mods.log.debug(
                "EMULATION",
                "Missing chain " + mods.action.serverEnd.skill.id +
                " -> " + event.skill.id +
                " - " + mods.player.templateId
            );
            
            // End current action and start new one if needed
            if (event.skill.id !== mods.action.stage.skill.id) {
                mods.skills.sendActionEnd(mods.action.stage.skill.id, ACTION_END_TYPES.CANCEL, event.loc);
                sendActionStage(event.skill.id, false);
            }
        }
        
        return false;
    });
    
    /*
     * Clears skill history when entering combat
     * This helps maintain accurate statistics for the current combat session
     */
    mod.hook(...mods.packet.get_all("S_USER_STATUS"), hooks.READ_REAL, event => {
        if (!mods.player.inCombat && event.status === 1) {
            skillHistory = [];
        }
    });
    
    /*
     * Handles server action end packets
     * Processes unexpected action end types and handles position correction
     */
    mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.MODIFY_REAL, event => {
        // Skip if not for player
        if (!mods.player.isMe(event.gameId)) return;
        
        // Skip if not in action
        if (!mods.action.inAction) return;
        
        // Skip if skill is disabled
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        // Handle unexpected action end types
        if (!VALID_END_TYPES.includes(event.type) &&
            (event.type !== mods?.action?.end?.type ||
             Date.now() - mods.action.end._time > mods.utils.getPacketBuffer()) &&
            !(event.type === 39 && mods.action.inAction &&
              event.skill.id !== mods.action.stage.skill.id)) {
            
            const currentSkillId = mods.action.stage.skill.id;
            
            mods.log.debug(
                "EMULATION",
                "accepting server's ACTION END",
                event.skill.id,
                event.type,
                currentSkillId
            );
            
            mods.skills.sendActionEnd(
                currentSkillId,
                event.type,
                event.loc,
                event.type !== 28
            );
        }
        
        // Handle position correction
        const lastEndTime = mods?.action?.end?._time || 0,
              isRecentEnd = Date.now() - lastEndTime <= mods.utils.getPacketBuffer(),
              skillType = mods.skills.getType(event.skill.id);
              
        if (isRecentEnd && !mods.action.inAction && skillType !== "movingSkill") {
            const distance = event.loc.dist2D(mods.action.end.loc);
            
            // Correct position if distance is significant
            if (distance > POSITION_CORRECTION_THRESHOLD) {
                mods.utils.sendInstantMove(event.loc, event.w);
            }
        }
        
        return false;
    });
    
    /*
     * Blocks duplicate connect skill arrow packets
     * Prevents visual glitches from multiple arrow indicators
     */
    mod.hook(...mods.packet.get_all('S_CONNECT_SKILL_ARROW'), hooks.MODIFY_REAL, event => {
        if (connectSkillArrowTimeout > Date.now()) return false;
    });
    
    /*
     * Blocks duplicate grant skill packets
     * Prevents issues with multiple skill grants
     */
    mod.hook(...mods.packet.get_all('S_GRANT_SKILL'), hooks.MODIFY_REAL, event => {
        if (grantSkillTimeout > Date.now()) return false;
    });
    
    /*
     * Tracks instant move packets for position correction
     * Updates the last move location for use in action end packets
     */
    mod.hook(...mods.packet.get_all("S_INSTANT_MOVE"), hooks.READ_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        
        const lastMoveTime = mods.last.instantMove._time || 0,
              isRecentMove = Date.now() - lastMoveTime <= mods.utils.getPacketBuffer(250);
              
        if (isRecentMove) {
            const distance = event.loc.dist2D(mods.last.instantMove.loc);
            
            // Ignore small movements
            if (distance < SMALL_MOVEMENT_THRESHOLD) return;
        }
        
        lastMoveLocation = event.loc;
    });
    
    /*
     * Handles player death events
     * Ends any active skills when the player dies
     */
    mod.hook(...mods.packet.get_all("S_CREATURE_LIFE"), hooks.READ_DESTINATION_ALL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (event.alive) return;
        if (!mods.utils.isEnabled()) return;
        if (!mods.action.inAction) return;
        
        // End current action with death type
        mods.skills.sendActionEnd(mods.action.stage.skill.id, ACTION_END_TYPES.DEATH, event.loc);
    });
    
    /*
     * Handles successful defense events
     * Executes skills that require a successful defense to activate
     */
    mod.hook(...mods.packet.get_all("S_DEFEND_SUCCESS"), hooks.READ_DESTINATION_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        
        const skillInfo = mods.utils.getSkillInfo(mods.last.startSkill.skill.id);
        
        // Skip if already using the skill
        if (mods.action.inAction &&
            mods.utils.getSkillInfo(mods.action.stage.skill.id).skill === skillInfo.skill) return;
            
        // Get skill details
        const skillDetails = mods.skills._getInfo(skillInfo.id);
        
        // Skip if skill doesn't require successful defense
        if (!skillDetails?.onlyAfterDefenceSuccess) return;
        
        // Check timing
        const skillStartTime = mods.last.startSkill._time + mods.ping.ping / 2,
              currentTime = Date.now() - mods.ping.ping / 2;
              
        if (skillStartTime <= currentTime) return;
        
        // Execute the skill
        executeSkill(mods.last.startSkill._name, mods.last.startSkill, {}, null);
    });
    
    // Handle reaction events
    /*
     * Processes reaction events from other entities that affect the player
     *
     * @param {Object} event - The reaction event data
     */
    const handleReaction = event => {
        if (!event.push &&
            event.animSeq.length &&
            mods.action.inAction) {
            
            // End current action with reaction type
            mods.skills.sendActionEnd(mods.action.stage.skill.id, ACTION_END_TYPES.REACTION, event.loc, true);
        }
    };
    
    // Register reaction handler
    mods.action.on("reaction", handleReaction);
    
    // Cleanup function
    this.destructor = () => {
        // Remove event listeners
        mods.action.off("reaction", handleReaction);
        
        // Unhook all registered hooks
        for (const hookInstance of registeredHooks) {
            mod.unhook(hookInstance);
        }
        registeredHooks = [];
        
        // Clear skill history to free memory
        skillHistory = [];
        
        // Clear timeouts
        mod.clearTimeout(actionStageTimeout);
        mod.clearTimeout(connectSkillArrowTimeout);
        mod.clearTimeout(grantSkillTimeout);
    };
};