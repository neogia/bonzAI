import {MINERALS_RAW, PRODUCT_LIST} from "../config/constants";
import {Empire} from "../ai/Empire";
import {Operation} from "../ai/operations/Operation";
import {helper} from "./helper";

declare var emp: Empire;

export var consoleCommands = {

    /**
     * Remove construction sites from a room
     * @param roomName
     * @param leaveProgressStarted - leave sites already started
     * @param structureType
     */

    removeConstructionSites(roomName: string, leaveProgressStarted = true, structureType?: string) {
        Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES).forEach( (site: ConstructionSite) => {
            if ((!structureType || site.structureType === structureType) &&(!leaveProgressStarted || site.progress === 0)) {
                site.remove();
            }
        })
    },
    // shorthand
    rc(roomName: string, leaveProgressStarted: boolean, structureType: string) {
        this.removeConstructionSites(roomName, leaveProgressStarted, structureType);
    },

    /**
     * Remove all flags that contain a substring in the name, good for wiping out a previously used operation
     * @param substr
     */

    removeFlags(substr: string) {
      _.forEach(Game.flags, (flag) => {
          if (_.includes(flag.name, substr) ) {
              console.log(`removing flag ${flag.name} in ${flag.pos.roomName}`);
              flag.remove();
          }
      });
    },
    // shorthand
    rf(substr: string) {
        this.removeFlags(substr);
    },

    /**
     * Displays all total raw minerals in every storage/terminal
     */

    minv() {
        for (let mineralType of MINERALS_RAW) {
            console.log(mineralType + ":", emp.inventory[mineralType]);
        }

    },

    /**
     * Displays all final compounds in every storage/terminal
     */

    pinv() {
        for (let mineralType of PRODUCT_LIST) {
            console.log(mineralType + ":", emp.inventory[mineralType]);
        }
    },

    testCode() {
        // test code
    },

    /**
     * remove most memory while leaving more important stuff intact, strongly not recommended unless you know what you are
     * doing
     */

    wipeMemory() {
        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (flag) {
                for (let propertyName of Object.keys(flag.memory)) {
                    if (propertyName === "swapMining") continue;
                    if (propertyName === "powerMining") continue;
                    if (propertyName === "power") continue;
                    if (propertyName === "spawnRoom") continue;
                    if (propertyName === "distance") continue;
                    if (propertyName === "centerPosition") continue;
                    if (propertyName === "rotation") continue;
                    if (propertyName === "radius") continue;
                    if (propertyName === "layoutMap") continue;
                    delete flag.memory[propertyName];
                }
            }
            else {
                delete Memory.flags[flagName];
            }
        }

        for (let creepName in Memory.creeps) {
            let creep = Game.creeps[creepName];
            if (!creep) {
                delete Memory.creeps[creepName];
            }
        }
    },

    /**
     * remove old properties in memory that are no longer being used by the AI
     */

    removeUnusedProperties() {
        delete Memory.empire["allyForts"];
        delete Memory.empire["allySwaps"];

        for (let flagName in Memory.flags) {
            let flag = Game.flags[flagName];
            if (flag) {
                let mem = Memory.flags[flagName];
                delete mem.network;
                // delete mem.survey;
            }
            else {
                delete Memory.flags[flagName];
            }
        }

        for (let creepName in Memory.creeps) {
            let creep = Game.creeps[creepName];
            if (!creep) {
                delete Memory.creeps[creepName];
            }
        }
    },

    removeMissionData(missionName: string) {
        for (let flagName in Memory.flags) {
            delete Memory.flags[flagName][missionName];
        }
    },

    /**
     * find which rooms contain a resource type in terminal
     * @param resourceType
     */

    findResource(resourceType: string) {
        for (let terminal of emp.terminals) {
            if (terminal.store[resourceType]) {
                console.log(terminal.room.name, terminal.store[resourceType]);
            }
        }
    },


    /**
     * Empty resources from a terminal, will only try to send one resource each tick so this must be called repeatedly
     * on multiple ticks with the same arguments to completely empty a terminal
     * @param origin
     * @param destination
     * @returns {any}
     */

    emptyTerminal(origin: string, destination: string) {
        let originTerminal = Game.rooms[origin].terminal;
        let outcome;
        for (let resourceType in originTerminal.store) {
            if (!originTerminal.store.hasOwnProperty(resourceType)) continue;
            let amount = originTerminal.store[resourceType];
            if (amount >= 100) {
                if (resourceType !== RESOURCE_ENERGY) {
                    outcome = originTerminal.send(resourceType, amount, destination);
                    break;
                }
                else if (Object.keys(originTerminal.store).length === 1 ) {
                    let distance = Game.map.getRoomLinearDistance(origin, destination, true);
                    let stored = originTerminal.store.energy;
                    let amountSendable = Math.floor(stored / (1 + 0.1 * distance));
                    console.log("sending", amountSendable, "out of", stored);
                    outcome = originTerminal.send(RESOURCE_ENERGY, amountSendable, destination);
                }
            }

        }
        return outcome;
    },

    /**
     * Changes the name of an operation, giving it a new flag. May result in some unintended consequences
     * @param opName
     * @param newOpName
     * @returns {any}
     */

    changeOpName(opName: string, newOpName: string) {
        let operation = Game.operations[opName] as Operation;
        if (!operation) return "you don't have an operation by that name";

        let newFlagName = operation.type + "_" + newOpName;
        let outcome = operation.flag.pos.createFlag(newFlagName, operation.flag.color, operation.flag.secondaryColor);
        if (_.isString(outcome)) {
            Memory.flags[newFlagName] = operation.memory;
            operation.flag.remove();
            return `success, changed ${opName} to ${newOpName} (removing old flag)`;
        }
        else {
            return "error changing name: " + outcome;
        }
    },

    /**
     * Place an order for a resource to be sent to any room. Good for making one-time deals.
     * @param resourceType
     * @param amount
     * @param roomName
     * @param efficiency - the number of terminals that should send the resource per tick, use a lower number to only send
     * from the nearest terminals
     * @returns {any}
     */

    order(resourceType: string, amount: number, roomName: string, efficiency = 10 ) {
        if (!(amount > 0)) {
            return "usage: order(resourceType, amount, roomName, efficiency?)";
        }

        if (Game.map.getRoomLinearDistance("E0S0", roomName) < 0) {
            return "usage: order(resourceType, amount, roomName, efficiency?)";
        }

        if (efficiency <= 0) {
            return "efficiency must be >= 1";
        }

        Memory.resourceOrder[Game.time] = { resourceType: resourceType, amount: amount, roomName: roomName,
            efficiency: efficiency, amountSent: 0};
        return "TRADE: scheduling " + amount + " " + resourceType + " to be sent to " + roomName;
    },

    /**
     * One-time send resource from all terminals to a specific room. For more control use cc.order()
     * @param resourceType
     * @param amount
     * @param roomName
     */

    sendFromAll(resourceType: string, amount: number, roomName: string) {
        _.forEach(Game.rooms, (room: Room) => {
            if (room.controller && room.controller.level > 6 && room.terminal && room.terminal.my) {
                let outcome = room.terminal.send(resourceType, amount, roomName)
                console.log(room.name, " sent ",amount," to ",roomName);
            }
        })
    },

    patchTraderMemory() {
        for (let username in Memory.traders) {
            let data = Memory.traders[username] as any;
            if (data.recieved) {
                for (let resourceType in data.recieved) {
                    let amount = data.recieved[resourceType];
                    if (data[resourceType] === undefined) data[resourceType] = 0;
                    data[resourceType] += amount;
                }
            }
            if (data.sent) {
                for (let resourceType in data.sent) {
                    let amount = data.sent[resourceType];
                    if (data[resourceType] === undefined) data[resourceType] = 0;
                    data[resourceType] -= amount;
                }
            }
            delete data.recieved;
            delete data.sent;
        }
    },

    /**
     * If this looks silly it is because it is, I used to it go from one naming convention to another
     * @param opName
     * @returns {any}
     */

    roomConvention(opName: string, alternate?: string): string {
        let controllerOp = Game.operations[opName + 0];
        if (!controllerOp) {
            return "owned room doesn't exist";
        }

        for (let direction = 1; direction <= 8; direction++) {
            let tempName = opName + "temp" + direction;
            if (!Game.operations[tempName]) continue;
            console.log(`found temp ${tempName}`);
            let desiredName = opName + direction;
            let currentOp = Game.operations[desiredName];
            if (currentOp) {
                console.log(`current op with that name, changing name to temp`);
                let tempDir = helper.findRelativeRoomDir(controllerOp.flag.room.name, currentOp.flag.room.name);
                return this.changeOpName(desiredName, opName + "temp" + tempDir);
            }
            console.log(`no temp conflicts`);
            return this.changeOpName(tempName, desiredName);
        }

        for (let direction = 1; direction <= 9; direction++) {
            let testOpName = opName + direction;
            let testOp = Game.operations[testOpName];
            if (!testOp && alternate) {
                testOp = Game.operations[alternate + direction];
                if (testOp) {
                    testOpName = alternate + direction;
                }
            }
            if (!testOp) { continue; }
            let correctDir = helper.findRelativeRoomDir(controllerOp.flag.room.name, testOp.flag.room.name);
            if (correctDir === direction) { continue; }
            let correctOpName = opName + correctDir;
            console.log(`inconsistent name (${testOpName} at dir ${correctDir} should be ${correctOpName})`);
            let currentOp = Game.operations[correctOpName];
            if (currentOp) {
                console.log(`current op with that name, changing name to temp`);
                let tempDir = helper.findRelativeRoomDir(controllerOp.flag.room.name, currentOp.flag.room.name);
                return this.changeOpName(correctOpName, opName + "temp" + tempDir);
            }
            else {
                console.log(`no current op with that name`);
                return this.changeOpName(testOpName, correctOpName);
            }
        }

        return `all flags consistent`;
    }
};