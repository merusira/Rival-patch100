/*
 * Rival Mod - Action System
 * 
 * action.js handles player action states, stages, and reactions.
 * It tracks both client and server-side action states and provides an event-based
 * interface for other modules to respond to player actions.
 */
const hooks = require('../enums/hooks');
const EventEmitter = require('events');
/*
 * Action class
 * 
 * Extends EventEmitter to provide an event-based interface for tracking
 * player actions, stages, and reactions. Maintains separate state for
 * client and server-side action information.
 */
class Action extends EventEmitter {
    /*
     * Creates a new Action instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        super();
        
        this.mod = mod;
        this.mods = mods;
        
        // Initialize action state information
        this.info = {
            inAction: false,          // Whether player is in an action (client-side)
            lastStage: null,          // Last action stage (client-side)
            lastEnd: null,            // Last action end (client-side)
            speed: null,              // Current action speed
            effects: null,            // Current action effects
            inSpecialAction: false,   // Whether player is in a special action like a reaction
            keptMovingCharge: null,   // Stage at which moving charge was kept
            serverInAction: false,    // Whether player is in an action (server-side)
            serverStage: null,        // Last action stage (server-side)
            serverEnd: null           // Last action end (server-side)
        };

        // Register packet hooks for client-side events
        mod.hook(...mods.packet.get_all('S_ACTION_STAGE'), hooks.READ_DESTINATION_ALL_CLASS, this.actionStage(false));
        mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.READ_DESTINATION_ALL_CLASS, this.actionEnd(false));
        mod.hook(...mods.packet.get_all("S_EACH_SKILL_RESULT"), hooks.READ_DESTINATION_ALL_CLASS, this.sEachSkillResult(false));
        
        // Register packet hooks for server-side events
        mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_REAL, this.actionStage(true));
        mod.hook(...mods.packet.get_all("S_ACTION_END"), hooks.READ_REAL, this.actionEnd(true));
        mod.hook(...mods.packet.get_all("S_EACH_SKILL_RESULT"), hooks.READ_REAL, this.sEachSkillResult(true));
    }

    // Getter methods for action state

    /*
     * Checks if player is currently in an action (client-side)
     * @returns {boolean} Whether the player is currently in an action
     */
    get inAction() {
        return this.info.inAction;
    }

    /*
     * Checks if server considers player in an action
     * @returns {boolean} Whether the server considers the player in an action
     */
    get serverInAction() {
        return this.info.serverInAction;
    }

    /*
     * Checks if player is in a special action like a reaction
     * @returns {boolean} Whether the player is in a special action
     */
    get inSpecialAction() {
        return this.info.inSpecialAction;
    }

    /*
     * Gets the current action speed
     * @returns {number|null} The current action speed
     */
    get speed() {
        return this.info.speed;
    }

    /*
     * Gets the current action effects
     * @returns {Array|null} The current action effects
     */
    get effects() {
        return this.info.effects;
    }

    /*
     * Gets the last action stage (client-side)
     * @returns {Object|null} The last action stage
     */
    get stage() {
        return this.info.lastStage;
    }

    /*
     * Gets the last server action stage
     * @returns {Object|null} The last server action stage
     */
    get serverStage() {
        return this.info.serverStage;
    }

    /*
     * Gets the last action end (client-side)
     * @returns {Object|null} The last action end
     */
    get end() {
        return this.info.lastEnd;
    }

    /*
     * Gets the last server action end
     * @returns {Object|null} The last server action end
     */
    get serverEnd() {
        return this.info.serverEnd;
    }

    /*
     * Gets the stage at which moving charge was kept
     * @returns {number|null} The stage at which moving charge was kept
     */
    get keptMovingCharge() {
        return this.info.keptMovingCharge;
    }

    // Event handlers for action packets

    /*
     * Handles action stage events
     * @param {boolean} isServerPacket - Whether this is a server packet
     * @returns {Function} Handler function for action stage events
     */
    actionStage = isServerPacket => {
        return event => {
            // Skip if not the player
            if (!this.mods.player.isMe(event.gameId)) return;

            // Handle server-side action stage
            if (isServerPacket) {
                if (event.stage === 0) {
                    event._time = Date.now();
                } else {
                    event._time = this.serverStage._time;
                }
                this.info.serverInAction = true;
                this.info.serverStage = event;
                return;
            }

            // Handle client-side action stage
            this.info.inAction = true;
            this.info.inSpecialAction = false;
            
            // Check for moving charge skills
            if (this.mods.skills.getKeepMovingCharge(event.skill.id) && this.stage) {
                this.info.keptMovingCharge = this.stage.stage;
            }

            // Set timing information
            if (event.stage === 0) {
                event._time = Date.now();
                event._stageTime = Date.now();
                this.info.speed = this.mods.skills.getSpeed(event.skill.id);
                this.info.effects = this.mods.effects.getAppliedEffects(event.skill.id);
            } else {
                event._time = this.stage ? this.stage._time : Date.now();
                event._stageTime = Date.now();
            }
            
            this.info.lastStage = event;
        };
    };

    /*
     * Handles action end events
     * @param {boolean} isServerPacket - Whether this is a server packet
     * @returns {Function} Handler function for action end events
     */
    actionEnd = isServerPacket => {
        return event => {
            // Skip if not the player
            if (!this.mods.player.isMe(event.gameId)) return;

            // Handle server-side action end
            if (isServerPacket) {
                this.info.serverInAction = false;
                event._time = Date.now();
                this.info.serverEnd = event;
                return;
            }

            // Special handling for Corruption Ring (drain-type skill)
            if (event.skill.id === 20800 && event.type === 6) {
                // Ensure Corruption Ring is properly ended
                this.info.inAction = false;
                this.info.inSpecialAction = false;
                event._time = Date.now();
                this.info.lastEnd = event;
                
                // Log the successful end of Corruption Ring
                this.mods.log.debug("CORRUPTION_RING", "Successfully ended Corruption Ring action with type 6");
                return;
            }

            // Handle client-side action end
            this.info.inAction = false;
            this.info.inSpecialAction = false;
            event._time = Date.now();
            this.info.lastEnd = event;
        };
    };

    /*
     * Handles skill result events that may cause reactions
     * @param {boolean} isServerPacket - Whether this is a server packet
     * @returns {Function} Handler function for skill result events
     */
    sEachSkillResult = isServerPacket => {
        return event => {
            // Skip if not a reaction or not targeting the player
            if (!event.reaction.enable) return;
            if (this.mods.player.isMe(event.source)) return;
            if (!this.mods.player.isMe(event.target)) return;

            event.reaction._time = Date.now();

            // Handle server-side reaction
            if (isServerPacket) {
                this.info.serverInAction = true;
                this.info.serverStage = event.reaction;
                return;
            }

            // Handle client-side reaction
            this.emit("reaction", event.reaction);
            this.info.inAction = true;
            this.info.inSpecialAction = true;
            this.info.lastStage = event.reaction;
        };
    };

    /*
     * Cleans up resources when the module is unloaded
     * Removes event listeners to prevent memory leaks
     */
    destructor() {
        // Remove all event listeners
        this.removeAllListeners();
        
        // Clear hooks
        try {
            this.mod.unhook('S_ACTION_STAGE');
            this.mod.unhook('S_ACTION_END');
            this.mod.unhook('S_EACH_SKILL_RESULT');
        } catch (e) {
            // Ignore errors when unhooking
        }
        
        // Clear references
        this.info = null;
    }
}
// Export the Action class
module.exports = Action;