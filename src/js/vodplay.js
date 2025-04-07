document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('videoPlayer');

    // 获取 URL 中的参数
    const urlParams = new URLSearchParams(window.location.search);
    const episodes = urlParams.get('episodes');
    const title = urlParams.get('title'); // 获取 title 参数
    const vid = urlParams.get('vid');

    // 渲染集数
    renderEpisodes(episodes);

    // 设置视频标题
    const videoTitleElement = document.querySelector('.video-title');
    if (videoTitleElement) {
        videoTitleElement.textContent = decodeURIComponent(title); // 解码并设置标题
    }

    // 首先获取视频流地址
    fetch(`/api/vod-stream?vid=${vid}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.base_url) {
                initializePlayer(data.data.base_url);
            } else {
                console.error('获取视频流失败:', data.message);
            }
        })
        .catch(error => {
            console.error('请求视频流接口失败:', error);
        });

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

    function initializePlayer(videoUrl) {
        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
            });
            console.log(videoUrl)
            console.log(video)
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('视频清单解析完成');
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
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
                            break;
                    }
                }
            });
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
        }
    }
});
