document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('videoPlayer');
    const videoLoading = document.querySelector('.video-loading');
    const durationSpan = document.querySelector('.duration');
    const qualitySpan = document.querySelector('.quality');
    const bufferedSpan = document.querySelector('.buffered');
    const speedBtn = document.getElementById('playbackSpeedBtn');
    const speedMenu = document.getElementById('speedMenu');
    const qualityBtn = document.getElementById('qualityBtn');
    const qualityMenu = document.getElementById('qualityMenu');
    const collectBtn = document.getElementById('collectBtn');
    let currentHls = null;

    // 获取 URL 中的参数
    const urlParams = new URLSearchParams(window.location.search);
    const uid = urlParams.get('uid');
    const encodedTitle = urlParams.get('title');
    const img = urlParams.get('img');
    
    // 解码标题
    const title = encodedTitle ? decodeURIComponent(atob(encodedTitle)) : '';

    // 消息提示功能
    const message = {
        container: null,
        
        // 创建消息容器
        createContainer() {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'message-container';
                document.body.appendChild(this.container);
            }
        },
        
        // 显示消息
        show(type, content) {
            this.createContainer();
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message message-${type}`;
            messageDiv.textContent = content;
            
            this.container.appendChild(messageDiv);
            
            // 2秒后自动移除
            setTimeout(() => {
                messageDiv.classList.add('fade-out');
                setTimeout(() => {
                    this.container.removeChild(messageDiv);
                }, 300);
            }, 2000);
        },
        
        // 成功消息
        success(content) {
            this.show('success', content);
        },
        
        // 错误消息
        error(content) {
            this.show('error', content);
        },
        
        // 警告消息
        warning(content) {
            this.show('warning', content);
        }
    };

    // 获取用户 token
    function getUserToken() {
        try {
            const cookies = document.cookie.split(';');
            const userDataCookie = cookies.find(c => c.trim().startsWith('userData='));
            if (!userDataCookie) {
                return null;
            }
            
            const encodedData = userDataCookie.split('=')[1].trim();
            const decodedData = decodeURIComponent(atob(encodedData));
            const userData = JSON.parse(decodedData);
            
            return userData.token;
        } catch (e) {
            console.error('解析用户数据失败:', e);
            return null;
        }
    }

    // 检查用户登录状态
    function checkLoginStatus() {
        const token = getUserToken();
        if (!token) {
            return false;
        }
        return true;
    }

    // 检查视频是否已收藏
    async function checkIsCollected() {
        try {
            const token = getUserToken();
            if (!token) return false;

            const response = await fetch(`/api/check-vod-collect?uid=${uid}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const result = await response.json();
            
            // 更新收藏按钮状态
            updateCollectButtonState(result.isCollected);
            return result.isCollected;
        } catch (error) {
            console.error('检查收藏状态失败:', error);
            return false;
        }
    }

    // 更新收藏按钮状态
    function updateCollectButtonState(isCollected) {
        if (isCollected) {
            collectBtn.classList.add('active');
            collectBtn.querySelector('i').className = 'fas fa-heart';
        } else {
            collectBtn.classList.remove('active');
            collectBtn.querySelector('i').className = 'far fa-heart';
        }
    }

    // 处理收藏/取消收藏
    async function handleCollect() {
        if (!checkLoginStatus()) {
            message.error('请先登录');
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            return;
        }
        
        const token = getUserToken();
        const isCollected = collectBtn.classList.contains('active');
        
        try {
            const response = await fetch('/api/vod_collect', {
                method: isCollected ? 'DELETE' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    uid: uid,
                    title: title,
                    img: decodeURIComponent(img)
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                updateCollectButtonState(!isCollected);
                message.success(isCollected ? '已取消收藏' : '收藏成功');
            } else {
                if (result.message === '请先登录' || result.message === '无效的token') {
                    message.error('请重新登录');
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 1500);
                } else {
                    message.error(result.message || '操作失败');
                }
            }
        } catch (error) {
            console.error('收藏操作失败:', error);
            message.error('操作失败，请稍后重试');
        }
    }

    // 添加收藏按钮点击事件
    if (collectBtn) {
        collectBtn.addEventListener('click', handleCollect);
    }

    // 设置视频标题
    const videoTitleElement = document.querySelector('.video-title');
    if (videoTitleElement && title) {
        videoTitleElement.textContent = title;
    }

    // 基础HLS配置
    const hlsConfig = {
        debug: false,
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        xhrSetup: function(xhr, url) {
            xhr.withCredentials = false;
        }
    };

    // 初始化播放器
    async function initializeVideoStream() {
        try {
            const response = await fetch(`/api/vod-stream?vid=${uid}`);
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

    function initializePlayer(videoUrl) {
        if (Hls.isSupported()) {
            if (currentHls) {
                currentHls.destroy();
            }

            const hls = new Hls(hlsConfig);
            currentHls = hls;

            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            setupHlsEventListeners(hls);
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
            setupNativeEventListeners();
        } else {
            handleError('您的浏览器不支持播放此视频');
        }
    }

    function setupHlsEventListeners(hls) {
        hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
            console.log('视频清单解析完成');
            videoLoading.style.display = 'none';
            video.play().catch(e => console.log('自动播放失败:', e));

            // 更新质量选项
            updateQualityLevels(hls.levels);
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
            console.log('HLS Error:', data);
            if (data.fatal) {
                handleHlsError(hls, data);
            }
        });

        hls.on(Hls.Events.FRAG_BUFFERED, function() {
            updateBufferProgress();
        });

        // 监听质量切换
        hls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
            const currentLevel = hls.levels[data.level];
            if (currentLevel) {
                qualitySpan.textContent = `${currentLevel.height}p`;
            }
        });
    }

    function setupNativeEventListeners() {
        video.addEventListener('loadedmetadata', function() {
            videoLoading.style.display = 'none';
            video.play().catch(e => console.log('自动播放失败:', e));
        });

        video.addEventListener('error', function(e) {
            handleError('视频加载失败: ' + e.message);
        });
    }

    function handleHlsError(hls, data) {
        switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("致命网络错误，尝试恢复...");
                setTimeout(() => {
                    hls.startLoad();
                }, 1000);
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("致命媒体错误，尝试恢复...");
                setTimeout(() => {
                    hls.recoverMediaError();
                }, 1000);
                break;
            default:
                console.log("无法恢复的错误，重新加载播放器...");
                hls.destroy();
                setTimeout(() => {
                    initializeVideoStream();
                }, 2000);
                break;
        }
    }

    function handleError(message) {
        console.error(message);
        if (videoTitleElement) {
            videoTitleElement.textContent = message;
        }
        videoLoading.style.display = 'none';
    }

    // 更新缓冲进度
    function updateBufferProgress() {
        if (video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const duration = video.duration;
            const progress = Math.round((bufferedEnd / duration) * 100);
            bufferedSpan.textContent = `${progress}%`;
        }
    }

    // 更新视频时长
    video.addEventListener('loadedmetadata', function() {
        const minutes = Math.floor(video.duration / 60);
        const seconds = Math.floor(video.duration % 60);
        durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    // 播放速度控制
    speedBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        speedMenu.classList.toggle('show');
        qualityMenu.classList.remove('show');
    });

    document.querySelectorAll('.speed-option').forEach(option => {
        option.addEventListener('click', function() {
            const speed = parseFloat(this.dataset.speed);
            video.playbackRate = speed;
            speedBtn.querySelector('span').textContent = `${speed}x`;
            document.querySelectorAll('.speed-option').forEach(opt => {
                opt.classList.remove('active');
            });
            this.classList.add('active');
            speedMenu.classList.remove('show');
        });
    });

    // 质量控制
    qualityBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        qualityMenu.classList.toggle('show');
        speedMenu.classList.remove('show');
    });

    function updateQualityLevels(levels) {
        const qualityMenu = document.getElementById('qualityMenu');
        qualityMenu.innerHTML = '<div class="quality-option active" data-quality="-1">自动</div>';
        
        levels.forEach((level, index) => {
            const option = document.createElement('div');
            option.className = 'quality-option';
            option.dataset.quality = index;
            option.textContent = `${level.height}p`;
            option.addEventListener('click', () => {
                if (currentHls) {
                    currentHls.currentLevel = parseInt(option.dataset.quality);
                    document.querySelectorAll('.quality-option').forEach(opt => {
                        opt.classList.remove('active');
                    });
                    option.classList.add('active');
                    qualitySpan.textContent = option.textContent;
                    qualityMenu.classList.remove('show');
                }
            });
            qualityMenu.appendChild(option);
        });
    }

    // 点击外部关闭菜单
    document.addEventListener('click', function() {
        speedMenu.classList.remove('show');
        qualityMenu.classList.remove('show');
    });

    // 初始化时检查收藏状态
    checkIsCollected();
    
    // 初始化
    initializeVideoStream();
});
