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

// 获取用户 token
function getUserToken() {
    try {
        // 从 cookie 中获取用户数据
        const cookies = document.cookie.split(';');
        const userDataCookie = cookies.find(c => c.trim().startsWith('userData='));
        if (!userDataCookie) {
            console.log('未找到用户数据 cookie');
            return null;
        }
        
        // 解析 cookie 值
        const encodedData = userDataCookie.split('=')[1].trim();
        if (!encodedData) {
            console.log('cookie 值为空');
            return null;
        }
        
        // 解码用户数据
        const decodedData = decodeURIComponent(atob(encodedData));
        const userData = JSON.parse(decodedData);
        
        if (!userData || !userData.token) {
            console.log('用户数据中没有 token:', userData);
            return null;
        }
        
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
        console.log('用户未登录');
        return false;
    }
    return true;
}

// 检查视频是否已收藏
async function checkIsCollected(uid) {
    try {
        const token = getUserToken();
        if (!token) return false;

        const response = await fetch(`/api/check-vod-collect?uid=${uid}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return result.isCollected;
    } catch (error) {
        console.error('检查收藏状态失败:', error);
        return false;
    }
}

// 处理收藏/取消收藏
async function handleCollect(event, vod) {
    event.stopPropagation(); // 阻止事件冒泡，避免触发卡片点击
    
    if (!checkLoginStatus()) {
        message.error('请先登录');
        setTimeout(() => {
            window.location.href = '/login';
        }, 1500);
        return;
    }
    
    const token = getUserToken();
    
    try {
        const btn = event.currentTarget;
        const isCollected = btn.classList.contains('active');
        
        // 打印请求参数，用于调试
        const requestData = {
            uid: vod.uid,
            title: vod.title,
            img: vod.img
        };
        console.log('收藏请求参数:', requestData);
        console.log('Authorization token:', token);
        
        const response = await fetch('/api/vod_collect', {
            method: isCollected ? 'DELETE' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        console.log('收藏响应结果:', result);
        
        if (result.success) {
            btn.classList.toggle('active');
            const icon = btn.querySelector('i');
            icon.className = isCollected ? 'fas fa-heart-o' : 'fas fa-heart';
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

// 修改渲染视频卡片函数
function renderVodCard(vod) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'vod-card';
    
    // 确保 vod 对象包含所有必需的字段
    if (!vod.uid || !vod.title || !vod.img) {
        console.error('视频数据缺少必需字段:', vod);
        return cardDiv;
    }
    
    // 设置卡片内容
    cardDiv.innerHTML = `
        <img src="${vod.img}" alt="${vod.title}" class="vod-cover" onerror="this.src='../assets/default-cover.jpg'">
        <button class="collect-btn ${vod.isCollected ? 'active' : ''}">
            <i class="fas fa-heart${vod.isCollected ? '' : '-o'}"></i>
        </button>
        <div class="vod-title">${vod.title}</div>
    `;
    
    // 为卡片添加点击事件（跳转到详情页）
    cardDiv.addEventListener('click', function(e) {
        // 如果点击的是收藏按钮，不进行跳转
        if (!e.target.closest('.collect-btn')) {
            const encodedTitle = btoa(encodeURIComponent(vod.title));
            window.location.href = `/vodplay?uid=${vod.uid}&title=${encodedTitle}&img=${encodeURIComponent(vod.img)}`;
        }
    });
    
    // 为收藏按钮添加点击事件
    const collectBtn = cardDiv.querySelector('.collect-btn');
    collectBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // 阻止事件冒泡
        handleCollect(e, vod);
    });
    
    return cardDiv;
}

// 加载动画
function showLoading() {
    vodsContainer.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>';
}

// 错误提示
function showError(message) {
    vodsContainer.innerHTML = `<div class="error-message">${message}</div>`;
}

// 修改获取视频列表数据函数
async function fetchVodsList(page, type = pageConfig.currentType) {
    try {
        showLoading();
        
        // 移除收藏模式相关的元素
        const contentSection = document.querySelector('.content-section');
        contentSection.classList.remove('collect-mode');
        const titleDiv = contentSection.querySelector('.section-title');
        if (titleDiv) {
            titleDiv.remove();
        }
        
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
        
        // 检查每个视频的收藏状态
        if (result.data && result.data.length > 0) {
            const token = getUserToken();
            if (token) {
                for (let vod of result.data) {
                    vod.isCollected = await checkIsCollected(vod.uid);
                }
            }
            
            // 清空容器
            vodsContainer.innerHTML = '';
            // 添加每个视频卡片
            result.data.forEach(vod => {
                vodsContainer.appendChild(renderVodCard(vod));
            });
        } else {
            if (page > 1 && !pageConfig.isSearchMode) {
                pageConfig.currentPage = page - 1;
                fetchVodsList(page - 1, type);
                return;
            }
            vodsContainer.innerHTML = '<div class="empty-message">暂无视频</div>';
        }
        
        updatePaginationState();
        updateNavMenuState();
        
    } catch (error) {
        console.error('获取视频列表失败:', error);
        showError('获取视频列表失败，请稍后重试');
    }
}

// 修改搜索函数
async function performSearch() {
    const keyword = searchInput.value.trim();
    if (!keyword) {
        return;
    }
    
    // 移除收藏模式相关的元素
    const contentSection = document.querySelector('.content-section');
    contentSection.classList.remove('collect-mode');
    const titleDiv = contentSection.querySelector('.section-title');
    if (titleDiv) {
        titleDiv.remove();
    }
    
    pageConfig.isSearchMode = true;
    pageConfig.searchKeyword = keyword;
    pageConfig.currentPage = 1;
    
    await fetchVodsList(1);
}

// 获取收藏列表
async function fetchCollectList(page = 1) {
    try {
        const token = getUserToken();
        if (!token) {
            message.error('请先登录');
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            return;
        }

        showLoading();
        
        const response = await fetch(`/api/vod_collects?page=${page}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            const contentSection = document.querySelector('.content-section');
            contentSection.classList.add('collect-mode');
            
            // 更新标题
            const titleDiv = document.createElement('div');
            titleDiv.className = 'section-title';
            titleDiv.innerHTML = `
                <i class="fas fa-heart"></i>
                我的收藏
                <button class="back-btn" onclick="switchToNormalMode()">
                    <i class="fas fa-arrow-left"></i>
                    返回
                </button>
            `;
            
            // 清空并重新渲染内容
            vodsContainer.innerHTML = '';
            vodsContainer.before(titleDiv);
            
            if (result.data.items.length > 0) {
                result.data.items.forEach(item => {
                    const vod = {
                        uid: item.uid,
                        title: item.title,
                        img: item.img,
                        isCollected: true
                    };
                    vodsContainer.appendChild(renderVodCard(vod));
                });
                
                // 更新分页
                pageConfig.currentPage = result.data.current_page;
                updatePaginationState();
            } else {
                vodsContainer.innerHTML = '<div class="empty-message">暂无收藏</div>';
            }
        } else {
            showError(result.message || '获取收藏列表失败');
        }
    } catch (error) {
        console.error('获取收藏列表失败:', error);
        showError('获取收藏列表失败，请稍后重试');
    }
}

// 切换回普通模式
function switchToNormalMode() {
    const contentSection = document.querySelector('.content-section');
    contentSection.classList.remove('collect-mode');
    
    // 移除标题
    const titleDiv = contentSection.querySelector('.section-title');
    if (titleDiv) {
        titleDiv.remove();
    }
    
    // 重新加载视频列表
    pageConfig.currentPage = 1;
    pageConfig.isSearchMode = false;
    fetchVodsList(1);
}

// 事件监听器
prevPageBtn.addEventListener('click', () => {
    if (pageConfig.currentPage > 1) {
        const newPage = pageConfig.currentPage - 1;
        if (document.querySelector('.collect-mode')) {
            fetchCollectList(newPage);
        } else {
            fetchVodsList(newPage);
        }
    }
});

nextPageBtn.addEventListener('click', () => {
    const newPage = pageConfig.currentPage + 1;
    if (document.querySelector('.collect-mode')) {
        fetchCollectList(newPage);
    } else {
        fetchVodsList(newPage);
    }
});

currentPageInput.addEventListener('change', () => {
    const newPage = parseInt(currentPageInput.value);
    if (newPage >= 1) {
        if (document.querySelector('.collect-mode')) {
            fetchCollectList(newPage);
        } else {
            fetchVodsList(newPage);
        }
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

// 添加我的收藏按钮点击事件
const myCollectBtn = document.getElementById('myCollectBtn');
if (myCollectBtn) {
    myCollectBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fetchCollectList();
    });
}

// 初始化加载
fetchVodsList(1);
