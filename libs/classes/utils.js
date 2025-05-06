/*
 * Rival Mod - Utility System
 * 
 * utils.js provides common utility functions and helper methods used throughout the Rival mod.
 * It includes skill ID parsing, position calculations, entity checks, and various helper
 * methods that simplify common operations across the codebase.
 *
 * SkillObject class
 * 
 * Represents a skill with ID, level, and sub-level components.
 * Provides methods to parse and manipulate skill IDs according to the game's format:
 * id = skill*10000 + level*100 + sub
 */
class SkillObject {
    /*
     * Creates a new SkillObject instance
     * @param {number} skillId - The complete skill ID to parse
     */
    constructor(skillId) {
        this.id = skillId;  // The complete skill ID
    }

    /*
     * Calculates a new skill ID from its components
     * @param {number} skillBase - The base skill number
     * @param {number} level - The skill level
     * @param {number} subLevel - The skill sub-level
     * @returns {number} The complete calculated skill ID
     */
    calculateNewId = (skillBase, level, subLevel) => {
        return skillBase * 10000 + level * 100 + subLevel;
    };

    // Skill component getters and setters

    /*
     * Sets the base skill number
     * @param {number} skillBase - The base skill number to set
     */
    set skill(skillBase) {
        this.id = this.calculateNewId(skillBase, this.level, this.sub);
    }

    /*
     * Gets the base skill number
     * @returns {number} The base skill number
     */
    get skill() {
        return Math.floor(this.id / 10000);
    }

    /*
     * Sets the skill level
     * @param {number} newLevel - The skill level to set
     */
    set level(newLevel) {
        this.id = this.calculateNewId(this.skill, newLevel, this.sub);
    }

    /*
     * Gets the skill level
     * @returns {number} The skill level
     */
    get level() {
        return Math.floor(this.id / 100) % 100;
    }

    /*
     * Sets the skill sub-level
     * @param {number} newSub - The skill sub-level to set
     */
    set sub(newSub) {
        this.id = this.calculateNewId(this.skill, this.level, newSub);
    }

    /*
     * Gets the skill sub-level
     * @returns {number} The skill sub-level
     */
    get sub() {
        return this.id % 100;
    }
}

/*
 * Utils class
 * 
 * Provides utility methods for various game mechanics and operations.
 * Includes helper functions for entity checks, position calculations,
 * skill management, and other common operations used throughout the mod.
 */
class Utils {
    /*
     * Creates a new Utils instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;      // Reference to the mod framework
        this.mods = mods;    // References to other modules
    }

    // Skill and module state methods

    /*
     * Checks if a skill or the module is enabled
     * @param {number} [skillId] - Optional skill ID to check
     * @returns {boolean} Whether the skill or module is enabled
     */
    isEnabled = (skillId) => {
        // Check if the module itself is enabled
        if (!this.mods.settings.enabled) return false;
        
        // Check if any skills are supported
        if (this.mods.skills.supportedCount === 0) return false;
        
        // If no specific skill is provided, return module state
        if (skillId === undefined) return true;
        
        // Check if the specific skill is supported
        return this.mods.skills.isSupported(skillId);
    };

    /*
     * Creates a SkillObject from a skill ID
     * @param {number} skillId - The skill ID to parse
     * @returns {SkillObject} A new SkillObject instance
     */
    getSkillInfo = (skillId) => {
        return new SkillObject(skillId);
    };

    // Entity and area check methods

    /*
     * Checks if an entity can be backstabbed
     * @param {number} entityId - The entity ID to check
     * @returns {boolean} Whether the entity can be backstabbed
     */
    canBackstabEntity = (entityId) => {
        const entityData = this.mods.entity.getEntityData(entityId);
        if (!entityData) return false;
        
        // Players can always be backstabbed
        if (this.mods.entity.players[entityId.toString()]) return true;
        
        // Check NPC data for backstab property
        const npcData = this.mods.datacenter.getNpcData(entityData.huntingZoneId, entityData.templateId);
        return !!(npcData || {}).backstab;
    };

    /*
     * Checks if player is in a PvP area
     * @returns {boolean} Whether the player is in a PvP area
     */
    isInPvpArea = () => {
        return this.mod.game.me.inBattleground || this.mod.game.me.inCivilUnrest;
    };

    /*
     * Determines if backstab is allowed in current area
     * @returns {boolean} Whether backstab is allowed
     */
    canBackstabInArea = () => {
        // Specific zone check (9950 = certain safe zone)
        if (this.mods.player.zone === 9950) return false;
        
        // PvP area checks
        if (this.mod.game.me.inBattleground) return false;
        if (this.mod.game.me.inCivilUnrest) return false;
        
        return true;
    };

    /*
     * Checks if player can cast skills
     * @returns {boolean} Whether the player can cast skills
     */
    canCastSkill = () => {
        // Players cannot cast skills while mounted
        if (this.mod.game.me.mounted) return false;
        return true;
    };

    /*
     * Gets the radius of a boss entity
     * @param {number} entityId - The entity ID to check
     * @returns {number|boolean} The entity radius or false if not found
     */
    getBossRadius = (entityId) => {
        const entityData = this.mods.entity.getEntityData(entityId);
        if (!entityData) return false;
        
        // Players have a fixed radius
        if (this.mods.entity.players[entityId.toString()]) return 25;
        
        // Get NPC radius or use default
        const npcData = this.mods.datacenter.getNpcData(entityData.huntingZoneId, entityData.templateId);
        return (npcData || {}).radius || 75;
    };

    /*
     * Checks if a position is near a boss
     * @param {Object} position - The position to check
     * @param {number} [maxDistance=75] - Maximum distance to consider
     * @returns {number|boolean} The entity ID if near, false otherwise
     */
    isNearBoss = (position, maxDistance = 75) => {
        const { mobs } = this.mods.entity;
        
        // Check each mob for intersection with position
        for (let entityId in mobs) {
            let mobData = mobs[entityId];
            if (this.mods.library.positionsIntersect(
                mobData.pos, 
                position, 
                maxDistance, 
                this.getBossRadius(entityId)
            )) {
                return entityId;
            }
        }
        
        return false;
    };

    /*
     * Checks if an entity can be locked on
     * @param {number} entityId - The entity ID to check
     * @returns {boolean} Whether the entity can be locked on
     */
    canLockonEntity = (entityId) => {
        // Currently always returns true for all entities
        return true;
        
        /* Unreachable code preserved for future implementation:
        const entityData = this.mods.entity.getEntityData(entityId);
        if (!entityData) return false;
        
        const npcData = this.mods.datacenter.getNpcData(entityData.huntingZoneId, entityData.templateId);
        return !!(npcData || {}).lockon;
        */
    };

    // Packet and network methods

    /*
     * Sends an instant move packet
     * @param {Object} [location] - The location to move to (defaults to current)
     * @param {number} [angle] - The angle to face (defaults to current)
     */
    sendInstantMove = (location, angle) => {
        this.mod.send(...this.mods.packet.get_all('S_INSTANT_MOVE'), {
            gameId: this.mods.player.gameId,
            loc: location || this.mods.position.loc,
            w: angle || this.mods.position.w
        });
    };

    /*
     * Calculates packet buffer time based on ping
     * @param {number} [additionalDelay=0] - Additional delay to add
     * @returns {number} The calculated buffer time in milliseconds
     */
    getPacketBuffer = (additionalDelay = 0) => {
        return this.mods.ping.ping + this.mods.ping.jitter + 100 + additionalDelay;
    };

    /*
     * Sends a system message to the client
     * @param {string} message - The message template
     * @param {Object} [params] - Parameters for the message
     */
    sendSystemMessage(message, params) {
        this.mod.send(...this.mods.packet.get_all("S_SYSTEM_MESSAGE"), {
            message: this.mod.buildSystemMessage(message, params)
        });
    }

    // Math and calculation methods

    /*
     * Rounds a number to specified decimal places
     * @param {number} value - The value to round
     * @param {number} [decimals=2] - Number of decimal places
     * @returns {number} The rounded value
     */
    round = (value, decimals = 2) => {
        const multiplier = Math.pow(10, decimals);
        return Math.floor(value * multiplier) / multiplier;
    };

    /*
     * Applies distance in a direction from a location
     * @param {Object} location - The starting location
     * @param {number} angle - The angle in radians
     * @param {number} distance - The distance to apply
     * @returns {Object} The new location
     */
    applyDistance = (location, angle, distance) => {
        const newLocation = location.clone();
        newLocation.x += Math.cos(angle) * distance;
        newLocation.y += Math.sin(angle) * distance;
        return newLocation;
    };

    // Utility methods

    /*
     * Creates a promise that resolves after specified milliseconds
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise} A promise that resolves after the specified time
     */
    sleep = (ms) => {
        return new Promise(resolve => {
            this.mod.setTimeout(resolve, ms);
        });
    };

    /*
     * Merges two objects recursively with depth limit to prevent stack overflow
     * @param {Object|Array|number|bigint} obj1 - First object to merge
     * @param {Object|Array|number|bigint} obj2 - Second object to merge
     * @param {Object} options - Merge options
     * @param {number} options.maxDepth - Maximum recursion depth (default: 10)
     * @param {boolean} options.mergeArraysByIndex - Whether to merge arrays by index instead of concatenating (default: false)
     * @param {number} options.currentDepth - Current recursion depth (internal use)
     * @returns {Object|Array|number|bigint} The merged result
     * @throws {Error} If types are different or unsupported
     */
    mergeTwoObjects = (obj1, obj2, options = {}) => {
        // Handle null/undefined values
        if (obj1 === null || obj1 === undefined) return obj2;
        if (obj2 === null || obj2 === undefined) return obj1;
        
        const type1 = typeof obj1;
        const type2 = typeof obj2;
        
        // Ensure types match
        if (type1 !== type2) {
            throw new Error('Cannot add two different types: ' + type1 + ' ' + type2);
        }
        
        // Set default options
        const maxDepth = options.maxDepth || 10;
        const mergeArraysByIndex = options.mergeArraysByIndex || false;
        const currentDepth = options.currentDepth || 0;
        
        // Check recursion depth limit
        if (currentDepth >= maxDepth) {
            return type1 === 'object' ? { ...obj1, ...obj2 } : obj1 + obj2;
        }
        
        // Create options for next recursion level
        const nextOptions = {
            maxDepth,
            mergeArraysByIndex,
            currentDepth: currentDepth + 1
        };
        
        switch (type1) {
            // Simple numeric addition for number types
            case "bigint":
                return obj1 + obj2;
            case "number":
                return obj1 + obj2;
            case 'object': {
                // Handle arrays
                if (Array.isArray(obj1)) {
                    if (mergeArraysByIndex) {
                        // Merge arrays by index
                        const result = [...obj1];
                        for (let i = 0; i < obj2.length; i++) {
                            if (i < result.length) {
                                // If both elements are objects, merge them
                                if (typeof result[i] === 'object' && result[i] !== null &&
                                    typeof obj2[i] === 'object' && obj2[i] !== null) {
                                    result[i] = this.mergeTwoObjects(result[i], obj2[i], nextOptions);
                                } else {
                                    // Otherwise use the second array's value
                                    result[i] = obj2[i];
                                }
                            } else {
                                // Add elements that don't exist in the first array
                                result.push(obj2[i]);
                            }
                        }
                        return result;
                    } else {
                        // Simple concatenation (original behavior)
                        return [...obj1, ...obj2];
                    }
                }
                
                // Handle regular objects
                const result = {};
                
                // Process all keys from both objects at once to avoid duplicate iteration
                const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
                
                for (const key of allKeys) {
                    if (!(key in obj2)) {
                        // Key only in obj1
                        result[key] = obj1[key];
                    } else if (!(key in obj1)) {
                        // Key only in obj2
                        result[key] = obj2[key];
                    } else {
                        // Key in both objects, merge recursively
                        result[key] = this.mergeTwoObjects(obj1[key], obj2[key], nextOptions);
                    }
                }
                
                return result;
            }
        }
        
        throw new Error("Unsupported type: " + type1);
    };

    /*
     * Performs a shallow equality check between two objects
     * @param {Object} obj1 - First object to compare
     * @param {Object} obj2 - Second object to compare
     * @returns {boolean} Whether the objects are shallowly equal
     */
    shallowEquals = (obj1, obj2) => {
        if (!obj1 || !obj2) return false;
        
        // Check if objects have the same number of keys
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        
        // Check if all keys have the same values
        for (const [key, value] of Object.entries(obj1)) {
            if (obj2[key] !== value) return false;
        }
        
        return true;
    };
}
// Export the Utils class
module.exports = Utils;