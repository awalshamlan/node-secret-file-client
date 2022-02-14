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
            throw err;
        }
        try {
            fs.mkdir(FileClient.tempFolder, () => {
            });
        }
        catch (err) {
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
            age: ageLimit !== null && ageLimit !== void 0 ? ageLimit : FileClient.limits.age,
            downloads: downloadLimit !== null && downloadLimit !== void 0 ? downloadLimit : FileClient.limits.downloads,
            errors: errorLimit !== null && errorLimit !== void 0 ? errorLimit : FileClient.limits.errors,
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
