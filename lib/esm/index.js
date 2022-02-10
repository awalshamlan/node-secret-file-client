// local module imports
import fs from "fs";
import * as errors from "./errors";
import FileCounter from "./item";
// node_module imports
import path from "path";
import { strict as assert } from "assert";
import EventEmitter from "events";
export default class FileClient extends EventEmitter {
    constructor({ dir, limits: { downloadLimit, errorLimit, ageLimit }, }) {
        super();
        // if this looks scary its just fancy deconstructing
        this.items = {};
        assert.equal(ageLimit >= 10000, true, errors.minAgeLimit);
        // must be absolute path
        try {
            FileClient.tempFolder = path.resolve(dir);
        }
        catch (err) {
            console.error("Not a valid path!");
            throw err;
        }
        try {
            fs.mkdir(FileClient.tempFolder, () => {
                console.log(`Temp Folder created at ${FileClient.tempFolder}`);
            });
        }
        catch (err) {
            console.error("Error creating temp folder!");
            throw err;
        }
        this.items = {};
        // check if nested objects freeze
        FileClient.limits = {
            age: ageLimit,
            downloads: downloadLimit,
            errors: errorLimit,
        };
    }
    updateLimits(limits) {
        const { ageLimit, downloadLimit, errorLimit } = limits;
        FileClient.limits = {
            age: ageLimit,
            downloads: downloadLimit,
            errors: errorLimit,
        };
        // check that all existing files are still alive after updating limits
        for (const hash in this.items) {
            if (Object.prototype.hasOwnProperty.call(this.items, hash)) {
                const file = this.items[hash];
                file._lifeCheck();
            }
        }
    }
    addFile(srcPath) {
        return new Promise((resolve, reject) => {
            var newFile = new FileCounter(this, srcPath);
            newFile.on("birth", () => {
                console.log("New file born.");
                console.log(newFile);
                this.items[newFile.fileHash] = newFile;
                resolve(newFile.fileHash);
            });
            newFile.on("death", () => {
                delete this.items[newFile.fileHash];
            });
        });
    }
    getFile(hash) {
        return this.items[hash].getReadStream();
    }
}
