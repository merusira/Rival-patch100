'use strict'

/**
 * Rival - Zero-ping client-side emulation mod for TeraToolbox
 * Author: merusira
 * 
 * This mod provides a "zero-ping" feel by emulating all skill activations
 * and actions client-side, allowing users to immediately see and feel their
 * actions without delay.
 */

// Load core module
const Core = require('./lib/core');

// Define mod class
class Rival {
    constructor(mod) {
        this.mod = mod;
        this.command = mod.command;
        this.game = mod.game;
        
        // Load settings
        this.settings = mod.settings;
        
        // Initialize state
        this.enabled = this.settings.enabled;
        
        // Register command
        this.command.add('rival', {
            '$default': () => {
                this.settings.enabled = !this.settings.enabled;
                this.enabled = this.settings.enabled;
                this.command.message(`Rival ${this.enabled ? 'enabled' : 'disabled'}.`);
                this.mod.saveSettings();
                
                if (this.core) {
                    if (this.enabled) {
                        this.core.enable();
                    } else {
                        this.core.disable();
                    }
                }
            },
            'help': () => {
                this.command.message('Rival commands:');
                this.command.message('  rival - Toggle the mod on/off');
                this.command.message('  rival debug - Toggle debug mode');
                this.command.message('  rival ping - Show current ping statistics');
                this.command.message('  rival reload - Reload the mod');
            },
            'debug': () => {
                this.settings.debug.enabled = !this.settings.debug.enabled;
                this.command.message(`Debug mode ${this.settings.debug.enabled ? 'enabled' : 'disabled'}.`);
                this.mod.saveSettings();
            },
            'ping': () => {
                if (this.core && this.core.ping) {
                    const stats = this.core.ping.getStats();
                    this.command.message(`Ping statistics:`);
                    this.command.message(`  Min: ${stats.min}ms`);
                    this.command.message(`  Avg: ${stats.avg}ms`);
                    this.command.message(`  Max: ${stats.max}ms`);
                    this.command.message(`  Samples: ${stats.samples}`);
                } else {
                    this.command.message('Ping statistics not available.');
                }
            },
            'reload': () => {
                this.command.message('Reloading Rival...');
                this.mod.manager.reload(this.mod.info.name);
            }
        });
        
        // Initialize core
        this.core = new Core(this.mod);
        
        // Log startup
        this.mod.log('Rival initialized.');
    }
    
    destructor() {
        // Clean up
        if (this.core) {
            this.core.destructor();
            this.core = null;
        }
        
        this.command.remove('rival');
        this.mod.log('Rival unloaded.');
    }
}

module.exports = function RivalLoader(mod) {
    return new Rival(mod);
};