/*
 * Rival Mod - Library Loader
 * 
 * library-loader.js serves as the initialization system for the Rival mod library.
 * It locates the TeraToolbox environment, loads the core library components,
 * and provides access to the library instance for other modules.
 */
const path = require('path');
const fs = require('fs');
/*
 * LibraryLoader class
 * 
 * Handles the initialization and loading of the Rival mod library system.
 * Locates TeraToolbox directories, loads the core library, and provides
 * access to the library instance for other modules.
 */
class LibraryLoader {
    /*
     * Creates a new LibraryLoader instance
     * @param {Object} mod - The mod API object for hooking events and sending packets
     */
    constructor(mod) {
        // Store the mod reference
        this.mod = mod;
        
        // Get the TeraAtlas root directory and data paths
        const atlasRootPaths = this._findToolboxRoot();
        
        // Store the data directory for other modules to use
        this.dataDir = atlasRootPaths.dataDir;    // Path to TeraAtlas data directory
        this.modsDir = atlasRootPaths.modsDir;    // Path to TeraAtlas mods directory
        
        // Check if we have access to the data directory
        if (fs.existsSync(this.dataDir)) {
            // Check for definitions and opcodes
            const defsDir = path.join(this.dataDir, 'definitions');
            
            if (fs.existsSync(defsDir)) {
                // Count definition files to verify access
                try {
                    const defFiles = fs.readdirSync(defsDir);
                    // Store the count but don't log it
                    this.defFilesCount = defFiles.length;
                } catch (e) {
                    // Silently handle error
                    this.defFilesCount = 0;
                }
            }
        }
        
        // Load the internal library
        const libraryPath = path.join(__dirname, '../library/index.js');
        const Library = require(libraryPath);
        
        // Create an instance of the library
        this.library = Library.NetworkMod(mod, true); // Pass true to force immediate loading of all modules
        
        // Add a method to get the library instance
        this.getLibrary = () => this.library;
    }
    
    /*
     * Finds the TeraAtlas root directory by traversing up from the current directory
     * @private
     * @returns {Object} Object containing root, dataDir, and modsDir paths
     */
    _findToolboxRoot() {
        let currentDir = __dirname;
        
        // Traverse up to 10 levels to find the TeraAtlas root
        for (let i = 0; i < 10; i++) {
            currentDir = path.dirname(currentDir);
            
            // Check for bin directory which indicates a TeraAtlas installation
            if (fs.existsSync(path.join(currentDir, 'bin'))) {
                // Check if patch100 structure exists (data and mods in patch100 subdirectory)
                const patch100Dir = path.join(currentDir, 'patch100');
                if (fs.existsSync(patch100Dir) &&
                    fs.existsSync(path.join(patch100Dir, 'data')) &&
                    fs.existsSync(path.join(patch100Dir, 'mods'))) {
                    return {
                        root: currentDir,
                        dataDir: path.join(patch100Dir, 'data'),
                        modsDir: path.join(patch100Dir, 'mods')
                    };
                }
                
                // Check for classic structure (data and mods in same directory as bin)
                if (fs.existsSync(path.join(currentDir, 'data')) &&
                    fs.existsSync(path.join(currentDir, 'mods'))) {
                    return {
                        root: currentDir,
                        dataDir: path.join(currentDir, 'data'),
                        modsDir: path.join(currentDir, 'mods')
                    };
                }
            }
            
            // If we've reached the root of the filesystem, stop searching
            if (currentDir === path.dirname(currentDir)) {
                break;
            }
        }
        
        // If we couldn't find the TeraAtlas root, return the default paths
        const defaultRoot = path.resolve(__dirname, '../../../..');
        return {
            root: defaultRoot,
            dataDir: path.join(defaultRoot, 'data'),
            modsDir: path.join(defaultRoot, 'mods')
        };
    }
}
// Export the LibraryLoader class
module.exports = LibraryLoader;