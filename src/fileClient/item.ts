// local imports
import * as errors from "./errors";
import FileClient from ".";

// node-module imports
import { strict as assert } from "assert";
import crypto from "crypto";
import fs from "fs";
import EventEmitter from "events";
import mime from "mime";
import Path from "path";
// types

export type DeathCertificate = {
  causeOfDeath: string;
  timeOfDeath: number;
  timeOfBirth: number;
  fileName: string;
};

function getExtension(path: string) {
  const stringArray = path.split(".");
  if(stringArray.length === 1){
    return null
  }
  return stringArray[stringArray.length - 1];
}

function getFileName(path: string) {
  const stringArray = path.split(Path.sep);
  return stringArray[stringArray.length - 1];
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

export async function generateFileName(src: fs.PathLike | fs.ReadStream) {
  var fileStream: fs.ReadStream;
  try {
    if (typeof src === "string") {
      fileStream = fs.createReadStream(src);
    } else if (src instanceof fs.ReadStream) {
      fileStream = src;
    } else {
      throw new Error("Not a path or a stream!");
    }
    const fileBuffer = await streamToBuffer(fileStream);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    const hex = hashSum.digest("hex");
    return hex;
  } catch (err) {
    throw err;
  }
}

async function writeToDisk(
  src: fs.PathLike | fs.ReadStream,
  dstPath: fs.PathLike
) {
  return new Promise((resolve, reject) => {
    try {
      src instanceof fs.ReadStream
        ? src
        : fs.createReadStream(src).pipe(
            fs.createWriteStream(dstPath).on("finish", () => {
              resolve(true);
            })
          );
    } catch (err) {
      reject("Error writing file to disk!");
      throw err;
    }
  });
}

function ageToDeath(file: FileCounter): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    file.on("death", (deathCertificate) => {
      reject();
    });
    setTimeout(() => {
      resolve(file._kill("old age"));
    }, FileClient.limits.age);
  });
}

function resolveOnDeath(file: FileCounter): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    file.on("death", (causeOfDeath) => {
      resolve();
    });
  });
}

export class FileCounter extends EventEmitter {
  // static variatbles
  static parent: FileClient | false = false;
  // private variables
  _filePath: string = "";
  _mimeType: string | null = null;
  _originalFileName: string = "";
  _ext: string | null = null;
  _ready: boolean = false;
  _stalenessCount: number = 0;
  _downloadCount: number = 0;
  _errorCount: number = 0;
  // public variables
  fileHash: string = "";
  dead: boolean = false;
  timeOfBirth: number = 0;
  timeOfDeath: number = 0;
  deathCertificate: DeathCertificate | undefined; // is undefined until death
  constructor(parent: FileClient, src: string | fs.ReadStream) {
    super();
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
    this._init(src);
  }
  async _init(srcPath: fs.ReadStream | string) {
    if (typeof srcPath === "string") {
      console.log(srcPath);
      this._ext = getExtension(srcPath);
      this._mimeType = this._ext?mime.getType(this._ext):null
      this._originalFileName = getFileName(srcPath)
      console.log(this._ext, this._mimeType, this._originalFileName)
    } else {
      // @ts-expect-error technically fs.ReadStream.path could be a buffer
      // but our implementation in FileClient guarentees a string here
      this._ext = srcPath.path.split(".")[-1];
      //@ts-expect-error see above
      this._mimeType = mime.getType(this._ext);
      // @ts-expect-error see above
      this._originalFileName = srcPath.path.split("/")[-1];
    }
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
    this.on("free", ()=>{
      this._ready = true;
    })
    ageToDeath(this).catch((err) => {
      // don't do anything here, ageToDeath rejects when the file died in some other way.
      // this implementation is to free the system i/o from resolving a pointless promise.
    });
    resolveOnDeath(this);
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
        this._incError();
        throw err;
      }finally{
        this.emit("free")
      }
    } else {
      throw errors.exhumationError;
    }
  };
}
