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

    // 获取图文列表数据
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

    // 获取画廊图片列表
    async function fetchGalleryImages(aid) {
        try {
            const response = await fetch(`${window.baseURL}/api/gallery-imgs?aid=${aid}`);
            const data = await response.json();
            
            if (data.success) {
                return data;
            }
            throw new Error(data.message || '获取数据失败');
        } catch (error) {
            console.error('获取画廊图片失败:', error);
            return null;
        }
    }

    // 预加载图片
    async function preloadImages(urls, initialLoadCount = 5) {
        const initialUrls = urls.slice(0, initialLoadCount);
        const remainingUrls = urls.slice(initialLoadCount);
        
        const initialPromises = initialUrls.map(url => {
            // 如果图片已经缓存，跳过加载
            if (imageCache.has(url)) {
                return Promise.resolve(url);
            }
            
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    imageCache.set(url, img);  // 缓存加载好的图片
                    resolve(url);
                };
                img.onerror = () => reject(url);
                img.src = url;
            });
        });

        try {
            await Promise.all(initialPromises);
            console.log('前10张图片加载完成');
            
            // 后台加载剩余图片
            if (remainingUrls.length > 0) {
                setTimeout(() => {
                    remainingUrls.forEach(url => {
                        // 如果图片已经缓存，跳过加载
                        if (!imageCache.has(url)) {
                            const img = new Image();
                            img.onload = () => {
                                imageCache.set(url, img);  // 缓存加载好的图片
                            };
                            img.src = url;
                        }
                    });
                    console.log('后台加载剩余图片中...');
                }, 0);
            }
        } catch (error) {
            console.error('部分图片预加载失败:', error);
        }
    }

    // 渲染图文列表
    async function renderArticleList() {
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
            const response = await fetchGalleryList(pageConfig.currentPage);
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
                    <img src="${item.image_url}" alt="${item.title}">
                    <h3>${item.title}</h3>
                `;
                itemElement.addEventListener('click', async () => {
                    const aid = itemElement.dataset.aid;
                    loading.style.display = 'block';
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            // 先加载前10张图片
                            await preloadImages(images);
                            
                            // 更新全局图片数组
                            demoImages.length = 0;
                            demoImages.push(...images);
                            
                            // 重置当前索引
                            currentIndex = 0;
                            
                            // 关闭弹框
                            hideModal();
                            
                            // 初始化图片显示
                            initImages();
                        }
                    } catch (error) {
                        console.error('加载图片失败:', error);
                    } finally {
                        loading.style.display = 'none';
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
            await renderArticleList();
        }
    }

    // 显示图片列表弹框
    function showModal() {
        // 先关闭搜索弹框
        searchModal.style.display = 'none';
        searchInput.value = '';  // 清空搜索输入
        
        // 显示图片列表弹框
        imageModal.style.display = 'block';
        renderArticleList(); // 加载图文列表
    }

    // 显示搜索弹框
    function showSearchModal() {
        // 先关闭图片列表弹框
        imageModal.style.display = 'none';
        
        // 显示搜索弹框
        searchModal.style.display = 'block';
        searchInput.focus();  // 聚焦到搜索输入框
    }

    // 隐藏所有弹框
    function hideAllModals() {
        imageModal.style.display = 'none';
        searchModal.style.display = 'none';
        searchInput.value = '';  // 清空搜索输入
    }

    // 事件监听
    document.getElementById('show-list').addEventListener('click', showModal);
    document.getElementById('show-search').addEventListener('click', showSearchModal);
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });

    // ESC 键关闭所有弹框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideAllModals();
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

    // 获取搜索结果数据
    async function fetchSearchResults(keyword, page = 1) {
        try {
            const response = await fetch(`${window.baseURL}/api/gallery-search?q=${encodeURIComponent(keyword)}&page=${page}`);
            const data = await response.json();
            
            if (data.success) {
                return data;
            }
            throw new Error(data.message || '搜索失败');
        } catch (error) {
            console.error('搜索失败:', error);
            return null;
        }
    }

    // 渲染搜索结果
    async function renderSearchResults() {
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
            const response = await fetchSearchResults(keyword, pageConfig.currentPage);
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
                    loading.style.display = 'block';
                    
                    try {
                        const galleryResponse = await fetchGalleryImages(aid);
                        
                        if (galleryResponse && galleryResponse.success) {
                            const images = galleryResponse.data.images;
                            
                            // 先加载前10张图片
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
                        }
                    } catch (error) {
                        console.error('加载图片失败:', error);
                    } finally {
                        loading.style.display = 'none';
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
            await renderSearchResults();
        }
    }

    // 搜索功能
    async function performSearch() {
        pageConfig.currentPage = 1;  // 重置页码
        await renderSearchResults();
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