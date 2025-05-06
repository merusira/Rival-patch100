/*
 * Rival Mod - Movement Emulation
 *
 * emulation_effects.js handles client-side prediction of movement abilities.
 * It improves gameplay responsiveness by emulating dashes, backstabs, teleports,
 * and position swaps before server confirmation arrives.
 */
const hooks = require("../enums/hooks");
const classes = require("../enums/classes");
/*
 * EmulationEffects module
 *
 * Manages client-side prediction of movement-related skills and abilities,
 * providing smoother gameplay by reducing perceived latency for movement actions.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function EmulationEffects(mod, mods) {
    // Timestamps for tracking cooldowns to prevent duplicate movements
    let dashCooldownTimestamp = 0;    // Prevents duplicate dash packets
    let moveCooldownTimestamp = 0;    // Prevents duplicate movement packets

    // Command registration
    
    /*
     * Registers the dash command to adjust dash emulation delay
     * Allows users to fine-tune the responsiveness of dash abilities
     */
    mods.command.add("dash", value => {
        if (!value) return mods.command.message("Set the amount of delay your dashes have (default 25ms)");
        
        value = +value;
        if (isNaN(value)) return mods.command.message("Dash delay needs to be a number");
        
        const previousDelay = mods.settings.dash;
        mods.settings.dash = value;
        mods.command.message(`Dash delay has been set to ${mods.settings.dash}ms from ${previousDelay}ms`);
    });

    // Movement ability emulation
    
    /*
     * Handles action stage events to emulate various movement abilities
     * Processes dash, backstab, teleport, and position swap skills
     * @param {Object} event - The action stage event data
     */
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_DESTINATION_ALL, event => {
        // Skip if not player or skill is disabled
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled(event.skill.id)) return;

        // Handle instant skills with targets or endpoints
        if (["C_START_COMBO_INSTANT_SKILL", "C_START_INSTANCE_SKILL"].includes(mods.last.startSkill._name) && event.stage === 0) {
            const startSkill = mods.last.startSkill;
            
            if ((startSkill?.targets?.length || startSkill?.endpoints?.length)) {
                mod.setTimeout(() => {
                    if (!mods.action.inAction) return;
                    
                    mod.send(...mods.packet.get_all("S_INSTANCE_ARROW"), {
                        ...mods.last.startSkill,
                        ...event,
                        actionId: event.id
                    });
                }, 3);
            }
        }

        const skillType = mods.skills.getType(event.skill.id);
        
        switch (skillType) {
            case "dash": {
                // Handle dash-type skills (e.g., Warrior's Charging Slash)
                if (event.stage !== 0) return;
                
                const targetedSkill = mods.last.packet("C_START_TARGETED_SKILL");
                const targetId = targetedSkill?.targets?.[0]?.gameId;
                
                mod.setTimeout(() => {
                    // Verify action is still valid
                    if (mods.action.stage.id !== event.id) return;
                    if (!mods.action.inAction) return;
                    
                    // Set cooldown to prevent duplicate packets
                    dashCooldownTimestamp = Date.now() + mods.utils.getPacketBuffer();
                    
                    // Send instant dash packet to client
                    mod.send(...mods.packet.get_all("S_INSTANT_DASH"), {
                        gameId: event.gameId,
                        target: targetId,
                        loc: targetedSkill.dest,
                        w: targetedSkill.w
                    });
                }, mods.settings.dash);
                break;
            }
            
            case "catchBack": {
                // Handle backstab-type skills (e.g., Warrior's Backstab)
                if (event.stage !== 0) return;
                if (mods.player.job === classes.REAPER) return; // Reaper has special handling
                if (!mods.utils.canBackstabInArea()) return;
                
                const targetedSkill = mods.last.packet("C_START_TARGETED_SKILL");
                const targetId = targetedSkill?.targets?.[0]?.gameId || 0n;
                
                if (!mods.utils.canBackstabEntity(targetId)) return;
                
                moveCooldownTimestamp = Date.now() + mods.utils.getPacketBuffer();
                
                // Class-specific backstab delays for optimal timing
                const backstabDelay = {
                    [classes.VALKYRIE]: 185 // Valkyrie needs longer delay
                }[mods.player.job] || 25;   // Default delay for other classes
                
                mod.setTimeout(() => {
                    // Verify action is still valid
                    if (mods.action.stage.id !== event.id) return;
                    if (!mods.action.inAction) return;
                    
                    // Calculate position behind target
                    const targetLocation = mods.entity.getLocationForThisEntity(targetId);
                    const targetRadius = mods.utils.getBossRadius(targetId);
                    const backstabPosition = mods.utils.applyDistance(
                        targetLocation,
                        targetLocation.w + Math.PI, // Opposite direction (behind)
                        targetRadius
                    );
                    
                    // Send instant move packet to client
                    mod.send(...mods.packet.get_all("S_INSTANT_MOVE"), {
                        gameId: event.gameId,
                        loc: backstabPosition,
                        w: targetLocation.w
                    });
                }, backstabDelay);
                break;
            }
            
            case "shortTel": {
                // Handle short teleport skills (e.g., Sorcerer's Jaunt)
                if (event.stage !== 1 || !mods.settings.emulateJaunt) return;
                
                // Check for nearby players that might block teleport
                for (const playerId in mods.entity.players) {
                    const player = mods.entity.players[playerId];
                    
                    // Skip players with certain relations (non-blocking)
                    if (![3, 5, 8].includes(player.relation)) continue;
                    
                    const distanceToPlayer = mods.player.loc.dist2D(player.pos);
                    
                    // Allow teleport if player is far enough
                    if (distanceToPlayer >= 55) {
                        mods.log.debug("JAUNT", "Allowing jaunt through due to dist", distanceToPlayer);
                        continue;
                    }
                    
                    // Don't emulate if player is too close (would be blocked)
                    if (distanceToPlayer <= 5) {
                        mods.log.debug("JAUNT", "Not emulating jaunt due to dist", distanceToPlayer);
                        return;
                    }
                    
                    // Check angle between player and teleport direction
                    const angleToPlayer = (mods.player.loc.angleTo(player.pos) + Math.PI) % Math.PI;
                    const teleportAngle = (event.w + Math.PI) % Math.PI;
                    const angleDifference = Math.abs(angleToPlayer - teleportAngle);
                    
                    // Don't emulate if player is in teleport path
                    if (angleDifference <= 2) {
                        mods.log.debug("JAUNT", "Not emulating jaunt due to arc", angleDifference, angleToPlayer, teleportAngle);
                        return;
                    }
                }
                
                // Calculate teleport destination
                const originalSkill = mods.last.packetForSkill(event.skill.id);
                const originalDistance = originalSkill.loc.dist2D(originalSkill.dest);
                
                // Set destination to maximum teleport distance (334 units)
                event.dest = mods.utils.applyDistance(event.loc, event.w, 334);
                
                const newDistance = event.loc.dist2D(event.dest);
                
                // Use original destination if it's shorter than maximum distance
                if (originalDistance < newDistance) {
                    event.dest = originalSkill.dest;
                }
                
                // Maintain original Z coordinate for proper elevation
                event.dest.z = originalSkill.dest.z;
                
                mod.setTimeout(() => {
                    // Verify action is still valid
                    if (mods.action.stage.id !== event.id) return;
                    if (!mods.action.inAction) return;
                    
                    moveCooldownTimestamp = Date.now() + mods.utils.getPacketBuffer();
                    
                    // Send instant move packet to client
                    mod.send(...mods.packet.get_all("S_INSTANT_MOVE"), {
                        gameId: event.gameId,
                        loc: event.dest,
                        w: event.w
                    });
                }, 25);
                break;
            }
            
            case "positionswap": {
                // Handle position swap skills (placeholder for future implementation)
                if (event.stage !== 0) return;
                break;
            }
        }
    });

    // Packet filtering
    
    /*
     * Blocks real server movement packets during emulated movement
     * Prevents visual stuttering from conflicting movement instructions
     * @param {Object} event - The instant move packet data
     * @returns {boolean|undefined} False to block packet, undefined to allow
     */
    mod.hook(...mods.packet.get_all("S_INSTANT_MOVE"), hooks.MODIFY_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (Date.now() > moveCooldownTimestamp) return;
        return false; // Block packet
    });

    /*
     * Blocks real server dash packets during emulated dashes
     * Prevents visual stuttering from conflicting dash instructions
     * @param {Object} event - The instant dash packet data
     * @returns {boolean|undefined} False to block packet, undefined to allow
     */
    mod.hook(...mods.packet.get_all("S_INSTANT_DASH"), hooks.MODIFY_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (Date.now() > dashCooldownTimestamp) return;
        return false; // Block packet
    });

    /*
     * Blocks real server arrow packets for emulated skills
     * Prevents duplicate visual effects for instant skills
     * @param {Object} event - The instance arrow packet data
     * @returns {boolean|undefined} False to block packet, undefined to allow
     */
    mod.hook(...mods.packet.get_all("S_INSTANCE_ARROW"), hooks.MODIFY_REAL, event => {
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled(event.skill.id)) return;
        return false; // Block packet
    });
};