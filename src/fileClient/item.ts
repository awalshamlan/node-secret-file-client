// local imports
import * as errors from "./errors";
import FileClient from ".";

// node-module imports
import { strict as assert } from "assert";
import crypto from "crypto";
import fs from "fs";
import EventEmitter from "events";

// types

export type DeathCertificate = {
  causeOfDeath: string;
  timeOfDeath: number;
  timeOfBirth: number;
  fileName: string;
};

async function waitForDeath(
  referencedFile: FileCounter
): Promise<DeathCertificate> {
  setTimeout(() => referencedFile._kill("old age"), FileClient.limits.age);
  return new Promise<DeathCertificate>((resolve, reject) => {
    referencedFile.on("death", (causeOfDeath) => {
      resolve({
        causeOfDeath,
        timeOfBirth: referencedFile.timeOfBirth,
        timeOfDeath: referencedFile.timeOfDeath,
        fileName: referencedFile.fileHash,
      });
    });
  });
}

async function streamToBuffer(fileStream: fs.ReadStream) {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      var _fileBuffer = Array<any>();
      fileStream.on("data", (chunk) => _fileBuffer.push(chunk));
      fileStream.on("end", () => resolve(Buffer.concat(_fileBuffer)));
    } catch (err) {
      reject("Error converting stream into a buffer!");
    }
  });
}

export async function generateFileName(srcPath: fs.PathLike) {
  try {
    const fileStream = fs.createReadStream(srcPath);
    const fileBuffer = await streamToBuffer(fileStream);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    const hex = hashSum.digest("hex");
    return hex;
  } catch (err) {
    console.error("Error getting hash of File Buffer!");
    throw err;
  }
}

async function writeToDisk(srcPath: fs.PathLike, dstPath: fs.PathLike) {
  console.log(`Writing to disk at ${dstPath} from ${srcPath}`);
  return new Promise((resolve, reject) => {
    try {
      fs.createReadStream(srcPath).pipe(
        fs.createWriteStream(dstPath).on("finish", () => {
          console.log("Write complete");
          resolve(true);
        })
      );
    } catch (err) {
      reject("Error writing file to disk!");
      throw err;
    }
  });
}

export default class FileCounter extends EventEmitter {
  // static variatbles
  static parent: FileClient | false = false;
  // private variables
  _filePath: string = "";
  _ready: boolean = false;
  _stalenessCount: number = 0;
  _downloadCount: number = 0;
  _errorCount: number = 0;
  // public variables
  fileHash: string = "";
  dead: boolean = false;
  timeOfBirth: number = 0;
  timeOfDeath: number = 0;
  constructor(parent: FileClient, srcPath: fs.PathLike) {
    super();
    console.log("Constructor");
    // make sure parent conditions hold
    if (!parent) {
      throw errors.orphanError;
    } else if (!FileCounter.parent) {
      // its the first born :')
      FileCounter.parent = parent;
    } else {
      // throw an error if the parents aren't the same
      // (this probably means a second FileClient was created)
      assert.deepStrictEqual(parent, FileCounter.parent, errors.adoptionError);
    }
    this._init(srcPath);
  }

  async _init(srcPath: fs.PathLike) {
    console.log("_init");
    // generate path:
    this.fileHash = await generateFileName(srcPath);
    this._filePath = `${FileClient.tempFolder}/${this.fileHash}`;
    await writeToDisk(srcPath, this._filePath);
    // write to disk
    this.timeOfBirth = new Date().getTime();
    this.emit("birth");
    this._ready = true;
    this.on("busy", () => {
      this._ready = false;
    });
    PromiseQueue.enqueue(this, waitForDeath);
    return;
  }

  getLifeStatus(): {
    age: { limit: number; current: number };
    downloadCount: { limit: number; current: number };
    errorCount: { limit: number; current: number };
  } {
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

  _kill(causeOfDeath: string) {
    console.log(`reached kill function with cause of death: ${causeOfDeath}`);
    this.dead = true;
    this.timeOfDeath = new Date().getTime();
    this.emit("death", causeOfDeath);
  }

  _lifeCheck = (): boolean => {
    if (this.dead) {
      return false;
    }
    // if it should already be dead but isn't; kill it. (debug it later tho)
    if (Date.now() - this.timeOfBirth > FileClient.limits.age) {
      this._kill("Old age");
      return false;
    } else if (this._downloadCount >= FileClient.limits.downloads) {
      this._kill("Download limit exceeded");
      return false;
    } else if (this._errorCount >= FileClient.limits.errors) {
      this._kill("Error limit exceeded");
      return false;
    }
    return true;
  };

  // incrementors

  _incDownload = () => {
    this._downloadCount++;
    console.log(this.dead);
    assert.strictEqual(
      this.dead,
      false,
      errors.zombieError("_incDownload", this.fileHash)
    );
    this._lifeCheck();
  };

  _incError = () => {
    assert.strictEqual(
      this.dead,
      false,
      errors.zombieError("_incError (how ironic)", this.fileHash)
    );
    this._errorCount++;
    this._lifeCheck();
  };

  getReadStream = () => {
    if (this._lifeCheck()) {
      while (!this._ready) {
        // are we waiting for the last get? don't wait and give up instead
        // edgecase: brand new file with downloadLimit of 1
        if (this._downloadCount == FileClient.limits.downloads - 1) {
          throw new Error(
            "Attempted to get ReadStream but the last allowed download is already in progress!"
          );
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
      } catch (err) {
        console.log(
          `Error creating read stream for file at FileClient.items[${this.fileHash}]`
        );
        console.error(err);
        this._incError();
        throw err;
      }
    } else {
      throw errors.exhumationError;
    }
  };
}

class PromiseQueue {
  static resolved: Array<DeathCertificate> = [];
  static queue: Array<{
    promise: (value: FileCounter) => Promise<DeathCertificate>;
    resolve: (value: any) => void;
    reject: (reason: any) => any;
    file: FileCounter;
  }> = [];
  static pendingPormise = false;

  static enqueue(
    file: FileCounter,
    promise: (value: FileCounter) => Promise<DeathCertificate>
  ) {
    return new Promise((resolve, reject) => {
      this.queue.push({ promise, resolve, reject, file });
      console.log("Enqueued");
      this.dequeue();
    });
  }

  static dequeue() {
    console.log("Dequeue");
    if (this.pendingPormise) {
      console.log("Promise pending");
      return false;
    }
    const item = this.queue.shift();
    if (!item) {
      console.log("Nothing to dequeue");
      return false;
    }
    try {
      this.pendingPormise = true;
      item
        .promise(item.file)
        .then((value) => {
          console.log(value);
          this.pendingPormise = false;
          item.resolve(value);
          this.resolved.push(value);
          this.dequeue();
        })
        .catch((err) => {
          console.log(err);
          this.pendingPormise = false;
          item.reject(err);
          this.dequeue();
        });
    } catch (err) {
      console.log(err);
      this.pendingPormise = false;
      item.reject(err ?? "Error");
      this.dequeue();
    }
    return true;
  }
}
