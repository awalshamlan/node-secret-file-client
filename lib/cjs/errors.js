"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exhumationError = exports.adoptionError = exports.orphanError = exports.minAgeLimit = exports.zombieError = void 0;
const assert_1 = __importDefault(require("assert"));
function zombieError(origin, hash) {
    return new assert_1.default.AssertionError({
        message: `
    Zombie file detected!\n
    Its dead but its still doing things!\n
    Very spooky.\n
    Zombie was found in the ${origin} function belonging to the FlieItem instance in FileClient.items at key ${hash}`,
    });
}
exports.zombieError = zombieError;
exports.minAgeLimit = new assert_1.default.AssertionError({
    expected: "age >= 10000",
    message: "age limit must be greater than or equal to 10000!",
});
exports.orphanError = new Error("FileCounter doesn't have a parent :(");
exports.adoptionError = new assert_1.default.AssertionError({
    message: "Provided parent is not the same as the already existing parent.",
});
exports.exhumationError = new Error("File is already dead!");
