// local module imports
import fs from "fs";
import * as errors from "./errors";
import { FileCounter, graveyard } from "./item";
// node_module imports
import path from "path";
import { strict as assert } from "assert";
import EventEmitter from "events";

// TO-DO: jsdoc

// typing stuff
type ConstructorParameters = {
  dir: string;
  limits: {
    downloadLimit: number;
    errorLimit: number;
    ageLimit: number;
  };
};

export default class FileClient extends EventEmitter {
  // if this looks scary its just fancy deconstructing
  items: { [hash: string]: FileCounter } = {};
  // create a worker thread for promise handling
  static limits: {
    age: number;
    downloads: number;
    errors: number;
  };
  static graveyard = graveyard;
  static tempFolder: string;
  constructor({
    dir,
    limits: { downloadLimit, errorLimit, ageLimit },
  }: ConstructorParameters) {
    super();
    assert.equal(ageLimit >= 10000, true, errors.minAgeLimit);
    // must be absolute path
    try {
      FileClient.tempFolder = path.resolve(dir);
    } catch (err) {
      throw err;
    }
    try {
      fs.mkdir(FileClient.tempFolder, () => {});
    } catch (err) {
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

  updateLimits(limits: {
    ageLimit?: number;
    downloadLimit?: number;
    errorLimit?: number;
  }) {
    const { ageLimit, downloadLimit, errorLimit } = limits;
    FileClient.limits = {
      age: ageLimit ?? FileClient.limits.age,
      downloads: downloadLimit ?? FileClient.limits.downloads,
      errors: errorLimit ?? FileClient.limits.errors,
    };
    // check that all existing files are still alive after updating limits
    for (const hash in this.items) {
      if (Object.prototype.hasOwnProperty.call(this.items, hash)) {
        const file = this.items[hash];
        file._lifeCheck();
      }
    }
  }

  addFile(srcPath: fs.PathLike | fs.ReadStream): Promise<string> {
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

  getFile(hash: string) {
    return this.items[hash].getReadStream();
  }
}
