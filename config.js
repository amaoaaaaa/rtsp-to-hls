module.exports = {
    /**
     * 运行端口
     */
    port: 9537,

    /**
     * 转码输出质量
     */
    outputQuality: {
        /**
         * 视频宽度（像素分辨率）
         */
        width: 720,

        /**
         * 帧率
         */
        fps: 24,

        /**
         * 码率
         */
        bitrate: "1000k",
    },

    /**
     * 是否使用本地模拟的 rtsp 源
     */
    useMockRtsp: true,

    /**
     * 模拟 rtsp 主机地址
     */
    // mockRtspHost: "127.0.0.1",
    mockRtspHost: "192.168.1.9",
};
