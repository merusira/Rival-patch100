/*
 * Rival Mod - Position Tracking
 * 
 * position.js serves as the player position management system for the Rival mod.
 * It tracks and updates player location data, handles reaction position requests,
 * and provides accurate position information to other modules in the system.
 */
const hooks = require("../enums/hooks");
/*
 * PositionChecker class
 * 
 * Manages player position data throughout gameplay, ensuring accurate tracking
 * of location and orientation. Coordinates with the server to maintain position
 * synchronization and provides position data to other modules.
 */
class PositionChecker {
    /*
     * Creates a new PositionChecker instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;      // Reference to the mod framework
        this.mods = mods;    // References to other modules
        
        // Initialize position tracking info
        this.info = {
            enabled: true,       // Whether position tracking is enabled
            reaction: {},        // Current reaction position
            w: 0,                // Current orientation/angle
            lastUpdate: {},      // Last updated position
            timer: null          // Timer for position tick requests
        };

        // Register event hooks
        
        // Core hooks
        mod.hook('S_LOGIN', "event", this.loaded);
        
        // Reaction position hooks
        mod.hook(
            ...mods.packet.get_all("C_UPDATE_REACTION_POS"),
            hooks.MODIFY_REAL,
            this.updateReactionPos
        );
        
        mod.hook(
            ...mods.packet.get_all("S_REQUEST_REACTION_POS_TICK"),
            hooks.MODIFY_REAL,
            this.requestReactionPosTick
        );
        
        // Player location hooks
        mod.hook(
            ...mods.packet.get_all("C_PLAYER_LOCATION"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.playerLocation
        );
        
        mod.hook(
            ...mods.packet.get_all("C_NOTIFY_LOCATION_IN_ACTION"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.playerLocation
        );
        
        mod.hook(
            ...mods.packet.get_all("S_INSTANT_MOVE"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.instantMove
        );
        
        // Action hooks
        mod.hook(
            ...mods.packet.get_all("S_ACTION_STAGE"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.actionToClient
        );
        
        mod.hook(
            ...mods.packet.get_all("S_ACTION_END"),
            hooks.READ_DESTINATION_ALL_CLASS,
            this.actionToClient
        );
    }

    // Position getter methods

    /*
     * Gets the current player location
     * @returns {Object} Current player position coordinates
     */
    get loc() {
        return this.getCurrentPosition();
    }

    /*
     * Gets the current player orientation/angle
     * @returns {number} Current player orientation in radians
     */
    get w() {
        return this.info.w;
    }

    /*
     * Returns the current player position
     * @returns {Object} Current reaction position coordinates
     */
    getCurrentPosition = () => {
        return this.info.reaction;
    };

    // Position update handlers

    /*
     * Updates player location data
     * @param {Object} locationData - The location data object
     */
    playerLocation = (locationData) => {
        // Update reaction position
        this.info.reaction = locationData.loc;
        
        // Only update orientation if not in action or if this is a skill-related update
        if (!this.mods.action.inAction || locationData.skill) {
            this.info.w = locationData.w;
        }
    };

    /*
     * Handles instant movement updates
     * @param {Object} moveData - The movement data object
     */
    instantMove = (moveData) => {
        // Only process for the current player
        if (!this.mods.player.isMe(moveData.gameId)) {
            return;
        }
        
        // Update reaction position
        this.info.reaction = moveData.loc;
    };

    /*
     * Processes action data sent to the client
     * @param {Object} actionData - The action data object
     */
    actionToClient = (actionData) => {
        // Only process for the current player
        if (!this.mods.player.isMe(actionData.gameId)) {
            return;
        }
        
        // Update orientation and position
        this.info.w = actionData.w;
        this.info.reaction = actionData.loc;
    };

    // Reaction position management

    /*
     * Updates the player's reaction position
     * @param {Object} posData - The position data object
     * @returns {boolean} - False if enabled, undefined otherwise
     */
    updateReactionPos = (posData) => {
        // Update reaction and last update positions
        this.info.reaction = posData.loc;
        this.info.lastUpdate = posData.loc;
        
        // Return false to block the packet if enabled
        if (this.info.enabled) {
            return false;
        }
    };

    /*
     * Handles reaction position tick requests
     * @param {Object} tickData - The tick data object
     * @returns {boolean} - Whether the request was processed
     */
    requestReactionPosTick = (tickData) => {
        if (tickData.tick) {
            // Disable position tracking if tick is provided
            this.info.enabled = false;
        } else {
            // Enable position tracking and set tick value
            this.info.enabled = true;
            tickData.tick = 50; // Set tick rate to 50ms
            return true;
        }
    };

    // Lifecycle methods

    /*
     * Initializes the position checker when player is loaded
     */
    loaded = () => {
        // Set up timer for position tick requests
        this.info.timer = this.mod.setInterval(() => {
            // Skip if position tracking is disabled
            if (!this.info.enabled) {
                return;
            }
            
            // Send position tick request
            this.mod.send(...this.mods.packet.get_all("S_REQUEST_REACTION_POS_TICK"), {
                tick: 50 // Request tick rate of 50ms
            });
        }, 500); // Check every 500ms
    };

    /*
     * Cleans up resources when the module is unloaded
     * @returns {void}
     */
    destructor = () => {
        // Clear the timer to prevent memory leaks
        this.mod.clearInterval(this.info.timer);
    };
}
// Export the PositionChecker class
module.exports = PositionChecker;