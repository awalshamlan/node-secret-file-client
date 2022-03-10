/// <reference types="node" />
import FileClient from ".";
import fs from "fs";
import EventEmitter from "events";
export declare type DeathCertificate = {
    causeOfDeath: string;
    timeOfDeath: number;
    timeOfBirth: number;
    fileName: string;
};
export declare function generateFileName(src: fs.PathLike | fs.ReadStream): Promise<string>;
export declare class FileCounter extends EventEmitter {
    static parent: FileClient | false;
    _filePath: string;
    _mimeType: string | null;
    _originalFileName: string;
    _ext: string | null;
    _ready: boolean;
    _stalenessCount: number;
    _downloadCount: number;
    _errorCount: number;
    fileHash: string;
    dead: boolean;
    timeOfBirth: number;
    timeOfDeath: number;
    deathCertificate: DeathCertificate | undefined;
    constructor(parent: FileClient, src: string | fs.ReadStream);
    _init(srcPath: fs.ReadStream | string): Promise<void>;
    getLifeStatus(): {
        age: {
            limit: number;
            current: number;
        };
        downloadCount: {
            limit: number;
            current: number;
        };
        errorCount: {
            limit: number;
            current: number;
        };
    };
    _kill(causeOfDeath: string): void;
    _lifeCheck: () => boolean;
    _incDownload: () => void;
    _incError: () => void;
    getReadStream: () => Promise<fs.ReadStream>;
}
