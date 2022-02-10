import FileClient from "../src/fileClient";
import crypto from "crypto";
import fs from "fs";
import FileCounter, { generateFileName } from "../src/fileClient/item";
import { zombieError } from "../src/fileClient/errors";

// file names change the stream value so this usecase is pretty limited
function streamCompare(a: fs.ReadStream, b: fs.ReadStream) {
  try {
    var aBuffArray = Array<any>();
    var aBuffer: Buffer;
    var bBuffArray = Array<any>();
    var bBuffer: Buffer;
    a.on("data", (chunk) => aBuffArray.push(chunk));
    a.on("end", () => (aBuffer = Buffer.concat(aBuffArray)));
    b.on("data", (chunk) => bBuffArray.push(chunk));
    b.on("end", () => {
      bBuffer = Buffer.concat(bBuffArray);
    });
    return aBuffer.compare(bBuffer);
  } catch (err) {
    console.error("Error comparing streams!");
    console.error(err);
    return -1;
  }
}

function writetoStream(
  bytesToWrite: number,
  writer: fs.WriteStream,
  callback: () => void
) {
  const step = 1000;
  let i = bytesToWrite;
  write();
  function write() {
    let ok = true;
    do {
      const chunkSize = i > step ? step : i;
      const buffer = crypto.randomBytes(chunkSize);

      i -= chunkSize;
      if (i === 0) {
        // Last time!
        writer.write(buffer, callback);
      } else {
        // See if we should continue, or wait.
        // Don't pass the callback, because we're not done yet.
        ok = writer.write(buffer);
      }
    } while (i > 0 && ok);

    if (i > 0) {
      // Had to stop early!
      // Write some more once it drains.
      writer.once("drain", write);
    }
  }
}

describe("Bespoke file client", () => {
  const testFileSize = 500;
  const fileClientDir = "./test/file-client-dir";
  const downloadedFilesDir = "./test/download-dir";
  const fileName = "./test/test-file";
  var testFileClient: FileClient;
  // prepare dummy file + directories
  beforeAll(async () => {
    // if the directory belonging to the fileClient exists; delete it. the file client will create and manage it for us.
    if (fs.existsSync(fileClientDir)) {
      new Promise<void>((resolve, reject) => {
        fs.readdir(fileClientDir, async (err, files) => {
          if (err) throw err;
          for (const file of files) {
            await new Promise<void>((resolve, reject) => {
              fs.unlink(`${fileClientDir}/${file}`, (err) => {
                if (err) throw err;
              });
              resolve();
            });
          }
          resolve();
        });
      }).then(() => {
        fs.rmdir(fileClientDir, (err) => {
          if (err) throw err;
        });
      });
    }
    // if the downloaded files directory doesn't exist; create it.
    if (!fs.existsSync(downloadedFilesDir)) {
      await new Promise<void>((resolve, reject) => {
        fs.mkdir(downloadedFilesDir, (err) => {
          if (err) throw err;
          resolve();
        });
      });
    } else {
      // if it does exist, remove all the files from it
      fs.readdir(downloadedFilesDir, async (err, files) => {
        if (err) throw err;
        for (const file of files) {
          await new Promise<void>((resolve, reject) => {
            fs.unlink(`${downloadedFilesDir}/${file}`, (err) => {
              if (err) throw err;
              resolve();
            });
          });
        }
      });
    }
    // if the random file doesn't exist; create it.
    if (!fs.existsSync(fileName)) {
      const writer = fs.createWriteStream(fileName);
      await new Promise<void>((resolve, reject) => {
        writetoStream(testFileSize, writer, async () => {
          console.log(`Wrote ${testFileSize} bytes to ${fileName}`);
          resolve();
        });
      });
    }
  });

  // clear dummy file and directories
  afterAll(async () => {
    FileCounter.parent = false;
    // remove all files from all directories and remove the directories
    new Promise<void>((resolve, reject) => {
      fs.readdir(downloadedFilesDir, (err, files) => {
        if (err) throw err;
        for (const file of files) {
          fs.unlink(`${downloadedFilesDir}/${file}`, (err) => {
            if (err) throw err;
          });
        }
        resolve();
      });
    }).then(() => {
      fs.rmdir(downloadedFilesDir, (err) => {
        if (err) throw err;
      });
    });
    new Promise<void>((resolve, reject) => {
      fs.readdir(fileClientDir, (err, files) => {
        if (err) throw err;
        for (const file of files) {
          fs.unlink(`${fileClientDir}/${file}`, (err) => {
            if (err) throw err;
          });
        }
        resolve();
      });
    }).then(() => {
      fs.rmdir(fileClientDir, (err) => {
        if (err) throw err;
      });
    });
    // remove the random file.
    fs.unlink(fileName, (err) => {
      if (err) throw err;
    });
  });
  test("Initilize FileClient", () => {
    testFileClient = new FileClient({
      dir: fileClientDir,
      limits: {
        downloadLimit: 2,
        errorLimit: 1,
        ageLimit: 15000,
      },
    });
  });
  // test the ability to upload and then retrieve a dummy file,
  // validating values along the way.
  describe("Uploading and retrieving", () => {
    // need these variables across different scopes
    var testFileHash: string;

    // test the ability to add a file to the client.
    // note that this function will be used in different describe blocks
    // so it has been made as a callable function.
    test("Add a file", async () => {
      testFileHash = await testFileClient.addFile(fileName);
      console.log(testFileHash);
      // expect a string
      expect(testFileHash).toMatch(await generateFileName(fileName));
      // any expect lifestatus needs to be rewritten
      /*       expect(
        JSON.stringify(testFileClient.items[testFileHash].getLifeStatus())
      ).toBe(
        JSON.stringify({
          stalenessCount: 0,
          downloadCount: 0,
          errorCount: 0,
        })
      ); */
    });

    // retrieve a file and verify that the file's download count has incremented
    test("Get a file", async () => {
      const testReader = testFileClient.getFile(testFileHash);
      const writeStream = fs.createWriteStream(
        `${downloadedFilesDir}/downloadedFile`
      );
      await new Promise<void>((resolve, reject) => {
        testReader.pipe(writeStream);
        testReader.on("close", async () => {
          resolve();
        });
      });
      expect(
        await generateFileName(`${downloadedFilesDir}/downloadedFile`)
      ).toBe(testFileHash);
      // get the new hash and then compare to the original file.
      // this doesn't work because of differing file names
      //expect(streamCompare(testReader, reader)).toBe(0);
      /*     expect(
        JSON.stringify(testFileClient.items[testFileHash].getLifeStatus())
      ).toBe(
        JSON.stringify({
          stalenessCount: 0,
          downloadCount: 1,
          errorCount: 0,
        })
      ); */
    });
  });
  describe("Aging file", () => {
    var testFileHash: string;
    var agingFile: FileCounter;
    test("update FileClient parameters", () => {
      testFileClient.updateLimits({
        downloadLimit: 1,
        errorLimit: 1,
        ageLimit: 20000,
      }); // update the limits so a file can only exist for 10 seconds
      expect(JSON.stringify(FileClient.limits)).toBe(
        JSON.stringify({
          age: 20000,
          downloads: 1,
          errors: 1,
        })
      );
    });
    test("Add a file with new limits", async () => {
      testFileHash = await testFileClient.addFile(fileName);
      console.log(testFileHash);
      // expect a string
      /*       expect(testFileHash).toMatch(await generateFileName(fileName));
      expect(
        JSON.stringify(testFileClient.items[testFileHash].getLifeStatus())
      ).toBe(
        JSON.stringify({
          stalenessCount: 0,
          downloadCount: 0,
          errorCount: 0,
        })
      ); */
    });
    test("age the file", async () => {
      agingFile = testFileClient.items[testFileHash];
      await new Promise<void>((resolve, reject) => {
        agingFile.on("death", (cause) => {
          expect(cause).toBe("old age");
          expect(
            Math.abs(
              agingFile.timeOfDeath -
                agingFile.timeOfBirth -
                FileClient.limits.age
            ) // thankfully js arithmatic prescendence allows this
          ).toBeLessThan(1000);
          resolve();
        });
      });
    }, 30000);
    test("fail to get an agead file", async () => {
      expect(testFileClient.items[testFileHash]).toBeUndefined();
      expect(agingFile.dead).toBeTruthy();
      expect(() => testFileClient.getFile(testFileHash)).toThrow();
    });
  });
  // this whole thing needs to be rewritten
});
