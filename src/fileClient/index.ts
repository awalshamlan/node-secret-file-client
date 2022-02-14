// local module imports
import fs from "fs";
import * as errors from "./errors";
import FileCounter from "./item";

// node_module imports
import path from "path";
import { strict as assert } from "assert";
import EventEmitter from "events";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

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
      console.error("Not a valid path!");
      throw err;
    }
    try {
      fs.mkdir(FileClient.tempFolder, () => {
        console.log(`Temp Folder created at ${FileClient.tempFolder}`);
      });
    } catch (err) {
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

  addFile(srcPath: fs.PathLike): Promise<string> {
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
  getFile(hash: string) {
    return this.items[hash].getReadStream();
  }
}
