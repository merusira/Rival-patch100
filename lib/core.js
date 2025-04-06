'use strict'

/**
 * Core Module
 * 
 * This module handles the main functionality of the Rival mod.
 * 
 */

class Core {
    constructor(mod) {
        this.mod = mod;
        this.settings = mod.settings;
        this.command = mod.command;
        this.game = mod.game;
        
        // Module instances
        this.ping = null;
        this.skills = null;
        this.validation = null;
        this.emulation = null;
        this.packetQueue = null;
        
        // State
        this.enabled = this.settings.enabled;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Load modules
        this.loadModules();
        
        // Register hooks
        this.hookSkillPackets();
        
        // Register game state hooks
        this.hookGameState();
        
        if (this.mod.settings.debug.enabled) {
            this.mod.log('Core module initialized');
        }
    }
    
    loadModules() {
        try {
            // Load ping module
            const Ping = require('./ping');
            this.ping = new Ping(this.mod);
            
            // Load skills module
            const Skills = require('./skills');
            this.skills = new Skills(this.mod);
            
            // Load validation module
            const Validation = require('./validation');
            this.validation = new Validation(this.mod);
            
            // Load emulation module
            const Emulation = require('./emulation');
            this.emulation = new Emulation(this.mod);
            
            // Load packet queue module
            const PacketQueue = require('./packet-queue');
            this.packetQueue = new PacketQueue(this.mod);
            
            // Set up module references
            this.validation.setSkills(this.skills);
            this.validation.setPacketQueue(this.packetQueue);
            this.emulation.setSkills(this.skills);
            this.emulation.setValidation(this.validation);
            this.packetQueue.setPing(this.ping);
            
            if (this.mod.settings.debug.enabled) {
                this.mod.log('All modules loaded');
            }
        } catch (e) {
            this.mod.error('Error loading modules:');
            this.mod.error(e);
        }
    }
    
    hookSkillPackets() {
        // Hook C_START_SKILL
        this.mod.hook('C_START_SKILL', 7, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_START_SKILL: ${event.skill.id}`);
            }
            
            return this.handleSkillStart(event);
        });
        
        // Hook C_START_TARGETED_SKILL
        this.mod.hook('C_START_TARGETED_SKILL', 7, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_START_TARGETED_SKILL: ${event.skill.id}`);
            }
            
            return this.handleSkillStart(event);
        });
        
        // Hook C_START_COMBO_INSTANT_SKILL
        this.mod.hook('C_START_COMBO_INSTANT_SKILL', 6, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_START_COMBO_INSTANT_SKILL: ${event.skill.id}`);
            }
            
            return this.handleSkillStart(event);
        });
        
        // Hook C_START_INSTANCE_SKILL
        this.mod.hook('C_START_INSTANCE_SKILL', 7, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_START_INSTANCE_SKILL: ${event.skill.id}`);
            }
            
            return this.handleSkillStart(event);
        });
        
        // Hook C_PRESS_SKILL
        this.mod.hook('C_PRESS_SKILL', 4, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_PRESS_SKILL: ${event.skill.id}, press: ${event.press}`);
            }
            
            return this.handlePressSkill(event);
        });
        
        // Hook C_CANCEL_SKILL
        this.mod.hook('C_CANCEL_SKILL', 3, { order: -10, filter: { fake: null } }, event => {
            if (!this.enabled) return;
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`C_CANCEL_SKILL: ${event.skill.id}`);
            }
            
            return this.handleCancelSkill(event);
        });
    }
    
    hookGameState() {
        // Hook game enter
        this.game.on('enter_game', () => {
            if (this.mod.settings.debug.enabled) {
                this.mod.log('Entered game');
            }
        });
        
        // Hook game leave
        this.game.on('leave_game', () => {
            if (this.mod.settings.debug.enabled) {
                this.mod.log('Left game');
            }
            
            // Clean up
            if (this.emulation) {
                this.emulation.destructor();
            }
        });
    }
    
    /**
     * Handle skill start packets
     * @param {Object} event - The skill event
     * @returns {boolean} - Whether to block the packet
     */
    handleSkillStart(event) {
        if (!this.settings.skills.enabled) return;
        
        try {
            // Emulate the skill
            const emulated = this.emulation.emulateSkill(event.skill, event);
            
            if (emulated) {
                // Queue the packet to be sent to the server
                this.packetQueue.queueSkillPacket(
                    event.skill.id,
                    this.mod.dispatch.toRaw('C_START_SKILL', 7, event),
                    'C_START_SKILL',
                    7
                );
                
                // Block the original packet
                return false;
            }
        } catch (e) {
            this.mod.error(`Error handling skill start: ${e.message}`);
            this.mod.error(e);
        }
    }
    
    /**
     * Handle press skill packets
     * @param {Object} event - The skill event
     * @returns {boolean} - Whether to block the packet
     */
    handlePressSkill(event) {
        if (!this.settings.skills.enabled) return;
        
        try {
            if (event.press) {
                // Skill press (start)
                const emulated = this.emulation.emulateSkill(event.skill, event);
                
                if (emulated) {
                    // Queue the packet to be sent to the server
                    this.packetQueue.queueSkillPacket(
                        event.skill.id,
                        this.mod.dispatch.toRaw('C_PRESS_SKILL', 4, event),
                        'C_PRESS_SKILL',
                        4
                    );
                    
                    // Block the original packet
                    return false;
                }
            } else {
                // Skill release (end)
                // End the emulated skill
                if (this.emulation.currentEmulatedSkill && 
                    this.emulation.currentEmulatedSkill.skill.equals(event.skill)) {
                    this.emulation.endEmulatedSkill(10); // End reason 10 = Button Release
                }
                
                // Send the packet to the server
                this.mod.send('C_PRESS_SKILL', 4, event);
                
                // Block the original packet
                return false;
            }
        } catch (e) {
            this.mod.error(`Error handling press skill: ${e.message}`);
            this.mod.error(e);
        }
    }
    
    /**
     * Handle cancel skill packets
     * @param {Object} event - The skill event
     * @returns {boolean} - Whether to block the packet
     */
    handleCancelSkill(event) {
        if (!this.settings.skills.enabled) return;
        
        try {
            // End the emulated skill
            if (this.emulation.currentEmulatedSkill && 
                this.emulation.currentEmulatedSkill.skill.equals(event.skill)) {
                this.emulation.endEmulatedSkill(2); // End reason 2 = Cancel
            }
            
            // Send the packet to the server
            this.mod.send('C_CANCEL_SKILL', 3, event);
            
            // Block the original packet
            return false;
        } catch (e) {
            this.mod.error(`Error handling cancel skill: ${e.message}`);
            this.mod.error(e);
        }
    }
    
    /**
     * Enable the mod
     */
    enable() {
        this.enabled = true;
        this.settings.enabled = true;
        this.mod.saveSettings();
        
        this.command.message('Rival enabled');
    }
    
    /**
     * Disable the mod
     */
    disable() {
        this.enabled = false;
        this.settings.enabled = false;
        this.mod.saveSettings();
        
        this.command.message('Rival disabled');
    }
    
    /**
     * Toggle the mod
     */
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }
    
    /**
     * Destructor
     */
    destructor() {
        // Clean up modules
        if (this.ping) {
            this.ping.destructor();
            this.ping = null;
        }
        
        if (this.skills) {
            this.skills.destructor();
            this.skills = null;
        }
        
        if (this.validation) {
            this.validation.destructor();
            this.validation = null;
        }
        
        if (this.emulation) {
            this.emulation.destructor();
            this.emulation = null;
        }
        
        if (this.packetQueue) {
            this.packetQueue.destructor();
            this.packetQueue = null;
        }
    }
}

module.exports = Core;