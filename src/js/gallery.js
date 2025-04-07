     // 添加图片数据（包含标题）
     const imageData = [
        { url: '../images/loading.gif', title: '' },
    ];

    // 分页配置
    const pageConfig = {
        itemsPerPage: 20,
        currentPage: 1,
        total: 0
    };

    // 使用 imageData 中的 url 创建 demoImages 数组
    const demoImages = [
        '../images/login_bg.jpg',
    ];

    let currentIndex = 0;
    let currentSpeed = 2000; // 默认2秒
    let isPlaying = false;
    let playInterval;
    
    // 统一声明所有需要的DOM元素
    const gallery = document.getElementById('gallery');
    const currentImage = document.getElementById('current-image');
    const loading = document.querySelector('.loading');
    const imageCounter = document.getElementById('image-counter');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const autoPlayBtn = document.getElementById('auto-play');
    const imageModal = document.getElementById('image-modal');
    const searchModal = document.getElementById('search-modal');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResultList = document.getElementById('search-result-list');
    const showSearchBtn = document.getElementById('show-search');
    const closeSearchBtn = document.getElementById('close-search');
    const rotateScreenBtn = document.getElementById('rotate-screen');

    // 添加图片缓存对象
    const imageCache = new Map();

    // 添加取消预加载的控制器
    let preloadController = null;
    
    // 添加缓存任务管理
    const cacheTasks = new Map();
    const cacheListBtn = document.getElementById('cache-list-btn');
    const cacheListModal = document.getElementById('cache-list-modal');
    const cacheList = document.getElementById('cache-list');
    const closeCacheListBtn = document.getElementById('close-cache-list');

    // 更新图片计数器
    function updateCounter() {
        imageCounter.textContent = `${currentIndex + 1}/${demoImages.length}`;
    }

    // 加载图片
    async function loadImage(url) {
        // 如果图片已经缓存，直接使用
        if (imageCache.has(url)) {
            currentImage.src = url;
            return;
        }

        loading.style.display = 'block';
        
        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    // 加载成功后缓存图片
                    imageCache.set(url, img);
                    resolve();
                };
                img.onerror = reject;
                img.src = url;
            });
            
            currentImage.src = url;
        } catch (error) {
            console.error('图片加载失败:', error);
        } finally {
            loading.style.display = 'none';
        }
    }

    // 初始化图片
    function initImages() {
        const gallery = document.getElementById('gallery');
        const currentImage = document.getElementById('current-image');
        const loading = document.querySelector('.loading');

        if (demoImages.length > 0) {
            gallery.style.display = 'block';
            currentImage.src = demoImages[currentIndex];
            updateImageCounter();
            
            // 简化加载事件
            currentImage.onload = () => {
                loading.style.display = 'none';
            };
            
            currentImage.onerror = () => {
                console.error('图片加载失败');
                loading.style.display = 'none';
                currentImage.src = '../images/loading.gif';
            };
        }
    }

    // 切换到上一张图片
    function prevImage() {
        currentIndex = (currentIndex - 1 + demoImages.length) % demoImages.length;
        loadImage(demoImages[currentIndex]);
        updateCounter();
    }

    // 切换到下一张图片
    function nextImage() {
        currentIndex = (currentIndex + 1) % demoImages.length;
        loadImage(demoImages[currentIndex]);
        updateCounter();
    }

    // 自动播放图片
    function autoPlay(speed) {
        if (isPlaying) {
            stopAutoPlay();
            if (speed === currentSpeed) {
                return;
            }
        }
        
        currentSpeed = speed || currentSpeed;
        isPlaying = true;
        playInterval = setInterval(nextImage, currentSpeed);
        
        updateSpeedButtons();
        autoPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }

    // 停止自动播放图片
    function stopAutoPlay() {
        isPlaying = false;
        clearInterval(playInterval);
        autoPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    // 更新速度按钮状态
    function updateSpeedButtons() {
        document.querySelectorAll('.speed-btn').forEach(btn => {
            const btnSpeed = parseInt(btn.dataset.speed);
            btn.classList.toggle('active', btnSpeed === currentSpeed);
        });
    }

    // 事件监听
    prevBtn.addEventListener('click', prevImage);
    nextBtn.addEventListener('click', nextImage);
    autoPlayBtn.addEventListener('click', () => {
        if (isPlaying) {
            stopAutoPlay();
        } else {
            autoPlay();
        }
    });

    // 修改事件监听
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            const speed = parseInt(btn.dataset.speed);
            autoPlay(speed);
        });
    });

    // 修改页面加载事件，移除权限检查
    document.addEventListener('DOMContentLoaded', async () => {
        // 直接初始化图片，不进行权限检查
        initImages();
    });

    // 添加 cookie 处理函数
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                const encryptedData = c.substring(nameEQ.length, c.length);
                try {
                    // 解密并解析 cookie 数据
                    const decryptedData = decodeURIComponent(atob(encryptedData));
                    return JSON.parse(decryptedData);
                } catch (e) {
                    console.error('解析 cookie 失败:', e);
                    return null;
                }
            }
        }
        return null;
    }

    // 修改 API 请求函数
    async function fetchGalleryList(page = 1) {
        try {
            const response = await fetch(`${window.baseURL}/api/gallery-list?page=${page}`);
            const data = await response.json();
            
            if (data.success) {
                return data;
            }
            throw new Error(data.message || '获取数据失败');
        } catch (error) {
            console.error('获取图文列表失败:', error);
            return null;
        }
    }

    async function fetchGalleryImages(aid) {
        try {
            const response = await fetch(`${window.baseURL}/api/gallery-imgs?aid=${aid}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('获取画廊图片失败:', error);
            return null;
        }
    }

    async function fetchSearchResults(keyword, page = 1) {
        try {
            const response = await fetch(`${window.baseURL}/api/gallery-search?q=${encodeURIComponent(keyword)}&page=${page}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('搜索失败:', error);
            return null;
        }
    }

    // 添加加密解密工具函数
    function encrypt(text) {
        // 使用 Base64 进行基本加密
        return btoa(encodeURIComponent(text));
    }

    function decrypt(encoded) {
        try {
            // 解密 Base64 编码的字符串
            return decodeURIComponent(atob(encoded));
        } catch (e) {
            console.error('解密失败:', e);
            return null;
        }
    }

    // 添加获取用户 cookie 的函数
    function getUserCookie() {
        try {
            const nameEQ = "userData=";
            const ca = document.cookie.split(';');
            for(let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) === 0) {
                    const encryptedData = c.substring(nameEQ.length, c.length);
                    const decryptedData = decrypt(encryptedData);
                    return decryptedData ? JSON.parse(decryptedData) : null;
                }
            }
            return null;
        } catch (e) {
            console.error('获取 cookie 失败:', e);
            return null;
        }
    }

    // 权限检查函数
    function checkAdminAccess() {
        // 移除访问限制，始终返回true
        return true;
    }

    // 添加域名判断函数
    function getPreloadDelay() {
        const hostname = window.location.hostname;
        return hostname === 'acwlpp.top' ? 500 : 1000; // acwlpp.top 使用 0.5秒，其他使用 1秒
    }

    // 修改预加载函数
    async function preloadImages(urls, initialLoadCount = 5, taskId = null) {
        // 如果存在之前的预加载，且不是当前任务，则取消它
        if (preloadController && !taskId && !Array.from(cacheTasks.values()).some(task => task.status === 'ld')) {
            preloadController.abort();
        }
        
        // 创建新的 AbortController
        preloadController = new AbortController();
        const signal = preloadController.signal;

        const initialUrls = urls.slice(0, initialLoadCount);
        const remainingUrls = urls.slice(initialLoadCount);
        
        // 获取延迟时间
        const delay = getPreloadDelay();
        
        // 如果提供了任务ID，更新任务状态
        if (taskId) {
            updateCacheTaskStatus(taskId, {
                total: urls.length,
                completed: 0,
                status: 'ld'
            });
            showCacheListButton();
        }
        
        // 修改初始加载部分
        for (const url of initialUrls) {
            if (signal.aborted) {
                // 如果任务被中断，更新状态为已中断
                if (taskId) {
                    updateCacheTaskStatus(taskId, { status: 'cancelled' });
                }
                break;
            }

            if (imageCache.has(url)) {
                // 如果提供了任务ID，更新任务进度
                if (taskId) {
                    updateCacheTaskProgress(taskId);
                }
                continue;
            }
            
            try {
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        imageCache.set(url, img);
                        // 如果提供了任务ID，更新任务进度
                        if (taskId) {
                            updateCacheTaskProgress(taskId);
                        }
                        resolve(url);
                    };
                    img.onerror = reject;
                    img.src = url;
                });
                // 检查是否已取消
                if (signal.aborted) {
                    // 如果任务被中断，更新状态为已中断
                    if (taskId) {
                        updateCacheTaskStatus(taskId, { status: 'cancelled' });
                    }
                    break;
                }
                // 使用动态延迟时间
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                if (!signal.aborted) {
                    console.error('图片预加载失败:', url);
                    // 如果提供了任务ID，更新任务状态为已中断
                    if (taskId) {
                        updateCacheTaskStatus(taskId, { status: 'cancelled' });
                    }
                }
            }
        }
        
        if (!signal.aborted) {
            console.log('前5张图片加载完成');
            
            // 后台加载剩余图片
            if (remainingUrls.length > 0) {
                setTimeout(async () => {
                    for (const url of remainingUrls) {
                        if (signal.aborted) {
                            // 如果任务被中断，更新状态为已中断
                            if (taskId) {
                                updateCacheTaskStatus(taskId, { status: 'cancelled' });
                            }
                            break;
                        }
                        if (imageCache.has(url)) {
                            // 如果提供了任务ID，更新任务进度
                            if (taskId) {
                                updateCacheTaskProgress(taskId);
                            }
                            continue;
                        }
                        
                        try {
                            await new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => {
                                    imageCache.set(url, img);
                                    // 如果提供了任务ID，更新任务进度
                                    if (taskId) {
                                        updateCacheTaskProgress(taskId);
                                    }
                                    resolve();
                                };
                                img.onerror = reject;
                                img.src = url;
                            });
                            if (signal.aborted) {
                                // 如果任务被中断，更新状态为已中断
                                if (taskId) {
                                    updateCacheTaskStatus(taskId, { status: 'cancelled' });
                                }
                                break;
                            }
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } catch (error) {
                            if (!signal.aborted) {
                                console.error('图片预加载失败:', url);
                                // 如果提供了任务ID，更新任务状态为已中断
                                if (taskId) {
                                    updateCacheTaskStatus(taskId, { status: 'cancelled' });
                                }
                            }
                        }
                    }
                    if (!signal.aborted) {
                        console.log('后台加载剩余图片完成');
                        // 如果提供了任务ID，更新任务状态为完成
                        if (taskId) {
                            updateCacheTaskStatus(taskId, {
                                status: 'completed'
                            });
                        }
                    }
                }, 0);
            } else {
                // 如果没有剩余图片，直接标记为完成
                if (taskId) {
                    updateCacheTaskStatus(taskId, {
                        status: 'completed'
                    });
                }
            }
        }
    }

    // 浏览历史的存储键名
    const HISTORY_STORAGE_KEY = 'gallery_history';

    // 浏览历史管理函数
    function saveToHistory(aid, title, currentPage) {
        try {
            const history = getHistory();
            const newEntry = {
                aid,
                title,
                timestamp: Date.now(),
                page: currentPage
            };
            
            // 移除重复项
            const uniqueHistory = history.filter(item => item.aid !== aid);
            uniqueHistory.unshift(newEntry); // 将新记录添加到开头
            
            // 只保留最新的50条记录
            const trimmedHistory = uniqueHistory.slice(0, 50);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory));
        } catch (error) {
            console.error('保存浏览记录失败:', error);
        }
    }

    function getHistory() {
        try {
            const history = localStorage.getItem(HISTORY_STORAGE_KEY);
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('获取浏览记录失败:', error);
            return [];
        }
    }

    // 渲染浏览历史
    function renderHistory() {
        const historyList = document.getElementById('history-list');
        const history = getHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="no-results">暂无浏览记录</div>';
            return;
        }
        
        historyList.innerHTML = '';
        history.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'image-item';
            itemElement.dataset.aid = item.aid;
            
            const date = new Date(item.timestamp);
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            
            itemElement.innerHTML = `
                <div class="history-item-content">
                    <h3>${item.title}</h3>
                    <div class="history-info">
                        <span class="history-time">${formattedDate}</span>
                        <span class="history-page">第 ${item.page} 页</span>
                        <button class="cache-btn" title="缓存图片">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
            `;
            
            // 添加缓存按钮点击事件
            const cacheBtn = itemElement.querySelector('.cache-btn');
            cacheBtn.addEventListener('click', (e) => {
                handleCacheButtonClick(e, item.aid, item.title);
            });
            
            itemElement.addEventListener('click', async () => {
                // 点击时保存到历史记录
                saveToHistory(item.aid, item.title, page);
                
                const aid = itemElement.dataset.aid;
                showLoadingToast(); // 显示加载提示
                
                try {
                    const galleryResponse = await fetchGalleryImages(aid);
                    
                    if (galleryResponse && galleryResponse.success) {
                        const images = galleryResponse.data.images;
                        
                        try {
                            // 不传入 taskId，这样不会中断现有的缓存任务
                            await preloadImages(images);
                            
                            // 更新全局图片数组
                            demoImages.length = 0;
                            demoImages.push(...images);
                            
                            // 重置当前索引
                            currentIndex = 0;
                            
                            // 关闭弹框
                            hideAllModals();
                            
                            // 初始化图片显示
                            initImages();
                            
                            // 进入全屏模式
                            const gallery = document.getElementById('gallery');
                            if (gallery.requestFullscreen) {
                                await gallery.requestFullscreen();
                            }
                            rotateScreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                            
                        } catch (error) {
                            console.error('加载图片失败:', error);
                        }
                    }
                } catch (error) {
                    console.error('加载图片失败:', error);
                } finally {
                    hideLoadingToast(); // 隐藏加载提示
                }
            });
            
            historyList.appendChild(itemElement);
        });
    }

    // 修改 renderArticleList 函数，添加 async 关键字
    async function renderArticleList(page = 1) {
        const imageList = document.getElementById('image-list');
        const modal = document.getElementById('image-modal');
        
        // 显示弹框
        modal.style.display = 'block';
        
        // 显加载动画
        imageList.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;
        
        try {
            const response = await fetchGalleryList(page);
            if (!response || !response.success) {
                imageList.innerHTML = `
                    <div class="loading-container">
                        <div class="error">加载失败</div>
                    </div>
                `;
                return;
            }

            imageList.innerHTML = '';
            response.data.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'image-item';
                itemElement.dataset.aid = item.aid;
                itemElement.innerHTML = `
                    <img src="${item.image_url}" alt="${item.title}" class="item-image">
                    <div class="item-footer">
                        <h3>${item.title}</h3>
                        <button class="cache-btn" title="缓存图片">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                `;
                
                // 添加缓存按钮点击事件
                const cacheBtn = itemElement.querySelector('.cache-btn');
                cacheBtn.addEventListener('click', (e) => {
                    handleCacheButtonClick(e, item.aid, item.title);
                });
                
                // 添加图片点击事件
                const itemImage = itemElement.querySelector('.item-image');
                itemImage.addEventListener('click', async () => {
                    // 点击时保存到历史记录
                    saveToHistory(item.aid, item.title, page);
                    
                    const aid = itemElement.dataset.aid;
                    showLoadingToast(); // 显示加载提示
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            try {
                                // 不传入 taskId，这样不会中断现有的缓存任务
                                await preloadImages(images);
                                
                                // 更新全局图片数组
                                demoImages.length = 0;
                                demoImages.push(...images);
                                
                                // 重置当前索引
                                currentIndex = 0;
                                
                                // 关闭弹框
                                hideAllModals();
                                
                                // 初始化图片显示
                                initImages();
                                
                                // 后台预加载图片，不传入taskId，这样不会中断现有的缓存任务
                                preloadImages(images).catch(error => {
                                    console.error('后台预加载图片失败:', error);
                                });
                                
                                // 添加到缓存列表
                                addCacheTask(aid, item.title, images);
                                
                            } catch (error) {
                                console.error('加载图片失败:', error);
                            }
                        }
                    } catch (error) {
                        console.error('加载图片失败:', error);
                    } finally {
                        hideLoadingToast(); // 隐藏加载提示
                    }
                });
                
                imageList.appendChild(itemElement);
            });
            
            // 更新分页
            updatePagination(response.total);
            
        } catch (error) {
            console.error('渲染列表失败:', error);
            imageList.innerHTML = `
                <div class="loading-container">
                    <div class="error">渲染失败</div>
                </div>
            `;
        }
    }

    // 更新分页控件
    function updatePagination(total, pages) {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;
        
        let paginationHTML = '<div class="pagination-container">';
        
        // 上一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changePage(${modalState.imageModal.currentPage - 1})">
                上一页
            </button>
        `;
        
        // 可编辑的页码输入框
        paginationHTML += `
            <input type="number" 
                   class="page-input" 
                   value="${modalState.imageModal.currentPage}" 
                   min="1" 
                   onchange="handlePageInput(this.value)"
                   onclick="this.select()"
            >
        `;
        
        // 下一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changePage(${modalState.imageModal.currentPage + 1})">
                下一页
            </button>
        `;
        
        paginationHTML += '</div>';
        pagination.innerHTML = paginationHTML;
    }

    // 处理页码输入
    function handlePageInput(value) {
        const page = parseInt(value);
        if (!isNaN(page) && page >= 1) {
            changePage(page);
        }
    }

    // 切换页面
    async function changePage(newPage) {
        if (newPage >= 1) {  // 只检查是否大于等于1
            modalState.imageModal.currentPage = newPage;
            await renderArticleList(newPage);
        }
    }

    // 添加 hideModal 函数
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 修改 hideAllModals 函数，使用新的 hideModal 函数
    function hideAllModals() {
        hideModal('image-modal');
        hideModal('search-modal');
        hideModal('history-modal');
        hideModal('cache-list-modal');
        searchInput.value = '';  // 清空搜索输入
    }

    // 然后定义显示各个模态框的函数
    async function showModal() {
        // 先退出全屏
        await exitFullScreen();
        
        // 隐藏其他可能显示的弹框
        hideModal('search-modal');
        hideModal('history-modal');
        hideModal('cache-list-modal');
        
        // 显示图片列表弹框
        imageModal.style.display = 'block';
        
        // 只在第一次打开或强制刷新时重新渲染
        if (!modalState.imageModal.isInitialized) {
            renderArticleList(modalState.imageModal.currentPage);
            modalState.imageModal.isInitialized = true;
        }
    }

    async function showSearchModal() {
        // 先退出全屏
        await exitFullScreen();
        
        // 隐藏其他可能显示的弹框
        hideModal('image-modal');
        hideModal('favorites-modal');
        hideModal('history-modal');
        hideModal('cache-list-modal');
        
        // 显示搜索弹框
        searchModal.style.display = 'block';
        searchInput.focus();
        
        // 只在第一次打开或强制刷新时重新渲染
        if (!modalState.searchModal.isInitialized && modalState.searchModal.keyword) {
            renderSearchResults(modalState.searchModal.currentPage);
            modalState.searchModal.isInitialized = true;
        }
    }

    // 最后添加事件监听
    document.getElementById('show-list').addEventListener('click', showModal);
    document.getElementById('show-search').addEventListener('click', showSearchModal);

    // ESC 键只关闭当前显示的弹框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 找到当前显示的弹框并关闭
            const visibleModal = document.querySelector('.modal[style*="display: block"]');
            if (visibleModal) {
                visibleModal.style.display = 'none';
            }
        }
    });

    // 添加到 window 对象以便在 HTML 中调用
    window.changePage = changePage;
    window.handlePageInput = handlePageInput;

    // 添加键盘事件监听
    document.addEventListener('keydown', (e) => {
        // 如果模态框显示中，不处理键盘事件
        const modal = document.getElementById('image-modal');
        if (modal.style.display === 'block') return;
        
        switch(e.code) {
            case 'ArrowLeft':  // 左方向键
                prevImage();
                break;
            case 'ArrowRight': // 右方向键
                nextImage();
                break;
            case 'Space':      // 空格键
                e.preventDefault();  // 阻止空格键滚动页面
                nextImage();
                break;
        }
    });

    // 渲染搜索结果
    async function renderSearchResults(page = 1) {
        const searchResultList = document.getElementById('search-result-list');
        const keyword = searchInput.value.trim();
        
        if (!keyword) {
            searchResultList.innerHTML = '<div class="no-results">请输入搜索关键词</div>';
            return;
        }
        
        // 显示加载动画
        searchResultList.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;
        
        try {
            const response = await fetchSearchResults(keyword, page);
            if (!response || !response.success) {
                searchResultList.innerHTML = `
                    <div class="loading-container">
                        <div class="error">搜索失败</div>
                    </div>
                `;
                return;
            }

            if (response.data.length === 0) {
                searchResultList.innerHTML = '<div class="no-results">未找到相关结果</div>';
                return;
            }

            searchResultList.innerHTML = '';
            response.data.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'image-item';
                itemElement.dataset.aid = item.aid;
                itemElement.innerHTML = `
                    <img src="${item.image_url}" alt="${item.title}">
                    <div class="item-footer">
                        <h3>${item.title}</h3>
                        <button class="cache-btn" title="缓存图片">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                `;
                
                // 添加缓存按钮点击事件
                const cacheBtn = itemElement.querySelector('.cache-btn');
                cacheBtn.addEventListener('click', (e) => {
                    handleCacheButtonClick(e, item.aid, item.title);
                });
                
                itemElement.addEventListener('click', async () => {
                    // 点击时保存到历史记录
                    saveToHistory(item.aid, item.title, page);
                    
                    const aid = itemElement.dataset.aid;
                    showLoadingToast(); // 显示加载提示
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            try {
                                // 不传入 taskId，这样不会中断现有的缓存任务
                                await preloadImages(images);
                                
                                // 更新全局图片数组
                                demoImages.length = 0;
                                demoImages.push(...images);
                                
                                // 重置当前索引
                                currentIndex = 0;
                                
                                // 关闭弹框
                                hideAllModals();
                                
                                // 初始化图片显示
                                initImages();
                                
                                // 进入全屏模式
                                const gallery = document.getElementById('gallery');
                                if (gallery.requestFullscreen) {
                                    await gallery.requestFullscreen();
                                }
                                rotateScreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                                
                                // 添加到缓存列表
                                addCacheTask(aid, item.title, images);
                                
                            } catch (error) {
                                console.error('加载图片失败:', error);
                            }
                        }
                    } catch (error) {
                        console.error('加载图片失败:', error);
                    } finally {
                        hideLoadingToast(); // 隐藏加载提示
                    }
                });
                
                searchResultList.appendChild(itemElement);
            });
            
            // 更新搜索结果的分页
            updateSearchPagination(response.total);
            
        } catch (error) {
            console.error('渲染搜索结果失败:', error);
            searchResultList.innerHTML = `
                <div class="loading-container">
                    <div class="error">渲染失败</div>
                </div>
            `;
        }
    }

    // 更新搜索分页
    function updateSearchPagination(total) {
        const pagination = document.getElementById('search-pagination');
        if (!pagination) return;
        
        let paginationHTML = '<div class="pagination-container">';
        
        // 上一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changeSearchPage(${modalState.searchModal.currentPage - 1})">
                上一页
            </button>
        `;
        
        // 可编辑的页码输入框
        paginationHTML += `
            <input type="number" 
                   class="page-input" 
                   value="${modalState.searchModal.currentPage}" 
                   min="1" 
                   onchange="handleSearchPageInput(this.value)"
                   onclick="this.select()"
            >
        `;
        
        // 下一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changeSearchPage(${modalState.searchModal.currentPage + 1})">
                下一页
            </button>
        `;
        
        paginationHTML += '</div>';
        pagination.innerHTML = paginationHTML;
    }

    // 处理搜索页码输入
    function handleSearchPageInput(value) {
        const page = parseInt(value);
        if (!isNaN(page) && page >= 1) {
            changeSearchPage(page);
        }
    }

    // 切换搜索页面
    async function changeSearchPage(newPage) {
        if (newPage >= 1) {
            modalState.searchModal.currentPage = newPage;
            await renderSearchResults(newPage);
        }
    }

    // 搜索功能
    async function performSearch() {
        const keyword = searchInput.value.trim();
        if (keyword !== modalState.searchModal.keyword) {
            modalState.searchModal.keyword = keyword;
            modalState.searchModal.currentPage = 1;
            modalState.searchModal.isInitialized = false;
        }
        await renderSearchResults(modalState.searchModal.currentPage);
        modalState.searchModal.isInitialized = true;
    }

    // 事件监听
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // 添加到 window 对象以便在 HTML 中调用
    window.changeSearchPage = changeSearchPage;
    window.handleSearchPageInput = handleSearchPageInput;

    // 在文件开头的 DOM 元素声明部分添加
    const loadingToast = document.createElement('div');
    loadingToast.className = 'loading-toast';
    loadingToast.innerHTML = `
        <div class="spinner"></div>
        <span>图片加载中...</span>
    `;
    document.body.appendChild(loadingToast);

    // 添加显示/隐藏加载提示的函数
    function showLoadingToast() {
        loadingToast.style.display = 'flex';
    }

    function hideLoadingToast() {
        loadingToast.style.display = 'none';
    }

    // 添加状态管理对象
    const modalState = {
        imageModal: {
            currentPage: 1,
            isInitialized: false
        },
        searchModal: {
            currentPage: 1,
            keyword: '',
            isInitialized: false
        }
    };

    // 修改关闭按钮的处理函数
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = btn.closest('.modal');
            if (modal) {
                hideModal(modal.id);
                // 标记为未初始化，以便下次打开时可以选择是否刷新
                switch(modal.id) {
                    case 'image-modal':
                        modalState.imageModal.isInitialized = false;
                        break;
                    case 'search-modal':
                        modalState.searchModal.isInitialized = false;
                        break;
                }
            }
        });
    });

    // 修改 ESC 键处理
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const visibleModal = document.querySelector('.modal[style*="display: block"]');
            if (visibleModal) {
                visibleModal.style.display = 'none';
                // 标记为未初始化
                switch(visibleModal.id) {
                    case 'image-modal':
                        modalState.imageModal.isInitialized = false;
                        break;
                    case 'search-modal':
                        modalState.searchModal.isInitialized = false;
                        break;
                }
            }
        }
    });

    // 添加 updateImageCounter 函数
    function updateImageCounter() {
        const counter = document.getElementById('image-counter');
        if (counter && demoImages.length > 0) {
            counter.textContent = `${currentIndex + 1}/${demoImages.length}`;
        }
    }

    // 修改 showPreviousImage 函数，移除动画效果
    function showPreviousImage() {
        if (demoImages.length > 1) {
            currentIndex = (currentIndex - 1 + demoImages.length) % demoImages.length;
            currentImage.src = demoImages[currentIndex];
            updateImageCounter();
        }
    }

    // 修改 showNextImage 函数，移除动画效果
    function showNextImage() {
        if (demoImages.length > 1) {
            currentIndex = (currentIndex + 1) % demoImages.length;
            currentImage.src = demoImages[currentIndex];
            updateImageCounter();
        }
    }

    // 修改 initImages 函数，移除动画相关代码
    function initImages() {
        const gallery = document.getElementById('gallery');
        const currentImage = document.getElementById('current-image');
        const loading = document.querySelector('.loading');

        if (demoImages.length > 0) {
            gallery.style.display = 'block';
            currentImage.src = demoImages[currentIndex];
            updateImageCounter();
            
            // 简化加载事件
            currentImage.onload = () => {
                loading.style.display = 'none';
            };
            
            currentImage.onerror = () => {
                console.error('图片加载失败');
                loading.style.display = 'none';
                currentImage.src = '../images/loading.gif';
            };
        }
    }

    // 修改自动播放相关函数，确保更新计数器
    function startAutoPlay() {
        if (!isPlaying && demoImages.length > 1) {
            isPlaying = true;
            document.getElementById('auto-play').innerHTML = '<i class="fas fa-pause"></i>';
            playInterval = setInterval(() => {
                showNextImage();
                updateImageCounter();
            }, currentSpeed);
        }
    }

    function stopAutoPlay() {
        if (isPlaying) {
            isPlaying = false;
            document.getElementById('auto-play').innerHTML = '<i class="fas fa-play"></i>';
            clearInterval(playInterval);
        }
    }

    // 修改 loadImages 函数，确保不会中断缓存任务
    async function loadImages(aid) {
        try {
            const response = await fetchGalleryImages(aid);
            if (response && response.success) {
                // 不传入 taskId，这样不会中断现有的缓存任务
                await preloadImages(response.data.images);
                demoImages.length = 0;
                demoImages.push(...response.data.images);
                currentIndex = 0;
                initImages();
                updateImageCounter(); // 加载新图片集后更新计数器
            }
        } catch (error) {
            console.error('加载图片失败:', error);
        }
    }

    // 添加点击事件监听
    currentImage.addEventListener('click', (e) => {
        e.preventDefault(); // 防止默认行为
        nextImage();
    });

    // 添加全屏控制函数
    function toggleFullScreen() {
        const gallery = document.getElementById('gallery');
        
        if (!document.fullscreenElement) {
            // 进入全屏
            if (gallery.requestFullscreen) {
                gallery.requestFullscreen();
            } else if (gallery.webkitRequestFullscreen) {
                gallery.webkitRequestFullscreen();
            } else if (gallery.msRequestFullscreen) {
                gallery.msRequestFullscreen();
            }
            rotateScreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            // 退出全屏
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            rotateScreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    // 监听全屏变化事件
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            rotateScreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    });

    // 添加按钮点击事件
    rotateScreenBtn.addEventListener('click', toggleFullScreen);

    // 添加退出全屏的辅助函数
    async function exitFullScreen() {
        if (document.fullscreenElement) {
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    await document.msExitFullscreen();
                }
                rotateScreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            } catch (error) {
                console.error('退出全屏失败:', error);
            }
        }
    }

    // 显示历史记录弹框
    function showHistoryModal() {
        exitFullScreen();
        hideModal('image-modal');
        hideModal('search-modal');
        
        const historyModal = document.getElementById('history-modal');
        historyModal.style.display = 'block';
        renderHistory();
    }

    // 添加历史记录按钮的事件监听
    document.getElementById('show-favorites').addEventListener('click', showHistoryModal);

    // 添加提示框函数
    function showToast(message) {
        // 检查是否已存在提示框
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            toast.style.color = 'white';
            toast.style.padding = '10px 20px';
            toast.style.borderRadius = '4px';
            toast.style.zIndex = '9999';
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    // 添加缓存任务管理函数
    function addCacheTask(aid, title, images) {
        // 检查是否已存在相同 aid 的缓存任务
        for (const [taskId, task] of cacheTasks.entries()) {
            if (task.aid === aid) {
                // 如果任务已完成或已取消，则重新添加
                if (task.status === 'completed' || task.status === 'cancelled') {
                    // 删除旧任务
                    cacheTasks.delete(taskId);
                    break;
                } else {
                    // 如果任务正在进行中，则不重复添加
                    showToast('该图片已在缓存列表中');
                    return null;
                }
            }
        }
        
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        cacheTasks.set(taskId, {
            id: taskId,
            aid: aid,
            title: title,
            images: images,
            total: images.length,
            completed: 0,
            status: 'pending',
            timestamp: Date.now()
        });
        
        // 更新缓存列表按钮
        updateCacheListButton();
        
        // 开始缓存任务
        preloadImages(images, 5, taskId);
        
        return taskId;
    }
    
    function updateCacheTaskProgress(taskId) {
        const task = cacheTasks.get(taskId);
        if (task) {
            task.completed++;
            updateCacheListButton();
            
            // 如果缓存列表模态框是打开的，更新UI
            if (cacheListModal.style.display === 'block') {
                updateCacheListUI();
            }
        }
    }
    
    function updateCacheTaskStatus(taskId, status) {
        const task = cacheTasks.get(taskId);
        if (task) {
            Object.assign(task, status);
            updateCacheListButton();
            
            // 如果缓存列表模态框是打开的，更新UI
            if (cacheListModal.style.display === 'block') {
                updateCacheListUI();
            }
        }
    }
    
    function showCacheListButton() {
        if (cacheListBtn) {
            cacheListBtn.style.display = 'flex';
        }
    }
    
    function updateCacheListButton() {
        if (cacheListBtn) {
            const activeTasks = Array.from(cacheTasks.values()).filter(task => 
                task.status === 'ld' || task.status === 'pending'
            );
            
            // Always show the cache list button
            cacheListBtn.style.display = 'flex';
            
            // Update the badge with the number of active tasks
            const badge = cacheListBtn.querySelector('.badge');
            if (badge) {
                badge.textContent = activeTasks.length;
            }
        }
    }
    
    function updateCacheListUI() {
        if (!cacheList) return;
        
        cacheList.innerHTML = '';
        
        // 按时间戳排序，最新的在前面
        const sortedTasks = Array.from(cacheTasks.values()).sort((a, b) => b.timestamp - a.timestamp);
        
        if (sortedTasks.length === 0) {
            cacheList.innerHTML = '<div class="no-results">暂无缓存任务</div>';
            return;
        }
        
        sortedTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `cache-item ${task.status}`;
            taskElement.dataset.taskId = task.id;
            
            let statusText = '';
            let actionButtons = '';
            
            switch (task.status) {
                case 'pending':
                    statusText = '等待中';
                    actionButtons = `
                        <button class="cache-item-btn cancel" title="取消">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    break;
                case 'ld':
                    statusText = '缓存中';
                    actionButtons = `
                        <button class="cache-item-btn cancel" title="取消">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    break;
                case 'completed':
                    statusText = '已完成';
                    actionButtons = `
                        <button class="cache-item-btn preview" title="预览">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="cache-item-btn delete" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                    break;
                case 'cancelled':
                    statusText = '已中断';
                    actionButtons = `
                        <button class="cache-item-btn continue" title="继续">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="cache-item-btn delete" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                    break;
                case 'error':
                    statusText = '失败';
                    actionButtons = `
                        <button class="cache-item-btn retry" title="重试">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="cache-item-btn delete" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                    break;
            }
            
            const progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
            
            taskElement.innerHTML = `
                <div class="cache-item-info">
                    <div class="cache-item-title">${task.title}</div>
                    <div class="cache-item-progress">
                        <div class="cache-item-progress-bar" style="width: ${progress}%"></div>
                    </div>
                    <div class="cache-item-status">
                        ${statusText} - ${task.completed}/${task.total} (${progress}%)
                    </div>
                </div>
                <div class="cache-item-actions">
                    ${actionButtons}
                </div>
            `;
            
            // 添加按钮事件
            const cancelBtn = taskElement.querySelector('.cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (preloadController) {
                        preloadController.abort();
                    }
                    updateCacheTaskStatus(task.id, { status: 'cancelled' });
                });
            }
            
            const retryBtn = taskElement.querySelector('.retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    updateCacheTaskStatus(task.id, { 
                        status: 'pending',
                        completed: 0
                    });
                    preloadImages(task.images, 5, task.id);
                });
            }
            
            const continueBtn = taskElement.querySelector('.continue');
            if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                    // 从上次中断的位置继续缓存
                    const remainingImages = task.images.slice(task.completed);
                    updateCacheTaskStatus(task.id, { 
                        status: 'ld',
                        completed: task.completed // 保持已完成的进度
                    });
                    preloadImages(remainingImages, 5, task.id);
                });
            }
            
            const deleteBtn = taskElement.querySelector('.delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    cacheTasks.delete(task.id);
                    updateCacheListButton();
                    updateCacheListUI();
                });
            }
            
            const previewBtn = taskElement.querySelector('.preview');
            if (previewBtn) {
                previewBtn.addEventListener('click', () => {
                    previewCacheTask(task.id);
                });
            }
            
            cacheList.appendChild(taskElement);
        });
    }
    
    // 显示缓存列表模态框
    function showCacheListModal() {
        exitFullScreen();
        hideModal('image-modal');
        hideModal('search-modal');
        hideModal('history-modal');
        
        cacheListModal.style.display = 'block';
        updateCacheListUI();
    }
    
    // 添加缓存列表按钮事件监听
    if (cacheListBtn) {
        cacheListBtn.addEventListener('click', showCacheListModal);
    }
    
    // 添加关闭缓存列表模态框事件监听
    if (closeCacheListBtn) {
        closeCacheListBtn.addEventListener('click', () => {
            cacheListModal.style.display = 'none';
        });
    }

    // 修改缓存按钮点击事件处理
    function handleCacheButtonClick(e, aid, title) {
        e.stopPropagation(); // 阻止事件冒泡，避免触发图片项的点击事件
        
        showLoadingToast(); // 显示加载提示
        
        // 获取图片数据并开始缓存
        fetchGalleryImages(aid).then(galleryResponse => {
            if (galleryResponse && galleryResponse.success) {
                const images = galleryResponse.data.images;
                
                // 添加缓存任务
                addCacheTask(aid, title, images);
                
                // 显示成功提示
                showToast('开始缓存图片');
            } else {
                showToast('获取图片失败');
            }
        }).catch(error => {
            console.error('获取图片失败:', error);
            showToast('获取图片失败');
        }).finally(() => {
            hideLoadingToast(); // 隐藏加载提示
        });
    }

    // 实现缓存预览功能
    function previewCacheTask(taskId) {
        const task = cacheTasks.get(taskId);
        if (!task || task.status !== 'completed') {
            showToast('无法预览未完成的缓存任务');
            return;
        }
        
        // 更新全局图片数组
        demoImages.length = 0;
        demoImages.push(...task.images);
        
        // 重置当前索引
        currentIndex = 0;
        
        // 关闭弹框
        hideAllModals();
        
        // 初始化图片显示
        initImages();
        
        // 进入全屏模式
        const gallery = document.getElementById('gallery');
        if (gallery.requestFullscreen) {
            gallery.requestFullscreen();
        } else if (gallery.webkitRequestFullscreen) {
            gallery.webkitRequestFullscreen();
        } else if (gallery.msRequestFullscreen) {
            gallery.msRequestFullscreen();
        }
        rotateScreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        
        // 显示提示
        showToast('预览缓存图片');
    }

    // 初始化时显示缓存列表按钮
    document.addEventListener('DOMContentLoaded', () => {
        // 确保缓存列表按钮始终显示
        if (cacheListBtn) {
            cacheListBtn.style.display = 'flex';
        }
    });