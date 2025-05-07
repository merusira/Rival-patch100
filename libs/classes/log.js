/*
 * Rival Mod - Logging System
 * 
 * log.js serves as the central logging facility for the Rival mod.
 * It provides methods for debug and error logging, maintains a history of messages,
 * and offers functionality to save logs to files for troubleshooting.
 */
const fs = require('fs');
const path = require("path");
/*
 * Log class
 * 
 * Handles all logging operations including debug messages, errors, and log history.
 * Provides commands for toggling debug mode and saving logs to files.
 */
class Log {
    /*
     * Creates a new Log instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;          // Reference to the mod framework
        this.mods = mods;        // References to other modules
        this._history = [];      // Array to store log history
        
        // Register commands
        mods.command.add("save", this.save);       // Command to save logs to file
        mods.command.add("debug", this.toggleDebug); // Command to toggle debug mode
    }

    // Logging methods

    /*
     * Logs debug messages if debug mode is enabled
     * @param {string} category - The category/source of the debug message
     * @param {...any} messages - Messages to log
     */
    debug = (category, ...messages) => {
        const timestamp = Date.now();
        const dateObj = new Date(timestamp);
        
        // Format: [Rival][time][milliseconds][category]
        const prefix = `[Rival][${dateObj.toLocaleTimeString()}][${timestamp % 100000}][${category}]`;
        
        // Add to history regardless of debug setting
        this.addToHistory(prefix, ...messages);
        
        // Only output to console if debug mode is enabled
        if (!this?.mods?.settings?.debug) return;
        console.log(prefix, ...messages);
    };

    /*
     * Logs error messages (always displayed regardless of debug setting)
     * @param {string} category - The category/source of the error
     * @param {...any} messages - Error messages to log
     */
    error = (category, ...messages) => {
        const timestamp = Date.now();
        const dateObj = new Date(timestamp);
        
        // Format: [Rival][time][milliseconds][category]
        const prefix = `[Rival][${dateObj.toLocaleTimeString()}][${timestamp % 100000}][${category}]`;
        
        // Add to history and always display in console
        this.addToHistory(prefix, ...messages);
        console.log(prefix, ...messages);
    };

    // History management methods

    /*
     * Adds messages to the history log with automatic trimming
     * @param {...any} messages - Messages to add to history
     */
    addToHistory = (...messages) => {
        // Add new messages to history
        this._history.push(messages);
        
        // Limit history to 400 entries to prevent memory issues
        const MAX_HISTORY_SIZE = 400;
        if (this._history.length > MAX_HISTORY_SIZE) {
            this._history.splice(0, this._history.length - MAX_HISTORY_SIZE);
        }
    };

    /*
     * Saves the log history to a file
     * @param {...any} args - Optional filename components, defaults to timestamp if none provided
     */
    save = (...args) => {
        let filename;
        
        // Generate filename from arguments or use timestamp
        if (!args.length) {
            filename = Date.now();
        } else {
            filename = args.join(' ');
        }
        
        // Create logs directory if it doesn't exist
        try {
            fs.mkdirSync(path.join(__dirname, "../../logs"));
        } catch (error) {
            // Directory likely already exists, continue
        }
        
        // Convert history entries to strings and write to file
        const logContent = this._history.map(entry => 
            entry.map(item => 
                typeof item === "object" 
                    ? this.mods.library.jsonStringify(item) 
                    : item
            ).join(' ')
        ).join('\n');
        
        // Write log to file
        const logPath = path.join(__dirname, `../../logs/${filename}.txt`);
        fs.writeFileSync(logPath, logContent);
        
        // Notify user of successful save
        this.mods.command.message(`Saved log to [Rival]/logs/${filename}.txt`);
    };

    // Configuration methods

    /*
     * Toggles debug mode on/off
     * Enables or disables console output for debug messages
     */
    toggleDebug = () => {
        // Toggle debug setting
        this.mods.settings.debug = !this.mods.settings.debug;
        
        // Notify user of the change
        this.mods.command.message(
            "Debugging has been turned", 
            this.mods.settings.debug ? 'on' : 'off'
        );
    };

    // Cleanup methods

    /*
     * Cleanup method to remove commands when no longer needed
     * Called when the module is unloaded
     */
    destructor = () => {
        // Remove registered commands
        this.mods.command.remove('save');
        this.mods.command.remove("debug");
    };
}
// Export the Log class
module.exports = Log;