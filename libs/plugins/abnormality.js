/*
 * Rival Mod - Abnormality System
 * 
 * abnormality.js handles the tracking, application, and removal of abnormality effects.
 * It manages both client and server-side abnormality states, handles timing and duration,
 * and provides methods to start and end abnormalities based on skill usage.
 */
const hooks = require('../enums/hooks');
/*
 * Abnormality module
 *
 * Manages abnormality effects on the player character, handling their application,
 * timing, and removal based on skill usage and server events.
 *
 * Note on module usage: Unlike class-based plugins that are instantiated with 'new',
 * this function module is directly invoked with parameters when imported. Other files
 * reference it by its export name (e.g., require('./libs/plugins/abnormality')), not
 * by the function's internal name.
 *
 * @param {Object} mod - The mod API object for hooking events and sending packets
 * @param {Object} mods - Collection of module references containing player, effects, and utility modules
 * @returns {undefined} This module sets up hooks and handlers but doesn't return a value
 */
module.exports = function Abnormality(mod, mods) {
    // State tracking for abnormalities
    let abnormalityStartTimes = {},    // Tracks when abnormalities were started
        abnormalityEndTimes = {},      // Tracks when abnormalities were ended
        abnormalityTimeouts = {},      // Stores timeout handles for abnormality durations
        skillAbnormalityMap = {},      // Maps skills to abnormalities they start
        skillEndAbnormalityMap = {};   // Maps skills to abnormalities they end

    // Debug command (disabled by default)
    if (false) {
        mods.command.add("abnormality", id => {
            console.log(mods.datacenter.getAbnormalityData(id));
        });
    }

    // Core abnormality management methods

    /*
     * Starts an abnormality effect on the player
     * @param {number} abnormalityId - The ID of the abnormality to start
     * @param {number} skillId - The skill ID that triggered this abnormality
     * @param {number|null} customDuration - Optional custom duration to override default
     */
    const startAbnormality = (abnormalityId, skillId, customDuration = null) => {
        // Remove from skill mapping if exists
        if (skillAbnormalityMap[skillId]) {
            skillAbnormalityMap[skillId] = skillAbnormalityMap[skillId].filter(id => id !== abnormalityId);
        }

        // Get abnormality data
        const abnormalityData = mods.datacenter.getAbnormalityData(abnormalityId);
        if (!abnormalityData) {
            mods.log.error("startAbnormality", "didn't find abnormData:", abnormalityId);
            return;
        }

        // Check if abnormality already exists
        const existingAbnormality = mods.effects.getAbnormality(abnormalityId);
        
        // Create abnormality packet data
        const abnormalityPacket = {
            target: mods.player.gameId,
            source: 0n,
            id: abnormalityId,
            duration: +(customDuration || abnormalityData.time || 0),
            stacks: existingAbnormality?.stacks || 1
        };

        // Send appropriate packet (refresh or begin)
        mod.send(
            ...mods.packet.get_all("S_ABNORMALITY_" + (existingAbnormality ? "REFRESH" : "BEGIN")),
            abnormalityPacket
        );
        
        // Track start time and clear any existing timeout
        abnormalityStartTimes[abnormalityId] = Date.now() + mods.utils.getPacketBuffer();
        mod.clearTimeout(abnormalityTimeouts[abnormalityId]);

        // Set timeout to end abnormality if duration is valid
        if (abnormalityPacket.duration <= 0x7fffffff) {
            abnormalityTimeouts[abnormalityId] = mod.setTimeout(
                endAbnormality,
                abnormalityPacket.duration,
                abnormalityId
            );
        }
    };

    /*
     * Ends an abnormality effect on the player
     * @param {number} abnormalityId - The ID of the abnormality to end
     */
    const endAbnormality = abnormalityId => {
        mod.send(...mods.packet.get_all('S_ABNORMALITY_END'), {
            target: mods.player.gameId,
            id: abnormalityId
        });
        
        // Track end time
        abnormalityEndTimes[abnormalityId] = Date.now() + mods.utils.getPacketBuffer();
    };

    /*
     * Reverts abnormality state based on server state
     * @param {number} abnormalityId - The abnormality ID to check
     * @param {boolean} isEnding - Whether the abnormality is ending
     */
    const revertAbnormalityState = (abnormalityId, isEnding) => {
        const initialServerAbnormality = mods.effects.getServerAbnormality(abnormalityId);
        const initialClientAbnormality = mods.effects.getAbnormality(abnormalityId);
        
        setTimeout(() => {
            const currentServerAbnormality = mods.effects.getServerAbnormality(abnormalityId);
            const currentClientAbnormality = mods.effects.getAbnormality(abnormalityId);
            
            // Check for various state changes
            const serverAbnormalityStarted = !initialServerAbnormality && currentServerAbnormality ||
                (initialServerAbnormality && currentServerAbnormality &&
                 currentServerAbnormality.time > initialServerAbnormality.time);
                 
            const serverAbnormalityEnded = initialServerAbnormality && !currentServerAbnormality;
            const noServerAbnormality = !initialServerAbnormality && !currentServerAbnormality;
            
            // Early returns for various conditions
            if (!isEnding && serverAbnormalityStarted) return;
            if (isEnding && serverAbnormalityEnded) return;
            if (isEnding && noServerAbnormality) return;
            
            const clientAbnormalityEnded = initialClientAbnormality && !currentClientAbnormality;
            if (!isEnding && clientAbnormalityEnded) return;
            
            // Handle ending abnormality
            if (!isEnding) {
                mods.log.debug("revertingAbnormality", "ending " + abnormalityId);
                mod.clearTimeout(abnormalityTimeouts[abnormalityId]);
                abnormalityTimeouts[abnormalityId] = undefined;
                abnormalityStartTimes[abnormalityId] = undefined;
                
                mod.send(...mods.packet.get_all("S_ABNORMALITY_END"), {
                    target: mods.player.gameId,
                    id: abnormalityId
                });
                return;
            }
            
            // Handle uncertain state
            if (!initialClientAbnormality) {
                mods.log.debug(
                    "revertingAbnormality",
                    "Uncertain state reached for " + abnormalityId,
                    initialClientAbnormality, currentClientAbnormality,
                    initialServerAbnormality, currentServerAbnormality,
                    isEnding
                );
                return;
            }
            
            // Get the most recent abnormality data
            const mostRecentAbnormality = currentServerAbnormality &&
                currentServerAbnormality.time > initialClientAbnormality.time ?
                currentServerAbnormality : initialClientAbnormality;
            
            // Calculate remaining duration
            const remainingDuration = Math.max(
                mostRecentAbnormality.duration - (Date.now() - mostRecentAbnormality.time),
                0
            );
            
            // Skip if no duration left
            if (remainingDuration === 0) {
                mods.log.debug(
                    "revertingAbnormality",
                    "no point in reverting " + abnormalityId + " as there is no duration left."
                );
                return;
            }
            
            // Restart abnormality with remaining duration
            mods.log.debug(
                "revertingAbnormality",
                "restarting " + abnormalityId + " with the following duration left: " + remainingDuration
            );
            
            mod.clearTimeout(abnormalityTimeouts[abnormalityId]);
            abnormalityTimeouts[abnormalityId] = undefined;
            abnormalityEndTimes[abnormalityId] = undefined;
            
            mod.send(...mods.packet.get_all("S_ABNORMALITY_BEGIN"), {
                target: mods.player.gameId,
                source: 0n,
                id: abnormalityId,
                duration: remainingDuration,
                stacks: mostRecentAbnormality.stacks
            });
        }, mods.utils.getPacketBuffer(100));
    };

    // Packet handlers for abnormality events

    /*
     * Handles abnormality begin/refresh packets
     * @param {boolean} isRefresh - Whether this is a refresh packet
     * @returns {Function} - Packet handler function
     */
    const abnormalityBeginRefreshHandler = isRefresh => packet => {
        // Only process player's own abnormalities
        if (!mods.player.isMe(packet.target)) return;
        if (!mods.utils.isEnabled()) return;
        
        // Get current abnormality state
        const currentAbnormality = mods.effects.getAbnormality(packet.id);
        
        // Ensure duration is a number
        packet.duration = Number(packet.duration);
        
        // Check if this is a meaningful update
        const isSignificantChange = currentAbnormality && (
            currentAbnormality.stacks !== packet.stacks ||
            packet.duration !== currentAbnormality.duration
        );
        
        const currentTime = Date.now();
        const recentStartTime = abnormalityStartTimes[packet.id];
        
        // Block if not significant and recently started
        if (!isSignificantChange && recentStartTime && recentStartTime > currentTime) {
            mods.log.debug("abnormalityBeginRefreshHandler", "Blocking");
            return false;
        }
        
        // Clear existing timeout
        mod.clearTimeout(abnormalityTimeouts[packet.id]);
        
        // Adjust duration for ping/jitter
        packet.duration -= mods.ping.ping + mods.ping.jitter;
        
        // Set timeout to end abnormality if duration is valid
        if (packet.duration <= 0x7fffffff) {
            abnormalityTimeouts[packet.id] = mod.setTimeout(
                endAbnormality,
                packet.duration,
                packet.id
            );
        }
        
        // Handle refresh when abnormality exists
        if (currentAbnormality && !isRefresh) {
            mod.send(...mods.packet.get_all('S_ABNORMALITY_REFRESH'), packet);
            return false;
        }
        
        // Handle begin when abnormality doesn't exist
        if (isRefresh && !currentAbnormality) {
            mod.send(...mods.packet.get_all('S_ABNORMALITY_BEGIN'), packet);
            return false;
        }
        
        return true;
    };

    // Hook registrations for skill actions

    // Hook for skill action stages
    mod.hook(...mods.packet.get_all("S_ACTION_STAGE"), hooks.READ_DESTINATION_FAKE, event => {
        // Only process player's own actions
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled(event.skill.id)) return;
        if (event.stage !== 0) return;

        // Get action speed for calculations
        const actionSpeed = mods.action.speed;
        
        // Process abnormalities that should end on this skill
        skillEndAbnormalityMap[event.skill.id] = [];
        const abnormalitiesToEnd = mods.skills.getAbnormalitiesToEndOnActionStage(event.skill.id);
        
        for (const { id, delay, fixed, forced } of abnormalitiesToEnd) {
            mod.clearTimeout(abnormalityTimeouts[id]);
            
            // Skip if abnormality doesn't exist
            if (!mods.effects.getAbnormality(id)) continue;
            
            // Track abnormality for this skill
            skillEndAbnormalityMap[event.skill.id].push(id);
            
            // Calculate delay based on speed modifiers
            const scaledDelay = delay / (fixed ? actionSpeed.fixed : actionSpeed.not_fixed);
            
            // End abnormality after delay if valid
            if (scaledDelay <= 0x7fffffff) {
                if (scaledDelay === 0) {
                    // End immediately
                    if (!forced) revertAbnormalityState(id, true);
                    endAbnormality(id);
                } else {
                    // End after delay
                    abnormalityTimeouts[id] = mod.setTimeout(abnormalityId => {
                        if (!forced) revertAbnormalityState(abnormalityId, true);
                        endAbnormality(abnormalityId);
                    }, scaledDelay, id);
                }
            }
        }
        
        // Process abnormalities that should start on this skill
        skillAbnormalityMap[event.skill.id] = [];
        const abnormalitiesToStart = mods.skills.getAbnormalitiesToStartOnActionStage(event.skill.id);
        
        for (const { id, delay, fixed, duration, forced } of abnormalitiesToStart) {
            // Calculate delay based on speed modifiers
            const scaledDelay = delay / (fixed ? actionSpeed.fixed : actionSpeed.not_fixed);
            
            // Track abnormality for this skill
            skillAbnormalityMap[event.skill.id].push(id);
            
            // Clear any existing timeout
            mod.clearTimeout(abnormalityTimeouts[id]);
            
            // Start abnormality after delay if valid
            if (scaledDelay <= 0x7fffffff) {
                abnormalityTimeouts[id] = mod.setTimeout(
                    (abnormalityId, skillId, customDuration) => {
                        if (!forced) revertAbnormalityState(abnormalityId, false);
                        startAbnormality(abnormalityId, skillId, customDuration);
                    },
                    scaledDelay,
                    id,
                    event.skill.id,
                    duration
                );
            }
        }
    });

    // Hook for skill action end
    mod.hook(...mods.packet.get_all('S_ACTION_END'), hooks.READ_DESTINATION_FAKE, event => {
        // Only process player's own actions
        if (!mods.player.isMe(event.gameId)) return;
        if (!mods.utils.isEnabled(event.skill.id)) return;
        
        // Clear timeouts for abnormalities associated with this skill
        for (const abnormalityId of skillEndAbnormalityMap[event.skill.id] || []) {
            mod.clearTimeout(abnormalityTimeouts[abnormalityId]);
        }
        
        for (const abnormalityId of skillAbnormalityMap[event.skill.id] || []) {
            mod.clearTimeout(abnormalityTimeouts[abnormalityId]);
        }
        
        // Get action speed for calculations
        const actionSpeed = mods.action.speed;
        
        // Process abnormalities that should end when this skill ends
        const abnormalitiesToEnd = mods.skills.getAbnormalitiesToEndOnActionEnd(event.skill.id);
        for (const { id, delay, fixed, noTimer } of abnormalitiesToEnd) {
            mod.clearTimeout(abnormalityTimeouts[id]);
            
            // Skip if abnormality doesn't exist
            if (!mods.effects.getAbnormality(id)) continue;
            
            // Calculate delay based on speed modifiers
            const scaledDelay = delay / (fixed ? actionSpeed.fixed : actionSpeed.not_fixed);
            
            // Skip if delay is too large
            if (scaledDelay > 0x7fffffff) continue;
            
            // End abnormality after delay
            if (noTimer) {
                mod.setTimeout(endAbnormality, scaledDelay, id);
            } else {
                abnormalityTimeouts[id] = mod.setTimeout(endAbnormality, scaledDelay, id);
            }
        }
    });

    // Hook registrations for abnormality packets

    // Hook abnormality begin packet
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_BEGIN"),
        hooks.MODIFY_REAL,
        abnormalityBeginRefreshHandler(false)
    );
    
    // Hook abnormality refresh packet
    mod.hook(
        ...mods.packet.get_all("S_ABNORMALITY_REFRESH"),
        hooks.MODIFY_REAL,
        abnormalityBeginRefreshHandler(true)
    );

    // Hook abnormality end packet
    mod.hook(...mods.packet.get_all("S_ABNORMALITY_END"), hooks.MODIFY_REAL, packet => {
        // Only process player's own abnormalities
        if (!mods.player.isMe(packet.target)) return;
        if (!mods.utils.isEnabled()) return;
        
        const currentTime = Date.now();
        
        // Check if abnormality was recently ended
        let recentTime = abnormalityEndTimes[packet.id];
        if (recentTime && recentTime > currentTime) {
            mods.log.debug(
                "abnormEndHandler",
                "Not ending due to recently ended",
                currentTime,
                recentTime
            );
            return false;
        }
        
        // Check if abnormality was recently started
        recentTime = abnormalityStartTimes[packet.id];
        if (recentTime && recentTime > currentTime) {
            mods.log.debug(
                "abnormEndHandler",
                "Not ending due to recently emulated",
                currentTime,
                recentTime
            );
            return false;
        }
        // Clear timeout
        mod.clearTimeout(abnormalityTimeouts[packet.id]);
    });
};