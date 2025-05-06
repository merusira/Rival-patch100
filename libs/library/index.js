/*
 * Rival Mod - Core Library
 * 
 * index.js serves as the main entry point for the Rival library system.
 * It initializes and manages core modules, providing a centralized interface
 * for accessing game state, entities, and player information.
 */

// Module loading configuration
const PRELOAD_MODULES = ['packet', 'library']; // Modules to load immediately
const STANDARD_MODULES = ['entity', 'player', 'effect']; // Modules to load after initialization
/*
 * Library class
 * 
 * Core class that initializes and manages all library modules.
 * Provides a unified interface for accessing game state and entities.
 */
class Library {
    /*
     * Creates a new Library instance
     * @param {Object} dispatch - The dispatch interface for hooking events and sending packets
     * @param {Object} arg1 - Optional initialization parameter or patch version indicator
     */
    constructor(dispatch, arg1) {
        this.rivalLib = true;        // Identifier for internal library
        this.mods = {};              // Container for all loaded modules
        this.command = dispatch.command; // Command interface
        this.cmd = this.command;     // Alias for command interface
        
        // Register the library instance globally for other modules to access
        if (!global.RivalLibrary) {
            global.RivalLibrary = this;
        }

        // Load essential modules first
        this._loadModules(dispatch, PRELOAD_MODULES);
        
        // Determine initialization mode based on arguments
        if (arg1 || dispatch.majorPatchVersion) {
            // Immediate initialization
            this._loadModules(dispatch, STANDARD_MODULES);
            this._initializeHooks();
        } else {
            // Delayed initialization on login
            dispatch.hook('C_LOGIN_ARBITER', 'raw', () => {
                this._loadModules(dispatch, STANDARD_MODULES);
                this._initializeHooks();
            });
        }
    }

    /*
     * Loads specified modules into the library
     * @param {Object} dispatch - The dispatch interface
     * @param {Array} moduleNames - Array of module names to load
     * @private
     */
    _loadModules(dispatch, moduleNames) {
        for (let name of moduleNames) {
            try {
                let ModuleClass = require(`./class/${name}`);
                this.mods[name] = new ModuleClass(dispatch, this.mods);
                this[name] = this.mods[name]; // Direct property access shortcut
            } catch (error) {
                console.log(`[Library] Failed to load module ${name}. Will close.`);
                throw error;
            }
        }
    }

    /*
     * Initializes hooks for all loaded modules
     * @private
     */
    _initializeHooks() {
        // Set up library hooks if available
        if (this.library && typeof this.library.setupHookLater === 'function') {
            this.library.setupHookLater();
        }
        
        // Initialize entity hooks if available
        if (this.entity && typeof this.entity.initializeHooks === 'function') {
            this.entity.initializeHooks();
        }
        
        // Initialize player hooks if available
        if (this.player && typeof this.player.initializeHooks === 'function') {
            this.player.initializeHooks();
        }
        
        // Initialize effect hooks if available
        if (this.effect && typeof this.effect.initializeHooks === 'function') {
            this.effect.initializeHooks();
        }
    }
}

/*
 * NetworkMod factory function
 * 
 * Creates and returns a new Library instance for network mods.
 * @param {Object} dispatch - The dispatch interface
 * @param {...any} args - Additional arguments to pass to the Library constructor
 * @returns {Library} A new Library instance
 */
module.exports.NetworkMod = function NetworkMod(dispatch, ...args) {
    // Attempt to locate the LibraryLoader in the global scope or parent module
    if (global.LibraryLoader === undefined) {
        try {
            // Try to get the LibraryLoader from the parent module
            const parentModule = module.parent;
            if (parentModule && parentModule.exports && parentModule.exports.getLibrary) {
                global.LibraryLoader = parentModule.exports;
                console.log("[Library] Found LibraryLoader in parent module");
            }
        } catch (error) {
            console.log("[Library] Error finding LibraryLoader:", error.message);
        }
    }
    
    return new Library(dispatch, ...args);
};

/*
 * RequireInterface function
 * 
 * Interface compatibility function that returns the network mod.
 * @param {Object} globalMod - Global mod reference
 * @param {Object} clientMod - Client mod reference
 * @param {Object} networkMod - Network mod reference
 * @returns {Object} The network mod reference
 */
module.exports.RequireInterface = (globalMod, clientMod, networkMod) => networkMod;
