const fs = require("fs");
const Promise = require("bluebird");
const request = require("request");
// const rp = require("request-promise");
// const chalk = require("chalk");
const HLS = require("hls-parser");

const _ = require("lodash");

const path = require("path");
const Url = require("url");

const inputUrl =
  "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8";
const outputFolder = "./download";

const readAndDownloadFileFromUrl = (url, saveLocation) =>
  new Promise((resolve, reject) => {
    const dirname = path.dirname(saveLocation);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    request(url, (err, res, body) => {
      if (err) {
        reject(err);
      } else {
        resolve(body);
      }
    }).pipe(
      fs.createWriteStream(saveLocation, {
        encoding: "utf-8"
      })
    );
  });

const downloadAllFiles = async (url, outputFolder, concurrency = 5) => {
  if (fs.existsSync(outputFolder)) {
    fs.rmdirSync(outputFolder, { recursive: true });
  }
  const masterPlaylistName = `playlist.m3u8`;
  const masterPlaylistPath = path.join(outputFolder, masterPlaylistName);
  const downloadedPlaylist = await readAndDownloadFileFromUrl(
    url,
    masterPlaylistPath
  );
  playlist = HLS.parse(downloadedPlaylist);
  if (playlist.isMasterPlaylist) {
    const audios = playlist.variants.map(variant => variant.audio);
    let renditions = [];
    for (let audio of audios) {
      renditions = _.unionWith(
        renditions,
        audio,
        (a1, a2) => a1.uri === a2.uri
      );
    }
    const subtitles = playlist.variants.map(variant => variant.subtitles);
    for (let subtitle of subtitles) {
      renditions = _.unionWith(
        renditions,
        subtitle,
        (a1, a2) => a1.uri === a2.uri
      );
    }
    renditions = renditions.map(r => ({
      name: r.uri,
      uri: Url.resolve(url, r.uri),
      saveLocation: path.join(outputFolder, r.uri)
    }));
    const variants = playlist.variants.map(variant => ({
      name: variant.uri,
      uri: Url.resolve(url, variant.uri),
      saveLocation: path.join(outputFolder, variant.uri)
    }));

    const mediaPlaylists = [...renditions, ...variants];

    const segmentsToDownload = [];

    for (let mediaPlaylist of mediaPlaylists) {
      const mediaPlayListContent = await readAndDownloadFileFromUrl(
        mediaPlaylist.uri,
        mediaPlaylist.saveLocation
      );
      const parsedMediaPlaylist = HLS.parse(mediaPlayListContent);
      for (let segment of parsedMediaPlaylist.segments) {
        const uri = Url.resolve(mediaPlaylist.uri, segment.uri);
        const name = segment.uri;
        const saveLocation = Url.resolve(
          mediaPlaylist.saveLocation,
          segment.uri
        );
        segment = { uri, saveLocation, mediaPlaylist, name };
        segmentsToDownload.push(segment);
      }
    }

    let done = 0;

    await Promise.map(
      segmentsToDownload,
      async segment => {
        await readAndDownloadFileFromUrl(segment.uri, segment.saveLocation);
        done++;
        console.log(
          segment.mediaPlaylist.name,
          segment.name,
          "downloaded",
          `${done} / ${segmentsToDownload.length}`
        );
      },
      { concurrency }
    );
  }
};

downloadAllFiles(inputUrl, outputFolder, 100)
  .then(() => {
    console.log("Done.");

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
