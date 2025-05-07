/*
 * Rival Mod - Projectile System
 *
 * projectiles.js handles the creation and management of projectiles for the Gunner class.
 * It creates fake projectiles for immediate visual feedback and synchronizes them with real
 * server-side projectiles, ensuring hit events are properly processed between them.
 */
const hooks = require("../enums/hooks");
const classes = require('../enums/classes');
/*
 * ProjectileManager module
 *
 * Manages projectiles for the Gunner class by creating fake client-side projectiles
 * for immediate visual feedback and synchronizing them with real server-side projectiles.
 * This improves the player experience by reducing perceived latency while maintaining
 * proper game mechanics.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 */
module.exports = function ProjectileManager(mod, mods) {
    // State tracking variables
    let projectileId = 0n;              // Counter for generating unique fake projectile IDs
    const projectiles = [];             // Tracks all active projectiles and their state
    let pendingHits = [];               // Stores hit events that need to be processed later

    // Block certain Gunner skills from starting
    mod.hook(...mods.packet.get_all('C_START_INSTANCE_SKILL'), hooks.MODIFY_INTERNAL_REAL, event => {
        if (mods.player.job !== classes.GUNNER) return;
        
        const skillInfo = mods.utils.getSkillInfo(event.skill.id);
        
        // Block Arcane Barrage (skill 7-3) which is handled differently
        if (skillInfo.skill !== 7 || skillInfo.sub !== 3) return;
        
        mod.send(...mods.packet.get_all("S_CANNOT_START_SKILL"), {
            skill: event.skill
        });
        return false;
    });

    // Create fake projectiles for immediate visual feedback
    /*
     * Creates fake client-side projectiles for specific Gunner skills to provide
     * immediate visual feedback to the player
     */
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_DESTINATION_FAKE, event => {
        // Only process for the player's Gunner character when mod is enabled
        if (mods.player.job !== classes.GUNNER) return;
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled()) return;

        const skillInfo = mods.utils.getSkillInfo(event.skill.id);
        
        // Only create projectiles for Scattering Shot and Time Bomb skills
        const isScatteringShot = skillInfo.skill === 43 && [1, 3, 30, 50].includes(skillInfo.sub);
        const isTimeBomb = skillInfo.skill === 6;
        
        if (!isScatteringShot && !isTimeBomb) return;

        // Create fake projectile with appropriate skill ID
        const projectileSkillId = isScatteringShot ? 430120 : 61120;
        
        mod.send(...mods.packet.get_all('S_START_USER_PROJECTILE'), {
            gameId: mods.player.gameId,
            templateId: mods.player.templateId,
            id: ++projectileId,
            skill: projectileSkillId,
            loc: event.loc,
            dest: mods.last.startSkill.dest,
            speed: 800,
            distance: 475,
            projectileSpeed: 1
        });
        
        // Track the fake projectile for later synchronization with real projectiles
        projectiles.push({
            faked: projectileId,    // ID of the fake projectile
            skill: skillInfo,       // Skill information for matching
            real: null              // Will be populated with real projectile ID when available
        });
    });

    // Process hit events on fake projectiles
    /*
     * Handles hit events on fake projectiles, either forwarding them to the real
     * projectile or storing them for later processing
     */
    mod.hook(...mods.packet.get_all("C_HIT_USER_PROJECTILE"), hooks.MODIFY_REAL, event => {
        // Find the projectile that was hit
        const projectile = projectiles.find(p => p.faked === event.id);
        if (!projectile) return;
        
        // Remove projectile from tracking if it's ending
        if (event.end) {
            projectiles.splice(projectiles.indexOf(projectile), 1);
        }
        
        // If we already have a real projectile ID, update the hit event with it
        if (projectile.real) {
            event.id = projectile.real;
            return true; // Allow the modified packet to be sent
        }
        
        // Otherwise store the hit for later processing when real projectile arrives
        pendingHits.push({
            event: event,           // The original hit event
            skill: projectile.skill // Skill info for matching with real projectile
        });
        return false; // Block the original packet
    });

    // Synchronize real projectiles with fake ones
    /*
     * Processes real server-side projectiles by matching them with fake ones
     * and forwarding any pending hit events
     */
    mod.hook(...mods.packet.get_all('S_START_USER_PROJECTILE'), hooks.MODIFY_REAL, event => {
        // Only process for the player's Gunner character when mod is enabled
        if (mods.player.job !== classes.GUNNER) return;
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        const skillInfo = mods.utils.getSkillInfo(event.skill.id);
        
        // Only process Time Bomb and Scattering Shot projectiles
        if (![6, 43].includes(skillInfo.skill)) return;
        
        // Process any pending hits for this skill type
        const matchingHits = pendingHits.filter(hit => hit.skill.skill === skillInfo.skill);
        if (matchingHits.length) {
            // Remove processed hits from pending list
            pendingHits = pendingHits.filter(hit => hit.skill.skill !== skillInfo.skill);
            
            // Send hit events with the real projectile ID
            for (const { event: hitEvent } of matchingHits) {
                mod.send(...mods.packet.get_all("C_HIT_USER_PROJECTILE"), {
                    ...hitEvent,
                    id: event.id
                });
            }
        }
        
        // Update the projectile tracking with the real ID for future hits
        const matchingProjectile = projectiles.find(p => p.skill.skill === skillInfo.skill);
        if (matchingProjectile) {
            matchingProjectile.real = event.id;
        }
        
        // Block the original packet as we've already created a fake projectile
        return false;
    });
};