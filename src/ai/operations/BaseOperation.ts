import {Operation} from "./Operation";
import {Empire} from "../Empire";
import {OperationPriority} from "../../config/constants";
import {HarvestMission} from "../missions/HarvestMission";

export class BaseOperation extends Operation {

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    initOperation() {
        this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
        this.addMission(new HarvestMission(this));
    }

    finalizeOperation() {
    }


    invalidateOperationCache() {
    }
}