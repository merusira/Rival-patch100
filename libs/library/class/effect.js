/*
 * Rival Mod - Effect System
 * 
 * effect.js manages player buffs, abnormalities, and glyphs.
 * It tracks active effects on the player character and provides methods
 * to check for specific effects, supporting the combat and skill systems.
 */

// Default hook settings for all packet handlers
const DEFAULT_HOOK_SETTINGS = {order: 1000, filter: {fake: null}};
/*
 * Effect class
 * 
 * Tracks and manages all effects applied to the player character,
 * including abnormalities (buffs/debuffs), glyphs, and permanent buffs.
 * Provides an interface for other modules to query active effects.
 */
class Effect {
    /*
     * Creates a new Effect instance
     * @param {Object} mod - The mod API object for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        // Store references for later use
        this.dispatch = mod;          // Mod API object
        this.mods = mods;             // Module references
        
        // Effect tracking containers
        this.abnormals = {};          // Tracks active abnormalities (buffs/debuffs)
        this.glyphs = {};             // Tracks active glyphs
        this.permanentBuffs = {};     // Tracks "permanent" buffs
        
        // Initialize hooks if possible, otherwise they'll be initialized later
        this.initializeHooks();
    }
    
    /*
     * Initializes all packet hooks for effect tracking
     * Called during construction and can be called again if packet module becomes available later
     */
    initializeHooks() {
        // Skip if already initialized
        if (this.hooksInitialized) return;
        this.hooksInitialized = true;
        
        // Make sure mods and packet module are available
        if (!this.mods || !this.mods.packet || typeof this.mods.packet.get_all !== 'function') {
            console.log("[Effect] Warning: Packet module not available, effect tracking will be limited");
            return;
        }
        
        const dispatch = this.dispatch;
        const mods = this.mods;

        // Set up effect checking methods
        this._setupEffectMethods();
        
        // Reset all effect tracking on login
        this.reset = () => {
            this.abnormals = {};
            this.glyphs = {};
            this.permanentBuffs = {};
        };
        
        try {
            dispatch.hook('S_LOGIN', 'raw', DEFAULT_HOOK_SETTINGS, this.reset);
        } catch(e) {
            console.log("[Effect] Error hooking S_LOGIN:", e.message);
        }
        
        // Track permanent buff additions
        try {
            const holdAbnormalityPacket = mods.packet.get_all("S_HOLD_ABNORMALITY_ADD");
            if (holdAbnormalityPacket && holdAbnormalityPacket[1] !== null) {
                dispatch.hook(...holdAbnormalityPacket, DEFAULT_HOOK_SETTINGS, e => {
                    this.permanentBuffs[e.id] = true;
                });
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_HOLD_ABNORMALITY_ADD:", e.message);
        }
        
        // Track permanent buff clearing
        try {
            const clearAbnormalityPacket = mods.packet.get_all("S_CLEAR_ALL_HOLDED_ABNORMALITY");
            if (clearAbnormalityPacket && clearAbnormalityPacket[1] !== null) {
                dispatch.hook(...clearAbnormalityPacket, DEFAULT_HOOK_SETTINGS, () => {
                    this.permanentBuffs = {};
                });
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_CLEAR_ALL_HOLDED_ABNORMALITY:", e.message);
        }
        
        // Track full glyph information updates
        try {
            const crestInfoPacket = mods.packet.get_all("S_CREST_INFO");
            if (crestInfoPacket && crestInfoPacket[1] !== null) {
                dispatch.hook(...crestInfoPacket, DEFAULT_HOOK_SETTINGS, e => {
                    this.glyphs = {};
                    for (let glyph of e.crests) {
                        if (glyph.enable) this.glyphs[glyph.id] = true;
                    }
                });
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_CREST_INFO:", e.message);
        }
        
        // Track individual glyph changes
        try {
            const crestApplyPacket = mods.packet.get_all("S_CREST_APPLY");
            if (crestApplyPacket && crestApplyPacket[1] !== null) {
                dispatch.hook(...crestApplyPacket, DEFAULT_HOOK_SETTINGS, e => {
                    this.glyphs[e.id] = e.enable ? true : false;
                });
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_CREST_APPLY:", e.message);
        }
        
        // Handler for abnormality begin and refresh
        this.abnormalityApply = (e) => {
            // Safely check if player module is available
            if (mods.player && typeof mods.player.isMe === 'function' && mods.player.isMe(e.target)) {
                this.abnormals[e.id] = true;
            } else if (e.target && dispatch && dispatch.gameId === e.target) {
                // Fallback if player module is not available
                this.abnormals[e.id] = true;
            }
        };
        
        // Hook abnormality begin
        try {
            const abnormalityBeginPacket = mods.packet.get_all("S_ABNORMALITY_BEGIN");
            if (abnormalityBeginPacket && abnormalityBeginPacket[1] !== null) {
                dispatch.hook(...abnormalityBeginPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityApply);
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_ABNORMALITY_BEGIN:", e.message);
        }
        
        // Hook abnormality refresh
        try {
            const abnormalityRefreshPacket = mods.packet.get_all("S_ABNORMALITY_REFRESH");
            if (abnormalityRefreshPacket && abnormalityRefreshPacket[1] !== null) {
                dispatch.hook(...abnormalityRefreshPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityApply);
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_ABNORMALITY_REFRESH:", e.message);
        }
        
        // Handler for abnormality end
        this.abnormalityEnd = (e) => {
            // Safely check if player module is available
            if (mods.player && typeof mods.player.isMe === 'function' && mods.player.isMe(e.target)) {
                this.abnormals[e.id] = false;
            } else if (e.target && dispatch && dispatch.gameId === e.target) {
                // Fallback if player module is not available
                this.abnormals[e.id] = false;
            }
        };
        
        // Hook abnormality end
        try {
            const abnormalityEndPacket = mods.packet.get_all("S_ABNORMALITY_END");
            if (abnormalityEndPacket && abnormalityEndPacket[1] !== null) {
                dispatch.hook(...abnormalityEndPacket, DEFAULT_HOOK_SETTINGS, this.abnormalityEnd);
            }
        } catch(e) {
            console.log("[Effect] Error hooking S_ABNORMALITY_END:", e.message);
        }
    }
    
    /*
     * Sets up the effect checking methods
     * @private
     */
    _setupEffectMethods() {
        // Check if any effect type is active
        this.hasEffect = (id) => (this.glyphs[id] || this.permanentBuffs[id] || this.abnormals[id]);
        
        // Check specific effect types
        this.hasAbnormality = (id) => this.abnormals[id] === true;
        this.hasGlyph = (id) => this.glyphs[id] === true;
        this.hasBuff = (id) => this.permanentBuffs[id] === true;
        
        // Get all effects of a specific type
        this.getAbnormalities = () => this.abnormals;
        this.getGlyphs = () => this.glyphs;
        this.getBuffs = () => this.permanentBuffs;
    }
}
// Export the Effect class
module.exports = Effect;
