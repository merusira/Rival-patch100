/*
 * Rival Mod - Skill Customization
 *
 * hardcoded.js applies class-specific skill modifications that cannot be handled by configuration.
 * It adjusts skill chains, abnormality effects, and special behaviors to improve gameplay
 * mechanics and fix issues with the default skill implementation.
 */
const classes = require('../enums/classes');
/*
 * HardcodedSkillModifier module
 *
 * Applies class-specific skill modifications that require direct code intervention.
 * These modifications include adjusting skill chains, abnormality effects, and
 * special behaviors that cannot be handled through configuration files.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, skills, and utility modules
 * @returns {undefined} This module sets up event handlers but doesn't return a value
 */
module.exports = function HardcodedSkillModifier(mod, mods) {
    /*
     * Applies hardcoded skill modifications based on player's class
     * Called when skills are loaded to ensure all skill data is available
     */
    const applySkillModifications = () => {
        switch (mods.player.job) {
            // MYSTIC class modifications
            case classes.MYSTIC: {
                /*
                // Modify Thrall of Protection skill behavior on Menma servers
                if (mod.isMenma) {
                    const thrallSkill = mods.skills._getInfo(483172); // Thrall of Protection
                    thrallSkill.fixedSpeed = false; // Allow speed modifications
                }
                */
                break;
            }
            
            // WARRIOR class modifications
            case classes.WARRIOR: {
                /*
                // Menma server-specific modifications
                if (mod.isMenma) {
                    // Apply Deadly Gamble abnormality consume to specific warrior skills
                    const deadlyGambleSkills = [401134, 401135, 401144, 401145]; // Deadly Gamble skills
                    
                    for (const skillId of deadlyGambleSkills) {
                        const skillInfo = mods.skills._getInfo(skillId);
                        
                        // Initialize abnormality consume end array if it doesn't exist
                        if (!skillInfo.abnormalityConsume.end) {
                            skillInfo.abnormalityConsume.end = [];
                        }
                        
                        // Add Deadly Gamble abnormality consume
                        skillInfo.abnormalityConsume.end.push({
                            id: 104101, // Deadly Gamble abnormality
                            delay: 0,
                            fixed: true
                        });
                    }
                }
                */
                // Modify Blade Draw skill for all servers
                const bladeDrawSkill = mods.skills._getInfo(200200); // Blade Draw
                const targetingDelay = bladeDrawSkill.targeting[0];
                
                // Initialize abnormality consume stage array if it doesn't exist
                if (!bladeDrawSkill.abnormalityConsume.stage) {
                    bladeDrawSkill.abnormalityConsume.stage = [];
                }
                
                // Remove existing Combat Stance abnormality consume if present
                bladeDrawSkill.abnormalityConsume.stage = bladeDrawSkill.abnormalityConsume.stage.filter(
                    abnormality => abnormality.id !== 103120 // Combat stance
                );
                
                // Add updated Combat Stance abnormality consume
                bladeDrawSkill.abnormalityConsume.stage.push({
                    id: 103120, // Combat stance
                    delay: targetingDelay,
                    fixed: false
                });
                
                // Remove existing Blade Draw Overcharge abnormality apply if present
                bladeDrawSkill.abnormalityApply = bladeDrawSkill.abnormalityApply.filter(
                    abnormality => abnormality.id !== 103104 // Blade Draw Overcharge
                );
                
                // Add updated Blade Draw Overcharge abnormality apply
                bladeDrawSkill.abnormalityApply.push({
                    id: 103104, // Blade Draw Overcharge
                    delay: targetingDelay,
                    fixed: false
                });
                break;
            }
            
            // SORCERER class modifications
            case classes.SORCERER: {
                /*
                // Menma server-specific modifications
                if (mod.isMenma) {
                    // Remove first element from abnormalityRedirect for specific skills
                    const sorcererSkills = [60744, 41212, 41211, 41210]; // Various Sorcerer skills
                    
                    for (const skillId of sorcererSkills) {
                        const skillInfo = mods.skills._getInfo(skillId);
                        // Remove the first redirect entry (slice from index 1 onwards)
                        skillInfo.abnormalityRedirect = skillInfo.abnormalityRedirect.slice(1);
                    }
                }
                */
                // Remove Mana Boost abnormality consume from Arcane Pulse skills
                const arcanePulseSkills = [359076, 359176, 359276, 359376]; // Arcane Pulse skill variants
                
                for (const skillId of arcanePulseSkills) {
                    const skillInfo = mods.skills._getInfo(skillId);
                    if (!skillInfo?.abnormalityConsume?.stage) continue;
                    
                    // Remove Mana Boost abnormality consume
                    skillInfo.abnormalityConsume.stage = skillInfo.abnormalityConsume.stage.filter(
                        abnormality => abnormality.id !== 502050 // Mana Boost abnormality
                    );
                }
                
                // List of all Mana Boost abnormality IDs (different levels)
                const manaBoostAbnormalities = [502020, 502030, 502040, 502050]; // Mana Boost abnormality levels
                
                // Remove Mana Boost abnormalities from all skills with skill type 4 (Fireblast type)
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    if (skillInfo.skill === 4) { // Fireblast type skills
                        const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                        
                        if (detailedSkillInfo.abnormalityConsume?.stage) {
                            // Filter out all Mana Boost abnormalities
                            detailedSkillInfo.abnormalityConsume.stage = detailedSkillInfo.abnormalityConsume.stage.filter(
                                abnormality => !manaBoostAbnormalities.includes(abnormality.id)
                            );
                        }
                    }
                }
                break;
            }
            
            // REAPER class modifications
            case classes.REAPER: {
                // Set holdIfNotMoving to true for specific skill types to improve targeting
                const targetSkillTypes = [1, 3, 4, 9]; // Various Reaper skill types
                
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    // Apply modification only to specific skill types
                    if (targetSkillTypes.includes(skillInfo.skill)) {
                        const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                        detailedSkillInfo.holdIfNotMoving = true; // Prevent movement cancellation
                    }
                }
                break;
            }
            
            // SLAYER class modifications
            case classes.SLAYER: {
                // Add In Cold Blood abnormality consume to specific skills
                const slayerSkills = [269076, 269106, 269107, 269116, 269117, 269118]; // Various Slayer skills
                
                for (const skillId of slayerSkills) {
                    const skillInfo = mods.skills._getInfo(skillId);
                    if (!skillInfo) continue;
                    
                    // Initialize abnormalityConsume object if it doesn't exist
                    if (!skillInfo?.abnormalityConsume) {
                        skillInfo.abnormalityConsume = {};
                    }
                    
                    // Initialize abnormalityConsume.end array if it doesn't exist
                    if (!skillInfo?.abnormalityConsume?.end) {
                        skillInfo.abnormalityConsume.end = [];
                    }
                    
                    // Add In Cold Blood abnormality consume
                    skillInfo.abnormalityConsume.end.push({
                        id: 301604, // In Cold Blood abnormality
                        delay: 990,  // Delay in milliseconds
                        fixed: true, // Fixed timing
                        noTimer: true // Don't show timer
                    });
                }
                
                // Modify chains for Overhand Strike to allow chaining from Knockdown
                const overhandStrikeSkill = mods.skills._getInfo(121101); // Overhand Strike
                overhandStrikeSkill.chains['27'].push(42); // Add chain to Knockdown (state 42)
                break;
            }
            
            // VALKYRIE class modifications
            case classes.VALKYRIE: {
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    switch (skillInfo.skill) {
                        case 11: { // Valkyrie skill type 11 (Ground Bash)
                            // Only apply to specific sub-skills (base and variant 30)
                            if (![0, 30].includes(skillInfo.sub)) break;
                            
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Initialize abnormalityApply array if it doesn't exist
                            if (!detailedSkillInfo.abnormalityApply) {
                                detailedSkillInfo.abnormalityApply = [];
                            }
                            
                            // Add Valkyrie-specific abnormality
                            detailedSkillInfo.abnormalityApply.push({
                                id: 10133548, // Valkyrie combat abnormality
                                delay: 430,    // Delay in milliseconds
                                fixed: false,  // Not fixed timing
                                duration: 5000 // Duration in milliseconds
                            });
                            break;
                        }
                        
                        case 10: // Valkyrie skill type 10 (Leaping Strike)
                        case 12: { // Valkyrie skill type 12 (Spinning Death)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            if (!detailedSkillInfo.chains) break;
                            
                            // Remove self-chain to prevent chaining into the same skill
                            if (detailedSkillInfo.chains[skillInfo.skill]) {
                                delete detailedSkillInfo.chains[skillInfo.skill];
                            }
                            break;
                        }
                    }
                }
                break;
            }
            
            // LANCER class modifications
            case classes.LANCER: {
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    switch (skillInfo.skill) {
                        case 2: { // Lancer skill type 2 (Stand Fast)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Remove chain from skill type 10 (Debilitate)
                            if (detailedSkillInfo.chains?.['10']) {
                                delete detailedSkillInfo.chains['10'];
                            }
                            break;
                        }
                        
                        case 13: { // Lancer skill type 13 (Spring Attack)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Remove chain from skill type 28 (Shield Counter)
                            if (detailedSkillInfo.chains['28']) {
                                delete detailedSkillInfo.chains['28'];
                            }
                            break;
                        }
                    }
                }
                break;
            }
            
            // ARCHER class modifications
            case classes.ARCHER: {
                // Define skill types that should consume focus abnormalities
                const focusConsumingSkillTypes = [
                    9,  // Penetrating Arrow
                    10, // Radiant Arrow
                    11, // Rain of Arrows
                    15, // Incendiary Trap
                    23, // Restraining Arrow
                    25  // Stunning Trap
                ];
                
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    // Check if this skill type should consume focus
                    if (focusConsumingSkillTypes.includes(skillInfo.skill)) {
                        const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                        
                        // Initialize abnormalityConsume object if it doesn't exist
                        if (!detailedSkillInfo.abnormalityConsume) {
                            detailedSkillInfo.abnormalityConsume = {};
                        }
                        
                        // Initialize abnormalityConsume.end array if it doesn't exist
                        if (!detailedSkillInfo.abnormalityConsume.end) {
                            detailedSkillInfo.abnormalityConsume.end = [];
                        }
                        
                        // Add range of focus abnormality IDs to consume
                        // These represent different stacks/levels of focus
                        const focusStartId = 88080697;
                        const focusEndId = 88080711;
                        
                        for (let abnormalityId = focusStartId; abnormalityId <= focusEndId; abnormalityId++) {
                            detailedSkillInfo.abnormalityConsume.end.push({
                                id: abnormalityId, // Focus abnormality ID
                                delay: 0,          // No delay
                                fixed: true        // Fixed timing
                            });
                        }
                    }
                }
                break;
            }
            
            // BERSERKER class modifications
            case classes.BERSERKER: {
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    switch (skillInfo.skill) {
                        case 24: { // Berserker skill type 24 (Fiery Rage)
                            // Only apply to base skill (sub 0)
                            if (skillInfo.sub === 0) {
                                const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                                
                                // Remove chain from skill type 15 (Vampiric Blow)
                                if (detailedSkillInfo.chains['15']) {
                                    delete detailedSkillInfo.chains['15'];
                                }
                            }
                            break;
                        }
                    }
                }
                break;
            }
            
            // PRIEST class modifications
            case classes.PRIEST: {
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    switch (skillInfo.skill) {
                        case 28: { // Priest skill type 28 (Healing Circle)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            /*
                            // Modify effect scale on Menma servers to double healing effectiveness
                            if (mod.isMenma &&
                                detailedSkillInfo?.appliedEffects?.passivity?.[28039]?.effectScale) {
                                // Double the effect scale for passivity 28039 (healing effect)
                                detailedSkillInfo.appliedEffects.passivity[28039].effectScale = 2;
                            }
                            */
                            break;
                        }
                    }
                }
                break;
            }
            
            // NINJA class modifications
            case classes.NINJA: {
                for (const skillIdStr in mods.skills.info.skillData) {
                    const skillInfo = mods.utils.getSkillInfo(+skillIdStr);
                    
                    switch (skillInfo.skill) {
                        case 8: { // Ninja skill type 8 (One Thousand Cuts)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Initialize chain array for skill type 1 (Combo Attack) if it doesn't exist
                            if (!detailedSkillInfo.chains['1']) {
                                detailedSkillInfo.chains['1'] = [];
                            }
                            
                            // Add chain options for states 30 and 70 if they don't exist
                            if (!detailedSkillInfo.chains['1'].includes(30)) {
                                detailedSkillInfo.chains['1'].push(30); // Add chain to state 30
                            }
                            
                            if (!detailedSkillInfo.chains['1'].includes(70)) {
                                detailedSkillInfo.chains['1'].push(70); // Add chain to state 70
                            }
                            break;
                        }
                        
                        case 12: { // Ninja skill type 12 (Skyfall)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Initialize and add chain options for skill type 8 (One Thousand Cuts)
                            if (!detailedSkillInfo.chains['8']) {
                                detailedSkillInfo.chains['8'] = [];
                            }
                            
                            if (!detailedSkillInfo.chains['8'].includes(30)) {
                                detailedSkillInfo.chains['8'].push(30); // Add chain to state 30
                            }
                            
                            if (!detailedSkillInfo.chains['8'].includes(52)) {
                                detailedSkillInfo.chains['8'].push(52); // Add chain to state 52
                            }
                            
                            // Initialize and add chain options for skill type 9 (Double Cut)
                            if (!detailedSkillInfo.chains['9']) {
                                detailedSkillInfo.chains['9'] = [];
                            }
                            
                            if (!detailedSkillInfo.chains['9'].includes(31)) {
                                detailedSkillInfo.chains['9'].push(31); // Add chain to state 31
                            }
                            break;
                        }
                        
                        case 13: { // Ninja skill type 13 (Circle of Steel)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Initialize and add chain options for skill type 9 (Double Cut)
                            if (!detailedSkillInfo.chains['9']) {
                                detailedSkillInfo.chains['9'] = [];
                            }
                            
                            if (!detailedSkillInfo.chains['9'].includes(31)) {
                                detailedSkillInfo.chains['9'].push(31); // Add chain to state 31
                            }
                            
                            break;
                        }
                        
                        case 22: { // Ninja skill type 22 (Quick Attack)
                            const detailedSkillInfo = mods.skills._getInfo(skillInfo.id);
                            
                            // Remove self-chain to prevent chaining into the same skill
                            if (detailedSkillInfo.chains['22']) {
                                delete detailedSkillInfo.chains['22'];
                            }
                            break;
                        }
                    }
                }
                break;
            }
        }
    };

    // Event registration
    
    /*
     * Register the skill modifications function to run when skills are loaded
     * This ensures modifications are applied after all skill data is available
     */
    mods.skills.on("loaded", applySkillModifications);
    
    // Cleanup handling
    
    /*
     * Store reference to the event handler for cleanup
     * This allows proper removal of the event listener when the module is unloaded
     */
    mod.loaded = applySkillModifications;
    
    /*
     * Cleanup function to remove event listeners when the module is unloaded
     * Prevents memory leaks and ensures clean module shutdown
     */
    mod.destructor = () => {
        mods.skills.off("loaded", applySkillModifications);
    };
};