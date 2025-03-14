import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
const cacheMap = new Map()

//express server
const app = express();
//cors with option to allow all origins
app.use(cors({ origin: '*' }));
const proxiedURL = 'https://drive.google.com/thumbnail';
const port = 8080;
app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
app.get('/thumbnail', function (req, res) {
  var url = proxiedURL + '?' + new URLSearchParams(req.query).toString();
  // logger.info('/fileThumbnail going to url', url);
  if(cacheMap.has(req.query.id)) {
    console.log('serving from cache', url);
    res.set('Content-Type', 'image/png').send(Buffer.from(cacheMap.get(req.query.id)));
  } else {
    console.log('fetching url', url);
    fetch(url).then((actual) => {
      // actual.headers.forEach((v, n) => res.setHeader(n, v));
      // console.log('actual.body', actual.body);
      // res.send(actual.body);
      // actual.body.pipe(res);
      actual.blob().then((blob) => {
        // console.log('blob', blob);
        // res.send(blob);
        blob.arrayBuffer().then((buffer) => {
          cacheMap.set(req.query.id, buffer);
          //add cache headers
          res
            .set('Cache-Control', 'public, max-age=31536000')
            .set('Expires', new Date(Date.now() + 31536000000).toUTCString())
            .set('Last-Modified', new Date().toUTCString())
            .set('ETag', '1234567890')
            //set content type and send buffer
            .set('Content-Type', 'image/png')
            .send(Buffer.from(buffer));
        });
      });
      // Readable.fromWeb(actual.body).pipe(res);
    });
  }
});

// await fetch("https://drive.google.com/thumbnail?id=1pmcluJuk8wZNhs8oyjJ26VEAt_4QAgTH&sz=w800").then((res) => {
//   res.blob().then((blob) => {
//     const url = URL.createObjectURL(blob);
//     console.log(url.slice(0, 100));
//     //save as file
//     //turn blob to buffer first
//     blob.arrayBuffer().then((buffer) => {
//       fs.writeFile('thumbnail.png', Buffer.from(buffer)).then(() => {
//         console.log('thumbnail.png saved');
//       });
//     });
//   });
// });