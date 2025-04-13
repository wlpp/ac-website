// 漫画页面JavaScript

// 在全局作用域声明函数，使分页按钮可以调用它们
let loadRecommendedManga;
let load3DManga;
let loadGentlemanManga;

document.addEventListener('DOMContentLoaded', function() {
    // 分页配置
    const ITEMS_PER_PAGE = 12;
    let currentPageRecommended = 1;
    let currentPage3D = 1;
    let currentPageGentleman = 1;
    let isLoading = false;
    let recommendedLoaded = false;
    let d3Loaded = false;
    let gentlemanLoaded = false;
    
    // 设置预估的总漫画数量，因为API只返回当前页的数据量
    const ESTIMATED_TOTAL_MANGA = 100; // 预估值，可以根据实际情况调整

    // 漫画数据缓存
    const mangaCache = {
        recommended: new Map(),
        '3d': new Map(),
        gentleman: new Map()
    };

    // 加载状态管理
    const loadingState = {
        recommended: false,
        '3d': false,
        gentleman: false
    };

    // 渲染漫画卡片
    function renderMangaCard(manga) {
        return `
            <div class="manga-card" data-id="${manga.pid}">
                <div class="manga-cover">
                    <img src="${manga.img}" alt="${manga.title}" loading="lazy">
                </div>
                <div class="manga-info">
                    <h3 class="manga-title">${manga.title}</h3>
                </div>
            </div>
        `;
    }

    // 显示加载动画
    function showLoading(container) {
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">加载中...</div>
            </div>
        `;
    }

    // 显示错误信息
    function showError(container, message, retryCallback) {
        container.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                <button class="retry-button" onclick="(${retryCallback})()">重试</button>
            </div>
        `;
    }

    // 加载漫画推荐 - 将函数赋值给全局变量
    loadRecommendedManga = async function(page = 1) {
        const container = document.getElementById('recommended-manga');
        if (!container) {
            console.error('找不到漫画推荐容器元素');
            return;
        }
        
        // 更新当前页码
        currentPageRecommended = page;
        
        const cacheKey = `page_${page}`;
        
        // 检查缓存
        if (mangaCache.recommended.has(cacheKey)) {
            const cachedData = mangaCache.recommended.get(cacheKey);
            renderMangaList(container, cachedData.items);
            updatePagination('recommended', ESTIMATED_TOTAL_MANGA, page);
            return;
        }

        // 显示加载动画
        showLoading(container);
        loadingState.recommended = true;

        try {
            const response = await fetch(`/api/cartoon-hans?page=${page}&type=0`);
            if (!response.ok) throw new Error('网络请求失败');
            
            const data = await response.json();
            console.log('API响应数据:', data);
            
            if (!data.success) throw new Error(data.message || '加载失败');
            
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error('无效的数据格式');
            }
            
            // 检查当前页面是否有数据
            const hasData = data.data.length > 0;

            // 缓存数据
            mangaCache.recommended.set(cacheKey, {
                items: data.data,
                total: hasData ? ESTIMATED_TOTAL_MANGA : 0
            });

            // 渲染数据
            renderMangaList(container, data.data);
            
            // 如果当前页没有数据，则可能已到达最后一页
            // 否则，使用预估的总数
            updatePagination('recommended', hasData ? ESTIMATED_TOTAL_MANGA : (page - 1) * ITEMS_PER_PAGE, page);
        } catch (error) {
            console.error('加载漫画推荐失败:', error);
            showError(container, '加载失败，请稍后重试', () => loadRecommendedManga(page));
        } finally {
            loadingState.recommended = false;
        }
    }

    // 加载精漫3D - 将函数赋值给全局变量
    load3DManga = async function(page = 1) {
        const container = document.getElementById('3d-manga');
        if (!container) {
            console.error('找不到精漫3D容器元素');
            return;
        }
        
        // 更新当前页码
        currentPage3D = page;
        
        const cacheKey = `page_${page}`;
        
        // 检查缓存
        if (mangaCache['3d'].has(cacheKey)) {
            const cachedData = mangaCache['3d'].get(cacheKey);
            renderMangaList(container, cachedData.items);
            updatePagination('3d', ESTIMATED_TOTAL_MANGA, page);
            return;
        }

        // 显示加载动画
        showLoading(container);
        loadingState['3d'] = true;

        try {
            const response = await fetch(`/api/cartoon-hans?page=${page}&type=1`);
            if (!response.ok) throw new Error('网络请求失败');
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || '加载失败');
            
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error('无效的数据格式');
            }

            // 检查当前页面是否有数据
            const hasData = data.data.length > 0;

            // 缓存数据
            mangaCache['3d'].set(cacheKey, {
                items: data.data,
                total: hasData ? ESTIMATED_TOTAL_MANGA : 0
            });

            // 渲染数据
            renderMangaList(container, data.data);
            
            // 如果当前页没有数据，则可能已到达最后一页
            // 否则，使用预估的总数
            updatePagination('3d', hasData ? ESTIMATED_TOTAL_MANGA : (page - 1) * ITEMS_PER_PAGE, page);
        } catch (error) {
            console.error('加载精漫3D失败:', error);
            showError(container, '加载失败，请稍后重试', () => load3DManga(page));
        } finally {
            loadingState['3d'] = false;
        }
    }

    // 加载绅士3D - 将函数赋值给全局变量
    loadGentlemanManga = async function(page = 1) {
        const container = document.getElementById('gentleman-manga');
        if (!container) {
            console.error('找不到绅士3D容器元素');
            return;
        }
        
        // 更新当前页码
        currentPageGentleman = page;
        
        const cacheKey = `page_${page}`;
        
        // 检查缓存
        if (mangaCache['gentleman'] && mangaCache['gentleman'].has(cacheKey)) {
            const cachedData = mangaCache['gentleman'].get(cacheKey);
            renderMangaList(container, cachedData.items);
            updatePagination('gentleman', ESTIMATED_TOTAL_MANGA, page);
            return;
        }

        // 显示加载动画
        showLoading(container);
        loadingState['gentleman'] = true;

        try {
            const response = await fetch(`/api/cartoon-hans?page=${page}&type=2`);
            if (!response.ok) throw new Error('网络请求失败');
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || '加载失败');
            
            if (!data.data || !Array.isArray(data.data)) {
                throw new Error('无效的数据格式');
            }

            // 检查当前页面是否有数据
            const hasData = data.data.length > 0;

            // 缓存数据
            if (!mangaCache['gentleman']) {
                mangaCache['gentleman'] = new Map();
            }
            mangaCache['gentleman'].set(cacheKey, {
                items: data.data,
                total: hasData ? ESTIMATED_TOTAL_MANGA : 0
            });

            // 渲染数据
            renderMangaList(container, data.data);
            
            // 如果当前页没有数据，则可能已到达最后一页
            // 否则，使用预估的总数
            updatePagination('gentleman', hasData ? ESTIMATED_TOTAL_MANGA : (page - 1) * ITEMS_PER_PAGE, page);
        } catch (error) {
            console.error('加载绅士3D失败:', error);
            showError(container, '加载失败，请稍后重试', () => loadGentlemanManga(page));
        } finally {
            loadingState['gentleman'] = false;
        }
    }

    // 渲染漫画列表
    function renderMangaList(container, items) {
        if (!container) {
            console.error('渲染目标容器不存在');
            return;
        }
        // 添加空值检查
        if (!Array.isArray(items)) {
            console.error('无效的漫画数据:', items);
            container.innerHTML = '<div class="error-message">数据加载异常</div>';
            return;
        }

        container.innerHTML = items.map(renderMangaCard).join('');
        
        // 添加点击事件，在新标签页打开
        container.querySelectorAll('.manga-card').forEach(card => {
            card.addEventListener('click', () => {
                const mangaId = card.dataset.id;
                // 从漫画数据中获取 manga_type
                const mangaData = items.find(item => item.pid === mangaId);
                const mangaType = mangaData ? mangaData.manga_type : 0;
                window.open(`/cartoon/detail/${mangaId}?type=${mangaType}`, '_blank');
            });
        });
    }

    // 更新分页信息
    function updatePagination(type, total, currentPage) {
        const container = document.getElementById(`${type}-pagination`);
        if (!container) {
            console.error(`找不到${type}分页容器`);
            return;
        }
        
        let paginationHTML = `
            <div class="pagination-container">
                <button class="pagination-btn prev-btn" 
                        onclick="load${type === 'recommended' ? 'Recommended' : type === '3d' ? '3D' : 'Gentleman'}Manga(${currentPage - 1})">
                    上一页
                </button>
                <div class="pagination-input-group">
                    <input  
                           class="pagination-input" 
                           value="${currentPage}" 
                           data-type="${type}"
                           onkeypress="if(event.key === 'Enter') { 
                               load${type === 'recommended' ? 'Recommended' : type === '3d' ? '3D' : 'Gentleman'}Manga(this.value);
                           }">
                </div>
                <button class="pagination-btn next-btn" 
                        onclick="load${type === 'recommended' ? 'Recommended' : type === '3d' ? '3D' : 'Gentleman'}Manga(${currentPage + 1})">
                    下一页
                </button>
            </div>
        `;
        
        container.innerHTML = paginationHTML;

        // 添加输入框事件监听
        const input = container.querySelector('.pagination-input');
        input.addEventListener('blur', function() {
            if (this.value !== currentPage.toString()) {
                window[`load${type === 'recommended' ? 'Recommended' : type === '3d' ? '3D' : 'Gentleman'}Manga`](this.value);
            }
        });
    }

    // 标签切换功能
    function setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const sections = document.querySelectorAll('.manga-section');
        const searchTypeSelect = document.getElementById('search-type-select');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // 记录当前请求的标签类型，添加调试信息
                const targetId = tab.getAttribute('data-tab');
                console.log('点击了标签:', targetId);
                
                // 移除所有活动状态
                tabs.forEach(t => t.classList.remove('active'));
                
                // 先隐藏所有sections
                sections.forEach(s => {
                    s.style.display = 'none';
                    s.classList.remove('active');
                });
                
                // 添加当前活动状态
                tab.classList.add('active');
                
                // 获取目标区域
                const targetSection = document.getElementById(`${targetId}-section`);
                
                if (!targetSection) {
                    console.error(`找不到目标区域: ${targetId}-section`);
                    return;
                }
                
                // 显示目标区域并添加active类
                targetSection.style.display = 'block';
                targetSection.classList.add('active');
                
                // 根据当前标签更新搜索类型下拉框的值
                if (targetId === 'recommended') {
                    searchTypeSelect.value = '0';
                } else if (targetId === '3d') {
                    searchTypeSelect.value = '1';
                } else if (targetId === 'gentleman') {
                    searchTypeSelect.value = '2';
                }
                
                // 根据目标ID加载对应数据
                if (targetId === 'recommended') {
                    console.log('正在加载漫画推荐...');
                    // 获取容器内的卡片元素
                    const container = document.getElementById('recommended-manga');
                    
                    // 如果容器为空或者没有漫画卡片，则加载数据
                    if (!container || container.children.length === 0 || 
                        !container.querySelector('.manga-card')) {
                        loadRecommendedManga(1);
                    }
                } else if (targetId === '3d') {
                    console.log('正在加载精漫3D...');
                    // 获取容器内的卡片元素
                    const container = document.getElementById('3d-manga');
                    
                    // 如果容器为空或者没有漫画卡片，则加载数据
                    if (!container || container.children.length === 0 || 
                        !container.querySelector('.manga-card')) {
                        load3DManga(1);
                    }
                } else if (targetId === 'gentleman') {
                    console.log('正在加载绅士3D...');
                    // 获取容器内的卡片元素
                    const container = document.getElementById('gentleman-manga');
                    
                    // 如果容器为空或者没有漫画卡片，则加载数据
                    if (!container || container.children.length === 0 || 
                        !container.querySelector('.manga-card')) {
                        loadGentlemanManga(1);
                    }
                }
            });
        });
    }

    // 设置搜索功能
    function setupSearch() {
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        const searchTypeSelect = document.getElementById('search-type-select');
        const searchSection = document.getElementById('search-section');
        const searchMangaGrid = document.getElementById('search-manga');
        const mainSections = document.querySelectorAll('.manga-section');
        
        const performSearch = async () => {
            const searchTerm = searchInput.value.trim();
            const type = searchTypeSelect.value;
            
            if (!searchTerm) return;
            
            mainSections.forEach(section => {
                if (section !== searchSection) {
                    section.style.display = 'none';
                }
            });
            searchSection.style.display = 'block';
            
            showLoading(searchMangaGrid);
            
            try {
                const response = await fetch(`/api/cartoon-search?kw=${encodeURIComponent(searchTerm)}&type=${type}`);
                if (!response.ok) throw new Error('搜索请求失败');
                
                const data = await response.json();
                if (!data.success) throw new Error(data.message || '搜索失败');
                
                renderMangaList(searchMangaGrid, data.data);
                
                if (data.data.length === 0) {
                    searchMangaGrid.innerHTML = `
                        <div class="no-results">
                            <div class="no-results-icon">🔍</div>
                            <div class="no-results-text">未找到相关漫画</div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('搜索失败:', error);
                showError(searchMangaGrid, '搜索失败，请稍后重试', () => performSearch());
            }
        };
        
        // 搜索按钮点击事件
        searchButton.addEventListener('click', performSearch);
        
        // 输入框回车事件
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
        
        // 输入框退格键事件
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Backspace' && searchInput.value === '') {
                searchSection.style.display = 'none';
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab) {
                    const targetId = activeTab.getAttribute('data-tab');
                    document.getElementById(`${targetId}-section`).style.display = 'block';
                }
            }
        });
        
        // 搜索类型改变时，如果输入框有内容则自动搜索
        searchTypeSelect.addEventListener('change', () => {
            if (searchInput.value.trim()) {
                performSearch();
            }
        });
    }

    // 初始化页面
    function initPage() {
        // 初始加载漫画推荐
        loadRecommendedManga(1);
        
        // 设置标签切换、分页和搜索功能
        setupTabs();
        setupSearch();
    }

    // 启动应用
    initPage();
}); 