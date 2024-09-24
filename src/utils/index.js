const fs = require("fs");

/**
 * 从监控视频流 rtsp 中提取主机作为视频流的名称
 * @param {string} rtsp - rtsp地址，例如："rtsp://admin:hs123456@192.168.11.210:554/h265/ch33/main/av_stream"
 * @returns {string} ip+port，例如："192.168.11.210+554"
 */
const splitStreamName = (rtsp) => {
    const host = rtsp.split("@").pop().split("/").shift();

    return host.replace(":", "+");
};

/**
 * 删除文件夹（同步执行）
 * @param {string} path - 文件夹路径
 */
const removeDirSync = (path) => {
    try {
        fs.rmSync(path, { recursive: true, force: true });
        console.log("删除文件夹", path);
    } catch (err) {
        console.log("文件夹删除失败", path, err);
    }
};

module.exports = { splitStreamName, removeDirSync };
