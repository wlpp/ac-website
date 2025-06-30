// 分页配置
const pageConfig = {
    currentPage: 1,
    currentType: 0, // 当前视频类型：0-推荐，1-电影，2-动漫
    isSearchMode: false, // 是否处于搜索模式
    searchKeyword: '' // 搜索关键词
};

// DOM 元素
const vodsContainer = document.getElementById('vodsContainer');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageInput = document.getElementById('currentPage');
const navMenuItems = document.querySelectorAll('.nav-menu a');
const searchInput = document.querySelector('.search-box input');
const searchBtn = document.querySelector('.search-btn');

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 更新分页按钮状态
function updatePaginationState() {
    prevPageBtn.disabled = pageConfig.currentPage <= 1;
    nextPageBtn.disabled = false;
    currentPageInput.value = pageConfig.currentPage;
}

// 更新导航菜单激活状态
function updateNavMenuState() {
    navMenuItems.forEach((item, index) => {
        if (index === pageConfig.currentType && !pageConfig.isSearchMode) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// 渲染视频卡片
function renderVodCard(vod) {
    return `
        <div class="vod-card" onclick="window.location.href='/vodplay?uid=${vod.uid}&title=${encodeURIComponent(vod.title)}'">
            <img src="${vod.img}" alt="${vod.title}" class="vod-cover" onerror="this.src='../assets/default-cover.jpg'">
            <div class="vod-title">${vod.title}</div>
        </div>
    `;
}

// 加载动画
function showLoading() {
    vodsContainer.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>';
}

// 错误提示
function showError(message) {
    vodsContainer.innerHTML = `<div class="error-message">${message}</div>`;
}

// 获取视频列表数据
async function fetchVodsList(page, type = pageConfig.currentType) {
    try {
        showLoading();
        
        let url;
        if (pageConfig.isSearchMode) {
            url = `/api/vods-search?keyword=${encodeURIComponent(pageConfig.searchKeyword)}`;
        } else {
            url = `/api/vods-list?page=${page}&type=${type}`;
        }
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || '获取数据失败');
        }
        
        if (!pageConfig.isSearchMode) {
            pageConfig.currentPage = page;
            pageConfig.currentType = type;
        }
        
        // 渲染视频列表
        if (result.data && result.data.length > 0) {
            vodsContainer.innerHTML = result.data.map(renderVodCard).join('');
        } else {
            // 如果当前页没有数据且不是第一页，尝试加载上一页
            if (page > 1 && !pageConfig.isSearchMode) {
                pageConfig.currentPage = page - 1;
                fetchVodsList(page - 1, type);
                return;
            }
            vodsContainer.innerHTML = '<div class="empty-message">暂无视频</div>';
        }
        
        // 更新分页状态和导航菜单状态
        updatePaginationState();
        updateNavMenuState();
        
    } catch (error) {
        console.error('获取视频列表失败:', error);
        showError('获取视频列表失败，请稍后重试');
    }
}

// 执行搜索
async function performSearch() {
    const keyword = searchInput.value.trim();
    if (!keyword) {
        return;
    }
    
    pageConfig.isSearchMode = true;
    pageConfig.searchKeyword = keyword;
    pageConfig.currentPage = 1;
    
    await fetchVodsList(1);
}

// 事件监听器
prevPageBtn.addEventListener('click', () => {
    if (pageConfig.currentPage > 1) {
        pageConfig.currentPage--;
        fetchVodsList(pageConfig.currentPage);
    }
});

nextPageBtn.addEventListener('click', () => {
    pageConfig.currentPage++;
    fetchVodsList(pageConfig.currentPage);
});

currentPageInput.addEventListener('change', () => {
    const newPage = parseInt(currentPageInput.value);
    if (newPage >= 1) {
        pageConfig.currentPage = newPage;
        fetchVodsList(pageConfig.currentPage);
    } else {
        currentPageInput.value = pageConfig.currentPage;
    }
});

// 导航菜单点击事件
navMenuItems.forEach((item, index) => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        pageConfig.isSearchMode = false;
        searchInput.value = '';
        if (index !== pageConfig.currentType) {
            pageConfig.currentPage = 1;
            fetchVodsList(1, index);
        }
    });
});

// 搜索按钮点击事件
searchBtn.addEventListener('click', performSearch);

// 搜索输入框回车事件
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// 防抖处理的搜索输入
searchInput.addEventListener('input', debounce(() => {
    if (searchInput.value.trim() === '') {
        pageConfig.isSearchMode = false;
        fetchVodsList(1, pageConfig.currentType);
    }
}, 500));

// 初始化加载
fetchVodsList(1);
