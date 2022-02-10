import assert from "assert";
export function zombieError(origin, hash) {
    return new assert.AssertionError({
        message: `
    Zombie file detected!\n
    Its dead but its still doing things!\n
    Very spooky.\n
    Zombie was found in the ${origin} function belonging to the FlieItem instance in FileClient.items at key ${hash}`,
    });
}
export const minAgeLimit = new assert.AssertionError({
    expected: "age >= 10000",
    message: "age limit must be greater than or equal to 10000!",
});
export const orphanError = new Error("FileCounter doesn't have a parent :(");
export const adoptionError = new assert.AssertionError({
    message: "Provided parent is not the same as the already existing parent.",
});
export const exhumationError = new Error("File is already dead!");
