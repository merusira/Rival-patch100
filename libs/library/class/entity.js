/*
 * Rival Mod - Entity System
 * 
 * entity.js manages tracking of game entities including players, mobs, NPCs, and other objects.
 * It provides methods to query entity positions, check proximity, and track entity state changes
 * through packet hooks.
 */

const DEFAULT_HOOK_SETTINGS = {order: -1000, filter: {fake: null}};
/*
 * Entity class
 * 
 * Tracks and manages game entities including players, mobs, NPCs, and other objects.
 * Provides methods to query entity positions, check proximity between entities,
 * and access entity data.
 */
class Entity {
    /*
     * Creates a new Entity instance
     * @param {Object} dispatch - The dispatch interface for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(dispatch, mods) {
        this.dispatch = dispatch;    // Dispatch interface
        this.mods = mods;            // Module references
        
        // Entity storage containers
        this.mobs = {};              // Hostile entities (aggressive NPCs)
        this.players = {};           // Player entities
        this.npcs = {};              // Non-hostile NPCs (villagers, etc.)
        this.unknown = {};           // Unclassified entities
        
        this.hooksInitialized = false; // Track if hooks have been initialized
        
        // Initialize hooks if possible (will be called again if packet module not yet available)
        this.initializeHooks();
    }
    
    /*
     * Initializes all packet hooks for entity tracking
     * This may be called multiple times, but will only initialize once
     */
    initializeHooks() {
        // Skip if already initialized
        if (this.hooksInitialized) return;
        
        // Make sure mods and packet module are available
        if (!this.mods || !this.mods.packet || typeof this.mods.packet.get_all !== 'function') {
            console.log("[Entity] Warning: Packet module not available, entity tracking will be limited");
            return;
        }
        
        this.hooksInitialized = true;
        
        // Set up entity query methods
        this._setupQueryMethods();
        
        // Set up packet hooks with proper error handling
        this._setupResetHooks();
        this._setupSpawnHooks();
        this._setupDespawnHooks();
        this._setupMovementHooks();
        this._setupActionHooks();
        this._setupStateHooks();
    }
    
    // Entity query methods
    
    /*
     * Sets up entity query methods
     * @private
     */
    _setupQueryMethods() {
        /*
         * Gets the location of an entity by ID, checking all entity types
         * @param {BigInt} id - The entity ID
         * @returns {Object|undefined} The entity position or undefined if not found
         */
        this.getLocationForThisEntity = (id) => {
            if (this.players[id]) return this.players[id].pos;
            if (this.mobs[id]) return this.mobs[id].pos;
            if (this.npcs[id]) return this.npcs[id].pos;
            if (this.unknown[id]) return this.unknown[id].pos;
            return undefined;
        };
        
        /*
         * Gets the location of a player by ID
         * @param {BigInt} id - The player ID
         * @returns {Object|undefined} The player position
         */
        this.getLocationForPlayer = (id) => this.players[id]?.pos;
        
        /*
         * Gets the location of a mob by ID
         * @param {BigInt} id - The mob ID
         * @returns {Object|undefined} The mob position
         */
        this.getLocationForMob = (id) => this.mobs[id]?.pos;
        
        /*
         * Gets the location of an NPC by ID
         * @param {BigInt} id - The NPC ID
         * @returns {Object|undefined} The NPC position
         */
        this.getLocationForNpc = (id) => this.npcs[id]?.pos;
        
        /*
         * Checks if any entity is near the specified position
         * @param {Object} pos - The position to check
         * @param {number} playerRadius - The radius around the position to check
         * @param {number} entityRadius - The radius of entities to consider
         * @returns {boolean} Whether any entity is within range
         */
        this.isNearEntity = (pos, playerRadius = 50, entityRadius = 50) => {
            return this.isNearPlayer(pos, playerRadius, entityRadius) || 
                   this.isNearBoss(pos, playerRadius, entityRadius);
        };
        
        /*
         * Checks if any player is near the specified position
         * @param {Object} pos - The position to check
         * @param {number} playerRadius - The radius around the position to check
         * @param {number} entityRadius - The radius of players to consider
         * @returns {boolean} Whether any player is within range
         */
        this.isNearPlayer = (pos, playerRadius = 50, entityRadius = 50) => {
            for (let key in this.players) {
                let entity = this.players[key];
                if (this.mods.library.positionsIntersect(entity.pos, pos, playerRadius, entityRadius)) {
                    return true;
                }
            }
            return false;
        };
        
        /*
         * Checks if any mob is near the specified position
         * @param {Object} pos - The position to check
         * @param {number} playerRadius - The radius around the position to check
         * @param {number} entityRadius - The radius of mobs to consider
         * @returns {boolean} Whether any mob is within range
         */
        this.isNearBoss = (pos, playerRadius = 50, entityRadius = 50) => {
            for (let key in this.mobs) {
                let entity = this.mobs[key];
                if (this.mods.library.positionsIntersect(entity.pos, pos, playerRadius, entityRadius)) {
                    return true;
                }
            }
            return false;
        };
        
        /*
         * Gets entity data by ID, checking all entity types
         * @param {BigInt} id - The entity ID
         * @returns {Object|undefined} The entity data or undefined if not found
         */
        this.getEntityData = (id) => {
            const stringId = id.toString();
            return this.npcs[stringId] || this.mobs[stringId] || this.players[stringId] || this.unknown[stringId];
        };
        
        /*
         * Gets settings for an entity from a settings object
         * @param {BigInt} id - The entity ID
         * @param {Object} object - The settings object indexed by huntingZoneId and templateId
         * @returns {Object|undefined} The entity settings or undefined if not found
         */
        this.getSettingsForEntity = (id, object) => {
            const entity = this.getEntityData(id);
            
            if (entity && object[entity.info.huntingZoneId]) {
                return object[entity.info.huntingZoneId][entity.info.templateId];
            }
            return undefined;
        };
    }
    
    // Hook setup methods
    
    /*
     * Sets up hooks for resetting entity cache
     * @private
     */
    _setupResetHooks() {
        /*
         * Resets all entity caches
         */
        this.resetCache = () => {
            this.mobs = {};
            this.players = {};
            this.npcs = {};
            this.unknown = {};
        };
        
        // Reset cache when zone changes
        this.dispatch.hook('S_LOAD_TOPO', 'raw', DEFAULT_HOOK_SETTINGS, this.resetCache);
    }
    
    /*
     * Sets up hooks for entity spawning
     * @private
     */
    _setupSpawnHooks() {
        /*
         * Handles entity spawn events
         * @param {boolean} mob - Whether this is a mob/NPC spawn (true) or player spawn (false)
         * @param {Object} e - The spawn event data
         */
        this.spawnEntity = (mob, e) => {
            let id = e.gameId.toString();
            let job = (e.templateId - 10101) % 100;
            let race = Math.floor((e.templateId - 10101) / 100);
            
            let pos = e.loc;
            pos.w = e.w;
            
            let data = {
                name: e.name,
                info: {
                    huntingZoneId: e.huntingZoneId,
                    templateId: e.templateId
                },
                relation: e.relation,
                huntingZoneId: e.huntingZoneId,
                templateId: e.templateId,
                gameId: e.gameId,
                visible: e.visible,
                loc: pos,
                job,
                race,
                pos
            };
            
            // Classify entity based on type
            // relation(10 door), aggressive == isMob, relation(12 for special cases), rel = 10 & spawnType = 1 == HW dummy
            if (mob && e.villager) {
                this.npcs[id] = Object.assign(data, {"var": "npcs"});
            } else if (mob && (e.aggressive || e.relation == 12 || (e.relation == 10 && e.spawnType == 1))) {
                this.mobs[id] = Object.assign(data, {"var": "mobs"});
            } else if (!mob) {
                this.players[id] = Object.assign(data, { "var": "players", serverId: e.serverId, playerId: e.playerId });
            } else {
                this.unknown[id] = Object.assign(data, {"var": "unknown"});
            }
        };
        
        // Hook player spawn
        try {
            const spawnUserPacket = this.mods.packet.get_all("S_SPAWN_USER");
            if (spawnUserPacket && spawnUserPacket[1] !== null) {
                this.dispatch.hook(...spawnUserPacket, DEFAULT_HOOK_SETTINGS, this.spawnEntity.bind(null, false));
            } else {
                console.log("[Entity] Warning: Could not hook S_SPAWN_USER, some functionality may be limited");
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_SPAWN_USER:", error.message);
        }
        
        // Hook NPC/mob spawn
        try {
            const spawnNpcPacket = this.mods.packet.get_all("S_SPAWN_NPC");
            if (spawnNpcPacket && spawnNpcPacket[1] !== null) {
                this.dispatch.hook(...spawnNpcPacket, DEFAULT_HOOK_SETTINGS, this.spawnEntity.bind(null, true));
            } else {
                console.log("[Entity] Warning: Could not hook S_SPAWN_NPC, some functionality may be limited");
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_SPAWN_NPC:", error.message);
        }
    }
    
    /*
     * Sets up hooks for entity despawning
     * @private
     */
    _setupDespawnHooks() {
        /*
         * Handles entity despawn events
         * @param {Object} e - The despawn event data
         */
        this.despawnEntity = (e) => {
            let id = e.gameId.toString();
            
            // Remove entity from all caches
            if (this.mobs[id]) delete this.mobs[id];
            if (this.npcs[id]) delete this.npcs[id];
            if (this.players[id]) delete this.players[id];
            if (this.unknown[id]) delete this.unknown[id];
        };
        
        // Hook NPC/mob despawn
        try {
            const despawnNpcPacket = this.mods.packet.get_all("S_DESPAWN_NPC");
            if (despawnNpcPacket && despawnNpcPacket[1] !== null) {
                this.dispatch.hook(...despawnNpcPacket, DEFAULT_HOOK_SETTINGS, this.despawnEntity);
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_DESPAWN_NPC:", error.message);
        }
        
        // Hook player despawn
        try {
            const despawnUserPacket = this.mods.packet.get_all("S_DESPAWN_USER");
            if (despawnUserPacket && despawnUserPacket[1] !== null) {
                this.dispatch.hook(...despawnUserPacket, DEFAULT_HOOK_SETTINGS, this.despawnEntity);
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_DESPAWN_USER:", error.message);
        }
    }
    
    /*
     * Sets up hooks for entity movement
     * @private
     */
    _setupMovementHooks() {
        /*
         * Updates entity position based on movement packets
         * @param {boolean} mob - Whether this is a mob/NPC movement (true) or player movement (false)
         * @param {Object} e - The movement event data
         */
        this.updatePosition = (mob, e) => {
            let id = e.gameId.toString();
            
            let pos = e.dest;
            pos.w = e.w;
            
            // Update position in all possible entity caches
            if (this.mobs[id]) this.mobs[id].pos = pos;
            if (this.players[id]) this.players[id].pos = pos;
            if (this.npcs[id]) this.npcs[id].pos = pos;
            if (this.unknown[id]) this.unknown[id].pos = pos;
        };
        
        // Hook NPC/mob movement
        try {
            const npcLocationPacket = this.mods.packet.get_all("S_NPC_LOCATION");
            if (npcLocationPacket && npcLocationPacket[1] !== null) {
                this.dispatch.hook(...npcLocationPacket, DEFAULT_HOOK_SETTINGS, this.updatePosition.bind(null, true));
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_NPC_LOCATION:", error.message);
        }
        
        // Hook player movement
        try {
            const userLocationPacket = this.mods.packet.get_all("S_USER_LOCATION");
            if (userLocationPacket && userLocationPacket[1] !== null) {
                this.dispatch.hook(...userLocationPacket, DEFAULT_HOOK_SETTINGS, this.updatePosition.bind(null, false));
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_USER_LOCATION:", error.message);
        }
        
        /*
         * Updates entity direction based on rotation packets
         * @param {Object} e - The rotation event data
         */
        this.directionUpdate = (e) => {
            let id = e.gameId.toString();
            
            // Update direction in all possible entity caches
            if (this.mobs[id]) this.mobs[id].pos.w = e.w;
            if (this.players[id]) this.players[id].pos.w = e.w;
            if (this.npcs[id]) this.npcs[id].pos.w = e.w;
            if (this.unknown[id]) this.unknown[id].pos.w = e.w;
        };
        
        // Hook entity rotation
        try {
            const rotatePacket = this.mods.packet.get_all("S_CREATURE_ROTATE");
            if (rotatePacket && rotatePacket[1] !== null) {
                this.dispatch.hook(...rotatePacket, DEFAULT_HOOK_SETTINGS, this.directionUpdate);
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_CREATURE_ROTATE:", error.message);
        }
    }
    
    /*
     * Sets up hooks for entity actions
     * @private
     */
    _setupActionHooks() {
        /*
         * Updates entity position based on action packets
         * @param {Object} e - The action event data
         */
        this.sAction = (e) => {
            let id = e.gameId.toString();
            
            let pos = e.loc;
            pos.w = e.w;
            
            // Apply movement distance if present
            if (e.movement) {
                let distance = 0;
                for (let idx in e.movement) {
                    distance += e.movement[idx].distance;
                }
                this.mods.library.applyDistance(pos, distance);
            }
            
            // Update position in all possible entity caches
            if (this.mobs[id]) this.mobs[id].pos = pos;
            if (this.players[id]) this.players[id].pos = pos;
            if (this.npcs[id]) this.npcs[id].pos = pos;
            if (this.unknown[id]) this.unknown[id].pos = pos;
        };
        
        // Hook action start
        try {
            const actionStagePacket = this.mods.packet.get_all("S_ACTION_STAGE");
            if (actionStagePacket && actionStagePacket[1] !== null) {
                this.dispatch.hook(...actionStagePacket, DEFAULT_HOOK_SETTINGS, this.sAction);
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_ACTION_STAGE:", error.message);
        }
        
        // Hook action end
        try {
            const actionEndPacket = this.mods.packet.get_all("S_ACTION_END");
            if (actionEndPacket && actionEndPacket[1] !== null) {
                this.dispatch.hook(...actionEndPacket, DEFAULT_HOOK_SETTINGS, this.sAction);
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_ACTION_END:", error.message);
        }
        
        // Hook skill results for CC effects
        try {
            const skillResultPacket = this.mods.packet.get_all("S_EACH_SKILL_RESULT");
            if (skillResultPacket && skillResultPacket[1] !== null) {
                this.dispatch.hook(...skillResultPacket, DEFAULT_HOOK_SETTINGS, e => {
                    let id = e.target.toString();
                    let loc = null;
                    
                    // Find entity location
                    if (this.npcs[id]) loc = this.npcs[id].pos;
                    if (this.mobs[id]) loc = this.mobs[id].pos;
                    if (this.players[id]) loc = this.players[id].pos;
                    if (this.unknown[id]) loc = this.unknown[id].pos;
                    
                    // Update position for CC effects
                    if (loc && e.reaction.enable) {
                        let dist = 0;
                        for (let i in e.reaction.animSeq) {
                            dist += e.reaction.animSeq[i].distance;
                        }
                        dist *= -1;
                        this.mods.library.applyDistance(loc, dist);
                    }
                });
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_EACH_SKILL_RESULT:", error.message);
        }
    }
    
    /*
     * Sets up hooks for entity state changes
     * @private
     */
    _setupStateHooks() {
        // Hook HP changes
        try {
            const changeHpPacket = this.mods.packet.get_all("S_CREATURE_CHANGE_HP");
            if (changeHpPacket && changeHpPacket[1] !== null) {
                this.dispatch.hook(...changeHpPacket, DEFAULT_HOOK_SETTINGS, e => {
                    let id = e.target.toString();
                    
                    const data = {
                        curHp: e.curHp,
                        maxHp: e.maxHp,
                    };
                    
                    // Update HP in all possible entity caches
                    if (this.mobs[id]) Object.assign(this.mobs[id], data);
                    if (this.players[id]) Object.assign(this.players[id], data);
                    if (this.npcs[id]) Object.assign(this.npcs[id], data);
                    if (this.unknown[id]) Object.assign(this.unknown[id], data);
                });
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_CREATURE_CHANGE_HP:", error.message);
        }
        
        // Hook relation changes
        try {
            const changeRelationPacket = this.mods.packet.get_all("S_CHANGE_RELATION");
            if (changeRelationPacket && changeRelationPacket[1] !== null) {
                this.dispatch.hook(...changeRelationPacket, DEFAULT_HOOK_SETTINGS, e => {
                    let id = e.target.toString();
                    
                    // Update relation in all possible entity caches
                    if (this.mobs[id]) this.mobs[id].relation = e.relation;
                    if (this.players[id]) this.players[id].relation = e.relation;
                    if (this.npcs[id]) this.npcs[id].relation = e.relation;
                    if (this.unknown[id]) this.unknown[id].relation = e.relation;
                });
            }
        } catch (error) {
            console.log("[Entity] Error hooking S_CHANGE_RELATION:", error.message);
        }
    }
}
// Export the Entity class
module.exports = Entity;