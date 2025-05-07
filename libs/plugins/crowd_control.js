/*
 * Rival Mod - Crowd Control System
 *
 * crowd_control.js serves as a manager for crowd control effects.
 * It handles stuns, sleeps, fears, and other CC effects, managing their timing
 * and interaction with player actions to improve gameplay responsiveness.
 */
const hooks = require("../enums/hooks");
/*
 * CrowdControl module
 *
 * Manages crowd control effects by intercepting and modifying related packets.
 * Provides early termination of CC effects based on ping, handles different
 * types of CC (stun, sleep, fear), and ensures proper interaction with player actions.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function CrowdControl(mod, mods) {
    // State tracking
    let endCcFunction = null;       // Function to end current CC effect
    let ccTimeout = null;           // Timeout ID for CC duration
    let currentCcActionId = null;   // ID of the current CC action
    let blockedActionId = null;     // ID of action that should be blocked

    // Action end handling
    
    /*
     * Handles action end packets to manage CC effects
     * @param {Object} actionEndEvent - The action end event
     * @returns {boolean} False to block the packet when appropriate
     */
    mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.MODIFY_INTERNAL_REAL, actionEndEvent => {
        // Block if this is our own generated action end packet
        if (actionEndEvent.id === blockedActionId) {
            mods.log.debug("CC-ACTION-END", "Blocking because it's matching ids");
            return false;
        }
        
        // Block if we're in retaliate and this is a type 9 action end
        if (actionEndEvent.type === 9 && mods.skills.getTypeId(mods?.action?.stage?.skill?.id) === 27) {
            mods.log.debug("CC-ACTION-END", "Blocking because type 9 and we're in retaliate");
            return false;
        }
        
        // Handle current CC action
        if (actionEndEvent.id === currentCcActionId) {
            mod.clearTimeout(ccTimeout);
            
            // Block type 5 action ends for CC
            if (actionEndEvent.type === 5) {
                mods.log.debug("CC-ACTION-END", "Blocking because type 5");
                return false;
            }
        }
    });

    // Skill reaction handling
    
    /*
     * Handles skill results that may cause CC effects
     * @param {Object} skillResult - The skill result event
     * @returns {boolean} False to block the packet when appropriate
     */
    mod.hook(...mods.packet.get_all("S_EACH_SKILL_RESULT"), hooks.MODIFY_ALL, skillResult => {
        // Skip if reaction is disabled
        if (!skillResult.reaction.enable) return;
        
        // Only process reactions on the player
        if (mods.player.isMe(skillResult.source)) return;
        if (!mods.player.isMe(skillResult.target)) return;
        
        // Skip if module is disabled
        if (!mods.utils.isEnabled()) return;
        
        // Clear any existing CC timeout
        mod.clearTimeout(ccTimeout);
        
        // Calculate total reaction duration
        const reactionDuration = skillResult.reaction.animSeq.reduce(
            (total, anim) => total + anim.duration, 0
        );
        
        if (reactionDuration > 0) {
            // Block if we're in retaliate
            if (mods.action.inAction && mods.skills.getTypeId(mods.action.stage.skill.id) === 27) {
                mods.log.debug("CC - SESR", "blocking SESR because in retaliate");
                return false;
            }
            
            const reaction = skillResult.reaction;
            currentCcActionId = reaction.id;
            
            // Set timeout to end CC before server would
            ccTimeout = mod.setTimeout(() => {
                if (!mods.action.inAction) {
                    mods.log.debug("CC - SESR", "not ending cc because we're not in an action");
                    return;
                }
                
                mods.log.debug("CC - SESR", "ending cc before server");
                
                // Send action end packet to end CC
                mod.send(...mods.packet.get_all("S_ACTION_END"), Object.assign({
                    type: 0
                }, reaction, {
                    gameId: mods.player.gameId,
                    templateId: mods.player.templateId,
                    loc: mods.position.loc
                }));
                
                blockedActionId = reaction.id;
            }, reactionDuration - mods.ping.ping);
        }
        
        // End current action if we're in one
        if (!mods.action.inAction) return;
        
        mod.send(...mods.packet.get_all("S_ACTION_END"), Object.assign({
            type: 0
        }, mods.action.stage, {
            loc: mods.position.loc
        }));
    });

    // Stun/sleep handling
    
    /*
     * Handles stun/sleep CC effects
     * @param {Object} actionEvent - The action stage event
     */
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_DESTINATION_ALL, actionEvent => {
        if (!mods.player.isMe(actionEvent.gameId)) return;
        if (actionEvent.skill.type !== 2) return;
        if (actionEvent.animSeq?.[0]?.duration !== 89000000) return; // Magic number for stun/sleep
        if (actionEvent.animSeq?.[0]?.distance !== -1) return;
        if (!mods.utils.isEnabled()) return;
        
        mod.clearTimeout(ccTimeout);
        
        // Get active abnormality and its duration
        const abnormalityId = mods.effects.getActiveAbnormalitiesSorted()[0];
        const { duration } = mods.effects.getAbnormality(abnormalityId);
        
        currentCcActionId = actionEvent.id;
        
        /*
         * Ends CC effect early
         * @param {number} abnormalityId - The abnormality ID causing the CC
         */
        const endCcEffect = (abnormalityId) => {
            endCcFunction = null;
            
            mod.send(...mods.packet.get_all("S_ACTION_END"), Object.assign(actionEvent, {
                loc: mods.position.loc
            }));
            
            blockedActionId = actionEvent.id;
            mods.log.debug("CC - 211", "ending stun/sleep before server:", abnormalityId);
        };
        
        endCcFunction = endCcEffect;
        mod.clearTimeout(ccTimeout);
        ccTimeout = mod.setTimeout(endCcFunction, duration, abnormalityId);
    });

    // Abnormality effect handling
    
    /*
     * Handles abnormality effects (stun, sleep, fear)
     * @param {Object} abnormalityEvent - The abnormality event
     */
    const handleAbnormality = abnormalityEvent => {
        if (!mods.player.isMe(abnormalityEvent.target)) return;
        if (!mods.action.inAction) return;
        if (!mods.utils.isEnabled()) return;
        
        const abnormalityData = mods.datacenter.getAbnormalityData(abnormalityEvent.id);
        
        // Process each abnormality effect
        for (const effect of abnormalityData?.AbnormalityEffect || []) {
            switch (effect.type) {
                // Stun/Sleep (type 211)
                case 211: {
                    mod.clearTimeout(ccTimeout);
                    if (!endCcFunction) break;
                    
                    ccTimeout = mod.setTimeout(
                        endCcFunction,
                        Number(abnormalityEvent.duration),
                        abnormalityEvent.id
                    );
                    break;
                }
                
                // Fear (type 232)
                case 232: {
                    mods.log.debug("CC - 232", "ending skill because of fear");
                    
                    mod.send(...mods.packet.get_all("S_ACTION_END"), Object.assign({
                        type: 16
                    }, mods.action.stage, {
                        loc: mods.position.loc
                    }));
                    break;
                }
            }
        }
    };
    // Register abnormality event hooks
    mod.hook(...mods.packet.get_all("S_ABNORMALITY_BEGIN"), hooks.READ_DESTINATION_ALL, handleAbnormality);
    mod.hook(...mods.packet.get_all("S_ABNORMALITY_REFRESH"), hooks.READ_DESTINATION_ALL, handleAbnormality);
};