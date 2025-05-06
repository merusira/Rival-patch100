/*
 * Rival Mod - Game Mechanics
 * 
 * hardcoded.js serves as a specialized handler for class-specific and skill-specific behaviors.
 * It manages exceptional cases and game mechanics that cannot be determined from normal game data
 * and require custom implementation for proper functionality.
 */
const classes = require("../enums/classes");
/*
 * Hardcoded class
 * 
 * Provides methods for handling class-specific and skill-specific behaviors that
 * require special treatment outside of the standard game data processing.
 * Acts as a repository of edge cases and special rules for various classes and skills.
 */
class Hardcoded {
    /*
     * Creates a new Hardcoded instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;        // Reference to the mod framework
        this.mods = mods;      // References to other modules
    }

    // Skill animation and timing methods

    /*
     * Gets the animation length for specific skills
     * @param {number} skillId - The skill ID
     * @param {any} unk1 - Unknown parameter 1
     * @param {any} unk2 - Unknown parameter 2
     * @returns {number|undefined} Animation length in milliseconds
     */
    getAnimationLength = (skillId, unk1, unk2) => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific animation lengths
        switch (this.mods.player.job) {
        case classes.GUNNER: {
            switch (skillInfo.skill) {
            case 21: {
                return 1950;   // Gunner skill 21 has a fixed animation length
            }
            }
            break;
        }
        }
        
        // Return undefined for skills without hardcoded animation lengths
        return undefined;
    };
    
    /*
     * Gets the delay time for specific skills
     * @param {number} skillId - The skill ID
     * @param {Object} options - Options object
     * @param {boolean} options.byGrant - Whether the skill is granted
     * @param {boolean} options.press - Whether the skill is pressed
     * @returns {number} Delay time in milliseconds
     */
    getSkillDelayTime = (skillId, {
        byGrant,
        press
    }) => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific delay times
        switch (this.mods.player.job) {
        case classes.GUNNER: {
            // Special case for Gunner skill 9 when used after skill 5
            if (skillInfo.skill === 9) {
                const currentSkillInfo = this.mods.utils.getSkillInfo(this.mods.action.stage.skill.id);
                if (currentSkillInfo.skill === 5 && 
                    [1, 11, 21].includes(currentSkillInfo.sub) && 
                    this.mods.player.stamina >= 230) {
                    return 120;  // Reduced delay for skill chaining with sufficient stamina
                }
            }
            break;
        }
        }
        
        // Default delay time
        return 0;
    };

    // Skill behavior and control methods
    
    /*
     * Checks if a skill is supported by the module
     * @param {number} skillId - The skill ID
     * @returns {boolean|undefined} Whether the skill is supported
     */
    isSupported = skillId => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific skill support flags
        switch (this.mods.player.job) {
        case classes.BRAWLER: {
            switch (skillInfo.skill) {
            case 17:
                return false;  // Brawler skill 17 is not supported
            }
            break;
        }
        case classes.REAPER: {
            switch (skillInfo.skill) {
            case 15:
                return false;  // Reaper skill 15 is not supported
            }
            break;
        }
        }
        
        // Return undefined for skills without hardcoded support flags
        return undefined;
    };
    
    /*
     * Gets the retry count for specific skills
     * @param {number} skillId - The skill ID
     * @returns {number} Number of retries allowed
     */
    getRetryCount = skillId => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific retry counts
        switch (this.mods.player.job) {
        case classes.LANCER: {
            if (skillInfo.skill === 2) return 0;   // No retries for Lancer skill 2
            if (skillInfo.skill === 29) return 0;  // No retries for Lancer skill 29
            break;
        }
        case classes.BERSERKER: {
            if (skillInfo.skill === 36) return 0;  // No retries for Berserker skill 36
            break;
        }
        case classes.WARRIOR: {
            switch (skillInfo.skill) {
            case 29:
            case 37: {
                // No retries for Warrior skills 29 and 37 with abnormality 100201
                if (this.mods.effects.getAbnormality(100201)) return 0;
                break;
            }
            case 40:
                return 20;  // 20 retries for Warrior skill 40
            }
            break;
        }
        case classes.NINJA: {
            // No retries for specific Ninja skills
            if (skillInfo.skill === 21 && [50, 51].includes(skillInfo.sub)) return 0;
            if (skillInfo.skill === 9 && skillInfo.sub === 31) return 0;
            break;
        }
        case classes.GUNNER: {
            // 9 retries for Gunner skill 5 with specific sub-skills
            if (skillInfo.skill === 5 && [1, 11, 21].includes(skillInfo.sub)) return 9;
            break;
        }
        case classes.REAPER: {
            // No retries for Reaper skill 4 sub 61
            if (skillInfo.skill === 4 && skillInfo.sub === 61) return 0;
            break;
        }
        }
        
        // No retries for skills with "notimeline" type
        if (this.mods.skills.getType(skillId) === "notimeline") return 0;
        
        // Default to -1 (use game default)
        return -1;
    };
    
    /*
     * Gets the retry delay for specific skills
     * @param {number} skillId - The skill ID
     * @returns {number} Delay between retries in milliseconds
     */
    getRetryDelay = skillId => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific retry delays
        switch (this.mods.player.job) {
        case classes.GUNNER: {
            // Reduced retry delay for Gunner skill 5 with sufficient stamina
            if (skillInfo.skill === 5 && 
                [1, 11, 21].includes(skillInfo.sub) && 
                this.mods.player.stamina >= 230) {
                return 5;  // Very short delay for rapid retries
            }
            break;
        }
        }
        
        // Default retry delay
        return 20;
    };
    
    /*
     * Checks if future retries are allowed for specific skills
     * @param {number} skillId - The skill ID
     * @returns {boolean} Whether future retries are allowed
     */
    getAllowThroughFutureRetry = skillId => {
        const skillInfo = this.mods.utils.getSkillInfo(skillId);
        
        // Handle class-specific future retry flags
        switch (this.mods.player.job) {
        case classes.GUNNER: {
            // Allow future retries for Gunner skill 5 with sufficient stamina
            if (skillInfo.skill === 5 && 
                [1, 11, 21].includes(skillInfo.sub) && 
                this.mods.player.stamina >= 230) {
                return true;
            }
            break;
        }
        }
        
        // Default to not allowing future retries
        return false;
    };
    
    /*
     * Checks if a skill can be cast
     * @param {number} skillId - The skill ID
     * @returns {number} Result code (-1 indicates default behavior)
     */
    canCast = skillId => {
        // Currently uses default behavior for all skills
        // Return -1 to indicate that the game should use its default logic
        return -1;
    };
}
// Export the Hardcoded class
module.exports = Hardcoded;