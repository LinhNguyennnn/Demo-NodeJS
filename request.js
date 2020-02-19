const http = require("http");

const getDataFromUrl = url =>
  new Promise(resolve => {
    http.get(url, res => res.on("data", data => resolve(data.toString())));
  });

module.exports = getDataFromUrl;
