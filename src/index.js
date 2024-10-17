const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { splitStreamName, removeDirSync } = require("./utils");
const expressWs = require("express-ws");
const { port, outputQuality, useMockRtsp } = require("../config");
const { mockRtsp } = require("../mock");

// ffmpeg.exe、需要自己下载放到对应路径中：https://github.com/BtbN/FFmpeg-Builds/releases
const ffmpegPath = path.join(__dirname, "../ffmpeg/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

/** hls 缓存文件夹 */
const outputDir = path.join(__dirname, "../output_hls");
removeDirSync(outputDir);

const app = express();

// 允许跨域
app.use(cors());

// 设置静态文件服务
app.use("/hls", express.static(outputDir));

// WebSocket
expressWs(app);

/**
 * 转码任务池，key：rtsp流的名称，value.command：转码进程，value.connected：前端正在使用该转码流的数量
 * @type {Map<string, {command: import('fluent-ffmpeg').FfmpegCommand, connected: number}>}
 */
const workPool = new Map();

// 定时打印任务池
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
 * @param {string} dir - 临时文件输出文件夹
 * @returns {Promise<{width: number; height: number;}>}
 */
const getOutputSize = (rtspUrl, dir) => {
    return new Promise((resolve, reject) => {
        const FfmpegCommand = ffmpeg()
            .input(rtspUrl)
            .output(path.join(dir, `temp.mp4`))
            .on("codecData", function ({ video_details }) {
                FfmpegCommand.kill("SIGKILL");

                /** @type {string[]} */
                const metaArr = video_details;

                let sourceWidth, sourceHeight;

                metaArr.forEach((str) => {
                    if (str.match(/(\d+)x(\d+)/)) {
                        // 1920x1080 [SAR 1:1 DAR 16:9] ==> 1920x1080 ==> [1920, 1080]
                        [sourceWidth, sourceHeight] = str.split(" ").shift()?.split("x");
                    }
                });

                if (!sourceWidth || !sourceHeight) return reject("获取 rtsp 元数据失败");

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
            })
            .on("error", function (err) {
                if (err.message === "ffmpeg was killed with signal SIGKILL") return;

                FfmpegCommand.kill("SIGKILL");
                return reject("获取 rtsp 元数据失败");
            })
            .run();

        // 获取超时，kill掉
        setTimeout(() => {
            FfmpegCommand.kill("SIGKILL");
            return reject("获取 rtsp 元数据失败");
        }, 1000 * 10);
    });
};

app.ws(
    "/ffmpeg",
    /** @type {import("express-ws").WebsocketRequestHandler} */
    function (ws, req) {
        const url = req.query.rtsp;
        const rtspUrl = useMockRtsp ? mockRtsp[url] : url;
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
        const maxTryTimes = 2;

        /** @type {{width: number; height: number;}} */
        let outputSize;

        const runFfmpeg = async () => {
            /** @type {import('fluent-ffmpeg').FfmpegCommand} */
            let command;

            /** @type {NodeJS.Timeout} */
            let checkCanplayTimer;

            try {
                if (!outputSize) {
                    outputSize = await getOutputSize(rtspUrl, dir);
                }

                command = ffmpeg()
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
                    if (ws.readyState === 3) {
                        console.log("连接已关闭，不再重试", rtspUrl);
                    } else {
                        tryTimes++;
                        console.log(`重试第${tryTimes}次`, rtspUrl);

                        runFfmpeg();
                    }
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
