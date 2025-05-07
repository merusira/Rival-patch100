/*
 * Rival Mod - Configuration System
 * 
 * settings.js serves as the configuration management system for the Rival mod.
 * It handles loading and saving settings, provides command handlers for changing
 * configuration values, and exposes settings through getters and setters.
 */
const fs = require('fs');
const path = require('path');
/*
 * Settings class
 * 
 * Manages all configuration aspects of the Rival mod, including persistence
 * to disk, command handling for user configuration, and runtime access to
 * settings values. Acts as the central source of truth for mod configuration.
 */
class Settings {
    /*
     * Creates a new Settings instance
     * @param {Object} mod - The mod wrapper object
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        this.mod = mod;      // Reference to the mod framework
        this.mods = mods;    // References to other modules

        // Default configuration values
        const defaultConfig = {
            enabled: true,   // Whether the mod is enabled
            block: true,     // Whether smooth block is enabled
            jaunt: true,     // Whether jaunt emulation is enabled
            debug: false,    // Whether debug mode is enabled
            dash: 25,        // Dash distance/speed value
            delay: 0         // Artificial delay in milliseconds
        };

        try {
            // Load configuration from file, merging with defaults
            const loadedConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf-8'));
            this.info = Object.assign({}, defaultConfig, loadedConfig);
        } catch (error) {
            // Use defaults if config file can't be loaded
            this.info = defaultConfig;
        }

        // Register command handlers
        this.mods.command.add('$default', this.toggle); // Default command toggles mod
        this.mods.command.add('on', this.on);           // Turn mod on
        this.mods.command.add('off', this.off);         // Turn mod off
        this.mods.command.add('block', this.block);     // Toggle smooth block
        this.mods.command.add('delay', this.delay);     // Set artificial delay
        this.mods.command.add('jaunt', this.jaunt);     // Toggle jaunt emulation
    }

    // Command handlers

    /*
     * Toggles the module's enabled state
     */
    toggle = () => {
        this.info.enabled = !this.info.enabled;
        this.mods.command.message('Rival has been turned', this.info.enabled ? 'on' : 'off');
    };

    /*
     * Turns the module on
     */
    on = () => {
        this.info.enabled = true;
        this.mods.command.message('Rival has been turned on');
    };

    /*
     * Turns the module off
     */
    off = () => {
        this.info.enabled = false;
        this.mods.command.message('Rival has been turned off');
    };

    /*
     * Toggles smooth block functionality
     */
    block = () => {
        this.info.block = !this.info.block;
        this.mods.command.message('Smooth block has been turned', this.info.block ? 'on' : 'off');
    };

    /*
     * Toggles smooth jaunt functionality
     */
    jaunt = () => {
        this.info.jaunt = !this.info.jaunt;
        this.mods.command.message('Smooth jaunt has been turned', this.info.jaunt ? 'on' : 'off');
    };

    /*
     * Sets artificial delay value
     * @param {number|string} value - The delay value to set in milliseconds
     */
    delay = (value) => {
        // Convert input to number
        value = +value;
        
        // Validate input
        if (isNaN(value) || value < 0) {
            return this.mods.command.message('The artificial delay needs to be a number >= 0');
        }
        
        // Update setting and notify user
        this.info.delay = value;
        this.mods.command.message('Set artificial delay to', value);
    };

    // Settings getters and setters

    /*
     * Checks if the module is enabled
     * @returns {boolean} True if the module is enabled
     */
    get enabled() {
        return this.info.enabled;
    }

    /*
     * Checks if smooth block is enabled
     * @returns {boolean} True if smooth block is enabled
     */
    get smoothBlock() {
        return this.info.block;
    }

    /*
     * Checks if jaunt emulation is enabled
     * @returns {boolean} True if jaunt emulation is enabled
     */
    get emulateJaunt() {
        return this.info.jaunt;
    }

    /*
     * Checks if debug mode is enabled
     * @returns {boolean} True if debug mode is enabled
     */
    get debug() {
        return this.info.debug;
    }

    /*
     * Sets debug mode
     * @param {boolean} value - Whether debug mode should be enabled
     */
    set debug(value) {
        this.info.debug = value;
    }

    /*
     * Gets dash value
     * @returns {number} The dash value
     */
    get dash() {
        return this.info.dash;
    }

    /*
     * Sets dash value
     * @param {number} value - The dash value to set
     */
    set dash(value) {
        this.info.dash = value;
    }

    // Lifecycle methods

    /*
     * Saves configuration to file when module is unloaded
     * Ensures settings persist between sessions
     */
    destructor() {
        // Write current settings to config file with pretty formatting
        fs.writeFileSync(
            path.join(__dirname, '../../config.json'),
            JSON.stringify(this.info, null, '  ')
        );
    }
}
// Export the Settings class
module.exports = Settings;