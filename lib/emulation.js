'use strict'

/**
 * Emulation Module
 * 
 * This module handles client-side emulation of skill activations.
 * It generates and sends packets to the client to provide immediate feedback.
 */

class Emulation {
    constructor(mod) {
        this.mod = mod;
        this.skills = null; // Will be set by core.js
        this.validation = null; // Will be set by core.js
        
        // Emulation state
        this.actionNumber = 0x80000000;
        this.currentEmulatedSkill = null;
        this.emulationHistory = [];
        this.lastEndedId = 0;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Register hooks
        this.hookSkillPackets();
    }
    
    hookSkillPackets() {
        // Hook S_ACTION_STAGE to track server-confirmed skills
        this.mod.hook('S_ACTION_STAGE', 9, { order: -10 }, event => {
            if (this.mod.game.me.is(event.gameId)) {
                // If this is a server-confirmed skill that we emulated, we can ignore it
                if (this.currentEmulatedSkill && 
                    this.currentEmulatedSkill.skill.equals(event.skill) && 
                    this.currentEmulatedSkill.stage === event.stage) {
                    
                    if (this.mod.settings.debug.skills) {
                        this.mod.log(`Server confirmed emulated skill: ${event.skill.id}, stage: ${event.stage}`);
                    }
                    
                    return false;
                }
                
                // Otherwise, this is a new skill from the server
                this.currentEmulatedSkill = null;
            }
        });
        
        // Hook S_ACTION_END to track server-confirmed skill ends
        this.mod.hook('S_ACTION_END', 5, { order: -10 }, event => {
            if (this.mod.game.me.is(event.gameId)) {
                // If this is a server-confirmed skill end that we emulated, we can ignore it
                if (this.lastEndedId === event.id) {
                    if (this.mod.settings.debug.skills) {
                        this.mod.log(`Server confirmed emulated skill end: ${event.skill.id}`);
                    }
                    
                    return false;
                }
                
                // Otherwise, this is a new skill end from the server
                this.currentEmulatedSkill = null;
            }
        });
    }
    
    /**
     * Emulate a skill activation
     * @param {Object} skill - The skill object
     * @param {Object} event - The original event
     * @returns {boolean} - Whether the skill was emulated
     */
    emulateSkill(skill, event) {
        // Get skill info
        const skillInfo = this.skills ? this.skills.getSkillInfo(skill.id) : null;
        
        if (!skillInfo) {
            if (this.mod.settings.debug.skills) {
                this.mod.log(`No skill info found for skill ${skill.id}, cannot emulate`);
            }
            
            return false;
        }
        
        // Validate skill
        const validationResult = this.validation ? this.validation.validateSkill(skill, event.loc) : { valid: true };
        
        if (!validationResult.valid) {
            if (this.mod.settings.debug.skills) {
                this.mod.log(`Skill ${skill.id} validation failed: ${validationResult.reason}`);
            }
            
            // Send cannot start skill packet
            this.sendCannotStartSkill(skill);
            return false;
        }
        
        // End any current emulated skill
        if (this.currentEmulatedSkill) {
            this.endEmulatedSkill(6); // End reason 6 = Interrupt
        }
        
        // Start emulating the skill
        this.startEmulatedSkill(skill, event);
        
        return true;
    }
    
    /**
     * Start emulating a skill
     * @param {Object} skill - The skill object
     * @param {Object} event - The original event
     */
    startEmulatedSkill(skill, event) {
        // Get skill info
        const skillInfo = this.skills.getSkillInfo(skill.id);
        
        // Calculate animation speed
        const animSpeed = this.mod.game.me.attackSpeed;
        
        // Create action stage packet
        const actionStage = {
            gameId: this.mod.game.me.gameId,
            loc: event.loc,
            w: event.w,
            templateId: this.mod.game.me.templateId,
            skill: skill,
            stage: 0,
            speed: animSpeed,
            projectileSpeed: 1,
            id: this.actionNumber,
            effectScale: 1,
            moving: false,
            dest: event.dest,
            target: 0n
        };
        
        // Send action stage packet
        this.mod.send('S_ACTION_STAGE', 9, actionStage);
        
        // Store current emulated skill
        this.currentEmulatedSkill = {
            skill: skill,
            stage: 0,
            startTime: Date.now(),
            actionId: this.actionNumber,
            event: event,
            info: skillInfo
        };
        
        // Add to emulation history
        this.emulationHistory.push({
            skill: skill,
            startTime: Date.now(),
            actionId: this.actionNumber
        });
        
        // Trim history
        if (this.emulationHistory.length > 50) {
            this.emulationHistory.shift();
        }
        
        // Increment action number
        this.actionNumber++;
        if (this.actionNumber > 0xffffffff) {
            this.actionNumber = 0x80000000;
        }
        
        // Set timeout to end the skill
        const duration = skillInfo.animationDuration / animSpeed;
        setTimeout(() => {
            if (this.currentEmulatedSkill && this.currentEmulatedSkill.skill.equals(skill)) {
                this.endEmulatedSkill(0); // End reason 0 = Finished
            }
        }, duration);
        
        if (this.mod.settings.debug.skills) {
            this.mod.log(`Emulated skill start: ${skill.id}, duration: ${duration}ms`);
        }
    }
    
    /**
     * End the current emulated skill
     * @param {number} endReason - The end reason
     */
    endEmulatedSkill(endReason) {
        if (!this.currentEmulatedSkill) return;
        
        // Create action end packet
        const actionEnd = {
            gameId: this.mod.game.me.gameId,
            loc: this.currentEmulatedSkill.event.loc,
            w: this.currentEmulatedSkill.event.w,
            templateId: this.mod.game.me.templateId,
            skill: this.currentEmulatedSkill.skill,
            type: endReason,
            id: this.currentEmulatedSkill.actionId
        };
        
        // Send action end packet
        this.mod.send('S_ACTION_END', 5, actionEnd);
        
        // Store last ended ID
        this.lastEndedId = this.currentEmulatedSkill.actionId;
        
        if (this.mod.settings.debug.skills) {
            this.mod.log(`Emulated skill end: ${this.currentEmulatedSkill.skill.id}, reason: ${endReason}`);
        }
        
        // Clear current emulated skill
        this.currentEmulatedSkill = null;
    }
    
    /**
     * Send cannot start skill packet
     * @param {Object} skill - The skill object
     */
    sendCannotStartSkill(skill) {
        this.mod.send('S_CANNOT_START_SKILL', 4, {
            skill: skill
        });
        
        if (this.mod.settings.debug.skills) {
            this.mod.log(`Sent cannot start skill: ${skill.id}`);
        }
    }
    
    /**
     * Set the skills module reference
     * @param {Object} skills - The skills module
     */
    setSkills(skills) {
        this.skills = skills;
    }
    
    /**
     * Set the validation module reference
     * @param {Object} validation - The validation module
     */
    setValidation(validation) {
        this.validation = validation;
    }
    
    /**
     * Destructor
     */
    destructor() {
        // Clean up
        this.currentEmulatedSkill = null;
        this.emulationHistory = [];
    }
}

module.exports = Emulation;