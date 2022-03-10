/// <reference types="node" />
import fs from "fs";
import { DeathCertificate, FileCounter } from "./item";
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
    static graveyard: DeathCertificate[];
    static tempFolder: string;
    constructor({ dir, limits: { downloadLimit, errorLimit, ageLimit }, }: ConstructorParameters);
    updateLimits(limits: {
        ageLimit?: number;
        downloadLimit?: number;
        errorLimit?: number;
    }): void;
    addFile(srcPath: string | fs.ReadStream): Promise<string>;
    getFile(hash: string): FileCounter;
    getFileReadStream(hash: string): Promise<fs.ReadStream>;
}
export {};
