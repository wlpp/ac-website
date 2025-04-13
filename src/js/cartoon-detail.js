// 漫画全屏预览页面JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // 先获取DOM元素并检查
    checkDOMElements();
    
    // 检查重要DOM元素是否存在
    function checkDOMElements() {
        const elementIds = [
            'viewer-content', 'manga-title', 'page-info', 
            'prev-button', 'next-button', 'fullscreen-button'
        ];
        
        let allFound = true;
        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`找不到DOM元素: #${id}`);
                allFound = false;
            }
        });
        
        if (!allFound) {
            console.error('部分DOM元素未找到，可能会导致功能异常');
        }
    }
    
    // 获取当前漫画ID
    const currentPath = window.location.pathname;
    const pidMatch = /\/cartoon\/detail\/(.+)/.exec(currentPath);
    const pid = pidMatch ? pidMatch[1] : null;
    
    if (!pid) {
        showError('未找到漫画ID，请返回列表页重新选择');
        return;
    }
    
    // DOM元素引用
    const viewerContent = document.getElementById('viewer-content');
    const mangaTitle = document.getElementById('manga-title');
    const pageInfo = document.getElementById('page-info');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    const fullscreenButton = document.getElementById('fullscreen-button');
    const infoPanel = document.getElementById('info-panel');
    const infoPanelBody = document.getElementById('info-panel-body');
    const closeInfoButton = document.getElementById('close-info-button');
    const gestureHint = document.getElementById('gesture-hint');
    const chapterListButton = document.getElementById('chapter-list-button');
    const chapterSidebar = document.getElementById('chapter-sidebar');
    const closeSidebarButton = document.getElementById('close-sidebar-button');
    const chapterList = document.getElementById('chapter-list');
    
    // 状态变量
    let mangaData = null;          // 漫画数据
    let currentImageIndex = 0;     // 当前图片索引
    let images = [];               // 图片URL数组
    let loadedImages = {};         // 已加载图片缓存
    let isFullscreen = false;      // 是否全屏
    let isZoomed = false;          // 是否放大
    let controlsVisible = true;    // 控制栏是否可见 - 默认显示
    let controlsTimer = null;      // 控制栏隐藏定时器
    let touchStartX = 0;           // 触摸开始X坐标
    let touchStartY = 0;           // 触摸开始Y坐标
    let chapterSeries = [];        // 章节系列数组
    let currentChapterIndex = -1;  // 当前章节索引
    let lastNavTime = 0;           // 上次导航时间
    let navDebounceTime = 500;     // 导航防抖间隔(毫秒)
    let imageCache = new Map();    // 图片缓存
    let preloadController = null;  // 预加载控制器
    
    // 显示加载状态
    function showLoading() {
        viewerContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">正在加载漫画...</div>
            </div>
        `;
    }
    
    // 显示错误信息
    function showError(message) {
        viewerContent.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                <a href="/cartoon" class="retry-button">返回列表</a>
            </div>
        `;
    }
    
    // 加载漫画详情
    async function loadMangaDetail() {
        showLoading();
        
        try {
            // 先加载章节列表
            console.log('[DEBUG] 先加载章节列表');
            await loadChapterList();
            
            // 如果章节列表加载成功且有章节，使用第一个章节的cid
            if (chapterSeries && chapterSeries.length > 0) {
                const firstChapterId = chapterSeries[0].id;
                console.log(`[DEBUG] 使用第一个章节的cid: ${firstChapterId}`);
                
                // 加载第一个章节的内容
                await loadChapterContent(firstChapterId);
            } else {
                // 如果没有章节，使用URL中的ID作为备选
                console.log(`[DEBUG] 没有章节列表，使用URL中的ID: ${pid}`);
                const response = await fetch(`/api/cartoon-hans/detail?cid=${pid}`);
                if (!response.ok) throw new Error('网络请求失败');
                
                const data = await response.json();
                console.log('API响应数据:', data);
                
                if (!data.success) throw new Error(data.message || '加载失败');
                if (!data.data) throw new Error('无效的数据格式');
                
                // 保存数据
                mangaData = data.data;
                images = mangaData.images || [];
                loadedImages = {}; // 重置已加载图片缓存
                
                // 更新标题
                mangaTitle.textContent = mangaData.title || '未知标题';
                
                // 只有有图片时才初始化图片界面
                if (images.length > 0) {
                    // 预加载初始几张图片
                    await preloadImages(images, 0, 5);
                    renderCurrentImage();
                    updateNavigationButtons();
                    
                    // 第一次访问时显示手势提示
                    if (!localStorage.getItem('gesture_hint_shown')) {
                        showGestureHint();
                        localStorage.setItem('gesture_hint_shown', 'true');
                    }
                } else {
                    // 显示没有图片的提示
                    viewerContent.innerHTML = `
                        <div class="error-message">
                            <div class="error-icon">⚠️</div>
                            <div class="error-text">没有找到任何图片</div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('加载漫画详情失败:', error);
            showError(`加载失败: ${error.message || '未知错误'}`);
            
            // 尝试加载章节列表，即使详情加载失败
            try {
                if (!chapterSeries || chapterSeries.length === 0) {
                    await loadChapterList();
                }
            } catch (chapterError) {
                console.error('章节列表加载失败:', chapterError);
            }
        }
    }
    
    // 预加载图片 - 新增的高效预加载函数
    async function preloadImages(urls, initialLoadCount = 3) {
        // 如果存在之前的预加载，取消它
        if (preloadController) {
            preloadController.abort();
        }
        
        // 创建新的 AbortController
        preloadController = new AbortController();
        const signal = preloadController.signal;
        
        // 设置固定的预加载间隔时间 - 0.5秒/张
        const PRELOAD_DELAY = 500;
        
        // 分批预加载: 先加载当前图片和前后几张
        const initialUrls = getCurrentAndNearbyImages(urls, currentImageIndex, initialLoadCount);
        const remainingUrls = urls.filter(url => !initialUrls.includes(url));
        
        // 先加载关键图片（当前图片及其前后几张）
        for (const url of initialUrls) {
            if (signal.aborted) {
                break;
            }
            
            // 跳过已缓存的图片
            if (imageCache.has(url)) {
                continue;
            }
            
            try {
                await loadSingleImage(url);
                
                // 检查是否已取消预加载
                if (signal.aborted) {
                    break;
                }
                
                // 固定延迟0.5秒
                await new Promise(resolve => setTimeout(resolve, PRELOAD_DELAY));
            } catch (error) {
                if (!signal.aborted) {
                    console.error('[预加载] 图片预加载失败:', error);
                }
            }
        }
        
        if (!signal.aborted) {
            // 后台加载剩余图片
            if (remainingUrls.length > 0) {
                setTimeout(async () => {
                    let loadedCount = 0;
                    for (const url of remainingUrls) {
                        if (signal.aborted) {
                            break;
                        }
                        
                        // 跳过已缓存的图片
                        if (imageCache.has(url)) {
                            continue;
                        }
                        
                        try {
                            await loadSingleImage(url);
                            loadedCount++;
                            
                            // 检查是否已取消预加载
                            if (signal.aborted) {
                                break;
                            }
                            
                            // 固定延迟0.5秒
                            await new Promise(resolve => setTimeout(resolve, PRELOAD_DELAY));
                        } catch (error) {
                            if (!signal.aborted) {
                                console.error('[预加载] 后台图片预加载失败:', error);
                            }
                        }
                    }
                }, 1000); // 延迟1秒后开始加载剩余图片
            }
        }
    }
    
    // 获取当前图片和附近的几张图片
    function getCurrentAndNearbyImages(urls, currentIndex, count) {
        if (!urls || urls.length === 0) return [];
        
        const result = [];
        // 添加当前图片
        result.push(urls[currentIndex]);
        
        // 添加后面的图片
        for (let i = 1; i <= count; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < urls.length) {
                result.push(urls[nextIndex]);
            }
        }
        
        // 添加前面的图片
        for (let i = 1; i <= count; i++) {
            const prevIndex = currentIndex - i;
            if (prevIndex >= 0) {
                result.push(urls[prevIndex]);
            }
        }
        
        return result;
    }
    
    // 加载单张图片并返回Promise
    function loadSingleImage(url) {
        return new Promise((resolve, reject) => {
            // 如果图片已经缓存，直接返回
            if (imageCache.has(url)) {
                resolve();
                return;
            }
            
            const img = new Image();
            
            img.onload = () => {
                imageCache.set(url, img);
                resolve();
            };
            
            img.onerror = (error) => {
                console.error('[预加载] 图片加载失败:', error);
                reject(error);
            };
            
            img.src = url;
        });
    }
    
    // 渲染当前图片 - 优化版
    function renderCurrentImage() {
        if (!images || images.length === 0 || currentImageIndex < 0 || currentImageIndex >= images.length) {
            console.error('[渲染] 无法渲染图片: 无效的图片数据或索引');
            return;
        }
        
        const currentUrl = images[currentImageIndex];
        
        // 更新页码信息
        pageInfo.textContent = `${currentImageIndex + 1} / ${images.length}`;
        
        // 显示加载状态
        viewerContent.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">加载图片中 (${currentImageIndex + 1}/${images.length})...</div>
            </div>
        `;
        
        // 尝试从缓存中获取图片
        if (imageCache.has(currentUrl)) {
            const cachedImg = imageCache.get(currentUrl);
            
            // 创建新的图片元素以确保事件处理器被正确设置
            const img = new Image();
            img.id = 'current-image';
            img.className = 'manga-image-viewer';
            img.alt = `${mangaData?.title || '漫画'} - 第${currentImageIndex + 1}页`;
            img.src = cachedImg.src;
            
            // 立即显示图片（因为已经预加载了）
            viewerContent.innerHTML = '';
            viewerContent.appendChild(img);
            
            // 绑定图片事件
            img.addEventListener('click', handleImageClick);
            img.addEventListener('dblclick', handleImageDoubleClick);
            
            // 预加载下一批图片
            preloadNextBatch();
            
            return;
        }
        
        // 如果缓存中没有，则加载图片
        const img = new Image();
        img.id = 'current-image';
        img.className = 'manga-image-viewer';
        img.alt = `${mangaData?.title || '漫画'} - 第${currentImageIndex + 1}页`;
        
        // 加载成功回调
        img.onload = function() {
            // 清空内容并添加图片
            viewerContent.innerHTML = '';
            viewerContent.appendChild(img);
            
            // 将加载的图片加入缓存
            imageCache.set(currentUrl, img);
            
            // 绑定图片事件
            img.addEventListener('click', handleImageClick);
            img.addEventListener('dblclick', handleImageDoubleClick);
            
            // 预加载下一批图片
            preloadNextBatch();
        };
        
        // 加载失败回调
        img.onerror = function() {
            console.error(`[渲染] 图片加载失败: ${currentUrl}`);
            viewerContent.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">图片加载失败</div>
                    <button class="retry-button" id="retry-image-btn">重试</button>
                </div>
            `;
            
            document.getElementById('retry-image-btn').addEventListener('click', renderCurrentImage);
        };
        
        // 开始加载图片
        img.src = currentUrl;
    }
    
    // 预加载下一批图片
    function preloadNextBatch() {
        // 当前位置及后续几张图的预加载（优先加载用户可能马上要看的图片）
        const nextBatchSize = 5; // 预加载后面5张和前面2张
        const startIndex = Math.max(0, currentImageIndex - 2);
        const endIndex = Math.min(images.length - 1, currentImageIndex + nextBatchSize);
        
        const imagesToPreload = [];
        for (let i = startIndex; i <= endIndex; i++) {
            // 跳过当前已显示的图片
            if (i !== currentImageIndex) {
                imagesToPreload.push(images[i]);
            }
        }
        
        if (imagesToPreload.length === 0) return;
        
        // 设置固定的预加载间隔时间 - 0.5秒/张
        const PRELOAD_DELAY = 500;
        
        // 逐个加载图片，确保每张图片间隔0.5秒
        (async () => {
            for (let i = 0; i < imagesToPreload.length; i++) {
                const url = imagesToPreload[i];
                // 如果图片已缓存，跳过
                if (imageCache.has(url)) continue;
                
                try {
                    await loadSingleImage(url);
                    // 加载下一张前等待0.5秒
                    if (i < imagesToPreload.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, PRELOAD_DELAY));
                    }
                } catch (err) {
                    console.warn('[预加载批次] 单张图片加载失败:', err);
                }
            }
        })();
    }
    
    // 切换到上一张图片，简化版
    function prevImage() {
        // 不能向前，已经是第一张
        if (currentImageIndex <= 0) {
            return false;
        }

        // 只减1
        currentImageIndex--;
        
        // 更新UI
        updateNavigationButtons();
        renderCurrentImage();
        return true;
    }
    
    // 切换到下一张图片，简化版
    function nextImage() {
        // 不能向后，已经是最后一张
        if (currentImageIndex >= images.length - 1) {
            return false;
        }

        // 只加1
        currentImageIndex++;
        
        // 更新UI
        updateNavigationButtons();
        renderCurrentImage();
        return true;
    }
    
    // 更新导航按钮状态
    function updateNavigationButtons() {
        prevButton.disabled = currentImageIndex === 0;
        nextButton.disabled = currentImageIndex >= images.length - 1;
    }
    
    // 加载章节列表
    async function loadChapterList() {
        try {
            chapterList.innerHTML = '<div class="chapter-loading">正在加载章节...</div>';
            
            const response = await fetch(`/api/cartoon-diversity?pid=${pid}`);
            
            if (!response.ok) {
                console.error('HTTP错误详情:', await response.text());
                throw new Error(`HTTP错误 ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.success || !data.data) {
                throw new Error('接口返回数据格式错误');
            }
            
            // 转换数据结构 - 确保正确处理diversityList中的对象结构
            chapterSeries = data.data.diversityList.map((chapter, index) => ({
                id: chapter.cid,  // 使用chapter对象中的cid字段
                title: chapter.diversity,  // 使用chapter对象中的diversity字段
                isCurrentChapter: index === 0
            }));
            
            renderChapterList();
            
        } catch (error) {
            console.error('[ERROR] 章节加载异常:', error);
            // 显示错误提示
            chapterList.innerHTML = `
                <div class="chapter-error">
                    加载失败: ${error.message || '未知错误'}
                    <button id="retry-chapter-btn">重试</button>
                </div>
            `;
            
            // 添加事件监听
            document.getElementById('retry-chapter-btn').addEventListener('click', loadChapterList);
        }
    }
    
    // 更新章节项点击处理
    function renderChapterList() {
        if (!chapterSeries || chapterSeries.length === 0) {
            chapterList.innerHTML = '<div class="chapter-error">没有找到章节数据</div>';
            return;
        }
        
        let chaptersHTML = '';
        chapterSeries.forEach((chapter, index) => {
            chaptersHTML += `
                <div class="chapter-item ${chapter.isCurrentChapter ? 'active' : ''}" 
                     data-id="${chapter.id}" 
                     data-index="${index}">
                    <div class="chapter-title">${chapter.title}</div>
                </div>
            `;
        });
        
        chapterList.innerHTML = chaptersHTML;

        // 更新点击事件处理
        const chapterItems = document.querySelectorAll('.chapter-item');
        chapterItems.forEach(item => {
            item.addEventListener('click', function() {
                const chapterId = this.dataset.id;
                const chapterIndex = parseInt(this.dataset.index);
                
                if (!chapterId) {
                    console.error('章节ID不存在');
                    return;
                }
                
                // 更新当前章节状态
                chapterSeries.forEach((ch, idx) => {
                    ch.isCurrentChapter = (idx === chapterIndex);
                });
                
                // 更新UI中的活动章节
                document.querySelectorAll('.chapter-item').forEach(elem => {
                    elem.classList.remove('active');
                });
                this.classList.add('active');
                
                // 加载新章节内容
                loadChapterContent(chapterId);
                
                // 关闭侧边栏
                toggleChapterSidebar();
            });
        });
    }
    
    // 加载章节内容 - 高效预加载版
    async function loadChapterContent(chapterId) {
        if (!chapterId) {
            console.error('加载章节内容失败: 无效的章节ID');
            showError('无法加载章节: 无效的章节ID');
            return;
        }
        
        showLoading();
        
        try {
            // 添加超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
            
            const response = await fetch(`/api/cartoon-hans/detail?cid=${chapterId}`, {
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));
            
            if (!response.ok) {
                console.error(`[章节] 网络请求失败，状态码: ${response.status}`);
                throw new Error(`网络请求失败 (${response.status})`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                console.error('[章节] API返回错误:', data.message);
                throw new Error(data.message || '加载失败');
            }
            
            if (!data.data) {
                console.error('[章节] API返回数据格式无效');
                throw new Error('无效的数据格式');
            }
            
            if (!Array.isArray(data.data.images) || data.data.images.length === 0) {
                console.warn('[章节] 章节没有图片');
                viewerContent.innerHTML = `
                    <div class="error-message">
                        <div class="error-icon">⚠️</div>
                        <div class="error-text">该章节没有图片内容</div>
                        <button class="retry-button" id="retry-chapter-btn">重试</button>
                    </div>
                `;
                document.getElementById('retry-chapter-btn').addEventListener('click', () => loadChapterContent(chapterId));
                return;
            }
            
            // 更新漫画数据
            mangaData = data.data;
            images = mangaData.images || [];
            
            // 重置所有状态
            currentImageIndex = 0;
            
            // 更新标题
            mangaTitle.textContent = mangaData.title || '未知标题';
            
            // 开始预加载图片 - 使用新的高效预加载
            if (images.length > 0) {
                // 先预加载前几张关键图片以快速显示内容
                try {
                    // 初始预加载批次较小，以快速显示首张图片
                    await preloadImages(images, 2);
                    
                    // 更新导航按钮状态
                    updateNavigationButtons();
                    
                    // 渲染第一张图片
                    renderCurrentImage();
                } catch (loadError) {
                    console.error('[章节] 预加载初始图片失败:', loadError);
                    // 即使预加载失败仍尝试渲染第一张图片
                    renderCurrentImage();
                }
            } else {
                // 显示没有图片的提示
                viewerContent.innerHTML = `
                    <div class="error-message">
                        <div class="error-icon">⚠️</div>
                        <div class="error-text">没有找到任何图片</div>
                    </div>
                `;
                pageInfo.textContent = `0 / 0`;
            }
        } catch (error) {
            console.error('[章节] 加载章节内容失败:', error);
            
            // 区分网络错误和其他错误
            let errorMessage = error.message || '未知错误';
            if (error.name === 'AbortError') {
                errorMessage = '请求超时，请检查网络连接';
            } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                errorMessage = '网络连接失败，请检查您的网络';
            }
            
            showError(`加载失败: ${errorMessage}`);
            
            // 添加重试按钮
            const errorElement = viewerContent.querySelector('.error-message');
            if (errorElement) {
                const retryBtn = document.createElement('button');
                retryBtn.className = 'retry-button';
                retryBtn.textContent = '重试';
                retryBtn.addEventListener('click', () => loadChapterContent(chapterId));
                errorElement.appendChild(retryBtn);
            }
        }
    }
    
    // 显示手势提示
    function showGestureHint() {
        gestureHint.classList.add('active');
        
        setTimeout(() => {
            gestureHint.classList.remove('active');
        }, 5000);
    }
    
    // 显示漫画信息面板
    function showInfoPanel() {
        if (!mangaData) return;
        
        const tagsHTML = mangaData.tags && mangaData.tags.length > 0 
            ? mangaData.tags.map(tag => `<span class="manga-tag">${tag}</span>`).join('')
            : '<span class="manga-tag">暂无标签</span>';
            
        infoPanelBody.innerHTML = `
            <div class="manga-info-wrapper">
                <div class="manga-cover-large">
                    <img src="${images[0] || ''}" alt="${mangaData.title}" loading="lazy">
                </div>
                <div class="manga-details">
                    <h1 class="manga-title-large">${mangaData.title || '未知标题'}</h1>
                    <div class="manga-author">${mangaData.author || '未知作者'}</div>
                    <div class="manga-description">${mangaData.description || '暂无简介'}</div>
                    <div class="manga-tags">${tagsHTML}</div>
                </div>
            </div>
        `;
        
        infoPanel.classList.add('active');
    }
    
    // 处理全屏切换
    function toggleFullscreen() {
        if (!isFullscreen) {
            // 进入全屏
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) {
                document.documentElement.msRequestFullscreen();
            }
        } else {
            // 退出全屏
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    // 放大/缩小图片
    function toggleZoom(clientX, clientY) {
        isZoomed = !isZoomed;
        const image = document.getElementById('current-image');
        
        if (!image) return;
        
        if (isZoomed) {
            // 放大图片
            viewerContent.classList.add('zoomed');
            
            // 计算缩放比例和位置
            const naturalWidth = image.naturalWidth;
            const naturalHeight = image.naturalHeight;
            const viewWidth = viewerContent.clientWidth;
            const viewHeight = viewerContent.clientHeight;
            
            // 如果图片原始尺寸小于视图尺寸，不需要放大
            if (naturalWidth <= viewWidth && naturalHeight <= viewHeight) {
                isZoomed = false;
                viewerContent.classList.remove('zoomed');
                return;
            }
            
            // 计算放大比例（最大放大到原始大小）
            const scale = Math.min(2, Math.max(naturalWidth / viewWidth, naturalHeight / viewHeight));
            
            // 计算点击位置相对于图片的比例
            const rect = image.getBoundingClientRect();
            const relX = (clientX - rect.left) / rect.width;
            const relY = (clientY - rect.top) / rect.height;
            
            // 计算平移位置
            const translateX = (viewWidth / 2 - relX * naturalWidth) * (1/scale);
            const translateY = (viewHeight / 2 - relY * naturalHeight) * (1/scale);
            
            // 应用变换
            image.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
            
        } else {
            // 恢复原始大小
            viewerContent.classList.remove('zoomed');
            image.style.transform = 'none';
        }
    }
    
    // 绑定事件处理
    function setupEventHandlers() {
        // 直接绑定上一张/下一张按钮
        prevButton.onclick = function() {
            console.log('[按钮] 直接绑定 - 点击了"上一张"按钮');
            prevImage();
        };
        
        nextButton.onclick = function() {
            console.log('[按钮] 直接绑定 - 点击了"下一张"按钮');
            nextImage();
        };
        
        // 全屏按钮
        fullscreenButton.addEventListener('click', toggleFullscreen);
        
        // 章节列表按钮
        chapterListButton.addEventListener('click', toggleChapterSidebar);
        
        // 关闭侧边栏按钮
        closeSidebarButton.addEventListener('click', toggleChapterSidebar);
        
        // 关闭信息面板
        closeInfoButton.addEventListener('click', () => {
            infoPanel.classList.remove('active');
        });
        
        // 页面点击显示/隐藏控制栏
        viewerContent.addEventListener('click', handleImageClick);
        
        // 监听全屏状态变化
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
        
        // 键盘控制
        document.addEventListener('keydown', handleKeyDown);
        
        // 触摸手势支持
        viewerContent.addEventListener('touchstart', handleTouchStart, {passive: true});
        viewerContent.addEventListener('touchmove', handleTouchMove, {passive: true});
        viewerContent.addEventListener('touchend', handleTouchEnd);
        
        // 标题点击显示信息面板
        mangaTitle.addEventListener('click', showInfoPanel);
    }
    
    // 处理图片点击
    function handleImageClick(event) {
        // 如果点击事件是由双击触发的，不处理
        if (event.detail > 1) return;
        
        // 不再切换控制栏的显示/隐藏
        // 只有在放大模式时才处理
        if (isZoomed) {
            toggleZoom(event.clientX, event.clientY);
        }
    }
    
    // 处理图片双击
    function handleImageDoubleClick(event) {
        event.preventDefault();
        toggleZoom(event.clientX, event.clientY);
    }
    
    // 处理全屏状态变化
    function handleFullscreenChange() {
        isFullscreen = !!(
            document.fullscreenElement ||
            document.mozFullScreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
        );
    }
    
    // 处理键盘事件 - 使用新的导航控制
    function handleKeyDown(event) {
        // 忽略某些元素上的键盘事件
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch(event.key) {
            case 'ArrowLeft':
                prevImage(); // 使用更新的prevImage函数
                break;
            case 'ArrowRight':
                nextImage(); // 使用更新的nextImage函数
                break;
            case 'Escape':
                if (chapterSidebar.classList.contains('active')) {
                    toggleChapterSidebar();
                } else if (infoPanel.classList.contains('active')) {
                    infoPanel.classList.remove('active');
                } else if (isZoomed) {
                    isZoomed = false;
                    const image = document.getElementById('current-image');
                    if (image) {
                        viewerContent.classList.remove('zoomed');
                        image.style.transform = 'none';
                    }
                }
                break;
            case 'f':
                toggleFullscreen();
                break;
            case 'i':
                showInfoPanel();
                break;
            case 'c':
                toggleChapterSidebar();
                break;
        }
    }
    
    // 处理触摸开始
    function handleTouchStart(event) {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }
    
    // 处理触摸移动
    function handleTouchMove(event) {
        if (isZoomed) return; // 如果已放大，不进行滑动切换
    }
    
    // 处理触摸结束 - 使用新的导航控制
    function handleTouchEnd(event) {
        if (isZoomed) return; // 如果已放大，不进行滑动切换
        
        const touch = event.changedTouches[0];
        const touchEndX = touch.clientX;
        const touchEndY = touch.clientY;
        
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        // 判断是水平滑动还是垂直滑动
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 水平滑动
            if (Math.abs(deltaX) > 50) { // 至少滑动50px才触发
                if (deltaX > 0) {
                    // 向右滑动，显示上一张
                    prevImage(); // 使用更新的prevImage函数
                } else {
                    // 向左滑动，显示下一张
                    nextImage(); // 使用更新的nextImage函数
                }
            }
        }
    }
    
    // 显示/隐藏控制栏
    function toggleControls(show) {
        if (controlsTimer) {
            clearTimeout(controlsTimer);
            controlsTimer = null;
        }
        
        if (show === undefined) {
            controlsVisible = !controlsVisible;
        } else {
            controlsVisible = show;
        }
        
        if (controlsVisible) {
            document.body.classList.remove('controls-hidden');
        } else {
            document.body.classList.add('controls-hidden');
        }
    }
    
    // 显示/隐藏章节列表侧边栏
    function toggleChapterSidebar() {
        chapterSidebar.classList.toggle('active');
        // 如果打开侧边栏，确保控制栏可见
        if (chapterSidebar.classList.contains('active')) {
            toggleControls(true);
        }
    }
    
    // 强制绑定导航按钮
    document.getElementById('prev-button').onclick = function() {
        prevImage();
        return false; // 阻止事件冒泡
    };
    
    document.getElementById('next-button').onclick = function() {
        nextImage();
        return false; // 阻止事件冒泡
    };
    
    // 加载内容
    loadMangaDetail().then(() => {
        // 内容加载完成后最后一步再绑定事件
        setupEventHandlers();
    }).catch(error => {
        console.error('初始化过程出错:', error);
    });
}); 