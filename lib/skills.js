'use strict'

/**
 * Skills Module
 * 
 * This module handles skill data loading and provides utility functions
 * for skill information.
 */

const fs = require('fs');
const path = require('path');

class Skills {
    constructor(mod) {
        this.mod = mod;
        
        // Skill data
        this.skillsData = null;
        this.skillsByClass = {};
        this.skillsByCategory = {};
        this.skillCache = new Map();
        
        // Class information
        this.playerClass = null;
        this.templateId = 0;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        // Register hooks
        this.hookPlayerInfo();
        
        // Load skill data
        this.loadSkillData();
    }
    
    hookPlayerInfo() {
        // Hook S_LOGIN to get player class
        this.mod.hook('S_LOGIN', 14, event => {
            this.templateId = event.templateId;
            this.playerClass = this.getClassFromTemplateId(event.templateId);
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`Player class: ${this.playerClass} (templateId: ${this.templateId})`);
            }
            
            // Load class-specific skill data
            this.loadClassSkillData();
        });
    }
    
    /**
     * Get class name from template ID
     * @param {number} templateId - The template ID
     * @returns {string|null} - The class name or null if not found
     */
    getClassFromTemplateId(templateId) {
        // Template ID format: XXYZZ
        // XX: Race (1-6)
        // Y: Gender (0-1)
        // ZZ: Class (01-13)
        const classId = templateId % 100;
        
        switch (classId) {
            case 0: return 'warrior';
            case 1: return 'lancer';
            case 2: return 'slayer';
            case 3: return 'berserker';
            case 4: return 'sorcerer';
            case 5: return 'archer';
            case 6: return 'priest';
            case 7: return 'mystic';
            case 8: return 'reaper';
            case 9: return 'gunner';
            case 10: return 'brawler';
            case 11: return 'ninja';
            case 12: return 'valkyrie';
            default: return null;
        }
    }
    
    /**
     * Load skill data from JSON files
     */
    loadSkillData() {
        try {
            const dataPath = path.join(__dirname, '../data/skills/all-skills.json');
            
            if (!fs.existsSync(dataPath)) {
                this.mod.warn('Skill data file not found. Please run the skill-extractor.js tool first.');
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            this.skillsData = data.skills || {};
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`Loaded ${Object.keys(this.skillsData).length} skills from ${dataPath}`);
            }
        } catch (e) {
            this.mod.error(`Error loading skill data: ${e.message}`);
            this.mod.error(e);
        }
    }
    
    /**
     * Load class-specific skill data
     */
    loadClassSkillData() {
        if (!this.playerClass) return;
        
        try {
            const classDataPath = path.join(__dirname, `../data/skills/by-class/${this.playerClass}.json`);
            
            if (!fs.existsSync(classDataPath)) {
                this.mod.warn(`Class-specific skill data file not found for ${this.playerClass}.`);
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(classDataPath, 'utf8'));
            this.skillsByClass[this.playerClass] = data.skills || {};
            
            if (this.mod.settings.debug.skills) {
                this.mod.log(`Loaded ${Object.keys(this.skillsByClass[this.playerClass]).length} skills for ${this.playerClass}`);
            }
        } catch (e) {
            this.mod.error(`Error loading class-specific skill data: ${e.message}`);
            this.mod.error(e);
        }
    }
    
    /**
     * Get skill information
     * @param {Object|number} skill - The skill object or ID
     * @returns {Object|null} - The skill information or null if not found
     */
    getSkillInfo(skill) {
        const skillId = typeof skill === 'object' ? skill.id : skill;
        
        // Check cache first
        if (this.skillCache.has(skillId)) {
            return this.skillCache.get(skillId);
        }
        
        // Look up skill in data
        let skillInfo = null;
        
        // Check class-specific skills first
        if (this.playerClass && this.skillsByClass[this.playerClass] && this.skillsByClass[this.playerClass][skillId]) {
            skillInfo = this.skillsByClass[this.playerClass][skillId];
        }
        // Fall back to all skills
        else if (this.skillsData && this.skillsData[skillId]) {
            skillInfo = this.skillsData[skillId];
        }
        
        // Cache result (even if null)
        this.skillCache.set(skillId, skillInfo);
        
        return skillInfo;
    }
    
    /**
     * Get skill animation duration
     * @param {Object|number} skill - The skill object or ID
     * @returns {number} - The animation duration in milliseconds
     */
    getAnimationDuration(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? skillInfo.animationDuration : 0;
    }
    
    /**
     * Get skill cooldown
     * @param {Object|number} skill - The skill object or ID
     * @returns {number} - The cooldown in milliseconds
     */
    getCooldown(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? skillInfo.coolTime : 0;
    }
    
    /**
     * Get skill resource costs
     * @param {Object|number} skill - The skill object or ID
     * @returns {Object} - The resource costs { mp, hp }
     */
    getResourceCosts(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? { mp: skillInfo.mpCost || 0, hp: skillInfo.hpCost || 0 } : { mp: 0, hp: 0 };
    }
    
    /**
     * Check if a skill is movable
     * @param {Object|number} skill - The skill object or ID
     * @returns {boolean} - Whether the skill is movable
     */
    isMovable(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? skillInfo.movable : false;
    }
    
    /**
     * Get next skill in chain
     * @param {Object|number} skill - The skill object or ID
     * @returns {number} - The next skill ID, or 0 if none
     */
    getNextSkill(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? skillInfo.nextSkill : 0;
    }
    
    /**
     * Get skill stages
     * @param {Object|number} skill - The skill object or ID
     * @returns {Array} - The skill stages
     */
    getStages(skill) {
        const skillInfo = this.getSkillInfo(skill);
        return skillInfo ? skillInfo.stages : [];
    }
    
    /**
     * Clear skill cache
     */
    clearCache() {
        this.skillCache.clear();
    }
    
    /**
     * Destructor
     */
    destructor() {
        this.clearCache();
    }
}

module.exports = Skills;