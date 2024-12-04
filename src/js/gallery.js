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

    // 添加图片缓存对象
    const imageCache = new Map();

    // 添加取消预加载的控制器
    let preloadController = null;

    // 在文件开头添加收藏相关变量
    const favoritesSet = new Set();

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
        loadImage(demoImages[currentIndex]);
        updateCounter();
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

    // 初始化
    initImages();

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

    // 权限检查函数
    async function checkPermission() {
        const userData = getCookie('userData');
        const gallery = document.getElementById('gallery');
        console.log(userData);  
        if (!userData || !userData.token) {
            window.location.href = '/';
            return false;
        }

        try {
            // 直接使用 gallery-list 接口检查权限
            const response = await fetch(`${window.baseURL}/api/gallery-list?page=1`, {
                headers: {
                    'Authorization': `Bearer ${userData.token}`
                }
            });
            console.log(response.status);
            if (response.status === 403) {
                message.error('权限不足，需要管理员权限');
                setTimeout(() => {
                    window.location.href = '/';
                }, 0);
                return false;
            }

            if (!response.ok) {
                throw new Error('验证失败');
            }

            // 如果请求成功,可以直接使用返回的数据初始化图片列表
            const data = await response.json();
            if (data.success) {
                gallery.style.display = 'block';
                // initImagesWithData(data.data);
            }

            return true;
        } catch (error) {
            console.error('权限验证失败:', error);
            message.error('验证失败，请重新登录');
            setTimeout(() => {
                window.location.href = '/';
            }, 0);
            return false;
        }
    }

    // 修改 API 请求函数
    async function fetchGalleryList(page = 1) {
        const userData = getCookie('userData');
        if (!userData || !userData.token) {
            throw new Error('未登录');
        }

        try {
            const response = await fetch(`${window.baseURL}/api/gallery-list?page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${userData.token}`
                }
            });
            const data = await response.json();
            
            if (response.status === 403) {
                message.error('权限不足');
                throw new Error('权限不足');
            }
            
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
        const userData = getCookie('userData');
        if (!userData || !userData.token) {
            throw new Error('未登录');
        }

        try {
            const response = await fetch(`${window.baseURL}/api/gallery-imgs?aid=${aid}`, {
                headers: {
                    'Authorization': `Bearer ${userData.token}`
                }
            });
            const data = await response.json();
            
            if (response.status === 403) {
                message.error('权限不足');
                throw new Error('权限不足');
            }
            
            return data;
        } catch (error) {
            console.error('获取画廊图片失败:', error);
            return null;
        }
    }

    async function fetchSearchResults(keyword, page = 1) {
        const userData = getCookie('userData');
        if (!userData || !userData.token) {
            throw new Error('未登录');
        }

        try {
            const response = await fetch(`${window.baseURL}/api/gallery-search?q=${encodeURIComponent(keyword)}&page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${userData.token}`
                }
            });
            const data = await response.json();
            
            if (response.status === 403) {
                message.error('权限不足');
                throw new Error('权限不足');
            }
            
            return data;
        } catch (error) {
            console.error('搜索失败:', error);
            return null;
        }
    }

    // 页面加载时进行权限检查
    document.addEventListener('DOMContentLoaded', async () => {
        loadFavorites();
        const hasPermission = await checkPermission();
        if (!hasPermission) {
            return;
        }
        
        // 初始化其他功能
        initImages();
    });

    // 添加域名判断函数
    function getPreloadDelay() {
        const hostname = window.location.hostname;
        return hostname === 'acwlpp.top' ? 500 : 1000; // acwlpp.top 使用 0.5秒，其他使用 1秒
    }

    // 修改预加载函数
    async function preloadImages(urls, initialLoadCount = 5) {
        // 如果存在之前的预加载，取消它
        if (preloadController) {
            preloadController.abort();
        }
        
        // 创建新的 AbortController
        preloadController = new AbortController();
        const signal = preloadController.signal;

        const initialUrls = urls.slice(0, initialLoadCount);
        const remainingUrls = urls.slice(initialLoadCount);
        
        // 获取延迟时间
        const delay = getPreloadDelay();
        
        // 修改初始加载部分
        for (const url of initialUrls) {
            if (signal.aborted) {
                break;
            }

            if (imageCache.has(url)) {
                continue;
            }
            
            try {
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        imageCache.set(url, img);
                        resolve(url);
                    };
                    img.onerror = () => reject(url);
                    img.src = url;
                });
                // 检查是否已取消
                if (signal.aborted) break;
                // 使用动态延迟时间
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                if (!signal.aborted) {
                    console.error('图片预加载失败:', url);
                }
            }
        }
        
        if (!signal.aborted) {
            console.log('前5张图片加载完成');
            
            // 后台加载剩余图片
            if (remainingUrls.length > 0) {
                setTimeout(async () => {
                    for (const url of remainingUrls) {
                        if (signal.aborted) break;
                        if (imageCache.has(url)) continue;
                        
                        try {
                            await new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => {
                                    imageCache.set(url, img);
                                    resolve();
                                };
                                img.onerror = reject;
                                img.src = url;
                            });
                            if (signal.aborted) break;
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } catch (error) {
                            if (!signal.aborted) {
                                console.error('图片预加载失败:', url);
                            }
                        }
                    }
                    if (!signal.aborted) {
                        console.log('后台加载剩余图片完成');
                    }
                }, 0);
            }
        }
    }

    // 渲染图文列表
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
                const isFavorited = favoritesSet.has(item.aid);
                itemElement.innerHTML = `
                    <img src="${item.image_url}" alt="${item.title}">
                    <div class="item-footer">
                        <h3>${item.title}</h3>
                        <button class="favorite-btn ${isFavorited ? 'active' : ''}" data-aid="${item.aid}">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
                `;
                itemElement.addEventListener('click', async () => {
                    const aid = itemElement.dataset.aid;
                    showLoadingToast(); // 显示加载提示
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            try {
                                // 先加载前5张图片
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
                
                // 添加收藏按钮点击事件
                const favoriteBtn = itemElement.querySelector('.favorite-btn');
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFavorite(item);
                    favoriteBtn.classList.toggle('active');
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
            <button class="pagination-btn" onclick="changePage(${pageConfig.currentPage - 1})">
                上一页
            </button>
        `;
        
        // 可编辑的页码输入框
        paginationHTML += `
            <input type="number" 
                   class="page-input" 
                   value="${pageConfig.currentPage}" 
                   min="1" 
                   onchange="handlePageInput(this.value)"
                   onclick="this.select()"
            >
        `;
        
        // 下一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changePage(${pageConfig.currentPage + 1})">
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
            pageConfig.currentPage = newPage;
            await renderArticleList(newPage);
        }
    }

    // 先定义 hideAllModals 函数
    function hideAllModals() {
        imageModal.style.display = 'none';
        searchModal.style.display = 'none';
        document.getElementById('favorites-modal').style.display = 'none';
        searchInput.value = '';  // 清空搜索输入
    }

    // 然后定义显示各个模态框的函数
    function showModal() {
        // 隐藏其他可能显示的弹框
        hideModal('search-modal');
        hideModal('favorites-modal');
        
        // 显示图片列表弹框
        imageModal.style.display = 'block';
        
        // 只在第一次打开或强制刷新时重新渲染
        if (!modalState.imageModal.isInitialized) {
            renderArticleList(modalState.imageModal.currentPage);
            modalState.imageModal.isInitialized = true;
        }
    }

    function showSearchModal() {
        // 隐藏其他可能显示的弹框
        hideModal('image-modal');
        hideModal('favorites-modal');
        
        // 显示搜索弹框
        searchModal.style.display = 'block';
        searchInput.focus();
        
        // 只在第一次打开或强制刷新时重新渲染
        if (!modalState.searchModal.isInitialized && modalState.searchModal.keyword) {
            renderSearchResults(modalState.searchModal.currentPage);
            modalState.searchModal.isInitialized = true;
        }
    }

    function showFavoritesModal() {
        // 隐藏其他可能显示的弹框
        hideModal('image-modal');
        hideModal('search-modal');
        
        // 显示收藏弹框
        const favoritesModal = document.getElementById('favorites-modal');
        favoritesModal.style.display = 'block';
        
        // 只在第一次打开或强制刷新时重新渲染
        if (!modalState.favoritesModal.isInitialized) {
            renderFavoritesList(modalState.favoritesModal.currentPage);
            modalState.favoritesModal.isInitialized = true;
        }
    }

    // 最后添加事件监听
    document.getElementById('show-list').addEventListener('click', showModal);
    document.getElementById('show-search').addEventListener('click', showSearchModal);
    document.getElementById('show-favorites').addEventListener('click', showFavoritesModal);

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
                    <h3>${item.title}</h3>
                `;
                itemElement.addEventListener('click', async () => {
                    const aid = itemElement.dataset.aid;
                    showLoadingToast(); // 显示加载提示
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            try {
                                // 先加载前5张图片
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
            <button class="pagination-btn" onclick="changeSearchPage(${pageConfig.currentPage - 1})">
                上一页
            </button>
        `;
        
        // 可编辑的页码输入框
        paginationHTML += `
            <input type="number" 
                   class="page-input" 
                   value="${pageConfig.currentPage}" 
                   min="1" 
                   onchange="handleSearchPageInput(this.value)"
                   onclick="this.select()"
            >
        `;
        
        // 下一页按钮
        paginationHTML += `
            <button class="pagination-btn" onclick="changeSearchPage(${pageConfig.currentPage + 1})">
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
            pageConfig.currentPage = newPage;
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

    // 修改收藏相关函数，简化为只使用 localStorage
    function toggleFavorite(item) {
        const userData = getCookie('userData');
        if (!userData || !userData.username) {
            message.warning('请先登录');
            return;
        }

        const itemId = item.aid;
        const username = userData.username;
        const favoriteKey = `gallery-favorites-${username}`;

        let favorites = new Set(JSON.parse(localStorage.getItem(favoriteKey) || '[]'));

        if (favorites.has(itemId)) {
            favorites.delete(itemId);
            message.success('已取消收藏');
            favoritesSet.delete(itemId);
        } else {
            favorites.add(itemId);
            message.success('已添加到收藏');
            favoritesSet.add(itemId);
        }

        localStorage.setItem(favoriteKey, JSON.stringify(Array.from(favorites)));

        // 更新所有相关按钮的状态
        document.querySelectorAll(`.favorite-btn[data-aid="${itemId}"]`).forEach(btn => {
            btn.classList.toggle('active', favorites.has(itemId));
        });
    }

    // 简化加载收藏函数
    function loadFavorites() {
        const userData = getCookie('userData');
        if (!userData || !userData.username) {
            favoritesSet.clear();
            return;
        }

        const favoriteKey = `gallery-favorites-${userData.username}`;
        const saved = localStorage.getItem(favoriteKey);
        
        favoritesSet.clear();
        if (saved) {
            const favorites = JSON.parse(saved);
            favorites.forEach(id => favoritesSet.add(id));
        }
    }

    // 修改渲染收藏列表函数
    async function renderFavoritesList(page = 1) {
        const userData = getCookie('userData');
        if (!userData || !userData.username) {
            message.warning('请先登录');
            return;
        }

        // 修改选择器以匹配新的 HTML 结构
        const favoritesList = document.querySelector('#favorites-modal .image-list');
        if (!favoritesList) {
            console.error('找不到收藏列表容器');
            return;
        }

        if (favoritesSet.size === 0) {
            favoritesList.innerHTML = '<div class="no-results">暂无收藏</div>';
            return;
        }

        // 显示加载动画
        favoritesList.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;

        try {
            const response = await fetchGalleryList(page);
            if (!response || !response.success) {
                favoritesList.innerHTML = `
                    <div class="loading-container">
                        <div class="error">加载失败</div>
                    </div>
                `;
                return;
            }

            favoritesList.innerHTML = '';
            response.data.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'image-item';
                itemElement.dataset.aid = item.aid;
                itemElement.innerHTML = `
                    <img src="${item.image_url}" alt="${item.title}">
                    <div class="item-footer">
                        <h3>${item.title}</h3>
                        <button class="favorite-btn active" data-aid="${item.aid}">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
                `;
                
                // 修改收藏按钮点击事件
                const favoriteBtn = itemElement.querySelector('.favorite-btn');
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const aid = favoriteBtn.dataset.aid;
                    
                    // 更新收藏状态
                    toggleFavorite({ aid });
                    
                    // 更新按钮状态
                    favoriteBtn.classList.remove('active');
                    
                    // 添加淡出动画类
                    itemElement.classList.add('fade-out');
                    
                    // 等待动画完成后移除元素
                    setTimeout(() => {
                        itemElement.remove();
                        
                        // 检查是否还有收藏项
                        if (favoritesList.children.length === 0) {
                            favoritesList.innerHTML = '<div class="no-results">暂无收藏</div>';
                        }
                    }, 300); // 动画持续时间
                });
                
                favoritesList.appendChild(itemElement);
            });

            // 更新分页（如果需要的话）
            const favoritesPagination = document.getElementById('favorites-pagination');
            if (favoritesPagination) {
                // 这里可以添加分页逻辑
                favoritesPagination.innerHTML = ''; // 暂时清空分页
            }

        } catch (error) {
            console.error('渲染收藏列表失败:', error);
            favoritesList.innerHTML = `
                <div class="loading-container">
                    <div class="error">加载失败</div>
                </div>
            `;
        }
    }

    // 显示收藏列表弹框
    function showFavoritesModal() {
        // 先关闭其他模态框
        imageModal.style.display = 'none';
        searchModal.style.display = 'none';
        
        const favoritesModal = document.getElementById('favorites-modal');
        favoritesModal.style.display = 'block';
        renderFavoritesList(); // 渲染收藏列表
    }

    // 添加收藏按钮事件监听
    document.getElementById('show-favorites').addEventListener('click', showFavoritesModal);

    // 修改 hideModal 函数来隐藏指定的模态框
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 修改关闭按钮的处理函数
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止事件冒泡
            // 找到最近的 modal 父元素并隐藏
            const modal = btn.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

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
        },
        favoritesModal: {
            currentPage: 1,
            isInitialized: false
        }
    };

    // 修改关闭按钮的处理函数
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = btn.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                // 标记为未初始化，以便下次打开时可以选择是否刷新
                switch(modal.id) {
                    case 'image-modal':
                        modalState.imageModal.isInitialized = false;
                        break;
                    case 'search-modal':
                        modalState.searchModal.isInitialized = false;
                        break;
                    case 'favorites-modal':
                        modalState.favoritesModal.isInitialized = false;
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
                    case 'favorites-modal':
                        modalState.favoritesModal.isInitialized = false;
                        break;
                }
            }
        }
    });