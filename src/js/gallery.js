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
    
    const gallery = document.getElementById('gallery');
    const currentImage = document.getElementById('current-image');
    const loading = document.querySelector('.loading');
    const imageCounter = document.getElementById('image-counter');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const autoPlayBtn = document.getElementById('auto-play');

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
        
        // 显示加载动画
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

    // 显示模态框
    function showModal() {
        renderArticleList(); // 加载图文表
    }

    // 隐藏模态框
    function hideModal() {
        const modal = document.getElementById('image-modal');
        modal.style.display = 'none';
    }

    // 事件监听
    document.getElementById('show-list').addEventListener('click', showModal);
    document.querySelector('.close-modal').addEventListener('click', hideModal);

    // ESC 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal();
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