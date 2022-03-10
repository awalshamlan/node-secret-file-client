"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileCounter = exports.generateFileName = void 0;
// local imports
const errors = __importStar(require("./errors"));
const _1 = __importDefault(require("."));
// node-module imports
const assert_1 = require("assert");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const events_1 = __importDefault(require("events"));
const mime_1 = __importDefault(require("mime"));
const path_1 = __importDefault(require("path"));
function getExtension(path) {
    const stringArray = path.split(".");
    if (stringArray.length === 1) {
        return null;
    }
    return stringArray[stringArray.length - 1];
}
function getFileName(path) {
    const stringArray = path.split(path_1.default.sep);
    return stringArray[stringArray.length - 1];
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
function generateFileName(src) {
    return __awaiter(this, void 0, void 0, function* () {
        var fileStream;
        try {
            if (typeof src === "string") {
                fileStream = fs_1.default.createReadStream(src);
            }
            else if (src instanceof fs_1.default.ReadStream) {
                fileStream = src;
            }
            else {
                throw new Error("Not a path or a stream!");
            }
            const fileBuffer = yield streamToBuffer(fileStream);
            const hashSum = crypto_1.default.createHash("sha256");
            hashSum.update(fileBuffer);
            const hex = hashSum.digest("hex");
            return hex;
        }
        catch (err) {
            throw err;
        }
    });
}
exports.generateFileName = generateFileName;
function writeToDisk(src, dstPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            try {
                src instanceof fs_1.default.ReadStream
                    ? src
                    : fs_1.default.createReadStream(src).pipe(fs_1.default.createWriteStream(dstPath).on("finish", () => {
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
function ageToDeath(file) {
    return new Promise((resolve, reject) => {
        file.on("death", (deathCertificate) => {
            reject();
        });
        setTimeout(() => {
            resolve(file._kill("old age"));
        }, _1.default.limits.age);
    });
}
function resolveOnDeath(file) {
    return new Promise((resolve, reject) => {
        file.on("death", (causeOfDeath) => {
            resolve();
        });
    });
}
class FileCounter extends events_1.default {
    constructor(parent, src) {
        super();
        // private variables
        this._filePath = "";
        this._mimeType = null;
        this._originalFileName = "";
        this._ext = null;
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
            if (Date.now() - this.timeOfBirth > _1.default.limits.age) {
                this._kill("Old age");
                return false;
            }
            else if (this._downloadCount >= _1.default.limits.downloads) {
                this._kill("Download limit exceeded");
                return false;
            }
            else if (this._errorCount >= _1.default.limits.errors) {
                this._kill("Error limit exceeded");
                return false;
            }
            return true;
        };
        // incrementors
        this._incDownload = () => {
            this._downloadCount++;
            assert_1.strict.strictEqual(this.dead, false, errors.zombieError("_incDownload", this.fileHash));
            this._lifeCheck();
        };
        this._incError = () => {
            assert_1.strict.strictEqual(this.dead, false, errors.zombieError("_incError (how ironic)", this.fileHash));
            this._errorCount++;
            this._lifeCheck();
        };
        this.getReadStream = () => {
            return new Promise((resolve, reject) => {
                if (this._lifeCheck()) {
                    while (!this._ready) {
                        // are we waiting for the last get? don't wait and give up instead
                        // edgecase: brand new file with downloadLimit of 1
                        if (this._downloadCount == _1.default.limits.downloads - 1) {
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
                        const fileReadStream = fs_1.default.createReadStream(this._filePath);
                        this._incDownload();
                        resolve(fileReadStream);
                    }
                    catch (err) {
                        this._incError();
                        reject(err);
                    }
                    finally {
                        this.emit("free");
                    }
                }
                else {
                    throw errors.exhumationError;
                }
            });
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
            assert_1.strict.deepStrictEqual(parent, FileCounter.parent, errors.adoptionError);
        }
        this._init(src);
    }
    _init(srcPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof srcPath === "string") {
                console.log(srcPath);
                this._ext = getExtension(srcPath);
                this._mimeType = this._ext ? mime_1.default.getType(this._ext) : null;
                this._originalFileName = getFileName(srcPath);
                console.log(this._ext, this._mimeType, this._originalFileName);
            }
            else {
                // @ts-expect-error technically fs.ReadStream.path could be a buffer
                // but our implementation in FileClient guarentees a string here
                this._ext = srcPath.path.split(".")[-1];
                //@ts-expect-error see above
                this._mimeType = mime_1.default.getType(this._ext);
                // @ts-expect-error see above
                this._originalFileName = srcPath.path.split("/")[-1];
            }
            // generate path:
            this.fileHash = yield generateFileName(srcPath);
            this._filePath = `${_1.default.tempFolder}/${this.fileHash}`;
            yield writeToDisk(srcPath, this._filePath);
            // write to disk
            this.timeOfBirth = new Date().getTime();
            this.emit("birth");
            this._ready = true;
            this.on("busy", () => {
                this._ready = false;
            });
            this.on("free", () => {
                this._ready = true;
            });
            ageToDeath(this).catch((err) => {
                // don't do anything here, ageToDeath rejects when the file died in some other way.
                // this implementation is to free the system i/o from resolving a pointless promise.
            });
            resolveOnDeath(this);
            return;
        });
    }
    getLifeStatus() {
        return {
            age: {
                limit: _1.default.limits.age,
                current: Date.now() - this.timeOfBirth,
            },
            downloadCount: {
                limit: _1.default.limits.downloads,
                current: this._downloadCount,
            },
            errorCount: {
                limit: _1.default.limits.errors,
                current: this._errorCount,
            },
        };
    }
    _kill(causeOfDeath) {
        this.dead = true;
        this.timeOfDeath = new Date().getTime();
        const deathCertificate = {
            causeOfDeath,
            timeOfBirth: this.timeOfBirth,
            timeOfDeath: this.timeOfDeath,
            fileName: this.fileHash,
        };
        this.deathCertificate = deathCertificate;
        this.emit("death", deathCertificate);
    }
}
exports.FileCounter = FileCounter;
// static variatbles
FileCounter.parent = false;
