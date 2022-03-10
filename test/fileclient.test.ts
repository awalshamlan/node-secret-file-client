import FileClient from "../src/fileClient";
import crypto from "crypto";
import fs from "fs";
import { FileCounter, generateFileName } from "../src/fileClient/item";
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
  const fileClientDir = `${process.cwd()}/test/file-client-dir`;
  const downloadedFilesDir = `${process.cwd()}/test/download-dir`;
  const fileName = `${process.cwd()}/test/test-file`;
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
    // test on a sample to pdf to verify metadata
    test("Valid meta data", async () => {
      const sampleFile = `${process.cwd()}/test/sample.pdf`;
      const sampleHash = await testFileClient.addFile(sampleFile);
      expect(sampleHash).toBe(await generateFileName(sampleFile));
      const file = testFileClient.getFile(sampleHash);
      expect(file._mimeType).toBe("application/pdf");
      expect(file._ext).toBe("pdf");
      expect(file._originalFileName).toBe("sample.pdf");
    });
    // retrieve a file and verify that the file's download count has incremented
    test("Get a file", async () => {
      const testReader = testFileClient.getFileReadStream(testFileHash);
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
      });
      expect(FileClient.limits.age).toBe(20000);
      expect(FileClient.limits.downloads).toBe(1);
      expect(FileClient.limits.errors).toBe(1);
    });
    test("Add a file with new limits", async () => {
      testFileHash = await testFileClient.addFile(fileName);
    });
    test("age the file", async () => {
      agingFile = testFileClient.items[testFileHash];
      await new Promise<void>((resolve, reject) => {
        agingFile.on("death", (deathCertificate) => {
          expect(deathCertificate.causeOfDeath).toBe("old age");
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
    test("fail to get an aged file", async () => {
      expect(testFileClient.items[testFileHash]).toBeUndefined();
      expect(agingFile.dead).toBeTruthy();
      expect(() => testFileClient.getFileReadStream(testFileHash)).toThrow();
    });
  });
  describe("upload and retrieve 2 files asynchronously", () => {
    const firstFileName = `${process.cwd()}/test/temp/test-file-1`;
    const secondFileName = `${process.cwd()}/test/temp/test-file-2`;
    var firstFileHash: string;
    var secondFileHash: string;
    var birthDelta: number;
    var deathDelta: number;
    beforeAll(async () => {
      // update the limits again; as we confirmed worked earlier
      testFileClient.updateLimits({ downloadLimit: 5 });
      // if the paid of files doesn't exist, create it
      if (!fs.existsSync(firstFileName)) {
        const writer = fs.createWriteStream(firstFileName);
        await new Promise<void>((resolve, reject) => {
          writetoStream(testFileSize, writer, async () => {
            console.log(`Wrote ${testFileSize} bytes to ${firstFileName}`);
            resolve();
          });
        });
      }
      if (!fs.existsSync(secondFileName)) {
        const writer = fs.createWriteStream(secondFileName);
        await new Promise<void>((resolve, reject) => {
          writetoStream(testFileSize, writer, async () => {
            console.log(`Wrote ${testFileSize} bytes to ${secondFileName}`);
            resolve();
          });
        });
      }
    });
    afterAll(() => {
      fs.unlink(firstFileName, (err) => {
        if (err) throw err;
      });
      fs.unlink(secondFileName, (err) => {
        if (err) throw err;
      });
    });
    test("upload 2 files.", async () => {
      var startTime = Date.now();
      var firstFileEnd: number;
      var secondFileEnd: number;
      const writeFirstFile = testFileClient
        .addFile(firstFileName)
        .then((hash) => {
          firstFileEnd = Date.now();
          firstFileHash = hash;
          console.log(
            `Uploaded first file after  ${Date.now() - startTime} ms`
          );
        });
      const writeSecondFile = testFileClient
        .addFile(secondFileName)
        .then((hash) => {
          secondFileEnd = Date.now();
          secondFileHash = hash;
          console.log(
            `Uploaded second file after ${Date.now() - startTime} ms`
          );
        });
      await Promise.all([writeFirstFile, writeSecondFile]).then(() => {
        birthDelta = Math.abs(firstFileEnd - secondFileEnd);
      });
    });
    test("get both files", async () => {
      const firstDestinationStream = fs.createWriteStream(
        "./test/download-dir/dest1"
      );
      const secondDestinationStream = fs.createWriteStream(
        "./test/download-dir/dest2"
      );
      const firstFileReadStream =
        testFileClient.getFileReadStream(firstFileHash);
      const secondFileReadStream =
        testFileClient.getFileReadStream(secondFileHash);
      firstFileReadStream.pipe(firstDestinationStream);
      secondFileReadStream.pipe(secondDestinationStream);
      var firstIsClosed = false;
      var secondIsClosed = false;
      firstDestinationStream.on("close", () => {
        firstIsClosed = true;
        if (firstIsClosed && secondIsClosed) {
          const firstCopyHash = generateFileName("./test/download-dir/dest1");
          expect(firstCopyHash).toBe(firstFileHash);
          const secondCopyHash = generateFileName("./test/download-dir/dest2");
          expect(secondCopyHash).toBe(secondFileHash);
        }
      });
      secondDestinationStream.on("close", async () => {
        secondIsClosed = true;
        if (firstIsClosed && secondIsClosed) {
          const [firstCopyHash, secondCopyHash] = await Promise.all([
            generateFileName("./test/download-dir/dest1"),
            generateFileName("./test/download-dir/dest2"),
          ]);
          expect(firstCopyHash).toBe(firstFileHash);
          expect(secondCopyHash).toBe(secondFileHash);
        }
      });
      expect(
        testFileClient.items[firstFileHash].getLifeStatus().downloadCount
          .current
      ).toBe(1);
      expect(
        testFileClient.items[secondFileHash].getLifeStatus().downloadCount
          .current
      ).toBe(1);
    });
    test("age both to death", async () => {
      var firstFileDead = false;
      var secondFileDead = false;
      const firstFile = testFileClient.items[firstFileHash];
      var firstFileTimeOfBirth = firstFile.timeOfBirth;
      const secondFile = testFileClient.items[secondFileHash];
      var secondFileTimeOfBirth = secondFile.timeOfBirth;
      var firstFileTimeOfDeath: number;
      var secondFileTimeOfDeath: number;
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          firstFile.on("death", (deathCertificate) => {
            firstFileDead = true;
            firstFileTimeOfDeath = firstFile.timeOfDeath;
            expect(deathCertificate.causeOfDeath).toBe("old age");
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          secondFile.on("death", (deathCertificate) => {
            secondFileDead = true;
            secondFileTimeOfDeath = secondFile.timeOfDeath;
            expect(deathCertificate.causeOfDeath).toBe("old age");
            resolve();
          });
        }),
      ]).then(() => {
        deathDelta = Math.abs(secondFileTimeOfDeath - firstFileTimeOfDeath);
        console.log(deathDelta, secondFileTimeOfDeath, firstFileTimeOfDeath);
        expect(
          Math.abs(
            firstFileTimeOfDeath - firstFileTimeOfBirth - FileClient.limits.age
          )
        ).toBeLessThan(1000);
        expect(
          Math.abs(
            secondFileTimeOfDeath -
              secondFileTimeOfBirth -
              FileClient.limits.age
          )
        ).toBeLessThan(1000);
        expect(Math.abs(deathDelta - birthDelta)).toBeLessThan(100); // death difference should be roughly equal to birth difference. only allow 100ms discrepency
        expect(testFileClient.items[firstFileHash]).toBeUndefined();
        expect(testFileClient.items[secondFileHash]).toBeUndefined();
      });
    }, 60000); // longer timeout because i expect strange behaviour
  });
  // this whole thing needs to be rewritten
});
