const path = require('path');
const fs = require('fs');

class LibraryLoader {
    constructor(mod) {
        // Store the mod reference
        this.mod = mod;
        
        // Get the TeraToolbox root directory and data paths
        const toolboxPaths = this.findToolboxRoot();
        
        // Store the data directory for other modules to use
        this.dataDir = toolboxPaths.dataDir;
        this.modsDir = toolboxPaths.modsDir;
        
        // Check if we have access to the data directory
        if (fs.existsSync(this.dataDir)) {
            // Check for definitions and opcodes
            const defsDir = path.join(this.dataDir, 'definitions');
            const opcodesDir = path.join(this.dataDir, 'opcodes');
            
            if (fs.existsSync(defsDir)) {
                // Count definition files to verify access
                try {
                    const defFiles = fs.readdirSync(defsDir);
                    // Store the count
                    this.defFilesCount = defFiles.length;
                } catch (e) {
                    // Log the error with details but continue execution
                    console.warn(`[LibraryLoader] Warning: Could not read definition files: ${e.message}`);
                    console.debug(`[LibraryLoader] Error details: ${e.stack}`);
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
    
    // Find the TeraToolbox root directory by traversing up from the current directory
    findToolboxRoot() {
        let currentDir = __dirname;
        const MAX_LEVELS = 10;
        
        // Common directory structures to check
        const structures = [
            // patch100 structure: Toolbox Atlas patch 100.02
            (dir) => {
                if (fs.existsSync(path.join(dir, 'bin'))) {
                    const patch100Dir = path.join(dir, 'patch100');
                    if (fs.existsSync(patch100Dir) &&
                        fs.existsSync(path.join(patch100Dir, 'data')) &&
                        fs.existsSync(path.join(patch100Dir, 'mods'))) {
                        return {
                            root: dir,
                            dataDir: path.join(patch100Dir, 'data'),
                            modsDir: path.join(patch100Dir, 'mods')
                        };
                    }
                }
                return null;
            },
            // classic structure: Toolbox Atlas root is patch 34.04
            (dir) => {
                if (fs.existsSync(path.join(dir, 'bin')) &&
                    fs.existsSync(path.join(dir, 'data')) &&
                    fs.existsSync(path.join(dir, 'mods'))) {
                    return {
                        root: dir,
                        dataDir: path.join(dir, 'data'),
                        modsDir: path.join(dir, 'mods')
                    };
                }
                return null;
            }
        ];
        
        // Traverse up to MAX_LEVELS to find the TeraAtlas root
        for (let i = 0; i < MAX_LEVELS; i++) {
            // Check each structure pattern
            for (const checkStructure of structures) {
                const result = checkStructure(currentDir);
                if (result) return result;
            }
            
            // Move up one directory
            const parentDir = path.dirname(currentDir);
            
            // If we've reached the root of the filesystem, stop searching
            if (currentDir === parentDir) {
                break;
            }
            
            currentDir = parentDir;
        }
        
        // If we couldn't find the TeraAtlas root, return the current directory
        console.warn('[LibraryLoader] Warning: Could not find Toolbox root directory, using default');
        const defaultRoot = path.resolve(__dirname, '../../../..');
        return {
            root: defaultRoot,
            dataDir: path.join(defaultRoot, 'data'),
            modsDir: path.join(defaultRoot, 'mods')
        };
    }
    
    /*
     * Cleans up resources when the module is unloaded
     */
    destructor() {
        // Clear references to help with garbage collection
        this.library = null;
    }
}
// Export LibraryLoader class
module.exports = LibraryLoader;