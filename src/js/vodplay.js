document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('videoPlayer');

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

    // 获取视频流地址，添加 manga_type 参数
    fetch(`/api/vod-stream?vid=${vid}&manga_type=${manga_type}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.base_url) {
                initializePlayer(data.data.base_url);
            } else {
                console.error('获取视频流失败:', data.message);
                // 显示错误信息给用户
                if (videoTitleElement) {
                    videoTitleElement.textContent = `加载失败: ${data.message}`;
                }
            }
        })
        .catch(error => {
            console.error('请求视频流接口失败:', error);
            // 显示错误信息给用户
            if (videoTitleElement) {
                videoTitleElement.textContent = '视频加载失败，请稍后重试';
            }
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
            const hlsConfig = {
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                xhrSetup: function(xhr, url) {
                    xhr.withCredentials = false; // 禁用 withCredentials
                },
                cors: true // 启用 CORS
            };

            const hls = new Hls(hlsConfig);
            
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('视频清单解析完成');
                video.play().catch(e => console.log('自动播放失败:', e));
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                console.log('HLS Error:', data);
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
                            if (videoTitleElement) {
                                videoTitleElement.textContent = '视频加载失败，请刷新页面重试';
                            }
                            break;
                    }
                }
            });
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
        } else {
            if (videoTitleElement) {
                videoTitleElement.textContent = '您的浏览器不支持播放此视频';
            }
        }
    }
});
