/*
 * Rival Mod - Command System
 * 
 * command.js provides a command handling system for registering, executing, and managing
 * in-game commands. It serves as a central hub for all command-related functionality,
 * allowing other modules to register their own commands under the 'rival' namespace.
 *
 * Command class
 * 
 * Manages command registration and execution through a centralized system.
 * Provides methods for adding, removing, and executing commands, as well as
 * sending messages through the command interface.
 */
class Command {
    /*
     * Creates a new Command instance
     * @param {Object} dispatcher - The command dispatcher object from the mod system
     * @param {Object} mods - The mods object for accessing logging functionality
     */
    constructor(dispatcher, mods) {
        this.mods = mods;                // Reference to mod modules for logging
        this.command = dispatcher.command; // Reference to the base command system
        this.callbacks = {};             // Storage for registered command callbacks
        
        // Register the main 'rival' command that routes to registered callbacks
        this.command.add('rival', (callbackName, ...args) => {
            // Use default handler if no command specified
            if (!callbackName) callbackName = "$default";
            
            // Look up the registered callback
            const callback = this.callbacks[callbackName];
            if (!callback) {
                // Display error message with available commands if callback not found
                this.message(
                    "invalid command.", 
                    Object.keys(this.callbacks)
                        .filter(cmd => cmd !== "$default")
                        .join('/')
                );
                return;
            }
            
            // Execute the callback with provided arguments
            callback(...args);
        });
    }

    // Command registration and management methods

    /*
     * Registers a new command callback
     * @param {string} name - The name of the command
     * @param {Function} callback - The callback function to execute when command is invoked
     */
    add = (name, callback) => {
        // Log a warning if command is already registered
        if (this.callbacks[name]) {
            this.mods.log.debug("COMMAND", "Command already registered: " + name);
        }
        this.callbacks[name] = callback;
    };

    /*
     * Removes a registered command
     * @param {string} name - The name of the command to remove
     */
    remove = (name) => {
        delete this.callbacks[name];
    };

    // Command execution and messaging methods

    /*
     * Sends a message through the command system
     * @param {...any} args - Message arguments to be joined with spaces
     * @returns {*} Result from the command's message function
     */
    message = (...args) => {
        return this.command.message(args.join(' '));
    };

    /*
     * Executes a command directly
     * @param {...any} args - Arguments to pass to the command execution
     * @returns {*} Result from the command's exec function
     */
    exec = (...args) => {
        return this.command.exec(...args);
    };

    // Cleanup method

    /*
     * Cleans up resources when the command handler is destroyed
     * Removes the 'rival' command from the command system
     */
    destructor = () => {
        this.command.remove('rival');
    };
}
// Export the Command class
// DisableReloading flag prevents hot-reloading of this module
module.exports = Command;
module.exports.DisableReloading = true;