const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { splitStreamName, removeDirSync } = require("./utils");

const app = express();
const port = 9537;

// 允许跨域
app.use(cors());

// ffmpeg.exe、ffprobe.exe 需要自己下载放到对应路径中：https://github.com/BtbN/FFmpeg-Builds/releases
const ffmpegPath = path.join(__dirname, "../ffmpeg/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

const outputDir = path.join(__dirname, "../output_hls");
removeDirSync(outputDir);

// 设置静态文件服务
app.use("/hls", express.static(outputDir));

const outputWidth = 720;
const outputFps = 24;
const outputBitrate = "1000k";

/**
 * 获取输出分辨率
 * @param {string} rtspUrl - 视频流地址
 * @returns {Promise<{width: number; height: number;}>}
 */
const getOutputSize = (rtspUrl) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(rtspUrl, (err, metadata) => {
            if (err) return reject("获取 rtsp 元数据失败");

            const videoStream = metadata.streams.find((stream) => stream.codec_type === "video");

            if (!videoStream) return reject("找不到视频流");

            const sourceWidth = videoStream.width;
            const sourceHeight = videoStream.height;

            const output = {
                // 固定输出宽度
                width: outputWidth,
                height: 0,
            };

            // 计算输出高度
            output.height = Math.floor(output.width / (sourceWidth / sourceHeight));

            // 强行转偶数
            if (output.height % 2 !== 0) output.height++;

            resolve(output);
        });
    });
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
    // "rtsp://admin:hs123456@192.168.11.220:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.202:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.219:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.204:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.212:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.216:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.211:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.208:554/h265/ch33/main/av_stream",
    // "rtsp://admin:hs123456@192.168.11.205:554/h265/ch33/main/av_stream",
];

rtspArr.forEach((url, index) => {
    const rtspUrl = `rtsp://127.0.0.1:8554/${index + 1}`;
    const streamName = splitStreamName(url);
    const dir = `${outputDir}/${streamName}`;

    // 创建空文件夹
    fs.existsSync(dir) && removeDirSync(dir);
    fs.mkdirSync(dir, { recursive: true });

    let tryTimes = 0;
    const maxTryTimes = 3;

    /** @type {{width: number; height: number;}} */
    let outputSize;

    const runFfmpeg = async () => {
        let command;

        try {
            if (!outputSize) {
                outputSize = await getOutputSize(rtspUrl);
            }

            command = ffmpeg()
                // .input("rtsp://127.0.0.1:8554/monitor7") // 输入 RTSP 流
                // .input(url) // 输入 RTSP 流
                .input(rtspUrl) // 输入 RTSP 流

                // .outputOptions("-c:v copy") // 视频流直接复制
                // .outputOptions("-c:a copy") // 音频流直接复制
                .outputOptions("-c:v libx264") // 使用 libx264 编码器编码视频为 H.264
                .outputOptions("-preset veryfast") // 设置编码速度预设
                .outputOptions(`-vf scale=${outputSize.width}:${outputSize.height}`) // 分辨率
                .outputOptions(`-r ${outputFps}`) // 帧率
                .outputOptions(`-b:v ${outputBitrate}`) // 设置视频比特率
                .outputOptions("-an") // 禁用音频

                .outputFormat("hls") // 输出视频格式
                .outputOptions("-hls_time 2") // 每个分段的时长为2秒
                .outputOptions("-hls_list_size 3") // 保持最新的分段个数
                .outputOptions("-hls_flags delete_segments") // 删除旧的分段
                .outputOptions("-start_number 1") // 开始编号
                .output(path.join(dir, `${streamName}.m3u8`)) // 输出文件

                // .on("start", function () {})
                .on("codecData", function ({ video_details }) {
                    console.log();
                    console.log("开始转码", rtspUrl);
                    console.log("输入视频", JSON.stringify(video_details));
                    console.log("输出视频", outputSize, outputBitrate, `${outputFps}fps`);
                })
                .on("error", function (err, stdout, stderr) {
                    console.log();
                    console.error("发生错误", rtspUrl, err.message);
                })
                .on("end", function () {
                    // TODO 从任务池中移除当前任务
                })
                .run();
        } catch (error) {
            console.log();
            console.log("runFfmpeg 报错", error);

            // 强制关闭当前转码进程
            command?.kill?.("SIGKILL");

            // 出错重试
            if (tryTimes < maxTryTimes) {
                tryTimes++;
                console.log(`重试第${tryTimes}次`, rtspUrl);

                runFfmpeg();
            } else {
                console.log("超出最大重试次数", rtspUrl);
            }
        }
    };

    runFfmpeg();
});

app.listen(port);

console.log(`rtsp-to-hls 服务已启动在 http://localhost:${port}`);
console.log(`HLS 文件访问路径 http://localhost:${port}/hls`);
console.log("---------------------------");
