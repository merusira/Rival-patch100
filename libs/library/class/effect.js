/*
 * Rival Mod - Effect System
 * 
 * effect.js manages player effects, abnormalities, glyphs, and buffs.
 * It tracks the application and removal of various effects on the player character
 * and provides methods to query the current state of these effects.
 */

// Default hook settings for all packet hooks
const DEFAULT_HOOK_SETTINGS = { order: 1000, filter: { fake: null } };
/*
 * Effect class
 * 
 * Tracks and manages player effects including abnormalities, glyphs, and permanent buffs.
 * Provides an interface for other modules to query effect states and react to changes.
 */
class Effect {
    /*
     * Creates a new Effect instance
     * @param {Object} dispatch - The dispatch interface for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(dispatch, mods) {
        this.dispatch = dispatch;    // Dispatch interface for packet hooks
        this.mods = mods;            // Module references
        
        this.abnormals = {};         // Active abnormalities on player
        this.glyphs = {};            // Active glyphs on player
        this.permanentBuffs = {};    // Permanent buffs on player
        this.hooksInitialized = false; // Track if hooks have been initialized
        
        // Initialize hooks if possible (will be called again if packet module not yet available)
        this.initializeHooks();
    }
    
    /*
     * Initializes all packet hooks for tracking effects
     * This may be called multiple times, but will only initialize once
     */
    initializeHooks() {
        // Skip if already initialized
        if (this.hooksInitialized) return;
        
        // Make sure mods and packet module are available
        if (!this.mods || !this.mods.packet || typeof this.mods.packet.get_all !== 'function') {
            console.log("[Effect] Warning: Packet module not available, effect tracking will be limited");
            return;
        }
        
        this.hooksInitialized = true;
        const dispatch = this.dispatch;
        const mods = this.mods;

        // Set up all packet hooks with proper error handling
        this._setupResetHooks();
        this._setupPermanentBuffHooks();
        this._setupGlyphHooks();
        this._setupAbnormalityHooks();
    }
    
    // Effect query methods
    
    /*
     * Checks if player has any type of effect (abnormality, glyph, or buff)
     * @param {number} id - The effect ID to check
     * @returns {boolean} Whether the player has the effect
     */
    hasEffect(id) {
        return !!(this.glyphs[id] || this.permanentBuffs[id] || this.abnormals[id]);
    }
    
    /*
     * Checks if player has a specific abnormality
     * @param {number} id - The abnormality ID to check
     * @returns {boolean} Whether the player has the abnormality
     */
    hasAbnormality(id) {
        return this.abnormals[id] === true;
    }
    
    /*
     * Checks if player has a specific glyph
     * @param {number} id - The glyph ID to check
     * @returns {boolean} Whether the player has the glyph
     */
    hasGlyph(id) {
        return this.glyphs[id] === true;
    }
    
    /*
     * Checks if player has a specific permanent buff
     * @param {number} id - The buff ID to check
     * @returns {boolean} Whether the player has the buff
     */
    hasBuff(id) {
        return this.permanentBuffs[id] === true;
    }
    
    /*
     * Gets all active abnormalities
     * @returns {Object} Map of abnormality IDs to their state
     */
    getAbnormalities() {
        return this.abnormals;
    }
    
    /*
     * Gets all active glyphs
     * @returns {Object} Map of glyph IDs to their state
     */
    getGlyphs() {
        return this.glyphs;
    }
    
    /*
     * Gets all active permanent buffs
     * @returns {Object} Map of buff IDs to their state
     */
    getBuffs() {
        return this.permanentBuffs;
    }
    
    // Private hook setup methods
    
    /*
     * Sets up hooks for resetting effect state (login, etc.)
     * @private
     */
    _setupResetHooks() {
        // Reset function for clearing all effects
        this.reset = () => {
            this.abnormals = {};
            this.glyphs = {};
            this.permanentBuffs = {};
        };
        
        try {
            this.dispatch.hook('S_LOGIN', 'raw', DEFAULT_HOOK_SETTINGS, this.reset);
        } catch(error) {
            console.log("[Effect] Error hooking S_LOGIN:", error.message);
        }
    }
    
    /*
     * Sets up hooks for tracking permanent buffs
     * @private
     */
    _setupPermanentBuffHooks() {
        try {
            const holdAbnormalityPacket = this.mods.packet.get_all("S_HOLD_ABNORMALITY_ADD");
            if (holdAbnormalityPacket && holdAbnormalityPacket[1] !== null) {
                this.dispatch.hook(...holdAbnormalityPacket, DEFAULT_HOOK_SETTINGS, event => {
                    this.permanentBuffs[event.id] = true;
                });
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_HOLD_ABNORMALITY_ADD:", error.message);
        }

        try {
            const clearAbnormalityPacket = this.mods.packet.get_all("S_CLEAR_ALL_HOLDED_ABNORMALITY");
            if (clearAbnormalityPacket && clearAbnormalityPacket[1] !== null) {
                this.dispatch.hook(...clearAbnormalityPacket, DEFAULT_HOOK_SETTINGS, () => {
                    this.permanentBuffs = {};
                });
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_CLEAR_ALL_HOLDED_ABNORMALITY:", error.message);
        }
    }
    
    /*
     * Sets up hooks for tracking glyphs
     * @private
     */
    _setupGlyphHooks() {
        try {
            const crestInfoPacket = this.mods.packet.get_all("S_CREST_INFO");
            if (crestInfoPacket && crestInfoPacket[1] !== null) {
                this.dispatch.hook(...crestInfoPacket, DEFAULT_HOOK_SETTINGS, event => {
                    this.glyphs = {};
                    for (let glyph of event.crests) {
                        if (glyph.enable) this.glyphs[glyph.id] = true;
                    }
                });
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_CREST_INFO:", error.message);
        }

        try {
            const crestApplyPacket = this.mods.packet.get_all("S_CREST_APPLY");
            if (crestApplyPacket && crestApplyPacket[1] !== null) {
                this.dispatch.hook(...crestApplyPacket, DEFAULT_HOOK_SETTINGS, event => {
                    this.glyphs[event.id] = event.enable ? true : false;
                });
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_CREST_APPLY:", error.message);
        }
    }
    
    /*
     * Sets up hooks for tracking abnormalities
     * @private
     */
    _setupAbnormalityHooks() {
        // Handler for abnormality begin and refresh
        this.abnormalityApply = (event) => {
            // Safely check if player module is available
            if (this.mods.player && typeof this.mods.player.isMe === 'function' && this.mods.player.isMe(event.target)) {
                this.abnormals[event.id] = true;
            } else if (event.target && this.dispatch && this.dispatch.gameId === event.target) {
                // Fallback if player module is not available
                this.abnormals[event.id] = true;
            }
        };
        
        // Handler for abnormality end
        this.abnormalityEnd = (event) => {
            // Safely check if player module is available
            if (this.mods.player && typeof this.mods.player.isMe === 'function' && this.mods.player.isMe(event.target)) {
                this.abnormals[event.id] = false;
            } else if (event.target && this.dispatch && this.dispatch.gameId === event.target) {
                // Fallback if player module is not available
                this.abnormals[event.id] = false;
            }
        };
        
        // Hook abnormality begin
        try {
            const abnormalityBeginPacket = this.mods.packet.get_all("S_ABNORMALITY_BEGIN");
            if (abnormalityBeginPacket && abnormalityBeginPacket[1] !== null) {
                this.dispatch.hook(...abnormalityBeginPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityApply);
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_ABNORMALITY_BEGIN:", error.message);
        }
        
        // Hook abnormality refresh
        try {
            const abnormalityRefreshPacket = this.mods.packet.get_all("S_ABNORMALITY_REFRESH");
            if (abnormalityRefreshPacket && abnormalityRefreshPacket[1] !== null) {
                this.dispatch.hook(...abnormalityRefreshPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityApply);
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_ABNORMALITY_REFRESH:", error.message);
        }

        // Hook abnormality end
        try {
            const abnormalityEndPacket = this.mods.packet.get_all("S_ABNORMALITY_END");
            if (abnormalityEndPacket && abnormalityEndPacket[1] !== null) {
                this.dispatch.hook(...abnormalityEndPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityEnd);
            }
        } catch(error) {
            console.log("[Effect] Error hooking S_ABNORMALITY_END:", error.message);
        }
    }
}
// Export the Effect class
module.exports = Effect;
