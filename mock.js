const { mockRtspHost } = require("./config");

/** 本地模拟的 rtsp 地址前缀 */
const mockRtspPrefix = `rtsp://${mockRtspHost}:8554`;

/**
 * 本地模拟的 rtsp，对应接口返回的实际地址
 */
const mockRtsp = {
    "rtsp://admin:hs123456@192.168.11.200:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/1`,
    "rtsp://admin:hs123456@192.168.11.214:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/2`,
    "rtsp://admin:hs123456@192.168.11.203:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/3`,
    "rtsp://admin:hs123456@192.168.11.209:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/4`,
    "rtsp://admin:hs123456@192.168.11.206:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/5`,
    "rtsp://admin:hs123456@192.168.11.207:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/6`,
    "rtsp://admin:hs123456@192.168.11.210:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/7`,
    "rtsp://admin:hs123456@192.168.11.213:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/8`,
    "rtsp://admin:hs123456@192.168.11.217:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/9`,
    "rtsp://admin:hs123456@192.168.11.218:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/10`,
    "rtsp://admin:hs123456@192.168.11.220:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/11`,
    "rtsp://admin:hs123456@192.168.11.202:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/12`,
    "rtsp://admin:hs123456@192.168.11.219:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/13`,
    "rtsp://admin:hs123456@192.168.11.204:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/14`,
    "rtsp://admin:hs123456@192.168.11.212:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/15`,
    "rtsp://admin:hs123456@192.168.11.216:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/16`,
    "rtsp://admin:hs123456@192.168.11.211:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/17`,
    "rtsp://admin:hs123456@192.168.11.208:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/18`,
    "rtsp://admin:hs123456@192.168.11.205:554/h265/ch33/main/av_stream": `${mockRtspPrefix}/19`,
};

module.exports = {
    mockRtsp,
};
