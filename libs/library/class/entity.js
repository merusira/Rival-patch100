const DEFAULT_HOOK_SETTINGS = {order: -1000, filter: {fake: null}};

class entity{
    constructor(dispatch, mods) {
        this.mobs = {};
        this.players = {};
        this.npcs = {};
        this.unknown = {};
        this.dispatch = dispatch;
        this.mods = mods;
        
        // Initialize hooks when packet module is available
        this.initializeHooks();
    }
    
    // Method to initialize hooks when packet module is available
    initializeHooks() {
        // Skip if already initialized
        if (this.hooksInitialized) return;
        this.hooksInitialized = true;
        
        // Make sure mods and packet module are available
        if (!this.mods || !this.mods.packet || typeof this.mods.packet.get_all !== 'function') {
            console.log("[Entity] Warning: Packet module not available, entity tracking will be limited");
            return;
        }

        // Functions
        this.getLocationForThisEntity = (id) => {
            if(this.players[id]) return this.players[id].pos;
            if(this.mobs[id]) return this.mobs[id].pos;
            if(this.npcs[id]) return this.npcs[id].pos;
            if(this.unknown[id]) return this.unknown[id].pos;
        }
        this.getLocationForPlayer = (id) => this.players[id].pos;
        this.getLocationForMob = (id) => this.mobs[id].pos;
        this.getLocationForNpc = (id) => this.npcs[id].pos;

        // Pos is player position
        this.isNearEntity = (pos, playerRadius = 50, entityRadius = 50) => {
            if(this.isNearPlayer(pos, playerRadius, entityRadius)) return true;
            if(this.isNearBoss(pos, playerRadius, entityRadius)) return true;
            return false;
        }

        // Pos is player position
        this.isNearPlayer = (pos, playerRadius = 50, entityRadius = 50) => {
            for(let key in this.players) {
                let entity = this.players[key];
                if(mods.library.positionsIntersect(entity.pos, pos, playerRadius, entityRadius)) return true;
            }
            return false;
        }

        // Pos is player position
        this.isNearBoss = (pos, playerRadius = 50, entityRadius = 50) => {
            for(let key in this.mobs) {
                let entity = this.mobs[key];
                if(mods.library.positionsIntersect(entity.pos, pos, playerRadius, entityRadius)) return true;
            }
            return false;
        }

        this.getEntityData = (id) => {
            return this.npcs[id.toString()] || this.mobs[id.toString()] || this.players[id.toString()] || this.unknown[id.toString()];
        };

        this.getSettingsForEntity = (id, object) => {
            const entity = this.getEntityData(id);

            if(object[entity.info.huntingZoneId]) {
                return object[entity.info.huntingZoneId][entity.info.templateId];
            }
        }

        // Zone reloaded -- reset cache
        this.resetCache = () => {
            this.mobs = {};
            this.players = {};
            this.npcs = {};
            this.unknown = {};
        }
        this.dispatch.hook('S_LOAD_TOPO', 'raw', DEFAULT_HOOK_SETTINGS, this.resetCache);

        // Entity spawned
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
            
            // relation(10 door), aggressive == isMob, relation(12 for special cases), rel = 10 & spawnType = 1 == HW dummy
            if(mob && e.villager) this.npcs[id] = Object.assign(data, {"var": "npcs"});
            else if(mob && (e.aggressive || e.relation == 12 || (e.relation == 10 && e.spawnType == 1))) this.mobs[id] = Object.assign(data, {"var": "mobs"});
            else this.unknown[id] = Object.assign(data, {"var": "unknown"});
            if(!mob) this.players[id] = Object.assign(data, { "var": "players", serverId: e.serverId, playerId: e.playerId });
        }
        
        // Safely hook packets with error handling
        try {
            const spawnUserPacket = this.mods.packet.get_all("S_SPAWN_USER");
            if (spawnUserPacket && spawnUserPacket[1] !== null) {
                this.dispatch.hook(...spawnUserPacket, DEFAULT_HOOK_SETTINGS, this.spawnEntity.bind(null, false));
            } else {
                console.log("[Entity] Warning: Could not hook S_SPAWN_USER, some functionality may be limited");
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_SPAWN_USER:", e.message);
        }
        
        try {
            const spawnNpcPacket = this.mods.packet.get_all("S_SPAWN_NPC");
            if (spawnNpcPacket && spawnNpcPacket[1] !== null) {
                this.dispatch.hook(...spawnNpcPacket, DEFAULT_HOOK_SETTINGS, this.spawnEntity.bind(null, true));
            } else {
                console.log("[Entity] Warning: Could not hook S_SPAWN_NPC, some functionality may be limited");
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_SPAWN_NPC:", e.message);
        }

        // Entity despawned
        this.despawnEntity = (e) => {
            let id = e.gameId.toString();
            
            if (this.mobs[id]) delete this.mobs[id];
            if (this.npcs[id]) delete this.npcs[id];
            if (this.players[id]) delete this.players[id];
            if (this.unknown[id]) delete this.unknown[id];
        };
        
        // Safely hook despawn packets
        try {
            const despawnNpcPacket = this.mods.packet.get_all("S_DESPAWN_NPC");
            if (despawnNpcPacket && despawnNpcPacket[1] !== null) {
                this.dispatch.hook(...despawnNpcPacket, DEFAULT_HOOK_SETTINGS, this.despawnEntity);
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_DESPAWN_NPC:", e.message);
        }
        
        try {
            const despawnUserPacket = this.mods.packet.get_all("S_DESPAWN_USER");
            if (despawnUserPacket && despawnUserPacket[1] !== null) {
                this.dispatch.hook(...despawnUserPacket, DEFAULT_HOOK_SETTINGS, this.despawnEntity);
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_DESPAWN_USER:", e.message);
        }

        // Move location update
        this.updatePosition = (mob, e) => {
            let id = e.gameId.toString();

            let pos = e.dest;
            pos.w = e.w;
    
            if(this.mobs[id]) this.mobs[id].pos = pos;
            if(this.players[id]) this.players[id].pos = pos;
            if(this.npcs[id]) this.npcs[id].pos = pos;
            if(this.unknown[id]) this.unknown[id].pos = pos;
        }
        
        // Safely hook location packets
        try {
            const npcLocationPacket = this.mods.packet.get_all("S_NPC_LOCATION");
            if (npcLocationPacket && npcLocationPacket[1] !== null) {
                this.dispatch.hook(...npcLocationPacket, DEFAULT_HOOK_SETTINGS, this.updatePosition.bind(null, true));
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_NPC_LOCATION:", e.message);
        }
        
        try {
            const userLocationPacket = this.mods.packet.get_all("S_USER_LOCATION");
            if (userLocationPacket && userLocationPacket[1] !== null) {
                this.dispatch.hook(...userLocationPacket, DEFAULT_HOOK_SETTINGS, this.updatePosition.bind(null, false));
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_USER_LOCATION:", e.message);
        }

        // Direction update
        this.directionUpdate = (e) => {
            let id = e.gameId.toString();
            if(this.mobs[id]) this.mobs[id].pos.w = e.w;
            if(this.players[id]) this.players[id].pos.w = e.w;
            if(this.npcs[id]) this.npcs[id].pos.w = e.w;
            if(this.unknown[id]) this.unknown[id].pos.w = e.w;
        }
        
        // Safely hook rotation packet
        try {
            const rotatePacket = this.mods.packet.get_all("S_CREATURE_ROTATE");
            if (rotatePacket && rotatePacket[1] !== null) {
                this.dispatch.hook(...rotatePacket, DEFAULT_HOOK_SETTINGS, this.directionUpdate);
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_CREATURE_ROTATE:", e.message);
        }

        // Entity CC'ed -- update location
        try {
            const skillResultPacket = this.mods.packet.get_all("S_EACH_SKILL_RESULT");
            if (skillResultPacket && skillResultPacket[1] !== null) {
                this.dispatch.hook(...skillResultPacket, DEFAULT_HOOK_SETTINGS, e=> {
                    let id = e.target.toString();
                    let loc = null;

                    if(this.npcs[id]) loc = this.npcs[id].pos;
                    if(this.mobs[id]) loc = this.mobs[id].pos;
                    if(this.players[id]) loc = this.players[id].pos;
                    if(this.unknown[id]) loc = this.unknown[id].pos;

                    if(loc) {
                        if(e.reaction.enable) {
                            let dist = 0;
                            for(let i in e.reaction.animSeq) dist += e.reaction.animSeq[i].distance;
                            dist *= -1;
                            this.mods.library.applyDistance(loc, dist);
                        }
                    }
                });
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_EACH_SKILL_RESULT:", e.message);
        }


        // S_ACTION_STAGE / END location update
        // Make this update position "live" later on
        this.sAction = (e) => {
            let id = e.gameId.toString();
    
            let pos = e.loc;
            pos.w = e.w;
            
            if(e.movement) {
                let distance = 0;
                for(let idx in e.movement){
                    distance += e.movement[idx].distance;
                }
                mods.library.applyDistance(pos, distance);
            }
    
            if(this.mobs[id]) this.mobs[id].pos = pos;
            if(this.players[id]) this.players[id].pos = pos;
            if(this.npcs[id]) this.npcs[id].pos = pos;
            if(this.unknown[id]) this.unknown[id].pos = pos;
        }
        
        // Safely hook action packets
        try {
            const actionStagePacket = this.mods.packet.get_all("S_ACTION_STAGE");
            if (actionStagePacket && actionStagePacket[1] !== null) {
                this.dispatch.hook(...actionStagePacket, DEFAULT_HOOK_SETTINGS, this.sAction);
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_ACTION_STAGE:", e.message);
        }
        
        try {
            const actionEndPacket = this.mods.packet.get_all("S_ACTION_END");
            if (actionEndPacket && actionEndPacket[1] !== null) {
                this.dispatch.hook(...actionEndPacket, DEFAULT_HOOK_SETTINGS, this.sAction);
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_ACTION_END:", e.message);
        }

        // Mob hp got updated
        try {
            const changeHpPacket = this.mods.packet.get_all("S_CREATURE_CHANGE_HP");
            if (changeHpPacket && changeHpPacket[1] !== null) {
                this.dispatch.hook(...changeHpPacket, DEFAULT_HOOK_SETTINGS, e=> {
                    let id = e.target.toString();

                    const data = {
                        curHp: e.curHp,
                        maxHp: e.maxHp,
                    };

                    if(this.mobs[id]) Object.assign(this.mobs[id], data);
                    if(this.players[id]) Object.assign(this.players[id], data);
                    if(this.npcs[id]) Object.assign(this.npcs[id], data);
                    if(this.unknown[id]) Object.assign(this.unknown[id], data);
                });
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_CREATURE_CHANGE_HP:", e.message);
        }

        // Relation got updated
        try {
            const changeRelationPacket = this.mods.packet.get_all("S_CHANGE_RELATION");
            if (changeRelationPacket && changeRelationPacket[1] !== null) {
                this.dispatch.hook(...changeRelationPacket, DEFAULT_HOOK_SETTINGS, e=> {
                    let id = e.target.toString();

                    if(this.mobs[id]) this.mobs[id].relation = e.relation;
                    if(this.players[id]) this.players[id].relation = e.relation;
                    if(this.npcs[id]) this.npcs[id].relation = e.relation;
                    if(this.unknown[id]) this.unknown[id].relation = e.relation;
                });
            }
        } catch(e) {
            console.log("[Entity] Error hooking S_CHANGE_RELATION:", e.message);
        }
    }
}

module.exports = entity;