const express = require('express');
const fs = require('fs');
const path = require('path');
const LRU = require('lru-cache');
const app = express();
const PORT = 3000;
const cache = new LRU({
  max: 100 * 1024 * 1024, 
  length: (n, key) => n.length, 
  maxAge: 1000 * 60 * 10, 
});
const videoPath = path.join(__dirname, 'large-video.mp4');
const videoSize = fs.statSync(videoPath).size;
app.get('/video', (req, res) => {
  const range = req.headers.range;
  if (!range) {
    return res.status(416).send('Requires Range header');
  }
  const CHUNK_SIZE = 10 ** 6; // 1MB 
  const start = Number(range.replace(/\D/g, ''));
  const end = Math.min(start + CHUNK_SIZE - 1, videoSize - 1);
  const contentLength = end - start + 1;
  const headers = {
    'Content-Range': `bytes ${start}-${end}/${videoSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength,
    'Content-Type': 'video/mp4',
  };
  res.writeHead(206, headers);
  const cacheKey = `${start}-${end}`;
  const cachedChunk = cache.get(cacheKey);
  if (cachedChunk) {
    console.log(`Serving chunk from cache: ${cacheKey}`);
    res.end(cachedChunk); 
  } else {
    console.log(`Reading and caching chunk: ${cacheKey}`);
    const videoStream = fs.createReadStream(videoPath, { start, end });
    let chunkData = Buffer.alloc(0); 
    videoStream.on('data', (data) => {
      chunkData = Buffer.concat([chunkData, data]);
    });
    videoStream.on('end', () => {
      cache.set(cacheKey, chunkData); 
      res.end(chunkData); 
    });
    videoStream.on('error', (err) => {
      console.error('Error reading video stream:', err);
      res.status(500).send('Internal Server Error');
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
