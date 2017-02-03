import {Operation} from "../operations/Operation";
import {Mission} from "./Mission";

export class HarvestMission extends Mission {

    // define your role-array
    harvesters: Creep[];

    constructor(operation: Operation) {
        super(operation, "harvest");
    }

    initMission() {
    }

    roleCall() {
        // find and spawn creeps for your role
        this.harvesters = this.headCount("harvester", () => this.workerBody(1, 1, 1), 1);
    }

    missionActions() {
        for (let harvester of this.harvesters) {this.harvesterActions(harvester) }
    }

    private harvesterActions(harvester: Creep) {
        let source = this.room.find<Source>(FIND_SOURCES)[0];
        if (harvester.pos.isNearTo(source)) {
            harvester.harvest(source);
        } else {
            harvester.blindMoveTo(source);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}