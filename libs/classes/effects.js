/*
 * Rival Mod - Effect System
 * 
 * effects.js serves as the central manager for all in-game effects and status modifiers.
 * It tracks and applies abnormalities, passivities, skill polishing, talents, and other
 * effects that modify player abilities and stats during gameplay.
 */
const hooks = require("../enums/hooks");
/*
 * Effects class
 * 
 * Manages all game effects including abnormalities, passivities, skill polishing, and talents.
 * Provides methods for tracking, applying, and querying effects across the game system.
 */
class Effects {
    /*
     * Creates a new Effects instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;
        this.mods = mods;
        
        // Initialize effect state
        this.reset();
        
        // Set up hooks for various game events
        
        // Core hooks
        mod.hook("S_LOGIN", 'event', hooks.READ_REAL, this.reset);
        mod.hook("S_ITEMLIST", "event", hooks.READ_DESTINATION_ALL_CLASS, this.updateArmorRolls);
        
        // Abnormality hooks (client-side)
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_BEGIN"), hooks.READ_DESTINATION_ALL_CLASS, this.abnormalityStart);
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_REFRESH"), hooks.READ_DESTINATION_ALL_CLASS, this.abnormalityStart);
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_END"), hooks.READ_DESTINATION_ALL_CLASS, this.abnormalityEnd);
        
        // Abnormality hooks (server-side)
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_BEGIN"), hooks.READ_REAL, this.abnormalityStartServer);
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_REFRESH"), hooks.READ_REAL, this.abnormalityStartServer);
        mod.hook(...mods.packet.get_all("S_ABNORMALITY_END"), hooks.READ_REAL, this.abnormalityEndServer);
        
        // Buff and glyph hooks
        mod.hook(...mods.packet.get_all("S_HOLD_ABNORMALITY_ADD"), hooks.READ_DESTINATION_ALL_CLASS, this.holdAbnormalityAdd);
        mod.hook(...mods.packet.get_all("S_CLEAR_ALL_HOLDED_ABNORMALITY"), hooks.READ_DESTINATION_ALL_CLASS, this.clearAllHoldedAbnormality);
        mod.hook(...mods.packet.get_all("S_CREST_INFO"), hooks.READ_DESTINATION_ALL_CLASS, this.crestInfo);
        mod.hook(...mods.packet.get_all("S_CREST_APPLY"), hooks.READ_DESTINATION_ALL_CLASS, this.crestApply);
        
        // Skill category hooks
        mod.hook(...mods.packet.get_all("S_SKILL_CATEGORY"), hooks.READ_DESTINATION_ALL_CLASS, this.skillCategory);
        
        // Enhancement Point (EP) hooks
        mod.hook(...mods.packet.get_all("S_LOAD_EP_INFO"), hooks.READ_DESTINATION_ALL_CLASS, this.loadEpInfo);
        
        // Handle TTB_S_LOAD_EP_PAGE or S_LOAD_EP_PAGE based on configuration
        const epPagePacket = mods.packet.get_all(true ? "TTB_S_LOAD_EP_PAGE" : "S_LOAD_EP_PAGE");
        if (epPagePacket[1]) {
            mod.hook(...epPagePacket, hooks.READ_DESTINATION_ALL_CLASS, this.loadEpInfo);
        }
        
        mod.hook(...mods.packet.get_all("S_PLAYER_RESET_EP"), hooks.READ_DESTINATION_ALL_CLASS, this.playerResetEp);
        mod.hook(...mods.packet.get_all("S_LEARN_EP_PERK"), hooks.READ_DESTINATION_ALL_CLASS, this.learnEpPerk);
        
        // Skill polishing hooks
        mod.hook(...mods.packet.get_all("S_RP_SKILL_POLISHING_LIST"), hooks.READ_DESTINATION_ALL_CLASS, this.rpSkillPolishingList);
        
        // Creature life hooks (for death/respawn handling)
        mod.hook(...mods.packet.get_all("S_CREATURE_LIFE"), hooks.READ_DESTINATION_ALL_CLASS, this.creatureLife);
    }

    // State management methods

    /*
     * Resets all effect data to default state
     * Used on login and when needed to clear all effects
     */
    reset = () => {
        this.info = {
            'abnormality': {},        // Client-side abnormalities
            'serverAbnormality': {},  // Server-side abnormalities
            'glyphs': {},             // Active glyphs (crests)
            'buffs': {},              // Held abnormalities
            'talents': {},            // Enhancement Point talents
            'skillPolishing': {},     // Skill polishing effects
            'category': {},           // Skill categories
            'armorRolls': {}          // Armor roll effects
        };
    };

    /*
     * Loads saved effect data from storage
     * @param {Object} savedData - Saved effect data
     */
    loaded = savedData => {
        this.info = savedData;
    };

    /*
     * Returns current effect data for saving
     * @returns {Object} Current effect data
     */
    destructor = () => {
        return this.info;
    };

    // Effect application methods

    /*
     * Applies effects to a target object based on effect type and data
     * @param {Object} targetObj - Object to apply effects to
     * @param {string} effectType - Type of effect (abnormal, passivity, skillPolishing, talent)
     * @param {Object} effectData - Data containing effect properties
     * @param {Object} appliedEffects - Tracking object for applied effects
     */
    _applyEffectToObject = (targetObj, effectType, effectData, appliedEffects) => {
        let getEffectFunc = null;
        
        // Determine which getter function to use based on effect type
        if (effectType === 'abnormal') {
            getEffectFunc = this.getAbnormality;
        } else if (effectType === 'passivity') {
            getEffectFunc = this.getPassivity;
        } else if (effectType === "skillPolishing") {
            getEffectFunc = this.getSkillPolishing;
        } else {
            getEffectFunc = this.getTalent;
        }
        
        // Process each effect entry
        for (const [effectId, effectProps] of Object.entries(effectData)) {
            // Mark abnormal effects as applied
            if (effectType === "abnormal") {
                appliedEffects[effectId] = true;
            }
            
            // Check if effect requires an abnormality
            if (effectProps.requiresAbnormality) {
                const requiredAbnormalities = effectProps.requiresAbnormality.map(this.getAbnormality).filter(Boolean);
                if (!requiredAbnormalities.length) continue;
            }
            
            // Process each property of the effect
            for (const [propName, propValue] of Object.entries(effectProps)) {
                if (propName === 'requiresAbnormality') continue;
                
                if (propName === "requireBlock") {
                    targetObj.block = true;
                    continue;
                }
                
                if (!getEffectFunc(effectId)) continue;
                
                // Apply the effect based on property name
                switch (propName) {
                case "abnormSpeed":
                    targetObj.abnormSpeed += propValue;
                    break;
                case "passiveSpeed":
                    targetObj.passiveSpeed += propValue;
                    break;
                case "chargeSpeed":
                    targetObj.chargeSpeed += propValue;
                    break;
                case "distModifier":
                    targetObj.dist *= propValue;
                    break;
                case "moreLockonTargets":
                    targetObj.lockon += propValue;
                    break;
                case "stamina":
                    targetObj.stamina += propValue;
                    break;
                case 'reset':
                    targetObj.reset = true;
                    break;
                case "attackSpeed":
                    targetObj.attackSpeed *= propValue;
                    break;
                case "noct":
                    targetObj.noct += propValue;
                    break;
                case "transform":
                    targetObj.transform = propValue;
                    break;
                case "effectScale":
                    targetObj.effectScale = propValue;
                    break;
                }
            }
        }
    };

    /*
     * Gets all effects applied to a skill
     * @param {Object} skill - The skill to get effects for
     * @returns {Object} Object containing all applied effects
     */
    getAppliedEffects = skill => {
        // Initialize effects object with default values
        let effectsObj = {
            'abnormSpeed': 1,       // Abnormality speed modifier
            'passiveSpeed': 1,      // Passive speed modifier
            'chargeSpeed': 0,       // Charge speed modifier
            'lockon': 0,            // Additional lockon targets
            'block': false,         // Block requirement
            'stamina': 0,           // Stamina modifier
            'attackSpeed': 1,       // Attack speed modifier
            'reset': false,         // Reset flag
            'dist': 1,              // Distance modifier
            'noct': 1,              // Noctenium modifier
            'transform': 0,         // Transform effect
            'effectScale': 1        // Effect scale modifier
        };
        
        // Get effects from skills module
        const appliedEffects = this.mods.skills.getAppliedEffects(skill);
        const appliedAbnormals = {};
        
        // Apply each effect to the effects object
        for (const [effectType, effectData] of Object.entries(appliedEffects)) {
            this._applyEffectToObject(effectsObj, effectType, effectData, appliedAbnormals);
        }
        
        // Get skill categories and apply category-specific abnormality effects
        const skillCategories = this.mods.skills.getCategories(skill);
        
        for (const abnormalId in this.info.abnormality) {
            const abnormalData = this.mods.datacenter.getAbnormalityData(abnormalId);
            if (!abnormalData) continue;
            if (!abnormalData.AbnormalityEffect) continue;
            if (!abnormalData.bySkillCategory) continue;
            
            // Check if abnormality applies to this skill's categories
            if (!abnormalData.bySkillCategory.includes(0) && 
                !this.mods.library.arraysItemInArray(abnormalData.bySkillCategory, skillCategories)) continue;
            
            if (abnormalData.bySkillCategory.length !== 1) continue;
            if (appliedAbnormals[abnormalId]) continue;
            
            // Apply abnormality effects
            for (const effect of abnormalData.AbnormalityEffect) {
                switch (effect.type) {
                case 28: // 0x1c - Distance modifier
                    effectsObj.dist *= +effect.value;
                    break;
                case 29: // 0x1d - Charge speed
                    effectsObj.chargeSpeed += +effect.value - 1;
                    break;
                case 236: // 0xec - Charge speed (alternate)
                    effectsObj.chargeSpeed += +effect.value - 1;
                    break;
                }
            }
        }
        
        return effectsObj;
    };

    // Abnormality management methods

    /*
     * Handles abnormality start event (client-side)
     * @param {Object} abnormalData - Abnormality data
     * @param {boolean} isFake - Whether this is a fake abnormality
     */
    abnormalityStart = (abnormalData, isFake) => {
        const { player } = this.mods;
        
        if (!player.isMe(abnormalData.target)) return;
        
        this.info.abnormality[abnormalData.id] = {
            'id': abnormalData.id,
            'stacks': abnormalData.stacks,
            'duration': Number(abnormalData.duration),
            'status': this.getStatus(),
            'time': Date.now(),
            'fake': isFake
        };
    };
    
    /*
     * Handles server abnormality start event
     * @param {Object} abnormalData - Abnormality data
     * @param {boolean} isFake - Whether this is a fake abnormality
     */
    abnormalityStartServer = (abnormalData, isFake) => {
        const { player } = this.mods;
        
        if (!player.isMe(abnormalData.target)) return;
        
        this.info.serverAbnormality[abnormalData.id] = {
            'id': abnormalData.id,
            'stacks': abnormalData.stacks,
            'duration': Number(abnormalData.duration),
            'status': this.getStatus(),
            'time': Date.now(),
            'fake': isFake
        };
    };
    
    /*
     * Handles abnormality end event (client-side)
     * @param {Object} abnormalData - Abnormality data
     */
    abnormalityEnd = abnormalData => {
        const { player } = this.mods;
        
        if (!player.isMe(abnormalData.target)) return;
        
        delete this.info.abnormality[abnormalData.id];
    };
    
    /*
     * Handles server abnormality end event
     * @param {Object} abnormalData - Abnormality data
     */
    abnormalityEndServer = abnormalData => {
        const { player } = this.mods;
        
        if (!player.isMe(abnormalData.target)) return;
        
        delete this.info.serverAbnormality[abnormalData.id];
    };

    /*
     * Gets all active abnormality IDs
     * @returns {Array} Array of active abnormality IDs
     */
    getActiveAbnormalities = () => {
        let abnormalIds = [];
        for (const abnormalId in this.info.abnormality) {
            abnormalIds.push(+abnormalId);
        }
        return abnormalIds;
    };
    
    /*
     * Gets all active abnormalities with their effect data
     * @returns {Array} Array of abnormality data objects
     */
    getActiveAbnormalitiesWithEffect = () => {
        let abnormalData = [];
        for (const abnormalId in this.info.abnormality) {
            abnormalData.push(this.mods.datacenter.getAbnormalityData(abnormalId));
        }
        return abnormalData;
    };
    
    /*
     * Gets active abnormalities sorted by time (newest first)
     * @returns {Array} Array of abnormality IDs sorted by time
     */
    getActiveAbnormalitiesSorted = () => {
        let sortedAbnormalities = Object.values(this.info.abnormality).sort((a, b) => b.time - a.time);
        return sortedAbnormalities.map(abnormal => abnormal.id);
    };
    
    /*
     * Gets abnormality data by ID
     * @param {number|string} abnormalId - Abnormality ID
     * @returns {Object|undefined} Abnormality data or undefined
     */
    getAbnormality = abnormalId => {
        return this.info.abnormality[abnormalId];
    };
    
    /*
     * Gets server abnormality data by ID
     * @param {number|string} abnormalId - Abnormality ID
     * @returns {Object|undefined} Server abnormality data or undefined
     */
    getServerAbnormality = abnormalId => {
        return this.info.serverAbnormality[abnormalId];
    };

    /*
     * Checks if player has an abnormality with specific type and value
     * @param {number} abnormalType - Type of abnormality to check for
     * @param {number} abnormalValue - Value to match
     * @returns {boolean} True if abnormality exists with matching type and value
     */
    hasAbnormalityWithTypeValue = (abnormalType, abnormalValue) => {
        for (const abnormalId in this.info.abnormality) {
            const abnormalData = this.mods.datacenter.getAbnormalityData(abnormalId);
            if (!abnormalData) continue;
            
            for (const effect of abnormalData.AbnormalityEffect || []) {
                if (effect.type !== abnormalType) continue;
                if (abnormalValue === +effect.value) return true;
            }
        }
        return false;
    };
    
    /*
     * Checks if player has an abnormality with specific category, type, and value
     * @param {Array} categories - Categories to check
     * @param {number} abnormalType - Type of abnormality to check for
     * @param {number|null} abnormalValue - Value to match (optional)
     * @param {number|null} abnormalMethod - Method to match (optional)
     * @returns {boolean} True if abnormality exists with matching criteria
     */
    hasAbnormalityWithCategoryTypeValue = (categories, abnormalType, abnormalValue = null, abnormalMethod = null) => {
        for (const abnormalId in this.info.abnormality) {
            const abnormalData = this.mods.datacenter.getAbnormalityData(abnormalId);
            if (!abnormalData) continue;
            
            const matchingCategory = abnormalData.bySkillCategory.find(category => categories.includes(category));
            if (!matchingCategory) continue;
            
            for (const effect of abnormalData.AbnormalityEffect || []) {
                if (effect.type !== abnormalType) continue;
                
                if (abnormalMethod === null && abnormalValue === null) return true;
                if (abnormalMethod === +effect.method) return true;
                if (abnormalValue === +effect.value) return true;
            }
        }
        return false;
    };

    // Buff and passivity management methods

    /*
     * Adds a held abnormality
     * @param {Object} abnormalData - Abnormality data
     */
    holdAbnormalityAdd = abnormalData => {
        this.info.buffs[abnormalData.id] = true;
    };
    
    /*
     * Clears all held abnormalities
     */
    clearAllHoldedAbnormality = () => {
        this.info.buffs = {};
    };

    /*
     * Gets passivity data by ID
     * @param {number|string} passivityId - Passivity ID
     * @returns {Object|undefined} Passivity data or undefined
     */
    getPassivity = passivityId => {
        const passivities = {
            ...this.info.buffs,
            ...this.info.glyphs,
            ...this.info.armorRolls,
            ...this.mods.last.skillList.passives
        };
        return passivities[passivityId];
    };

    /*
     * Updates armor roll effects from player inventory
     */
    updateArmorRolls = () => {
        const { player } = this.mods;
        
        this.info.armorRolls = {};
        for (const effectId of player.inven.effects) {
            this.info.armorRolls[effectId] = true;
        }
    };

    // Glyph (crest) management methods

    /*
     * Updates glyph (crest) information
     * @param {Object} crestData - Crest data
     */
    crestInfo = crestData => {
        this.info.glyphs = {};
        for (const crest of crestData.crests) {
            this.info.glyphs[crest.id] = !!crest.enable;
        }
    };
    
    /*
     * Applies a glyph (crest)
     * @param {Object} crestData - Crest data
     */
    crestApply = crestData => {
        this.info.glyphs[crestData.id] = !!crestData.enable;
    };

    // Skill category management methods

    /*
     * Updates skill category enabled status
     * @param {Object} categoryData - Category data
     */
    skillCategory = categoryData => {
        this.info.category[categoryData.category] = categoryData.enabled;
    };
    
    /*
     * Checks if a skill category is enabled
     * @param {number} categoryId - Category ID
     * @returns {boolean} True if category is enabled or undefined
     */
    isCategoryEnabled = categoryId => {
        const categoryEnabled = this.info.category[categoryId];
        if (categoryEnabled === undefined) return true;
        return categoryEnabled;
    };

    // Enhancement Point (EP) management methods

    /*
     * Loads EP (Enhancement Point) information
     * @param {Object} epData - EP data
     */
    loadEpInfo = epData => {
        this.info.talents = {};
        for (const perk of epData.perks) {
            this.info.talents[perk.id] = perk.level;
        }
    };
    
    /*
     * Handles player EP reset
     */
    playerResetEp = () => {
        this.info.talents = {};
    };
    
    /*
     * Handles EP perk learning
     * @param {Object} perkData - Perk data
     */
    learnEpPerk = perkData => {
        if (!perkData.success) return;
        this.loadEpInfo(perkData);
    };
    
    /*
     * Checks if a talent is active
     * @param {number|string} talentId - Talent ID or combined ID-level string
     * @param {number} [talentLevel] - Talent level (if not provided in talentId)
     * @returns {boolean} True if talent is active at specified level
     */
    getTalent = (talentId, talentLevel) => {
        if (typeof talentId === "string" && talentId.includes('-')) {
            const parts = talentId.split('-');
            talentId = +parts[0];
            talentLevel = +parts[1];
        }
        return this.info.talents[talentId] === talentLevel;
    };

    // Skill polishing management methods

    /*
     * Updates skill polishing list
     * @param {Object} polishingData - Skill polishing data
     */
    rpSkillPolishingList = polishingData => {
        this.info.skillPolishing = {};
        
        for (const optionEffect of polishingData.optionEffects) {
            if (!optionEffect.active) continue;
            this.info.skillPolishing[optionEffect.id] = true;
        }
        
        for (const levelEffect of polishingData.levelEffects) {
            this.info.skillPolishing[levelEffect.id] = true;
        }
    };
    
    /*
     * Gets skill polishing data by ID
     * @param {number|string} polishingId - Skill polishing ID
     * @returns {Object|undefined} Skill polishing data or undefined
     */
    getSkillPolishing = polishingId => {
        return this.info.skillPolishing[polishingId];
    };

    // Status and lifecycle methods

    /*
     * Handles creature life events (death/respawn)
     * @param {Object} creatureData - Creature data
     */
    creatureLife = creatureData => {
        if (!this.mods.utils.isEnabled()) return;
        if (!this.mods.player.isMe(creatureData.gameId)) return;
        if (creatureData.alive) return;
        
        // Clear abnormalities on death
        this.info.abnormality = {};
        this.info.serverAbnormality = {};
    };
    
    /*
     * Gets current status effects
     * @returns {Object} Status effects object
     */
    getStatus = () => {
        const statusEffects = {};
        
        for (const abnormalData of this.mods.effects.getActiveAbnormalitiesWithEffect()) {
            for (const effect of abnormalData?.AbnormalityEffect || []) {
                if (effect.type !== 245) continue; // Status effect type
                statusEffects[effect.method] = true;
            }
        }
        
        return statusEffects;
    };
}
// Export the Effects class
module.exports = Effects;