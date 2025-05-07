/*
 * Rival Mod - Core Library System
 * 
 * index.js serves as the main entry point for the Rival mod library system.
 * It initializes and manages module loading, provides access to core functionality,
 * and establishes the foundation for all other mod components.
 */

// Module loading configuration
const PRE_LOAD_MODULES = ['packet', 'library'];  // Modules loaded immediately
const LOAD_MODULES = ['entity', 'player', 'effect'];  // Modules loaded after initialization
/*
 * Library class
 * 
 * Core class that manages the loading and initialization of all mod modules.
 * Provides a centralized access point for all functionality and maintains
 * references to loaded modules.
 */
class Library {
    /*
     * Creates a new Library instance
     * @param {Object} mod - The mod API object for hooking events and sending packets
     * @param {*} forceLoad - Optional argument that forces immediate module loading when present
     */
    constructor(mod, forceLoad) {
        this.rivalLib = true;        // Identifier for internal library
        this.mods = {};              // Container for all loaded modules
        this.command = mod.command;  // Command interface
        this.cmd = this.command;     // Alias for command interface
        
        // Register library instance globally for other modules to access
        if (!global.RivalLibrary) {
            global.RivalLibrary = this;
        }

        // Load essential modules first
        this._loadModules(mod, PRE_LOAD_MODULES);
        
        // Determine loading strategy based on arguments
        if (forceLoad || mod.majorPatchVersion) {
            // Immediate loading
            this._loadAllModules(mod);
            this._initializeHooks();
        } else {
            // Deferred loading until login
            mod.hook('C_LOGIN_ARBITER', 'raw', () => {
                this._loadAllModules(mod);
                this._initializeHooks();
            });
        }
    }
    
    /*
     * Loads specified modules
     * @param {Object} mod - The mod API object
     * @param {Array} moduleNames - Array of module names to load
     * @private
     */
    _loadModules(mod, moduleNames) {
        for (let name of moduleNames) {
            try {
                let ModuleClass = require(`./class/${name}`);
                this.mods[name] = new ModuleClass(mod, this.mods);
                this[name] = this.mods[name];  // Add direct reference to library instance
            } catch (e) {
                console.log(`[Library] Failed to load module ${name}. Will close.`);
                throw e;
            }
        }
    }
    
    /*
     * Loads all remaining modules
     * @param {Object} mod - The mod API object
     * @private
     */
    _loadAllModules(mod) {
        this._loadModules(mod, LOAD_MODULES);
    }
    
    /*
     * Initializes hooks for all loaded modules
     * @private
     */
    _initializeHooks() {
        // Set up library hooks
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
 * Creates and returns a new Library instance
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {...*} args - Additional arguments to pass to the Library constructor
 * @returns {Library} A new Library instance
 */
function NetworkMod(mod, ...args) {
    // Try to locate the LibraryLoader in the global scope or parent module
    if (global.LibraryLoader === undefined) {
        try {
            const parentModule = module.parent;
            if (parentModule && parentModule.exports && parentModule.exports.getLibrary) {
                global.LibraryLoader = parentModule.exports;
                console.log("[Library] Found LibraryLoader in parent module");
            }
        } catch (e) {
            console.log("[Library] Error finding LibraryLoader:", e.message);
        }
    }
    
    return new Library(mod, ...args);
}

/*
 * Interface selection function that returns the network mod
 * @param {Object} globalMod - Global mod reference
 * @param {Object} clientMod - Client mod reference
 * @param {Object} networkMod - Network mod reference
 * @returns {Object} The network mod reference
 */
function RequireInterface(globalMod, clientMod, networkMod) {
    return networkMod;
}
// Export the module interfaces
module.exports.NetworkMod = NetworkMod;
module.exports.RequireInterface = RequireInterface;
