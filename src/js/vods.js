// 当前选中的视频类型（0: 嫩草, 1: 动漫）
let currentType = 0;
let currentPage = 1;
let isLoading = false;
let currentTag = 'news'; // 当前选中的标签类型

// 创建视频卡片元素
function createVodCard(vod) {
    return `
        <div class="vod-card" data-vid="${vod.vid}" data-type="${currentType}">
            <img class="vod-cover" src="${vod.image}" alt="${vod.title}">
            <span class="update-badge">${vod.date_text}</span>
            <div class="vod-title">${vod.title}</div>
        </div>
    `;
}

// 创建分页控件
function createPagination(currentPage, hasMore) {
    return `
        <div class="pagination">
            <button class="page-btn prev-btn" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="page-text">第</span>
            <input type="number" class="page-input" value="${currentPage}" min="1">
            <span class="page-text">页</span>
            <button class="page-btn next-btn" ${!hasMore ? 'disabled' : ''}>下一页</button>
        </div>
    `;
}

// 显示加载效果
function showLoading(container) {
    container.classList.add('loading');
    const vodsContainer = container.querySelector('.vods-container');
    if (vodsContainer) {
        vodsContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;
    }
}

// 隐藏加载效果
function hideLoading(container) {
    container.classList.remove('loading');
}

// 加载视频数据
async function loadVods(manga_type, tag, page = 1) {
    try {
        isLoading = true;
        const response = await fetch(`/api/vods-list?manga_type=${manga_type}&tag=${tag}&page=${page}`);
        const result = await response.json();
        
        if (result.success) {
            return {
                data: result.data,
                hasMore: result.data.length > 0 // 如果返回数据不为空，则认为还有更多数据
            };
        } else {
            console.error('加载失败:', result.message);
            return { data: [], hasMore: false };
        }
    } catch (error) {
        console.error('请求错误:', error);
        return { data: [], hasMore: false };
    } finally {
        isLoading = false;
    }
}

// 渲染视频列表
async function renderVodsList(container, manga_type, tag, page) {
    showLoading(container);
    
    const { data, hasMore } = await loadVods(manga_type, tag, page);
    const contentContainer = container.querySelector('.vods-container');
    const paginationContainer = container.querySelector('.pagination-container');
    
    if (data && data.length > 0) {
        contentContainer.innerHTML = data.map(vod => createVodCard(vod)).join('');
    } else {
        contentContainer.innerHTML = '<div class="no-data">暂无数据</div>';
    }
    
    // 更新分页控件
    paginationContainer.innerHTML = createPagination(page, hasMore);
    
    // 添加分页事件监听
    const prevBtn = paginationContainer.querySelector('.prev-btn');
    const nextBtn = paginationContainer.querySelector('.next-btn');
    const pageInput = paginationContainer.querySelector('.page-input');
    
    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1 && !isLoading) {
            currentPage--;
            updateContent(currentType);
        }
    });
    
    nextBtn?.addEventListener('click', () => {
        if (hasMore && !isLoading) {
            currentPage++;
            updateContent(currentType);
        }
    });
    
    // 添加页码输入事件监听
    pageInput?.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value);
        if (!isNaN(newPage) && newPage >= 1 && !isLoading) {
            currentPage = newPage;
            updateContent(currentType);
        } else {
            e.target.value = currentPage;
        }
    });
    
    // 添加输入框按下回车事件
    pageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // 触发 change 事件
        }
    });
    
    hideLoading(container);
}

// 更新页面内容
async function updateContent(manga_type) {
    const contentSection = document.querySelector('.content-section');
    contentSection.style.display = 'block';
    await renderVodsList(contentSection, manga_type, currentTag, currentPage);
}

// 初始化页面
function initPage() {
    // 获取导航菜单项
    const menuItems = document.querySelectorAll('.nav-menu a');
    const subNavItems = document.querySelectorAll('.sub-nav-item');
    const tagNavItems = document.querySelectorAll('.tag-nav-item');
    
    // 添加主导航点击事件监听器
    menuItems.forEach((item, index) => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentType = index;
            currentPage = 1;
            await updateContent(currentType);
        });
    });

    // 添加子导航点击事件监听器
    subNavItems.forEach((item, index) => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            subNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentType = index;
            
            // 如果切换到"菠萝"分类，自动选中"热门经典"标签
            if (index === 1) {
                tagNavItems.forEach(i => i.classList.remove('active'));
                tagNavItems[1].classList.add('active');
                currentTag = 'hots';
            }
            
            currentPage = 1;
            await updateContent(currentType);
        });
    });

    // 添加标签导航点击事件监听器
    tagNavItems.forEach((item, index) => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            // 如果当前是"菠萝"分类，不允许切换到"最新上线"
            if (currentType === 1 && index === 0) {
                return;
            }
            
            tagNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentTag = index === 0 ? 'news' : 'hots';
            currentPage = 1;
            await updateContent(currentType);
        });
    });

    // 添加卡片点击事件
    document.querySelector('.content-section').addEventListener('click', (e) => {
        const card = e.target.closest('.vod-card');
        if (card) {
            const vid = card.dataset.vid;
            const type = card.dataset.type;
            const title = card.querySelector('.vod-title').textContent;
            if (vid) {
                window.open(`/vodplay?vid=${vid}&manga_type=${type}&title=${encodeURIComponent(title)}`);
                // window.location.href = `/vodplay?vid=${vid}&manga_type=${type}&title=${encodeURIComponent(title)}`;
            }
        }
    });

    // 添加搜索功能
    const searchInput = document.querySelector('.search-box input');
    const searchBtn = document.querySelector('.search-btn');

    searchBtn.addEventListener('click', () => {
        const keyword = searchInput.value.trim();
        if (keyword) {
            // TODO: 实现搜索功能
            console.log('搜索关键词:', keyword);
        }
    });

    // 初始加载内容
    updateContent(currentType);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initPage);