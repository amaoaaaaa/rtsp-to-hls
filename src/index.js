const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const port = 9537;

// 允许跨域
app.use(cors());

// ffmpeg.exe 需要自己下载放到对应路径中：https://github.com/BtbN/FFmpeg-Builds/releases
const ffmpegPath = path.join(__dirname, "../ffmpeg/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

const outputDir = path.join(__dirname, "../output_hls");

// 设置静态文件服务
app.use("/hls", express.static(outputDir));

/**
 * 从监控视频流 rtsp 中提取主机作为视频流的名称
 * @param {string} rtsp - rtsp地址，例如："rtsp://admin:hs123456@192.168.11.210:554/h265/ch33/main/av_stream"
 * @returns {string} ip+port，例如："192.168.11.210+554"
 */
const splitStreamName = (rtsp) => {
    const host = rtsp.split("@").pop().split("/").shift();

    return host.replace(":", "+");
};

const rtspArr = [
    "rtsp://admin:hs123456@192.168.11.200:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.214:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.203:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.209:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.206:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.207:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.210:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.213:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.217:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.218:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.220:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.202:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.219:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.204:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.212:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.216:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.211:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.208:554/h265/ch33/main/av_stream",
    "rtsp://admin:hs123456@192.168.11.205:554/h265/ch33/main/av_stream",
];

rtspArr.forEach((url, index) => {
    // const streamName = url.split("/").pop();
    const streamName = splitStreamName(url);
    const dir = `${outputDir}/${streamName}`;

    // 确保输出文件夹存在
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    } else {
        // 清空文件夹
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            fs.unlinkSync(filePath);
        }
    }

    ffmpeg()
        // .input("rtsp://127.0.0.1:8554/monitor7") // 输入 RTSP 流
        // .input(url) // 输入 RTSP 流
        .input(`rtsp://127.0.0.1:8554/${index + 1}`) // 输入 RTSP 流
        .outputOptions("-c:v copy") // 视频流直接复制
        .outputOptions("-c:a copy") // 音频流直接复制
        .outputFormat("hls") // 输出视频格式
        .outputOptions("-hls_time 2") // 每个分段的时长为2秒
        .outputOptions("-hls_list_size 3") // 保持最新的分段个数
        .outputOptions("-hls_flags delete_segments") // 删除旧的分段
        .outputOptions("-start_number 1") // 开始编号
        .output(path.join(dir, `${streamName}.m3u8`)) // 输出文件
        .on("start", function () {
            console.log("开始转码", `rtsp://127.0.0.1:8554/${index + 1}`);
        })
        .on("error", function (err, stdout, stderr) {
            console.error("发生错误", err.message);
            // console.error("ffmpeg 标准错误", stderr);

            // TODO 出错重试

            // 强制关闭当前转码进程
            this.kill("SIGKILL");
        })
        .run();
});

app.listen(port);

console.log(`rtsp-to-hls 服务已启动在 http://localhost:${port}`);
console.log(`HLS 文件访问路径 http://localhost:${port}/hls`);
console.log("---------------------------");
