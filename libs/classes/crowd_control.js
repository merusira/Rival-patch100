/*
 * Rival Mod - Crowd Control System
 *
 * crowd_control.js manages restrictions on player actions due to crowd control effects.
 * It determines when skills can be cast based on current status effects like stuns,
 * fears, knockdowns, and other abnormalities that limit player actions.
 *
 * CrowdControl class
 *
 * Provides methods to check if skills can be cast based on current crowd control
 * effects applied to the player. Tracks fear states and integrates with the
 * abnormality system to handle various types of action restrictions.
 */
class CrowdControl {
    /*
     * Creates a new CrowdControl instance
     * @param {Object} mod - The main module
     * @param {Object} mods - Collection of module dependencies
     */
    constructor(mod, mods) {
        this.mod = mod;                // Reference to the mod object
        this.mods = mods;              // References to other modules
        
        // IDs of abnormalities that should be ignored when checking restrictions
        this.ignoredCCs = [
            10133020,                  // Specific abnormality to ignore
            10133021,                  // Specific abnormality to ignore
            909745                     // Specific abnormality to ignore
        ];
        
        // State information
        this.info = {
            feared: false              // Whether the player is currently feared
        };
    }

    // Skill casting restriction checks
    
    /*
     * Determines if a skill can be cast based on current crowd control effects
     * @param {number} skillId - The ID of the skill to check
     * @returns {number} 0 if skill can be cast, negative error code otherwise
     */
    canCastSkill = skillId => {
        // Get all active abnormalities that have effects
        const activeAbnormalities = this.mods.effects.getActiveAbnormalitiesWithEffect();
        
        // Check if this is a movement-type skill (type ID 27/0x1b)
        // Movement skills have special handling for some CC effects
        const isMovementSkill = this.mods.skills.getTypeId(skillId) === 27;
        
        // Step 1: Check abnormality-based restrictions
        // Iterate through all active abnormalities with effects
        for (const abnormality of activeAbnormalities) {
            // Skip abnormalities in the ignore list
            if (this.ignoredCCs.includes(abnormality?.id)) continue;
            
            // Check each effect of the abnormality
            for (const effect of abnormality?.AbnormalityEffect || []) {
                switch (effect.type) {
                // Stun effect (type 211/0xd3)
                case 211: {
                    // Get detailed abnormality data
                    const { status } = this.mods.effects.getAbnormality(abnormality.id);
                    
                    // Skip if status flag 16 is set (stun immunity)
                    if (status[16]) break;
                    
                    // Return stun restriction code
                    return -1211;
                }
                
                // Sleep effect (type 232)
                case 232:
                    // Return sleep restriction code
                    return -1232;
                
                // Root/Snare effect (type 274)
                case 274: {
                    // Movement skills can break root effects
                    if (isMovementSkill) break;
                    
                    // Return root restriction code for non-movement skills
                    return -1274;
                }
                }
            }
        }
        
        // Step 2: Check fear state
        if (this.info.feared) {
            // Return fear restriction code
            return -21;
        }
        
        // Step 3: Check knockdown state
        // Player is knocked down if they're in an action and that action is a knockdown
        const isKnockedDown = this.mods.action.inAction &&
                             this.mods.datacenter.isKnockDown(this.mods.action.stage.skill.id);
        
        // Step 4: Check special action states
        if (this.mods.action.inSpecialAction) {
            // Check for push effects
            if (this.mods.action.stage.push) {
                // Return push restriction code
                return -23;
            }
            
            // Check for animation sequences
            if (this.mods.action.stage.animSeq.length && !isKnockedDown) {
                // Debug logging for movement skills only
                if (isMovementSkill) {
                    this.mods.log.debug('CC - canCastSkill',
                        `inAction: ${this.mods.action.inAction} - ` +
                        `skillId: ${this.mods.action.stage.skill.id} - ` +
                        `isKnockedDown: ${isKnockedDown} - ` +
                        `isKnockDown: ${this.mods.datacenter.isKnockDown(this.mods.action.stage.skill.id)} - ` +
                        `inSpecialAction: ${this.mods.action.inSpecialAction} - ` +
                        `serverInAction: ${this.mods.action.serverInAction}`
                    );
                }
                
                // Return animation sequence restriction code
                return -24;
            }
        }
        
        // Step 5: Prevent non-movement skills during knockdown
        // Movement skills can be used to escape knockdown
        if (isKnockedDown && !isMovementSkill) {
            // Return knockdown restriction code
            return -22;
        }
        
        // No restrictions found, skill can be cast
        return 0;
    };

    // Fear state handlers
    
    /*
     * Handles the start of a fear movement effect
     * @param {Object} event - The fear movement event
     */
    fearmoveStage = event => {
        if (!this.mods.player.isMe(event.gameId)) return;
        this.info.feared = true;
    };

    /*
     * Handles the end of a fear movement effect
     * @param {Object} event - The fear movement event
     */
    fearmoveEnd = event => {
        if (!this.mods.player.isMe(event.gameId)) return;
        this.info.feared = false;
    };

    // State management methods
    
    /*
     * Updates the module's information when loaded
     * @param {Object} data - The data to load
     */
    loaded = data => {
        this.info = {
            ...this.info,
            ...data
        };
    };

    /*
     * Cleans up and returns the current state
     * @returns {Object} The current info state
     */
    destructor = () => {
        return this.info;
    };
}
// Export the CrowdControl class
module.exports = CrowdControl;