var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// local imports
import * as errors from "./errors";
import FileClient from ".";
// node-module imports
import { strict as assert } from "assert";
import crypto from "crypto";
import fs from "fs";
import EventEmitter from "events";
function waitForDeath(referencedFile) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(() => referencedFile._kill("old age"), FileClient.limits.age);
        return new Promise((resolve, reject) => {
            referencedFile.on("death", (causeOfDeath) => {
                resolve({
                    causeOfDeath,
                    timeOfBirth: referencedFile.timeOfBirth,
                    timeOfDeath: referencedFile.timeOfDeath,
                    fileName: referencedFile.fileHash,
                });
            });
        });
    });
}
function streamToBuffer(fileStream) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            try {
                var _fileBuffer = Array();
                fileStream.on("data", (chunk) => _fileBuffer.push(chunk));
                fileStream.on("end", () => resolve(Buffer.concat(_fileBuffer)));
            }
            catch (err) {
                reject("Error converting stream into a buffer!");
            }
        });
    });
}
export function generateFileName(srcPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const fileStream = fs.createReadStream(srcPath);
            const fileBuffer = yield streamToBuffer(fileStream);
            const hashSum = crypto.createHash("sha256");
            hashSum.update(fileBuffer);
            const hex = hashSum.digest("hex");
            return hex;
        }
        catch (err) {
            throw err;
        }
    });
}
function writeToDisk(srcPath, dstPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            try {
                fs.createReadStream(srcPath).pipe(fs.createWriteStream(dstPath).on("finish", () => {
                    resolve(true);
                }));
            }
            catch (err) {
                reject("Error writing file to disk!");
                throw err;
            }
        });
    });
}
export default class FileCounter extends EventEmitter {
    constructor(parent, srcPath) {
        super();
        // private variables
        this._filePath = "";
        this._ready = false;
        this._stalenessCount = 0;
        this._downloadCount = 0;
        this._errorCount = 0;
        // public variables
        this.fileHash = "";
        this.dead = false;
        this.timeOfBirth = 0;
        this.timeOfDeath = 0;
        this._lifeCheck = () => {
            if (this.dead) {
                return false;
            }
            // if it should already be dead but isn't; kill it. (debug it later tho)
            if (Date.now() - this.timeOfBirth > FileClient.limits.age) {
                this._kill("Old age");
                return false;
            }
            else if (this._downloadCount >= FileClient.limits.downloads) {
                this._kill("Download limit exceeded");
                return false;
            }
            else if (this._errorCount >= FileClient.limits.errors) {
                this._kill("Error limit exceeded");
                return false;
            }
            return true;
        };
        // incrementors
        this._incDownload = () => {
            this._downloadCount++;
            assert.strictEqual(this.dead, false, errors.zombieError("_incDownload", this.fileHash));
            this._lifeCheck();
        };
        this._incError = () => {
            assert.strictEqual(this.dead, false, errors.zombieError("_incError (how ironic)", this.fileHash));
            this._errorCount++;
            this._lifeCheck();
        };
        this.getReadStream = () => {
            if (this._lifeCheck()) {
                while (!this._ready) {
                    // are we waiting for the last get? don't wait and give up instead
                    // edgecase: brand new file with downloadLimit of 1
                    if (this._downloadCount == FileClient.limits.downloads - 1) {
                        throw new Error("Attempted to get ReadStream but the last allowed download is already in progress!");
                    }
                    setTimeout(() => {
                        if (!this._lifeCheck()) {
                            throw new Error("File died while waiting for it to be available!");
                        }
                    }, 100); // check if the file is still alive / if it is still busy every 100 ms
                }
                this.emit("busy");
                try {
                    const fileReadStream = fs.createReadStream(this._filePath);
                    this._incDownload();
                    return fileReadStream;
                }
                catch (err) {
                    this._incError();
                    throw err;
                }
            }
            else {
                throw errors.exhumationError;
            }
        };
        // make sure parent conditions hold
        if (!parent) {
            throw errors.orphanError;
        }
        else if (!FileCounter.parent) {
            // its the first born :')
            FileCounter.parent = parent;
        }
        else {
            // throw an error if the parents aren't the same
            // (this probably means a second FileClient was created)
            assert.deepStrictEqual(parent, FileCounter.parent, errors.adoptionError);
        }
        this._init(srcPath);
    }
    _init(srcPath) {
        return __awaiter(this, void 0, void 0, function* () {
            // generate path:
            this.fileHash = yield generateFileName(srcPath);
            this._filePath = `${FileClient.tempFolder}/${this.fileHash}`;
            yield writeToDisk(srcPath, this._filePath);
            // write to disk
            this.timeOfBirth = new Date().getTime();
            this.emit("birth");
            this._ready = true;
            this.on("busy", () => {
                this._ready = false;
            });
            this.deathCertificate = PromiseQueue.enqueue(this, waitForDeath);
            return;
        });
    }
    getLifeStatus() {
        return {
            age: {
                limit: FileClient.limits.age,
                current: Date.now() - this.timeOfBirth,
            },
            downloadCount: {
                limit: FileClient.limits.downloads,
                current: this._downloadCount,
            },
            errorCount: {
                limit: FileClient.limits.errors,
                current: this._errorCount,
            },
        };
    }
    _kill(causeOfDeath) {
        this.dead = true;
        this.timeOfDeath = new Date().getTime();
        this.emit("death", causeOfDeath);
    }
}
// static variatbles
FileCounter.parent = false;
class PromiseQueue {
    static enqueue(file, promise) {
        return new Promise((resolve, reject) => {
            this.queue.push({ promise, resolve, reject, file });
            this.dequeue();
        });
    }
    static dequeue() {
        if (this.pendingPormise) {
            return false;
        }
        const item = this.queue.shift();
        if (!item) {
            return false;
        }
        try {
            this.pendingPormise = true;
            item
                .promise(item.file)
                .then((value) => {
                this.pendingPormise = false;
                item.resolve(value);
                this.resolved.push(value);
                this.dequeue();
            })
                .catch((err) => {
                this.pendingPormise = false;
                item.reject(err);
                this.dequeue();
            });
        }
        catch (err) {
            this.pendingPormise = false;
            item.reject(err !== null && err !== void 0 ? err : "Error");
            this.dequeue();
        }
        return true;
    }
}
PromiseQueue.resolved = [];
PromiseQueue.queue = [];
PromiseQueue.pendingPormise = false;
