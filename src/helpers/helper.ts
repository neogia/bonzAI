import {ALLIES, ROOMTYPE_ALLEY, ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, ROOMTYPE_CONTROLLER} from "../config/constants";
import {PowerFlagScan, Coord} from "../interfaces";
export var helper = {
    getStoredAmount(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType];
        }
        else if (target.hasOwnProperty("store")) {
            return target.store[resourceType];
        }
        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy;
        }
    },

    getCapacity(target: any) {
        if (target instanceof Creep) {
            return target.carryCapacity;
        }
        else if (target.hasOwnProperty("store")) {
            return target.storeCapacity;
        }
        else if (target.hasOwnProperty("energyCapacity")) {
            return target.energyCapacity;
        }
    },

    isFull(target: any, resourceType: string) {
        if (target instanceof Creep) {
            return target.carry[resourceType] === target.carryCapacity;
        }
        else if (target.hasOwnProperty("store")) {
            return target.store[resourceType] === target.storeCapacity;
        }
        else if (resourceType === RESOURCE_ENERGY && target.hasOwnProperty("energy")) {
            return target.energy === target.energyCapacity;
        }
    },

    clampDirection(direction: number): number {
        while (direction < 1) direction += 8;
        while (direction > 8) direction -= 8;
        return direction;
    },

    deserializeRoomPosition(roomPosition: RoomPosition): RoomPosition {
        return new RoomPosition(roomPosition.x, roomPosition.y, roomPosition.roomName);
    },

    checkEnemy(username: string, roomName: string) {
        if ( ALLIES[username] ) {
            return false;
        }

        // make note of non-ally, non-npc creeps
        if (username !== "Invader" && username !== "Source Keeper") {
            this.strangerDanger(username, roomName);
        }
        return true;
    },

    strangerDanger(username: string, roomName: string) {
        if (!Memory.strangerDanger) { Memory.strangerDanger = {}; }
        if (!Memory.strangerDanger[username]) { Memory.strangerDanger[username] = []; }
        let lastReport = _.last(Memory.strangerDanger[username]) as StrangerReport;
        if (!lastReport || lastReport.tickSeen < Game.time - 2000 ) {
            let report = { tickSeen: Game.time, roomName: roomName };
            console.log("STRANGER DANGER: one of", username, "\'s creeps seen in", roomName);
            Memory.strangerDanger[username].push(report);
            while (Memory.strangerDanger[username].length > 10) Memory.strangerDanger[username].shift();
        }
    },

    findCore(roomName: string) {

        let coreName = "";
        let digit;

        for (let i of roomName) {
            let parse = parseInt(i);
            if (isNaN(parse)) {
                if (digit !== undefined) {
                    coreName += Math.floor(digit / 10) * 10 + 5;
                    digit = undefined;
                }
                coreName += i;
            }
            else {
                if (digit === undefined) {
                    digit = 0;
                }
                else {
                    digit *= 10;
                }
                digit += parse;
            }
        }

        coreName += Math.floor(digit / 10) * 10 + 5;

        return coreName;
    },

    /**
     * Return room coordinates for a given Room, authored by tedivm
     * @param roomName
     * @returns {{x: (string|any), y: (string|any), x_dir: (string|any), y_dir: (string|any)}}
     */

    getRoomCoordinates(roomName: string): RoomCoord {

        let coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
        let match = coordinateRegex.exec(roomName);
        if (!match) return;

        let xDir = match[1];
        let x = match[2];
        let yDir = match[3];
        let y = match[4];

        return {
            x: Number(x),
            y: Number(y),
            xDir: xDir,
            yDir: yDir,
        };
    },

    findSightedPath(start: RoomPosition, goal: RoomPosition, goalRange: number, observer: StructureObserver, cache: PowerFlagScan) {

        if (Game.cpu.bucket < 8000) {
            console.log("PATH: waiting for full bucket");
            return;
        }

        let invalid = false;
        let ret = PathFinder.search(start, [{pos: goal, range: goalRange}], {
            maxOps: 10000,
            maxRooms: 16,
            roomCallback: (roomName: string) => {
                if (invalid) {
                    return false;
                }

                if (cache.matrices[roomName]) {
                    return cache.matrices[roomName];
                }

                if (_.includes(cache.avoidRooms, roomName)) {
                    return false;
                }

                let room = Game.rooms[roomName];
                if (!room) {
                    console.log("PATH: can't see", roomName + ", aiming observer at it");
                    observer.observeRoom(roomName);
                    invalid = true;
                    return false;
                }

                if (room.controller && room.controller.level > 0) {
                    if (room.controller.my) {
                        return;
                    }
                    else {
                        cache.avoidRooms.push(roomName);
                        return false;
                    }
                }

                let costs = new PathFinder.CostMatrix();
                room.find(FIND_STRUCTURES).forEach((s: Structure) => {
                    if (s.structureType !== STRUCTURE_ROAD) costs.set(s.pos.x, s.pos.y, 0xff);
                });

                cache.matrices[roomName] = costs;
                return costs;
            }
        });

        if (!invalid) {
            console.log("PATH: successfully found sighted path");
            return ret;
        }
    },

    negaDirection(dir: string): string {
        switch (dir) {
            case "W":
                return "E";
            case "E":
                return "W";
            case "N":
                return "S";
            case "S":
                return "N";
        }
    },

    blockOffPosition(costs: CostMatrix, roomObject: RoomObject, range: number, cost = 30) {
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                if (Game.map.getTerrainAt(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, roomObject.room.name) === "wall") continue;
                costs.set(roomObject.pos.x + xDelta, roomObject.pos.y + yDelta, cost);
            }
        }
    },

    addStructuresToMatrix(matrix: CostMatrix, room: Room, roadCost = 1): CostMatrix {
        room.find(FIND_STRUCTURES).forEach(function(structure: Structure) {
            if (structure instanceof StructureRampart) {
                if (!structure.my) {
                    matrix.set(structure.pos.x, structure.pos.y, 0xff);
                }
            } else if (structure instanceof StructureRoad) {
                // Favor roads over plain tiles
                matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure.structureType !== STRUCTURE_CONTAINER) {
                // Can't walk through non-walkable buildings
                matrix.set(structure.pos.x, structure.pos.y, 0xff);
            }
        });
        return matrix;
    },

    addCreepsToMatrix(matrix: CostMatrix, room: Room, addFriendly = true, addHostile = true): CostMatrix {
        room.find<Creep>(FIND_CREEPS).forEach((creep: Creep) => {
            if (!creep.owner) {
                if (addHostile) {
                    matrix.set(creep.pos.x, creep.pos.y, 0xff);
                }
            }
            else if (ALLIES[creep.owner.username]) {
                if (addFriendly) {
                    matrix.set(creep.pos.x, creep.pos.y, 0xff);
                }
            }
            else {
                if (addHostile) {
                    matrix.set(creep.pos.x, creep.pos.y, 0xff);
                }
            }
        });
        return matrix;
    },

    addTerrainToMatrix(matrix: CostMatrix, roomName: string): CostMatrix {
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                let terrain = Game.map.getTerrainAt(x, y, roomName);
                if (terrain === "wall") {
                    matrix.set(x, y, 0xff);
                }
                else if (terrain === "swamp") {
                    matrix.set(x, y, 5);
                }
                else {
                    matrix.set(x, y, 1);
                }
            }
        }
        return;
    },

    findRelativeRoomName(roomName: string, xDelta: number, yDelta: number): string {
        let coords = this.getRoomCoordinates(roomName);
        let xDir = coords.xDir;
        let yDir = coords.yDir;
        let x = coords.x + xDelta;
        let y = coords.y + yDelta;
        if (x < 0) {
            x = Math.abs(x) - 1;
            xDir = this.negaDirection(xDir);
        }
        if (y < 0) {
            y = Math.abs(y) - 1;
            yDir = this.negaDirection(yDir);
        }

        return xDir + x + yDir + y;
    },

    findRoomCoordDeltas(origin: string, otherRoom: string): Coord {
        let originCoords = this.getRoomCoordinates(origin);
        let otherCoords = this.getRoomCoordinates(otherRoom);
        let xDelta = otherCoords.x - originCoords.x;
        if (originCoords.xDir === otherCoords.xDir) {
            if (originCoords.xDir === "W") {
                xDelta = -xDelta;
            }
        }
        else {
            xDelta = otherCoords.x + originCoords.x + 1;
            if (originCoords.xDir === "E") {
                xDelta = -xDelta;
            }
        }
        let yDelta = otherCoords.y - originCoords.y;
        if (originCoords.yDir === otherCoords.yDir) {
            if (originCoords.yDir === "S") {
                yDelta = -yDelta;
            }
        }
        else {
            yDelta = otherCoords.y + originCoords.y + 1;
            if (originCoords.yDir === "N") {
                yDelta = -yDelta
            }
        }
        return {x: xDelta, y: yDelta};
    },

    findRelativeRoomDir(origin: string, otherRoom: string): number {
        let coordDeltas = this.findRoomCoordDeltas(origin, otherRoom);
        if (Math.abs(coordDeltas.x) === Math.abs(coordDeltas.y)) {
            if (coordDeltas.x > 0) {
                if (coordDeltas.y > 0) {
                    return 2;
                }
                else {
                    return 4;
                }
            }
            else if (coordDeltas.x < 0) {
                if (coordDeltas.y > 0) {
                    return 8;
                }
                else {
                    return 6;
                }
            }
            else {
                // must be the same room, no direction
                return 0;
            }
        }
        else {
            if (Math.abs(coordDeltas.x) > Math.abs(coordDeltas.y)) {
                if (coordDeltas.x > 0) {
                    return 3;
                }
                else {
                    return 7;
                }
            }
            else {
                if (coordDeltas.y > 0) {
                    return 1;
                }
                else {
                    return 5;
                }
            }
        }
    },

    blockOffExits(matrix: CostMatrix, cost = 0xff, roomName?: string): CostMatrix {
        for (let x = 0; x < 50; x += 49) {
            for (let y = 0; y < 50; y++) {
                if (roomName) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                }
                else { matrix.set(x, y, 0xff); }
            }
        }
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y += 49) {
                if (roomName) {
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") { matrix.set(x, y, cost); }
                }
                else { matrix.set(x, y, 0xff); }
            }
        }
        return matrix;
    },

    showMatrix(matrix: CostMatrix) {
        // showMatrix
        for (let y = 0; y < 50; y++) {
            let line = "";
            for (let x = 0; x < 50; x++) {
                let value = matrix.get(x, y);
                if (value === 0xff) line += "f";
                else line += value % 10;
            }
            console.log(line);
        }
    },

    coordToPosition(coord: Coord, centerPosition: RoomPosition, rotation = 0) {
        if (!(centerPosition instanceof RoomPosition)) {
            centerPosition = this.deserializeRoomPosition(centerPosition);
        }
        let xCoord = coord.x;
        let yCoord = coord.y;
        if (rotation === 1) {
            xCoord = -coord.y;
            yCoord = coord.x;
        }
        else if (rotation === 2) {
            xCoord = -coord.x;
            yCoord = -coord.y;
        }
        else if (rotation === 3) {
            xCoord = coord.y;
            yCoord = -coord.x;
        }
        return new RoomPosition(centerPosition.x + xCoord, centerPosition.y + yCoord, centerPosition.roomName);
    },

    positionToCoord(pos: {x: number, y: number}, centerPoint: {x: number, y: number}, rotation = 0): Coord {
        let xCoord = pos.x - centerPoint.x;
        let yCoord = pos.y - centerPoint.y;
        if (rotation === 0) {
            return {x: xCoord, y: yCoord };
        }
        else if (rotation === 1) {
            return {x: yCoord, y: -xCoord };
        }
        else if (rotation === 2) {
            return {x: -xCoord, y: -yCoord };
        }
        else if (rotation === 3) {
            return {x: -yCoord, y: xCoord};
        }
    },

    serializePath(startPos: RoomPosition, path: RoomPosition[]): string {
        let serializedPath = "";
        let lastPosition = startPos;
        for (let position of path) {
            if (position.roomName === lastPosition.roomName) {
                serializedPath += lastPosition.getDirectionTo(position);
            }
            lastPosition = position;
        }
        return serializedPath;
    },

    pathablePosition(roomName: string): RoomPosition {
        for (let radius = 0; radius < 20; radius++) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    if (Math.abs(yDelta) !== radius && Math.abs(xDelta) !== radius) {
                        continue;
                    }
                    let x = 25 + xDelta;
                    let y = 25 + yDelta;
                    let terrain = Game.map.getTerrainAt(x, y, roomName);
                    if (terrain !== "wall") {
                        return new RoomPosition(x, y, roomName);
                    }
                }
            }
        }
    },

    roomTypeFromName(roomName: string): number {
        let coords = this.getRoomCoordinates(roomName);
        if (coords.x % 10 === 0 || coords.y % 10 === 0) {
            return ROOMTYPE_ALLEY;
        }
        else if (coords.x % 5 === 0 && coords.y % 5 === 0) {
            return ROOMTYPE_CORE;
        }
        else if (coords.x % 10 === 6 || coords.x % 10 === 4 || coords.y % 10 === 6 || coords.y % 10 === 4) {
            return ROOMTYPE_SOURCEKEEPER;
        }
        else {
            return ROOMTYPE_CONTROLLER;
        }
    },

    debugPath(path: RoomPosition[], identifier = "") {
        let count = 0;
        for (let position of path) {
            let room = Game.rooms[position.roomName];
            if (room) {
                let name = "debugPath" + identifier + count;
                count++;
                let flag = Game.flags[name];
                if (flag) {
                    flag.setPosition(position);
                }
                else {
                    position.createFlag(name, COLOR_ORANGE);
                }
            }
        }

        for (let i = count; i < 1000; i++) {
            let name = "debugPath" + identifier + count;
            let flag = Game.flags[name];
            if (flag) {
                flag.remove();
            }
            else {
                break;
            }
        }

        return `placed ${count} out of ${path.length} flags`;
    },

    towerDamageAtRange(range: number): number {
        if (range <= 5) { return 600; }
        if (range >= 20) { return 150; }
        return 3000 / range;
    }
};