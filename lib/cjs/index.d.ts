/// <reference types="node" />
import fs from "fs";
import FileCounter from "./item";
import EventEmitter from "events";
declare type ConstructorParameters = {
    dir: string;
    limits: {
        downloadLimit: number;
        errorLimit: number;
        ageLimit: number;
    };
};
export default class FileClient extends EventEmitter {
    items: {
        [hash: string]: FileCounter;
    };
    static limits: {
        age: number;
        downloads: number;
        errors: number;
    };
    static tempFolder: string;
    constructor({ dir, limits: { downloadLimit, errorLimit, ageLimit }, }: ConstructorParameters);
    updateLimits(limits: ConstructorParameters["limits"]): void;
    addFile(srcPath: fs.PathLike): Promise<string>;
    getFile(hash: string): fs.ReadStream;
}
export {};
