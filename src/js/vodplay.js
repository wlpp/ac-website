document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('videoPlayer');
    let currentHls = null;

    // 获取 URL 中的参数
    const urlParams = new URLSearchParams(window.location.search);
    const episodes = urlParams.get('episodes');
    const vid = urlParams.get('vid');
    const manga_type = urlParams.get('manga_type') || '0'; // 获取 manga_type 参数，默认为 0
    const title = urlParams.get('title'); // 获取 title 参数

    // 渲染集数
    // renderEpisodes(episodes);

    // 设置视频标题
    const videoTitleElement = document.querySelector('.video-title');
    if (videoTitleElement && title) {
        videoTitleElement.textContent = decodeURIComponent(title); // 解码并设置标题
    }

    // 优化的HLS配置
    const hlsConfig = {
        debug: false,
        enableWorker: true, // 启用Web Worker
        lowLatencyMode: true,
        backBufferLength: 90, // 90秒的后台缓冲
        maxBufferSize: 30 * 1000 * 1000, // 30MB的最大缓冲区
        maxBufferLength: 30, // 30秒的最大缓冲长度
        maxMaxBufferLength: 600, // 最大缓冲区长度的上限
        startLevel: -1, // 自动选择最佳质量
        abrEwmaDefaultEstimate: 500000, // 初始带宽估计
        abrBandWidthFactor: 0.95, // 带宽因子
        abrBandWidthUpFactor: 0.7, // 上行带宽因子
        fragLoadingTimeOut: 20000, // 片段加载超时
        manifestLoadingTimeOut: 10000, // 清单加载超时
        manifestLoadingMaxRetry: 3, // 清单加载最大重试次数
        fragLoadingMaxRetry: 4, // 片段加载最大重试次数
        fragLoadingRetryDelay: 1000, // 片段加载重试延迟
        progressive: true, // 启用渐进式加载
        xhrSetup: function(xhr, url) {
            xhr.withCredentials = false;
        },
        cors: true
    };

    // 添加视频预加载
    video.preload = "auto";

    // 获取视频流地址并初始化播放器
    async function initializeVideoStream() {
        try {
            const response = await fetch(`/api/vod-stream?vid=${vid}&manga_type=${manga_type}`);
            const data = await response.json();

            if (data.success && data.data.base_url) {
                initializePlayer(data.data.base_url);
            } else {
                handleError('获取视频流失败: ' + data.message);
            }
        } catch (error) {
            handleError('请求视频流接口失败: ' + error.message);
        }
    }

    // 初始化播放器
    function initializePlayer(videoUrl) {
        if (Hls.isSupported()) {
            // 清理之前的HLS实例
            if (currentHls) {
                currentHls.destroy();
            }

            const hls = new Hls(hlsConfig);
            currentHls = hls;

            // 添加加载状态提示
            videoTitleElement.textContent = decodeURIComponent(title) + ' (加载中...)';
            
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            // 监听事件
            setupHlsEventListeners(hls);
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
            setupNativeEventListeners();
        } else {
            handleError('您的浏览器不支持播放此视频');
        }
    }

    // 设置HLS事件监听器
    function setupHlsEventListeners(hls) {
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            console.log('视频清单解析完成');
            videoTitleElement.textContent = decodeURIComponent(title); // 移除加载提示
            video.play().catch(e => console.log('自动播放失败:', e));
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
            console.log('HLS Error:', data);
            if (data.fatal) {
                handleHlsError(hls, data);
            }
        });

        // 添加缓冲进度监听
        hls.on(Hls.Events.FRAG_BUFFERED, function() {
            const buffered = video.buffered;
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                const duration = video.duration;
                console.log(`已缓冲: ${Math.round((bufferedEnd / duration) * 100)}%`);
            }
        });
    }

    // 设置原生视频事件监听器
    function setupNativeEventListeners() {
        video.addEventListener('loadedmetadata', function() {
            video.play().catch(e => console.log('自动播放失败:', e));
        });

        video.addEventListener('error', function(e) {
            handleError('视频加载失败: ' + e.message);
        });
    }

    // 处理HLS错误
    function handleHlsError(hls, data) {
        switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("网络错误，尝试恢复...");
                hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("媒体错误，尝试恢复...");
                hls.recoverMediaError();
                break;
            default:
                console.log("无法恢复的错误");
                hls.destroy();
                handleError('视频加载失败，请刷新页面重试');
                break;
        }
    }

    // 统一错误处理
    function handleError(message) {
        console.error(message);
        if (videoTitleElement) {
            videoTitleElement.textContent = message;
        }
    }

    // 添加视频质量自动调整
    video.addEventListener('waiting', function() {
        if (currentHls && currentHls.currentLevel > 0) {
            // 如果视频在缓冲，尝试降低质量
            currentHls.currentLevel = currentHls.currentLevel - 1;
        }
    });

    // 添加网络状态监听
    window.addEventListener('online', function() {
        if (currentHls) {
            currentHls.startLoad();
        }
    });

    // 初始化视频流
    initializeVideoStream();

    function renderEpisodes(episodes) {
        const episodeList = document.querySelector('.episode-grid');
        episodeList.innerHTML = ''; // 清空现有内容

        const episodeCount = parseInt(episodes, 10) || 0; // 如果没有有效数字，则默认为 0

        for (let index = 1; index <= episodeCount; index++) {
            const episodeItem = document.createElement('div');
            episodeItem.className = 'episode-item';
            episodeItem.textContent = `第 ${index} 集`; // 显示集数
            episodeList.appendChild(episodeItem);
        }
    }
});
