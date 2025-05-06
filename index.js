/*
 * Rival Mod - Core Module
 * 
 * index.js serves as the entry point for the Rival, providing core functionality
 * for module management, hot-reloading, and resource handling. It initializes the mod
 * environment and manages the lifecycle of all plugins and classes.
 */
const fs = require('fs');
const path = require('path');
/*
 * ModWrapper class
 * 
 * Provides utility methods and resource management for mod functionality.
 * Handles hooks, timers, and other mod resources to ensure proper cleanup.
 */
class ModWrapper {
    constructor(mod) {
        this._mod = mod;
        this.command = mod.command;
        this._timers = [];        // Stores all active timers for cleanup
        this._hooks = [];         // Stores all active hooks for cleanup
        this._timerId = 1;        // Unique ID counter for timers
    }

    // Getter for game instance
    get game() {
        return this._mod.game;
    }

    // Getter for patch version
    get patch() {
        return this._mod.majorPatchVersion;
    }

    // Getter for client mod
    get clientMod() {
        return this._mod.clientMod;
    }

    // Getter for require function
    get require() {
        return this._mod.require;
    }

    // Getter for dispatch
    get dispatch() {
        return this._mod.dispatch;
    }
    /*
    // Checks if server is MT (Menma's TERA)
    get isMenma() {
        return this._mod.serverList[this._mod.serverId].name.includes('MT');
    }
    */

    /*
     * Queries data from the mod
     * @returns {*} Query result
     */
    queryData = (...args) => {
        return this._mod.queryData(...args);
    };

    /*
     * Creates a hook and stores it for cleanup
     * @returns {Object} Hook instance
     */
    hook = (...args) => {
        const hookInstance = this._mod.hook(...args);
        this._hooks.push(hookInstance);
        return hookInstance;
    };

    /*
     * Creates a one-time hook that automatically unhooks after execution
     * @returns {Object} Hook instance
     */
    hookOnce = (...args) => {
        const callback = args.at(-1);
        const hookInstance = this.hook(...args.slice(0, -1), (...hookArgs) => {
            this.unhook(hookInstance);
            return callback(...hookArgs);
        });
        return hookInstance;
    };

    /*
     * Removes a hook from the active hooks list
     * @param {Object} hookInstance - The hook to remove
     * @returns {*} Result of unhook operation
     */
    unhook = (hookInstance) => {
        this._hooks = this._hooks.filter(hook => hook !== hookInstance);
        return this._mod.unhook(hookInstance);
    };

    /*
     * Gets timers within a specified time range, sorted by goal time
     * @param {number} targetTime - Target time to compare against
     * @param {number} tolerance - Acceptable time difference
     * @returns {Array} Sorted array of timers in range
     */
    _getSortedTimersInRange = (targetTime, tolerance) => {
        const timersInRange = [];
        for (let timer of this._timers) {
            if (timer.goal - tolerance <= targetTime && targetTime <= timer.goal + tolerance) {
                timersInRange.push(timer);
            }
        }
        
        return timersInRange.sort((timerA, timerB) => {
            if (timerA.goal === timerB.goal) return timerA.id - timerB.id;
            return timerA.goal - timerB.goal;
        });
    };

    /*
     * Creates a timeout with enhanced error handling and overflow protection
     * @param {Function} callback - Function to execute after timeout
     * @param {number} delay - Delay in milliseconds
     * @param {...*} args - Arguments to pass to callback
     * @returns {Object} Timer object
     */
    setTimeout = (callback, delay, ...args) => {
        const callStack = new Error();
        
        // Handle delay overflow
        if (delay > 0x7fffffff) {
            console.error("TimeoutOverflowWarning: " + delay);
            console.error(callStack.stack);
            delay = 0x7fffffff;
        }
        
        const TIMER_TOLERANCE = 15;
        let targetTime = Date.now() + delay;
        
        // Handle very large target times
        if (targetTime > 0x197e3d919e4) {
            targetTime += Math.floor(Math.random() * 2000);
            if (delay > 0x7fffffff) {
                delay = 0x7fffffff;
            }
        }
        
        // Timer execution function
        const executeTimer = () => {
            if (timerObj.cleared) return;
            
            const remainingTime = targetTime - Date.now();
            
            // Still significant time remaining
            if (remainingTime > TIMER_TOLERANCE) {
                timerObj.timer = setTimeout(executeTimer, remainingTime - TIMER_TOLERANCE);
                return;
            }
            
            // Small time remaining, use immediate execution
            if (remainingTime > 0) {
                timerObj.timer = setImmediate(executeTimer);
                return;
            }
            
            // Check if this timer should execute now (based on priority)
            const timersInRange = this._getSortedTimersInRange(targetTime, TIMER_TOLERANCE);
            if (timersInRange[0].id !== timerObj.id) {
                timerObj.timer = setImmediate(executeTimer);
                return;
            }
            
            // Execute the callback
            this.clearTimeout(timerObj);
            try {
                callback(...args);
            } catch (error) {
                console.log(callStack.stack);
                console.log("----------------");
                console.log(error);
            }
        };
        
        // Create and register the timer object
        const timerObj = {
            cleared: false,
            id: this._timerId++,
            goal: targetTime,
            timer: setImmediate(executeTimer),
            _onTimeout: () => callback(...args)
        };
        
        this._timers.push(timerObj);
        return timerObj;
    };

    /*
     * Creates an interval and stores it for cleanup
     * @returns {Object} Interval object
     */
    setInterval = (...args) => {
        const intervalObj = this._mod.setInterval(...args);
        this._timers.push(intervalObj);
        return intervalObj;
    };

    /*
     * Clears a timeout and removes it from the active timers list
     * @param {Object} timerObj - Timer to clear
     */
    clearTimeout = (timerObj) => {
        if (timerObj === undefined || timerObj === null || timerObj.timer === undefined) return;
        
        this._timers = this._timers.filter(timer => timer !== timerObj);
        clearTimeout(timerObj.timer);
        timerObj.cleared = true;
    };

    /*
     * Clears an interval and removes it from the active timers list
     * @param {Object} intervalObj - Interval to clear
     */
    clearInterval = (intervalObj) => {
        this._timers = this._timers.filter(timer => timer !== intervalObj);
        clearInterval(intervalObj);
    };

    /*
     * Sends data through the mod
     * @returns {*} Result of send operation
     */
    send = (...args) => {
        return this._mod.send(...args);
    };

    /*
     * Parses a system message
     * @returns {*} Parsed message
     */
    parseSystemMessage = (...args) => {
        return this._mod.parseSystemMessage(...args);
    };

    /*
     * Builds a system message
     * @returns {*} Built message
     */
    buildSystemMessage = (...args) => {
        return this._mod.buildSystemMessage(...args);
    };

    /*
     * Cleans up all resources (timers and hooks)
     */
    destructor = () => {
        // Clean up all timers
        for (const timer of [...this._timers]) {
            this.clearTimeout(timer);
            this.clearInterval(timer);
        }
        
        // Clean up all hooks
        for (const hook of this._hooks) {
            this._mod.unhook(hook);
        }
    };
}

/*
 * RivalEmulation class
 * 
 * Main class for managing modules and plugins. Handles loading, unloading,
 * and hot-reloading of modules.
 */
class RivalEmulation {
    constructor(mod) {
        this.mod = mod;
        
        // Load the internal library
        const LibraryLoader = require('./libs/classes/library-loader');
        const libraryLoader = new LibraryLoader(mod);
        const internalLibrary = libraryLoader.getLibrary();
        
        // Check that the internal library is loaded correctly
        if (!internalLibrary.rivalLib) {
            console.error('Rival will not load due to its library apparently being the wrong version.');
            console.error('Re-download a fresh copy of Rival off github.');
            console.error('==========================================');
            console.error('https://github.com/merusira/Rival-patch100');
            console.error('==========================================');
            return;
        }
        
        // Use the internal library instead of mod.require.library
        this.mods = {
            plugin: {},
            ...internalLibrary,
            // Ensure library functions are directly accessible for backward compatibility
            jsonStringify: internalLibrary.library.jsonStringify.bind(internalLibrary.library),
            positionsIntersect: internalLibrary.library.positionsIntersect.bind(internalLibrary.library),
            readFile: internalLibrary.library.readFile.bind(internalLibrary.library),
            arraysItemInArray: internalLibrary.library.arraysItemInArray.bind(internalLibrary.library),
            applyDistance: internalLibrary.library.applyDistance.bind(internalLibrary.library)
        };
        
        this.wrappers = {
            plugin: {}
        };
        
        this.addOpcodes();
        this.loadAllModules();
        this.setupWatcher();
    }

    /*
     * Adds opcodes for network communication
     */
    addOpcodes = () => {
        // Implementation to be added if needed
    };

    /*
     * Sets up file watcher for hot-reloading modules
     */
    setupWatcher = () => {
        let lastRenamedFile = null;
        let lastModifiedTimes = {};
        
        // Watch the libs directory for changes
        this.watcher = fs.watch(path.join(__dirname, "libs"), {
            recursive: true
        }, (eventType, filename) => {
            // Prevent reloading during startup
            if (this.start >= Date.now() - 10000) return;
            
            if (eventType === "rename") {
                lastRenamedFile = filename;
            }
            
            if (eventType !== "change") return;
            if (!filename) return;
            
            filename = filename.replace(__dirname, '');
            let pathParts = filename.split('\\');
            
            // Handle renamed files
            if (pathParts.length === 1 && lastRenamedFile) {
                filename = lastRenamedFile.replace(__dirname, '');
                pathParts = filename.split('\\');
            }
            
            if (pathParts.length < 2) return;
            if (pathParts[0] === "enums") return;
            
            const isPlugin = pathParts[0].includes("plugins");
            const moduleName = pathParts[1].replace(".js", '');
            const modulePath = './libs/' + pathParts[0] + '/' + moduleName;
            
            // Clear module from require cache
            try {
                delete require.cache[require.resolve(modulePath)];
            } catch (error) {}
            
            // Try to load the module
            let moduleClass = null;
            try {
                moduleClass = require(modulePath);
            } catch (error) {
                if (["MODULE_NOT_FOUND", "ENOENT"].includes(error.code)) {
                    console.log(`The ${isPlugin ? "plugin" : "class"} ${moduleName} has been removed.`);
                    return;
                } else {
                    throw error;
                }
            }
            
            // Skip if module has disabled reloading
            if (moduleClass?.DisableReloading) return;
            
            // Throttle reloads
            const currentTime = Date.now();
            if (currentTime - (lastModifiedTimes[moduleName] || 0) <= 1500) return;
            lastModifiedTimes[moduleName] = currentTime;
            
            const fullModulePath = ["libs", pathParts[0], moduleName].join('/');
            
            // Get existing module instance if available
            let existingModule = isPlugin && this.mods.plugin[moduleName] || !isPlugin && this.mods[moduleName];
            
            if (existingModule) {
                const unloadResult = this.unloadModule(fullModulePath);
                if (unloadResult) existingModule = unloadResult;
            }
            
            this.loadModule(fullModulePath, existingModule);
        });
    };

    /*
     * Loads a module from the specified path
     * @param {string} modulePath - Path to the module
     * @param {Object|boolean} existingModule - Existing module instance or false
     * @param {boolean} retryOnFail - Whether to retry loading on failure
     * @returns {Object|undefined} Module instance or undefined on failure
     */
    loadModule = (modulePath, existingModule = false, retryOnFail = true) => {
        const pathParts = modulePath.split('/');
        const isPlugin = pathParts[1].includes('plugins');
        const moduleName = pathParts[2];
        const modWrapper = new ModWrapper(this.mod);
        
        // Try to require the module
        let moduleClass = null;
        try {
            moduleClass = require('./' + modulePath);
        } catch (error) {
            if (["MODULE_NOT_FOUND", "ENOENT"].includes(error.code)) {
                console.log(`The ${isPlugin ? "plugin" : "class"} ${moduleName} has been removed.`);
                modWrapper.destructor();
                return;
            }
            throw error;
        }
        
        // Try to instantiate the module
        let moduleInstance = null;
        try {
            moduleInstance = new moduleClass(modWrapper, this.mods);
            console.log(`Loaded ${isPlugin ? "plugin" : "class"} ${moduleName}`);
        } catch (error) {
            if (!retryOnFail) {
                console.log(error);
                console.log(modulePath);
                console.log(moduleClass);
                console.log(`Failed to load ${isPlugin ? "plugin" : 'class'} ${moduleName}`);
            }
            
            if (retryOnFail) {
                setTimeout(this.loadModule, 100, modulePath, existingModule, false);
            }
            
            modWrapper.destructor();
            return;
        }
        
        // Store the module instance and wrapper
        if (isPlugin) {
            this.wrappers.plugin[moduleName] = modWrapper;
            this.mods.plugin[moduleName] = moduleInstance;
            
            if (existingModule && moduleInstance.loaded) {
                moduleInstance.loaded(existingModule);
            }
        } else {
            this.wrappers[moduleName] = modWrapper;
            this.mods[moduleName] = moduleInstance;
            
            if (existingModule && moduleInstance.loaded) {
                moduleInstance.loaded(existingModule);
            }
        }
    };

    /*
     * Unloads a module from the specified path
     * @param {string} modulePath - Path to the module
     * @returns {*} Result of the module's destructor or null
     */
    unloadModule = (modulePath) => {
        const pathParts = modulePath.split('/');
        const isPlugin = pathParts[1].includes('plugins');
        const moduleName = pathParts[2];
        
        console.log(`Unloading ${isPlugin ? 'plugin' : "class"} ${moduleName}`);
        
        let destructorResult = null;
        
        // Call the module's destructor if it exists
        if (isPlugin && this.mods.plugin[moduleName].destructor) {
            destructorResult = this.mods.plugin[moduleName].destructor();
        } else if (!isPlugin && this.mods[moduleName].destructor) {
            destructorResult = this.mods[moduleName].destructor();
        }
        
        // Clear module from require cache
        delete require.cache[require.resolve('./' + modulePath)];
        
        // Clean up module resources
        if (isPlugin) {
            this.wrappers.plugin[moduleName].destructor();
            delete this.wrappers.plugin[moduleName];
            delete this.mods.plugin[moduleName];
        } else {
            this.wrappers[moduleName].destructor();
            delete this.wrappers[moduleName];
            delete this.mods[moduleName];
        }
        
        return destructorResult;
    };

    /*
     * Loads all modules from the libs directory
     */
    loadAllModules = () => {
        this.start = Date.now();
        
        const moduleTypes = ["classes", "plugins", "custom_plugins", "user_plugins"];
        
        // Load each module type
        for (const moduleType of moduleTypes) {
            let files = null;

            // fs.readdirSync dynamically discovers what files exist in each directory, and loads only those.
            try {
                files = fs.readdirSync(path.join(__dirname, 'libs/' + moduleType));
            } catch (error) {
                if (error.code === 'ENOENT') continue;
                throw error;
            }
            
            // Load each file in the directory
            for (const file of files) {
                this.loadModule("libs/" + moduleType + '/' + file.replace(".js", ''));
            }
        }
    };

    /*
     * Cleans up all resources and unloads all modules
     */
    destructor = () => {
        if (this.watcher) {
            this.watcher.close();
        }
        
        // Unload all class modules
        for (const moduleName in this.wrappers) {
            if (moduleName === "plugin") continue;
            
            const wrapper = this.wrappers[moduleName];
            wrapper.destructor();
            
            const moduleInstance = this.mods[moduleName];
            if (!moduleInstance.destructor) continue;
            moduleInstance.destructor();
        }
        
        // Unload all plugin modules
        for (const pluginName in this.wrappers.plugin) {
            const wrapper = this.wrappers.plugin[pluginName];
            wrapper.destructor();
            
            const pluginInstance = this.mods.plugin[pluginName];
            if (!pluginInstance.destructor) continue;
            pluginInstance.destructor();
        }
    };
}
/*
 * Export module interfaces:
 * NetworkMod: Main RivalEmulation class for network functionality and module management
 * ClientMod: Datacenter class for game data access and queries
 * RequireInterface: Compatibility function for mod dependencies. The dispatch object in TERA Toolbox acts as
 * the main interface for packet handling, enabling mods to interact with network traffic. Rival exposes
 * only this object to dependent mods, limiting their access to internal functionality. This follows the
 * principle of least privilege, promoting modularity, preventing conflicts, and maintaining clean separation
 * between Rival and other mods
 */
module.exports.NetworkMod = RivalEmulation;
module.exports.ClientMod = require("./libs/classes/datacenter");
module.exports.RequireInterface = (mod, clientMod, dispatch) => dispatch;