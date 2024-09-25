const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { splitStreamName, removeDirSync } = require("./utils");
const expressWs = require("express-ws");
const { outputQuality } = require("../config");

// ffmpeg.exe、ffprobe.exe 需要自己下载放到对应路径中：https://github.com/BtbN/FFmpeg-Builds/releases
const ffmpegPath = path.join(__dirname, "../ffmpeg/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

/** hls 缓存文件夹 */
const outputDir = path.join(__dirname, "../output_hls");
removeDirSync(outputDir);

const app = express();
const port = 9537;

// 允许跨域
app.use(cors());

// 设置静态文件服务
app.use("/hls", express.static(outputDir));

// WebSocket
expressWs(app);

/**
 * 本地模拟的 rtsp，对应接口返回的实际地址
 */
const mockRtsp = {
    "rtsp://admin:hs123456@192.168.11.200:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/1",
    "rtsp://admin:hs123456@192.168.11.214:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/2",
    "rtsp://admin:hs123456@192.168.11.203:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/3",
    "rtsp://admin:hs123456@192.168.11.209:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/4",
    "rtsp://admin:hs123456@192.168.11.206:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/5",
    "rtsp://admin:hs123456@192.168.11.207:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/6",
    "rtsp://admin:hs123456@192.168.11.210:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/7",
    "rtsp://admin:hs123456@192.168.11.213:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/8",
    "rtsp://admin:hs123456@192.168.11.217:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/9",
    "rtsp://admin:hs123456@192.168.11.218:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/10",
    "rtsp://admin:hs123456@192.168.11.220:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/11",
    "rtsp://admin:hs123456@192.168.11.202:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/12",
    "rtsp://admin:hs123456@192.168.11.219:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/13",
    "rtsp://admin:hs123456@192.168.11.204:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/14",
    "rtsp://admin:hs123456@192.168.11.212:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/15",
    "rtsp://admin:hs123456@192.168.11.216:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/16",
    "rtsp://admin:hs123456@192.168.11.211:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/17",
    "rtsp://admin:hs123456@192.168.11.208:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/18",
    "rtsp://admin:hs123456@192.168.11.205:554/h265/ch33/main/av_stream": "rtsp://127.0.0.1:8554/19",
};

/**
 * 转码任务池，key：rtsp流的名称，value.command：转码进程，value.connected：前端正在使用该转码流的数量
 * @type {Map<string, {command: import('fluent-ffmpeg').FfmpegCommand, connected: number}>}
 */
const workPool = new Map();

setInterval(() => {
    console.log();
    console.log(
        "任务池",
        [...workPool.keys()].map((key) => {
            return ["转码任务", key, "正在播放", workPool.get(key).connected];
        })
    );
}, 1000);

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
                width: outputQuality.width,
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

app.ws(
    "/ffmpeg",
    /** @type {import("express-ws").WebsocketRequestHandler} */
    function (ws, req) {
        const url = req.query.rtsp;
        const rtspUrl = mockRtsp[url];
        const streamName = splitStreamName(url);
        const hlsUrl = `http://127.0.0.1:${port}/hls/${streamName}/${streamName}.m3u8`;
        const dir = `${outputDir}/${streamName}`;

        // 保持心跳
        ws.on("message", (data) => ws.send(data));

        // 断开时更新连接数
        ws.on("close", function () {
            const work = workPool.get(streamName);

            if (!work) return;

            work.connected--;

            if (work.connected === 0) {
                console.log();
                console.log("连接已全部断开，删除任务", streamName);

                work.command.kill("SIGKILL");
                workPool.delete(streamName);
                removeDirSync(dir);
            }
        });

        const work = workPool.get(streamName);
        if (work?.connected) {
            work.connected++;

            // 传回 hsl 地址
            ws.send(JSON.stringify({ hlsUrl: hlsUrl }));

            return;
        }

        // 创建空文件夹
        fs.existsSync(dir) && removeDirSync(dir);
        fs.mkdirSync(dir, { recursive: true });

        let tryTimes = 0;
        const maxTryTimes = 3;

        /** @type {{width: number; height: number;}} */
        let outputSize;

        const runFfmpeg = async () => {
            /** @type {import('fluent-ffmpeg').FfmpegCommand} */
            let command;

            /** @type {NodeJS.Timeout} */
            let checkCanplayTimer;

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
                    .outputOptions(`-r ${outputQuality.fps}`) // 帧率
                    .outputOptions(`-b:v ${outputQuality.bitrate}`) // 设置视频比特率
                    .outputOptions("-an") // 禁用音频

                    .outputFormat("hls") // 输出视频格式
                    .outputOptions("-hls_time 2") // 每个分段的时长为2秒
                    .outputOptions("-hls_list_size 3") // 保持最新的分段个数
                    .outputOptions("-hls_flags delete_segments") // 删除旧的分段
                    .outputOptions("-start_number 1") // 开始编号
                    .output(path.join(dir, `${streamName}.m3u8`)) // 输出文件

                    .on("codecData", function ({ video_details }) {
                        console.log();
                        console.log("处理转码", rtspUrl);
                        console.log("输入视频", JSON.stringify(video_details));
                        console.log(
                            "输出视频",
                            outputSize,
                            outputQuality.bitrate,
                            `${outputQuality.fps}fps`
                        );

                        // 转码开始的时候连接已经关闭
                        if (ws.readyState === 3 && !workPool.get(streamName)?.connected) {
                            // 强制关闭当前转码进程
                            command.kill("SIGKILL");
                            console.log("WebSocket 连接已关闭，杀掉转码进程");
                            return;
                        }

                        // 记录转码任务
                        workPool.set(streamName, {
                            command: command,
                            connected: 1,
                        });

                        checkCanplayTimer = setInterval(() => {
                            const m3u8File = path.join(dir, `${streamName}.m3u8`);

                            if (fs.existsSync(m3u8File)) {
                                console.log();
                                console.log("已生成", rtspUrl, "-->", hlsUrl);

                                // 传回 hsl 地址
                                ws.send(JSON.stringify({ hlsUrl: hlsUrl }));

                                clearInterval(checkCanplayTimer);
                            }
                        }, 1000);
                    })
                    .on("error", function (err, stdout, stderr) {
                        if (err.message === "ffmpeg was killed with signal SIGKILL") return;

                        console.log();
                        console.error("发生错误", rtspUrl, err.message);
                    })
                    .on("end", function () {
                        // 从任务池中移除当前任务
                        workPool.delete(streamName);
                    })
                    .run();
            } catch (error) {
                console.log();
                console.log("runFfmpeg 报错", error);

                clearInterval(checkCanplayTimer);

                // 强制关闭当前转码进程
                command?.kill("SIGKILL");

                // 从任务池中移除当前任务
                workPool.delete(streamName);

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
    }
);

app.listen(port);

console.log(`rtsp-to-hls 服务已启动在 http://localhost:${port}`);
console.log(`HLS 文件访问路径 http://localhost:${port}/hls`);
console.log("---------------------------");
