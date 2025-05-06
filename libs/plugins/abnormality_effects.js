/*
 * Rival Mod - Abnormality System
 * 
 * abnormality_effects.js manages player stat modifications from abnormalities.
 * It tracks and applies effects like attack speed changes and skill category enabling/disabling
 * based on abnormality begin and end events.
 */
const classes = require("../enums/classes");
const hooks = require("../enums/hooks");
/*
 * AbnormalityEffects module
 *
 * Handles the application and removal of abnormality effects that modify player stats.
 * Provides handlers for different effect types and processes abnormality events.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, packet, and utility modules
 * @returns {undefined} This module sets up hooks and handlers for abnormality effects but doesn't return a value
 */
module.exports = function AbnormalityEffects(mod, mods) {
    // --------------------------------
    // STATE TRACKING
    // --------------------------------
    
    // Array to track active attack speed modifiers
    let activeSpeedModifiers = [];
    
    // --------------------------------
    // EFFECT HANDLERS
    // --------------------------------
    
    /*
     * Creates a handler for attack speed modifications
     * @param {boolean} isPositive - Whether this is a positive (true) or negative (false) effect
     * @returns {Function} Handler function for the abnormality
     */
    const createAttackSpeedHandler = isPositive => (abnormalityData, effectData) => {
        let speedValue = null;
        
        // Calculate speed value based on method
        switch (effectData.method) {
            case 2: // Fixed value
                speedValue = +effectData.value;
                break;
            case 3: // Percentage of base attack speed
                speedValue = Math.round((+effectData.value - 1) * mods.player.attackSpeed);
                break;
        }
        
        // Skip if value is invalid
        if (speedValue === null || isNaN(speedValue)) return;
        
        let timeoutId = null;
        
        // Create modifier object
        const speedModifier = {
            value: speedValue * (isPositive ? 1 : -1),
            abnormality: abnormalityData.id,
            callback: (applyUpdate = true) => {
                mod.clearTimeout(timeoutId);
                activeSpeedModifiers.splice(activeSpeedModifiers.indexOf(speedModifier), 1);
                
                // Send stat update if requested
                if (applyUpdate) {
                    mod.send(...mods.packet.get_all("S_PLAYER_STAT_UPDATE"), {
                        ...mods.player.previous_sPlayerStatUpdate,
                        attackSpeedBonus: mods.player.attackSpeedBonus - speedModifier.value
                    });
                }
            }
        };
        
        // Add to active modifiers and set timeout
        activeSpeedModifiers.push(speedModifier);
        timeoutId = mod.setTimeout(speedModifier.callback, mods.ping.ping);
        
        // Apply the speed change immediately
        mod.send(...mods.packet.get_all("S_PLAYER_STAT_UPDATE"), {
            ...mods.player.previous_sPlayerStatUpdate,
            attackSpeedBonus: mods.player.attackSpeedBonus + speedModifier.value
        });
    };
    
    /*
     * Creates a handler for abnormality end events
     * @returns {Function} Handler function for abnormality end
     */
    const createAbnormalityEndHandler = () => abnormalityEvent => {
        // Only process for the player character
        if (!mods.player.isMe(abnormalityEvent.target)) return;
        
        // Find and remove matching speed modifiers
        for (const modifier of activeSpeedModifiers) {
            if (modifier.abnormality === abnormalityEvent.id) {
                modifier.callback(false);
            }
        }
    };
    
    /*
     * Creates a handler for skill category enabling/disabling
     * @param {boolean} enabled - Whether to enable or disable the skill category
     * @returns {Function} Handler function for the skill category
     */
    const createSkillCategoryHandler = enabled => skillData => {
        for (const category of skillData.bySkillCategory) {
            if (!category) continue;
            
            mod.send(...mods.packet.get_all("S_SKILL_CATEGORY"), {
                category: category,
                enabled: enabled
            });
        }
    };
    
    // --------------------------------
    // EFFECT HANDLER MAPPINGS
    // --------------------------------
    
    // Effect handlers for abnormality begin
    const beginEffectHandlers = {
        0x18: createAttackSpeedHandler(true),      // Attack speed increase
        0xd1: {
            0x3: createSkillCategoryHandler(true)  // Enable skill category
        },
        0xd2: {
            0x0: createSkillCategoryHandler(false) // Disable skill category
        }
    };
    
    // Effect handlers for abnormality end
    const endEffectHandlers = {
        0x18: createAttackSpeedHandler(false),     // Attack speed decrease
        0xd2: {
            0x0: createSkillCategoryHandler(true)  // Re-enable skill category
        }
    };
    
    // --------------------------------
    // ABNORMALITY PROCESSORS
    // --------------------------------
    
    /*
     * Creates a processor for abnormality effects
     * @param {Object} effectHandlers - Handlers for different effect types
     * @returns {Function} Processor function for abnormality effects
     */
    const createAbnormalityProcessor = effectHandlers => abnormalityEvent => {
        // Only process for the player character
        if (!mods.player.isMe(abnormalityEvent.target)) return;
        
        // Skip if utilities are disabled
        if (!mods.utils.isEnabled()) return;
        
        // Get abnormality data
        const abnormalityData = mods.datacenter.getAbnormalityData(abnormalityEvent.id);
        if (!abnormalityData) return;
        
        let result = undefined;
        
        // Process each effect in the abnormality
        for (const effect of abnormalityData?.AbnormalityEffect || []) {
            // Skip warrior-specific effects for non-warrior classes
            if (mods.player.job !== classes.WARRIOR && effect.type === 0xd2) continue;
            
            const handler = effectHandlers[effect.type];
            if (!handler) continue;
            
            // Handle direct function handlers
            if (typeof handler !== 'object') {
                const handlerResult = handler(abnormalityData, effect);
                if (handlerResult !== undefined) result = handlerResult;
                continue;
            }
            
            // Handle method-specific handlers
            const methodHandler = handler[effect.method];
            if (!methodHandler) continue;
            
            const methodResult = methodHandler(abnormalityData, effect);
            if (methodResult !== undefined) result = methodResult;
        }
        
        return result;
    };
    
    // --------------------------------
    // EVENT HOOKS
    // --------------------------------
    
    // Hook abnormality begin events for end handler
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_BEGIN"),
        hooks.READ_REAL,
        createAbnormalityEndHandler()
    );
    
    // Hook abnormality end events
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_END"),
        hooks.READ_REAL,
        createAbnormalityEndHandler()
    );
    
    // Hook abnormality begin events for effect processing
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_BEGIN"),
        hooks.READ_DESTINATION_FAKE,
        createAbnormalityProcessor(beginEffectHandlers)
    );
    
    // Hook abnormality end events for effect processing
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_END"),
        hooks.READ_DESTINATION_FAKE,
        createAbnormalityProcessor(endEffectHandlers)
    );
    
    // Hook player stat updates to apply active speed modifiers
    mod.hook(
        ...mods.packet.get_all("S_PLAYER_STAT_UPDATE"),
        {
            order: -0x41a
        },
        statUpdate => {
            // Log debug information if there are active speed modifiers
            if (activeSpeedModifiers.length) {
                mods.log.debug(
                    "STAT-UPDATE",
                    "<-R attackSpeed:" + statUpdate.attackSpeed + 
                    " attackSpeedBonus:" + statUpdate.attackSpeedBonus
                );
            }
            
            // Apply all active speed modifiers
            for (const { value } of activeSpeedModifiers) {
                statUpdate.attackSpeedBonus += value;
            }
            
            // Return true to modify the packet if there are active modifiers
            return activeSpeedModifiers.length ? true : undefined;
        }
    );
};