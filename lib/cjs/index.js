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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// local module imports
const fs_1 = __importDefault(require("fs"));
const errors = __importStar(require("./errors"));
const item_1 = require("./item");
// node_module imports
const path_1 = __importDefault(require("path"));
const assert_1 = require("assert");
const events_1 = __importDefault(require("events"));
class FileClient extends events_1.default {
    constructor({ dir, limits: { downloadLimit, errorLimit, ageLimit }, }) {
        super();
        // if this looks scary its just fancy deconstructing
        this.items = {};
        assert_1.strict.equal(ageLimit >= 10000, true, errors.minAgeLimit);
        // must be absolute path
        try {
            FileClient.tempFolder = path_1.default.resolve(dir);
        }
        catch (err) {
            throw err;
        }
        try {
            fs_1.default.mkdir(FileClient.tempFolder, () => { });
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
            var newFile = new item_1.FileCounter(this, srcPath);
            newFile.on("birth", () => {
                this.items[newFile.fileHash] = newFile;
                resolve(newFile.fileHash);
            });
            newFile.on("death", (deathCertificate) => {
                FileClient.graveyard.push(deathCertificate);
                delete this.items[newFile.fileHash];
            });
        });
    }
    getFile(hash) {
        return this.items[hash].getReadStream();
    }
}
exports.default = FileClient;
FileClient.graveyard = [];
