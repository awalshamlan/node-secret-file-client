# node-secret-file-client

## Usage

### Init File Client
    const fileClientDir = "./temp" // the fileClient will create the actual folder, here just provide a path
    const fileClient = new FileClient({
      dir: fileClientDir,
      limits: {
        downloadLimit: 2,
        errorLimit: 1,
        ageLimit: 15000, // in ms (must be over 10000)
      },
    })

### Store a file in the file client
Common use case is to store a file that a user uploaded.
Assuming that the file is being handled by some express middleware like formidabble, we can do something like this:

    const readStream = fs.createReadStream(req.file.path) // req.file.path is just an example here. depends on your middleware
    // writing to disk and initializing the file takes time; addFile() is a promise.
    const fileHash = await fileClient.addFile(readStream);
    
Thats it! Now to retrieve the file, lets say your user requets a file with the file hash returned by `.addFile(writeStream)`

### Pipe a file to a response:
Note that you cannot retrieve a dead file. A file dies when the clients download limit, error limit, or age limit has been exceeded. if your files keep dying before you are done with them; either increase the age limit or the download limit.

    const readStream = await fileClient.getReadStream(req.body.file-hash) // again this is just an example. depends on how your server is configured ofc.
    // pipe the stream to your server response (or do whatever you want with it really)
    readStream.pipe(req)


### Real Example Code:

Using express:

    cosnt app = express();

    app.get("/download/:file_name", (req, res) => {
      try {
        const fileName = req.params.file_name; // this should be the hash provided by the fileClient.addFile function.
        const file = fileClient.getFile(fileName);
        if (!file) {
          throw new Error("404");
        }
        res.setHeader(
          "Content-disposition",
          `attachment; filename=${file._originalFileName}`
        );
        res.setHeader("Content-Type", file._mimeType ?? "unknown");
        file.getReadStream().then((readStream) => readStream.pipe(res));
      } catch (error) {
        console.error(error);
        res.status(404).send();
      }
    });


    
This is my first npm package so be nice uwu
